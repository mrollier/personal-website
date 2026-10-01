// A network's fingerprint under a rule, live, as slide G2 draws it: three histograms over the whole run so far, as
// Miranda et al. (2016) and Ch. 9 take them over the whole pattern from the start, for the thesis's T = 100 timesteps.
// The Shannon entropy of every node's row (0: always the same, 1: on half of the time), the Lempel–Ziv complexity of
// every node's row (./toy's lempelZiv: how many new pieces it takes to write the row down), and the neighbourhood
// density, the share of a node's neighbours that are on, over every node and timestep. Nothing is forgotten, so once a
// run settles its histograms only drift towards their end, steadily. Bins: ten for the two row features, nine for the
// density (the rule's own nine intervals; with ten, a node with eight neighbours always leaves one empty). Pure.
import type { Net } from '../net.ts';
import { shannon, lempelZiv, histogram } from './toy.ts';

export const PRINT = {
  T: 100, minRow: 5,
  entropy: { lo: 0, hi: 1, bins: 10 },
  lz: { lo: 0.45, hi: 1.45, bins: 10 },
  density: { lo: 0, hi: 1, bins: 9 },
};
export type Feature = 'entropy' | 'lz' | 'density';
export type Print = Record<Feature, number[] | null>;

/** The start and every timestep after it go in with `push`; `print` reads the histograms of the run so far (null until
 * the rows are `minRow` long); `t` is the last timestep in. */
export function fingerprinter(net: Net) {
  const n = net.n, rows: Uint8Array[] = [], dens: number[] = [];
  return {
    get t() { return rows.length - 1; },
    reset() { rows.length = 0; dens.length = 0; },
    push(s: Uint8Array) {
      rows.push(s.slice());
      for (let i = 0; i < n; i++) { const k = net.deg[i]; if (!k) continue; let q = 0; for (const j of net.adj[i]) q += s[j]; dens.push(q / k); }
    },
    print(): Print {
      const L = rows.length, row = new Uint8Array(L), per = (f: (r: Uint8Array) => number) => Array.from({ length: n }, (_, i) => { for (let k = 0; k < L; k++) row[k] = rows[k][i]; return f(row); });
      if (L < PRINT.minRow) return { entropy: null, lz: null, density: null };
      const { entropy, lz, density } = PRINT;
      return {
        entropy: histogram(per(shannon), entropy.lo, entropy.hi, entropy.bins),
        lz: histogram(per(lempelZiv), lz.lo, lz.hi, lz.bins),
        density: histogram(dens, density.lo, density.hi, density.bins),
      };
    },
  };
}
