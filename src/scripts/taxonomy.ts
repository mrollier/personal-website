// The five families of the taxonomy paper (Rollier et al., CNSNS 2025) on one row of cells, and the identities that
// tie them together: update orders for the asynchronous family, a probability per neighbourhood for the stochastic one
// and its continuous twin, blocks of cells pooled into one cell with more states, a second rule allocated in space and
// time, and a memory that makes any rule reversible. Rows are rings; a neighbourhood is read with its left cell as the
// most significant bit, as in eca.ts and wolfram.ts. Pure, no DOM.

/** Neighbourhood index of cell i: 4·left + 2·self + right. */
const nb = (row: ArrayLike<number>, i: number) => { const N = row.length; return (row[(i + N - 1) % N] << 2) | (row[i] << 1) | row[(i + 1) % N]; };

// ---- Asynchronous: the order in which cells update ----------------------------------------------------------------

export type Scheme = 'sync' | 'alpha' | 'independent' | 'new-sweep' | 'fixed-sweep' | 'line';

/** A random permutation of 0 … N−1. */
export function shuffle(N: number, rnd: () => number): Int32Array {
  const p = Int32Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

/** The N single-cell updates of one sweep (Section 2.2.1): N picks with replacement for a random independent ACA, a fresh
 * permutation for a random new sweep, the same permutation every time for a random fixed sweep, 0 … N−1 line by line. */
export function order(scheme: 'independent' | 'new-sweep' | 'fixed-sweep' | 'line', N: number, rnd: () => number, fixed?: Int32Array): Int32Array {
  if (scheme === 'independent') return Int32Array.from({ length: N }, () => Math.floor(rnd() * N));
  if (scheme === 'new-sweep') return shuffle(N, rnd);
  if (scheme === 'fixed-sweep') return fixed!;
  return Int32Array.from({ length: N }, (_, i) => i);
}

/** One sweep: the cells in `ord` update one at a time, each seeing the latest state of its neighbours. */
export function sweep(row: Uint8Array, table: ArrayLike<number>, ord: ArrayLike<number>): Uint8Array {
  const r = row.slice();
  for (let k = 0; k < ord.length; k++) r[ord[k]] = table[nb(r, ord[k])];
  return r;
}

/** Eq. (2.1): each cell applies the rule with probability α and otherwise keeps its state; one coin per cell. */
export function alphaStep(row: Uint8Array, table: ArrayLike<number>, alpha: number, rnd: () => number): Uint8Array {
  const out = row.slice();
  for (let i = 0; i < row.length; i++) if (rnd() < alpha) out[i] = table[nb(row, i)];
  return out;
}

// ---- Stochastic: two rules and a coin, or a probability per neighbourhood -------------------------------------------

/** Eq. (3.1): each cell follows φ with probability p and ψ otherwise; one coin per cell, drawn in the same order as alphaStep. */
export function scaStep(row: Uint8Array, phi: ArrayLike<number>, psi: ArrayLike<number>, p: number, rnd: () => number): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) { const n = nb(row, i); out[i] = rnd() < p ? phi[n] : psi[n]; }
  return out;
}

/** The octuple of Eq. (3.2) that Eq. (3.1) amounts to: the chance of a 1 after each neighbourhood, p·φ + (1 − p)·ψ. */
export function mixture(phi: ArrayLike<number>, psi: ArrayLike<number>, p: number): Float64Array {
  return Float64Array.from({ length: 8 }, (_, n) => p * phi[n] + (1 - p) * psi[n]);
}

/** Eq. (3.2): a cell becomes 1 with the probability its neighbourhood carries. */
export function octStep(row: Uint8Array, prob: ArrayLike<number>, rnd: () => number): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) out[i] = rnd() < prob[nb(row, i)] ? 1 : 0;
  return out;
}

/** The continuous CA of Section 4.2: x is the chance that each cell is 1, and the next chance is the octuple weighted by
 * the chance of each neighbourhood, as if neighbouring cells were independent. */
