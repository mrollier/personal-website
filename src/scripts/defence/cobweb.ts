// The two average curves of a rule, as the metrics slides and the answers slide draw them: the average next density
// (the mean-field curve) and the average next defect (the Derrida curve, at density ½), for eight neighbours each. The
// density is blue and the defect red, wherever they are drawn (the mission slide's small plots too). The unit square
// gets a strip along each axis (density: off to on; defect: none to all red), a faint diagonal, the curve, a cobweb of a
// few steps from a start, and the dashed tangent that measures the rule, in the curve's colour: through the steepest
// unstable equilibrium of the density (|slope| > 1, the flipping kind too), through the origin for the defect.
import type { Stage } from './stage';
import { curve, dot, line, label, px, py, type Plot } from './plot';
import { cobweb, STEPS, type Kind, type Tangent } from './curves';
import type { Tokens } from '../figure';
export { K, STEPS, curveOf, equilibria, tangentOf, cobweb, type Kind, type Tangent } from './curves';

/** The colour of a curve and its tangent: the density blue, the defect red. */
export const hue = (t: Tokens, kind: Kind) => (kind === 'density' ? t.accent : t.danger);

/** The plot box for a canvas of w × h design pixels: a square, with room on the left and below for strips and labels. */
export function box(w: number, h: number): Plot {
  const side = Math.min(w - 170, h - 130);
  return { x: 150 + (w - 170 - side) / 2, y: 16, w: side, h: side, x0: 0, x1: 1, y0: 0, y1: 1 };
}

/** Strips along both axes, the 0, ½, 1 ticks, and the axis names: the current and the next density (or defect). */
function frame(st: Stage, p: Plot, kind: Kind) {
  const { ctx, t } = st, S = 22, gap = 6, hi = kind === 'density' ? t.ink : t.danger;
  const gx = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0); gx.addColorStop(0, t.panel); gx.addColorStop(1, hi);
  ctx.fillStyle = gx; ctx.fillRect(p.x, p.y + p.h + gap, p.w, S);
  const gy = ctx.createLinearGradient(0, p.y + p.h, 0, p.y); gy.addColorStop(0, t.panel); gy.addColorStop(1, hi);
  ctx.fillStyle = gy; ctx.fillRect(p.x - gap - S, p.y, S, p.h);
  ctx.strokeStyle = t.line; ctx.lineWidth = 2;
  ctx.strokeRect(p.x, p.y + p.h + gap, p.w, S); ctx.strokeRect(p.x - gap - S, p.y, S, p.h);
  ctx.strokeStyle = t.muted; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.stroke();
  const ticks: [number, string][] = [[0, '0'], [0.5, '½'], [1, '1']];
  ctx.font = `28px ${t.mono}`; ctx.fillStyle = t.muted;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [v, s] of ticks) ctx.fillText(s, px(p, v), p.y + p.h + gap + S + 10);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [v, s] of ticks) ctx.fillText(s, p.x - gap - S - 12, py(p, v));
  ctx.font = `32px ${t.sans}`; ctx.fillStyle = t.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`current ${kind}`, p.x + p.w / 2, p.y + p.h + gap + S + 50);
  ctx.save(); ctx.translate(p.x - gap - S - 58, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'bottom'; ctx.fillText(`next ${kind}`, 0, 0); ctx.restore();
}

export type View = {
  kind: Kind; f: (x: number) => number;
  /** the start, and how much of the cobweb is drawn: 0 to STEPS, fractions draw part of a step */
  start: number; progress: number;
  /** the tangent: undefined hides it, null says there is none */
  red?: Tangent | null;
  /** a start the reader can drag: a larger handle */
  handle?: boolean;
  /** the start is being dragged: the cobweb only as thin, faint ghost lines, drawn in full */
  ghost?: boolean;
};

export function draw(st: Stage, p: Plot, v: View): void {
  const { ctx, t } = st, h = hue(t, v.kind);
  frame(st, p, v.kind);
  ctx.globalAlpha = 0.3; curve(st, p, (x) => x, t.muted, 2); ctx.globalAlpha = 1;
  curve(st, p, (x) => Math.max(0, Math.min(1, v.f(x))), h, 6);
  // the cobweb, segment by segment: each step is a vertical then a horizontal segment
  const pts = cobweb(v.f, v.start), segs = v.ghost ? pts.length - 1 : Math.min(pts.length - 1, v.progress * 2);
  ctx.strokeStyle = t.ink; ctx.lineWidth = v.ghost ? 2 : 3; ctx.globalAlpha = v.ghost ? 0.35 : 1; ctx.lineJoin = 'round'; ctx.beginPath();
  ctx.moveTo(px(p, pts[0][0]), py(p, pts[0][1]));
  for (let i = 1; i <= Math.ceil(segs); i++) {
    const u = Math.min(1, segs - (i - 1)), [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    ctx.lineTo(px(p, ax + (bx - ax) * u), py(p, ay + (by - ay) * u));
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  if (segs >= pts.length - 1 && !v.ghost) { const [ex, ey] = pts[pts.length - 1]; dot(st, px(p, ex), py(p, ey), 9, t.ink); }
  dot(st, px(p, v.start), py(p, 0), v.handle ? 15 : 10, h, v.handle ? t.bg : undefined);
  if (v.red === undefined) return;
  if (v.red === null) { label(st, 'no unstable equilibrium', p.x + 24, p.y + 30, { color: h, size: 34, weight: 600, bg: true }); return; }
  tangent(st, p, v.red, h, 5, [16, 12]);
  dot(st, px(p, v.red.x), py(p, v.red.y), 11, h);
}

/** A tangent, clipped to the unit square, dashed. */
export function tangent(st: Stage, p: Plot, { x, y, slope: s }: Tangent, color: string, width: number, dash: number[]): void {
  let xa = 0, xb = 1;
  if (s !== 0) { const x0 = x + (0 - y) / s, x1 = x + (1 - y) / s; xa = Math.max(0, Math.min(x0, x1)); xb = Math.min(1, Math.max(x0, x1)); }
  line(st, px(p, xa), py(p, y + s * (xa - x)), px(p, xb), py(p, y + s * (xb - x)), color, width, dash);
}
