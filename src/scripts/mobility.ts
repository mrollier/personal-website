// The analysis of Rollier, Miranda, Vergeynst et al., "Mobility and the spatial spread of SARS-CoV-2 in
// Belgium" (Math. Biosci. 2023), for the demo page: the connectivity index, a penalised B-spline fit of daily
// counts with a log link and quasi-Poisson variance with its parametric bootstrap (the paper's GAMM without
// the AR(1) residual term), binomial thinning of counts to a smaller population, time-lagged
// cross-correlation and dynamic time warping. Pure, no DOM.
import { cholesky, cholSolve } from './linalg.ts';
import { makeRng, gaussian } from './echoes.ts'; // the extensions so `npm test` can run this file in node

/** CI^{gh} = ln(M^{gh} + M^{hg}) for a row-major n × n flow matrix M: symmetric, absolute, logarithmic (Eq. 2). */
export const connectivity = (M: ArrayLike<number>, n: number, g: number, h: number) => Math.log(M[g * n + h] + M[h * n + g]);

/** Cubic B-splines on the days 0 … n−1, k of them on equally spaced knots (Eilers and Marx): row-major n × k. */
export function bsplines(n: number, k: number): Float64Array {
  const deg = 3, dx = (n - 1) / (k - deg), knot = (i: number) => (i - deg) * dx, B = new Float64Array(n * k);
  for (let t = 0; t < n; t++) {
    const x = Math.min(t, n - 1 - 1e-9); // the last day belongs to the last interval
    let b = Array.from({ length: k + deg }, (_, i) => (x >= knot(i) && x < knot(i + 1) ? 1 : 0));
    for (let d = 1; d <= deg; d++) b = b.slice(0, -1).map((v, i) => ((x - knot(i)) * v + (knot(i + d + 1) - x) * b[i + 1]) / (d * dx));
    for (let j = 0; j < k; j++) B[t * k + j] = b[j];
  }
  return B;
}

export type Fit = {
  n: number; k: number; X: Float64Array; beta: Float64Array;
  /** Cholesky factor of the coefficients' covariance, for the bootstrap. */ L: Float64Array;
  mu: Float64Array; edf: number; lambda: number; phi: number;
};

/** Penalised iteratively reweighted least squares for log E(y) = X β with penalty λ βᵀ Dᵀ D β (second differences). */
function pirls(y: ArrayLike<number>, X: Float64Array, n: number, k: number, lambda: number, start?: Float64Array) {
  const eta = new Float64Array(n), mu = new Float64Array(n), A = new Float64Array(k * k), XtWX = new Float64Array(k * k), b = new Float64Array(k);
  for (let t = 0; t < n; t++) eta[t] = start ? dotRow(X, t, k, start) : Math.log(y[t] + 0.5);
  let beta = new Float64Array(k), L = A;
  for (let it = 0; it < 100; it++) {
    XtWX.fill(0); b.fill(0);
    for (let t = 0; t < n; t++) {
      const m = Math.exp(eta[t]), z = eta[t] + (y[t] - m) / m;
      for (let i = 0; i < k; i++) { const xi = X[t * k + i] * m; if (!xi) continue; b[i] += xi * z; for (let j = 0; j < k; j++) XtWX[i * k + j] += xi * X[t * k + j]; }
    }
    penalise(A, XtWX, k, lambda);
    L = cholesky(A, k); beta = cholSolve(L, k, b);
    let change = 0;
    for (let t = 0; t < n; t++) { const e = Math.max(-30, Math.min(30, dotRow(X, t, k, beta))); change = Math.max(change, Math.abs(e - eta[t])); eta[t] = e; }
    if (change < 1e-8) break;
  }
  // Quantities at the converged weights: effective degrees of freedom tr((XᵀWX + λS)⁻¹ XᵀWX), deviance, Pearson χ².
  XtWX.fill(0);
  for (let t = 0; t < n; t++) { mu[t] = Math.exp(eta[t]); for (let i = 0; i < k; i++) { const xi = X[t * k + i] * mu[t]; if (xi) for (let j = 0; j < k; j++) XtWX[i * k + j] += xi * X[t * k + j]; } }
  penalise(A, XtWX, k, lambda); L = cholesky(A, k);
  const Ainv = new Float64Array(k * k);
  for (let j = 0; j < k; j++) { const e = new Float64Array(k); e[j] = 1; const c = cholSolve(L, k, e); for (let i = 0; i < k; i++) Ainv[i * k + j] = c[i]; }
  let edf = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) edf += Ainv[i * k + j] * XtWX[j * k + i];
  let dev = 0, chi2 = 0;
  for (let t = 0; t < n; t++) { const m = mu[t], v = y[t]; dev += 2 * ((v > 0 ? v * Math.log(v / m) : 0) - (v - m)); chi2 += ((v - m) * (v - m)) / m; }
  return { beta, mu, edf, dev, chi2, Ainv };
}

const dotRow = (X: Float64Array, t: number, k: number, beta: ArrayLike<number>) => { let s = 0; for (let j = 0; j < k; j++) s += X[t * k + j] * beta[j]; return s; };

/** A = XᵀWX + λ DᵀD with D the (k−2) × k second-difference matrix, whose DᵀD is the banded 1 −4 6 −4 1 pattern. */
function penalise(A: Float64Array, XtWX: Float64Array, k: number, lambda: number): void {
  A.set(XtWX);
  for (let r = 0; r < k - 2; r++) {
    const d = [1, -2, 1];
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) A[(r + a) * k + r + c] += lambda * d[a] * d[c];
  }
}