export function ccaStep(x: Float64Array, prob: ArrayLike<number>): Float64Array {
  const N = x.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const l = x[(i + N - 1) % N], c = x[i], r = x[(i + 1) % N];
    let s = 0;
    for (let n = 0; n < 8; n++) s += prob[n] * (n & 4 ? l : 1 - l) * (n & 2 ? c : 1 - c) * (n & 1 ? r : 1 - r);
    out[i] = s;
  }
  return out;
}

// ---- Multi-state and extended neighbourhoods: pooling b cells into one of 2^b states (Fig. 4.1) ---------------------

/** One tick of a binary radius-2 rule (32-entry table, as tableOf(rule, 2)). */
export function step5(row: Uint8Array, t5: ArrayLike<number>): Uint8Array {
  const N = row.length, out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let n = 0; for (let d = -2; d <= 2; d++) n = (n << 1) | row[(i + d + N) % N];
    out[i] = t5[n];
  }
  return out;
}

/** Blocks of b cells as one number, the leftmost cell the most significant bit. */
export function pool(row: Uint8Array, b: number): Uint16Array {
  const out = new Uint16Array(row.length / b);
  for (let j = 0; j < out.length; j++) { let v = 0; for (let k = 0; k < b; k++) v = (v << 1) | row[j * b + k]; out[j] = v; }
  return out;
}

export function unpool(blocks: ArrayLike<number>, b: number): Uint8Array {
  const out = new Uint8Array(blocks.length * b);
  for (let j = 0; j < blocks.length; j++) for (let k = 0; k < b; k++) out[j * b + k] = (blocks[j] >> (b - 1 - k)) & 1;
  return out;
}

/** The radius-1 rule on 2^b states that does to blocks what the radius-2 binary rule does to cells, for b ≥ 2: a block
 * and its two neighbours hold every cell its own cells look at. Indexed (left·K + self)·K + right. */
export function poolTable(t5: ArrayLike<number>, b: number): Uint16Array {
  const K = 1 << b, out = new Uint16Array(K * K * K), w = new Uint8Array(3 * b);
  for (let n = 0; n < out.length; n++) {
    for (let k = 0; k < 3 * b; k++) w[k] = Math.floor(n / 2 ** (3 * b - 1 - k)) % 2;
    let v = 0;
    for (let j = 0; j < b; j++) {
      let m = 0; for (let d = -2; d <= 2; d++) m = (m << 1) | w[b + j + d];
      v = (v << 1) | t5[m];
    }
    out[n] = v;
  }
  return out;
}

/** One tick of a radius-1 rule on K states. */
export function stepK(row: ArrayLike<number>, table: ArrayLike<number>, K: number): Uint16Array {
  const N = row.length, out = new Uint16Array(N);
  for (let i = 0; i < N; i++) out[i] = table[(row[(i + N - 1) % N] * K + row[i]) * K + row[(i + 1) % N]];
  return out;
}

// ---- Non-uniform: a second rule allocated in space and time ---------------------------------------------------------

/** Eq. (6.1): cells with alloc = 1 follow ψ, the others φ. */
export function nuStep(row: Uint8Array, alloc: ArrayLike<number>, phi: ArrayLike<number>, psi: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) { const n = nb(row, i); out[i] = alloc[i] ? psi[n] : phi[n]; }
  return out;
}

/** Eq. (6.2): a periodic allocation, the first νT cells of every T following φ and the rest ψ (1 marks ψ). */
export function periodic(N: number, T: number, onPhi: number): Uint8Array {
  return Uint8Array.from({ length: N }, (_, i) => (i % T < onPhi ? 0 : 1));
}

/** Eq. (6.3): the allocation evolves by its own elementary rule ξ, applied to the indicator "this cell follows φ". */
export function nextAlloc(alloc: Uint8Array, xi: ArrayLike<number>): Uint8Array {
  const f = alloc.map((a) => 1 - a), out = new Uint8Array(alloc.length);
  for (let i = 0; i < alloc.length; i++) out[i] = 1 - xi[nb(f, i)];
  return out;
}

