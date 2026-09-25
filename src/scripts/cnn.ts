// A cellular automaton as a convolutional network with its weights written by hand (Ch. 7 of the
// thesis): eight detector channels, one per three-cell neighbourhood, each a weighted sum plus a bias
// through a ReLU that lights up exactly when its pattern is present; then the rule table as the weights
// of a 1 × 1 convolution that adds the channels up. Also the non-uniform case, where each cell picks one
// of several rules, and the parameter counts of the two ways of doing that. Pure, no DOM.
import { tableOf } from './wolfram.ts';

export type Detector = { i: number; pattern: [number, number, number]; weights: [number, number, number]; bias: number };

/** Channel i detects the neighbourhood whose bits spell i: +1 where the pattern has a 1, −ω where it has a 0, bias 1 − (number of 1s). */
export function detectors(omega = 1): Detector[] {
  return Array.from({ length: 8 }, (_, i) => {
    const pattern: [number, number, number] = [(i >> 2) & 1, (i >> 1) & 1, i & 1], h = pattern[0] + pattern[1] + pattern[2];
    return { i, pattern, weights: pattern.map((b) => (b ? 1 : -omega)) as [number, number, number], bias: 1 - h };
  });
}

/** The weighted sums before the ReLU, one array per channel, on a ring. */
export function preActivation(row: Uint8Array, omega = 1): Float32Array[] {
  const W = row.length, det = detectors(omega);
  return det.map(({ weights, bias }) => {
    const out = new Float32Array(W);
    for (let x = 0; x < W; x++) out[x] = weights[0] * row[(x + W - 1) % W] + weights[1] * row[x] + weights[2] * row[(x + 1) % W] + bias;
    return out;
  });
}

export const relu = (a: Float32Array) => a.map((v) => (v > 0 ? v : 0));

/** After the ReLU: exactly one channel is 1 at every cell, the others 0, for any ω ≥ 1. */
export const channels = (row: Uint8Array, omega = 1) => preActivation(row, omega).map(relu);

/** The second layer: channel i weighted by rule-table entry i, summed. */
export function readout(ch: Float32Array[], table: Uint8Array): Uint8Array {
  const W = ch[0].length, out = new Uint8Array(W);
  for (let x = 0; x < W; x++) { let s = 0; for (let i = 0; i < 8; i++) s += table[i] * ch[i][x]; out[x] = Math.round(s); }
  return out;
}

/** One global update of a Wolfram rule through the two layers. */
export const cnnStep = (row: Uint8Array, rule: number, omega = 1) => readout(channels(row, omega), tableOf(rule));

/** The non-uniform case: every rule's uniform update, then each cell takes the one its allocation names. */
export function nucaStep(row: Uint8Array, rules: number[], alloc: Uint8Array, omega = 1): Uint8Array {
  const ch = channels(row, omega), outs = rules.map((r) => readout(ch, tableOf(r))), W = row.length, out = new Uint8Array(W);
  for (let x = 0; x < W; x++) out[x] = outs[Math.min(rules.length - 1, alloc[x])][x];
  return out;
}

/** Parameters of the emulator, Eqs. (7.1) and (7.2): the detectors, one rule table per rule, and the selection layer, which is
 * N_R × N when it is locally connected and N_R × N² when it is dense. */
export const paramCount = (N: number, NR: number, mode: 'local' | 'dense') => 4 * 8 + 8 * NR + (mode === 'local' ? NR * N : NR * N * N);
