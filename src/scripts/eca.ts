// Elementary cellular automaton (Wolfram rules 0–255): one row of binary cells, each next state
// read off the rule's bits by the 3-cell neighbourhood (left, self, right) as a 3-bit number.
// Pure functions, no DOM: used both at build time (static figures) and in the browser.

export type Boundary = 'periodic' | 'zero';
export type Init = 'seed' | 'random';

/** One generation. 'zero' treats the cell beyond each end as a phantom that is always 0. */
export function step(row: Uint8Array, rule: number, boundary: Boundary): Uint8Array {
  const W = row.length, out = new Uint8Array(W), wrap = boundary === 'periodic';
  for (let i = 0; i < W; i++) {
    const l = i > 0 ? row[i - 1] : wrap ? row[W - 1] : 0;
    const r = i < W - 1 ? row[i + 1] : wrap ? row[0] : 0;
    out[i] = (rule >> ((l << 2) | (row[i] << 1) | r)) & 1;
  }
  return out;
}

/** A single live cell in the middle, or a fair coin per cell. */
export function seedRow(width: number, init: Init, rnd: () => number = Math.random): Uint8Array {
  const row = new Uint8Array(width);
  if (init === 'seed') row[width >> 1] = 1;
  else for (let i = 0; i < width; i++) row[i] = rnd() < 0.5 ? 1 : 0;
  return row;
}

/** The initial row followed by `gens` generations. */
export function evolve(row: Uint8Array, rule: number, boundary: Boundary, gens: number): Uint8Array[] {
  const rows = [row];
  for (let g = 0; g < gens; g++) rows.push(step(rows[g], rule, boundary));
  return rows;
}

/** Output bit for each neighbourhood value 0 (000) … 7 (111). */
export const ruleBits = (rule: number) => Array.from({ length: 8 }, (_, n) => (rule >> n) & 1);

/** Conventional display order of the 8 cases: 111 first, 000 last. */
export const CASES = [7, 6, 5, 4, 3, 2, 1, 0];

export const clampRule = (r: number) => Math.min(255, Math.max(0, Math.round(r) || 0));
