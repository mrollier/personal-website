// The thesis's three network families as the Impact figures offer them (Tab. 3.1): the ring rewired with
// probability p, the torus grid rewired with p, and nonlinear preferential attachment with power α, at
// the thesis's degrees, and the best consensus-seeking rule the thesis found for each setting (App. B).
// Imports the data file, so this is for the browser, not for npm test.
import type { NetSpec } from './net';
import type { Rule } from './llna';
import data from '../data/thesis-rules.json';

export type Fam = 'ws' | 'lat' | 'npa';
export const FAMS: Fam[] = ['ws', 'lat', 'npa'];
export const FAM_NAME: Record<Fam, string> = { ws: 'ring, rewired', lat: 'grid, rewired', npa: 'preferential attachment' };
export const FAM_DEGREES: Record<Fam, number[]> = { ws: [6, 8, 10], lat: [4, 8, 12], npa: [6, 8, 10] };
export const FAM_PARAM: Record<Fam, { label: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }> = {
  ws: { label: 'rewiring p', min: 0, max: 1, step: 0.05, def: 0.4, fmt: (v) => v.toFixed(2) },
  lat: { label: 'rewiring p', min: 0, max: 1, step: 0.05, def: 0.4, fmt: (v) => v.toFixed(2) },
  npa: { label: 'power α', min: 0, max: 3, step: 0.5, def: 1, fmt: (v) => v.toFixed(1) },
};

export const fixDegree = (kind: Fam, k: number) => (FAM_DEGREES[kind].includes(k) ? k : 8);
export const fixParam = (kind: Fam, v: number) => { const P = FAM_PARAM[kind]; const x = Number.isFinite(v) ? v : P.def; return Math.min(P.max, Math.max(P.min, Math.round(x / P.step) * P.step)); };

/** Node count kept sane: a square side for the grid, a cap where the force layout has to run. */
export function fixSize(kind: Fam, n: number, cap: number): number {
  n = Math.round(n) || cap;
  if (kind === 'lat') { const side = Math.max(5, Math.min(Math.floor(Math.sqrt(cap)), Math.round(Math.sqrt(n)))); return side * side; }
  return Math.min(cap, Math.max(20, n));
}

export function specOf(kind: Fam, n: number, k: number, param: number): NetSpec {
  if (kind === 'ws') return { kind: 'ws', n, k, p: param };
  if (kind === 'lat') return { kind: 'lat', side: Math.round(Math.sqrt(n)), degree: k as 4 | 8 | 12, p: param };
  return { kind: 'npa', n, m: k / 2, alpha: param };
}

export type BestRule = { rule: Rule; pct: number };

/** The thesis's best rules for the nearest tabulated setting, best first; empty where the thesis found none. */
export function bestRules(kind: Fam, k: number, param: number): BestRule[] {
  const cells = (data.cells as { kind: string; k: number; param: number; rules: number[][] }[]).filter((c) => c.kind === kind && c.k === k);
  if (!cells.length) return [];
  let best = cells[0]; for (const c of cells) if (Math.abs(c.param - param) < Math.abs(best.param - param)) best = c;
  return best.rules.map(([B, S, pct]) => ({ rule: { r: 9, B, S }, pct }));
}

/** Every rule that appears in the tables, most frequent first, for a rule menu. */
export function allBestRules(): Rule[] {
  const count = new Map<string, number>();
  for (const c of data.cells as { rules: number[][] }[]) for (const [B, S] of c.rules) count.set(`${B},${S}`, (count.get(`${B},${S}`) ?? 0) + 1);
  return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => { const [B, S] = k.split(',').map(Number); return { r: 9, B, S }; });
}
