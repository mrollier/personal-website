// The rule of a Life-like network automaton as two rings round a node (their geometry in ./rings): the share of a
// node's neighbours that are on, shaded from cream to ink and cut into the r equal intervals of the thesis (Ch. 5). The
// ring round an off node says in which intervals it is born, the ring round an on node in which it survives: a chosen
// interval keeps its colour and steps out, the others fade. Drawn on a stage canvas in design pixels; slides F2 and D3
// use it, through `picker`, which also takes the clicks.
import { stage, pointer, onSize, type Stage } from './stage';
import { GAP, SEP, angle, remap, hitRing, type Ring, type Rule } from './rings';

export type { Ring, Rule };

const mix = (a: string, b: string, u: number) => {
  const p = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, k) => Math.round(v + (y[k] - v) * u)).join(',')})`;
};

/** One ring with its node. `pop` (0–1 per interval) is how far each interval has stepped out, so a toggle can ease. */
export function drawRing(st: Stage, g: Ring, r: number, mask: number, pop?: ArrayLike<number>): void {
  const { ctx, t } = st, inner = g.R - g.w, out = g.w * 0.14;
  // the gradient, and its ghost for the intervals not chosen: cream to a pale denim instead of cream to ink
  const conic = (end: string) => {
    const c = ctx.createConicGradient(-Math.PI / 2, g.x, g.y);
    c.addColorStop(GAP / 2 / (2 * Math.PI), t.panel); c.addColorStop(1 - GAP / 2 / (2 * Math.PI), end);
    return c;
  };
  const full = conic(t.ink), ghost = conic(mix(t.panel, t.line, 0.75));
  for (let i = 0; i < r; i++) {
    const chosen = (mask >> i) & 1, u = pop ? pop[i] : chosen, a0 = angle(i / r) + SEP / 2, a1 = angle((i + 1) / r) - SEP / 2;
    const d = out * u, ox = Math.cos((a0 + a1) / 2) * d, oy = Math.sin((a0 + a1) / 2) * d;
    ctx.beginPath();
    ctx.arc(g.x + ox, g.y + oy, g.R, a0, a1); ctx.arc(g.x + ox, g.y + oy, inner, a1, a0, true); ctx.closePath();
    ctx.save(); ctx.translate(ox, oy); // the colours move out with the interval
    if (u < 1) { ctx.globalAlpha = 1 - u; ctx.fillStyle = ghost; ctx.fill(); }
    if (u > 0) { ctx.globalAlpha = u; ctx.fillStyle = full; ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = 0.6 + 0.4 * u; ctx.lineWidth = 2 + 2 * u; ctx.strokeStyle = u > 0.5 ? t.ink : t.line; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the node itself
  const nr = inner * 0.5;
  ctx.beginPath(); ctx.arc(g.x, g.y, nr, 0, 2 * Math.PI);
  ctx.fillStyle = g.on ? t.ink : t.panel; ctx.fill();
  ctx.lineWidth = Math.max(4, nr * 0.1); ctx.strokeStyle = t.ink; ctx.stroke();
}

export type Picker = { readonly rule: Rule; setR(r: number): void; reset(rule: Rule): void; paint(): void };

/** Two rings on one canvas, the born ring and the survive ring, whose intervals a click or a tap toggles. The rule is
 * kept as the density regions last chosen: a new resolution shows them as closely as its intervals allow, and going back
 * to the resolution they were chosen at gives them back exactly. A tap on an interval belongs to the slide (the deck
 * does not turn the page); a tap anywhere else does not. `changed` hears every new rule. */
export function picker(c: HTMLCanvasElement, rings: [Ring, Ring], start: Rule, changed: (rule: Rule) => void): Picker {
  let kept = { ...start }, r = start.r, raf = 0;
  const masks = () => ({ B: remap(kept.B, kept.r, r), S: remap(kept.S, kept.r, r) });
  const pops = [new Float32Array(16), new Float32Array(16)];
  const paint = () => {
    const st = stage(c); if (!st) return;
    const m = masks();
    drawRing(st, rings[0], r, m.B, pops[0]); drawRing(st, rings[1], r, m.S, pops[1]);
  };
  // each interval eases out when chosen and back when not
  const settle = (now = false) => {
    cancelAnimationFrame(raf);
    const m = masks(), want = (k: number, i: number) => ((k ? m.S : m.B) >> i) & 1;
    if (now) { for (let k = 0; k < 2; k++) for (let i = 0; i < 16; i++) pops[k][i] = want(k, i); paint(); return; }
    const frame = () => {
      let moving = false;
      for (let k = 0; k < 2; k++) for (let i = 0; i < 16; i++) {
        const d = want(k, i) - pops[k][i];
        if (Math.abs(d) > 0.01) { pops[k][i] += d * 0.3; moving = true; } else pops[k][i] = want(k, i);
      }
      paint();
      raf = moving ? requestAnimationFrame(frame) : 0;
    };
    raf = requestAnimationFrame(frame);
  };
  const api: Picker = {
    get rule() { return { r, ...masks() }; },
    setR(next) { if (next === r) return; r = next; settle(true); changed(api.rule); },
    reset(rule) { kept = { ...rule }; r = rule.r; settle(true); changed(api.rule); },
    paint,
  };
  const at = (e: PointerEvent) => { const p = pointer(c, e); for (let k = 0; k < 2; k++) { const i = hitRing(rings[k], r, p.x, p.y); if (i >= 0) return { k, i }; } return null; };
  c.addEventListener('pointermove', (e) => { c.style.cursor = at(e) ? 'pointer' : ''; });
  c.addEventListener('pointerdown', (e) => {
    const h = e.button === 0 ? at(e) : null; if (!h) return;
    e.stopPropagation(); // the tap is the slide's: no page turn on a phone
    const m = masks();
    kept = { r, B: h.k ? m.B : m.B ^ (1 << h.i), S: h.k ? m.S ^ (1 << h.i) : m.S };
    settle(); changed(api.rule);
  });
  settle(true);
  onSize(c, paint);
  return api;
}

/** Write a rule into a φ label typeset with `phi(…, true)` (src/components/defence/tex.ts). */
export function setPhi(el: Element, { r, B, S }: Rule): void {
  el.querySelector('.phi-r')!.textContent = String(r);
  el.querySelector('.phi-b')!.textContent = String(B);
  el.querySelector('.phi-s')!.textContent = String(S);
}
