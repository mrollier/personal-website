// The mission of the synchronisation chapter's second half (Ch. 6): from a random start, every node the same colour.
// One run, a round at a time, judged the same way by the slides (Needle.astro), by scripts/defence/precompute.ts and
// by the checks: it succeeds once every node is on or every node is off (a consensus-seeking rule then stays there),
// and fails once it repeats itself every round or every other round (stuck in patches, a few nodes perhaps blinking)
// or at the limit (still churning). Pure.
import type { Net } from '../net.ts';
import { type Rule, step, density } from '../llna.ts';

export const WINNER: Rule = { r: 9, B: 488, S: 464 }; // Ch. 6's best on rewired grids, k = 8, p = 0.2
export const THRESHOLD: Rule = { r: 9, B: 480, S: 496 }; // do what most of your neighbours do: one of the 27, yet stuck
export const LIMIT = 300;

export type Outcome = { ok: boolean; tick: number };
export type Agreement = { readonly state: Uint8Array; readonly round: number; next(): Outcome | null };

/** A run of `rule` on `net` from `start` (copied). `next` plays one round and returns the outcome once it is in. */
export function agreement(net: Net, rule: Rule, start: Uint8Array, limit = LIMIT): Agreement {
  let a = start.slice(), b = new Uint8Array(net.n), c = new Uint8Array(net.n), t = 0; // c: two rounds ago
  return {
    get state() { return a; },
    get round() { return t; },
    next() {
      step(a, net, rule, b); t++;
      let p1 = true, p2 = t >= 2;
      for (let i = 0; i < net.n && (p1 || p2); i++) { if (b[i] !== a[i]) p1 = false; if (b[i] !== c[i]) p2 = false; }
      [c, a, b] = [a, b, c];
      const d = density(a);
      if (d === 0 || d === 1) return { ok: true, tick: t };
      if (p1 || p2 || t >= limit) return { ok: false, tick: t };
      return null;
    },
  };
}

/** The whole run at once. */
export function agree(net: Net, rule: Rule, start: Uint8Array, limit = LIMIT): Outcome {
  const run = agreement(net, rule, start, limit);
  for (;;) { const o = run.next(); if (o) return o; }
}
