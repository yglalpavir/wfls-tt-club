'use strict';
/* 第一局学习详细跟踪：每个样本的 reward/maxQ/y/更新后 NaN 状态 */
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const DQN = require('../js/dqn.js');
const ag = IA.createInputAgent({ lr: 0.001, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
let learns = 0;
const origLearn = ag.learn.bind(ag);
ag.learn = function(){
  if(learns < 12){
    const net = ag.getNet();
    const w0 = net[0].W[0][0];
    origLearn.call(ag);
    const w1 = net[0].W[0][0];
    console.log('learn#' + learns + ' w00: ' + w0.toFixed(6) + ' → ' + w1.toFixed(6) + '  NaN=' + JSON.stringify(net).includes('NaN'));
    learns++;
  } else origLearn.call(ag);
};
const maxG = 6;
const epGame = {};
for(let g = 0; g < maxG; g++){
  const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } }, PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag.endPoint('player', res.winner);
  console.log('game=' + (g + 1) + ' winner=' + res.winner + ' 玩家=' + (res.winner === 'player'));
}