// The room as a network (slide F1): eighty seats in ten rows of eight, everyone linked to the people around them (up to
// eight: fewer at the walls), then each link rewired with probability p: one end stays, the other jumps to a random seat,
// as in Watts–Strogatz. Monotone in p: every link has its own threshold and its own list of seats to jump to, and a
// link never lands on a pair of seats that already sit side by side, so the link rewired at p is rewired the same way at
// every larger p, and a slider only adds or removes jumps. Pure, no DOM.
import { makeRng } from '../net.ts';

export const COLS = 8, ROWS = 10, SEATS = COLS * ROWS;

export type Room = {
  /** Each link: the seat that stays, and the seat it joins at p = 0. */
  links: { stay: number; home: number; at: number; jumps: number[] }[];
};

export function room(seed: number): Room {
  const rnd = makeRng(seed), links: Room['links'] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const c2 = c + dc, r2 = r + dr;
      if (c2 < 0 || c2 >= COLS || r2 >= ROWS) continue;
      const a = r * COLS + c, b = r2 * COLS + c2, flip = rnd() < 0.5;
      links.push({ stay: flip ? b : a, home: flip ? a : b, at: rnd(), jumps: Array.from({ length: 12 }, () => Math.floor(rnd() * SEATS)) });
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
