// Self-check for src/scripts/lyapunov.ts. Run: npm test
import assert from 'node:assert/strict';
import { AFFINE, gradient, isAffine, twinRun, walkCounts, affineSpectrum1d, affineSpectrum2d, networkParitySpectrum, adjacency, spectrumJob, benettin } from '../src/scripts/lyapunov.ts';
import { symEigen } from '../src/scripts/linalg.ts';
import { buildNet } from '../src/scripts/net.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Exactly the sixteen affine rules have a constant gradient; rule 150 has (1,1,1), rule 90 (1,0,1), rule 110 none.
assert.deepEqual(Array.from({ length: 256 }, (_, n) => n).filter(isAffine), AFFINE);
assert.deepEqual(gradient(150), [1, 1, 1]); assert.deepEqual(gradient(90), [1, 0, 1]); assert.deepEqual(gradient(240), [1, 0, 0]); assert.equal(gradient(110), null);
// Walk counts of rule 90 are binomial coefficients on every other cell; the parity of the counts is the difference pattern; the
// running estimate heads for ln 2. For rule 30 the parity check fails within a few ticks.
const tw = twinRun(90, 101, 60, 50, 1), wk = walkCounts(90, tw);
const row4 = Array.from(wk.logs[4]).map((v) => (v === -Infinity ? 0 : Math.round(Math.exp(v))));
assert.deepEqual(row4.slice(46, 55), [1, 0, 4, 0, 6, 0, 4, 0, 1]);
assert.ok(wk.agree.every((v) => v)); near(wk.running[60], Math.log(2), 0.06);
const tw30 = twinRun(30, 101, 40, 50, 1), wk30 = walkCounts(30, tw30); assert.ok(wk30.agree.slice(0, 20).some((v) => !v));
assert.ok(tw.diff[0].reduce((a, b) => a + b, 0) === 1 && tw.diff[10].reduce((a, b) => a + b, 0) > 1);
// Closed-form spectra on the ring: rule 150 tops out at ln 3, rule 90 and 60 at ln 2, rule 204 is all zeros, rule 0 all −∞;
// rule 150 has −∞ entries when 3 divides N.
near(affineSpectrum1d(150, 101)[0], Math.log(3)); near(affineSpectrum1d(90, 101)[0], Math.log(2)); near(affineSpectrum1d(60, 101)[0], Math.log(2));
assert.ok(Array.from(affineSpectrum1d(204, 32)).every((v) => Math.abs(v) < 1e-12)); assert.ok(Array.from(affineSpectrum1d(0, 32)).every((v) => v === -Infinity));
assert.ok(affineSpectrum1d(150, 99).includes(-Infinity)); assert.ok(!affineSpectrum1d(150, 100).includes(-Infinity));
// On the torus: ln 5, ln 9 and ln 13 with the cell itself, ln 4, ln 8, ln 12 without.
near(affineSpectrum2d('vn', true, 24).spectrum[0], Math.log(5)); near(affineSpectrum2d('moore', true, 24).spectrum[0], Math.log(9)); near(affineSpectrum2d('vn2', true, 24).spectrum[0], Math.log(13));
near(affineSpectrum2d('vn', false, 24).spectrum[0], Math.log(4)); near(affineSpectrum2d('moore', false, 24).max, Math.log(8));
// On a network: the ring C₁₆ is rule 90 or 150 again, so the top exponent is ln 2 or ln 3; a random network's top exponent is at least ln of the mean degree.
const ring = buildNet({ kind: 'ws', n: 16, k: 2, p: 0 }, 1, 'none'), eig = symEigen(adjacency(ring), 16).values;
near(networkParitySpectrum(eig, false)[0], Math.log(2), 1e-9); near(networkParitySpectrum(eig, true)[0], Math.log(3), 1e-9);
let res: ReturnType<typeof spectrumJob> extends Generator<any, infer R> ? R : never = null as any;
const job = spectrumJob({ spec: { kind: 'er', n: 120, k: 6 }, seed: 2 }); for (;;) { const r = job.next(); if (r.done) { res = r.value; break; } }
assert.equal(res.eig.length, 120); assert.ok(networkParitySpectrum(res.eig, false)[0] >= Math.log(res.meanDegree) - 1e-9);
// Benettin agrees with the closed form for an affine rule and finds ln 2 for rule 90; the identity rule gives zeros.
const run = (rule: number, N: number) => { const j = benettin({ rule, N, burn: 150, T: 300, seed: 3 }); let n = 0; for (;;) { const r = j.next(); if (r.done) return { ...r.value, yields: n }; n++; } };
const b150 = run(150, 32), exact = affineSpectrum1d(150, 32);
assert.ok(b150.yields >= 10);
for (let k = 0; k < 32; k++) if (exact[k] > -Infinity) near(b150.spectrum[k], exact[k], 0.05);
near(run(90, 32).spectrum[0], Math.log(2), 0.05); assert.ok(Array.from(run(204, 16).spectrum).every((v) => Math.abs(v) < 1e-9));

console.log(`lyapunov ok · rule 90 running estimate ${wk.running[60].toFixed(3)} · Benettin top for 150: ${b150.spectrum[0].toFixed(3)}`);
