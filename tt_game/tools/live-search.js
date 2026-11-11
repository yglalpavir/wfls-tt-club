/* =====================================================================
 *  live-search.js — 进程内「真机在环」旋钮搜索（R1.2 第一回合）
 * =====================================================================
 *
 *  动机（为什么不用 hip-eval --grid）
 * --------------------------------
 *  hip-eval --grid 每格要起一个新进程 + 重建 rig（~2.5 min/30 局，其中
 *  权重 parse 占 2-4s × 格数）。live-rig.js 把装配层抽成进程内 API 后：
 *    · rig 只建一次（355ms），之后每点换 cfg 只是 setConfig；
 *    · 20 局/点 ≈ 82s（≈ hip-eval 30 局/格的 55%），且无进程噪声；
 *    · 同一进程内可以做**多臂**搜索（CMA / 坐标下降 / 随机搜索）。
 *
 *  判据纪律（不许漂）
 * -----------------
 *  · 搜索（selection）用 seed 20261004 的小样本（20 局/点，分辨率 ±8pp）——
 *    只用来排序候选，数字本身**不可引用**；
 *  · 定案（confirmation）必须 CLI hip-eval 100 局（无 --hip-cfg 的默认行为
 *    另测），与历史所有表格同口径；
 *  · 进程内与 CLI 的种子路径不同（playGame 的 __randFn 序列一致，但 CLI 经
 *    hip-eval 分片后 per-shard seed = seed + s*1000，20 局单进程 ≈ CLI 的
 *    前两片），所以「同点两口径读数差 ≤ CI」即可，不要求逐位相同。
 *
 *  用法
 * ----
 *  node tools/live-search.js --opp nemesis --rounds 8 --games 20
 *  每轮：报告当前最优 + 本轮尝试的点（日志 JSON 落 data/hip/live-search-<opp>.json）
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildRig, ROOT } = require('./live-rig.js');

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
const HAS = f => process.argv.includes(f);

const OPP = argOf('--opp', 'nemesis');
const GAMES = parseInt(argOf('--games', '20'), 10);
const ROUNDS = parseInt(argOf('--rounds', '8'), 10);
const SEED = parseInt(argOf('--seed', '20261004'), 10);
const OUT = argOf('--out', path.join(ROOT, 'data', 'hip', 'live-search-' + OPP + '.json'));

/* 搜索空间：只放「已证可达」的旋钮（§1.18.11 死旋钮清单之外的）。
 * 每项 [key, lo, hi]；搜索在立方体里做坐标下降 + 随机扰动。 */
const SPACE = [
  ['padZOffset', 0.25, 0.45],   // g3 全表面：0.35 最优、0.2 明显差 ⇒ 在 0.3~0.42 细扫
  ['swingLead', 0.03, 0.10],    // 挥拍提前量（决定追位/挥拍切换时刻）
  ['holdClamp', 0.12, 0.30],    // 挥拍阶段允许的拍位修正
  ['servoGain', 0.9, 1.6],      // 落点伺服增益
  ['posLead', -0.12, 0.0],      // 追位目标前置量
  ['maxSwing', 0.6, 0.95],      // 拍速上限（命令值）
];

