// Defect propagation and the Lyapunov spectrum (Ch. 4 of the thesis): the Boolean Jacobian of an
// elementary rule, walk counts in tangent space alongside the Boolean difference pattern, the closed-form
// spectra of the sixteen affine rules on a ring and of affine outer-totalistic rules on a torus, the parity
// rule's spectrum on any graph from the adjacency eigenvalues, and Benettin's estimator for any rule.
// Pure, no DOM, safe in a worker.
import { evolve, seedRow } from './eca.ts';
import { tableOf } from './wolfram.ts';
import { symEigen, qr } from './linalg.ts';
import { buildNet, makeRng, type Net, type NetSpec } from './net.ts';

export const AFFINE = [0, 15, 51, 60, 85, 90, 102, 105, 150, 153, 165, 170, 195, 204, 240, 255];

/** ln σ, with a singular value that is zero up to rounding (cos(2π/3) is not exactly −½) reported as −∞. */
const ln0 = (s: number) => (s > 1e-12 ? Math.log(s) : -Infinity);

/** The Boolean derivatives of φ at neighbourhood (l, c, r): does the outcome change when the left, own or right cell flips? */
export function derivatives(table: Uint8Array, l: number, c: number, r: number): [number, number, number] {
  const at = (a: number, b: number, d: number) => table[(a << 2) | (b << 1) | d], here = at(l, c, r);
  return [here ^ at(l ^ 1, c, r), here ^ at(l, c ^ 1, r), here ^ at(l, c, r ^ 1)];
}

/** The constant gradient (a₋, a∘, a₊) of an affine rule, or null when the gradient depends on the neighbourhood. */
export function gradient(rule: number): [number, number, number] | null {
  const table = tableOf(rule); let g: [number, number, number] | null = null;
  for (let n = 0; n < 8; n++) {
    const d = derivatives(table, (n >> 2) & 1, (n >> 1) & 1, n & 1);
    if (!g) g = d; else if (g[0] !== d[0] || g[1] !== d[1] || g[2] !== d[2]) return null;
  }
  return g;
}
export const isAffine = (rule: number) => gradient(rule) !== null;

export type Twin = { a: Uint8Array[]; b: Uint8Array[]; diff: Uint8Array[]; flipAt: number };

/** Two runs of the same rule from starts that differ in one cell, and their XOR, the difference pattern. */
export function twinRun(rule: number, W: number, T: number, flipAt: number, seed: number): Twin {
  const s0 = seedRow(W, 'random', makeRng(seed)), t0 = s0.slice(); t0[flipAt] ^= 1;
  const a = evolve(s0, rule, T), b = evolve(t0, rule, T), diff = a.map((r, t) => r.map((v, i) => v ^ b[t][i]));
  return { a, b, diff, flipAt };
}

export type Walks = { logs: Float32Array[]; running: Float64Array; agree: boolean[] };

/** The walk counts δsᵗ = J(sᵗ⁻¹) ⋯ J(s⁰) e_i over the integers, along the first run, kept as logarithms so 3ᵗ never overflows:
 * per tick the log of each entry (−∞ where zero), the running estimate (1/t)·ln‖δsᵗ‖∞, and whether δsᵗ mod 2 equals the Boolean pattern. */
export function walkCounts(rule: number, twin: Twin): Walks {
  const table = tableOf(rule), rows = twin.a, W = rows[0].length, T = rows.length - 1;
  let v = new Float64Array(W), par = new Uint8Array(W), logScale = 0; v[twin.flipAt] = 1; par[twin.flipAt] = 1;
  const logs: Float32Array[] = [Float32Array.from(v, (x) => (x > 0 ? Math.log(x) : -Infinity))], running = new Float64Array(T + 1), agree: boolean[] = [true];
  for (let t = 1; t <= T; t++) {
    const s = rows[t - 1], next = new Float64Array(W), nextPar = new Uint8Array(W);
    for (let i = 0; i < W; i++) {
      const l = (i + W - 1) % W, r = (i + 1) % W, d = derivatives(table, s[l], s[i], s[r]);
      // row i of J(s): a walk reaches cell i from l, i or r when the corresponding derivative is 1
      next[i] = d[0] * v[l] + d[1] * v[i] + d[2] * v[r];
      nextPar[i] = (d[0] * par[l] + d[1] * par[i] + d[2] * par[r]) & 1; // the same product over the binary field, exact
    }
    let max = 0; for (let i = 0; i < W; i++) if (next[i] > max) max = next[i];
    if (max > 0) { for (let i = 0; i < W; i++) next[i] /= max; logScale += Math.log(max); }
    v = next; par = nextPar;
    logs.push(Float32Array.from(v, (x) => (x > 0 ? Math.log(x) + logScale : -Infinity)));
    running[t] = max > 0 ? logScale / t : -Infinity;
    let same = true; for (let i = 0; i < W && same; i++) if (par[i] !== twin.diff[t][i]) same = false;
    agree.push(same);
  }
  return { logs, running, agree };
}

