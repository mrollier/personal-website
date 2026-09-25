// The two global tasks of Ch. 6 as trials and as a worker job: synchronisation (every node flashing in
// step) and consensus (every node frozen in the same state), the Shannon entropy of the density that
// measures how far from consensus a configuration is, and the success rate of a rule over a range of
// rewiring probabilities. Pure, no DOM, safe in a worker.
import { type Rule, step, randomState, density, trial } from './llna.ts';
import { buildNet, makeRng, type NetSpec, type Net } from './net.ts';
import { binaryEntropy } from './stats.ts';

export type Task = 'sync' | 'consensus';

/** Consensus within `limit` ticks: homogeneous and unchanged one tick later. */
export function consensusTrial(net: Net, rule: Rule, rho0: number, rnd: () => number, limit: number): { ok: boolean; tick: number } {
  let a = randomState(net.n, rho0, rnd), b = new Uint8Array(net.n);
  for (let t = 0; t <= limit; t++) {
    const rho = density(a);
    if (rho === 0 || rho === 1) { const next = step(a, net, rule, b); return { ok: density(next) === rho, tick: t }; }
    step(a, net, rule, b); [a, b] = [b, a];
  }
  return { ok: false, tick: limit };
}

/** One trial of either task; the synchronisation verdict comes from llna.ts. */
export function taskTrial(task: Task, net: Net, rule: Rule, rho0: number, rnd: () => number, limit: number): { ok: boolean; tick: number } {
  if (task === 'sync') { const v = trial('fssp', net, rule, rho0, rnd, limit); return { ok: v.ok, tick: v.tick }; }
  return consensusTrial(net, rule, rho0, rnd, limit);
}

/** Density and entropy traces of one run, T ticks long. */
export function entropyRun(net: Net, rule: Rule, rho0: number, seed: number, T: number): { rho: Float64Array; H: Float64Array } {
  const rho = new Float64Array(T + 1), H = new Float64Array(T + 1);
  let a = randomState(net.n, rho0, makeRng(seed)), b = new Uint8Array(net.n);
  for (let t = 0; t <= T; t++) { rho[t] = density(a); H[t] = binaryEntropy(rho[t]); if (t < T) { step(a, net, rule, b); [a, b] = [b, a]; } }
  return { rho, H };
}

export type SweepPoint = { p: number; rate: number; trials: number };

/** Worker job: success rate of a rule on a Watts–Strogatz family over rewiring probabilities, fresh network per trial; yields after every trial. */
export function* successSweep(params: { spec: NetSpec & { kind: 'ws' | 'lat' }; rule: Rule; task: Task; ps: number[]; trials: number; rho0: number; seed: number; limit: number }): Generator<{ p: number; partial: SweepPoint[] }, SweepPoint[]> {
  const { spec, rule, task, ps, trials, rho0, seed, limit } = params, out: SweepPoint[] = [], rnd = makeRng(seed * 7919 + 1);
  for (let i = 0; i < ps.length; i++) {
    let ok = 0;
    for (let j = 0; j < trials; j++) {
      const net = buildNet({ ...spec, p: ps[i] }, seed + 1000 * (i + 1) + j, 'none');
      if (taskTrial(task, net, rule, rho0, rnd, limit).ok) ok++;
      const partial = out.concat([{ p: ps[i], rate: ok / (j + 1), trials: j + 1 }]);
      yield { p: (i * trials + j + 1) / (ps.length * trials), partial };
    }
    out.push({ p: ps[i], rate: ok / trials, trials });
  }
  return out;
}
