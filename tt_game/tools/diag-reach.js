/* =====================================================================
 *  diag-reach.js — 诊断：仿真胜率里有多少来自「对手够不着」
 *  · 背景：实机遥测显示 ttmouse 打 extreme-max 真实胜率约 10%，
 *    而同一权重在仿真里是 57%（tools/eval-after-phase1.log）。
 *    差距主要来自一处 sim↔real 不对称：
 *      仿真对手 aiReach（input-sim.js:262-274）有 4 道 `reach:false` 硬门
 *      （reach-null / reach-z / reach-spd / reach-pos），一旦够不着就把这一分
 *      直接判给玩家；实机对手 aiMoveShared 永远够得着，只做指数跟踪 + Z 随机游走。
 *  · 本脚本做两件事：
 *      1) 统计仿真里各档对手的 reach:false 触发率与分类型计数
 *      2) 用「必达对手」（moveSpeed/moveZ 拉满、moveErr=0）复跑同一批种子，
 *         看胜率塌到多少——塌到接近实机数值，就证明这就是主要差距来源。
 *  · 用法：
 *      node tools/diag-reach.js                    # 每档 300 局
 *      node tools/diag-reach.js --games 600
 *      node tools/diag-reach.js --from data/input-ai-a952.json
 * ===================================================================== */
'use strict';
const path = require('path');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const OPP = require(path.join(__dirname, '..', 'js', 'opponent-ladder.js'));
global.SIM = SIM; global.P = PP;

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = {
  from: path.join(ROOT, 'data', 'input-ai-extreme.json'),
  games: 300,
  seed: 20260909,
};
for(let i = 0; i < args.length; i++){
  if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--seed') opt.seed = parseInt(args[++i], 10);
  else if(args[i] === '--from') opt.from = path.resolve(args[++i]);
}

/* 与 train-input3.js 一致的可复现 rng */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---- 载入起点权重（形状校验与续训器相同）---- */
const base = IA.loadInputAgent(fs_read(opt.from));
const net = base.getNet();
const widths = net.map(l => l.W.length + '×' + l.W[0].length).join(' → ');
function fs_read(p){ return require('fs').readFileSync(p, 'utf8'); }
if(base.nActions !== IA.ACT_N || net[0].W[0].length !== IA.OBS_N){
  console.error('❌ 起点权重与当前动作空间不兼容：' + opt.from);
  process.exit(2);
}
const brain = { act(o){ return base.decode(base.bestAction(o)); }, credit(){} };
base.setTraining(false); base.setEps(0);

/* 必达对手：跑动/纵深上限拉满、落点零误差 → 4 道 reach 门几乎不可能触发。
 * 实机 aiMoveShared 就是这个语义（永远够得着）。 */
const PERFECT = {
  moveSpeed: 40, moveZ: 40, moveErr: 0,
  pace: 1.0, spin: 1.0, txErrX: 0, txErrZ: 0, awayProb: 0, wide: 0,
};

console.log('起点权重：' + opt.from + '\n  形状：' + widths);
console.log('  每档 ' + opt.games + ' 局\n');
console.log('  对手'.padEnd(13) + '仿真胜率    对手够不着占胜率    reach失败率(分/次)   失败类型');
const summary = [];
for(const lv of OPP.LEVELS){
  const opp = OPP.at(lv.tag);
  let win = 0, aiReachWins = 0, pts = 0, fails = 0;
  const why = {};
  const loss = {};            // 玩家输球的理由分布（对应实机 TT_STATS.lostBy）
  for(let g = 0; g < opt.games; g++){
    const r = INPUTSIM.playInputPoint(brain, opp, mulberry32(opt.seed * 7 + lv.id * 977 + g), g % 2 === 0 ? 'player' : 'ai');
    pts += r.pReturns || 0;
    if(r.winner === 'ai'){ const k = String(r.reason).slice(0, 26); loss[k] = (loss[k] || 0) + 1; }
    if(r.winner === 'player'){
      win++;
      if(/^ai-reach/.test(String(r.reason))){
        aiReachWins++;
        fails++;
        why[r.reason] = (why[r.reason] || 0) + 1;
      }
    }
  }
  const wr = win / opt.games;
  const share = wr > 0 ? aiReachWins / win : 0;
  const perShot = pts > 0 ? fails / pts : 0;
  const whyTxt = Object.keys(why).sort((a,b)=>why[b]-why[a]).map(k => k.slice(6) + ':' + why[k]).join(' ');
  const lossTxt = Object.keys(loss).sort((a,b)=>loss[b]-loss[a]).map(k => k + ':' + loss[k]).join(' ');
  console.log('  ' + lv.tag.padEnd(11) + (wr*100).toFixed(1).padStart(6) + '%    '
    + (share*100).toFixed(1).padStart(6) + '%      '
    + (perShot*100).toFixed(1).padStart(5) + '%            ' + whyTxt);
  console.log('      玩家输球原因（共 ' + (opt.games - win) + ' 次）：' + (lossTxt || '无'));
  summary.push({ tag: lv.tag, wr, reachShare: share, reachPerShot: perShot, pts, why, loss });
}

console.log('\n—— 同一批种子，对手换成「必达」（= 实机对手语义）——');
console.log('  对手'.padEnd(13) + '常规胜率    必达胜率    差值');
for(const lv of OPP.LEVELS){
  const opp = Object.assign({}, OPP.at(lv.tag), PERFECT);
  let win = 0;
  for(let g = 0; g < opt.games; g++){
    const r = INPUTSIM.playInputPoint(brain, opp, mulberry32(opt.seed * 7 + lv.id * 977 + g), g % 2 === 0 ? 'player' : 'ai');
    if(r.winner === 'player') win++;
  }
  const prev = summary.find(s => s.tag === lv.tag);
  const wr = win / opt.games;
  console.log('  ' + lv.tag.padEnd(11) + (prev.wr*100).toFixed(1).padStart(6) + '%    '
    + (wr*100).toFixed(1).padStart(6) + '%    ' + (((prev.wr-wr)*100) >= 0 ? '+' : '') + ((prev.wr-wr)*100).toFixed(1).padStart(6) + 'pp');
}
