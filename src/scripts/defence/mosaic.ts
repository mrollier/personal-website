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

/** Paints the page window of `live` (a PW × PH torus) one pixel a cell into a bitmap, and the bitmap onto `ctx` at
 * (x, y, w, h) without smoothing, so every cell is a square. A live cell takes its level's ink, or `ink` on the field. */
export function mosaicPainter(m: Mosaic, ink: string): (ctx: CanvasRenderingContext2D, live: Uint8Array, x: number, y: number, w: number, h: number) => void {
  const off = document.createElement('canvas');
  off.width = m.W; off.height = m.H;
  const octx = off.getContext('2d')!, img = octx.createImageData(m.W, m.H), px = new Uint32Array(img.data.buffer);
  // colours as little-endian RGBA words: [field, grounds 1–7] when dead, [ink, inks 1–7] when alive
  const word = (h: string) => { const [r, g, b] = rgb(h); return (255 << 24) | (b << 16) | (g << 8) | r; };
  const dead = [m.field, ...m.grounds].map(word), alive = [ink, ...m.inks].map(word);
  return (ctx, live, x, y, w, h) => {
    for (let r = 0; r < m.H; r++) {
      const src = (r + m.M) * m.PW + m.M, dst = r * m.W;
      for (let c = 0; c < m.W; c++) { const g = m.ground[dst + c]; px[dst + c] = live[src + c] ? alive[g] : dead[g]; }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  };
}
