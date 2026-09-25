// Rule tables of one-dimensional binary cellular automata beyond the eight bits of a Wolfram number:
// any radius, the two symmetries that fold the 256 elementary rules into 88 classes, Langton's λ, and
// three-state totalistic codes. Pure, no DOM.

/** Table entry for neighbourhood index n (left cell is the most significant bit), radius r: bit n of the rule number. Works past 31 bits. */
export function tableOf(rule: number, radius: 1 | 2 = 1): Uint8Array {
  const m = 2 ** (2 * radius + 1), t = new Uint8Array(m);
  for (let n = 0; n < m; n++) t[n] = Math.floor(rule / 2 ** n) % 2;
  return t;
}

/** The rule number of a table; for radius 2 this is up to 2³² − 1, still an exact float. */
export function ruleOf(table: Uint8Array): number {
  let n = 0; for (let i = table.length - 1; i >= 0; i--) n = n * 2 + table[i];
  return n;
}

/** Neighbourhood index read right to left: rule 110 seen in a mirror is rule 124. */
export function mirrorRule(rule: number): number {
  const t = tableOf(rule), out = new Uint8Array(8);
  for (let n = 0; n < 8; n++) out[((n & 1) << 2) | (n & 2) | (n >> 2)] = t[n];
  return ruleOf(out);
}

/** Every 0 and 1 swapped in input and output: rule 110 with the colours swapped is rule 137. */
export function complementRule(rule: number): number {
  const t = tableOf(rule), out = new Uint8Array(8);
  for (let n = 0; n < 8; n++) out[7 - n] = 1 - t[n];
  return ruleOf(out);
}

/** The rule's class under the two symmetries: its mirror, its complement, both, and the smallest number of the four as the class's name. */
export function equivalents(rule: number): { mirror: number; complement: number; both: number; rep: number } {
  const mirror = mirrorRule(rule), complement = complementRule(rule), both = complementRule(mirror);
  return { mirror, complement, both, rep: Math.min(rule, mirror, complement, both) };
}

/** Langton's λ: the share of neighbourhoods not mapped to the quiescent state 0. */
export function lambda(table: Uint8Array): number {
  let c = 0; for (let i = 0; i < table.length; i++) if (table[i] !== 0) c++;
  return c / table.length;
}

export type Recovered = { bits: Int8Array; conflicts: Uint8Array; seen: Uint32Array; found: number };

/** Read the rule table off a spacetime diagram (Ch. 8): slide the T-tetromino, three cells and the one below the middle,
 * over the rows up to `upto` (exclusive of the last row) and record, for each neighbourhood, what came out. Bits are −1 while
 * unseen; a neighbourhood that came out both ways is a conflict. */
export function recoverTable(rows: Uint8Array[], upto = rows.length - 1): Recovered {
  const bits = new Int8Array(8).fill(-1), conflicts = new Uint8Array(8), seen = new Uint32Array(8);
  const W = rows[0].length;
  for (let t = 0; t < Math.min(upto, rows.length - 1); t++) {
    const r = rows[t], nxt = rows[t + 1];
    for (let x = 0; x < W; x++) {
      const n = (r[(x + W - 1) % W] << 2) | (r[x] << 1) | r[(x + 1) % W], out = nxt[x];
      seen[n]++;
      if (bits[n] < 0) bits[n] = out; else if (bits[n] !== out) conflicts[n] = 1;
    }
  }
  let found = 0; for (let n = 0; n < 8; n++) if (bits[n] >= 0) found++;
  return { bits, conflicts, seen, found };
}

/** The rule number a recovered table spells, with unseen entries taken as 0, or null while any entry is unseen. */
export function recoveredRule(rec: Recovered): number | null {
  if (rec.found < 8) return null;
  let n = 0; for (let i = 7; i >= 0; i--) n = n * 2 + rec.bits[i];
  return n;
}

export type Augment = 'invert' | 'mirror' | 'coarse' | 'noise';

/** The four augmentations of Ch. 8 applied to a diagram: colours swapped, left and right swapped, 2 × 2 blocks averaged and
 * rounded (the picture keeps its size, so the T-tetromino reads cells that no longer neighbour each other in the rule's sense),
 * and a share of cells flipped at random. */
export function augment(rows: Uint8Array[], op: Augment, rnd: () => number, noise = 0.05): Uint8Array[] {
  const T = rows.length, W = rows[0].length;
  if (op === 'invert') return rows.map((r) => r.map((v) => v ^ 1));
  if (op === 'mirror') return rows.map((r) => Uint8Array.from(r).reverse());
  if (op === 'noise') return rows.map((r) => r.map((v) => (rnd() < noise ? v ^ 1 : v)));
  const out = rows.map((r) => new Uint8Array(W));
  for (let t = 0; t < T; t += 2) for (let x = 0; x < W; x += 2) {
    let s = 0, c = 0;
    for (let dt = 0; dt < 2 && t + dt < T; dt++) for (let dx = 0; dx < 2 && x + dx < W; dx++) { s += rows[t + dt][x + dx]; c++; }
    const v = s * 2 >= c ? 1 : 0; // ties round up
    for (let dt = 0; dt < 2 && t + dt < T; dt++) for (let dx = 0; dx < 2 && x + dx < W; dx++) out[t + dt][x + dx] = v;
  }
  return out;
}

/** Three states, the outcome depending only on the neighbourhood total 0 … 2(2r + 1): the code is that table read as a base-3 number, digit s for total s. */
export function totalisticTable(code: number, radius: 1 | 2 = 1): Uint8Array {
  const m = 2 * (2 * radius + 1) + 1, t = new Uint8Array(m);
  for (let s = 0; s < m; s++) { t[s] = code % 3; code = Math.floor(code / 3); }
  return t;
}
export const totalisticCode = (table: Uint8Array) => { let n = 0; for (let i = table.length - 1; i >= 0; i--) n = n * 3 + table[i]; return n; };
