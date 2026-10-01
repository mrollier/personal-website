// The impact chapter's network (Stubborn.astro H1–H3, the closing slides, scripts/defence/precompute.ts clamp.json): a
// toy village of 100 people, built so that the best-connected are not the most important. A centre of 40 people who
// know each other at random (about ten contacts each); 57 people on the outskirts in couples, each knowing their
// partner, two people in the centre and one of three well-known people (in turn); the three well-known people also
// know two people in the centre each, and have the most contacts of anyone (21). Their many contacts also hear from the
// centre, so under the consensus-seeking rule they follow the centre, and making a well-known person stubborn sways
// less of the village than making one of the centre's busier people stubborn. Found by a search over seeds and village
// shapes (round 17); an illustration, not a model of a real village. Pure.
import { build, layout, makeRng, type Net } from '../net.ts';

export const VILLAGE = { n: 100, centre: 40, centreDegree: 10, known: 3, household: 2, outToCentre: 2, knownToCentre: 2, seed: 10, layoutSeed: 167 };

/** The village's links, from its seed. */
export function villageEdges(p = VILLAGE): [number, number][] {
  const rnd = makeRng(p.seed), n = p.n, seen = new Set<number>(), edges: [number, number][] = [];
  const add = (i: number, j: number) => {
    if (i === j) return false;
    const a = Math.min(i, j), b = Math.max(i, j);
    if (seen.has(a * n + b)) return false;
    seen.add(a * n + b); edges.push([a, b]);
    return true;
  };
  const inCentre = () => Math.floor(rnd() * p.centre);
  // the centre: every pair linked with the same small probability
  const q = p.centreDegree / (p.centre - 1);
  for (let i = 0; i < p.centre; i++) for (let j = i + 1; j < p.centre; j++) if (rnd() < q) add(i, j);
  // the well-known people, and the centre people they know
  const known = Array.from({ length: p.known }, (_, h) => p.centre + h), out0 = p.centre + p.known, outskirts = n - out0;
  for (const h of known) for (let c = 0; c < p.knownToCentre;) if (add(h, inCentre())) c++;
  // the outskirts, in households (consecutive), each knowing two in the centre and one well-known person, in turn
  for (let o = 0; o < outskirts; o++) {
    const v = out0 + o, first = o - (o % p.household);
    for (let w = first; w < Math.min(outskirts, first + p.household); w++) if (w !== o) add(v, out0 + w);
    for (let c = 0; c < p.outToCentre;) if (add(v, inCentre())) c++;
    add(v, known[o % p.known]);
  }
  return edges;
}

/** The village as a network, laid out by force in the unit square, with its own seed: one of the few that keep the three
 * most important and the three best-connected villagers apart, so their rings on slide H3 do not touch. */
export function villageNet(p = VILLAGE): Net {
  const net = build('ba', p.n, villageEdges(p));
  layout(net, makeRng(p.layoutSeed), 250);
  return net;
}
