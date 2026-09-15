'use strict';
/* 快速验证：训练后网络是否真的发生了变化（权重哈希对比） */
const fs = require('fs');
const path = require('path');
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');

const hash = (w) => { let h = 0; for(const l of w){ for(const r of l.W) for(const v of r) h = (h * 31 + Math.round(v * 1e6)) % 1e9; for(const v of l.b) h = (h * 31 + (v === null ? -1 : Math.round(v * 1e6))) % 1e9; } return h; };

/* 1) 全新网络训练 40 局，看哈希变化 */
let ag = IA.createInputAgent({ lr: 0.0006, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
const h0 = hash(ag.getNet());
for(let g = 0; g < 40; g++){
  const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } },
    PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag.endPoint('player', res.winner);
}
const h1 = hash(ag.getNet());
console.log('fresh:   init=' + h0 + ' after40=' + h1 + '  变化=' + (h0 !== h1));

const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
console.log('存档: 层0bias前8=', JSON.stringify(saved.w[0].b.slice(0, 8)));

/* 2) 加载存档继续训练 — 观察谓是否变化 */
const ag2 = IA.loadAgent(JSON.stringify(saved));
const l0 = hash(ag2.getNet());
for(let g = 0; g < 40; g++){
  const res = IS.playInputPoint({ act(o){ return ag2.act(o, true).cmd; }, credit(d){ ag2.credit(d); } },
    PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag2.endPoint('player', res.winner);
}
const l1 = hash(ag2.getNet());
console.log('loaded:  init=' + l0 + ' after40=' + l1 + '  变化=' + (l0 !== l1));