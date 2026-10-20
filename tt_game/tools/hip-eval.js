/* =====================================================================
 *  hip-eval.js — M0 评测闸门：实机胜率统一口径 + 旋钮实机扫描
 *
 *  为什么要有它（三个硬需求）：
 *  1) **实机是唯一判据**。仿真会饱和（烘焙 DQN 在仿真里 97.1%，
 *     但平均每分 471 板；phase5 里 ep1500 仿真第一、实机只有 33.1%）。
 *     所以本工具只调 tools/live-match.js（真实 js/ 管线 + 真实物理）。
 *  2) **可重复**：固定 seed、分片并行、Wilson 95% 置信区间。
 *     30 局只能把 ±5pp 压到 ±18pp，判决要用 200 局。
 *  3) **可当闸门**：--gate 会给 exit code，可挂 CI。
 *
 *  用法（cwd = tt_game/）：
 *    node tools/hip-eval.js --controller hip --opp hell --games 200
 *    node tools/hip-eval.js --controller dqn  --opp hell --games 200   # 锚点复现
 *    node tools/hip-eval.js --controller hip --opp hell --games 60 --sweep myDrive=0.38,0.54
 *    node tools/hip-eval.js --controller hip --opp hell --games 200 --gate hell:0.70
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'hip');
if(!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

/* 冻结锚点：js/input-weights.js 的来源 ckpt-000500（2026-10-14 实机 30 局） */
const ANCHOR = {
  src: 'data/checkpoints/input3-hell12h5/ckpt-000500.json',
  at: '2026-10-14T08:37:16Z', seed: '20261004', games: 30,
  byTier: { default: 0.921, hell: 0.600, grandslam: 0.910 },
};

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  if(i < 0) return def;
  const v = process.argv[i + 1];
  return (v == null || v.startsWith('--')) ? def : v;
}
function has(flag){ return process.argv.includes(flag); }

