// The genotype of a Life-like network automaton rule (Chs. 5, 6 and 9 of the thesis): Boolean
// sensitivity split into identity and neighbourhood sensitivity, the Derrida map, the bound that ties
// sensitivity to the Hamming weight, the rules that are their own equivalent, the mean-field conditions
// that pick synchronisers and consensus-seekers, one representative per equivalence pair, and the
// jaggedness of a diagram. Pure, no DOM, safe in a worker.
import { type Rule, phi, binomial, meanField, equivalent, mirror } from './llna.ts';
import { choose } from './stats.ts';

export type Sens = { BS: number; IS: number; NS: number };

/** BS_k, Eq. (5.4), with its two parts: IS, whether toggling the node's own state changes the outcome, and NS,
 * whether one neighbour more or fewer does, weighted by how many neighbours could be that one. Averaged over all
 * 2^(k+1) inputs, so it is also the mean row sum of the Jacobian at density ½. */
export function sensitivity(rule: Rule, k: number): Sens {
  let IS = 0, NS = 0;
  for (let q = 0; q <= k; q++) {
    const w = binomial(k, q) / 2;
    for (const s of [0, 1]) {
      const here = phi(s, q, k, rule);
      IS += w * (here ^ phi(s ^ 1, q, k, rule));
      const down = q > 0 ? here ^ phi(s, q - 1, k, rule) : 0, up = q < k ? here ^ phi(s, q + 1, k, rule) : 0;
      NS += w * (q * down + (k - q) * up);
    }
  }
  return { BS: IS + NS, IS, NS };
}

/** BS_k ≤ 2(k + 1) min(HW_k, 1 − HW_k), Eq. (5.6): every output-changing flip joins a 1-input to a 0-input. */
export const bound = (hw: number, k: number) => 2 * (k + 1) * Math.min(hw, 1 - hw);

/** ⟨δ^{t+1}⟩ for degree k, Eq. (5.5): two configurations at density ρ that differ in a share δ of the nodes, each node and
 * each defect placed independently; the expected share that differs after one tick. At ρ = ½ the slope at δ = 0 is BS_k. */
export function derrida(rule: Rule, k: number, rho: number, delta: number): number {
  return derridaAt(derridaCoeffs(rule, k, rho), delta);
}

/** Everything in the Derrida map that does not depend on δ: for each number d of toggled neighbours, the chance of a
 * different output when the node keeps its state (A) and when it is toggled too (B). Computed once per rule, degree and
 * density, the curve is then O(k) per point, which keeps a slider over k smooth. */
export function derridaCoeffs(rule: Rule, k: number, rho: number): { k: number; A: Float64Array; B: Float64Array } {
  const A = new Float64Array(k + 1), B = new Float64Array(k + 1);
  for (let q = 0; q <= k; q++) {
    const pq = choose(k, q) * rho ** q * (1 - rho) ** (k - q); if (pq === 0) continue;
    for (let d = 0; d <= k; d++) {
      const lo = Math.max(0, d + q - k), hi = Math.min(d, q), ckd = choose(k, d);
      for (let tau = lo; tau <= hi; tau++) {
        const pt = (choose(q, tau) * choose(k - q, d - tau)) / ckd, q2 = q - 2 * tau + d;
        for (const s of [0, 1]) {
          const ps = s ? rho : 1 - rho; if (ps === 0) continue;
          const here = phi(s, q, k, rule), w = pq * pt * ps;
          A[d] += w * (here ^ phi(s, q2, k, rule)); // the node itself keeps its state
          B[d] += w * (here ^ phi(s ^ 1, q2, k, rule)); // it is toggled too
        }
      }
    }
  }
  return { k, A, B };
}

export function derridaAt(c: { k: number; A: Float64Array; B: Float64Array }, delta: number): number {
  if (delta <= 0) return 0;
  const { k, A, B } = c;
  let total = 0;
  for (let d = 0; d <= k; d++) {
    const pd = choose(k, d) * delta ** d * (1 - delta) ** (k - d); if (pd === 0) continue;
    total += pd * ((1 - delta) * A[d] + delta * B[d]);
  }
  return total;
}

/** The slope of the mean-field curve at ½, by a central difference. */
export const slopeAtHalf = (rule: Rule, k: number) => (meanField(rule, k, 0.505) - meanField(rule, k, 0.495)) / 0.01;

