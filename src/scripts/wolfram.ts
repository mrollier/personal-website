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

/** Three states, the outcome depending only on the neighbourhood total 0 … 2(2r + 1): the code is that table read as a base-3 number, digit s for total s. */
export function totalisticTable(code: number, radius: 1 | 2 = 1): Uint8Array {
  const m = 2 * (2 * radius + 1) + 1, t = new Uint8Array(m);
  for (let s = 0; s < m; s++) { t[s] = code % 3; code = Math.floor(code / 3); }
  return t;
}
export const totalisticCode = (table: Uint8Array) => { let n = 0; for (let i = table.length - 1; i >= 0; i--) n = n * 3 + table[i]; return n; };
