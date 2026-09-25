// The five ways of stretching an elementary cellular automaton, all on one row of cells (Ch. 2 of the
// thesis): a boundary condition, a synchrony rate (asynchronous), a second rule drawn with a
// probability (stochastic), a fixed allocation of cells to the second rule and a clamped cell
// (non-uniform), a wider neighbourhood (extended), and a three-state totalistic variant (multi-state).
// With the defaults every knob is off and the step equals eca.ts. Pure, no DOM.

export type Boundary = 'periodic' | 'null' | 'fixed' | 'adiabatic' | 'reflexive' | 'intermediate' | 'random' | 'distributed';

export const BOUNDARIES: { id: Boundary; name: string; blurb: string }[] = [
  { id: 'periodic', name: 'periodic', blurb: 'the row is a ring; no cell sees an edge' },
  { id: 'null', name: 'null', blurb: 'no edge cells are defined, so the cells that would need them are not updated' },
  { id: 'fixed', name: 'fixed', blurb: 'the cells beyond each edge are stuck at a chosen state' },
  { id: 'adiabatic', name: 'adiabatic', blurb: 'the cell beyond an edge copies the edge cell' },
  { id: 'reflexive', name: 'reflexive', blurb: 'the cell beyond an edge mirrors the one inside it' },
  { id: 'intermediate', name: 'intermediate', blurb: 'the cell beyond an edge copies a cell somewhere else in the row' },
  { id: 'random', name: 'random', blurb: 'a coin flip beyond each edge, every tick' },
  { id: 'distributed', name: 'distributed', blurb: 'a weighted coin beyond each edge, every tick' },
];

export type Config = {
  table: Uint8Array;       // φ: 2^(2r+1) entries, or 2(2r+1)+1 totals when three-state
  psi: Uint8Array;         // ψ, the same shape
  radius: 1 | 2;
  states: 2 | 3;           // three states means totalistic: the outcome depends on the neighbourhood total
  boundary: Boundary;
  fixed: number;           // the state beyond the edges when fixed
  inter: number;           // intermediate: the left edge copies cell `inter` (0-based), the right edge its mirror image
  pDist: number;           // distributed: probability of the highest state beyond the edges
  alpha: number;           // synchrony rate: each cell updates with this probability; 1 is the ordinary CA
  p: number;               // probability of following φ rather than ψ, drawn anew every tick; 1 is never ψ
  mask?: Uint8Array;       // 1 where a cell always follows ψ (a frozen allocation)
  clamp: number;           // a cell whose state never changes; −1 for none
};

export const IDENTITY = 204;

export function defaults(table: Uint8Array, psi: Uint8Array, radius: 1 | 2 = 1, states: 2 | 3 = 2): Config {
  return { table, psi, radius, states, boundary: 'periodic', fixed: 0, inter: 0, pDist: 0.5, alpha: 1, p: 1, clamp: -1 };
}

/** The row with r fictitious cells added on each side, filled according to the boundary condition. Null returns null. */
export function extend(row: Uint8Array, cfg: Config, rnd: () => number): Uint8Array | null {
  const N = row.length, r = cfg.radius, out = new Uint8Array(N + 2 * r), top = cfg.states - 1;
  out.set(row, r);
  const set = (j: number, v: number) => { out[j] = v; };
  for (let d = 1; d <= r; d++) { // d = 1 is the fictitious cell next to the edge
    const L = r - d, R = r + N - 1 + d;
    switch (cfg.boundary) {
      case 'null': return null;
      case 'periodic': set(L, row[(N - d + N) % N]); set(R, row[(d - 1) % N]); break;
      case 'fixed': set(L, cfg.fixed); set(R, cfg.fixed); break;
      case 'adiabatic': set(L, row[0]); set(R, row[N - 1]); break;
      case 'reflexive': set(L, row[Math.min(N - 1, d)]); set(R, row[Math.max(0, N - 1 - d)]); break;
      case 'intermediate': { const i = Math.min(N - 1, Math.max(0, cfg.inter)); set(L, row[Math.min(N - 1, i + d - 1)]); set(R, row[Math.max(0, N - 1 - i - (d - 1))]); break; }
      case 'random': set(L, Math.floor(rnd() * cfg.states)); set(R, Math.floor(rnd() * cfg.states)); break;
      case 'distributed': set(L, rnd() < cfg.pDist ? top : 0); set(R, rnd() < cfg.pDist ? top : 0); break;
    }
  }
  return out;
}

/** The outcome of a table for the neighbourhood centred at position j of the extended row. */
function look(ext: Uint8Array, j: number, table: Uint8Array, cfg: Config): number {
  const r = cfg.radius;
  if (cfg.states === 3) { let s = 0; for (let d = -r; d <= r; d++) s += ext[j + d]; return table[s]; }
  let n = 0; for (let d = -r; d <= r; d++) n = (n << 1) | ext[j + d];
  return table[n];
}

/** One tick. Cells left out by the boundary, the synchrony rate or the clamp keep their state. */
export function stepVariant(row: Uint8Array, cfg: Config, rnd: () => number): Uint8Array {
  const N = row.length, r = cfg.radius, out = row.slice();
  const ext = extend(row, cfg, rnd);
  const lo = ext ? 0 : r, hi = ext ? N : N - r, e = ext ?? row, off = ext ? r : 0;
  for (let i = lo; i < hi; i++) {
    if (i === cfg.clamp) continue;
    if (cfg.alpha < 1 && rnd() >= cfg.alpha) continue;
    const psi = cfg.mask?.[i] === 1 || (cfg.p < 1 && rnd() >= cfg.p);
    out[i] = look(e, i + off, psi ? cfg.psi : cfg.table, cfg);
  }
  return out;
}

/** A frozen allocation: a share ν of the cells picked at random to follow ψ. */
export function allocate(N: number, nu: number, rnd: () => number): Uint8Array {
  const m = new Uint8Array(N), k = Math.round(nu * N), idx = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let i = 0; i < k; i++) m[idx[i]] = 1;
  return m;
}

/** The share of cells following ψ. */
export function nonUniformity(mask: Uint8Array | undefined): number {
  if (!mask) return 0;
  let c = 0; for (let i = 0; i < mask.length; i++) c += mask[i];
  return c / mask.length;
}

/** The number of rules in the family: k^(k^|N|), or 3^(2|N|+1) for the three-state totalistic case. */
export function familySize(radius: 1 | 2, states: 2 | 3): string {
  const nbh = 2 * radius + 1;
  if (states === 3) return `3^${2 * nbh + 1} = ${3 ** (2 * nbh + 1)}`;
  const bits = 2 ** nbh;
  return bits <= 8 ? `2^${bits} = ${2 ** bits}` : `2^${bits} ≈ 4.3 × 10^9`;
}
