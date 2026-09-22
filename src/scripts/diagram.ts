// The local rule diagram of an LLNA (Fig. 2.1 of the paper): the neighbourhood density along the
// bottom cut into r intervals, one row for a node that is dead now (filled where it is born) and one
// for a node that is alive now (filled where it survives). Optionally the densities a node of degree k
// can actually see, with the binomial share of neighbourhoods behind each (Fig. 3.1). Drawing and the
// hit test share one geometry so a click lands on the right cell. Canvas only, no other DOM.
import { type Rule, interval, binomial } from './llna';
import { type Tokens, type Box, label } from './figure';

export type Geom = { x0: number; cw: number; r: number; bandB: Box; bandS: Box; strip: Box | null; axisY: number; compact: boolean };
export type Hit = { i: number; band: 'B' | 'S' };
type Opts = { k?: number; compact?: boolean };

export function geometry(box: Box, r: number, opts: Opts = {}): Geom {
  const compact = !!opts.compact, gutter = compact ? 44 : 64, axis = compact ? 16 : 34, top = opts.k ? (compact ? 22 : 34) : compact ? 4 : 16;
  const x0 = box.x + gutter, cw = (box.w - gutter - 8) / r, gap = 3;
  const bh = Math.max(8, (box.h - top - axis - gap) / 2);
  const bandB = { x: x0, y: box.y + top, w: cw * r, h: bh }, bandS = { x: x0, y: box.y + top + bh + gap, w: cw * r, h: bh };
  const strip = opts.k ? { x: x0, y: box.y + 2, w: cw * r, h: top - 4 } : null;
  return { x0, cw, r, bandB, bandS, strip, axisY: bandS.y + bandS.h, compact };
}

export function hit(g: Geom, x: number, y: number): Hit | null {
  if (x < g.x0 || x >= g.x0 + g.cw * g.r) return null;
  const i = Math.floor((x - g.x0) / g.cw);
  if (y >= g.bandB.y && y < g.bandB.y + g.bandB.h) return { i, band: 'B' };
  if (y >= g.bandS.y && y < g.bandS.y + g.bandS.h) return { i, band: 'S' };
  return null;
}

const frac = (i: number, r: number) => (i === 0 ? '0' : i === r ? '1' : 2 * i === r ? '½' : `${i}/${r}`);

export function draw(ctx: CanvasRenderingContext2D, box: Box, rule: Rule, t: Tokens, opts: Opts = {}): Geom {
  const g = geometry(box, rule.r, opts), { r, cw, x0, compact } = g;
  const size = compact ? 10 : 11;
  // the two rows of cells
  for (const [band, mask, color, name] of [[g.bandB, rule.B, t.accent, compact ? 'dead' : 'now dead'], [g.bandS, rule.S, t.ink, compact ? 'alive' : 'now alive']] as const) {
    for (let i = 0; i < r; i++) {
      const x = x0 + i * cw, on = (mask >> i) & 1;
      ctx.fillStyle = on ? color : t.panel; ctx.fillRect(x, band.y, cw, band.h);
      ctx.strokeStyle = on ? color : t.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, band.y + 0.5, cw - 1, band.h - 1);
    }
    label(ctx, name, x0 - 6, band.y + band.h / 2, t, { align: 'right', base: 'middle', size, color: t.ink });
  }
  // the density axis: boundary at i/r; a dot marks which side the boundary belongs to (half-open intervals, the middle closed)
  const m = (r - 1) / 2;
  for (let i = 0; i <= r; i++) {
    const x = x0 + i * cw, edge = i === 0 || i === r;
    ctx.strokeStyle = t.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 0.5, g.axisY); ctx.lineTo(x + 0.5, g.axisY + 4); ctx.stroke();
    if (!compact && !edge) {
      const right = i <= m; // below the middle a boundary belongs to the interval on its right; above, on its left; both middle edges point inward
      ctx.fillStyle = t.muted; ctx.beginPath(); ctx.arc(x + (right ? 3 : -3), g.axisY + 2.5, 1.5, 0, 2 * Math.PI); ctx.fill();
    }
    if (!compact || edge || 2 * i === r) label(ctx, frac(i, r), x, g.axisY + (compact ? 13 : 16), t, { align: 'center', size });
  }
  if (!compact) label(ctx, 'density of live neighbours ρ', x0 + (cw * r) / 2, g.axisY + 30, t, { align: 'center', size, base: 'alphabetic', color: t.muted });
  // the degree overlay: the densities q/k a node of degree k can see, each with the share of neighbourhoods behind it
  if (opts.k && g.strip) {
    const k = opts.k, s = g.strip, rmax = Math.max(3, s.h / 2 - 1);
    let wmax = 0; for (let q = 0; q <= k; q++) wmax = Math.max(wmax, binomial(k, q));
    ctx.setLineDash([2, 3]);
    for (let q = 0; q <= k; q++) {
      const x = x0 + (q / k) * cw * r, w = binomial(k, q), i = interval(q, k, r);
      ctx.strokeStyle = t.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, g.bandB.y); ctx.lineTo(x, g.axisY); ctx.stroke();
      ctx.setLineDash([]);
      const rad = rmax * Math.sqrt(w / wmax);
      ctx.beginPath(); ctx.arc(x, s.y + s.h / 2, rad, 0, 2 * Math.PI);
      ctx.fillStyle = ((rule.B >> i) & 1) || ((rule.S >> i) & 1) ? t.bg : t.panel; ctx.fill(); ctx.strokeStyle = t.muted; ctx.stroke();
      ctx.setLineDash([2, 3]);
    }
    ctx.setLineDash([]);
    label(ctx, `k = ${k}`, x0 - 6, s.y + s.h / 2, t, { align: 'right', base: 'middle', size });
  }
  return g;
}
