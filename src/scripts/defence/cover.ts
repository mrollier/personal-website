// The still-life art of slide C3 as Game of Life cells: a mosaic of one level built from the tiles of
// game-of-life-mosaics (the bank behind the site's background), empty on the left, where the text sits, and denser to
// the right. (The title and closing art is the multi-level mosaic of mosaic.ts.) Whole tile periods on a torus, so the grid is a still life everywhere, edges included.
import { makeRng } from '../net.ts';

export type Tiles = Record<string, string[]>; // src/data/tiles.json: per level, base64 bit-packed 6L × 6L tiles by population

export type Cells = { W: number; H: number; g: Uint8Array };

const banks = new Map<string, Uint8Array[]>(); // decoded once per level, however many slides ask
function bank(tiles: Tiles, level: number): Uint8Array[] {
  const key = String(level), hit = banks.get(key);
  if (hit) return hit;
  const out = tiles[level].map((b) => {
    const bytes = atob(b);
    return Uint8Array.from({ length: 36 * level * level }, (_, k) => (bytes.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1);
  });
  banks.set(key, out);
  return out;
}

/** tilesX × tilesY tile periods of level `level`; the density rises from nothing at `from` (share of the width) to the
 * densest tile at the right edge, along a line tilted by `theta`. Without `wrap` no tile crosses the edge of the torus, so a
 * view of the top-left part shows no tile cut in two; with or without, the grid is a still life. */
export function stillMosaic(tiles: Tiles, tilesX: number, tilesY: number, level: number, seed: number, from = 0.3, theta = -0.25, wrap = false): Cells {
  const size = 6 * level, half = 3 * level, W = tilesX * size, H = tilesY * size, g = new Uint8Array(W * H);
  const set = bank(tiles, level), pop = set.map((t) => t.reduce((a, b) => a + b, 0)), rnd = makeRng(seed);
  const f = (x: number, y: number) => Math.cos(theta) * x - Math.sin(theta) * y;
  const ends = [f(0, 0), f(W, 0), f(0, H), f(W, H)], lo = Math.min(...ends), hi = Math.max(...ends);
  const pmin = pop[0], pmax = pop[pop.length - 1];
  for (let j = 0; j < H / half; j++) for (let i = j % 2; i < W / half; i += 2) {
    const x = i * half, y = j * half;
    if (!wrap && (x + size > W || y + size > H)) continue; // a cropped view never shows a tile cut in two
    const u = (f(x + half, y + half) - lo) / (hi - lo), want = Math.max(0, (u - from) / (1 - from)) * pmax;
    if (want < pmin && rnd() > want / pmin) continue;
    let k = 0; while (k < pop.length - 1 && Math.abs(pop[k + 1] - want) <= Math.abs(pop[k] - want)) k++;
    let a = k, b = k; while (a > 0 && pop[a - 1] === pop[k]) a--; while (b < pop.length - 1 && pop[b + 1] === pop[k]) b++;
    const t = set[a + Math.floor(rnd() * (b - a + 1))];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (t[dy * size + dx]) g[((y + dy) % H) * W + ((x + dx) % W)] = 1;
  }
  return { W, H, g };
}

/** The live cells as squares of `cell` design pixels from (x0, y0), clipped to w × h. */
export function drawCells(ctx: CanvasRenderingContext2D, c: Cells, x0: number, y0: number, cell: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  const gap = cell > 5 ? Math.min(1.2, cell * 0.12) : 0;
  const nx = Math.min(c.W, Math.ceil(w / cell)), ny = Math.min(c.H, Math.ceil(h / cell));
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (c.g[y * c.W + x]) ctx.fillRect(x0 + x * cell, y0 + y * cell, cell - gap, cell - gap);
}
