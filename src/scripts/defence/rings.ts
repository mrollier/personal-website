// The geometry of the rule rings (src/scripts/defence/donut.ts draws them): each ring is the share of a node's
// neighbours that are on, clockwise from 0 just right of the top to 1 just left of it, cut into the r equal intervals of
// the thesis (Ch. 5). Pure, so npm test can check it.

/** Centre, outer radius and width of a ring, and whether its node is on (the survive ring) or off (the born ring). */
export type Ring = { x: number; y: number; R: number; w: number; on: boolean };
/** A rule as the rings show it: the resolution, and the born and survive intervals as bitmasks. */
export type Rule = { r: number; B: number; S: number };

export const GAP = 0.3; // radians left open at the top, between 0 and 1
export const SEP = 0.035; // radians between two intervals
/** The angle of a share of neighbours on, clockwise from the top. */
export const angle = (share: number) => -Math.PI / 2 + GAP / 2 + share * (2 * Math.PI - GAP);

/** The intervals chosen in `mask` at resolution `from`, carried over to resolution `to`: an interval is chosen when its
 * middle lies in a chosen one. Both resolutions are odd, so a middle never falls on a boundary. */
export function remap(mask: number, from: number, to: number): number {
  if (from === to) return mask;
  let out = 0;
  for (let i = 0; i < to; i++) if ((mask >> Math.floor(((i + 0.5) / to) * from)) & 1) out |= 1 << i;
  return out;
}

/** The interval of ring `g` under the point (x, y), or −1. */
export function hitRing(g: Ring, r: number, x: number, y: number): number {
  const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
  if (d < g.R - g.w - 6 || d > g.R + g.w * 0.14 + 10) return -1;
  let a = Math.atan2(dy, dx) - angle(0);
  while (a < 0) a += 2 * Math.PI;
  const share = a / (2 * Math.PI - GAP);
  return share > 1 ? -1 : Math.min(r - 1, Math.floor(share * r));
}
