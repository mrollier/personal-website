// Still-life mosaics of several levels, packed live in the browser the way the thesis cover is packed
// (game-of-life-mosaics/studies/cover/cover.py), for the still-life slide and the tiles in the corners of the slides.
//
// The pond lattice: every tile's frame is a ring of ponds, each in the 6 × 6 block at cells (3a, 3b) with a + b even.
// A level-L tile (6L × 6L cells, from src/data/tiles.json; level 1 is one pond) covers a diamond of L × L pond
// vertices, and tiles of any levels on vertex-disjoint diamonds form a still life: where two tiles meet, every cell sees
// only frame ponds and cells that stay dead. So a packing only has to keep the diamonds apart.
import { makeRng } from '../net.ts';

export type Tiles = Record<string, string[]>; // src/data/tiles.json: per level, base64 bit-packed 6L × 6L tiles by population
export type Cells = { W: number; H: number; g: Uint8Array };
/** A packed mosaic on a W × H torus: the live cells, and each cell's ground level (0 = field, else its tile's level). */
export type Packed = Cells & { ground: Uint8Array };

const POND = ['......', '..##..', '.#..#.', '.#..#.', '..##..', '......'];
const banks = new Map<number, Uint8Array[]>(); // decoded once per level, however many slides ask
/** The tiles of one level, sparsest first. Level 1 is the pond. */
export function bank(tiles: Tiles, level: number): Uint8Array[] {
  const hit = banks.get(level);
  if (hit) return hit;
  const out = level === 1
    ? [Uint8Array.from(POND.join(''), (c) => (c === '#' ? 1 : 0))]
    : tiles[level].map((b) => {
      const bytes = atob(b);
      return Uint8Array.from({ length: 36 * level * level }, (_, k) => (bytes.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1);
    });
  banks.set(level, out);
  return out;
}

/** The pond vertices a level-L tile with its top-left cell at (3·i, 3·j) covers, as block offsets from (i, j). Its
 * top pond sits at (L − 1, 0); the placement is legal when i + j + L − 1 is even. */
function diamond(L: number): [number, number][] {
  const out: [number, number][] = [];
  for (let q = 0; q <= 2 * L - 2; q++) for (let p = 0; p <= 2 * L - 2; p++)
    if (Math.abs(p - (L - 1)) + Math.abs(q - (L - 1)) <= L - 1 && (p + q + L - 1) % 2 === 0) out.push([p, q]);
  return out;
}

/** Whether every cell of the level-L diamond with its top-left corner at (x0, y0) is clear. */
function fits(x0: number, y0: number, L: number, W: number, H: number, clear: (x: number, y: number) => boolean): boolean {
  const c = 3 * L;
  for (let dy = 0; dy < 2 * c; dy++) for (let dx = 0; dx < 2 * c; dx++)
    if (Math.abs(dx + 0.5 - c) + Math.abs(dy + 0.5 - c) <= c && !clear((x0 + dx) % W, (y0 + dy) % H)) return false;
  return true;
}

/** Smooth value noise in [0, 1] on a torus of W × H cells, features about `scale` cells wide. */
export function noise(W: number, H: number, scale: number, rnd: () => number): (x: number, y: number) => number {
  const nx = Math.max(2, Math.round(W / scale)), ny = Math.max(2, Math.round(H / scale));
  const v = Float32Array.from({ length: nx * ny }, () => rnd());
  const at = (i: number, j: number) => v[(((j % ny) + ny) % ny) * nx + (((i % nx) + nx) % nx)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const u = (x / W) * nx, w = (y / H) * ny, i = Math.floor(u), j = Math.floor(w), a = s(u - i), b = s(w - j);
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  };
}

/** Packs a W × H torus (both multiples of 6) with tiles of `levels`, biggest first: a level-L tile goes where the height
 * `z` at its centre is at least `at[L]`, on a diamond no other tile touches, and ponds (level 1) scatter where z is at
 * least `at[1]`, more of them the higher it stands; no tile covers a cell where `clear` is false. Tiles are drawn at
 * random from each level's bank. */
export function pack(tiles: Tiles, W: number, H: number, z: (x: number, y: number) => number, at: Record<number, number>, seed: number, clear: (x: number, y: number) => boolean = () => true): Packed {
  const A = W / 3, B = H / 3, used = new Uint8Array(A * B), g = new Uint8Array(W * H), ground = new Uint8Array(W * H), rnd = makeRng(seed);
  const levels = Object.keys(at).map(Number).sort((a, b) => b - a);
  for (const L of levels) {
    const set = bank(tiles, L), dia = diamond(L), size = 6 * L;
    const spots: [number, number][] = [];
    for (let j = 0; j < B; j++) for (let i = 0; i < A; i++) if ((i + j + L - 1) % 2 === 0) spots.push([i, j]);
    for (let k = spots.length - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [spots[k], spots[r]] = [spots[r], spots[k]]; }
    for (const [i, j] of spots) {
      const h = z((3 * i + 3 * L) % W, (3 * j + 3 * L) % H);
      if (h < at[L] || (L === 1 && rnd() > Math.min(1, (h - at[1]) * 6))) continue;
      if (dia.some(([p, q]) => used[((j + q) % B) * A + ((i + p) % A)])) continue;
      if (!fits(3 * i, 3 * j, L, W, H, clear)) continue;
      for (const [p, q] of dia) used[((j + q) % B) * A + ((i + p) % A)] = 1;
      const t = set[Math.floor(rnd() * set.length)], c = 3 * L;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const x = (3 * i + dx) % W, y = (3 * j + dy) % H;
        if (Math.abs(dx + 0.5 - c) + Math.abs(dy + 0.5 - c) <= c) ground[y * W + x] = L;
        if (t[dy * size + dx]) g[y * W + x] = 1;
      }
    }
  }
  return { W, H, g, ground };
}

/** The live cells as squares of `cell` design pixels from (x0, y0), clipped to w × h. */
export function drawCells(ctx: CanvasRenderingContext2D, c: Cells, x0: number, y0: number, cell: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  const gap = cell > 5 ? Math.min(1.2, cell * 0.12) : 0;
  const nx = Math.min(c.W, Math.ceil(w / cell)), ny = Math.min(c.H, Math.ceil(h / cell));
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (c.g[y * c.W + x]) ctx.fillRect(x0 + x * cell, y0 + y * cell, cell - gap, cell - gap);
}
