// Fingerprints for slide G2, one of each textbook pattern: a whorl, a loop, a tented arch, and a plain arch for the
// networks once they all look alike. Ridges are polylines in a box 1 wide and 1.25 tall (y down), from a few families
// of curves, each family kept to its own region of the pad, so that ridges end where two families meet (the core and
// the deltas of a real print); the whole print is warped a little and every ridge broken here and there. Drawn in ink,
// clipped to the pad and faded towards its edge. Pure geometry plus one draw call; same seed, same print.
import { makeRng } from '../net.ts';

export type PrintKind = 'whorl' | 'loop' | 'tented' | 'arch';
export const PAD = { cx: 0.5, cy: 0.64, rx: 0.47, ry: 0.6, h: 1.25 };
const P = 0.056; // ridge to ridge
const STEP = 0.012; // between the points of a ridge

type Pt = [number, number];
/** A ridge family: points along each of its curves, and whether a point lies in the family's own region. */
type Family = { curves: Pt[][]; mine: (x: number, y: number) => boolean };

const inPad = (x: number, y: number) => ((x - PAD.cx) / PAD.rx) ** 2 + ((y - PAD.cy) / PAD.ry) ** 2 < 1.02;
/** Points every STEP along a curve given by f(u), u in [0, 1]. */
function trace(f: (u: number) => Pt, length: number): Pt[] {
  const n = Math.max(2, Math.ceil(length / STEP));
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}
/** Concentric ellipses round (cx, cy), radius r0 + k·P, stretched by `tall` upwards and downwards. */
function rings(cx: number, cy: number, r0: number, rMax: number, tall: number): Pt[][] {
  const out: Pt[][] = [];
  for (let r = r0; r <= rMax; r += P) out.push(trace((u) => [cx + r * Math.cos(2 * Math.PI * u), cy + tall * r * Math.sin(2 * Math.PI * u)], 2 * Math.PI * r * tall));
  return out;
}
/** Lines across the pad, the k-th at y(x) + k·P, from below `top` to the bottom of the box. */
function across(y: (x: number) => number, from: number): Pt[][] {
  const out: Pt[][] = [];
  for (let k = from; k < 30; k++) out.push(trace((u) => [u * 1.1 - 0.05, y(u * 1.1 - 0.05) + k * P], 1.2));
  return out;
}

