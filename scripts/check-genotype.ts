// Self-check for src/scripts/genotype.ts. Run: npm test
import assert from 'node:assert/strict';
import { hammingWeight, selfEquivalent, flipsTowardsHomogeneous, complement } from '../src/scripts/llna.ts';
import { sensitivity, bound, derrida, selfEquivalentRules, nonEquivalentRules, meetsCondition, candidates, jaggedness, partitionSize, scatter, slopeAtHalf } from '../src/scripts/genotype.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// HighLife's numbers from the thesis: HW_4 = 0.25, HW_12 = 0.37, BS_4 = 2.50, BS_12 = 4.10.
const highlife = { r: 9, B: 72, S: 12 };
near(hammingWeight(highlife, 4), 0.25, 5e-3); near(hammingWeight(highlife, 12), 0.37, 5e-3);
near(sensitivity(highlife, 4).BS, 2.5, 5e-3); near(sensitivity(highlife, 12).BS, 4.1, 5e-3);
// The parity rule saturates: BS_k = k + 1 and the bound at HW = ½, for k ≤ r − 1.
import { interval } from '../src/scripts/llna.ts';
for (const k of [2, 4, 8]) { // the self-inclusive parity rule for this degree: born on an odd count, survive on an even one
  let B = 0, S = 0; for (let q = 0; q <= k; q++) { if (q & 1) B |= 1 << interval(q, k, 9); else S |= 1 << interval(q, k, 9); }
  const parity = { r: 9, B, S }, s = sensitivity(parity, k); near(s.BS, k + 1); near(hammingWeight(parity, k), 0.5); near(bound(0.5, k), k + 1); // the bound is tight there
}
// BS = IS + NS, the bound holds for all 528, and the Derrida slope at the origin is BS.
const all5 = nonEquivalentRules(5); assert.equal(all5.length, 528);
for (const rule of all5) { const s = sensitivity(rule, 8), hw = hammingWeight(rule, 8); near(s.BS, s.IS + s.NS); assert.ok(s.BS <= bound(hw, 8) + 1e-9, `bound ${s.BS} ${hw}`); }
for (const rule of [highlife, { r: 5, B: 6, S: 11 }, { r: 9, B: 8, S: 12 }]) for (const k of [3, 8]) near((derrida(rule, k, 0.5, 1e-6) - derrida(rule, k, 0.5, 0)) / 1e-6, sensitivity(rule, k).BS, 5e-4);
near(derrida(highlife, 8, 0.5, 0), 0); assert.ok(derrida(highlife, 8, 0.5, 1) <= 1);
// Self-equivalent rules: 2^r of them, all their own equivalent; 27 synchroniser candidates at r = 9, k = 8, φ⁹₂₃,₄₇ amongst them.
const se9 = selfEquivalentRules(9); assert.equal(se9.length, 512); assert.ok(se9.every(selfEquivalent));
const sync = candidates(9, [8], 'sync'); assert.equal(sync.length, 27, `sync candidates ${sync.length}`);
assert.ok(sync.some((x) => x.B === 23 && x.S === 47));
for (const x of sync) assert.ok(flipsTowardsHomogeneous(x, 8));
// The consensus condition is the synchroniser condition of the complement: 27 as well at k = 8, union over 4 … 12 is 106, intersection 12.
const cons = candidates(9, [8], 'consensus'); assert.equal(cons.length, 27);
assert.ok(cons.some((x) => x.B === 488 && x.S === 464)); assert.ok(meetsCondition(complement({ r: 9, B: 23, S: 47 }), 8, 'consensus'));
const ks = [4, 5, 6, 7, 8, 9, 10, 11, 12];
assert.equal(candidates(9, ks, 'consensus', 'any').length, 106); assert.equal(candidates(9, ks, 'consensus', 'all').length, 12);
assert.ok(candidates(9, ks, 'consensus', 'all').some((x) => x.B === 192 && x.S === 505));
assert.equal(candidates(5, [8], 'consensus').length, 5); assert.equal(candidates(7, [8], 'consensus').length, 13);
// Jaggedness: φ⁵₂₁,₄ has J = 6, J̄ = 0.75; φ⁵₁₉,₄ has J = 4; partition sizes for r = 6 sum to 4096.
assert.deepEqual(jaggedness({ r: 5, B: 21, S: 4 }), { J: 6, Jbar: 0.75 }); assert.equal(jaggedness({ r: 5, B: 19, S: 4 }).J, 4);
let sum = 0; for (let J = 0; J <= 10; J++) sum += partitionSize(6, J); assert.equal(sum, 4096); assert.equal(partitionSize(6, 5), 1008);
// The scatter covers 528 rules with HW in [0, 1] and BS within the bound; the slope at ½ of the firing squad rule is negative.
const sc = scatter(5, 3); assert.equal(sc.length, 528); assert.ok(sc.every((x) => x.hw >= 0 && x.hw <= 1 && x.bs <= bound(x.hw, 3) + 1e-9));
assert.ok(slopeAtHalf({ r: 9, B: 23, S: 47 }, 8) < -1);

console.log(`genotype ok · sync candidates ${sync.length} · consensus union ${candidates(9, ks, 'consensus', 'any').length}`);
