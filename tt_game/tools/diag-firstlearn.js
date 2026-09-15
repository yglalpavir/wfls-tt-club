'use strict';
/* 第一次学习迭代的详细跟踪：找 NaN 出生的具体环节 */
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const DQN = require('../js/dqn.js');
const ag = IA.createInputAgent({ lr: 0.001, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
const orig = ag.learn.bind(ag);
let traceCount = 0;
ag.learn = function(){
  const net = ag.getNet();
  const nanNow = JSON.stringify(net).includes('NaN');
  if(!nanNow && traceCount < 5){
    const s = { reward: 0.02, state: new Array(22).fill(0.1), next: new Array(22).fill(0.1), done: true, action: 3 };
    const qN = DQN.mlpForward(net[0] ? net : net, s.next).last;
    let mq = -1e9; for(const v of qN) if(v > mq) mq = v;
    const y = s.reward + (s.done ? 0 : 0.9 * mq);
    const q = DQN.mlpForward(net, s.state).last;
    const tgt = q.slice(); tgt[s.action] = y;
    console.log('[pre] y=' + y, 'maxQ=' + mq, 'q[3]=' + q[3]);
    orig.call(ag);
    const after = JSON.stringify(net);
    console.log('[post] NaN-in-net=' + after.includes('NaN'));
    traceCount++;
    return;
  }
  orig.call(ag);
};
for(let g = 0; g < 8; g++){
  const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } }, PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag.endPoint('player', res.winner);
  console.log('game=' + (g + 1) + ' 玩家胜=' + (res.winner === 'player'));
}