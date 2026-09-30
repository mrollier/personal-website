// Self-check for src/scripts/taxonomy.ts: every identity of the taxonomy page holds cell for cell, and the quaternary
// rule of the paper's Fig. 6.1 comes out digit for digit. Run: npm test
import assert from 'node:assert/strict';
import { tableOf } from '../src/scripts/wolfram.ts';
import { step } from '../src/scripts/eca.ts';
import { makeRng } from '../src/scripts/net.ts';
import {
  order, shuffle, sweep, alphaStep, scaStep, mixture, octStep, ccaStep, step5, pool, unpool, poolTable, stepK,
  nuStep, periodic, nextAlloc, dualTable, ruleNumber, symmetricRule, wired, wiring, reversibleStep,
} from '../src/scripts/taxonomy.ts';

const same = (a: ArrayLike<number>, b: ArrayLike<number>, what: string) => assert.deepEqual(Array.from(a), Array.from(b), what);
const rand = (N: number, rnd: () => number) => Uint8Array.from({ length: N }, () => (rnd() < 0.5 ? 1 : 0));

// A sweep in which every cell updates once from the old row is the synchronous step only when no cell sees an updated
// neighbour; a line-by-line sweep is not, but the identity rule 204 leaves everything alone under any order.
{
  const rnd = makeRng(3), row = rand(40, rnd);
  same(sweep(row, tableOf(204), order('independent', 40, rnd)), row, 'identity rule under any order');
  assert.equal(new Set(shuffle(40, rnd)).size, 40);
  same(alphaStep(row, tableOf(30), 1, rnd), step(row, 30), 'α = 1 is synchronous');
  same(alphaStep(row, tableOf(30), 0, rnd), row, 'α = 0 is frozen');
}

// ACA ↔ SCA: the SCA with ψ = 204 and chance p of φ is the α-asynchronous CA with α = p, coin for coin.
for (const rule of [30, 90, 110, 184]) for (const p of [0.2, 0.5, 0.9]) {
  const r1 = makeRng(11), r2 = makeRng(11);
  let a = rand(60, makeRng(rule)), s = a.slice();
  for (let t = 0; t < 50; t++) { a = alphaStep(a, tableOf(rule), p, r1); s = scaStep(s, tableOf(rule), tableOf(204), p, r2); }
  same(a, s, `ACA and SCA, rule ${rule}, p ${p}`);
}

// The octuple of a mixture, and the continuous CA: with 0/1 chances it is the elementary rule, and one step from a
// definite row gives each cell's exact chance, which a large sample of the octuple SCA matches.
{
  const prob = mixture(tableOf(90), tableOf(204), 0.7);
  [0, 0.7, 0.3, 1, 0.7, 0, 1, 0.3].forEach((v, n) => assert.ok(Math.abs(prob[n] - v) < 1e-12, `mixture of 90 and 204 at ${n}`));
  const row = rand(30, makeRng(8)), x = Float64Array.from(row);
  same(ccaStep(x, mixture(tableOf(110), tableOf(0), 1)), step(row, 110), 'the continuous CA of a definite rule');
  const exact = ccaStep(x, prob), rnd = makeRng(9), mean = new Float64Array(30), K = 20000;
  for (let k = 0; k < K; k++) { const y = octStep(row, prob, rnd); for (let i = 0; i < 30; i++) mean[i] += y[i] / K; }
  for (let i = 0; i < 30; i++) assert.ok(Math.abs(mean[i] - exact[i]) < 0.02, `sampled chance ${mean[i]} vs ${exact[i]}`);
}

// MSCA ↔ ENCA (Fig. 4.1): rule 1095399156 on 50 cells, pooled into 10 cells of 32 states, stays the same picture; so does
// any radius-2 rule at every block size from 2 to 5.
for (const [rule, b] of [[1095399156, 5], [1095399156, 2], [2 ** 32 - 1 - 1095399156, 3], [123456789, 4]] as const) {
  const t5 = tableOf(rule, 2), K = 1 << b, tb = poolTable(t5, b), rnd = makeRng(rule % 97);
  let row = rand(b * 12, rnd), blocks = pool(row, b);
  same(unpool(blocks, b), row, 'pool round trip');
  for (let t = 0; t < 40; t++) { row = step5(row, t5); blocks = stepK(blocks, tb, K); same(unpool(blocks, b), row, `pooled rule ${rule}, b ${b}, tick ${t}`); }
}

// νCA ↔ MSCA (Fig. 6.1): φ = 110, ψ = 170, allocation evolved by ξ = 240 is the quaternary rule printed in the paper,
// and running both from a periodic allocation with period 5 gives the same picture.
{
  const [phi, psi, xi] = [tableOf(110), tableOf(170), tableOf(240)], q = dualTable(phi, psi, xi);
  assert.equal(ruleNumber(q, 4), 326159115819648357517613529732932608160n);
  const rnd = makeRng(4);
  let row = rand(60, rnd), alloc = periodic(60, 5, 2), dual = Uint16Array.from(row, (s, i) => 2 * s + alloc[i]);
  for (let t = 0; t < 60; t++) {
    row = nuStep(row, alloc, phi, psi); alloc = nextAlloc(alloc, xi); dual = stepK(dual, q, 4);
    same(Array.from(dual, (v) => v >> 1), row, `quaternary states, tick ${t}`); same(Array.from(dual, (v) => v & 1), alloc, `allocation, tick ${t}`);
  }
  assert.equal(symmetricRule(153, 102), 195); // Section 6.2.2
  same(nuStep(row, new Uint8Array(60).fill(1), phi, psi), step(row, 170), 'all ψ');
}

// ACA ↔ ENCA: a line-by-line sweep is the synchronous update of `wired`, for every elementary rule; the wiring of the last
// cell covers the whole ring.
{
  const rnd = makeRng(21);
  for (let rule = 0; rule < 256; rule++) { const row = rand(25, rnd); same(wired(row, tableOf(rule)), sweep(row, tableOf(rule), order('line', 25, rnd)), `sweep as wiring, rule ${rule}`); }
  const A = wiring(25);
  assert.equal(A.slice(24 * 25).reduce((a, v) => a + v, 0), 25); assert.equal(A.slice(0, 25).reduce((a, v) => a + v, 0), 3);
}

// Reversible rules (Fig. 5.1): 30R run forward and then with the last two rows swapped comes back to where it started.
{
  const t30 = tableOf(30), rnd = makeRng(2);
  const a0 = rand(41, rnd), a1 = rand(41, rnd);
  let [p, c] = [a0, a1];
  for (let t = 0; t < 60; t++) [p, c] = [c, reversibleStep(p, c, t30)];
  [p, c] = [c, p];
  for (let t = 0; t < 60; t++) [p, c] = [c, reversibleStep(p, c, t30)];
  same(c, a0, 'back to the first row'); same(p, a1, 'and the second');
}

console.log('taxonomy ok');
