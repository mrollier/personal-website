// Self-check for src/scripts/mobility.ts and the data of /demos/mobility/. Run: npm test
import assert from 'node:assert/strict';
import { bsplines, fitCounts, draws, thin, zscore, tlcc, align, dtw, meanSd, connectivity } from '../src/scripts/mobility.ts';
import { makeRng, gaussian } from '../src/scripts/echoes.ts';
import { spearman } from '../src/scripts/stats.ts';
import data from '../src/data/mobility.json' with { type: 'json' };

const near = (a: number, b: number, eps: number, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);

// B-splines sum to one on every day and are never negative.
const B = bsplines(120, 17);
for (let t = 0; t < 120; t++) { let s = 0; for (let j = 0; j < 17; j++) { assert.ok(B[t * 17 + j] >= -1e-12); s += B[t * 17 + j]; } near(s, 1, 1e-9, 'partition of unity'); }

// Poisson counts around a known wave: the fit follows the truth, and the bootstrap spectrum centres on the fit and
// widens, relative to the height, when the same wave is counted in a population twenty times smaller.
const truth = (h: number) => Array.from({ length: 122 }, (_, t) => h * Math.exp(-(((t - 35) / 14) ** 2)) + h / 50);
function poisson(lam: number, r: () => number) { let k = 0, p = Math.exp(-lam), s = p; const u = r(); while (u > s) { k++; p *= lam / k; s += p; } return k; }
const spread = (h: number) => {
  const r = makeRng(7), y = truth(h).map((l) => poisson(l, r)), f = fitCounts(y), R = draws(f, 400, 3);
  near(f.mu[35] / h, 1, h > 20 ? 0.1 : 0.5, `peak of the fit at height ${h}`); // four a day is noisy, the fit follows the draw
  assert.ok(f.edf > 3 && f.edf < f.k, `edf ${f.edf}`);
  const [m, sd] = meanSd(R.map((c) => c[35]));
  near(m / f.mu[35], 1, 0.03, 'bootstrap mean');
  return sd / m;
};
const wide = spread(4), narrow = spread(80);
assert.ok(wide > 2 * narrow, `relative spread ${wide} vs ${narrow}`);

// Thinning keeps a fraction p of the patients.
const many = new Array(200).fill(50), kept = thin(many, 0.1, 5).reduce((a, b) => a + b, 0);
near(kept / (200 * 50), 0.1, 0.01, 'thinning');

// TLCC: a wave five days earlier has lag −5 (it runs ahead), and the overlap after aligning lines the peaks up.
const wave = (c: number) => Float64Array.from({ length: 120 }, (_, t) => Math.exp(-(((t - c) / 10) ** 2)));
const early = zscore(wave(40)), late = zscore(wave(45));
assert.equal(tlcc(early, late, 15).lag, -5);
assert.equal(tlcc(late, early, 15).lag, 5);
const [x, y] = align(early, late, -5);
assert.equal(x.length, 115); near(x[35], y[35], 1e-6, 'aligned');

// DTW: zero for identical series, symmetric, and smaller than the plain gap when one series is a stretched copy.
near(dtw(early, early).dist, 0, 1e-12, 'dtw self');
near(dtw(early, late).dist, dtw(late, early).dist, 1e-12, 'dtw symmetry');
const g = gaussian(makeRng(1)), noisy = Float64Array.from(early, (v) => v + 0.3 * g());
near(dtw(early, noisy).dist, dtw(noisy, early).dist, 1e-12, 'dtw symmetry, noise');
const broad = zscore(Float64Array.from({ length: 120 }, (_, t) => Math.exp(-(((t - 40) / 14) ** 2))));
let plain = 0; for (let t = 0; t < 120; t++) plain += Math.abs(early[t] - broad[t]);
const w = dtw(early, broad, true);
assert.ok(w.dist < plain / 120, `dtw ${w.dist} vs plain ${plain / 120}`);
assert.deepEqual(w.path![0], [0, 0]); assert.deepEqual(w.path!.at(-1), [119, 119]);

// The data: 43 arrondissements, and the correlation of the paper's Fig. 10 on the public stand-ins, as SciPy computes it:
// connection to Tongeren against excess deaths in the week of 15 April 2020, over the other 42.
assert.equal(data.arr.length, 43); assert.equal(data.commute.length, 43 * 43);
const n = 43, src = data.arr.findIndex((a) => a.nis === 73000), others = [...Array(n).keys()].filter((i) => i !== src);
const ci = others.map((h) => connectivity(data.commute, n, src, h)), ed = others.map((h) => data.excess.values[15][h]);
near(spearman(ci, ed), 0.7308721120501681, 1e-12, 'Tongeren, 15 April');

console.log('mobility ok');
