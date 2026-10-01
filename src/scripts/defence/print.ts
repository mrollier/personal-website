// A network's fingerprint under a rule, live, as slide G2 draws it: three histograms over the last rounds of a run, after
// Miranda et al. (2016) and Ch. 9. The Shannon entropy of every node's row (0: always the same, 1: on half of the time),
// the Lempel–Ziv complexity of every node's row (./toy's lempelZiv: how many new pieces it takes to write the row down),
// and the neighbourhood density, the share of a node's neighbours that are on, over every node and round. A sliding
// window of the last 40 rounds, so a run that settles forgets how it got there. Bins: ten for the two row features, nine
// for the density (the rule's own nine intervals; with ten, a node with eight neighbours always leaves one empty). Pure.
import type { Net } from '../net.ts';
import { shannon, lempelZiv, histogram } from './toy.ts';

export const PRINT = {
  window: 40, burn: 5, minRow: 20,
  entropy: { lo: 0, hi: 1, bins: 10 },
  lz: { lo: 0.45, hi: 1.45, bins: 10 },
  density: { lo: 0, hi: 1, bins: 9 },
};
export type Feature = 'entropy' | 'lz' | 'density';
export type Print = Record<Feature, number[] | null>;

/** Rounds go in with `push`; `print` reads the histograms of the window so far (null for a row feature until the rows are
 * `minRow` long, and for everything during the burn-in). */
export function fingerprinter(net: Net) {
  const n = net.n, W = PRINT.window, rows: Uint8Array[] = [], dens: number[][] = [];
  let t = 0;
  return {
    reset() { rows.length = 0; dens.length = 0; t = 0; },
    push(s: Uint8Array) {
      t++;
      if (t <= PRINT.burn) return;
      rows.push(s.slice()); if (rows.length > W) rows.shift();
      const d: number[] = [];
      for (let i = 0; i < n; i++) { const k = net.deg[i]; if (!k) continue; let q = 0; for (const j of net.adj[i]) q += s[j]; d.push(q / k); }
      dens.push(d); if (dens.length > W) dens.shift();
    },
    print(): Print {
      const L = rows.length, row = new Uint8Array(L), per = (f: (r: Uint8Array) => number) => Array.from({ length: n }, (_, i) => { for (let k = 0; k < L; k++) row[k] = rows[k][i]; return f(row); });
      const { entropy, lz, density } = PRINT;
      return {
        entropy: L ? histogram(per(shannon), entropy.lo, entropy.hi, entropy.bins) : null,
        lz: L >= PRINT.minRow ? histogram(per(lempelZiv), lz.lo, lz.hi, lz.bins) : null,
        density: L ? histogram(dens.flat(), density.lo, density.hi, density.bins) : null,
      };
    },
  };
}
