/* R46：三向量参数级对比（nemesis / nemesis2 / hell 现役） */
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
/* hell 现役 = learned-policy.js 的 HELLO 策略？—— hell 档由 policy.js
 * strongVec + learned-policy.js 合成；直接取 policyForModel('hell').vec */
const sim = require('../js/simcore.js');
const P = require('../js/policy.js');
const hellVec = P.policyForModel('hell');
const nem = loadVec('../js/learned-policy-nemesis.js', 'NEMESIS_POLICY');
const nem2 = loadVec('../js/learned-policy-nemesis2.js', 'NEMESIS2_POLICY');

const keys = [...new Set([...Object.keys(nem), ...Object.keys(nem2)])].sort();
console.log('key'.padEnd(16) + '  nem     nem2    hell');
for(const k of keys){
  const a = nem[k], b = nem2[k], h = hellVec[k];
  const diff = (typeof a === 'number' && typeof h === 'number' && Math.abs(a - h) > 0.01) ? ' *' : '';
  console.log(k.padEnd(16) + '  ' + String(a).padEnd(7) + ' ' + String(b).padEnd(7) + ' ' + String(h).padEnd(7) + diff);
}
