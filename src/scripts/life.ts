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

/** Sets the live cells of a run-length encoded pattern (b dead, o alive, $ next row) with its top-left corner at (x0, y0). */
export function putRle(rle: string, g: Uint8Array, W: number, x0: number, y0: number): void {
  let x = 0, y = 0, n = '';
  for (const ch of rle) {
    if (ch >= '0' && ch <= '9') { n += ch; continue; }
    const k = n ? +n : 1; n = '';
    if (ch === 'b') x += k;
    else if (ch === 'o') { for (let i = 0; i < k; i++) g[(y0 + y) * W + x0 + x + i] = 1; x += k; }
    else if (ch === '$') { y += k; x = 0; }
  }
}

/** Bill Gosper's glider gun (36 × 9), firing a glider down and to the right every 30 generations, and the eater that
 * swallows them all when its top-left corner sits 74 cells right of and 60 below the gun's. */
export const GOSPER_GUN = '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!';
export const EATER = '2o$obo$2bo$2b2o!';
export const EATER_AT = [74, 60] as const;

/** A fair coin per cell, weighted. */
export function randomLife(W: number, H: number, rho: number, rnd: () => number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = rnd() < rho ? 1 : 0;
  return g;
}

export function population(g: Uint8Array): number { let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n; }

/** Life on a big torus that only looks where something can happen. A cell can only change if something in its 3 × 3
 * neighbourhood changed the tick before, so the grid is cut into 16 × 16 blocks and a tick recomputes the blocks that
 * changed last time plus their neighbours. A still life then costs nothing, and a glider costs only its surroundings.
 * `step` updates `g` in place and lists the blocks it changed in `hit` (count `hits`), for a partial repaint. */
export class ActiveLife {
  static readonly B = 16;
  readonly W: number;
  readonly H: number;
  readonly bw: number;
  readonly bh: number;
  readonly hit: Int32Array;
  hits = 0;
  private act: Uint8Array;
  private out: Uint8Array;

  constructor(W: number, H: number) {
    this.W = W; this.H = H;
    this.bw = Math.ceil(W / ActiveLife.B); this.bh = Math.ceil(H / ActiveLife.B);
    this.act = new Uint8Array(this.bw * this.bh).fill(1); this.hit = new Int32Array(this.bw * this.bh); this.out = new Uint8Array(W * H);
  }

  /** Look everywhere next tick, after the grid was replaced. */
  touchAll(): void { this.act.fill(1); }

  /** Look around cell (x, y) next tick, after it was edited. */
  touch(x: number, y: number): void {
    const B = ActiveLife.B, bx = Math.floor((((x % this.W) + this.W) % this.W) / B), by = Math.floor((((y % this.H) + this.H) % this.H) / B);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.act[((by + dy + this.bh) % this.bh) * this.bw + ((bx + dx + this.bw) % this.bw)] = 1;
  }

  /** One generation of Life in place; returns how many cells changed. */
  step(g: Uint8Array): number {
    const { W, H, bw, bh, act, out, hit } = this, B = ActiveLife.B;
    let changed = 0; this.hits = 0;
    for (let b = 0; b < act.length; b++) {
      if (!act[b]) continue;
      const x0 = (b % bw) * B, y0 = Math.floor(b / bw) * B, x1 = Math.min(W, x0 + B), y1 = Math.min(H, y0 + B);
      let c = 0;
      for (let y = y0; y < y1; y++) {
        const r = y * W, u = (y === 0 ? H - 1 : y - 1) * W, d = (y === H - 1 ? 0 : y + 1) * W;
        for (let x = x0; x < x1; x++) {
          const l = x === 0 ? W - 1 : x - 1, rt = x === W - 1 ? 0 : x + 1;
          const n = g[u + l] + g[u + x] + g[u + rt] + g[r + l] + g[r + rt] + g[d + l] + g[d + x] + g[d + rt];
          const s = g[r + x], v = n === 3 || (s && n === 2) ? 1 : 0;
          out[r + x] = v; if (v !== s) c++;
        }
      }
      if (c) { hit[this.hits++] = b; changed += c; }
    }
    // write back only the blocks that changed, then look at them and their neighbours next time
    act.fill(0);
    for (let h = 0; h < this.hits; h++) {
      const b = hit[h], bx = b % bw, by = Math.floor(b / bw), x0 = bx * B, y0 = by * B, x1 = Math.min(W, x0 + B), y1 = Math.min(H, y0 + B);
      for (let y = y0; y < y1; y++) g.set(out.subarray(y * W + x0, y * W + x1), y * W + x0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) act[((by + dy + bh) % bh) * bw + ((bx + dx + bw) % bw)] = 1;
    }
    return changed;
  }
}
