// Life-like network automata, after Rollier, de Oliveira, Bruno and Baetens, "Essential metrics for
// Life on graphs", Physica D 483 (2025) 134950, arXiv:2506.21226. A node looks at its own state and at
// the density ρ of live nodes among its neighbours; ρ falls in one of r equal intervals, and a rule says
// for each interval whether a dead node is born and whether a live node survives. The Game of Life is
// the case r = 9 on a grid with eight neighbours. Rules, the update, the mean-field curve, the firing
// squad and majority detectors, and one trial for the batch statistics. Pure, no DOM.
import type { Net } from './net';

/** Resolution r (odd) and the born and survive sets as bitmasks over the r intervals: β and σ of the paper. */
export type Rule = { r: number; B: number; S: number };

export const RESOLUTIONS = [3, 5, 7, 9, 11, 13];

export const PRESETS: { id: string; name: string; rule: Rule }[] = [
  { id: 'life', name: 'Life', rule: { r: 9, B: 8, S: 12 } },
  { id: 'highlife', name: 'HighLife', rule: { r: 9, B: 72, S: 12 } },
  { id: 'morley', name: 'Morley', rule: { r: 9, B: 328, S: 52 } },
  { id: 'daynight', name: 'Day & Night', rule: { r: 9, B: 456, S: 472 } },
  { id: 'seeds', name: 'Seeds', rule: { r: 9, B: 4, S: 0 } },
  { id: 'fssp', name: 'firing squad', rule: { r: 9, B: 23, S: 47 } },
  { id: 'majority', name: 'majority', rule: { r: 9, B: 488, S: 464 } },
];

export const sameRule = (a: Rule, b: Rule) => a.r === b.r && a.B === b.B && a.S === b.S;
export const presetOf = (rule: Rule) => PRESETS.find((p) => sameRule(p.rule, rule))?.id ?? '';
export const clampRule = (r: number, B: number, S: number): Rule => {
  r = RESOLUTIONS.includes(r) ? r : 9;
  const all = (1 << r) - 1;
  return { r, B: (Math.round(B) || 0) & all, S: (Math.round(S) || 0) & all };
};

/** Which of the r intervals holds the density q/k, Eq. (2.2): [i/r, (i+1)/r[ below the middle, the middle closed at both ends, ]i/r, (i+1)/r] above, so the set mirrors round ½. Integers in, so a density on a boundary lands where it should. A node without neighbours counts as density 0. */
export function interval(q: number, k: number, r: number): number {
  if (k === 0) return 0;
  const m = (r - 1) / 2, x = (q * r) / k;
  if (x < m) return Math.floor(x);
  if (x <= m + 1) return m;
  return Math.min(r - 1, Math.ceil(x) - 1);
}

/** The local rule, Eq. (2.1): born if dead and the interval is in B, survive if alive and it is in S. */
export const phi = (s: number, q: number, k: number, rule: Rule): number => ((s ? rule.S : rule.B) >> interval(q, k, rule.r)) & 1;

/** One tick, every node at once. */
export function step(s: Uint8Array, net: Net, rule: Rule, out = new Uint8Array(net.n)): Uint8Array {
  for (let i = 0; i < net.n; i++) {
    const nb = net.adj[i]; let q = 0;
    for (let j = 0; j < nb.length; j++) q += s[nb[j]];
    out[i] = phi(s[i], q, nb.length, rule);
  }
  return out;
}

const mirror = (x: number, r: number) => { let y = 0; for (let i = 0; i < r; i++) if ((x >> i) & 1) y |= 1 << (r - 1 - i); return y; };

/** The rule that does the same with all states swapped, Eq. (2.4): complement of the mirrored survive set becomes the born set, and vice versa. */
export function equivalent({ r, B, S }: Rule): Rule {
  const all = (1 << r) - 1;
  return { r, B: all & ~mirror(S, r), S: all & ~mirror(B, r) };
}
export const selfEquivalent = (rule: Rule) => sameRule(rule, equivalent(rule));

/** C(k, q) / 2^k: the share of neighbourhoods of size k with q live nodes when every state is a coin flip. */
export function binomial(k: number, q: number): number {
  let c = 1; for (let i = 1; i <= q; i++) c = (c * (k - q + i)) / i;
  return c / 2 ** k;
}

