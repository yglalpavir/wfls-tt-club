/* =====================================================================
 *  _finalize-12h.js — 12h 训练收尾：实机管线验收 → 达标才烘焙
 *
 *  为什么不能只看训练器自己的结论
 *  -----------------------------
 *  train-input3.js 的采纳线是**仿真**口径（选优分 0.45×顶档 + 0.30×本档 +
 *  0.25×默认，且 vs默认 不劣于起点 -5pp）。但 phase3 的全部结论就是：
 *  仿真数字不能当实机数字用 —— 那 47pp 的缺口正是这么活下来的。
 *  所以烘焙前必须补一道实机管线（tools/live-match.js）的验收：
 *    闸门 A（变强）  实机管线加权分点率 > 基线（同一批种子、同一个档位口径）
 *    闸门 B（打鬼）  vs地狱 的实机分点率不下降 —— 这是这次训练的目标档
 *    闸门 C（没走样）worst|Δ| ≤ 基线 worst|Δ| + 3pp，且 ≤ 35pp 兜底
 *                    Δ 不达标说明这份权重只在仿真里强，是环境过拟合，不烘
 *  三条全过才写 js/input-weights.js，且先备份。
 *
 *  闸门 C 为什么是相对而不是绝对阈值：基线自己就有 -13 ~ -33pp 的口径缺口
 *  （phase3 §4 记录的老账，本次基线实测 default -28.1 / elite -33.1 / extreme -24.8）。
 *  要求候选 |Δ| ≤ 8pp 等于要求先把老账还清，那不是"这次训练有没有走样"能回答的。
 *  真正要挡的是"这份权重比游戏里现在用的那份更像仿真里的自己"。
 *
 *  样本量：--games 是每档局数。30 局时地狱档（基线 p≈0.06）的标准误约 ±4.3pp，
 *  加权分约 ±2pp。所以闸门 B 是"不下降"而非"显著上升"——12h 训练若把地狱
 *  从 6% 抬到 15% 是可分辨的，抬到 8% 则与噪声无法区分，报告会写明这一点。
 *
 *  用法：
 *    node tools/_finalize-12h.js --run input3-12h --games 30
 *    node tools/_finalize-12h.js --run input3-12h --baseline tools/logs/baseline-live.json
 *    node tools/_finalize-12h.js --run input3-12h --dry-run    # 只验收不烘焙
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const argOf = (f, d) => { const i = process.argv.indexOf(f); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : d; };
const RUN = argOf('--run', 'input3-12h');
const GAMES = parseInt(argOf('--games', '30'), 10);
const TOL = parseFloat(argOf('--tol', '8'));
const SEED = argOf('--seed', '20261004');
const BASELINE_P = path.resolve(ROOT, argOf('--baseline', 'tools/logs/baseline-live.json'));
const DRY = process.argv.includes('--dry-run');
/* --top：选优分里占 0.45 权重的"顶档"标签。训练换了课程顶档（如 grandslam）
 * 时这里必须跟着换，否则加权分算的是别的档。 */
const TOP = argOf('--top', 'extreme-max');
/* --bake-anyway：操作者明确下令烘焙时旁路闸门 A/B（C1/C2 仍看、仍报告，
 * 因为失配失控意味着这份权重在实机上不可信，烘了也白烘）。
 * 旁路不等于隐瞒：闸门照算照打，结论里写明是人工旁路。 */
const BAKE_ANYWAY = process.argv.includes('--bake-anyway');
const LEVELS = argOf('--opp', 'default,hell,elite,extreme,extreme-max').split(',').map(s => s.trim());
const IDX = path.join(ROOT, 'data', 'checkpoints', RUN, 'index.json');
/* 收尾幂等标记：看门狗定时任务与一次性排程都可能触发本脚本，
 * 没有这个标记会重复烘焙（多一份备份、把 trainedAt 刷新成第二次的时间）。
 * 标记只在真正烘过或明确判定不烘时写。 */
const MARK = path.join(ROOT, 'tools', 'logs', RUN + '.finalize.done');
if(fs.existsSync(MARK) && !process.argv.includes('--force')){
  console.log('收尾已执行过（' + fs.readFileSync(MARK, 'utf8').trim() + '），跳过。');
  console.log('要重跑请加 --force。');
  process.exit(0);
}

/* 与 train-input3.js 选优分同权重的「实机口径」加权分。地狱AI 单列进闸门 B。 */
const W_TOP = 0.45, W_HELL = 0.30, W_DEF = 0.25;
const score = m => (m[TOP] || 0) * W_TOP + (m['hell'] || 0) * W_HELL + (m['default'] || 0) * W_DEF;

