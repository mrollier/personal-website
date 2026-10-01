// The rule of a Life-like network automaton as two rings round a node (their geometry in ./rings): the share of a
// node's neighbours that are on, shaded from cream to ink and cut into the r equal intervals of the thesis (Ch. 5). The
// ring round an off node says in which intervals it is born, the ring round an on node in which it survives. Every
// interval keeps its colour; a chosen stretch of intervals is outlined, its ends drawn solid where it includes them and
// dotted where it does not. Drawn on a stage canvas in design pixels; slides F2 and D3 use it, through `picker`, which
// also takes the clicks.
import { stage, pointer, onSize, type Stage } from './stage';
import { GAP, angle, ends, remap, cousin, hitRing, type Ring, type Rule } from './rings';

export type { Ring, Rule };

/** One ring with its node. */
export function drawRing(st: Stage, g: Ring, r: number, mask: number): void {
  const { ctx, t } = st, inner = g.R - g.w, at = (a: number, d: number) => [g.x + Math.cos(a) * d, g.y + Math.sin(a) * d] as const;
  // the share, light to dark, all the way round
  const c = ctx.createConicGradient(-Math.PI / 2, g.x, g.y);
  c.addColorStop(GAP / 2 / (2 * Math.PI), t.panel); c.addColorStop(1 - GAP / 2 / (2 * Math.PI), t.ink);
  ctx.beginPath(); ctx.arc(g.x, g.y, g.R, angle(0), angle(1)); ctx.arc(g.x, g.y, inner, angle(1), angle(0), true); ctx.closePath();
  ctx.fillStyle = c; ctx.fill();
  // a faint line between every two intervals
  ctx.strokeStyle = t.panel; ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(2, g.w * 0.025); ctx.setLineDash([]);
  for (let i = 1; i < r; i++) { const a = angle(i / r); ctx.beginPath(); ctx.moveTo(...at(a, inner)); ctx.lineTo(...at(a, g.R)); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // every stretch of chosen intervals outlined: ink on a cream halo, so it reads on the light and on the dark end
  const segs: { path: () => void; dotted: boolean }[] = [];
  for (let i = 0; i < r; i++) {
    if (!((mask >> i) & 1) || (i && (mask >> (i - 1)) & 1)) continue;
    let j = i; while (j + 1 < r && (mask >> (j + 1)) & 1) j++;
    const a0 = angle(i / r), a1 = angle((j + 1) / r);
    for (const d of [g.R, inner]) segs.push({ path: () => { ctx.beginPath(); ctx.arc(g.x, g.y, d, a0, a1); }, dotted: false });
    for (const [a, closed] of [[a0, ends(i, r, g.on)[0]], [a1, ends(j, r, g.on)[1]]] as const)
      segs.push({ path: () => { ctx.beginPath(); ctx.moveTo(...at(a, inner)); ctx.lineTo(...at(a, g.R)); }, dotted: !closed });
  }
  const lw = Math.max(4, g.w * 0.07);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [color, width] of [[t.panel, lw + Math.max(5, g.w * 0.06)], [t.ink, lw]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    for (const s of segs) { ctx.setLineDash(s.dotted ? [0.01, lw * 2.4] : []); s.path(); ctx.stroke(); }
  }
  ctx.setLineDash([]); ctx.lineCap = 'butt';
  // the node itself
  const nr = inner * 0.5;
  ctx.beginPath(); ctx.arc(g.x, g.y, nr, 0, 2 * Math.PI);
  ctx.fillStyle = g.on ? t.ink : t.panel; ctx.fill();
  ctx.lineWidth = Math.max(4, nr * 0.1); ctx.strokeStyle = t.ink; ctx.stroke();
}

/** A small curved arrow just outside ring `g`, a head at each end, from share x0/r to x1/r (in intervals): one input
 * flipped. One neighbour more or fewer moves the share by 1/8, one interval at r = 9 (the sensitivity slide, and the
 * detective slide at every change of answer). */
export function hop(st: Stage, g: Ring, r: number, x0: number, x1: number, color: string): void {
  const { ctx } = st, d = g.R + Math.max(16, g.w * 0.32), lw = Math.max(4, g.w * 0.08), head = lw * 3, half = head * 0.6;
  const a0 = angle(x0 / r), a1 = angle(x1 / r), tuck = (0.8 * head) / d;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(g.x, g.y, d, a0 + tuck, a1 - tuck); ctx.stroke();
  for (const [a, dir] of [[a0, -1], [a1, 1]] as const) {
    // the tip on the arc, pointing along it, away from the middle
    const x = g.x + Math.cos(a) * d, y = g.y + Math.sin(a) * d, tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir, nx = Math.cos(a), ny = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - tx * head + nx * half, y - ty * head + ny * half); ctx.lineTo(x - tx * head - nx * half, y - ty * head - ny * half);
    ctx.closePath(); ctx.fill();
  }
  ctx.lineCap = 'butt';
}

export type Picker ={ readonly rule: Rule; setR(r: number): void; reset(rule: Rule): void; cousin(): void; paint(): void };

/** Two rings on one canvas, the born ring and the survive ring, whose intervals a click or a tap toggles. The rule is
 * kept as the density regions last chosen: a new resolution shows them as closely as its intervals allow, and going back
 * to the resolution they were chosen at gives them back exactly. A tap on an interval belongs to the slide (the deck
 * does not turn the page); a tap anywhere else does not. `changed` hears every new rule. */
export function picker(c: HTMLCanvasElement, rings: [Ring, Ring], start: Rule, changed: (rule: Rule) => void): Picker {
  let kept = { ...start }, r = start.r;
  const masks = () => ({ B: remap(kept.B, kept.r, r, false), S: remap(kept.S, kept.r, r, true) });
  const paint = () => {
    const st = stage(c); if (!st) return;
    const m = masks();
    drawRing(st, rings[0], r, m.B); drawRing(st, rings[1], r, m.S);
  };
  const api: Picker = {
    get rule() { return { r, ...masks() }; },
    setR(next) { if (next === r) return; r = next; paint(); changed(api.rule); },
    reset(rule) { kept = { ...rule }; r = rule.r; paint(); changed(api.rule); },
    cousin() { kept = cousin(api.rule); paint(); changed(api.rule); },
    paint,
  };
  const at = (e: PointerEvent) => { const p = pointer(c, e); for (let k = 0; k < 2; k++) { const i = hitRing(rings[k], r, p.x, p.y); if (i >= 0) return { k, i }; } return null; };
  c.addEventListener('pointermove', (e) => { c.style.cursor = at(e) ? 'pointer' : ''; });
  c.addEventListener('pointerdown', (e) => {
    const h = e.button === 0 ? at(e) : null; if (!h) return;
    e.stopPropagation(); // the tap is the slide's: no page turn on a phone
    const m = masks();
    kept = { r, B: h.k ? m.B : m.B ^ (1 << h.i), S: h.k ? m.S ^ (1 << h.i) : m.S };
    paint(); changed(api.rule);
  });
  onSize(c, paint);
  return api;
}

/** Write a rule into a φ label typeset with `phi(…, true)` (src/components/defence/tex.ts). */
export function setPhi(el: Element, { r, B, S }: Rule): void {
  el.querySelector('.phi-r')!.textContent = String(r);
  el.querySelector('.phi-b')!.textContent = String(B);
  el.querySelector('.phi-s')!.textContent = String(S);
}
