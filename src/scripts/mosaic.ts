// Game of Life mosaics (App. D of the thesis): a bank of diamond-shaped still-life tiles of one level,
// decoded from src/data/tiles.json; a greyscale image sampled once per diamond on two interlocking
// diagonal sub-grids; each sample matched to the tile of nearest density; the tiles assembled into one
// big still life. The bank's JSON is passed in, never imported, so this runs in node too. Pure, no DOM.

export type TileBank = { level: number; size: number; tiles: Uint8Array[]; density: Float64Array; order: number[] };

/** Bits of a 6ℓ × 6ℓ tile from its base64 string, row-major, most significant bit first. */
export function decodeTile(b64: string, size: number): Uint8Array {
  const bin = atob(b64), out = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return out;
}

export function loadBank(json: Record<string, string[]>, level: number): TileBank {
  const size = 6 * level, tiles = (json[String(level)] ?? []).map((s) => decodeTile(s, size));
  const density = Float64Array.from(tiles, (t) => t.reduce((a, b) => a + b, 0) / t.length);
  const order = tiles.map((_, i) => i).sort((a, b) => density[a] - density[b]);
  return { level, size, tiles, density, order };
}

export type Grey = { data: Float32Array; w: number; h: number }; // 0 dark … 1 light

/** Mean grey of the source over the box that a diamond covers, the source stretched to the mosaic's square. */
function sample(img: Grey, cx: number, cy: number, half: number, side: number): number {
  const x0 = Math.max(0, Math.floor(((cx - half) / side) * img.w)), x1 = Math.min(img.w, Math.ceil(((cx + half) / side) * img.w));
  const y0 = Math.max(0, Math.floor(((cy - half) / side) * img.h)), y1 = Math.min(img.h, Math.ceil(((cy + half) / side) * img.h));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += img.data[y * img.w + x]; n++; }
  return n ? s / n : 1;
}

/** The tile whose normalised density is nearest to v′ = 1 − v/θ; ties broken at random. Null when v is beyond the cutoff. */
export function pickTile(bank: TileBank, v: number, theta: number, rnd: () => number): number | null {
  if (v > theta || !bank.tiles.length) return null;
  const want = 1 - v / theta, dmin = bank.density[bank.order[0]], dmax = bank.density[bank.order[bank.order.length - 1]], span = dmax - dmin || 1;
  let best = Infinity, cands: number[] = [];
  for (let i = 0; i < bank.tiles.length; i++) {
    const d = Math.abs((bank.density[i] - dmin) / span - want);
    if (d < best - 1e-9) { best = d; cands = [i]; } else if (Math.abs(d - best) < 1e-9) cands.push(i);
  }
  return cands[Math.floor(rnd() * cands.length)];
}

export type Mosaic = { grid: Uint8Array; W: number; H: number; placed: number; empty: number };

/** g diamonds across on one sub-grid and g − 1 on the other, offset by half a tile, on a square of g tiles a side. Tiles are ORed
 * in; where two diamonds meet they share their lake edge, so the whole stays a still life. `invert` swaps light and dark. */
export function assemble(img: Grey, g: number, bank: TileBank, theta: number, invert: boolean, rnd: () => number): Mosaic {
  const S = bank.size, W = g * S, H = g * S, grid = new Uint8Array(W * H), half = S / 2;
  let placed = 0, empty = 0;
  const put = (cx: number, cy: number) => {
    let v = sample(img, cx, cy, half, W); if (invert) v = 1 - v;
    const k = pickTile(bank, v, theta, rnd);
    if (k === null) { empty++; return; }
    const tile = bank.tiles[k], x0 = Math.round(cx - half), y0 = Math.round(cy - half);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (tile[y * S + x]) { const gx = x0 + x, gy = y0 + y; if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy * W + gx] = 1; }
    placed++;
  };
  for (let b = 0; b < g; b++) for (let a = 0; a < g; a++) put((a + 0.5) * S, (b + 0.5) * S);
  for (let b = 0; b < g - 1; b++) for (let a = 0; a < g - 1; a++) put((a + 1) * S, (b + 1) * S);
  return { grid, W, H, placed, empty };
}

/** A synthetic portrait to test with: a soft disc on a light ground. */
export function testImage(w: number, h: number): Grey {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x + 0.5) / w - 0.5, dy = (y + 0.5) / h - 0.5, r = Math.hypot(dx, dy); data[y * w + x] = Math.min(1, Math.max(0, (r - 0.15) / 0.3)); }
  return { data, w, h };
}
