/* =====================================================================
 * _r6-paired-hip.js — Round-6 PRIMARY gate: paired live HIP eval analysis.
 *
 * Input: two dirs of live-match --json outputs (one file per seed),
 *   base: tools/logs/_r6-hip/base-s<i>.json   (hell = archived R5 vector)
 *   cand: tools/logs/_r6-hip/cand-s<i>.json   (hell = round-6 candidate)
 * Both sides ran the SAME seeds / games / maxsec / controller (hip) with
 * --hell-vec, so games are paired by (seed, g) under common random numbers.
 *
 * Perspective: live-match reports the MODEL side (= HIP controller).
 * Hell's points in game g = games[g].op. We analyse HELL improvement:
 *   d_g = op_cand(g) - op_base(g)   (paired per game)
 * Gates (pre-registered in hell-selfplay-findings.md §16):
 *   G1: mean(d) >= +1.5 pp of hell point rate AND one-sided p < 0.05
 * Output: text verdict + JSON to tools/logs/_r6-hip/paired-verdict.json
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'logs', '_r6-hip');
const N_SEEDS = 12;

function wilson(p, n, z){
  z = z || 1.96;
  if(!n) return { lo: 0, hi: 1 };
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

function loadSide(prefix){
  const seeds = [];
  for(let s = 0; s < N_SEEDS; s++){
    const f = path.join(DIR, prefix + '-s' + s + '.json');
    if(!fs.existsSync(f)) continue;
    try{
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const h = j.byTier && j.byTier.hell;
      if(!h || !Array.isArray(h.games)) continue;
      seeds.push({ s, points: h.points || 0, oppPts: h.oppPts || 0,
                   games: h.games.map(g => ({ g: g.g, hellPts: g.op || 0, frames: g.frames || 0 })),
                   stalled: h.stalled || 0 });
    }catch(e){ /* skip broken file */ }
  }
  return seeds;
}

const base = loadSide('base');
const cand = loadSide('cand');
const bMap = new Map(base.map(r => [r.s, r]));
const pairs = [];
for(const c of cand){
  const b = bMap.get(c.s);
  if(!b) continue;
  const gMap = new Map(b.games.map(g => [g.g, g]));
  for(const g of c.games){
    const bg = gMap.get(g.g);
    if(bg) pairs.push({ seed: c.s, g: g.g, d: g.hellPts - bg.hellPts, nb: bg.hellPts, nc: g.hellPts });
  }
}

const agg = (rows, key) => {
  let hell = 0, tot = 0;
  for(const r of rows){ hell += (key === 'cand' ? r.oppPts : r.oppPts); tot += r.points; }
  return { hell, tot, rate: tot ? hell / tot : 0 };
};
const aB = agg(base), aC = agg(cand);

console.log('=== R6 PRIMARY (HIP live, paired) ===');
console.log('valid seeds: base=' + base.length + ' cand=' + cand.length + ' paired games=' + pairs.length);
console.log('hell point rate vs HIP  baseline(R5): ' + (aB.rate * 100).toFixed(2) + '%  [' +
  (wilson(aB.rate, aB.tot).lo * 100).toFixed(1) + ',' + (wilson(aB.rate, aB.tot).hi * 100).toFixed(1) + ']  n=' + aB.tot);
console.log('hell point rate vs HIP  candidate(R6): ' + (aC.rate * 100).toFixed(2) + '%  [' +
  (wilson(aC.rate, aC.tot).lo * 100).toFixed(1) + ',' + (wilson(aC.rate, aC.tot).hi * 100).toFixed(1) + ']  n=' + aC.tot);

let verdict = { ok: false, reason: 'insufficient-pairs', meanD: null, p: null };
if(pairs.length >= 80){
  const n = pairs.length;
  const mean = pairs.reduce((a, p) => a + p.d, 0) / n;
  const sd = Math.sqrt(pairs.reduce((a, p) => a + (p.d - mean) * (p.d - mean), 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  /* Welch-ish t on paired per-game diffs; one-sided p via normal approx (n large).
   * Effect size = aggregate rate difference (aC.rate - aB.rate); the paired t only
   * decides significance (it is scale-free). */
  const t = se > 0 ? mean / se : (mean > 0 ? 99 : -99);
  const p = 1 - normCdf(t);
  const dRate = (aC.rate - aB.rate) * 100;
  console.log('paired per-game diff (hell pts, cand-base): mean=' + mean.toFixed(4) +
    '  se=' + se.toFixed(4) + '  t=' + t.toFixed(2) + '  p(one-sided)=' + p.toFixed(4));
  console.log('aggregate rate delta: ' + (dRate >= 0 ? '+' : '') + dRate.toFixed(2) + ' pp');
  const ok = (dRate >= 1.5) && (p < 0.05);
  verdict = { ok, reason: ok ? 'pass' : (dRate < 1.5 ? 'delta-below-1.5pp' : 'not-significant'),
              meanD: +mean.toFixed(5), dRatePP: +dRate.toFixed(3), se: +se.toFixed(5), t: +t.toFixed(3), p: +p.toFixed(5) };
  console.log('G1 verdict: ' + (ok ? 'PASS' : 'FAIL') + '  (need delta >= +1.5pp and p<0.05 - pre-registered)');
}else{
  console.log('G1 verdict: FAIL (fewer than 80 paired games)');
}

function normCdf(z){ return 0.5 * (1 + erf(z / Math.SQRT2)); }
function erf(x){
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, pp = 0.3275911;
  const t = 1 / (1 + pp * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return s * y;
}

fs.writeFileSync(path.join(DIR, 'paired-verdict.json'), JSON.stringify({
  at: new Date().toISOString(),
  base: { seeds: base.length, hellPts: aB.hell, points: aB.tot, rate: +aB.rate.toFixed(5) },
  cand: { seeds: cand.length, hellPts: aC.hell, points: aC.tot, rate: +aC.rate.toFixed(5) },
  pairedGames: pairs.length, verdict,
}, null, 2));
console.log('written: tools/logs/_r6-hip/paired-verdict.json');