function main(){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp(OPP);
  console.log('[live-search] opp=' + OPP + ' games/点=' + GAMES + ' rounds=' + ROUNDS + ' rig 就绪');

  const evalPoint = (cfg) => {
    rig.ctx && require('./live-rig.js'); // no-op，保持引用清晰
    /* 注意：HIP_SKILL.setConfig 是 OVERRIDE 覆盖；为避免上一个点的键残留，
     * 先 setConfig(null) 回默认，再设置本次的点。 */
    rig.ctx && vmRun(rig, 'HIP_SKILL.setConfig(null);');
    const keys = Object.keys(cfg);
    if(keys.length) vmRun(rig, 'HIP_SKILL.setConfig(' + JSON.stringify(cfg) + ');');
    let pts = 0, tot = 0, stalled = 0, rallySum = 0, rallyN = 0;
    for(let g = 0; g < GAMES; g++){
      const r = rig.playGame(SEED, g, 120);
      pts += r.you; tot += r.you + r.ai;
      if(r.you + r.ai === 0) stalled++;
      if(r.rally && r.rally.length){ rallySum += r.rally.reduce((a, b) => a + b, 0); rallyN += r.rally.length; }
    }
    /* 评完恢复默认（后续外层脚本/CLI 不受残留影响） */
    vmRun(rig, 'HIP_SKILL.setConfig(null);');
    return { rate: tot ? pts / tot : 0.5, pts, tot, stalled, rally: rallyN ? rallySum / rallyN : 0 };
  };

  const t0 = Date.now();
  const base = evalPoint({});
  console.log('[base] ' + JSON.stringify({ cfg: 'DEFAULTS', ...base }) + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');

  const history = [{ cfg: {}, ...base, kind: 'base' }];
  let best = { cfg: {}, ...base };
  /* 坐标下降：每轮随机一个起点扰动，逐坐标试 ±step，接受改进 */
  let cur = {};
  for(let rd = 0; rd < ROUNDS; rd++){
    const step = Math.pow(0.5, rd) ;   // 每轮步长减半
    let improved = false;
    for(const [key, lo, hi] of SPACE){
      const span = (hi - lo) * step * 0.5;
      const baseV = (cur[key] !== undefined ? cur[key] : DEFAULTS_VAL[key]);
      for(const d of [span, -span]){
        const v = Math.min(hi, Math.max(lo, baseV + d));
        if(Math.abs(v - baseV) < 1e-4) continue;
        const cfg = { ...cur, [key]: +v.toFixed(4) };
        const t1 = Date.now();
        const r = evalPoint(cfg);
        const keep = r.rate > best.rate + 0.002;   // +0.2pp 才算改进（防噪声采纳）
        console.log('[try] ' + key + '=' + v.toFixed(4) + '  rate=' + (r.rate * 100).toFixed(1) + '%'
          + ' (pts ' + r.pts + '/' + r.tot + ', rally ' + r.rally.toFixed(1) + ', stalled ' + r.stalled + ')'
          + '  ' + ((Date.now() - t1) / 1000).toFixed(0) + 's' + (keep ? '  ★' : ''));
        history.push({ cfg, ...r, kind: 'try', round: rd });
        if(keep){ cur = cfg; best = { cfg, ...r }; improved = true; }
      }
    }
    console.log('[round ' + rd + '] best=' + (best.rate * 100).toFixed(1) + '%  ' + JSON.stringify(best.cfg) + (improved ? '' : '  (no improve)'));
    fs.writeFileSync(OUT, JSON.stringify({ opp: OPP, games: GAMES, seed: SEED, best, history }, null, 2));
  }
  console.log('[done] best ' + (best.rate * 100).toFixed(1) + '%  ' + JSON.stringify(best.cfg) + '  => ' + OUT);
}

/* 在 rig 的 vm 里执行（HIP_SKILL 是词法绑定，只能 runInContext） */
function vmRun(rig, src){ require('vm').runInContext(src, rig.ctx); }

/* DEFAULTS_VAL：从 rig 里读出当前默认 cfg 值（坐标下降的起点） */
const DEFAULTS_VAL = {};
try{
  const probe = buildRig({ controller: 'hip', moveCap: 2.0 });
  const j = JSON.parse(require('vm').runInContext('JSON.stringify(HIP_SKILL.getConfig())', probe.ctx));
  for(const [k] of SPACE) DEFAULTS_VAL[k] = j[k];
}catch(e){ /* 读不到就用 SPACE 里给的中点 */ for(const [k, lo, hi] of SPACE) if(DEFAULTS_VAL[k] === undefined) DEFAULTS_VAL[k] = (lo + hi) / 2; }

main();
