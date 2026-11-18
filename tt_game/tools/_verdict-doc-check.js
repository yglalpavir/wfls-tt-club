/* R67：verdicts/ 与文档数字的一致性抽查 */
'use strict';
const fs = require('fs');

const checks = [
  { file: 'roster-hell40.txt',      expect: '75.3%       [68.0,81.5]', doc: '§13㉛ fixture hell 75.3% [68.0,81.5]' },
  { file: 'roster-nem40.txt',       expect: '72.5%       [63.9,79.7]', doc: '§13㉛ fixture nemesis 72.5% [63.9,79.7]' },
  { file: 'roster-nem2-40.txt',     expect: '71.1%       [63.4,77.8]', doc: '§13㉛ fixture nemesis2 71.1% [63.4,77.8]' },
  { file: 'roster-default40.txt',   expect: '99.5%       [98.2,99.9]', doc: '§7b default 99.5% [98.2,99.9]' },
  { file: 'roster-grandslam40.txt', expect: '99.2%       [97.6,99.7]', doc: '§7b grandslam 99.2% [97.6,99.7]' },
  { file: 'r41-nem2-txb100.txt',    expect: '70.5%       [65.6,75.0]', doc: '§13㉘ nemesis2 带表 70.5% [65.6,75.0]' },
  { file: 'r41-nem2-base100.txt',   expect: '62.7%       [58.3,66.8]', doc: '§13㉘ nemesis2 无表 62.7% [58.3,66.8]' },
];
const doc = fs.readFileSync('../docs/tech/hip-framework.md', 'utf8');
let ok = 0;
for(const c of checks){
  const raw = fs.readFileSync('../data/verdicts/' + c.file, 'utf8');
  const line = raw.split('\n').find(l => l.includes('%') && l.includes('['));
  const rate = (line.match(/(\d+\.\d)%/) || [])[1];
  const ci = (line.match(/\[(\d+\.\d),(\d+\.\d)\]/) || []);
  const docOk = doc.includes(rate + '% [' + ci[1] + ',' + ci[2] + ']');
  console.log((docOk ? '✓' : '✗') + ' ' + c.file.padEnd(24) + rate + '% [' + ci[1] + ',' + ci[2] + ']' +
              (docOk ? '  ↔ 文档一致' : '  ↔ 文档未找到该数字!'));
  if(docOk) ok++;
}
console.log('\n' + ok + '/' + checks.length + ' 一致');