/* Wilson 95% 区间（分点率用，正态近似在 p 接近 0/1 时会越界） */
function wilson(p, n, z){
  z = z || 1.96;
  if(!n) return { lo: 0, hi: 1 };
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/* 跑一个分片：live-match --json → 解析 */
/* ★ 并发安全：配置与结果文件必须**每个进程独占**。
 *   历史 bug：所有进程共用 data/hip/_cfg.json 与 data/hip/_shard.json
 *   ⇒ 两个 hip-eval 同时跑时互相覆盖对方的旋钮配置，
 *   表现为「同一配置在不同扫描里给出不同结果」（曾出现按组合序号平移的重复）。
 *   现在用 pid 命名，进程退出即删。 */
const CFG_PATH = path.join(DATA, '_cfg_' + process.pid + '.json');
const SHARD_PATH = path.join(DATA, '_shard_' + process.pid + '.json');
process.on('exit', () => {
  try{ fs.unlinkSync(CFG_PATH); }catch(e){}
  try{ fs.unlinkSync(SHARD_PATH); }catch(e){}
});

function runShard(opts){
  const jsonPath = SHARD_PATH;
  const args = [ path.join(__dirname, 'live-match.js'),
    '--opp', opts.opp, '--games', String(opts.games), '--seed', String(opts.seed),
    '--live-only', '--maxsec', String(opts.maxsec || 30),
    '--controller', opts.controller, '--json', jsonPath ];
  if(opts.from) args.push('--from', opts.from);
  if(opts.cfg) args.push('--hip-cfg', opts.cfg);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if(r.status !== 0 && !fs.existsSync(jsonPath)){
    return { error: (r.stderr || r.stdout || '').toString().slice(0, 800) };
  }
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  try{ fs.unlinkSync(jsonPath); }catch(e){}
  return j;
}

function aggregate(byTier){
  /* 把多分片的同一档合并：分点率 = 己方分 / 总分 */
  const agg = {};
  for(const t of Object.keys(byTier)){
    const b = byTier[t];
    const n = b.dqnPts + b.oppPts;
    agg[t] = { dqn: b.dqnPts, opp: b.oppPts, points: n, rate: n ? b.dqnPts / n : 0,
               lost: b.lost || {}, contacts: [b.dqnContacts, b.oppContacts],
               /* ★ 停摆局数与局数：分点率的分母是「窗口内打出的分数」，
               *   相持越长分母越小、胜率越虚高 ⇒ 必须同时看分数÷局数与停摆数。 */
               stalled: b.stalled || 0,
               games: b.gameCount != null ? b.gameCount : (b.games ? b.games.length : 0) };
  }
  return agg;
}

function report(agg, label){
  console.log('');
  console.log('  ' + label);
  console.log('  ' + '对手'.padEnd(12) + '实机分点率'.padEnd(14) + 'Wilson95%'.padEnd(20) + '局/分'.padEnd(12) + '分/局'.padEnd(8) + '停摆'.padEnd(6) + '锚点(30局)');
  console.log('  ' + '-'.repeat(90));
  for(const t of Object.keys(agg)){
    const a = agg[t];
    const ci = wilson(a.rate, a.points);
    const anc = ANCHOR.byTier[t];
    const d = (anc != null) ? (((a.rate - anc) * 100 >= 0 ? '+' : '') + ((a.rate - anc) * 100).toFixed(1) + 'pp') : '—';
    const ppg = a.games ? (a.points / a.games).toFixed(2) : '—';
    console.log('  ' + t.padEnd(12) +
      (a.rate * 100).toFixed(1).padStart(6) + '%'.padEnd(8) +
      ('[' + (ci.lo * 100).toFixed(1) + ',' + (ci.hi * 100).toFixed(1) + ']').padEnd(20) +
      (a.points + '').padEnd(12) + ppg.padEnd(8) +
      (a.stalled + '').padEnd(6) + (anc != null ? (anc * 100).toFixed(1) + '%  Δ' + d : '—'));
  }
}

function lostReport(agg){
  const A = { net: 0, out: 0, double: 0, serve: 0, other: 0, noreach: 0 };
  for(const t of Object.keys(agg)){
    const L = agg[t].lost || {};
    for(const k in A) A[k] += L[k] || 0;
  }
  const tot = Object.values(A).reduce((a, b) => a + b, 0);
  if(!tot) return;
  console.log('');
  console.log('  实机失分原因分解（跨全部档，' + tot + ' 分）：');
  for(const k in A) console.log('    ' + k.padEnd(9) + String(A[k]).padStart(5) + '  ' +
    ((A[k] / tot) * 100).toFixed(1) + '%  ' + '█'.repeat(Math.round(A[k] / tot * 40)));
  const reach = A.noreach + A.double;
  console.log('    —— 够不到（未能回球+双跳）= ' + reach + ' / ' + tot + ' = ' + ((reach / tot) * 100).toFixed(1) + '%');
  console.log('    —— 自己出界/下网            = ' + (A.out + A.net) + ' / ' + tot + ' = ' + (((A.out + A.net) / tot) * 100).toFixed(1) + '%');
}

function main(){
  const controller = argOf('--controller', 'hip');
  const opp = argOf('--opp', 'hell');
  const games = parseInt(argOf('--games', '30'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const shards = parseInt(argOf('--shards', '1'), 10);
  const from = argOf('--from', '');
  const maxsec = parseInt(argOf('--maxsec', '30'), 10);
  const gate = argOf('--gate', '');
  const sweep = argOf('--sweep', '');
  /* --grid 可重复：node tools/hip-eval.js --grid myDrive=0.4,0.54 --grid padZOffset=0.1,0.25 */
  const gridArgs = [];
  for(let i = 2; i < process.argv.length; i++){
    if(process.argv[i] === '--grid' && process.argv[i + 1]) gridArgs.push(process.argv[i + 1]);
  }
  const t0 = Date.now();

  const base = { controller, opp, games, seed, from, maxsec,
                 cfg: argOf('--hip-cfg', '') };

  /* ★ --hip-cfg 的基线配置（两条路径都要用）。
   *   历史 bug：非 grid 路径调用 doOne(null) ⇒ cfgPath 为空 ⇒
   *   子进程根本没收到 --hip-cfg ⇒ 所有「带 --hip-cfg 的单点评测」
   *   其实跑的是**默认配置**（分点率相同、看起来像配置生效其实是没生效）。 */
  let baseCfgObj = null;
  if(base.cfg){
    try{
      baseCfgObj = JSON.parse(fs.readFileSync(path.resolve(ROOT, base.cfg), 'utf8'));
    }catch(e){ console.error('读取 --hip-cfg 失败：' + e.message); baseCfgObj = null; }
  }

  const doOne = (cfgObj, label) => {
    let cfgPath = '';
    if(cfgObj && Object.keys(cfgObj).length){
      cfgPath = CFG_PATH;
      fs.writeFileSync(cfgPath, JSON.stringify(cfgObj));
    }
    /* 分片：每个分片一次 live-match（串行调用，但每次内部是 60Hz 实机模拟） */
    const merged = {};
    const perShard = Math.max(1, Math.round(games / shards));
    for(let s = 0; s < shards; s++){
      const r = runShard({ controller, opp, games: perShard, seed: seed + s * 1000,
                            maxsec, from, cfg: cfgPath });
      if(r.error){ console.error('分片 ' + s + ' 失败：\n' + r.error); continue; }
      for(const t of Object.keys(r.byTier)){
        if(!merged[t]) merged[t] = { dqnPts: 0, oppPts: 0, lost: {}, dqnContacts: 0, oppContacts: 0 };
        const m = merged[t], b = r.byTier[t];
        m.dqnPts += b.dqnPts; m.oppPts += b.oppPts;
        m.dqnContacts += b.dqnContacts; m.oppContacts += b.oppContacts;
        if(b.lost) for(const k in b.lost) m.lost[k] = (m.lost[k] || 0) + b.lost[k];
        /* ★ 停摆局数与局数必须一起合并（漏了会让「分/局」与「停摆」永远显示 —/0），
         *   而这两个数是判断「胜率是否因样本变小而虚高」的唯一依据。 */
        m.stalled = (m.stalled || 0) + (b.stalled || 0);
        m.gameCount = (m.gameCount || 0) + (b.games ? b.games.length : 0);
      }
    }
    const agg = aggregate(merged);
    report(agg, label || ('控制器=' + controller + ' 对手=' + opp + ' 局数=' + (perShard * shards) + ' seed=' + seed));
    lostReport(agg);
    return agg;
  };

  if(sweep || gridArgs.length){
    /* --grid key1=v1,v2 key2=w1,w2：二维笛卡尔积扫描（实机）。
     * 动机：出球深度 myDrive 与拍面深度 padZOffset 是**耦合**的 ——
     * 拍面深度决定触球高度，触球高度经 resolveHit 的 arcFit 改变弧线，
     * 弧线决定落点深度，所以一次只动一个必然顾此失彼。 */
    const axes = gridArgs.map(spec => {
      const j = spec.indexOf('=');
      const key = spec.slice(0, j);
      const vals = spec.slice(j + 1).split(',').map(Number);
      return { key, vals };
    });
    const combos = [];
    (function rec(i, acc){
      if(i >= axes.length){ combos.push(Object.assign({}, acc)); return; }
      for(const v of axes[i].vals){ acc[axes[i].key] = v; rec(i + 1, acc); }
    })(0, {});
    const rows = [];
    /* --hip-cfg 指定的旋钮作为**基线**与每个网格组合合并（网格只覆盖列出的键） */
    let baseCfg = {};
    if(base.cfg){
      try{ baseCfg = JSON.parse(fs.readFileSync(path.resolve(ROOT, base.cfg), 'utf8')); }
      catch(e){ console.error('读取 --hip-cfg 失败：' + e.message); }
    }
    for(const c0 of combos){
      const c = Object.assign({}, baseCfg, c0);
      const label = Object.keys(c0).map(k => k + '=' + c0[k]).join(' ');
      const agg = doOne(c, label);
      const t = Object.keys(agg)[0];
      const a = agg[t];
      const ci = wilson(a.rate, a.points);
      rows.push({ cfg: c, rate: a.rate, lo: ci.lo, hi: ci.hi, points: a.points, lost: a.lost,
                  ppg: a.games ? a.points / a.games : null, stalled: a.stalled });
      console.log('  → ' + label + '  分点率 ' + (a.rate * 100).toFixed(1) + '%  CI[' +
                  (ci.lo * 100).toFixed(1) + ',' + (ci.hi * 100).toFixed(1) + ']  分/局 ' +
                  (a.games ? (a.points / a.games).toFixed(2) : '-') + '  停摆 ' + a.stalled +
                  '  失分 ' + JSON.stringify(a.lost));
    }
    rows.sort((x, y) => y.rate - x.rate);
    console.log('\n  最好：' + JSON.stringify(rows[0].cfg) + '  ' + (rows[0].rate * 100).toFixed(1) + '%');
    fs.writeFileSync(path.join(DATA, 'sweep-grid.json'), JSON.stringify(rows, null, 2));
    console.log('  耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return;
  }

  const agg = doOne(baseCfgObj);
  console.log('');
  console.log('  锚点来源：' + ANCHOR.src + '（' + ANCHOR.at + '，' + ANCHOR.games + ' 局/档）');
  console.log('  耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

  if(gate){
    const [tier, minStr] = gate.split(':');
    const min = parseFloat(minStr);
    const a = agg[tier];
    if(!a){ console.error('闸门：没有 ' + tier + ' 这一档'); process.exit(2); }
    const ci = wilson(a.rate, a.points);
    const ok = ci.lo >= min;    // 用 CI 下界判定，避免「刚好踩线」
    console.log('');
    console.log('  闸门 ' + tier + ' ≥ ' + (min * 100).toFixed(1) + '%：实机 ' + (a.rate * 100).toFixed(1) +
                '%，CI 下界 ' + (ci.lo * 100).toFixed(1) + '% → ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  }
}

main();
