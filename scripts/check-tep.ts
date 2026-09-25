// Self-check for src/scripts/tep.ts and the jaggedness sampler in genotype.ts. Run: npm test
import assert from 'node:assert/strict';
import { buildNet, makeRng } from '../src/scripts/net.ts';
import { tep, onShare, nodeEntropy, flipRate } from '../src/scripts/tep.ts';
import { jaggedness, randomRuleWithJaggedness, partitionSize } from '../src/scripts/genotype.ts';

const net = buildNet({ kind: 'er', n: 100, k: 6 }, 1, 'none');
// The all-dead rule kills everything after tick 0; the identity keeps the start; entropies and flip rates follow.
const dead = tep(net, { r: 5, B: 0, S: 0 }, 0.5, 1, 20);
assert.equal(dead.s.length, 21 * 100); assert.ok(onShare(dead).every((v) => Math.abs(v - 1 / 21) < 1e-9 || v === 0));
const keep = tep(net, { r: 5, B: 0, S: 31 }, 0.5, 1, 20);
for (let i = 0; i < 100; i++) { assert.equal(onShare(keep)[i], keep.s[i]); assert.equal(nodeEntropy(keep)[i], 0); assert.equal(flipRate(keep)[i], 0); }
// The parity-like rule at r = 5 on this network never settles: most nodes flip often.
const busy = tep(net, { r: 5, B: 10, S: 21 }, 0.5, 2, 60);
assert.ok(flipRate(busy).filter((v) => v > 0.2).length > 50);
// The sampler hits the requested jaggedness every time, for every J, and never leaves the family.
const rnd = makeRng(9);
for (const r of [3, 5, 6, 9]) for (let J = 0; J <= 2 * (r - 1); J++) for (let k = 0; k < 20; k++) {
  const x = randomRuleWithJaggedness(r, J, rnd);
  assert.equal(jaggedness(x).J, J, `r ${r} J ${J}`); assert.ok(x.B < 1 << r && x.S < 1 << r);
}
// The thesis's examples: φ⁵₂₁,₄ and φ⁵₁₉,₄ have J 6 and 4; at r = 5 the partitions sum to 1024.
assert.equal(jaggedness({ r: 5, B: 21, S: 4 }).J, 6); assert.equal(jaggedness({ r: 5, B: 19, S: 4 }).J, 4);
let sum = 0; for (let J = 0; J <= 8; J++) sum += partitionSize(5, J); assert.equal(sum, 1024);

console.log('tep ok');
