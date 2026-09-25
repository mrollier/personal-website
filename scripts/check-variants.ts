// Self-check for src/scripts/variants.ts and wolfram.ts. Run: npm test
import assert from 'node:assert/strict';
import { step, seedRow } from '../src/scripts/eca.ts';
import { tableOf, ruleOf, mirrorRule, complementRule, equivalents, lambda, totalisticTable, totalisticCode } from '../src/scripts/wolfram.ts';
import { defaults, stepVariant, extend, allocate, nonUniformity, IDENTITY } from '../src/scripts/variants.ts';
import { makeRng } from '../src/scripts/net.ts';

// Tables round-trip, at both radii; the 32-bit rule survives as a float.
for (const n of [0, 30, 90, 110, 255]) assert.equal(ruleOf(tableOf(n)), n);
assert.equal(ruleOf(tableOf(4294967295, 2)), 4294967295); assert.equal(tableOf(2 ** 31, 2)[31], 1);
// The symmetries: 110 ↔ 124 in the mirror, 110 ↔ 137 in the complement, 90 and 150 are their own mirror and complement... 150 is; 90's complement is 165.
assert.equal(mirrorRule(110), 124); assert.equal(complementRule(110), 137); assert.equal(mirrorRule(mirrorRule(110)), 110);
assert.equal(mirrorRule(90), 90); assert.equal(complementRule(150), 150); assert.equal(complementRule(90), 165);
assert.equal(equivalents(124).rep, 110); assert.equal(equivalents(193).rep, 110);
// 88 classes in all.
assert.equal(new Set(Array.from({ length: 256 }, (_, n) => equivalents(n).rep)).size, 88);
// λ: rule 0 maps everything to 0, rule 255 nothing, rule 90 half.
assert.equal(lambda(tableOf(0)), 0); assert.equal(lambda(tableOf(255)), 1); assert.equal(lambda(tableOf(90)), 0.5);
// Totalistic codes: seven totals at radius 1, base 3.
assert.equal(totalisticTable(0).length, 7); assert.equal(totalisticCode(totalisticTable(777)), 777); assert.equal(totalisticTable(5)[0], 2);

// With every knob off, the variant step is the elementary step, for all 256 rules on a random ring.
const rnd = makeRng(5), row = seedRow(64, 'random', rnd);
for (let n = 0; n < 256; n++) {
  const cfg = defaults(tableOf(n), tableOf(IDENTITY));
  assert.deepEqual(Array.from(stepVariant(row, cfg, rnd)), Array.from(step(row, n)), `rule ${n}`);
}
// Null boundary: the edge cells are never updated; rule 90 from one seed then draws Pascal's triangle mod 2 in the middle.
const nul = { ...defaults(tableOf(90), tableOf(IDENTITY)), boundary: 'null' as const };
assert.equal(extend(row, nul, rnd), null);
let r = seedRow(31, 'seed'); for (let t = 0; t < 4; t++) r = stepVariant(r, nul, rnd);
assert.deepEqual(Array.from(r.slice(11, 20)), [1, 0, 0, 0, 0, 0, 0, 0, 1]); // row 4 of Pascal mod 2: 1 0 0 0 1 spread over ±4
// Fixed boundary at 1 feeds ones in from the edges; adiabatic and reflexive copy from inside.
const one = new Uint8Array(5), fixed = { ...defaults(tableOf(204), tableOf(IDENTITY)), boundary: 'fixed' as const, fixed: 1 };
assert.deepEqual(Array.from(extend(one, fixed, rnd)!), [1, 0, 0, 0, 0, 0, 1]);
const edge = Uint8Array.from([1, 0, 1, 0, 0]);
assert.deepEqual(Array.from(extend(edge, { ...fixed, boundary: 'adiabatic' }, rnd)!), [1, 1, 0, 1, 0, 0, 0]);
assert.deepEqual(Array.from(extend(edge, { ...fixed, boundary: 'reflexive' }, rnd)!), [0, 1, 0, 1, 0, 0, 0]);
assert.deepEqual(Array.from(extend(edge, { ...fixed, boundary: 'periodic' }, rnd)!), [0, 1, 0, 1, 0, 0, 1]);
assert.deepEqual(Array.from(extend(edge, { ...fixed, boundary: 'intermediate', inter: 2 }, rnd)!), [1, 1, 0, 1, 0, 0, 1]);
const wide = extend(edge, { ...fixed, radius: 2, boundary: 'periodic' }, rnd)!; assert.deepEqual(Array.from(wide), [0, 0, 1, 0, 1, 0, 0, 1, 0]);
// Synchrony 0 freezes; a clamp holds one cell; a full allocation to ψ = identity also freezes; ψ drawn always (p = 0) is ψ.
const base = defaults(tableOf(30), tableOf(IDENTITY));
assert.deepEqual(Array.from(stepVariant(row, { ...base, alpha: 0 }, rnd)), Array.from(row));
assert.equal(stepVariant(row, { ...base, clamp: 7 }, rnd)[7], row[7]);
assert.deepEqual(Array.from(stepVariant(row, { ...base, mask: new Uint8Array(64).fill(1) }, rnd)), Array.from(row));
assert.deepEqual(Array.from(stepVariant(row, { ...base, psi: tableOf(90), p: 0 }, rnd)), Array.from(step(row, 90)));
// Allocation hits the share exactly.
const m = allocate(200, 0.3, rnd); assert.equal(nonUniformity(m), 0.3); assert.equal(m.length, 200);
// Three states: totalistic code 2186 (all twos) turns everything to 2; the sum of a radius-1 neighbourhood runs 0 … 6.
const three = { ...defaults(totalisticTable(2186), totalisticTable(0)), states: 3 as const };
assert.ok(stepVariant(row, three, rnd).every((v) => v === 2));

console.log('variants ok');
