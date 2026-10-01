// The networks of the classification chapter (Rollier, Daly and Baetens, Advances in Cellular Automata 2, 2025), on a
// spacetime diagram stored as a Float32Array of T rows of W cells, time down: the hand-set network that reads the rule
// off the diagram (Sec. 8.3.1), the forward pass of the trimmed network of Fig. 8.9 with weights from
// scripts/train-lp-cnn.py, the four augmentations, and the chance that a random row already shows every neighbourhood.
// Pure, no DOM.
import { parse, mix, type RGB } from './palette.ts';

export const CLASSES = ['null', 'fixed point', 'periodic', 'locally chaotic', 'chaotic'] as const;

/** One colour per class from the site's tokens, the same as the .lp0 … .lp4 classes of global.css: grey, blue, yellow,
 * red, ink. */
export const classColours = (t: { bg: string; muted: string; accent: string; sun: string; danger: string; ink: string }): RGB[] =>
  [mix(parse(t.bg), parse(t.muted), 0.45), parse(t.accent), parse(t.sun), parse(t.danger), parse(t.ink)];

/** Dark or light text, whichever reads on that colour. */
export const textOn = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 140 ? '#17191c' : '#fafaf7');

/** The chapter's confusion matrix (Fig. 8.11): test diagrams by actual class (rows) and predicted class (columns). */
export const PAPER_CONFUSION = [
  [3018, 53, 0, 0, 1],
  [56, 12287, 62, 10, 1],
  [0, 219, 11149, 20, 4],
  [0, 39, 49, 1188, 4],
  [0, 0, 18, 64, 4526],
];

/** Validation accuracies of Tab. 8.3: rule (256), independent rule (88) and class (5), per augmentation. */
export const PAPER_AUGMENT = [
  { name: 'none', rule: 71.19, indep: 80.58, cls: 99.1 },
  { name: 'inverted', rule: 28.33, indep: 81.73, cls: 98.31 },
  { name: 'mirrored', rule: 48.85, indep: 78.81, cls: 98.66 },
  { name: 'coarse-grained 2 × 2', rule: 15.75, indep: 65.35, cls: 97.83 },
  { name: 'salt and pepper, 1%', rule: 66.54, indep: 75.52, cls: 97.18 },
  { name: 'all four', rule: 28.25, indep: 56.17, cls: 95.42 },
];

export const image = (rows: Uint8Array[]) => { const W = rows[0].length, x = new Float32Array(rows.length * W); rows.forEach((r, t) => x.set(r, t * W)); return x; };

export type Augment = 'invert' | 'mirror' | 'coarse' | 'noise';

/** Colours swapped; left and right swapped; every 2 × 2 block replaced by its mean (grey values, as in the chapter);
 * or a share of cells set to 0 or 1 at random, half each, which flips about half of them. */
export function augment(x: Float32Array, W: number, op: Augment, rnd: () => number = Math.random, noise = 0.05): Float32Array {
  const T = x.length / W, y = new Float32Array(x.length);
  if (op === 'invert') for (let i = 0; i < x.length; i++) y[i] = 1 - x[i];
  else if (op === 'mirror') for (let t = 0; t < T; t++) for (let j = 0; j < W; j++) y[t * W + j] = x[t * W + W - 1 - j];
  else if (op === 'noise') for (let i = 0; i < x.length; i++) { const u = rnd(); y[i] = u < noise / 2 ? 0 : u < noise ? 1 : x[i]; }
  else for (let t = 0; t < T; t += 2) for (let j = 0; j < W; j += 2) {
    const i = t * W + j, m = (x[i] + x[i + 1] + x[i + W] + x[i + W + 1]) / 4;
    y[i] = y[i + 1] = y[i + W] = y[i + W + 1] = m;
  }
  return y;
}

// ---------------------------------------------------------------- the hand-set network that reads the rule (Sec. 8.3.1)

const pop = (n: number) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1) + ((n >> 4) & 1) + ((n >> 5) & 1) + ((n >> 6) & 1) + ((n >> 7) & 1);

/** Detector for neighbourhood n followed by a 1: a 3 × 2 kernel, +1 over the cells of n that are 1 and −1 over those
 * that are 0, +1 under the middle, bias minus the number of 1s in n. After the ReLU it is 1 exactly where that
 * T-tetromino sits and 0 elsewhere. */
export function detector(n: number): { top: [number, number, number]; below: number; bias: number } {
  return { top: [(n >> 2) & 1 ? 1 : -1, (n >> 1) & 1 ? 1 : -1, n & 1 ? 1 : -1], below: 1, bias: -pop(n) };
}

/** Channel n over rows 0 … T − 2, wrapped round the ring as the automaton is. */
export function channel(x: Float32Array, W: number, n: number): Float32Array {
  const T = x.length / W, d = detector(n), y = new Float32Array((T - 1) * W);
  for (let t = 0; t < T - 1; t++) for (let j = 0; j < W; j++) {
    const r = t * W, s = d.top[0] * x[r + (j + W - 1) % W] + d.top[1] * x[r + j] + d.top[2] * x[r + (j + 1) % W] + x[r + W + j] + d.bias;
    y[t * W + j] = s > 0 ? s : 0;
  }
  return y;
}

/** The global maximum of each of the eight channels, then the 256-node layer with weights 2·bit − 1 and bias
 * 1 − popcount: node i scores 1 minus its Hamming distance to the octuple, so the read rule is the octuple itself. */
