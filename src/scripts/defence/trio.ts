// The three networks of the talk from slide F3 on (Networks.astro F3, WhichNetwork.astro G2, the closing answer for
// Ch. 9): a random network, a small-world network grown from a ring, and a scale-free network on the way to a star,
// 150 nodes each. They differ in how their degrees spread, which is what a Life-like rule reads: the random one has
// nodes with two to thirteen neighbours, the ring nearly eight each, the scale-free one four for more than half of its
// nodes and one hub with 106 (the next ones about fifty). Every node is drawn the same size: the hubs show by their links. Seeds chosen so that every network is connected, the good detective of G2 (φ⁹₁₇₀,₄₈) stays lively on all
// three and the consensus-seeking winner of Ch. 6 brings all three to all-off from the same starts (scripts/check-defence.ts).
import { buildNet, makeRng, type Layout, type Net, type NetSpec } from '../net.ts';
import { randomState } from '../llna.ts';

export const TRIO: { id: string; name: string; spec: NetSpec; seed: number; start: number; layout: Layout }[] = [
  { id: 'random', name: 'random', spec: { kind: 'er', n: 150, k: 6 }, seed: 21, start: 10021, layout: 'force' },
  { id: 'ring', name: 'small-world ring', spec: { kind: 'ws', n: 150, k: 8, p: 0.1 }, seed: 47, start: 9030, layout: 'ring' },
  { id: 'star', name: 'scale-free', spec: { kind: 'npa', n: 150, m: 4, alpha: 1.8 }, seed: 41, start: 9035, layout: 'force' },
];
/** Slide G5's phones: a small scale-free contact network nobody holds (one hub of 34 links), on which Miranda et al.'s
 * rule keeps nearly half of the phones switching every timestep (scripts/check-defence.ts); half of them on at the start. */
export const PHONES: { spec: NetSpec; seed: number; start: number } = { spec: { kind: 'npa', n: 48, m: 3, alpha: 1.5 }, seed: 2, start: 48 };
/** The share of nodes on in a start. */
export const RHO0 = 0.3;

/** Network k, laid out for drawing (`none` skips the layout; the links are the same). */
export const trioNet = (k: number, lay: Layout = TRIO[k].layout): Net => buildNet(TRIO[k].spec, TRIO[k].seed, lay);
/** The fixed start of network k. */
export const trioStart = (k: number, n: number): Uint8Array => randomState(n, RHO0, makeRng(TRIO[k].start));
