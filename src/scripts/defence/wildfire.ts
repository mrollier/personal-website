// A wildfire as a cellular automaton, for slide I2 (beyond this thesis): every cell is bare ground, a tree, a burning
// tree or a burnt one. A tree that catches burns for a while (8 to 14 rounds, drawn when it catches), and every round
// each burning tree among its eight neighbours sets it alight with a probability that a wind from the west raises
// downwind and lowers upwind (0.26 straight downwind, 0.04 across, 0.007 against), less across a corner. The fire starts
// in a few trees near the west side and leaves a scar that fans out downwind. Pure: the slide paints `kind`, `burnt`
// and `shade`.
import { makeRng } from '../net.ts';

export const FIRE = { W: 84, H: 84, trees: 0.8, burn: [8, 14] as const, p: 0.26, wind: 1.8, at: [9, 42] as const };
export const BARE = 0, TREE = 1, BURNING = 2, BURNT = 3;

export type Fire = {
  readonly W: number; readonly H: number;
  /** BARE, TREE, BURNING or BURNT per cell */
  kind: Uint8Array;
  /** for a burning tree, how far it has burnt, from 0 (just caught) to 1 (about to go out) */
  burnt(i: number): number;
  /** a little variety among the trees: 0, 1 or 2 */
  shade: Uint8Array;
  /** a new forest from `seed`, with the fire lit */
  plant(seed: number): void;
  /** one round; true once nothing burns any more */
  step(): boolean;
  readonly burning: number;
};

export function wildfire(W = FIRE.W, H = FIRE.H): Fire {
  const n = W * H, kind = new Uint8Array(n), shade = new Uint8Array(n), age = new Uint8Array(n), dur = new Uint8Array(n);
  const caught: number[] = [];
  let rnd = makeRng(1), burning = 0;
  // the chance per round that a burning neighbour at (dx, dy) lights a tree: the wind blows towards +x
  const pull = new Float32Array(9);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const d = Math.hypot(dx, dy), down = -dx / d; // the fire comes from (x + dx), so it travels in direction −dx
    pull[(dy + 1) * 3 + dx + 1] = (FIRE.p * Math.exp(FIRE.wind * (down - 1))) / d;
  }
  const light = (i: number) => { kind[i] = BURNING; age[i] = 0; dur[i] = FIRE.burn[0] + Math.floor(rnd() * (FIRE.burn[1] - FIRE.burn[0] + 1)); burning++; };
  return {
    W, H, kind, shade,
    get burning() { return burning; },
    burnt: (i) => age[i] / dur[i],
    plant(seed) {
      const r = makeRng(seed);
      for (let i = 0; i < n; i++) { kind[i] = r() < FIRE.trees ? TREE : BARE; shade[i] = Math.floor(r() * 3); }
      rnd = makeRng(seed ^ 0x5bd1e995); burning = 0;
      const [x0, y0] = FIRE.at;
      for (let y = y0 - 2; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 2; x++) if (Math.hypot(x - x0, y - y0) <= 2.2) light(y * W + x);
    },
    step() {
      caught.length = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (kind[i] !== TREE) continue;
        let spare = 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if ((dx || dy) && xx >= 0 && yy >= 0 && xx < W && yy < H && kind[yy * W + xx] === BURNING) spare *= 1 - pull[(dy + 1) * 3 + dx + 1];
        }
        if (spare < 1 && rnd() > spare) caught.push(i);
      }
      for (let i = 0; i < n; i++) if (kind[i] === BURNING && ++age[i] >= dur[i]) { kind[i] = BURNT; burning--; }
      for (const i of caught) light(i);
      return burning === 0;
    },
  };
}