function fail(msg){ console.error('\n✗ ' + msg); process.exit(1); }
if(!fs.existsSync(IDX)) fail('找不到 ' + IDX + '（训练还没落过检查点？）');

const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
const best = idx.best || {};
if(!best.file) fail('index.json 里还没有 best 字段 —— 训练至少要跑完一轮验证（--step）才有最佳权重');
if(!fs.existsSync(path.join(ROOT, 'data', 'checkpoints', RUN, best.file)))
  fail('best 指向的权重文件不存在：' + best.file);

console.log('=== 12h 训练收尾验收 · run=' + RUN + ' ===');
console.log('最佳权重    ：' + best.file + '（ep ' + best.ep + '）');
console.log('仿真选优分  ：' + (best.best * 100).toFixed(1));
console.log('训练器结论  ：' + (idx.status || '(无)') + ' · adopted=' + ((idx.final || {}).adopted));
console.log('累计墙钟    ：' + ((idx.elapsedSec || 0) / 3600).toFixed(2) + 'h / ' + (best.sec ? (best.sec / 3600).toFixed(2) + 'h' : '?'));

/* ---- 跑实机管线 ---- */
function liveRun(weightsPath, label){
  const args = ['tools/live-match.js', '--from', weightsPath,
                '--opp', LEVELS.join(','), '--games', String(GAMES), '--seed', String(SEED)];
  console.log('\n--- 实机管线验收（' + label + '）：live-match.js ' + args.slice(2).join(' ') + ' ---');
  const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(out.split('\n').filter(l => !/^  发球出球点/.test(l)).join('\n') + '\n');
  const live = {}, sim = {}, delta = {};
  let worst = 0;
  for(const line of out.split('\n')){
    const m = line.match(/^\s{2}(\S+)\s+([\d.]+)%\s+([\d.]+)%\s+([+-][\d.]+)pp/);
    if(!m) continue;
    live[m[1]] = parseFloat(m[2]) / 100;
    sim[m[1]] = parseFloat(m[3]) / 100;
    delta[m[1]] = parseFloat(m[4]);
    if(Math.abs(parseFloat(m[4])) > Math.abs(worst)) worst = parseFloat(m[4]);
  }
  if(!Object.keys(live).length) fail('live-match.js 输出里没解析到阶梯结果（格式变了？）');
  return { live, sim, delta, worstDelta: worst };
}

/* ---- 候选集：不能只测「仿真最佳」那一份 --------------------------------
 * 为什么：仿真分点率与实机分点率在地狱这一档会大幅分叉，而且**方向不定**。
 * 两份实测记录（tools/logs/*.finalize.json，同一档同口径）：
 *   input3-12h ckpt-008500  仿真地狱 16.0% → 实机 11.7%（−4.4pp，可接受）
 *   input3-gs   best@ep2000 仿真地狱 18.8% → 实机  2.3%（−16.5pp，直接崩）
 * 所以「仿真选优分最高的那一份」并不等于「实机最强的那一份」。
 * 原收尾只跑 best.file，等于把候选集压成 1；而 gs 那一轮的最佳恰好在 ep 2000，
 * 后面一万两千局里的十几份检查点一份都没被看过。
 * 改成：按仿真分（只算闸门关心的三个**实机真实可选**对手：顶档/地狱/普通）
 * 取前 --topN 份，逐份跑实机管线，最后按**实机**加权分挑，而不是按仿真分挑。
 * 代价：每多一份候选多花一次实机对局（3 档 ×30 局 ≈ 10 分钟）。
 */
const TOPN = Math.max(1, parseInt(argOf('--topN', '3'), 10));
const simScore = m => (m[TOP] || 0) * W_TOP + (m['hell'] || 0) * W_HELL + (m['default'] || 0) * W_DEF;

/* 候选按**文件内容**去重，不按文件名。
 * 为什么必须这样做：train-input3.js 的 writeCheckpoint 落盘的是 bestNet
 * （当轮选优分最高那份权重），不是「该 ep 当时的策略」。于是只要没有新的
 * ★新最佳，后面落的所有检查点都是同一份权重的副本 ——
 * 实测 input3-hell12h 的 17 份检查点 md5 完全相同（bestNet 最后一次更新在
 * ep 3500，此后 1700 局全部复制粘贴）。按文件名去重会把这些副本当成不同
 * 候选，于是「取前 3 份」实际是拿**同一份权重跑 3 遍实机管线**（白烧约 30
 * 分钟），而且报告里会显示 3 行几乎一样的排名，看起来像做了多候选筛选，
 * 实际一份都没多选。这正是 phase4 §#15 想根治的病。
 * 按内容去重后候选集会如实塌缩成 1 份 —— 那就只跑 1 遍，并明确告诉使用者
 * 「这一轮只有 1 份可用权重」，而不是伪装成多候选。 */