/** Λ_k = ln σ_k on a ring of N cells for an affine rule, Eq. (4.13): σ_k² = (a∘ + (a₊ + a₋)cos θ)² + (a₊ − a₋)² sin² θ, θ = 2πk/N. Descending. */
export function affineSpectrum1d(rule: number, N: number): Float64Array {
  const g = gradient(rule); if (!g) throw new Error(`rule ${rule} is not affine`);
  const [am, ac, ap] = g, out = new Float64Array(N);
  for (let k = 0; k < N; k++) { const th = (2 * Math.PI * k) / N, re = ac + (ap + am) * Math.cos(th), im = (ap - am) * Math.sin(th); out[k] = ln0(Math.hypot(re, im)); }
  return out.sort((a, b) => b - a);
}

export type Hood2d = 'vn' | 'moore' | 'vn2';
export const HOOD_SIZE: Record<Hood2d, number> = { vn: 4, moore: 8, vn2: 12 };

/** The structure factor K(k, l) of Tab. 4.3 for an L × L torus: the sum of cos(2π(δ₁k + δ₂l)/L) over the neighbours. */
export function structureFactor(hood: Hood2d, k: number, l: number, L: number): number {
  const a = (2 * Math.PI * k) / L, b = (2 * Math.PI * l) / L;
  let K = 2 * Math.cos(a) + 2 * Math.cos(b);
  if (hood === 'moore') K += 4 * Math.cos(a) * Math.cos(b);
  if (hood === 'vn2') K += 2 * Math.cos(2 * a) + 2 * Math.cos(2 * b);
  return K;
}

/** σ_{k,l} = |a∘ + K(k, l)| for the parity rule on a torus (g = 1), as an L × L field, plus the sorted spectrum ln σ. */
export function affineSpectrum2d(hood: Hood2d, self: boolean, L: number): { sigma: Float32Array; spectrum: Float64Array; max: number } {
  const sigma = new Float32Array(L * L), spectrum = new Float64Array(L * L), ac = self ? 1 : 0;
  for (let k = 0; k < L; k++) for (let l = 0; l < L; l++) { const s = Math.abs(ac + structureFactor(hood, k, l, L)); sigma[k * L + l] = s; spectrum[k * L + l] = ln0(s); }
  return { sigma, spectrum: spectrum.sort((a, b) => b - a), max: Math.log(ac + HOOD_SIZE[hood]) };
}

/** Λ_k = ln|λ_k(A) + a∘| for the parity rule on any undirected graph, from the adjacency eigenvalues. Descending. */
export function networkParitySpectrum(eig: Float64Array, self: boolean): Float64Array {
  const ac = self ? 1 : 0;
  return Float64Array.from(eig, (l) => ln0(Math.abs(l + ac))).sort((a, b) => b - a);
}

export function adjacency(net: Net): Float64Array {
  const n = net.n, A = new Float64Array(n * n);
  for (const [i, j] of net.edges) { A[i * n + j] = 1; A[j * n + i] = 1; }
  return A;
}

export type SpectrumResult = { eig: Float64Array; n: number; meanDegree: number };

/** Worker job: the adjacency eigenvalues of a network built from a spec (N ≤ 300 keeps it under a second). */
export function* spectrumJob(params: { spec: NetSpec; seed: number }): Generator<{ p: number }, SpectrumResult> {
  const net = buildNet(params.spec, params.seed, 'none');
  yield { p: 0.1 };
  const { values } = symEigen(adjacency(net), net.n);
  return { eig: values, n: net.n, meanDegree: (2 * net.edges.length) / net.n };
}

export type BenettinResult = { spectrum: Float64Array; N: number; T: number; burn: number };

/** Worker job: Benettin's estimate of the whole spectrum of any elementary rule on a ring of N cells. Carry an orthonormal
 * frame Q, multiply by J(sᵗ), re-orthonormalise by QR, and average the logs of R's diagonal after the burn-in. Descending. */
export function* benettin(params: { rule: number; N: number; burn: number; T: number; seed: number }): Generator<{ p: number; partial: Float64Array }, BenettinResult> {
  const { rule, N, burn, T, seed } = params, table = tableOf(rule), total = burn + T;
  const rows = evolve(seedRow(N, 'random', makeRng(seed)), rule, total);
  let Q = new Float64Array(N * N); for (let i = 0; i < N; i++) Q[i * N + i] = 1;
  const sum = new Float64Array(N), M = new Float64Array(N * N);
  for (let t = 0; t < total; t++) {
    const s = rows[t];
    for (let i = 0; i < N; i++) {
      const l = (i + N - 1) % N, r = (i + 1) % N, d = derivatives(table, s[l], s[i], s[r]);
      for (let c = 0; c < N; c++) M[i * N + c] = d[0] * Q[l * N + c] + d[1] * Q[i * N + c] + d[2] * Q[r * N + c];
    }
    const f = qr(M, N); Q = f.Q;
    if (t >= burn) for (let k = 0; k < N; k++) sum[k] += f.R[k * N + k] > 0 ? Math.log(f.R[k * N + k]) : -Infinity;
    if ((t + 1) % 25 === 0 || t === total - 1) { const done = Math.max(1, t + 1 - burn); yield { p: (t + 1) / total, partial: Float64Array.from(sum, (v) => v / done).sort((a, b) => b - a) }; }
  }
  return { spectrum: Float64Array.from(sum, (v) => v / T).sort((a, b) => b - a), N, T, burn };
}
