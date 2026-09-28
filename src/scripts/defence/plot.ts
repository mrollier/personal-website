// Plots on a slide, in design pixels: a unit square (or any range) mapped into a box, axes with a few labelled
// ticks, curves, dots. Big enough to read from the back row: 28 px tick labels, 32 px axis names.
import type { Stage } from './stage';
import { Raster } from '../raster';
import { parse } from '../palette';

export type Plot = { x: number; y: number; w: number; h: number; x0: number; x1: number; y0: number; y1: number };
export const px = (p: Plot, v: number) => p.x + ((v - p.x0) / (p.x1 - p.x0)) * p.w;
export const py = (p: Plot, v: number) => p.y + p.h - ((v - p.y0) / (p.y1 - p.y0)) * p.h;

/** Axes along the left and bottom, ticks with labels, axis names. */
export function axes(st: Stage, p: Plot, o: { xticks: [number, string][]; yticks: [number, string][]; xname: string; yname: string }): void {
  const { ctx, t } = st;
  ctx.strokeStyle = t.muted; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.stroke();
  ctx.font = `28px ${t.mono}`; ctx.fillStyle = t.muted;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [v, s] of o.xticks) { const x = px(p, v); ctx.fillRect(x - 1, p.y + p.h, 2, 10); ctx.fillText(s, x, p.y + p.h + 16); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [v, s] of o.yticks) { const y = py(p, v); ctx.fillRect(p.x - 10, y - 1, 10, 2); ctx.fillText(s, p.x - 18, y); }
  ctx.font = `32px ${t.sans}`; ctx.fillStyle = t.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(o.xname, p.x + p.w / 2, p.y + p.h + 58);
  ctx.save(); ctx.translate(p.x - 92, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'bottom'; ctx.fillText(o.yname, 0, 0); ctx.restore();
}

/** y = f(x) sampled across the plot's x range. */
export function curve(st: Stage, p: Plot, f: (x: number) => number, color: string, width = 5, dash: number[] = []): void {
  const { ctx } = st, n = 240;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const x = p.x0 + ((p.x1 - p.x0) * i) / n, X = px(p, x), Y = py(p, f(x)); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
  ctx.stroke(); ctx.setLineDash([]);
}

export function dot(st: Stage, x: number, y: number, r: number, fill: string, ring?: string): void {
  const { ctx } = st;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill();
  if (ring) { ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke(); }
}

export function line(st: Stage, x1: number, y1: number, x2: number, y2: number, color: string, width = 3, dash: number[] = []): void {
  const { ctx } = st;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
}

export function label(st: Stage, s: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline; mono?: boolean; weight?: number; bg?: boolean } = {}): void {
  const { ctx, t } = st, size = o.size ?? 30;
  ctx.font = `${o.weight ?? 400} ${size}px ${o.mono ? t.mono : t.sans}`;
  ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = o.base ?? 'middle';
  if (o.bg) {
    const w = ctx.measureText(s).width, x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    ctx.fillStyle = t.bg; ctx.fillRect(x0 - 6, y - size * 0.62, w + 12, size * 1.24);
  }
  ctx.fillStyle = o.color ?? t.ink; ctx.fillText(s, x, y);
}

const rasters = new Map<string, Raster>(); // one bitmap per size, written and drawn in the same call
/** A node × time pattern with square cells: `rows` people (a sample through `order`, most contacts first) down, `rounds`
 * rounds across, `on(t, i)` whether person i has a hand up in round t; drawn as a crisp bitmap from (x, y). */
export function pattern(st: Stage, order: number[], rows: number, rounds: number, on: (t: number, i: number) => boolean, x = 0, y = 0, side = Math.min(st.w / rounds, st.h / rows)): void {
  const key = `${rounds}x${rows}`, ras = rasters.get(key) ?? new Raster(rounds, rows), ink = parse(st.t.ink), off = parse(st.t.panel);
  rasters.set(key, ras);
  for (let r = 0; r < rows; r++) { const i = order[Math.floor((r * order.length) / rows)]; for (let t = 0; t < rounds; t++) ras.set(r * rounds + t, on(t, i) ? ink : off); }
  ras.flush(); ras.blit(st.ctx, { x, y, w: rounds * side, h: rows * side });
}
