// Self-check for src/scripts/llna.ts and the lattice family in src/scripts/net.ts. Run: npm test
import assert from 'node:assert/strict';
import { interval, phi, step, equivalent, selfEquivalent, meanField, hammingWeight, flipsTowardsHomogeneous, randomState, density, trial, binomial } from '../src/scripts/llna.ts';
import { makeNet, makeRng, lattice, latticeLink } from '../src/scripts/net.ts';

// Intervals, Eq. (2.2): r = 9, lower half [i/9, (i+1)/9[, middle [4/9, 5/9] closed, upper half ]i/9, (i+1)/9].
assert.equal(interval(0, 8, 9), 0);
assert.equal(interval(8, 8, 9), 8);
assert.equal(interval(4, 8, 9), 4);   // ρ = ½
assert.equal(interval(4, 9, 9), 4);   // ρ = 4/9, on the middle's lower edge: middle
assert.equal(interval(5, 9, 9), 4);   // ρ = 5/9, on the middle's upper edge: middle
assert.equal(interval(1, 9, 9), 1);   // ρ = 1/9 belongs to [1/9, 2/9[
assert.equal(interval(8, 9, 9), 7);   // ρ = 8/9 belongs to ]7/9, 8/9], the mirror image
assert.equal(interval(1, 3, 9), 3);   // ρ = 1/3 = 3/9 exactly: [3/9, 4/9[
assert.equal(interval(2, 3, 9), 5);   // ρ = 2/3 = 6/9 exactly: ]5/9, 6/9]
assert.equal(interval(0, 0, 9), 0);
for (let k = 1; k <= 30; k++) for (let q = 0; q <= k; q++) assert.equal(interval(q, k, 9), 8 - interval(k - q, k, 9), `mirror ${q}/${k}`);

// Life is φ^9_{8,12}: born with exactly 3 of 8, survive with 2 or 3 of 8.
const life = { r: 9, B: 8, S: 12 };
assert.equal(phi(0, 3, 8, life), 1); assert.equal(phi(0, 2, 8, life), 0);
assert.equal(phi(1, 2, 8, life), 1); assert.equal(phi(1, 3, 8, life), 1); assert.equal(phi(1, 4, 8, life), 0);
// A blinker on a torus flips between horizontal and vertical.
const torus = lattice(8, 8, 0, makeRng(1));
assert.equal(torus.edges.length, 8 * 8 * 4);
const at = (x: number, y: number) => y * 8 + x;
const s0 = new Uint8Array(64); s0[at(3, 3)] = s0[at(4, 3)] = s0[at(5, 3)] = 1;
const s1 = step(s0, torus, life), s2 = step(s1, torus, life);
assert.equal(density(s1) * 64, 3); assert.equal(s1[at(4, 2)] | s1[at(4, 3)] | s1[at(4, 4)], 1); assert.equal(s1[at(3, 3)], 0);
assert.deepEqual(Array.from(s2), Array.from(s0));
// A wrap-around link is a grid link; a rewired one is not.
assert.deepEqual(latticeLink(torus, at(0, 0), at(7, 0)), { grid: true, wraps: true });
assert.deepEqual(latticeLink(torus, at(0, 0), at(1, 1)), { grid: true, wraps: false });
assert.deepEqual(latticeLink(torus, at(0, 0), at(3, 3)), { grid: false, wraps: false });
const four = lattice(5, 4, 0, makeRng(1)); assert.equal(four.edges.length, 50); assert.ok(four.deg.every((d) => d === 4));

// Equivalence, Eq. (2.4): φ^5_{11,19} ↔ φ^5_{6,5}; φ^5_{6,19} is its own equivalent, as is the firing squad rule.
assert.deepEqual(equivalent({ r: 5, B: 11, S: 19 }), { r: 5, B: 6, S: 5 });
assert.deepEqual(equivalent(equivalent({ r: 5, B: 11, S: 19 })), { r: 5, B: 11, S: 19 });
assert.ok(selfEquivalent({ r: 5, B: 6, S: 19 }));
assert.ok(selfEquivalent({ r: 9, B: 23, S: 47 }));
assert.ok(!selfEquivalent(life));

// Mean field: at ½ it is the Hamming weight; Life's HW_8 = (8·1 + 8·(28 + 56)) / 512 ... check against the direct count.
let count = 0; for (let q = 0; q <= 8; q++) for (const s of [0, 1]) count += (binomial(8, q) * 2 ** 8) * phi(s, q, 8, life);
assert.ok(Math.abs(hammingWeight(life, 8) - count / 512) < 1e-12);
assert.ok(Math.abs(meanField(life, 8, 0)) < 1e-12 && Math.abs(meanField(life, 8, 1)) < 1e-12);
assert.ok(Math.abs(Array.from({ length: 9 }, (_, q) => binomial(8, q)).reduce((a, b) => a + b) - 1) < 1e-12);
// The firing squad rule meets the Sec. 5.2 criterion at degree 8; Life does not.
assert.ok(flipsTowardsHomogeneous({ r: 9, B: 23, S: 47 }, 8));
assert.ok(!flipsTowardsHomogeneous(life, 8));

// Initial configurations hit the density exactly.
assert.equal(density(randomState(400, 0.25, makeRng(3))) * 400, 100);

// The firing squad rule on the paper's small world (degree 8, rewiring 0.3) synchronises most of the time.
const rnd = makeRng(7); let ok = 0;
for (let i = 0; i < 10; i++) { const net = makeNet('lat', 400, 0.3, 100 + i); if (trial('fssp', net, { r: 9, B: 23, S: 47 }, 0.5, rnd).ok) ok++; }
assert.ok(ok >= 6, `firing squad solved ${ok} of 10`);
// Its complement steers to a frozen homogeneous state: the verdict is one of the majority outcomes, never "not at rest".
const maj = trial('majority', makeNet('lat', 400, 0.3, 5), { r: 9, B: 488, S: 464 }, 0.4, rnd);
assert.ok(maj.done && /settled|not homogeneous/.test(maj.text), maj.text);

console.log(`llna ok · firing squad solved ${ok} of 10 · majority: ${maj.text}`);
