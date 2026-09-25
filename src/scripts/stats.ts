// Small numerical helpers shared by the thesis figures: means and medians, histograms, Pearson and
// Spearman correlation, log-spaced grids, the binary entropy. Pure, no DOM, safe in a worker.

export function mean(x: ArrayLike<number>): number {
  let s = 0; for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : NaN;
}

export function median(x: ArrayLike<number>): number {
  const a = Float64Array.from(x as ArrayLike<number>).sort(), n = a.length;
  return n ? (n & 1 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN;
}

export type Histogram = { counts: Uint32Array; lo: number; hi: number; width: number };

/** Counts in `bins` equal-width bins over [lo, hi]; values outside land in the end bins. */
export function histogram(x: ArrayLike<number>, bins: number, lo?: number, hi?: number): Histogram {
  let a = Infinity, b = -Infinity;
  for (let i = 0; i < x.length; i++) { if (x[i] < a) a = x[i]; if (x[i] > b) b = x[i]; }
  lo ??= a; hi ??= b; if (hi <= lo) hi = lo + 1;
  const width = (hi - lo) / bins, counts = new Uint32Array(bins);
  for (let i = 0; i < x.length; i++) counts[Math.min(bins - 1, Math.max(0, Math.floor((x[i] - lo) / width)))]++;
  return { counts, lo, hi, width };
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length), ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Ranks from 1, ties given their average rank. */
export function ranks(x: ArrayLike<number>): Float64Array {
  const n = x.length, idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => x[i] - x[j]), r = new Float64Array(n);
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

export const spearman = (a: ArrayLike<number>, b: ArrayLike<number>) => pearson(ranks(a), ranks(b));

/** n values from lo to hi, equal ratios. */
export function logSpace(lo: number, hi: number, n: number): number[] {
  const a = Math.log(lo), b = Math.log(hi);
  return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)));
}

/** n values from lo to hi, equal steps. */
export const linSpace = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/** H = −[ρ log₂ ρ + (1 − ρ) log₂(1 − ρ)]: 1 bit at ½, 0 at 0 or 1. */
export function binaryEntropy(rho: number): number {
  if (rho <= 0 || rho >= 1) return 0;
  return -(rho * Math.log2(rho) + (1 - rho) * Math.log2(1 - rho));
}

/** Binomial coefficient as a float, exact for the small arguments used here. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k); let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}
