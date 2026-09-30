// A few tiles of the cover's mosaic on each slide, half off its edge, faint: three to five still-life tiles of
// levels 3–5 along one stretch of the border, somewhere else on every slide (seeded by the slide's place in the deck, so
// a slide always looks the same). They keep clear of everything the slide shows at any build: the content is measured
// once the slide is laid out, and a tile that would touch it is dropped. Fewer than three left, and the slide goes
// without. Each tile is a still life on its own and they stand apart, so the rule holds here too.
import { makeRng } from '../net';
import { bank, type Tiles } from './cover';
import { DESIGN, stage, onSize } from './stage';
import tiles from '../../data/tiles.json';
import mosaic from '../../data/defence/mosaic.json';

const CELL = 5, ALPHA = 0.35, GAP = 18; // design pixels a cell; opacity; clearance from content
const HIGH = (DESIGN * 9) / 16;
type Box = { x: number; y: number; w: number; h: number };
type Tile = { L: number; x: number; y: number; t: Uint8Array };

const hits = (a: Box, b: Box, m: number) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const REPLACED = new Set(['CANVAS', 'SVG', 'svg', 'IMG', 'VIDEO', 'BUTTON', 'INPUT', 'OUTPUT', 'SELECT']);

/** Everything the slide paints, in design pixels: text as its line boxes, pictures and controls whole, and any element
 * with a background or a border. Hidden builds count too (they only lose their visibility). */
function content(s: HTMLElement): Box[] {
  const r0 = s.getBoundingClientRect(), k = DESIGN / r0.width, out: Box[] = [];
  const add = (r: DOMRect) => { if (r.width > 0.5 && r.height > 0.5) out.push({ x: (r.left - r0.left) * k, y: (r.top - r0.top) * k, w: r.width * k, h: r.height * k }); };
  const walk = (e: Element) => {
    if (e.hasAttribute('data-sprig')) return;
    if (REPLACED.has(e.tagName)) { add(e.getBoundingClientRect()); return; }
    const cs = getComputedStyle(e);
    if (cs.display === 'none') return;
    if (!/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) add(e.getBoundingClientRect());
    for (const n of e.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) { const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) add(b); }
      else if (n.nodeType === Node.ELEMENT_NODE) walk(n as Element);
    }
  };
  for (const e of s.children) walk(e);
  out.push({ x: DESIGN - 260, y: HIGH - 70, w: 260, h: 70 }); // the slide counter while presenting
  return out;
}

/** Three to five tiles along one stretch of the border, each about half outside, placed clear of `busy`. */
function place(busy: Box[], seed: number): Tile[] {
  const rnd = makeRng(seed);
  for (let attempt = 0; attempt < 16; attempt++) {
    const edge = Math.floor(rnd() * 4), along = edge % 2 === 0 ? DESIGN : HIGH, want = 3 + Math.floor(rnd() * 3);
    let at = rnd() * along * 0.8, dir = rnd() < 0.5 ? 1 : -1;
    const got: Tile[] = [];
    for (let n = 0; n < 8 && got.length < want; n++) {
      const L = 3 + Math.floor(rnd() * 3), size = 6 * L * CELL, off = (0.35 + rnd() * 0.3) * size; // this much of it inside
      const [x, y] = edge === 0 ? [at, off - size] : edge === 1 ? [DESIGN - off, at] : edge === 2 ? [at, HIGH - off] : [off - size, at];
      const box = { x, y, w: size, h: size }, seen = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(DESIGN, x + size) - Math.max(0, x), h: Math.min(HIGH, y + size) - Math.max(0, y) };
      at += dir * (size + CELL * (2 + Math.floor(rnd() * 4 * L)));
      if (at < -size || at > along) { dir = -dir; at += dir * 2 * size; }
      if (seen.w <= 0 || seen.h <= 0 || busy.some((b) => hits(seen, b, GAP)) || got.some((g) => hits(box, { x: g.x, y: g.y, w: 6 * g.L * CELL, h: 6 * g.L * CELL }, 2 * CELL))) continue;
      const set = bank(tiles as Tiles, L);
      got.push({ L, x, y, t: set[Math.floor(rnd() * set.length)] });
    }
    if (got.length >= 3) return got;
  }
  return [];
}

function paint(c: HTMLCanvasElement, laid: Tile[]) {
  const st = stage(c); if (!st) return;
  const { ctx } = st;
  ctx.globalAlpha = ALPHA;
  for (const { L, x, y, t } of laid) {
    const n = 6 * L, h = 3 * L;
    ctx.fillStyle = mosaic.grounds[L - 1];
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (Math.abs(dx + 0.5 - h) + Math.abs(dy + 0.5 - h) <= h) ctx.fillRect(x + dx * CELL, y + dy * CELL, CELL, CELL);
    ctx.fillStyle = mosaic.inks[L - 1];
    for (let k = 0; k < n * n; k++) if (t[k]) ctx.fillRect(x + (k % n) * CELL, y + Math.floor(k / n) * CELL, CELL, CELL);
  }
  ctx.globalAlpha = 1;
}

/** Lays the tiles on every slide of a deck that has a sprig canvas, once the slide is first laid out. */
export function sprigs(deck: HTMLElement): void {
  deck.querySelectorAll<HTMLElement>('[data-slide]').forEach((s, i) => {
    const c = s.querySelector<HTMLCanvasElement>(':scope > [data-sprig]');
    if (!c) return;
    let laid: Tile[] | null = null;
    onSize(c, () => { laid ??= place(content(s), 7919 * (i + 1)); paint(c, laid); });
  });
}