/** The 2^r rules that are their own equivalent: choose B, and S follows. */
export function selfEquivalentRules(r: number, part?: Rule['part']): Rule[] {
  const all = (1 << r) - 1, out: Rule[] = [];
  for (let B = 0; B <= all; B++) { const rule: Rule = { r, B, S: all & ~mirror(B, r) }; if (part) rule.part = part; out.push(rule); }
  return out;
}

/** One rule per equivalence pair, 2^(2r−1) + 2^(r−1) of them: the lexicographically smaller (β, σ) of each pair. */
export function nonEquivalentRules(r: number): Rule[] {
  const all = (1 << r) - 1, out: Rule[] = [];
  for (let B = 0; B <= all; B++) for (let S = 0; S <= all; S++) {
    const e = equivalent({ r, B, S });
    if (e.B > B || (e.B === B && e.S >= S)) out.push({ r, B, S });
  }
  return out;
}

export type Condition = 'sync' | 'consensus';

/** The mean-field test of Ch. 6 at degree k, sampled on the open interval. `sync`: the curve lies above 1 − ρ left of ½
 * and below it right of ½, so the density is pushed away from ½ while flipping. `consensus`: below ρ left of ½ and above it
 * right of ½, so the density is pushed away from ½ while freezing. */
export function meetsCondition(rule: Rule, k: number, cond: Condition, samples = 200): boolean {
  for (let i = 1; i < samples; i++) {
    const rho = i / samples, next = meanField(rule, k, rho), eps = 1e-9;
    if (cond === 'sync') { if (rho <= 0.5 ? next < 1 - rho - eps : next >= 1 - rho - eps) return false; }
    else if (rho <= 0.5 ? next > rho + eps : next <= rho + eps) return false;
  }
  return true;
}

/** Self-equivalent rules meeting the condition at every degree in `ks` (`all`) or at least one (`any`). */
export function candidates(r: number, ks: number[], cond: Condition, mode: 'all' | 'any' = 'all'): Rule[] {
  return selfEquivalentRules(r).filter((rule) => (mode === 'all' ? ks.every((k) => meetsCondition(rule, k, cond)) : ks.some((k) => meetsCondition(rule, k, cond))));
}

/** J, Eq. (9.1): how often the born row and the survive row change colour between neighbouring intervals; J̄ = J / 2(r − 1). */
export function jaggedness({ r, B, S }: Rule): { J: number; Jbar: number } {
  let J = 0;
  for (let i = 0; i < r - 1; i++) J += (((B >> i) ^ (B >> (i + 1))) & 1) + (((S >> i) ^ (S >> (i + 1))) & 1);
  return { J, Jbar: r > 1 ? J / (2 * (r - 1)) : 0 };
}

/** |Φ^r_J| = 4·C(2(r − 1), J): the number of rules with jaggedness J. */
export const partitionSize = (r: number, J: number) => 4 * choose(2 * (r - 1), J);

/** A rule drawn uniformly from Φ^r_J: split the J colour changes over the two rows in proportion to how many rules each split
 * holds, place them at random positions, and start each row from a coin flip. */
export function randomRuleWithJaggedness(r: number, J: number, rnd: () => number, part?: Rule['part']): Rule {
  const m = r - 1, weights: number[] = [];
  for (let j = 0; j <= J; j++) weights.push(choose(m, j) * choose(m, J - j));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * total, j = 0; while (j < J && x >= weights[j]) { x -= weights[j]; j++; }
  const row = (changes: number) => {
    const pos = Array.from({ length: m }, (_, i) => i);
    for (let i = m - 1; i > 0; i--) { const q = Math.floor(rnd() * (i + 1)); [pos[i], pos[q]] = [pos[q], pos[i]]; }
    const flip = new Set(pos.slice(0, changes));
    let bit = rnd() < 0.5 ? 1 : 0, mask = bit;
    for (let i = 1; i < r; i++) { if (flip.has(i - 1)) bit ^= 1; mask |= bit << i; }
    return mask;
  };
  const rule: Rule = { r, B: row(j), S: row(J - j) };
  if (part) rule.part = part;
  return rule;
}

/** HW_k against BS_k for every non-equivalent rule at resolution r. */
export function scatter(r: number, k: number): { rule: Rule; hw: number; bs: number }[] {
  return nonEquivalentRules(r).map((rule) => ({ rule, hw: meanField(rule, k, 0.5), bs: sensitivity(rule, k).BS }));
}
