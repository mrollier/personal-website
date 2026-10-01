// The importance slide's second structural measure (Stubborn.astro H2): the average degree of a node's neighbours, the
// measure that in Ch. 10 goes least with the dynamical importance score (on some scale-free networks even against it),
// and its rank correlation with the score on the slide's network. Pure; npm test checks both numbers the say text quotes.
import { spearman } from '../stats.ts';

type Clamp = { edges: number[][]; deg: number[]; eta: number[] };

/** Every node's average neighbour degree. */
export function neighbourDegree({ edges, deg }: Clamp): number[] {
  const sum = new Array<number>(deg.length).fill(0);
  for (const [i, j] of edges) { sum[i] += deg[j]; sum[j] += deg[i]; }
  return sum.map((v, i) => v / deg[i]);
}

/** Spearman's rank correlation between the score and the average neighbour degree. */
export const knnSpearman = (c: Clamp): number => spearman(c.eta, neighbourDegree(c));
