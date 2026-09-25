// Impact analysis with consensus-seeking rules (Ch. 10 of the thesis): a tick with clamped nodes held,
// runs conditioned on reaching consensus, the observational swap curve (most central live node and
// least central dead node exchange states, again and again) and the interventional dynamical importance
// score η (clamp each node dead in turn and see whether the network still ends all-on). The two heavy
// ones are worker jobs. Pure, no DOM, safe in a worker.
import { type Rule, step, randomState, density } from './llna.ts';
import { buildNet, makeRng, type NetSpec, type Net } from './net.ts';
import { centrality, type Centrality } from './centrality.ts';

/** One tick where every node with clamp[i] ≥ 0 is held at that state. */
export function stepClamped(s: Uint8Array, net: Net, rule: Rule, clamp: Int8Array, out = new Uint8Array(net.n)): Uint8Array {
  step(s, net, rule, out);
  for (let i = 0; i < net.n; i++) if (clamp[i] >= 0) out[i] = clamp[i];
  return out;
}

export type Outcome = { rho: number; tick: number; consensus: boolean };

/** Run from s0 for up to T ticks, stopping once homogeneous and frozen. */
export function runFrom(net: Net, rule: Rule, s0: Uint8Array, T: number, clamp?: Int8Array): Outcome {
  let a = s0.slice(), b = new Uint8Array(net.n);
  for (let t = 0; t <= T; t++) {
    const rho = density(a);
    if (rho === 0 || rho === 1) {
      const next = clamp ? stepClamped(a, net, rule, clamp, b) : step(a, net, rule, b);
      if (density(next) === rho) return { rho, tick: t, consensus: true };
    }
    if (clamp) stepClamped(a, net, rule, clamp, b); else step(a, net, rule, b);
    [a, b] = [b, a];
  }
  return { rho: density(a), tick: T, consensus: false };
}

/** A consensus realisation: a random start at density ½ that ends all-on within T (all-off starts are complemented, which by
 * the rule's self-equivalence ends all-on too). Null after `tries` failures. */
export function consensusStart(net: Net, rule: Rule, T: number, rnd: () => number, tries = 8): Uint8Array | null {
  for (let i = 0; i < tries; i++) {
    const s0 = randomState(net.n, 0.5, rnd), o = runFrom(net, rule, s0, T);
    if (!o.consensus) continue;
    if (o.rho === 0) for (let j = 0; j < net.n; j++) s0[j] ^= 1;
    return s0;
  }
  return null;
}

/** Nodes from most to least central; `random` shuffles instead. */
export function ranking(net: Net, by: Centrality | 'random', rnd: () => number): Int32Array {
  const idx = Int32Array.from({ length: net.n }, (_, i) => i);
  if (by === 'random') { for (let i = net.n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; } return idx; }
  const c = centrality(by, net);
  return idx.sort((a, b) => c[b] - c[a] || a - b);
}

/** One swap in place: the highest-ranked live node and the lowest-ranked dead node exchange states. Null when there is no such pair. */
export function swapOnce(s: Uint8Array, order: Int32Array): [number, number] | null {
  let hi = -1, lo = -1;
  for (let k = 0; k < order.length; k++) if (s[order[k]] === 1) { hi = order[k]; break; }
  for (let k = order.length - 1; k >= 0; k--) if (s[order[k]] === 0) { lo = order[k]; break; }
  if (hi < 0 || lo < 0) return null;
  s[hi] = 0; s[lo] = 1;
  return [hi, lo];
}

export type SwapPoint = { m: number; flipped: number; realisations: number };

/** Worker job: 1 − ⟨ρᵀ⟩ after m swaps by one centrality (or at random), m = 0 … swaps, over consensus realisations on fresh
 * networks. Yields after every realisation with the running means. */
export function* swapCurve(params: { spec: NetSpec; rule: Rule; by: Centrality | 'random'; swaps: number; seeds: number; seed: number; T: number }): Generator<{ p: number; partial: SwapPoint[] }, SwapPoint[]> {
  const { spec, rule, by, swaps, seeds, seed, T } = params, sum = new Float64Array(swaps + 1);
  let done = 0;
  for (let r = 0; r < seeds; r++) {
    const net = buildNet(spec, seed + 100 * (r + 1), 'none'), rnd = makeRng(seed * 31 + r);
    const s0 = consensusStart(net, rule, T, rnd);
    if (s0) {
      const order = ranking(net, by, rnd), s = s0.slice();
      done++;
      sum[0] += 0; // no swaps: ends all-on by construction
      for (let m = 1; m <= swaps; m++) {
        if (swapOnce(s, order)) sum[m] += 1 - runFrom(net, rule, s, T).rho;
        else sum[m] += sum[m - 1] / Math.max(1, done); // nothing left to swap: carry the previous mean
      }
    }
    const partial: SwapPoint[] = Array.from({ length: swaps + 1 }, (_, m) => ({ m, flipped: done ? sum[m] / done : 0, realisations: done }));
    yield { p: (r + 1) / seeds, partial };
  }
  return Array.from({ length: swaps + 1 }, (_, m) => ({ m, flipped: done ? sum[m] / done : 0, realisations: done }));
}

export type EtaResult = { eta: Float64Array; flips: Float64Array; realisations: number };

/** Worker job: the dynamical importance score of every node, η_i = 1 − ⟨ρᵀ⟩ with node i clamped dead throughout, over consensus
 * realisations on one network; also the share of realisations that reverse completely. Yields after every node. */
export function* etaScan(params: { spec: NetSpec; rule: Rule; seeds: number; seed: number; T: number }): Generator<{ p: number; partial: EtaResult }, EtaResult> {
  const { spec, rule, seeds, seed, T } = params, net = buildNet(spec, seed, 'none'), n = net.n, rnd = makeRng(seed * 977 + 5);
  const starts: Uint8Array[] = [];
  for (let r = 0; r < seeds * 2 && starts.length < seeds; r++) { const s0 = consensusStart(net, rule, T, rnd); if (s0) starts.push(s0); }
  const eta = new Float64Array(n), flips = new Float64Array(n), clamp = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    clamp.fill(-1); clamp[i] = 0;
    let sum = 0, flip = 0;
    for (const s0 of starts) { const s = s0.slice(); s[i] = 0; const o = runFrom(net, rule, s, T, clamp); sum += 1 - o.rho; if (o.rho === 0) flip++; }
    eta[i] = starts.length ? sum / starts.length : 0; flips[i] = starts.length ? flip / starts.length : 0;
    if (i % 4 === 3 || i === n - 1) yield { p: (i + 1) / n, partial: { eta: eta.slice(), flips: flips.slice(), realisations: starts.length } };
  }
  return { eta, flips, realisations: starts.length };
}
