/* R47b：R8 候选是扁平数组（0..41 = 维度索引）—— 需要 unflatten 映射。
 * 用 policy.js 的 unflatten 对齐后对比关键维度。 */
'use strict';
const fs = require('fs');
const vm = require('vm');

function loadVec(path, varName){
  const t = fs.readFileSync(path, 'utf8');
  const ctx = { POLICY_DEFAULT: {} };
  vm.createContext(ctx);
  vm.runInContext(t, ctx);
  return vm.runInContext(varName, ctx);
}
const P = require('../js/policy.js');
const nem = loadVec('../js/learned-policy-nemesis.js', 'NEMESIS_POLICY');
const candRaw = JSON.parse(fs.readFileSync('train-nemesis-candidate.json', 'utf8'));
const flat = candRaw.vec || candRaw;
const cand = P.unflattenPolicy(flat);
/* unflatten 丢未知字段 —— 关键维度对比 */
const keys = ['moveSpeed', 'moveErr', 'moveZ', 'txErrBase', 'txErrBx', 'txErrSide',
              'txErrSpd', 'txRange', 'txWideProb', 'txWideMag', 'recoverPace',
              'pushDepth', 'pushSide', 'fwdBoost', 'defPace', 'tzBase', 'tzRange'];
console.log('key'.padEnd(14) + '  nem(R20)   cand(R8)');
for(const k of keys){
  const a = nem[k], b = cand[k];
  const mark = (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) > 0.01) ? ' *' : '';
  console.log(k.padEnd(14) + '  ' + String(a).padEnd(10) + ' ' + String(b).padEnd(10) + mark);
}