export function readRule(x: Float32Array, W: number): { maxima: number[]; scores: Float64Array; rule: number } {
  const maxima = Array.from({ length: 8 }, (_, n) => channel(x, W, n).reduce((a, b) => (b > a ? b : a), 0));
  const scores = new Float64Array(256);
  let rule = 0;
  for (let i = 0; i < 256; i++) {
    let s = 1 - pop(i);
    for (let j = 0; j < 8; j++) s += (((i >> j) & 1) * 2 - 1) * maxima[j];
    scores[i] = s;
    if (s > scores[rule]) rule = i;
  }
  return { maxima, scores, rule };
}

/** 8 detectors of 6 weights and a bias, and 256 nodes of 8 weights and a bias. */
export const HANDSET_PARAMS = 8 * 7 + 256 * 9;

// ---------------------------------------------------------------- the trimmed network (Fig. 8.9)

export type Layer = { w: number[]; b: number[] };
export type Weights = { conv: Layer[]; dense: (Layer & { out: number })[] };

export const paramCount = (net: Weights) => [...net.conv, ...net.dense].reduce((s, l) => s + l.w.length + l.b.length, 0);

/** A valid 2 × 2 convolution and a ReLU; kernels stored as [out][in][row][col]. */
function conv(x: Float32Array, cin: number, H: number, W: number, l: Layer): Float32Array {
  const cout = l.b.length, h = H - 1, w = W - 1, y = new Float32Array(cout * h * w), k = l.w;
  for (let o = 0; o < cout; o++) for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    let s = l.b[o];
    for (let c = 0; c < cin; c++) { const q = (o * cin + c) * 4, p = (c * H + i) * W + j; s += k[q] * x[p] + k[q + 1] * x[p + 1] + k[q + 2] * x[p + W] + k[q + 3] * x[p + W + 1]; }
    y[(o * h + i) * w + j] = s > 0 ? s : 0;
  }
  return y;
}

function pool(x: Float32Array, c: number, H: number, W: number): Float32Array {
  const h = H >> 1, w = W >> 1, y = new Float32Array(c * h * w);
  for (let o = 0; o < c; o++) for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    const p = (o * H + 2 * i) * W + 2 * j;
    y[(o * h + i) * w + j] = Math.max(x[p], x[p + 1], x[p + W], x[p + W + 1]);
  }
  return y;
}

/** The trimmed network on a diagram: class (or rule) probabilities, the four channels of the last convolution, and
 * where each channel peaks. A unit (i, j) of that last layer sees the 8 × 8 block of input rows 2i … 2i + 7 and
 * columns 2j … 2j + 7. */
export function classify(net: Weights, x: Float32Array, W: number) {
  const T = x.length / W, C = 4;
  let y = conv(x, 1, T, W, net.conv[0]);
  y = conv(y, C, T - 1, W - 1, net.conv[1]);
  y = pool(y, C, T - 2, W - 2);
  const h = (T - 2) >> 1, w = (W - 2) >> 1;
  y = conv(y, C, h, w, net.conv[2]);
  const last = conv(y, C, h - 1, w - 1, net.conv[3]), side = h - 2, area = side * (w - 2);
  const peaks = Array.from({ length: C }, (_, o) => { let best = 0; for (let p = 1; p < area; p++) if (last[o * area + p] > last[o * area + best]) best = p; return { value: last[o * area + best], i: Math.floor(best / (w - 2)), j: best % (w - 2) }; });
  let v = peaks.map((p) => p.value);
  for (const l of net.dense) { const n = v.length; v = Array.from({ length: l.out }, (_, o) => { let s = l.b[o]; for (let i = 0; i < n; i++) s += l.w[o * n + i] * v[i]; return s; }); }
  const m = Math.max(...v), e = v.map((z) => Math.exp(z - m)), sum = e.reduce((a, b) => a + b, 0);
  return { probs: e.map((z) => z / sum), last, side, peaks };
}

// ---------------------------------------------------------------- does one row already show every neighbourhood?

/** The probability that a random row of n fair coins shows all eight neighbourhoods, round a ring of n cells or along
 * a line of n − 2 windows: inclusion–exclusion over the neighbourhoods left out, each count the trace (ring) or the sum
 * (line) of a power of the de Bruijn graph with those edges removed. */
export function allNeighbourhoods(n: number, ring = true): number {
  let total = 0;
  for (let mask = 0; mask < 256; mask++) {
    const A = Array.from({ length: 4 }, () => new Float64Array(4));
    for (let t = 0; t < 8; t++) if (!((mask >> t) & 1)) A[t >> 1][t & 3] = 1;
    let R = Array.from({ length: 4 }, (_, i) => Float64Array.from({ length: 4 }, (_, j) => (i === j ? 1 : 0))), P = A, k = ring ? n : n - 2;
    const mul = (X: Float64Array[], Y: Float64Array[]) => X.map((r) => Float64Array.from({ length: 4 }, (_, j) => r[0] * Y[0][j] + r[1] * Y[1][j] + r[2] * Y[2][j] + r[3] * Y[3][j]));
    while (k) { if (k & 1) R = mul(R, P); P = mul(P, P); k >>= 1; }
    const count = ring ? R[0][0] + R[1][1] + R[2][2] + R[3][3] : R.reduce((s, r) => s + r[0] + r[1] + r[2] + r[3], 0);
    total += (pop(mask) & 1 ? -1 : 1) * count / 2 ** n;
  }
  return total;
}
