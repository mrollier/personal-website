// The two average curves of a rule, the maths only (no drawing, so the checks can run it in Node): the average next
// density (the mean-field curve) and the average next defect (the Derrida curve, at density ½), for eight neighbours
// each; where the density curve meets the diagonal; the tangent that measures the rule; and a cobweb's corners.
import { meanField, type Rule } from '../llna.ts';
import { derridaCoeffs, derridaAt } from '../genotype.ts';

export const K = 8, STEPS = 6;
export type Kind = 'density' | 'defect';
export type Tangent = { x: number; y: number; slope: number };

export function curveOf(rule: Rule, kind: Kind): (x: number) => number {
  if (kind === 'density') return (x) => meanField(rule, K, x);
  const dc = derridaCoeffs(rule, K, 0.5);
  return (x) => derridaAt(dc, x);
}

const slopeOf = (f: (x: number) => number, x: number, h = 1e-5) => (f(Math.min(1, x + h)) - f(Math.max(0, x - h))) / (Math.min(1, x + h) - Math.max(0, x - h));

/** Where the curve meets the diagonal, with its slope there. */
export function equilibria(f: (x: number) => number, n = 2000): { x: number; slope: number }[] {
  const out: { x: number; slope: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, da = f(a) - a, db = f(b) - b;
    if (da !== 0 && Math.sign(da) === Math.sign(db)) continue;
    let lo = a, hi = b;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (Math.sign(f(m) - m) === Math.sign(f(lo) - lo)) lo = m; else hi = m; }
    const x = da === 0 ? a : (lo + hi) / 2;
    if (!out.some((o) => Math.abs(o.x - x) < 1e-3)) out.push({ x, slope: slopeOf(f, x) });
  }
  return out;
}

/** The tangent at the steepest unstable equilibrium of the density, or through the origin of the defect;
 * null when the density has no unstable equilibrium. */
export function tangentOf(f: (x: number) => number, kind: Kind): Tangent | null {
  if (kind === 'defect') return { x: 0, y: 0, slope: slopeOf(f, 0) };
  const bad = equilibria(f).filter((e) => Math.abs(e.slope) > 1).sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope));
  return bad.length ? { x: bad[0].x, y: bad[0].x, slope: bad[0].slope } : null;
}

/** The cobweb's corners from x0: up to the curve, across to the diagonal, and again, `steps` times. */
export function cobweb(f: (x: number) => number, x0: number, steps = STEPS): [number, number][] {
  const pts: [number, number][] = [[x0, 0]];
  let x = x0;
  for (let k = 0; k < steps; k++) { const y = f(x); pts.push([x, y], [y, y]); x = y; }
  return pts;
}
