// Self-check for src/scripts/sync.ts. Run: npm test
import assert from 'node:assert/strict';
import { buildNet, makeRng } from '../src/scripts/net.ts';
import { consensusTrial, taskTrial, entropyRun, successSweep } from '../src/scripts/sync.ts';

const fssp = { r: 9, B: 23, S: 47 }, cons = { r: 9, B: 488, S: 464 };
// The consensus rule freezes a rewired grid most of the time; the synchroniser never freezes (it flashes).
let ok = 0; const rnd = makeRng(3);
for (let i = 0; i < 10; i++) if (consensusTrial(buildNet({ kind: 'lat', side: 15, degree: 8, p: 0.3 }, 10 + i, 'none'), cons, 0.5, rnd, 100).ok) ok++;
assert.ok(ok >= 6, `consensus ${ok} of 10`);
let flash = 0; for (let i = 0; i < 5; i++) if (consensusTrial(buildNet({ kind: 'lat', side: 15, degree: 8, p: 0.3 }, 20 + i, 'none'), fssp, 0.5, rnd, 100).ok) flash++;
assert.equal(flash, 0);
// taskTrial routes to the right verdict; the entropy of a homogeneous end state is 0.
const net = buildNet({ kind: 'lat', side: 15, degree: 8, p: 0.3 }, 5, 'none');
let syncOk = 0; for (let i = 0; i < 10; i++) if (taskTrial('sync', buildNet({ kind: 'lat', side: 15, degree: 8, p: 0.3 }, 30 + i, 'none'), fssp, 0.5, rnd, 400).ok) syncOk++;
assert.ok(syncOk >= 6, `sync ${syncOk} of 10`);
const run = entropyRun(net, cons, 0.5, 1, 60); assert.equal(run.H.length, 61); assert.ok(run.H[0] > 0.99); assert.ok(run.H[60] < run.H[0]);
// The sweep job runs in node, progress monotone, one point per p, rates in [0, 1].
const job = successSweep({ spec: { kind: 'ws', n: 200, k: 8, p: 0 }, rule: fssp, task: 'sync', ps: [0.01, 0.3, 1], trials: 3, rho0: 0.5, seed: 1, limit: 300 });
let last = 0, n = 0, res: ReturnType<typeof successSweep> extends Generator<any, infer R> ? R : never = [];
for (;;) { const r = job.next(); if (r.done) { res = r.value; break; } assert.ok(r.value.p > last); last = r.value.p; n++; }
assert.equal(n, 9); assert.equal(res.length, 3); assert.ok(res.every((x) => x.rate >= 0 && x.rate <= 1 && x.trials === 3));

console.log(`sync ok · consensus ${ok}/10 · sync ${syncOk}/10 · sweep rates ${res.map((x) => x.rate.toFixed(2)).join(' ')}`);
