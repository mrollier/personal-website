// Self-check for the network families in src/scripts/net.ts. Run: npm test
import assert from 'node:assert/strict';
import { wattsStrogatz, lattice, latticeLink, nonlinearPA, randomGeometric, buildNet, ringLayout, makeRng, type Net } from '../src/scripts/net.ts';

const simple = (net: Net) => { // no self-loops, no doubled links, adjacency symmetric
  const seen = new Set<number>();
  for (const [i, j] of net.edges) { assert.ok(i < j, `ordered ${i} ${j}`); const k = i * net.n + j; assert.ok(!seen.has(k), `doubled ${i} ${j}`); seen.add(k); }
  for (let i = 0; i < net.n; i++) for (const j of net.adj[i]) assert.ok(net.adj[j].includes(i), `asymmetric ${i} ${j}`);
};

// A ring with k/2 neighbours a side; the default is still the four-neighbour ring of the parity figure.
const ws8 = wattsStrogatz(100, 0, makeRng(1), 8);
assert.equal(ws8.edges.length, 400); assert.ok(ws8.deg.every((d) => d === 8)); simple(ws8);
assert.equal(wattsStrogatz(100, 0, makeRng(1)).edges.length, 200);
const ws10 = wattsStrogatz(50, 0.5, makeRng(2), 10); assert.equal(ws10.edges.length, 250); simple(ws10);
// Moving both ends changes about 2p − p² of the links, moving one end about p; the one-end default is unchanged for the old page.
const lattice0 = new Set(wattsStrogatz(2000, 0, makeRng(3), 8).edges.map(([i, j]) => `${i},${j}`));
const changed = (net: { edges: [number, number][] }) => net.edges.filter(([i, j]) => !lattice0.has(`${i},${j}`)).length / net.edges.length;
const one = changed(wattsStrogatz(2000, 0.3, makeRng(4), 8)), both = changed(wattsStrogatz(2000, 0.3, makeRng(4), 8, true));
assert.ok(Math.abs(one - 0.3) < 0.03, `one end ${one}`); assert.ok(Math.abs(both - 0.51) < 0.04, `both ends ${both}`);
simple(wattsStrogatz(300, 0.5, makeRng(5), 6, true));
assert.deepEqual(wattsStrogatz(60, 0.2, makeRng(6)).edges, wattsStrogatz(60, 0.2, makeRng(6), 4, false).edges);

// The twelve-neighbour diamond: every cell at most two steps away along the grid lines.
const l12 = lattice(10, 12, 0, makeRng(1));
assert.equal(l12.edges.length, 600); assert.ok(l12.deg.every((d) => d === 12)); simple(l12); assert.equal(l12.range, 2);
const at = (x: number, y: number) => y * 10 + x;
assert.equal(latticeLink(l12, at(0, 0), at(2, 0)).grid, true);
assert.equal(latticeLink(l12, at(0, 0), at(1, 1)).grid, true);
assert.equal(latticeLink(l12, at(0, 0), at(0, 8)).grid, true); // wraps
assert.equal(latticeLink(l12, at(0, 0), at(2, 1)).grid, false);
const l8 = lattice(8, 8, 0, makeRng(1)); assert.equal(l8.range, 1); assert.equal(latticeLink(l8, at(0, 0), 2).grid, false);

// Nonlinear preferential attachment: m links per newcomer on a clique of m + 1; α = 3 hands nearly everything to one hub.
const npa0 = nonlinearPA(300, 4, 0, makeRng(2));
assert.equal(npa0.edges.length, 10 + 4 * 295); simple(npa0); assert.ok(Math.max(...npa0.deg) < 60, 'uniform attachment has no big hub');
const npa3 = nonlinearPA(300, 3, 3, makeRng(2));
assert.equal(npa3.edges.length, 6 + 3 * 296); simple(npa3); assert.ok(Math.max(...npa3.deg) > 150, `α = 3 hub has ${Math.max(...npa3.deg)} links`);
const npa1 = nonlinearPA(500, 4, 1, makeRng(3)); simple(npa1); assert.ok(Math.max(...npa1.deg) > 40 && Math.max(...npa1.deg) < 200);

// Random geometric: mean degree near the target, points kept as the layout.
const rgg = randomGeometric(400, 6, makeRng(3)); simple(rgg);
const mean = (2 * rgg.edges.length) / rgg.n; assert.ok(mean > 4 && mean < 8, `rgg mean degree ${mean.toFixed(2)}`);
assert.ok(Array.from(rgg.xy).every((v) => v >= 0.04 && v <= 0.96));

// Specs build reproducibly from a seed; the ring layout puts node 0 at three o'clock.
const a = buildNet({ kind: 'npa', n: 200, m: 3, alpha: 1.5 }, 11), b = buildNet({ kind: 'npa', n: 200, m: 3, alpha: 1.5 }, 11);
assert.deepEqual(a.edges, b.edges); assert.deepEqual(Array.from(a.xy), Array.from(b.xy));
const ring = buildNet({ kind: 'ws', n: 40, k: 6, p: 0.1 }, 1);
assert.ok(Math.abs(ring.xy[0] - 0.96) < 1e-6 && Math.abs(ring.xy[1] - 0.5) < 1e-6);
const lat = buildNet({ kind: 'lat', side: 6, degree: 4, p: 0 }, 1); assert.equal(lat.n, 36); assert.ok(lat.deg.every((d) => d === 4));
ringLayout(lat); assert.ok(Math.abs(lat.xy[0] - 0.96) < 1e-6);

console.log(`net ok · npa α=3 hub ${Math.max(...npa3.deg)} · rgg mean degree ${mean.toFixed(2)}`);
