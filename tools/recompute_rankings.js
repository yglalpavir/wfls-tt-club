#!/usr/bin/env node
/**
 * tools/recompute_rankings.js — 生成 data/api/（免服务器静态 API 数据层）
 *
 * 用法：node tools/recompute_rankings.js
 *
 * 原理：在 Node vm 沙箱中加载 js/common.js + js/score-engine.js（与浏览器同一份
 * 代码，不重新实现任何算分逻辑），在上下文内部调用 calculateAllRankingsWithSeasons()
 * + calculateRealtimeRanking()，并把各节点装饰上 rank/变化/积分变化（对齐
 * ranking.js 的 calculateRankChanges），结果经 JSON 传回，连同个人数据、
 * 比赛记录写入 data/api/。该目录由 .github/workflows/recompute.yml 定时
 * （每日北京时间 04:00）重算并提交。
 *
 * 注意：common.js / score-engine.js 的全局数据用顶层 let 声明（vm 上下文里是
 * 词法全局，外部 sandbox.xxx 读不到），因此计算全部在上下文内完成，仅用 JSON
 * 传结果。
 *
 * 运行时区：getTodayStr / calculateRealtimeRanking 用 new Date() 的本地日期，
 * GitHub Actions runner 默认 UTC，workflow 必须设置 env TZ: Asia/Shanghai。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'api');

/* ---------- 沙箱（与 tools/_compute_current_scores.js 相同的无头配方） ---------- */
function fakeFetch(rel) {
  const p = path.join(ROOT, rel);
  return Promise.resolve({
    ok: fs.existsSync(p),
    status: fs.existsSync(p) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf-8')))
  });
}

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: fakeFetch,
  document: {
    head: { appendChild() {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }),
    addEventListener: () => {},
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { style: {}, setAttribute() {} }
  },
  window: {},
  navigator: { language: 'zh-CN', clipboard: {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { pathname: '/ranking.html', search: '', href: '', origin: 'http://localhost' },
  history: { pushState() {}, replaceState() {} },
  URLSearchParams,
  Date, Math, JSON, Promise, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/common.js', 'js/score-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf-8'), sandbox, { filename: f });
}

/* ---------- 上下文内执行的计算脚本（词法全局在此可见） ---------- */
const BUILD_SRC = `
(async function () {
  await loadPlayers();
  await loadEventCoefficients();
  await loadDecayConfig();
  await loadSeasons();
  await loadScoreLogData();
  await loadInitialScores();
  if (!scoreLogData || !seasonsData || !seasonsData.length) {
    return JSON.stringify({ ok: false, error: 'score-log/seasons 为空' });
  }
  // 每行装饰 rank/变化/积分变化（移植自 js/ranking.js calculateRankChanges，
  // 保证与官网表格显示一致；改动时需与 ranking.js:241 同步）
  function decorateRows(curData, prevData, isInitial) {
    const cur = assignTiedRanks(curData);
    cur.forEach(p => { p.uid = getUidForPlayerName(p['姓名']); });
    if (!prevData || isInitial) return cur.map(p => ({ ...p, change: 0, changeType: 'new', pointsChange: 0, pointsChangeType: 'new' }));
    const prm = {}, ppm = {};
    assignTiedRanks(prevData).forEach(p => { prm[p['姓名']] = p.rank; ppm[p['姓名']] = p['当前积分'] || 0; });
    return cur.map(p => {
      const cr = p.rank, pr = prm[p['姓名']], pp = ppm[p['姓名']], cp = p['当前积分'] || 0;
      let rc = 0, rct = 'new';
      if (pr === undefined) rct = 'new';
      else { rc = pr - cr; if (rc > 0) rct = 'up'; else if (rc < 0) rct = 'down'; else rct = 'same'; }
      let pc = 0, pct = 'new';
      if (pp === undefined) pct = 'new';
      else { pc = cp - pp; if (pc > 0.05) pct = 'up'; else if (pc < -0.05) pct = 'down'; else pct = 'same'; }
      // 积分变化取 1 位小数（官网表格 toFixed(1) 显示口径）；类型判定在原始值上进行
      return { ...p, rank: cr, change: rc, changeType: rct, pointsChange: Math.round(pc * 10) / 10, pointsChangeType: pct };
    });
  }
  const timeline = calculateAllRankingsWithSeasons(scoreLogData, initialScoresData.initialScores, seasonsData);
  const rt = calculateRealtimeRanking();
  if (rt) timeline.push(rt);
  const nodes = timeline.map((n, i) => {
    const prev = i > 0 ? timeline[i - 1].data : null;
    return {
      time: n.time, label: n.label, season: n.season,
      isInitial: !!n.isInitial, isRealtime: !!n.isRealtime,
      data: decorateRows(n.data, prev, n.isInitial)
    };
  });
  return JSON.stringify({ ok: true, nodes: nodes, floor: SCORE_FLOOR });
})()
`;

/* ---------- 工具 ---------- */
function writeJson(file, obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
}

/** 端点目录页：浏览器打开 /data/api/ 时不再 404，兼作接口说明 */
function writeIndexHtml(file, m) {
  const rows = Object.entries(m.endpoints).map(([p, e]) =>
    '      <tr><td><a href="' + p + '">' + p + '</a></td><td>' + e.records + '</td><td>' + e.description + '</td></tr>'
  ).join('\n');
  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>WFLS 乒乓球社 · 数据 API</title>',
    '<style>',
    '  body { font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.6; }',
    '  h1 { font-size: 1.4rem; } .meta { color: #666; font-size: .9rem; }',
    '  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: .95rem; }',
    '  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }',
    '  th { background: #f5f5f5; }',
    '  code { background: #f5f5f5; padding: 1px 6px; border-radius: 4px; font-size: .9em; word-break: break-all; }',
    '  .note { color: #555; font-size: .9rem; }',
    '</style>',
    '</head>',
    '<body>',
    '<h1>WFLS 乒乓球社 · 官网数据 API</h1>',
    '<p class="meta">生成时间 ' + m.generatedAt + ' · 数据来源 commit <code>' + (m.commit || '-') + '</code> · 实时口径 ' + m.realtimeAsOf + ' · <a href="manifest.json">manifest.json</a></p>',
    '<table>',
    '  <thead><tr><th>端点</th><th>条数</th><th>说明</th></tr></thead>',
    '<tbody>',
    rows,
    '</tbody>',
    '</table>',
    '<p>本页与各 JSON 由 <code>tools/recompute_rankings.js</code> 自动生成，每日北京时间 04:00 更新（数据提交时也会即时重算），请勿手动编辑。</p>',
    '<p class="note">跨域已开放（<code>Access-Control-Allow-Origin: *</code>），第三方页面可直接 fetch。示例：</p>',
    '<p><code>fetch(\'https://yglalpavir.github.io/wfls-tt-club/data/api/rankings/current.json\')</code></p>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
  fs.writeFileSync(file, html, 'utf8');
}

function headSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch (e) {
    return null;
  }
}

