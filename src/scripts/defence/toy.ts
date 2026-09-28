// The toy version of Ch. 9's pipeline that slides G2–G3 show: three kinds of network, one rule run on each, and as
// fingerprint the histogram of the neighbourhood densities every node sees over the rounds after a short transient.
// The thesis used 23 datasets, degree-segmented density histograms with 40 bins and an SVM; this keeps the idea and
// shrinks the rest. Shared by scripts/defence/precompute.ts and the slides, so both compute the same thing. Pure.
import { makeRng, buildNet, type Net, type NetSpec } from '../net.ts';
import { type Rule, step, randomState } from '../llna.ts';

export const TOY = {
  types: [
    { id: 'er', name: 'random', spec: { kind: 'er', n: 200, k: 8 } as NetSpec },
    { id: 'ba', name: 'scale-free', spec: { kind: 'ba', n: 200, m: 4 } as NetSpec },
    { id: 'ws', name: 'small-world ring', spec: { kind: 'ws', n: 200, k: 8, p: 0.1 } as NetSpec },
  ],
  perType: 5, T: 100, burn: 10, bins: 20, r: 5,
};
export const netSeed = (type: number, j: number) => 500 + 10 * type + j;
export const startSeed = (type: number, j: number) => 3000 + 10 * type + j;
export const toyNet = (type: number, j: number): Net => buildNet(TOY.types[type].spec, netSeed(type, j), 'none');

/** The run as a node × time pattern, s[t · n + i], and its fingerprint: the normalised histogram of ρ_i^t, the share
 * of node i's contacts that are on at round t, over all nodes and rounds burn ≤ t < T. */
export function toyRun(net: Net, rule: Rule, seed: number, T = TOY.T, burn = TOY.burn, bins = TOY.bins): { s: Uint8Array; fp: number[] } {
  const n = net.n, s = new Uint8Array(T * n), h = new Array<number>(bins).fill(0);
  let a = randomState(n, 0.5, makeRng(seed)), b = new Uint8Array(n), total = 0;
  for (let t = 0; t < T; t++) {
    s.set(a, t * n);
    if (t >= burn) for (let i = 0; i < n; i++) {
      const d = net.deg[i]; if (!d) continue;
      let q = 0; for (const j of net.adj[i]) q += a[j];
      h[Math.min(bins - 1, Math.floor((q / d) * bins))]++; total++;
    }
    step(a, net, rule, b); [a, b] = [b, a];
  }
  return { s, fp: h.map((x) => x / total) };
}

const l1 = (x: number[], y: number[]) => x.reduce((acc, v, i) => acc + Math.abs(v - y[i]), 0);
const centroid = (fs: number[][]) => fs[0].map((_, k) => fs.reduce((acc, f) => acc + f[k], 0) / fs.length);

/** Leave-one-out nearest-centroid accuracy with the L1 distance (ties to the lower class), and the ratio of the mean
 * distance between class centroids to the mean distance of a fingerprint to its own centroid. */
export function separability(fps: number[][], cls: number[]): { acc: number; ratio: number } {
  const C = Math.max(...cls) + 1;
  let hit = 0;
  for (let i = 0; i < fps.length; i++) {
    let best = -1, bd = Infinity;
    for (let c = 0; c < C; c++) {
      const d = l1(fps[i], centroid(fps.filter((_, j) => j !== i && cls[j] === c)));
      if (d < bd - 1e-12) { bd = d; best = c; }
    }
    if (best === cls[i]) hit++;
  }
  const cents = Array.from({ length: C }, (_, c) => centroid(fps.filter((_, j) => cls[j] === c)));
  let between = 0, pairs = 0;
  for (let a = 0; a < C; a++) for (let b = a + 1; b < C; b++) { between += l1(cents[a], cents[b]); pairs++; }
  const within = fps.reduce((acc, f, i) => acc + l1(f, cents[cls[i]]), 0) / fps.length;
  return { acc: hit / fps.length, ratio: between / pairs / Math.max(within, 1e-9) };
}
