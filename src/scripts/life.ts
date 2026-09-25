// Life-like cellular automata on a W × H torus with the Moore neighbourhood, fast enough for a few
// hundred cells a side at frame rate: born and survive sets as bitmasks over the neighbour count 0–8,
// so Conway's Life is B = 8 (exactly three), S = 12 (two or three). Pure, no DOM.

/** One generation into `out`; returns how many cells changed, so a still life reports 0. */
export function stepLifeLike(g: Uint8Array, W: number, H: number, out: Uint8Array, B: number, S: number): number {
  let changed = 0;
  for (let y = 0; y < H; y++) {
    const r = y * W, u = (y === 0 ? H - 1 : y - 1) * W, d = (y === H - 1 ? 0 : y + 1) * W;
    for (let x = 0; x < W; x++) {
      const l = x === 0 ? W - 1 : x - 1, rt = x === W - 1 ? 0 : x + 1;
      const n = g[u + l] + g[u + x] + g[u + rt] + g[r + l] + g[r + rt] + g[d + l] + g[d + x] + g[d + rt];
      const s = g[r + x], v = ((s ? S : B) >> n) & 1;
      out[r + x] = v; if (v !== s) changed++;
    }
  }
  return changed;
}

export const LIFE = { B: 8, S: 12 };
export const stepLife = (g: Uint8Array, W: number, H: number, out: Uint8Array) => stepLifeLike(g, W, H, out, LIFE.B, LIFE.S);

/** A glider heading down and to the right, its top-left corner at (x, y). */
export function glider(g: Uint8Array, W: number, H: number, x: number, y: number): void {
  for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) g[((y + dy + H) % H) * W + ((x + dx + W) % W)] = 1;
}

/** A fair coin per cell, weighted. */
export function randomLife(W: number, H: number, rho: number, rnd: () => number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = rnd() < rho ? 1 : 0;
  return g;
}

export function population(g: Uint8Array): number { let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n; }
