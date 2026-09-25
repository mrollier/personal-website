// Self-check for src/scripts/consensus.ts. Run: npm test
import assert from 'node:assert/strict';
import { buildNet, makeRng } from '../src/scripts/net.ts';
import { density } from '../src/scripts/llna.ts';
import { stepClamped, runFrom, consensusStart, ranking, swapOnce, swapCurve, etaScan } from '../src/scripts/consensus.ts';

const rule = { r: 9, B: 464, S: 488 }, spec = { kind: 'npa' as const, n: 150, m: 4, alpha: 1 };
const net = buildNet(spec, 1, 'none'), rnd = makeRng(2);
// A clamped node keeps its state whatever the rule says; without clamps the step is the plain step.
const clamp = new Int8Array(net.n).fill(-1); clamp[0] = 0; clamp[1] = 1;
const s = new Uint8Array(net.n).fill(1), out = stepClamped(s, net, rule, clamp);
assert.equal(out[0], 0); assert.equal(out[1], 1);
// Consensus starts exist for this rule on this network and end all-on; the plain run confirms it.
const s0 = consensusStart(net, rule, 100, rnd); assert.ok(s0, 'no consensus start found');
assert.ok(Math.abs(density(s0!) - 0.5) < 0.01);
const o = runFrom(net, rule, s0!, 100); assert.ok(o.consensus && o.rho === 1, `ended ${o.rho} at ${o.tick}`);
// Ranking by degree puts the hub first; a swap moves one live node off and one dead node on, keeping the density.
const order = ranking(net, 'deg', rnd); assert.equal(order[0], net.order[0]);
const sw = s0!.slice(), pair = swapOnce(sw, order); assert.ok(pair); assert.equal(density(sw), density(s0!));
assert.equal(sw[pair![0]], 0); assert.equal(sw[pair![1]], 1);
// The swap curve runs in node: targeted swaps flip more than random ones by the tenth swap.
const run = (by: 'deg' | 'random') => { const job = swapCurve({ spec, rule, by, swaps: 10, seeds: 6, seed: 3, T: 100 }); for (;;) { const r = job.next(); if (r.done) return r.value; } };
const deg = run('deg'), rnd10 = run('random');
assert.equal(deg.length, 11); assert.equal(deg[0].flipped, 0); assert.ok(deg[0].realisations >= 4, `realisations ${deg[0].realisations}`);
assert.ok(deg[10].flipped > rnd10[10].flipped, `deg ${deg[10].flipped.toFixed(2)} vs random ${rnd10[10].flipped.toFixed(2)}`);
// The η scan gives one score per node in [0, 1] and yields progress; the hub of a preferential-attachment network scores above the median.
const job = etaScan({ spec: { kind: 'npa', n: 80, m: 3, alpha: 1 }, rule, seeds: 6, seed: 4, T: 100 });
let last = 0, res: { eta: Float64Array; flips: Float64Array; realisations: number } | null = null;
for (;;) { const r = job.next(); if (r.done) { res = r.value; break; } assert.ok(r.value.p > last); last = r.value.p; }
assert.equal(res!.eta.length, 80); assert.ok(Array.from(res!.eta).every((v) => v >= 0 && v <= 1));
const small = buildNet({ kind: 'npa', n: 80, m: 3, alpha: 1 }, 4, 'none'), sorted = Array.from(res!.eta).sort((a, b) => a - b);
assert.ok(res!.eta[small.order[0]] >= sorted[40], `hub η ${res!.eta[small.order[0]].toFixed(2)} vs median ${sorted[40].toFixed(2)}`);

console.log(`consensus ok · deg swaps flip ${deg[10].flipped.toFixed(2)} vs random ${rnd10[10].flipped.toFixed(2)} · hub η ${res!.eta[small.order[0]].toFixed(2)}`);
