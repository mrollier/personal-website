// Self-check for src/scripts/centrality.ts. Run: npm test
import assert from 'node:assert/strict';
import { build, buildNet, makeRng, wattsStrogatz } from '../src/scripts/net.ts';
import { degree, avgNeighbourDegree, hIndex, eigenvector, betweenness, closeness, clustering, pathLength, smallWorldIndex, references, omegaSweep } from '../src/scripts/centrality.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// A path of five: betweenness 0 3 4 3 0, closeness 4/10 4/7 4/6 4/7 4/10, no triangles, ⟨l⟩ = 2.
const path = build('er', 5, [[0, 1], [1, 2], [2, 3], [3, 4]]);
assert.deepEqual(Array.from(betweenness(path)), [0, 3, 4, 3, 0]);
const c = closeness(path); near(c[0], 0.4); near(c[2], 4 / 6);
assert.equal(clustering(path).mean, 0); near(pathLength(path), 2);
assert.deepEqual(Array.from(degree(path)), [1, 2, 2, 2, 1]);
assert.deepEqual(Array.from(avgNeighbourDegree(path)), [2, 1.5, 2, 1.5, 2]);
// A star of six: the hub carries every path, everyone else none; the hub's h index is 1 (five neighbours of degree 1), a leaf's is 1.
const star = build('er', 6, [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
assert.deepEqual(Array.from(betweenness(star)), [10, 0, 0, 0, 0, 0]);
assert.deepEqual(Array.from(hIndex(star)), [1, 1, 1, 1, 1, 1]);
near(closeness(star)[0], 1); near(closeness(star)[1], 5 / 9);
// A triangle is fully clustered; the eigenvector of a complete graph is flat; a ring of degree 4 has C = ½.
const tri = build('er', 3, [[0, 1], [1, 2], [0, 2]]);
assert.equal(clustering(tri).mean, 1);
const k6 = build('er', 6, Array.from({ length: 15 }, (_, e) => { let k = 0; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (k++ === e) return [i, j] as [number, number]; return [0, 1] as [number, number]; }));
const x = eigenvector(k6); for (let i = 0; i < 6; i++) near(x[i], 1, 1e-8);
near(clustering(wattsStrogatz(50, 0, makeRng(1))).mean, 0.5);
// Eigenvector centrality ranks the hub first on a star and converges on the bipartite von Neumann grid.
assert.ok(eigenvector(star)[0] > eigenvector(star)[1]);
const grid = buildNet({ kind: 'lat', side: 6, degree: 4, p: 0 }, 1); const eg = eigenvector(grid); for (let i = 1; i < 36; i++) near(eg[i], eg[0], 1e-6);
// ω: below 0 on the lattice, above 0 once rewired, the reference values sensible.
const spec = { kind: 'ws' as const, n: 200, k: 8, p: 0 };
const ref = references(spec, 1); near(ref.cLatt, 0.6428571, 1e-3); assert.ok(ref.lRand > 2 && ref.lRand < 5, `lRand ${ref.lRand}`);
const latt = buildNet(spec, 1, 'none'), rand = buildNet({ ...spec, p: 1 }, 1, 'none');
assert.ok(smallWorldIndex(clustering(latt).mean, pathLength(latt), ref.cLatt, ref.lRand) < -0.5);
assert.ok(smallWorldIndex(clustering(rand).mean, pathLength(rand), ref.cLatt, ref.lRand) > 0.5);
// The sweep job runs to completion in node, monotone progress, small-world band somewhere in the middle.
let last = 0, n = 0, result: ReturnType<typeof omegaSweep> extends Generator<any, infer R> ? R : never = [];
const job = omegaSweep({ spec, ps: [0.001, 0.01, 0.05, 0.3, 1], seeds: 2, seed: 3 });
for (;;) { const r = job.next(); if (r.done) { result = r.value; break; } assert.ok(r.value.p > last); last = r.value.p; n++; }
assert.equal(n, 5); assert.equal(result.length, 5);
assert.ok(result[0].omega < 0 && result[4].omega > 0.5, result.map((r) => r.omega.toFixed(2)).join(' '));

console.log(`centrality ok · ω over p: ${result.map((r) => r.omega.toFixed(2)).join(' ')}`);
