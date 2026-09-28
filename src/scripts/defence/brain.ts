// A brain-shaped network for the "each neuron fires or not" illustration: neurons scattered evenly inside a side view of
// a brain (facing left: frontal lobe, cerebellum at the back, brain stem), each linked to its nearest neighbours, plus a
// few long links, as in a real connectome. Coordinates in an 800 × 600 box. Pure, no DOM.
import { build, type Net } from '../net.ts';

export const BOX = { w: 800, h: 600 };

type Pt = [number, number];
/** The outline as cubic Bézier segments, each [control 1, control 2, end], starting from START. */
const START: Pt = [118, 330];
const OUTLINE: [Pt, Pt, Pt][] = [
  [[58, 262], [80, 112], [228, 70]],
  [[330, 20], [528, 18], [626, 82]],
  [[722, 136], [766, 256], [716, 346]],
  [[748, 400], [736, 492], [628, 500]],
  [[590, 502], [566, 494], [548, 482]],
  [[548, 520], [552, 556], [546, 584]],
  [[530, 598], [502, 596], [494, 578]],
  [[492, 540], [490, 500], [476, 470]],
  [[416, 446], [320, 444], [258, 412]],
  [[198, 392], [146, 372], START],
];
/** Two folds and the line under the cerebrum, drawn faintly: the lateral and central sulci. */
export const FOLDS: Pt[][] = [
  [[250, 350], [330, 318], [400, 296], [470, 262]],
  [[430, 40], [410, 120], [388, 200], [366, 280]],
  [[716, 346], [680, 372], [620, 382], [560, 400]],
];

/** The outline as a closed polygon, `per` points per segment. */
export function outline(per = 16): Pt[] {
  const out: Pt[] = [];
  let p0 = START;
  for (const [c1, c2, p3] of OUTLINE) {
    for (let k = 1; k <= per; k++) {
      const t = k / per, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
    }
    p0 = p3;
  }
  return out;
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Up to n neurons at least `gap` apart inside the outline, each linked to its k nearest, plus `long` random long links.
 * The positions are in `xy` in box coordinates (not normalised). */
export function brain(n: number, gap: number, k: number, long: number, rnd: () => number): Net {
  const poly = outline(), pts: Pt[] = [];
  for (let tries = 0; pts.length < n && tries < n * 200; tries++) {
    const x = rnd() * BOX.w, y = rnd() * BOX.h;
    if (!inside(poly, x, y)) continue;
    if (pts.some(([a, b]) => (a - x) ** 2 + (b - y) ** 2 < gap * gap)) continue;
    pts.push([x, y]);
  }
  const m = pts.length, key = (i: number, j: number) => (i < j ? i * m + j : j * m + i), seen = new Set<number>(), edges: [number, number][] = [];
  const link = (i: number, j: number) => { if (i === j || seen.has(key(i, j))) return; seen.add(key(i, j)); edges.push([Math.min(i, j), Math.max(i, j)]); };
  for (let i = 0; i < m; i++) {
    const near = pts.map(([x, y], j) => [(x - pts[i][0]) ** 2 + (y - pts[i][1]) ** 2, j]).sort((a, b) => a[0] - b[0]);
    for (let q = 1; q <= k && q < m; q++) link(i, near[q][1]);
  }
  for (let q = 0; q < long; q++) link(Math.floor(rnd() * m), Math.floor(rnd() * m));
  const net = build('rgg', m, edges);
  pts.forEach(([x, y], i) => { net.xy[2 * i] = x; net.xy[2 * i + 1] = y; });
  return net;
}

/** One round of excitable neurons (Greenberg–Hastings, with noisy synapses): 0 resting, 1 firing, 2 … rest recovering.
 * A resting neuron fires with probability 1 − (1 − q)^f when f of its inputs fired, or on its own with probability sp.
 * Returns how many fire. The Game of Life dies out on a network this clustered; this keeps firing in avalanches. */
export function fire(net: Net, s: Uint8Array, out: Uint8Array, q: number, rest: number, sp: number, rnd: () => number): number {
  let n = 0;
  for (let i = 0; i < net.n; i++) {
    if (s[i]) { out[i] = s[i] >= rest ? 0 : s[i] + 1; continue; }
    let f = 0;
    for (const j of net.adj[i]) if (s[j] === 1) f++;
    out[i] = rnd() < 1 - (1 - q) ** f || rnd() < sp ? 1 : 0;
    n += out[i];
  }
  return n;
}
