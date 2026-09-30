// The title and closing art: the 16:9 multi-level still-life mosaic packed with the thesis cover's own code
// (scripts/defence/export-mosaic.py → src/data/defence/mosaic.json), in the cover's denim on apricot. The page is a
// window onto a padded torus that is a still life as a whole, so the Game of Life can run on it unchanged.

export type MosaicJson = { W: number; H: number; margin: number; PW: number; PH: number; field: string; grounds: string[]; inks: string[]; ground: string; live: string };
export type Mosaic = { W: number; H: number; M: number; PW: number; PH: number; ground: Uint8Array; live: Uint8Array; field: string; grounds: string[]; inks: string[] };

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** The page's ground levels (run-length pairs) and the padded torus's live cells (bit-packed, most significant first). */
export function decodeMosaic(j: MosaicJson): Mosaic {
  const rle = bytes(j.ground), ground = new Uint8Array(j.W * j.H);
  for (let k = 0, at = 0; k < rle.length; k += 2) { ground.fill(rle[k], at, at + rle[k + 1]); at += rle[k + 1]; }
  const packed = bytes(j.live), live = new Uint8Array(j.PW * j.PH);
  for (let i = 0; i < live.length; i++) live[i] = (packed[i >> 3] >> (7 - (i & 7))) & 1;
  return { W: j.W, H: j.H, M: j.margin, PW: j.PW, PH: j.PH, ground, live, field: j.field, grounds: j.grounds, inks: j.inks };
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Paints a mosaic; its `plain` (one weight a level, 0 = the cover's colours, 1 = none) drains the colours away. */
export type Painter = ((ctx: CanvasRenderingContext2D, live: Uint8Array, x: number, y: number, w: number, h: number) => void) & { plain: Float32Array };

/** Paints the page window of `live` (a PW × PH torus) one pixel a cell into a bitmap, and the bitmap onto `ctx` at
 * (x, y, w, h) without smoothing, so every cell is a square. A live cell takes its level's ink, or `ink` on the field;
 * a dead cell on the field takes `field` (the slide's own background, which is paler than the cover's apricot). As a
 * level's `plain` goes to 1, its ground turns into the field and its ink into `ink`: only alive and dead are left. */
export function mosaicPainter(m: Mosaic, ink: string, field = m.field): Painter {
  const off = document.createElement('canvas');
  off.width = m.W; off.height = m.H;
  const octx = off.getContext('2d')!, img = octx.createImageData(m.W, m.H), px = new Uint32Array(img.data.buffer);
  // colours as little-endian RGBA words: [field, grounds 1–7] when dead, [ink, inks 1–7] when alive
  const word = ([r, g, b]: number[]) => (255 << 24) | (b << 16) | (g << 8) | r;
  const mix = (a: number[], b: number[], u: number) => word(a.map((v, i) => Math.round(v + (b[i] - v) * u)));
  const grounds = [field, ...m.grounds].map(rgb), inks = [ink, ...m.inks].map(rgb), plain = new Float32Array(8);
  const dead = new Uint32Array(8), alive = new Uint32Array(8);
  const paint: Painter = Object.assign((ctx: CanvasRenderingContext2D, live: Uint8Array, x: number, y: number, w: number, h: number) => {
    for (let L = 0; L < 8; L++) { dead[L] = mix(grounds[L], grounds[0], plain[L]); alive[L] = mix(inks[L], inks[0], plain[L]); }
    for (let r = 0; r < m.H; r++) {
      const src = (r + m.M) * m.PW + m.M, dst = r * m.W;
      for (let c = 0; c < m.W; c++) { const g = m.ground[dst + c]; px[dst + c] = live[src + c] ? alive[g] : dead[g]; }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }, { plain });
  return paint;
}

const FADE = 900, STAGGER = 260; // ms each level takes to drain; ms between one level and the next
/** Drains the colours out of `p`, one level after another with a small offset, the palest (level 1) first, and
 * repaints every frame; `done` runs when all of `levels` are plain. Returns a stop, which leaves it where it is. */
export function drain(p: Painter, levels: number[], repaint: () => void, done?: () => void): () => void {
  const order = [...levels].sort((a, b) => a - b), t0 = performance.now();
  let id = requestAnimationFrame(function frame(now) {
    let left = false;
    order.forEach((L, k) => { const u = Math.min(1, Math.max(0, (now - t0 - k * STAGGER) / FADE)); p.plain[L] = u * u * (3 - 2 * u); left ||= u < 1; });
    repaint();
    if (left) id = requestAnimationFrame(frame); else done?.();
  });
  return () => cancelAnimationFrame(id);
}