function families(kind: PrintKind): Family[] {
  if (kind === 'whorl') {
    // a spiral at the core, rings round it, and lines across below it: two deltas, low left and low right
    const cx = 0.5, cy = 0.55, R0 = 0.2, tall = 1.15, low = (x: number) => cy + tall * 0.34 + 0.12 * (x - 0.5) ** 2;
    const turns = (R0 - 0.015) / P;
    const spiral = trace((u) => { const th = u * turns * 2 * Math.PI, r = 0.015 + (P * th) / (2 * Math.PI); return [cx + r * Math.cos(th), cy + tall * r * Math.sin(th)]; }, Math.PI * R0 * turns * tall);
    const rIn = (x: number, y: number) => Math.hypot(x - cx, (y - cy) / tall);
    return [
      { curves: [spiral], mine: (x, y) => rIn(x, y) < R0 + P / 2 },
      { curves: rings(cx, cy, R0 + P, 1.2, tall), mine: (x, y) => rIn(x, y) >= R0 + P / 2 && y < low(x) - P / 2 },
      { curves: across(low, 0), mine: (x, y) => y >= low(x) - 0.01 && rIn(x, y) >= R0 + P / 2 },
    ];
  }
  if (kind === 'loop') {
    // hairpins round a core, open to the lower left, more and more of them reaching over the top; lines below; one delta
    const cx = 0.58, cy = 0.56, ux = -Math.cos(0.5), uy = Math.sin(0.5), nx = -uy, ny = ux, L = 1.2;
    const along = (x: number, y: number) => Math.max(0, Math.min(L, (x - cx) * ux + (y - cy) * uy));
    const dSeg = (x: number, y: number) => { const s = along(x, y); return Math.hypot(x - cx - s * ux, y - cy - s * uy); };
    // the hairpins up to W reach round the core; the bottom lines start one ridge under the last hairpin's lower leg
    const W = 0.02 + 4 * P, low = (x: number) => cy + (W + P) / Math.cos(0.5) + Math.max(0, cx - x) * Math.tan(0.5) - 0.08 * Math.max(0, x - cx) ** 2;
    const pins: Pt[][] = [];
    for (let w = 0.02; w < 1.1; w += P) {
      const leg = (side: number, s: number): Pt => [cx + s * ux + side * w * nx, cy + s * uy + side * w * ny];
      pins.push(trace((u) => {
        const a = L, b = Math.PI * w, t = u * (2 * a + b); // out along one leg, round the core, back along the other
        if (t < a) return leg(1, a - t);
        if (t < a + b) { const th = ((t - a) / b) * Math.PI; return [cx + w * (nx * Math.cos(th) - ux * Math.sin(th)), cy + w * (ny * Math.cos(th) - uy * Math.sin(th))]; }
        return leg(-1, t - a - b);
      }, 2 * L + Math.PI * w));
    }
    return [
      { curves: pins, mine: (x, y) => y < low(x) - P / 2 || dSeg(x, y) < W - P / 2 },
      { curves: across(low, 0), mine: (x, y) => y >= low(x) - 0.01 && dSeg(x, y) >= W - P / 2 },
    ];
  }
  // arches: lines across that follow the fingertip at the top, rise in the middle and flatten towards the bottom;
  // the tented arch rises to a sharp point, the plain one in a gentle wave
  const tented = kind === 'tented';
  const bump = (x: number) => (tented ? Math.max(0, 1 - Math.abs(x - 0.5) / 0.34) ** 1.5 : Math.exp(-(((x - 0.5) / 0.22) ** 2)));
  const lines: Pt[][] = [];
  for (let k = 0; k < 26; k++) {
    const rise = (tented ? 0.15 : 0.07) * Math.exp(-(((k - 11) / 5) ** 2)), bend = 0.9 * Math.max(0, 1 - k / 9) + 0.12;
    lines.push(trace((u) => { const x = u * 1.1 - 0.05; return [x, 0.04 + k * P + bend * (x - 0.5) ** 2 - rise * bump(x)]; }, 1.3));
  }
  return [{ curves: lines, mine: () => true }];
}

/** The ridges of one print: warped, cut to their regions and the pad, and broken here and there. Seeded. */
export function ridges(kind: PrintKind, seed: number): Pt[][] {
  const rnd = makeRng(seed), ph = Array.from({ length: 4 }, () => rnd() * 2 * Math.PI);
  const warp = ([x, y]: Pt): Pt => [x + 0.009 * Math.sin(7 * y + ph[0]) + 0.005 * Math.sin(11 * x + 5 * y + ph[1]), y + 0.009 * Math.sin(6 * x + ph[2]) + 0.005 * Math.sin(13 * y - 4 * x + ph[3])];
  const out: Pt[][] = [];
  for (const fam of families(kind)) for (const c of fam.curves) {
    let run: Pt[] = [], gap = 0, next = 0.2 + rnd() * 0.7, walked = 0;
    const flush = () => { if (run.length > 3) out.push(run); run = []; };
    for (const p of c) {
      walked += STEP;
      if (gap > 0) { gap -= STEP; flush(); continue; }
      if (walked > next) { walked = 0; next = 0.35 + rnd() * 0.8; gap = 0.018 + rnd() * 0.03; flush(); continue; }
      const [x, y] = p;
      if (fam.mine(x, y) && inPad(x, y)) run.push(warp(p)); else flush();
    }
    flush();
  }
  return out;
}

/** Draws a print into a box of height h (width h / 1.25) at (x, y) on ctx, in `ink`, faded towards the pad's edge. */
export function drawPrint(ctx: CanvasRenderingContext2D, lines: Pt[][], x: number, y: number, h: number, ink: string): void {
  const k = h / PAD.h;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = ink; ctx.lineWidth = P * 0.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const l of lines) l.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  // fade towards the edge of the pad: keep what is drawn where an elliptical gradient is opaque
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(PAD.cx, PAD.cy); ctx.scale(1, PAD.ry / PAD.rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, PAD.rx);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