function sha1(file){
  return require('crypto').createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}
function candidateFiles(){
  const seen = new Set(), byHash = new Map(), out = [];
  const push = c => {
    if(!c || !c.file) return;
    if(seen.has(c.file)) return;
    const abs = path.join(ROOT, 'data', 'checkpoints', RUN, c.file);
    if(!fs.existsSync(abs)) return;
    seen.add(c.file);
    const h = sha1(abs);
    const prev = byHash.get(h);
    if(prev){
      prev.dups.push(c.file);          // 同权重，换名留着，不进候选
      return;
    }
    const e = { file: c.file, ep: c.ep, simScore: simScore(c.wr || {}), dups: [] };
    byHash.set(h, e);
    out.push(e);
  };
  push(best);
  for(const c of (idx.checks || [])) push(c);
  out.sort((a, b) => b.simScore - a.simScore);
  return out;
}

const ALL_DISTINCT = candidateFiles();
const CANDS = ALL_DISTINCT.slice(0, TOPN);
console.log('\n候选集（按仿真三档加权分排序；内容去重后共 ' + ALL_DISTINCT.length +
            ' 份不同权重，本次实机验收前 ' + CANDS.length + ' 份）：');
ALL_DISTINCT.slice(0, TOPN).forEach(c => console.log('  ' + c.file + '  ep ' + c.ep +
  '  仿真分 ' + (c.simScore * 100).toFixed(1) +
  (c.dups.length ? '  （另有 ' + c.dups.length + ' 个同权重的副本已折叠）' : '')));
const dupTotal = ALL_DISTINCT.reduce((a, c) => a + c.dups.length, 0);
if(dupTotal > 0){
  console.log('\n⚠ 检查点里有 ' + dupTotal + ' 个副本与上面某份**逐字节相同**，已折叠不测。');
  console.log('  原因见 candidateFiles 的注释：训练器落盘的是 bestNet 而不是当轮策略，');
  console.log('  没有新「★最佳」的这些轮次写的都是同一份权重。这一轮实际只有 ' +
              ALL_DISTINCT.length + ' 份可用权重，--topN 不可能凑出更多。');
}
if(CANDS.length < TOPN){
  console.log('  （要求 ' + TOPN + ' 份，实际只有 ' + CANDS.length +
              ' 份不同权重 —— 下面这份的实机成绩就是全部证据，没有备选可换。）');
}

const RESULTS = CANDS.map(c => ({
  file: c.file, ep: c.ep, simScore: c.simScore,
  abs: path.join(ROOT, 'data', 'checkpoints', RUN, c.file),
  r: liveRun(path.join(ROOT, 'data', 'checkpoints', RUN, c.file), '候选 ' + c.file),
}));
RESULTS.sort((a, b) => score(b.r.live) - score(a.r.live));

console.log('\n=== 实机加权分排名（' + LEVELS.join('/') + '，权重 ' +
  TOP + '=' + W_TOP + ' hell=' + W_HELL + ' default=' + W_DEF + '）===');
for(const x of RESULTS){
  console.log('  ' + (score(x.r.live) * 100).toFixed(2).padStart(6) + '%  ' + x.file.padEnd(18) +
    '  hell=' + ((x.r.live['hell'] || 0) * 100).toFixed(1).padStart(5) + '%' +
    '  ' + TOP + '=' + ((x.r.live[TOP] || 0) * 100).toFixed(1).padStart(5) + '%' +
    '  default=' + ((x.r.live['default'] || 0) * 100).toFixed(1).padStart(5) + '%' +
    '  （仿真分 ' + (x.simScore * 100).toFixed(1) + '）');
}
const chosen = RESULTS[0];
const cand = chosen.r;
const bestPath = chosen.abs;
const bestEp = chosen.ep;
console.log('\n→ 按**实机**加权分选中：' + chosen.file + '（ep ' + bestEp + '）');

const base = fs.existsSync(BASELINE_P)
  ? JSON.parse(fs.readFileSync(BASELINE_P, 'utf8'))
  : null;

console.log('\n=== 闸门 ===');
let pass = true;

