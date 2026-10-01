// Training the elementary-CA emulator from random weights, by hand: the network of the ACRI 2024 paper (eight detectors
// of width 3 and a 1 × 1 rule-table layer with a bias, 41 parameters) on the eight neighbourhoods as one batch, which is
// all a network that sees three cells can learn from. Two recipes, after experiments/training/REPORT.md of
// mrollier/emulating-and-learning-CAs:
// - '2024': states as 0/1, ReLU detectors, a ReLU on the rule-table layer, tanh, mean squared error, Adam 0.005;
// - 'reliable': states as ±1, softplus detectors, a linear logit, binary cross-entropy, Adam 0.02.
// He-normal kernels and zero biases, as Keras initialises them. Pure, no DOM.

export type Recipe = '2024' | 'reliable';
export const SETTINGS: Record<Recipe, { lr: number; steps: number }> = { '2024': { lr: 0.005, steps: 2560 }, reliable: { lr: 0.02, steps: 2560 } };

/** Weights, their Adam moments, and the step count. Detector k has weights w1[3k … 3k+2] for left, self and right. */
export type Net = { recipe: Recipe; p: Float64Array; m: Float64Array; v: Float64Array; t: number };
const W1 = 0, B1 = 24, W2 = 32, B2 = 40, P = 41;

/** Keras's he_normal: a normal with standard deviation √(2 / fan-in), redrawn beyond two of them, and rescaled for the cut. */
function heNormal(fanIn: number, rnd: () => number): number {
  const sd = Math.sqrt(2 / fanIn) / 0.87962566103423978;
  for (;;) {
    const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    if (Math.abs(z) <= 2) return z * sd;
  }
}

export function init(recipe: Recipe, rnd: () => number): Net {
  const p = new Float64Array(P);
  for (let i = 0; i < 24; i++) p[W1 + i] = heNormal(3, rnd);
  for (let i = 0; i < 8; i++) p[W2 + i] = heNormal(8, rnd);
  return { recipe, p, m: new Float64Array(P), v: new Float64Array(P), t: 0 };
}

const softplus = (x: number) => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** The forward pass for neighbourhood n (4·left + 2·self + right): detector sums, detector outputs, the rule-table
 * value z and the output (a probability for 'reliable', tanh(ReLU z) for '2024'). */
export function forward(net: Net, n: number) {
  const { p, recipe } = net, x = [(n >> 2) & 1, (n >> 1) & 1, n & 1].map((b) => (recipe === 'reliable' ? 2 * b - 1 : b));
  const pre = new Float64Array(8), h = new Float64Array(8);
  let z = p[B2];
  for (let k = 0; k < 8; k++) {
    pre[k] = p[W1 + 3 * k] * x[0] + p[W1 + 3 * k + 1] * x[1] + p[W1 + 3 * k + 2] * x[2] + p[B1 + k];
    h[k] = recipe === 'reliable' ? softplus(pre[k]) : Math.max(0, pre[k]);
    z += p[W2 + k] * h[k];
  }
  const out = recipe === 'reliable' ? sigmoid(z) : Math.tanh(Math.max(0, z));
  return { x, pre, h, z, out };
}

const bit = (rule: number, n: number) => (rule >> n) & 1;

/** One full-batch Adam step on the eight neighbourhoods; returns the loss before the step. */
export function step(net: Net, rule: number): number {
  const g = new Float64Array(P), { recipe, p } = net;
  let loss = 0;
  for (let n = 0; n < 8; n++) {
    const { x, pre, h, z, out } = forward(net, n), y = bit(rule, n);
    let dz: number;
    if (recipe === 'reliable') { loss += Math.max(z, 0) - y * z + Math.log1p(Math.exp(-Math.abs(z))); dz = out - y; }
    else { loss += (out - y) ** 2; dz = z > 0 ? 2 * (out - y) * (1 - out * out) : 0; } // ReLU: no gradient at or below 0
    dz /= 8;
    g[B2] += dz;
    for (let k = 0; k < 8; k++) {
      g[W2 + k] += dz * h[k];
      const dp = dz * p[W2 + k] * (recipe === 'reliable' ? sigmoid(pre[k]) : pre[k] > 0 ? 1 : 0);
      g[B1 + k] += dp;
      for (let j = 0; j < 3; j++) g[W1 + 3 * k + j] += dp * x[j];
    }
  }
  const lr = SETTINGS[recipe].lr, b1 = 0.9, b2 = 0.999, eps = 1e-7; // Keras's Adam
  net.t++;
  const c1 = 1 - b1 ** net.t, c2 = 1 - b2 ** net.t;
  for (let i = 0; i < P; i++) {
    net.m[i] = b1 * net.m[i] + (1 - b1) * g[i]; net.v[i] = b2 * net.v[i] + (1 - b2) * g[i] * g[i];
    p[i] -= (lr * net.m[i]) / c1 / (Math.sqrt(net.v[i] / c2) + eps);
  }
  return loss / 8;
}

/** The predicted next state for neighbourhood n: a positive logit, or an output above one half. */
export const predict = (net: Net, n: number) => { const f = forward(net, n); return (net.recipe === 'reliable' ? f.z > 0 : f.out > 0.5) ? 1 : 0; };

/** Exact when all eight neighbourhoods come out right: then every configuration of every size does. */
export const exact = (net: Net, rule: number) => [0, 1, 2, 3, 4, 5, 6, 7].every((n) => predict(net, n) === bit(rule, n));

/** Under the 2024 head, a neighbourhood that should give 1 but whose rule-table value is at or below 0 gets no
 * gradient through the ReLU: it is stuck. */
export const stuck = (net: Net, rule: number) => [0, 1, 2, 3, 4, 5, 6, 7].filter((n) => net.recipe === '2024' && bit(rule, n) === 1 && forward(net, n).z <= 0);

/** Train until exact (checked every step) or out of steps; the number of steps taken, or −1. */
export function train(net: Net, rule: number, steps = SETTINGS[net.recipe].steps): number {
  for (let s = 0; s < steps; s++) { if (exact(net, rule)) return s; step(net, rule); }
  return exact(net, rule) ? steps : -1;
}
