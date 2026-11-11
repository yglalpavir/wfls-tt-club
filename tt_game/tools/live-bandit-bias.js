/* =====================================================================
 *  live-bandit-bias.js — R2b：txBias 的在线 bandit 选择器（学习闭环）
 * =====================================================================
 *  R2a 已证：txBias 的最优值是**对手依赖**的（nemesis −0.05 涨 10pp，
 *  hell 0 最优、−0.05 掉 23pp），且没有任何已测静态特征能区分两者。
 *  在线方案：每局开始从动作集 {0, −0.05} 里选一个 bias，
 *  局末用该局的胜负（净胜分）更新每个臂的经验均值（ε-greedy）。
 *  若选择器能在线收敛到「对 nemesis 选 −0.05、对 hell 选 0」，
 *  就等于把两个对手各自的 +10pp 拿到手 —— 而不需要任何对手标签。
 *
 *  纪律：本脚本只验证**收敛性**（机制存在），不定案。
 *  定案 = 把收敛后的选择器状态固化成先验（每对手/每开局特征 → bias），
 *  再走 CLI 100 局 × 对手 + 四档守护。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildRig, ROOT } = require('./live-rig.js');

const ARMS = [0, -0.05];
const EPS = 0.2;          // 探索率
const GAMES = parseInt((process.argv[2] || '80'), 10);
const SEED = 20261004;

function run(opps, tag){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  /* ★ 分对手的臂统计：{oppTag: [arm0, arm1]} —— 不分对手会把两个对手的
   *   偏好写到同一组计数器上（第一版 mix 腿的 bug：nemesis/hell 数字全同）。 */
  const byOpp = {};
  opps.forEach(o => { byOpp[o] = ARMS.map(() => ({ n: 0, winSum: 0, ptWin: 0, ptTot: 0 })); });
  const log = [];
  let picks = { '0': 0, '-0.05': 0 };
  for(let g = 0; g < GAMES; g++){
    const oppTag = opps[g % opps.length];
    rig.setOpp(oppTag);
    const arms = byOpp[oppTag];
    /* ε-greedy 选臂（每个对手独立的偏好） */
    let a;
    if(Math.random() < EPS) a = Math.floor(Math.random() * ARMS.length);
    else {
      /* 乐观初始化：没玩过的臂视为均值 0.5 */
      let best = 0, bestV = -1;
      for(let i = 0; i < ARMS.length; i++){
        const v = arms[i].n ? (arms[i].winSum / arms[i].n) : 0.5;
        if(v > bestV){ bestV = v; best = i; }
      }
      a = best;
    }
    vm.runInContext('HIP_SKILL.setConfig({txBias:' + ARMS[a] + '});', rig.ctx);
    const r = rig.playGame(SEED + tag.length * 13, g, 120);
    const win = r.you > r.ai ? 1 : 0;
    const st = arms[a];
    st.n++; st.winSum += win; st.ptWin += r.you; st.ptTot += r.you + r.ai;
    picks[String(ARMS[a])]++;
    log.push({ g, opp: oppTag, bias: ARMS[a], you: r.you, ai: r.ai, win });
  }
  vm.runInContext('HIP_SKILL.setConfig(null);', rig.ctx);
  console.log('=== ' + tag + '（' + GAMES + ' 局，ε=' + EPS + '）===');
  for(const o of opps){
    const rows = ARMS.map((b, i) => ({ b, ...byOpp[o][i] })).filter(x => x.n);
    const lines = rows.map(x => 'bias ' + String(x.b).padStart(6) + ': n=' + String(x.n).padStart(3) +
      '  win=' + (x.winSum / x.n * 100).toFixed(0) + '%' +
      '  pts=' + (x.ptTot ? (x.ptWin / x.ptTot * 100).toFixed(1) : '-') + '%');
    console.log('  ' + o + ': ' + lines.join('  |  '));
  }
  console.log('  picks: ' + JSON.stringify(picks));
  const out = path.join(ROOT, 'data', 'hip', 'bandit-' + tag + '.json');
  fs.writeFileSync(out, JSON.stringify({ arms: ARMS, games: GAMES, log }, null, 2));
  console.log('  -> ' + out);
}

run(['nemesis'], 'nem');
run(['hell'], 'hell');
run(['nemesis', 'hell'], 'mix');
