// The room as a network (slide F1): eighty seats in ten rows of eight, everyone linked to the eight people around them,
// the room wrapping round at its edges (a torus: the back row also sits in front of the front row, the left end of a
// row next to its right end), then each link rewired with probability p: one end stays, the other jumps to a random
// seat, as in Watts–Strogatz. Monotone in p: every link has its own threshold and its own list of seats to jump to, and a
// link never lands on a pair of seats that already sit side by side, so the link rewired at p is rewired the same way at
// every larger p, and a slider only adds or removes jumps. Pure, no DOM.
import { makeRng } from '../net.ts';

export const COLS = 8, ROWS = 10, SEATS = COLS * ROWS;

export type Room = {
  /** Each link: the seat that stays, the seat it joins at p = 0, and which way that seat lies from the one that stays,
   * in seats across and down (−1, 0 or 1; across an edge of the room, the way out over that edge). */
  links: { stay: number; home: number; dx: number; dy: number; at: number; jumps: number[] }[];
};

export function room(seed: number): Room {
  const rnd = makeRng(seed), links: Room['links'] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const a = r * COLS + c, b = ((r + dr) % ROWS) * COLS + (c + dc + COLS) % COLS, flip = rnd() < 0.5;
      links.push({ stay: flip ? b : a, home: flip ? a : b, dx: flip ? -dc : dc, dy: flip ? -dr : dr, at: rnd(), jumps: Array.from({ length: 12 }, () => Math.floor(rnd() * SEATS)) });
    }
  }
  return { links };
}

/** Where each link's moving end sits at rewiring probability p. */
export function wire(room: Room, p: number): number[] {
  const key = (i: number, j: number) => (i < j ? i * SEATS + j : j * SEATS + i);
  const taken = new Set(room.links.map((l) => key(l.stay, l.home)));
  const to = room.links.map((l) => l.home);
  const order = room.links.map((_, k) => k).filter((k) => room.links[k].at < p).sort((a, b) => room.links[a].at - room.links[b].at);
  for (const k of order) {
    const l = room.links[k], j = l.jumps.find((j) => j !== l.stay && !taken.has(key(l.stay, j)));
    if (j === undefined) continue;
    taken.add(key(l.stay, j)); to[k] = j;
  }
  return to;
}

/** Contacts per seat for the ends `to` of `wire`. */
export function degrees(room: Room, to: number[]): number[] {
  const d = new Array(SEATS).fill(0);
  room.links.forEach((l, k) => { d[l.stay]++; d[to[k]]++; });
  return d;
}
