// Elementary cellular automaton (Wolfram rules 0–255): one row of binary cells, each next state
// read off the rule's bits by the 3-cell neighbourhood (left, self, right) as a 3-bit number.
// The row is a ring: the last cell's right neighbour is the first cell. Pure functions, no DOM.

export type Init = 'seed' | 'random';

/** One generation. */
export function step(row: Uint8Array, rule: number): Uint8Array {
  const W = row.length, out = new Uint8Array(W);
  for (let i = 0; i < W; i++) {
    const l = row[(i + W - 1) % W], r = row[(i + 1) % W];
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
export function evolve(row: Uint8Array, rule: number, gens: number): Uint8Array[] {
  const rows = [row];
  for (let g = 0; g < gens; g++) rows.push(step(rows[g], rule));
  return rows;
}

/** Output bit for each neighbourhood value 0 (000) … 7 (111). */
export const ruleBits = (rule: number) => Array.from({ length: 8 }, (_, n) => (rule >> n) & 1);

/** Conventional display order of the 8 cases: 111 first, 000 last. */
export const CASES = [7, 6, 5, 4, 3, 2, 1, 0];

export const clampRule = (r: number) => Math.min(255, Math.max(0, Math.round(r) || 0));
