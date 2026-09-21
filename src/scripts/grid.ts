// The parity rule on a square grid with wrapped edges (a torus): a cell's next state is the sum of
// its neighbours' states modulo 2, with or without its own state in the sum. Three neighbourhoods.
// Pure functions, no DOM.

export type Hood = 'vn' | 'moore' | 'vn2';
export type Shape = 'dot' | 'smiley' | 'heart' | 'star' | 'random';

type Offsets = [number, number][];
const within = (r: number, manhattan: boolean): Offsets => {
  const o: Offsets = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy) continue;
    if (!manhattan || Math.abs(dx) + Math.abs(dy) <= r) o.push([dx, dy]);
  }
  return o;
};

/** Cells counted as neighbours, as offsets from the cell itself (which is never in the list). */
export const HOODS: Record<Hood, { name: string; offsets: Offsets }> = {
  vn: { name: 'von Neumann', offsets: within(1, true) },        // the 4 edge neighbours
  moore: { name: 'Moore', offsets: within(1, false) },          // the 8 around
  vn2: { name: 'von Neumann, range 2', offsets: within(2, true) }, // the 12 within two steps along the grid
};

/** One generation of the parity rule; `self` adds the cell's own state to the sum. */
export function stepGrid(g: Uint8Array, W: number, H: number, hood: Hood, self: boolean): Uint8Array {
  const out = new Uint8Array(W * H), off = HOODS[hood].offsets;
  // wrapped offsets precomputed per row below; the inner loop only adds and masks
  const dx = off.map((o) => o[0]), dy = off.map((o) => o[1]), m = off.length;
  for (let y = 0; y < H; y++) {
    const rows = new Array<number>(m);
    for (let k = 0; k < m; k++) rows[k] = ((y + dy[k] + H) % H) * W;
    for (let x = 0; x < W; x++) {
      let s = self ? g[y * W + x] : 0;
      for (let k = 0; k < m; k++) s += g[rows[k] + ((x + dx[k] + W) % W)];
      out[y * W + x] = s & 1;
    }
  }
  return out;
}

/** Pixel art for the starting shapes; `#` is a live cell. Odd widths so they centre. */
export const SHAPES: Record<Exclude<Shape, 'dot' | 'random'>, string[]> = {
  smiley: [
    '...#####...',
    '..#.....#..',
    '.#.......#.',
    '#..#...#..#',
    '#.........#',
    '#.........#',
    '#.#.....#.#',
    '#..#...#..#',
    '.#..###..#.',
    '..#.....#..',
    '...#####...',
  ],
  heart: [
    '..##...##..',
    '.####.####.',
    '###########',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
  ],
  star: [
    '.....#.....',
    '.....#.....',
    '....###....',
    '....###....',
    '###########',
    '.#########.',
    '..#######..',
    '..#######..',
    '.###...###.',
    '.##.....##.',
    '#.........#',
  ],
};

/** A shape in the middle of an otherwise empty W x H grid, a single cell, or a fair coin per cell. */
export function seedGrid(W: number, H: number, shape: Shape, rnd: () => number = Math.random): Uint8Array {
  const g = new Uint8Array(W * H);
  if (shape === 'random') { for (let i = 0; i < g.length; i++) g[i] = rnd() < 0.5 ? 1 : 0; return g; }
  if (shape === 'dot') { g[(H >> 1) * W + (W >> 1)] = 1; return g; }
  const art = SHAPES[shape], h = art.length, w = art[0].length;
  const x0 = (W >> 1) - (w >> 1), y0 = (H >> 1) - (h >> 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (art[y][x] !== '#') continue;
    const gx = ((x0 + x) % W + W) % W, gy = ((y0 + y) % H + H) % H;
    g[gy * W + gx] = 1;
  }
  return g;
}

/** Live cells. */
export function count(g: Uint8Array): number {
  let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n;
}

export const clampSide = (n: number, def = 63) => Math.min(151, Math.max(9, Math.round(n) || def));
