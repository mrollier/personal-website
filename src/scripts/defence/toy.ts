// The toy version of Ch. 9's pipeline that slides G1–G3 show: three kinds of network, one rule run on each, and as
// fingerprints what the rows look like after a short transient: two of the features of Miranda et al. 2016 (Sci. Rep.
// 6:37329, Methods and supplement S2), the Shannon entropy and the Lempel–Ziv complexity of every node's row, and the
// neighbourhood densities the nodes see (what Ch. 9 used). The thesis used 23 datasets,
// degree-segmented density histograms with 40 bins and an SVM; this keeps the idea and shrinks the rest.
// Shared by scripts/defence/precompute.ts and the slides, so both compute the same thing. Pure.
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

/** Lempel–Ziv complexity as Miranda et al. (2016, S2) compute it: cut the sequence into blocks, each the shortest stretch
 * from the end of the previous block that is not yet in the dictionary of earlier blocks (a leftover already in it does
 * not count), and return g · ln l / l for g blocks in l symbols. Their example: 0101…01 (l = 20) is
 * 0|1|01|010|10|101|0101, g = 7, 1.049. The dictionary is a binary trie, so a row costs one pass. */
export function lempelZiv(s: ArrayLike<number>): number {
  const l = s.length;
  if (l < 2) return 0;
  const child = new Int32Array(2 * (l + 1)); // node k's children at 2k, 2k + 1; 0 = none (the root is node 0)
  let node = 0, size = 1, g = 0;
  for (let i = 0; i < l; i++) {
    const at = 2 * node + (s[i] ? 1 : 0);
    if (child[at]) node = child[at];
    else { child[at] = size++; g++; node = 0; }
  }
  return (g * Math.log(l)) / l;
}

/** Shannon entropy in bits of a binary sequence, Miranda et al.'s (2016) μ_S of a node: −p log₂ p − (1 − p) log₂ (1 − p)
 * for a share p of 1s, so 0 for a node that stays on or stays off and 1 for one that is on half of the time. */
export function shannon(s: ArrayLike<number>): number {
  let on = 0;
  for (let t = 0; t < s.length; t++) on += s[t];
  const p = on / s.length;
  return p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/** Every node's feature over the rounds burn ≤ t < T of a run's pattern s[t · n + i]. */
export function perNode(s: Uint8Array, n: number, f: (row: Uint8Array) => number, burn = TOY.burn): number[] {
  const T = s.length / n, row = new Uint8Array(T - burn);
  return Array.from({ length: n }, (_, i) => { for (let t = burn; t < T; t++) row[t - burn] = s[t * n + i]; return f(row); });
}

/** A normalised histogram of `xs` over [lo, hi) in `bins` bins, the top edge folded into the last bin. */
export function histogram(xs: number[], lo: number, hi: number, bins: number): number[] {
  const h = new Array<number>(bins).fill(0);
  for (const x of xs) h[Math.max(0, Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins)))]++;
  return h.map((v) => v / xs.length);
}

/** The fingerprints of slides G1–G3: histograms over the nodes of their row's Shannon entropy (on [0, 1] in 20 bins, as
 * Miranda et al. 2016 bin it) and Lempel–Ziv complexity, and the density histogram of `toyRun` (what Ch. 9 used, there
 * split by degree). */
export const FEATURES = { entropy: { lo: 0, hi: 1, bins: 20 }, lz: { lo: 0.575, hi: 1.425, bins: 17 } }; // lz: one bin per block count, 0.6 to 1.4 at l = 90
export type Features = { s: Uint8Array; entropy: number[]; lz: number[]; density: number[] };
export function toyFeatures(net: Net, rule: Rule, seed: number): Features {
  const run = toyRun(net, rule, seed), { entropy, lz } = FEATURES;
  return {
    s: run.s, density: run.fp,
    entropy: histogram(perNode(run.s, net.n, shannon), entropy.lo, entropy.hi, entropy.bins),
    lz: histogram(perNode(run.s, net.n, lempelZiv), lz.lo, lz.hi, lz.bins),
  };
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
