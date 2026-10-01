// The geometry of the rule rings (src/scripts/defence/donut.ts draws them): each ring is the share of a node's
// neighbours that are on, clockwise from 0 just right of the top to 1 just left of it, cut into the r equal intervals of
// the thesis, side by side. Which ends an interval includes follows the thesis (Ch. 5, App. C): at odd r the intervals
// below ½ include their left end, those above ½ their right end, and the middle one both; at even r the born ring uses
// R⁺ (the interval just left of ½ takes ½) and the survive ring R⁻ (the one just right of ½ does), which is what lets
// every rule have a cousin at any r. Pure, so npm test can check it.

/** Centre, outer radius and width of a ring, and whether its node is on (the survive ring) or off (the born ring). */
export type Ring = { x: number; y: number; R: number; w: number; on: boolean };
/** A rule as the rings show it: the resolution, and the born and survive intervals as bitmasks. */
export type Rule = { r: number; B: number; S: number };

export const GAP = 0.2; // radians left open at the top, between 0 and 1
/** The angle of a share of neighbours on, clockwise from the top. */
export const angle = (share: number) => -Math.PI / 2 + GAP / 2 + share * (2 * Math.PI - GAP);

/** Which ends of interval k (of r) the ring of a node that is `on` includes: [left, right]. */
export function ends(k: number, r: number, on: boolean): [boolean, boolean] {
  const m = r % 2 ? (r - 1) / 2 : on ? r / 2 : r / 2 - 1; // the interval that includes both of its ends
  return [k <= m, k >= m];
}

/** The interval of the ring of a node that is `on`, at resolution r, that holds the share x. */
export function intervalOf(x: number, r: number, on: boolean): number {
  const u = x * r, j = Math.round(u);
  if (Math.abs(u - j) < 1e-9 && j > 0 && j < r) return ends(j, r, on)[0] ? j : j - 1;
  return Math.min(r - 1, Math.max(0, Math.floor(u)));
}

/** The intervals chosen in `mask` at resolution `from`, carried over to resolution `to` on the ring of a node that is
 * `on`: an interval is chosen when its middle lies in a chosen one. */
export function remap(mask: number, from: number, to: number, on = false): number {
  if (from === to) return mask;
  let out = 0;
  for (let i = 0; i < to; i++) if ((mask >> intervalOf((i + 0.5) / to, from, on)) & 1) out |= 1 << i;
  return out;
}

const mirror = (x: number, r: number) => { let y = 0; for (let i = 0; i < r; i++) if ((x >> i) & 1) y |= 1 << (r - 1 - i); return y; };
/** The rule's cousin, the thesis's equivalent rule (Ch. 5, App. C): it behaves exactly the same with on and off
 * swapped. Born becomes the complement of survive read backwards, and survive the complement of born read backwards. */
export function cousin({ r, B, S }: Rule): Rule {
  const all = (1 << r) - 1;
  return { r, B: all & ~mirror(S, r), S: all & ~mirror(B, r) };
}

/** The interval of ring `g` under the point (x, y), or −1. */
export function hitRing(g: Ring, r: number, x: number, y: number): number {
  const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
  if (d < g.R - g.w - 6 || d > g.R + 10) return -1;
  let a = Math.atan2(dy, dx) - angle(0);
  while (a < 0) a += 2 * Math.PI;
  const share = a / (2 * Math.PI - GAP);
  return share > 1 ? -1 : Math.min(r - 1, Math.floor(share * r));
}