/** The quaternary uniform rule of Fig. 6.1: a cell's dual state {s, rule} as 2s + [rule is ψ], so ({0,φ},{0,ψ},{1,φ},{1,ψ})
 * ↦ (0, 1, 2, 3). Indexed 16·left + 4·self + right. */
export function dualTable(phi: ArrayLike<number>, psi: ArrayLike<number>, xi: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(64);
  for (let n = 0; n < 64; n++) {
    const L = n >> 4, C = (n >> 2) & 3, R = n & 3;
    const s = (C & 1 ? psi : phi)[((L >> 1) << 2) | ((C >> 1) << 1) | (R >> 1)];
    const f = xi[((1 - (L & 1)) << 2) | ((1 - (C & 1)) << 1) | (1 - (R & 1))];
    out[n] = 2 * s + (1 - f);
  }
  return out;
}

/** A rule number in the Wolfram convention: Σ output(n)·k^n. Exact, as a BigInt. */
export function ruleNumber(table: ArrayLike<number>, k: number): bigint {
  let v = 0n;
  for (let n = table.length - 1; n >= 0; n--) v = v * BigInt(k) + BigInt(table[n]);
  return v;
}

/** An allocation of ψ in clusters: runs of cells of random length around `len`, alternating φ and ψ. */
export function clustered(N: number, len: number, rnd: () => number): Uint8Array {
  const out = new Uint8Array(N);
  let i = 0, v = rnd() < 0.5 ? 1 : 0;
  while (i < N) { const run = 1 + Math.floor(rnd() * 2 * len); out.fill(v, i, Math.min(N, i + run)); i += run; v = 1 - v; }
  return out;
}

/** Section 6.2.2: φ on the symmetric neighbourhoods (000, 010, 101, 111) and ψ elsewhere is one uniform rule. */
export const SYMMETRIC = [0, 2, 5, 7];
export function symmetricRule(phi: number, psi: number): number {
  let r = 0;
  for (let n = 0; n < 8; n++) r |= ((SYMMETRIC.includes(n) ? phi : psi) >> n & 1) << n;
  return r;
}

// ---- Wider neighbourhoods: a sweep as wiring, and memory as reversibility -------------------------------------------

/** One line-by-line sweep written as a synchronous update: cell i reads only the states of the previous tick, through
 * wiring that reaches from the last cell round to its right neighbour, and applies its own composite rule. The same
 * numbers as sweep(row, table, 0 … N−1), computed the other way round. */
export function wired(row: Uint8Array, table: ArrayLike<number>): Uint8Array {
  const N = row.length, out = new Uint8Array(N), old = (j: number) => row[(j + N) % N];
  const first = table[(old(-1) << 2) | (old(0) << 1) | old(1)];
  for (let i = 0; i < N; i++) {
    let v = first;
    for (let j = 1; j <= i; j++) v = table[(v << 2) | (old(j) << 1) | (j === N - 1 ? first : old(j + 1))];
    out[i] = v;
  }
  return out;
}

/** The wiring of `wired`: row i marks the cells that cell i's new state depends on. */
export function wiring(N: number): Uint8Array {
  const A = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) { A[i * N + N - 1] = 1; for (let j = 0; j <= Math.min(N - 1, i + 1); j++) A[i * N + j] = 1; }
  return A;
}

/** Section 5.2.2: the second-order rule φR. The new state is φ of the neighbourhood, flipped where the cell was 1 two
 * ticks ago. Run with the two latest rows swapped, it retraces its steps. */
export function reversibleStep(prev: Uint8Array, cur: Uint8Array, table: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(cur.length);
  for (let i = 0; i < cur.length; i++) out[i] = table[nb(cur, i)] ^ prev[i];
  return out;
}