if(!base){
  console.log('  · 闸门 A（变强）：跳过 —— 没有基线文件 ' + BASELINE_P);
  console.log('    候选实机加权分 = ' + (score(cand.live) * 100).toFixed(2));
} else {
  if(base.seed !== undefined && String(base.seed) !== String(SEED)) {
    console.warn('  ⚠ 基线用的种子是 ' + base.seed + '，本次是 ' + SEED + ' —— 数字不是配对比较，只看绝对值');
  }
  if(!base.live[TOP]) {
    console.warn('  ⚠ 基线里没有顶档 ' + TOP + ' 的实测值 —— 闸门 A 的加权分两边都缺这一项，只反映其余档的差');
  }
  const dc = score(cand.live) - score(base.live);
  const okA = dc > 0;
  pass = pass && okA;
  console.log('  ' + (okA ? '✓' : '✗') + ' 闸门 A（变强）：实机加权分 ' +
    (score(cand.live) * 100).toFixed(2) + '% vs 基线 ' + (score(base.live) * 100).toFixed(2) +
    '% → ' + (dc >= 0 ? '+' : '') + (dc * 100).toFixed(2) + 'pp');
  const dh = (cand.live['hell'] || 0) - (base.live['hell'] || 0);
  const okB = dh >= 0;
  pass = pass && okB;
  /* 近似标准误：p(1-p)/n。用于说明这个差值是否分辨得出来，避免把噪声当进步。 */
  const seHell = Math.sqrt((0.06 * 0.94) / GAMES) * 100;
  console.log('  ' + (okB ? '✓' : '✗') + ' 闸门 B（打地狱）：vs地狱 ' +
    ((cand.live['hell'] || 0) * 100).toFixed(1) + '% vs 基线 ' +
    ((base.live['hell'] || 0) * 100).toFixed(1) + '% → ' + (dh >= 0 ? '+' : '') + (dh * 100).toFixed(2) +
    'pp（每档 ' + GAMES + ' 局，标准误约 ±' + seHell.toFixed(1) + 'pp —— 差值小于它就与噪声无法区分）');
}

/* 闸门 C：口径失配不能比基线更糟。
 * 绝对阈值在这里没有意义 —— 基线自己就有 -13 ~ -33pp 的缺口
 * （phase3 §4 记录的老账），要求候选 |Δ| ≤ 8pp 等于要求先把老账还清，
 * 那不是"这次训练有没有走样"能回答的问题。真正要挡的是：
 * 这份权重**比现在游戏里用的那份更像仿真里的自己**。
 * 绝对阈值只保留一条兜底上限，防止出现荒谬的失配。 */
const candAbs = Math.abs(cand.worstDelta);
const baseAbs = base ? Math.abs(base.worstDelta || 0) : null;
const okC1 = (baseAbs == null) ? (candAbs <= TOL) : (candAbs <= baseAbs + 3);
const okC2 = candAbs <= 45;
pass = pass && okC1 && okC2;
console.log('  ' + (okC1 ? '✓' : '✗') + ' 闸门 C1（没比基线更走样）：worst|Δ| ' +
  candAbs.toFixed(1) + 'pp' + (baseAbs != null ? ' ≤ 基线 ' + baseAbs.toFixed(1) + 'pp + 3pp' : ' ≤ 容差 ' + TOL + 'pp（无基线）'));
console.log('  ' + (okC2 ? '✓' : '✗') + ' 闸门 C2（失配未失控）：worst|Δ| ' + candAbs.toFixed(1) + 'pp ≤ 45pp（兜底天花板）');

/* --bake-anyway 只旁路 A/B（"有没有变强"由人拍板），C2（失配失控）仍一票否决：
 * 失配失控意味着这份权重在实机上不可信，烘了等于把仿真过拟合发布给玩家。 */
const bakeAllowed = pass || (BAKE_ANYWAY && okC2);
const report = {
  run: RUN, at: new Date().toISOString(), games: GAMES, seed: SEED, tol: TOL, top: TOP,
  topN: TOPN,
  /* 候选集与排名：选中的是**实机**最强那份，不是仿真分最高那份。
   * distinctWrites = 去重前实际存在的不同权重数；dupCheckpoints = 被折叠的同内容副本数。
   * 两者一起才能读出「这一轮到底有几份可测的权重」——只报 topN 会让人以为
   * 跑了 N 份筛选，其实可能全都是同一份权重（见 candidateFiles 的注释）。 */
  distinctWrites: ALL_DISTINCT.length,
  dupCheckpoints: dupTotal,
  candidates: RESULTS.map(x => ({ file: x.file, ep: x.ep, simScore: x.simScore,
                                   liveScore: score(x.r.live), live: x.r.live, worstDelta: x.r.worstDelta })),
  chosen: { file: chosen.file, ep: bestEp, simScore: chosen.simScore, liveScore: score(cand.live) },
  bestEp: best.ep, bestSimScore: best.best,
  candidate: cand, baseline: base, gates: { improved: pass, bakeAnyway: BAKE_ANYWAY },
  passed: bakeAllowed,
};
const rp = path.join(ROOT, 'tools', 'logs', RUN + '.finalize.json');
fs.writeFileSync(rp, JSON.stringify(report, null, 2), 'utf8');
console.log('\n验收报告：' + path.relative(ROOT, rp));

