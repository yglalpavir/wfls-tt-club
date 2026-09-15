'use strict';
const d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
const w = d.w;
console.log('层数=' + w.length, 'o=', JSON.stringify(d.o).slice(0, 200));
for(let li = 0; li < w.length; li++){
  const { W, b } = w[li];
  let s = 0, mx = -9e9, mn = 9e9, nz = 0, tot = 0;
  for(const row of W){ for(const v of row){ s += Math.abs(v); if(v > mx) mx = v; if(v < mn) mn = v; if(v !== 0) nz++; tot++; } }
  console.log('L' + li + ' shape=' + W.length + 'x' + W[0].length,
    '|W|avg=' + (s / tot).toFixed(5), 'max=' + mx.toFixed(4), 'min=' + mn.toFixed(4),
    '非零=' + nz + '/' + tot, 'b=' + JSON.stringify(b).slice(0, 120));
}