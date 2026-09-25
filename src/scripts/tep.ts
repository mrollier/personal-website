// Time evolution patterns (Ch. 9 of the thesis): a rule run on a network for T ticks, stored node by
// node so it can be drawn as a node × time raster, and the fingerprint the classification pipeline
// starts from, here the distribution over nodes of how often each node was on. Pure, no DOM.
import { type Rule, step, randomState } from './llna.ts';
import { makeRng, type Net } from './net.ts';
import { binaryEntropy } from './stats.ts';

export type Tep = { N: number; T: number; s: Uint8Array; order: Int32Array }; // s[t * N + i]; order: nodes by degree, most first

export function tep(net: Net, rule: Rule, rho0: number, seed: number, T: number): Tep {
  const N = net.n, s = new Uint8Array((T + 1) * N);
  let a = randomState(N, rho0, makeRng(seed)), b = new Uint8Array(N);
  for (let t = 0; t <= T; t++) { s.set(a, t * N); if (t < T) { step(a, net, rule, b); [a, b] = [b, a]; } }
  return { N, T, s, order: Int32Array.from(net.order) };
}

/** Share of ticks each node was on, the transient included. */
export function onShare(p: Tep): Float64Array {
  const out = new Float64Array(p.N);
  for (let t = 0; t <= p.T; t++) for (let i = 0; i < p.N; i++) out[i] += p.s[t * p.N + i];
  for (let i = 0; i < p.N; i++) out[i] /= p.T + 1;
  return out;
}

/** Binary entropy of each node's time series, Miranda's first fingerprint: 0 for a node that is stuck, 1 for one that is on half the time. */
export function nodeEntropy(p: Tep): Float64Array {
  const share = onShare(p), out = new Float64Array(p.N);
  for (let i = 0; i < p.N; i++) out[i] = binaryEntropy(share[i]);
  return out;
}

/** How often each node changed state, per tick. */
export function flipRate(p: Tep): Float64Array {
  const out = new Float64Array(p.N);
  for (let t = 1; t <= p.T; t++) for (let i = 0; i < p.N; i++) out[i] += p.s[t * p.N + i] ^ p.s[(t - 1) * p.N + i];
  for (let i = 0; i < p.N; i++) out[i] /= p.T;
  return out;
}
