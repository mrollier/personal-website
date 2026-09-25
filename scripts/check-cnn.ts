// Self-check for src/scripts/cnn.ts. Run: npm test
import assert from 'node:assert/strict';
import { step, seedRow } from '../src/scripts/eca.ts';
import { detectors, preActivation, channels, cnnStep, nucaStep, paramCount } from '../src/scripts/cnn.ts';
import { defaults, stepVariant, allocate, IDENTITY } from '../src/scripts/variants.ts';
import { tableOf } from '../src/scripts/wolfram.ts';
import { makeRng } from '../src/scripts/net.ts';

// The table of the thesis for rule 54: channel 5 detects 101 with weights (1, −ω, 1) and bias −1.
const det = detectors(2); assert.deepEqual(det[5].pattern, [1, 0, 1]); assert.deepEqual(det[5].weights, [1, -2, 1]); assert.equal(det[5].bias, -1);
assert.equal(det[0].bias, 1); assert.equal(det[7].bias, -2); assert.deepEqual(det[7].weights, [1, 1, 1]);
// The channels are one-hot for any ω ≥ 1, and the pre-activation of the matching channel is exactly 1.
const rnd = makeRng(4), row = seedRow(64, 'random', rnd);
for (const omega of [1, 1.5, 3]) {
  const ch = channels(row, omega), pre = preActivation(row, omega);
  for (let x = 0; x < 64; x++) {
    let ones = 0, which = -1; for (let i = 0; i < 8; i++) if (ch[i][x] === 1) { ones++; which = i; } else assert.equal(ch[i][x], 0);
    assert.equal(ones, 1); assert.equal(which, (row[(x + 63) % 64] << 2) | (row[x] << 1) | row[(x + 1) % 64]); assert.equal(pre[which][x], 1);
  }
}
// The two layers reproduce every Wolfram rule, at several ω.
for (let n = 0; n < 256; n++) for (const omega of [1, 2]) assert.deepEqual(Array.from(cnnStep(row, n, omega)), Array.from(step(row, n)), `rule ${n}`);
// Non-uniform: matches the variants engine with a two-rule mask, and with four rules each cell gets its own.
const mask = allocate(64, 0.4, rnd);
assert.deepEqual(Array.from(nucaStep(row, [30, 90], mask)), Array.from(stepVariant(row, { ...defaults(tableOf(30), tableOf(90)), mask }, rnd)));
const alloc = new Uint8Array(64).map((_, i) => i % 4), four = nucaStep(row, [30, 90, 110, 184], alloc);
for (let x = 0; x < 64; x++) assert.equal(four[x], step(row, [30, 90, 110, 184][x % 4])[x]);
// The parameter counts of the thesis: 352 locally connected and 8288 dense for N = 32, N_R = 8; 40 for a single rule with nothing to select.
assert.equal(paramCount(32, 8, 'local'), 352); assert.equal(paramCount(32, 8, 'dense'), 8288); assert.equal(4 * 8 + 8 * 1, 40);
assert.equal(IDENTITY, 204);

console.log('cnn ok');