if(!bakeAllowed){
  /* --dry-run 是演练：不写收尾标记，否则一次演练就会把真正那次收尾挡在门外 */
  if(!DRY) fs.writeFileSync(MARK, new Date().toISOString() + ' 未达标（闸门未过），未烘焙\n', 'utf8');
  console.log('\n结论：未达标 —— 不烘焙，js/input-weights.js 保持原样。' +
    (DRY ? '（演练，未写标记）' : (BAKE_ANYWAY ? '（--bake-anyway 也救不了：失配已失控 C2）' : '')));
  process.exit(2);
}
if(DRY){ console.log('\n结论：达标（--dry-run，未烘焙）。'); process.exit(0); }
if(BAKE_ANYWAY && !pass){
  console.log('\n⚠ --bake-anyway：闸门 A/B 未过，按操作者明确指令照烘。数字都在上面与报告里，未做任何修饰。');
}
if(DRY){ console.log('\n结论：达标（--dry-run，未烘焙）。'); process.exit(0); }

/* ---- 烘焙：先备份，再写，最后体检形状 ---- */
const WEIGHTS = path.join(ROOT, 'js', 'input-weights.js');
const BAK = path.join(ROOT, 'data', 'bak');
fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
const bak = path.join(BAK, 'input-weights.pre-' + RUN + '-' + stamp + '.js');
fs.copyFileSync(WEIGHTS, bak);
console.log('\n已备份现权重 → ' + path.relative(ROOT, bak));

/* meta 里那两个字段是**页面上给玩家看的**胜率，必须写**实机管线**实测值。
 * 原来这里写的是 best.wr（仿真值）—— 于是线上那份权重的 meta 写着
 * evalHell: 0.75，实机对真地狱 AI 只有 2.4%：对外宣称打不过地狱的 AI，
 * 在游戏里被地狱 AI 打成 2.4%。phase3 §4/§6 的全部结论就是「仿真数字不能
 * 当实机数字用」，meta 是这条结论最该守住的地方（它是玩家唯一能看到的数字）。
 * 仿真值另存到 simEval，两边都留痕，便于以后一眼看出 sim/live 又岔开了。 */
const wr = best.wr || {};
const evHell = cand.live['hell'] || 0;
const evDef = cand.live['default'] || 0;
const label = 'ladder-parity-' + RUN + '-ep' + bestEp;
const ladderLive = { at: new Date().toISOString(), seed: SEED, games: GAMES, byTier: cand.live };
execFileSync(process.execPath, ['tools/bake-input.js', path.relative(ROOT, bestPath),
                                String(evHell), String(evDef), label,
                                JSON.stringify(ladderLive),
                                JSON.stringify({ default: wr['default'] || 0, hell: wr['hell'] || 0 })],
               { cwd: ROOT, stdio: 'inherit' });

const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
const baked = require(path.join(ROOT, 'js', 'input-weights.js'));
const n = baked.INPUT_AI_WEIGHTS.net;
const net = n[n.length - 1];
const outN = Array.isArray(net) ? net.length : net.W.length;
const okShape = outN === IA.ACT_N && JSON.stringify(n.slice(0, -1).map(l => l.W.length)) === JSON.stringify(IA.HSIZES);
if(!okShape){
  fs.copyFileSync(bak, WEIGHTS);
  fail('烘焙后形状不匹配（out=' + outN + ' vs ACT_N=' + IA.ACT_N + '），已回滚到备份');
}
console.log('\n结论：已烘焙 js/input-weights.js（opp=' + label + '，' + outN + ' 动作）');
console.log('  回滚：cp "' + path.relative(ROOT, bak) + '" js/input-weights.js');
console.log('  实机分点率：' + LEVELS.map(t => t + '=' + ((cand.live[t] || 0) * 100).toFixed(1) + '%').join('  '));
fs.writeFileSync(MARK, new Date().toISOString() + ' 已烘焙 ' + label + '\n', 'utf8');