/** Smooth daily counts: a spline basis about as large as the number of weeks, the smoothing weight chosen by generalised
 * cross-validation over a log grid (each degree of freedom counted 1.4 times, the usual guard against overfitting sparse
 * counts), and the quasi-Poisson dispersion φ = χ² / (n − edf) scaling the Bayesian covariance
 * φ (XᵀWX + λS)⁻¹ of the coefficients, as mgcv reports it. */
export function fitCounts(y: ArrayLike<number>, k = Math.max(6, Math.round(y.length / 7))): Fit {
  const n = y.length, X = bsplines(n, k);
  let best: (ReturnType<typeof pirls> & { gcv: number; lambda: number }) | null = null;
  for (let e = -1; e <= 5.001; e += 0.25) {
    const lambda = 10 ** e, f = pirls(y, X, n, k, lambda, best?.beta), gcv = (n * f.dev) / (n - 1.4 * f.edf) ** 2;
    if (!best || gcv < best.gcv) best = { ...f, gcv, lambda };
  }
  const f = best!, phi = Math.max(1e-9, f.chi2 / (n - f.edf));
  const V = f.Ainv.map((v) => v * phi);
  return { n, k, X, beta: f.beta, L: cholesky(V, k), mu: f.mu, edf: f.edf, lambda: f.lambda, phi };
}

/** R curves of expected counts with the coefficients drawn from N(β̂, V): the paper's spectrum of 100 GAMM realisations. */
export function draws(fit: Fit, R: number, seed: number): Float64Array[] {
  const { n, k, X, beta, L } = fit, g = gaussian(makeRng(seed)), z = new Float64Array(k), b = new Float64Array(k);
  return Array.from({ length: R }, () => {
    for (let j = 0; j < k; j++) z[j] = g();
    for (let i = 0; i < k; i++) { let s = beta[i]; for (let j = 0; j <= i; j++) s += L[i * k + j] * z[j]; b[i] = s; }
    const c = new Float64Array(n);
    for (let t = 0; t < n; t++) c[t] = Math.exp(dotRow(X, t, k, b));
    return c;
  });
}

/** Keep each counted patient with probability p: the counts a population p times as large would have produced. */
export function thin(y: ArrayLike<number>, p: number, seed: number): Float64Array {
  const r = makeRng(seed), out = new Float64Array(y.length);
  for (let t = 0; t < y.length; t++) { let c = 0; for (let i = 0; i < y[t]; i++) if (r() < p) c++; out[t] = c; }
  return out;
}

/** Standard score: zero mean, unit standard deviation. */
export function zscore(x: ArrayLike<number>): Float64Array {
  const n = x.length; let m = 0, s = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n; for (let i = 0; i < n; i++) s += (x[i] - m) ** 2;
  const sd = Math.sqrt(s / n) || 1;
  return Float64Array.from(x as ArrayLike<number>, (v) => (v - m) / sd);
}

/** Time-lagged cross-correlation of standard-scored series, zero outside the window (Eq. 4): C(k) = Σ a(t+k) b(t) / n for
 * |k| ≤ K, and the lag that maximises it. A negative lag means a runs ahead of b. Ties go to the smaller |k|. */
export function tlcc(a: ArrayLike<number>, b: ArrayLike<number>, K: number): { lag: number; c: Float64Array } {
  const n = a.length, c = new Float64Array(2 * K + 1);
  let lag = 0;
  for (let k = -K; k <= K; k++) {
    let s = 0; for (let t = Math.max(0, -k); t < Math.min(n, n - k); t++) s += a[t + k] * b[t];
    c[k + K] = s / n;
    if (c[k + K] > c[lag + K] || (c[k + K] === c[lag + K] && Math.abs(k) < Math.abs(lag))) lag = k;
  }
  return { lag, c };
}

/** The overlap of a and b once b is moved by the lag, so that a(t + lag) sits over b(t). */
export function align(a: Float64Array, b: Float64Array, lag: number): [Float64Array, Float64Array] {
  const n = a.length;
  return lag >= 0 ? [a.subarray(lag), b.subarray(0, n - lag)] : [a.subarray(0, n + lag), b.subarray(-lag)];
}

let scratch = new Float64Array(0);
/** Dynamic time warping with the symmetric2 step pattern (diagonal steps count twice) and absolute differences as the
 * local cost, normalised by n + m, so a value is the average gap between matched points in standard deviations. With
 * `path`, also the matched index pairs from start to end. */
export function dtw(a: ArrayLike<number>, b: ArrayLike<number>, path = false): { dist: number; path?: [number, number][] } {
  const n = a.length, m = b.length, W = m + 1;
  if (scratch.length < (n + 1) * W) scratch = new Float64Array((n + 1) * W);
  const D = scratch;
  D.fill(Infinity, 0, (n + 1) * W); D[0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = Math.abs(a[i - 1] - b[j - 1]);
    D[i * W + j] = Math.min(D[(i - 1) * W + j - 1] + 2 * c, D[(i - 1) * W + j] + c, D[i * W + j - 1] + c);
  }
  const dist = D[n * W + m] / (n + m);
  if (!path) return { dist };
  const p: [number, number][] = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    p.push([i - 1, j - 1]);
    const c = Math.abs(a[i - 1] - b[j - 1]), here = D[i * W + j];
    if (Math.abs(D[(i - 1) * W + j - 1] + 2 * c - here) < 1e-9) { i--; j--; } else if (Math.abs(D[(i - 1) * W + j] + c - here) < 1e-9) i--; else j--;
  }
  return { dist, path: p.reverse() };
}

/** Mean and standard deviation. */
export function meanSd(x: ArrayLike<number>): [number, number] {
  const n = x.length; let m = 0, s = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n; for (let i = 0; i < n; i++) s += (x[i] - m) ** 2;
  return [m, Math.sqrt(s / Math.max(1, n - 1))];
}
