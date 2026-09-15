'use strict';
/* 定位 NaN 诞生行：每个样本的 y/q/状态/奖励 + 学习后首层 NaN 位置 */
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const DQN = require('../js/dqn.js');
const ag = IA.createInputAgent({ lr: 0.001, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
let learns = 0, badSamples = 0;
const origLearn = ag.learn.bind(ag);
ag.learn = function(){
  if(learns < 40){
    origLearn.call(ag);
    const net = ag.getNet();
    let bad = '';
    for(let li = 0; li < net.length; li++){
      for(let j = 0; j < net[li].W.length; j++){
        for(let k = 0; k < net[li].W[j].length; k++){ if(!isFinite(net[li].W[j][k])){ bad = 'L' + li + 'W[' + j + '][' + k + ']'; break; } if(bad) break; }
        if(bad) break;
      }
      if(bad) break;
    }
    const nb = [];
    for(let li = 0; li < net.length; li++){ for(let j = 0; j < net[li].b.length; j++) if(!isFinite(net[li].b[j])) nb.push('L' + li + 'b' + j); }
    console.log('learn#' + learns + ' 首个NaN:' + (bad || '-') + ' bNaN:' + (nb.slice(0, 4).join(' ') || '-'));
    learns++;
  } else origLearn.call(ag);
};
for(let g = 0; g < 30; g++){
  const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } }, PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag.endPoint('player', res.winner);
  console.log('game=' + (g + 1) + ' winner=' + res.winner);
}