/** Mean-field curve, Eq. (3.2), for one degree: the expected density after a tick when the density now is ρ and every node is a coin weighted by ρ. */
export function meanField(rule: Rule, k: number, rho: number): number {
  let dead = 0, alive = 0, c = 1;
  for (let q = 0; q <= k; q++) {
    if (q) c = (c * (k - q + 1)) / q; // C(k, q) by recurrence
    const w = c * rho ** q * (1 - rho) ** (k - q), i = interval(q, k, rule.r);
    if ((rule.B >> i) & 1) dead += w;
    if ((rule.S >> i) & 1) alive += w;
  }
  return (1 - rho) * dead + rho * alive;
}

/** Hamming weight for degree k, Eq. (3.1): the mean-field curve at ½. */
export const hammingWeight = (rule: Rule, k: number) => meanField(rule, k, 0.5);

/** Whether the mean-field curve meets the firing squad criterion of Sec. 5.2: above 1 − ρ up to ½, below it past ½, which makes ½ an unstable balance and sends the density to 0 or 1 while flipping. Sampled. */
export function flipsTowardsHomogeneous(rule: Rule, k: number, samples = 200): boolean {
  for (let i = 1; i < samples; i++) { // open interval: at 0 and 1 both sides can only agree
    const rho = i / samples, next = meanField(rule, k, rho);
    if (rho <= 0.5 ? next < 1 - rho - 1e-9 : next >= 1 - rho - 1e-9) return false;
  }
  return true;
}

/** Exactly round(ρ⁰ N) live nodes, placed at random. */
export function randomState(n: number, rho0: number, rnd: () => number): Uint8Array {
  const s = new Uint8Array(n), m = Math.round(rho0 * n);
  for (let i = 0; i < m; i++) s[i] = 1;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
  return s;
}

export function density(s: Uint8Array): number { let c = 0; for (let i = 0; i < s.length; i++) c += s[i]; return c / s.length; }
export function defects(a: Uint8Array, b: Uint8Array): number { let c = 0; for (let i = 0; i < a.length; i++) c += a[i] ^ b[i]; return c; }

export type Mode = 'fssp' | 'majority' | 'defect';
export type Verdict = { done: boolean; ok: boolean; tick: number; text: string };

/** Reads the outcome off the density history. Homogeneous means every node the same; the two ticks after it tell flashing (the firing squad) from frozen (the majority). */
export function verdict(mode: Mode, rho: ArrayLike<number>, limit: number): Verdict {
  const n = rho.length, want = mode === 'majority' ? (rho[0] > 0.5 ? 1 : rho[0] < 0.5 ? 0 : -1) : -1;
  if (mode === 'majority' && want < 0) return { done: true, ok: false, tick: 0, text: 'half on, half off: there is no majority to find' };
  let T = -1;
  for (let t = 0; t < n; t++) if (rho[t] === 0 || rho[t] === 1) { T = t; break; }
  if (T < 0) return n > limit ? { done: true, ok: false, tick: n - 1, text: `not homogeneous after ${limit} ticks` } : { done: false, ok: false, tick: n - 1, text: `tick ${n - 1}` };
  if (n < T + 3) return { done: false, ok: false, tick: T, text: `homogeneous at tick ${T}` };
  const flashing = rho[T + 1] === 1 - rho[T] && rho[T + 2] === rho[T], frozen = rho[T + 1] === rho[T];
  if (mode === 'fssp') {
    if (flashing) return { done: true, ok: true, tick: T, text: `synchronised at tick ${T}: all off, all on, all off …` };
    return { done: true, ok: false, tick: T, text: frozen ? `homogeneous at tick ${T}, but frozen: no flashing` : `homogeneous at tick ${T}, then lost again` };
  }
  const got = rho[T], right = got === want;
  if (frozen) return { done: true, ok: right, tick: T, text: `majority was ${want ? 'on' : 'off'}, settled on ${got ? 'on' : 'off'} at tick ${T}: ${right ? 'right' : 'wrong'}` };
  return { done: true, ok: false, tick: T, text: `all ${got ? 'on' : 'off'} at tick ${T}, but not at rest` };
}

/** One trial for the batch: a fresh configuration on the given network, run until the verdict is in or the limit is reached. */
export function trial(mode: 'fssp' | 'majority', net: Net, rule: Rule, rho0: number, rnd: () => number, limit = 2 * net.n): Verdict {
  let a = randomState(net.n, rho0, rnd), b = new Uint8Array(net.n);
  const rho: number[] = [density(a)];
  for (;;) {
    const v = verdict(mode, rho, limit);
    if (v.done) return v;
    step(a, net, rule, b); [a, b] = [b, a]; rho.push(density(a));
  }
}

/** ϕ with r above and β,σ below, as plain text. */
export const ruleName = ({ r, B, S }: Rule) => `φ^${r}_{${B},${S}}`;