/**
 * 实时节点所在赛季窗口的胜负统计（口径与 score-engine.js calculateRealtimeRanking
 * 一致：仅赛果记录，日期 ∈ [赛季开始, 节点日]）。
 */
function tallyWindow(rawLog, seasons, today) {
  const visible = seasons.filter(s => s.visible !== false);
  let active = visible.find(s => today >= s.startDate && today <= s.endDate) || null;
  if (!active) active = visible[visible.length - 1];
  const start = active.startDate, end = today;
  const tally = {};
  for (const r of rawLog) {
    if (r['胜者'] == null || r['负者'] == null) continue; // 加分记录不计场次
    if (r['日期'] < start || r['日期'] > end) continue;
    const w = r['胜者'], l = r['负者'];
    if (!tally[w]) tally[w] = { wins: 0, total: 0 };
    if (!tally[l]) tally[l] = { wins: 0, total: 0 };
    tally[w].total++; tally[w].wins++;
    tally[l].total++;
  }
  return tally;
}

/* ---------- 主流程 ---------- */
(async () => {
  const built = JSON.parse(await vm.runInContext(BUILD_SRC, sandbox, { filename: 'recompute-build.js' }));
  if (!built.ok) { console.error('计算失败：' + built.error); process.exit(1); }

  const playersData = readJson('data/players.json');
  const rawLog = readJson('data/score-log.json');
  const seasons = readJson('data/seasons.json');
  const nodes = built.nodes;
  const current = nodes[nodes.length - 1];
  const floor = built.floor;

  // 比赛记录：原样保留 score-log.json（含 胜者/负者 为赛果，含 对象/分数 为加分）
  // 生成时间只写在 manifest.json，数据文件保持字节稳定（利于 CDN 缓存与最小 diff）
  const matchesPayload = {
    version: 1,
    count: rawLog.length,
    records: rawLog
  };

  const currentByName = {};
  current.data.forEach(p => { currentByName[p['姓名']] = p; });
  const tally = tallyWindow(rawLog, seasons, current.time);

  const playersPayload = {
    version: 1,
    baseDate: playersData.baseDate,
    count: playersData.players.length,
    players: playersData.players.map(p => {
      const cur = currentByName[p.name];
      const t = tally[p.name] || { wins: 0, total: 0 };
      return {
        uid: p.uid,
        name: p.name,
        aliases: p.aliases || [],
        tags: p.tags || [],
        honors: p.honors || [],
        role: p.role || '',
        status: p.status || 'active',
        initialScore: p.initialScore,
        current: cur ? { points: cur['当前积分'], rank: cur.rank, matches: cur['总场次'], wins: t.wins, losses: t.total - t.wins, winRate: cur['胜率'] } : null
      };
    })
  };

  const generatedAt = new Date().toISOString();

  const manifest = {
    schemaVersion: 1,
    description: 'WFLS 乒乓球社官网只读数据 API（由 tools/recompute_rankings.js 生成，请勿手动编辑）',
    generatedAt,
    commit: headSha(),
    realtimeAsOf: current.time,
    endpoints: {
      'rankings/current.json': { records: current.data.length, isRealtime: true, description: '实时积分排名（当前节点）' },
      'rankings/timeline.json': { records: nodes.length, description: '全部快照时间线（赛季初 + 快照日期 + 实时节点）' },
      'players.json': { records: playersPayload.count, description: '成员个人数据（档案 + 当前积分/排名/胜负）' },
      'matches.json': { records: matchesPayload.count, description: '比赛记录与加分记录（与 score-log.json 一致）' }
    }
  };

  writeJson(path.join(OUT_DIR, 'rankings', 'current.json'), current);
  writeJson(path.join(OUT_DIR, 'rankings', 'timeline.json'), nodes);
  writeJson(path.join(OUT_DIR, 'players.json'), playersPayload);
  writeJson(path.join(OUT_DIR, 'matches.json'), matchesPayload);
  writeJson(path.join(OUT_DIR, 'manifest.json'), manifest);
  writeIndexHtml(path.join(OUT_DIR, 'index.html'), manifest);

  /* ---------- 自检：不满足则退出非零，阻止提交坏产物 ---------- */
  if (!current.isRealtime) { console.error('缺少实时节点'); process.exit(1); }
  for (const n of nodes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.time)) { console.error('非法节点日期：' + n.time); process.exit(1); }
    for (const p of n.data) {
      if (!Number.isFinite(p['当前积分']) || p['当前积分'] < floor) {
        console.error('积分越界：' + n.time + ' ' + p['姓名'] + ' ' + p['当前积分']); process.exit(1);
      }
      if (!Number.isInteger(p.rank) || p.rank < 1) { console.error('非法排名：' + n.time + ' ' + p['姓名'] + ' rank=' + p.rank); process.exit(1); }
    }
  }
  for (const p of playersPayload.players) {
    if (!Number.isInteger(p.uid)) { console.error('players.json 存在缺 uid 的成员：' + p.name); process.exit(1); }
    // 引擎 总场次 与窗口口径逐项核对（防算分逻辑漂移）
    if (p.current && p.current.matches > 0) {
      const t = tally[p.name] || { wins: 0, total: 0 };
      if (p.current.matches !== t.total) {
        console.error('场次口径不一致：' + p.name + ' 引擎 ' + p.current.matches + ' vs 窗口 ' + t.total); process.exit(1);
      }
    }
  }
  if (matchesPayload.count !== rawLog.length) { console.error('比赛记录条数不一致'); process.exit(1); }

  console.log('OK 时间线 ' + nodes.length + ' 节点（实时: ' + current.time + '）· 当前排名 ' + current.data.length + ' 行 · 球员 ' + playersPayload.count + ' · 记录 ' + matchesPayload.count);
  console.log('输出目录 ' + path.relative(ROOT, OUT_DIR) + '/');
})().catch(e => { console.error(e); process.exit(1); });