'use strict';
/* mlpTrain 单元测试：单样本、单步，权重必须变化 */
const DQN = require('../js/dqn.js');
const net = DQN.mlpInit([4, 8, 8, 3], Math.random);
const input = [0.5, -0.3, 0.1, 0.7];
const before = JSON.stringify(net).slice(0, 80);
let sum = 0; for(const l of net) for(const r of l.W) for(const v of r) sum += Math.abs(v);
console.log('before |W|sum=' + sum.toFixed(6));
const target = [1, 0, 0];
DQN.mlpTrain(net, input, target, 0.1);
DQN.mlpTrain(net, input, target, 0.1);
DQN.mlpTrain(net, input, target, 0.1);
let sum2 = 0; for(const l of net) for(const r of l.W) for(const v of r) sum2 += Math.abs(v);
console.log('after 3x |W|sum=' + sum2.toFixed(6) + '  变化=' + (Math.abs(sum2 - sum) > 1e-9));
const q = DQN.mlpForward(net, input).last;
console.log('q=' + q.map(v => v.toFixed(4)).join(','));