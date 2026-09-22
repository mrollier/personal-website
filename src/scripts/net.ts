// The parity rule on a network: a node's next state is the sum of its neighbours' states modulo 2,
// with or without its own. Three families of random network plus a rewired torus lattice, a
// force-directed layout for drawing them, and the ordering of nodes by degree that the "importance"
// slider walks. Pure, no DOM.

export type NetKind = 'ws' | 'er' | 'ba' | 'lat';
export type Net = {
  kind: NetKind; n: number;
  side?: number;            // lattice family only: nodes sit on a side × side torus, index = y * side + x
  adj: number[][];          // neighbours of each node
  edges: [number, number][]; // each link once, i < j
  deg: Uint16Array;
  xy: Float32Array;         // layout, x0 y0 x1 y1 …, inside the unit square
  order: number[];          // nodes from most to least connected (ties: lower index first)
};

/** The one knob each family has, with the range the slider shows. */
export type RandomKind = Exclude<NetKind, 'lat'>;
export const PARAM: Record<RandomKind, { name: string; label: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }> = {
  ws: { name: 'small world', label: 'rewiring', min: 0, max: 1, step: 0.01, def: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  er: { name: 'random', label: 'mean degree', min: 1, max: 10, step: 0.5, def: 4, fmt: (v) => v.toFixed(1) },
  ba: { name: 'scale-free', label: 'links per newcomer', min: 1, max: 5, step: 1, def: 2, fmt: (v) => String(v) },
};

/** The lattice family lives outside PARAM so the parity figure, which lists PARAM's keys, keeps its three families. */
export const LATTICE = { name: 'lattice', label: 'rewiring', min: 0, max: 1, step: 0.01, def: 0, fmt: (v: number) => `${Math.round(v * 100)}%` };
export const knob = (kind: NetKind) => (kind === 'lat' ? LATTICE : PARAM[kind]);

export const clampParam = (kind: NetKind, v: number) => {
  const p = knob(kind), x = Number.isFinite(v) ? v : p.def;
  return Math.min(p.max, Math.max(p.min, Math.round(x / p.step) * p.step));
};
export const clampN = (n: number, def = 100, max = 250) => Math.min(max, Math.max(10, Math.round(n) || def));

/** xorshift32, seeded, so a network can be reproduced from its seed in the address bar. */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function build(kind: NetKind, n: number, edges: [number, number][]): Net {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [i, j] of edges) { adj[i].push(j); adj[j].push(i); }
  const deg = new Uint16Array(n); for (let i = 0; i < n; i++) deg[i] = adj[i].length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[b] - deg[a] || a - b);
  return { kind, n, adj, edges, deg, xy: new Float32Array(2 * n), order };
}

/** Each link's far end is moved to a random node with probability p, never doubling a link or looping a node to itself. In place. */
export function rewire(n: number, edges: [number, number][], p: number, rnd: () => number): void {
  const key = (i: number, j: number) => (i < j ? i * n + j : j * n + i);
  const has = new Set<number>(edges.map(([i, j]) => key(i, j)));
  for (let k = 0; k < edges.length; k++) {
    if (rnd() >= p) continue;
    const [i, jOld] = edges[k];
    for (let tries = 0; tries < 20; tries++) {
      const j = Math.floor(rnd() * n);
      if (j === i || has.has(key(i, j))) continue;
      has.delete(key(i, jOld)); has.add(key(i, j)); edges[k] = [Math.min(i, j), Math.max(i, j)]; break;
    }
  }
}

/** Watts–Strogatz: a ring where each node links to its two neighbours on either side, then rewired. */
export function wattsStrogatz(n: number, p: number, rnd: () => number): Net {
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (const d of [1, 2]) { const j = (i + d) % n; if (j !== i) edges.push([Math.min(i, j), Math.max(i, j)]); }
  rewire(n, edges, p, rnd);
  return build('ws', n, edges);
}

/** A side × side torus with the von Neumann (4) or Moore (8) neighbourhood, then rewired: Life's habitat at p = 0, the paper's small world in between, a tangle at p = 1. Nodes sit on the grid. */
export function lattice(side: number, degree: 4 | 8, p: number, rnd: () => number): Net {
  const n = side * side, at = (x: number, y: number) => ((y + side) % side) * side + ((x + side) % side);
  const steps: [number, number][] = degree === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  const seen = new Set<number>(), edges: [number, number][] = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) for (const [dx, dy] of steps) {
    const i = at(x, y), j = at(x + dx, y + dy), a = Math.min(i, j), b = Math.max(i, j);
    if (a === b || seen.has(a * n + b)) continue; // a tiny torus meets itself
    seen.add(a * n + b); edges.push([a, b]);
  }
  rewire(n, edges, p, rnd);
  const net = build('lat', n, edges); net.side = side;
  for (let i = 0; i < n; i++) { net.xy[2 * i] = (i % side + 0.5) / side; net.xy[2 * i + 1] = (Math.floor(i / side) + 0.5) / side; }
  return net;
}

/** On a lattice: whether a link is one of the grid's own (torus distance 1), and whether it crosses the wrap. */
export function latticeLink(net: Net, i: number, j: number): { grid: boolean; wraps: boolean } {
  const L = net.side!, dx = Math.abs((i % L) - (j % L)), dy = Math.abs(Math.floor(i / L) - Math.floor(j / L));
  const tx = Math.min(dx, L - dx), ty = Math.min(dy, L - dy);
  return { grid: Math.max(tx, ty) === 1, wraps: tx !== dx || ty !== dy };
}

/** Erdős–Rényi: every pair linked with the probability that gives mean degree k. */
export function erdosRenyi(n: number, k: number, rnd: () => number): Net {
  const p = Math.min(1, k / (n - 1)), edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) edges.push([i, j]);
  return build('er', n, edges);
}

/** Barabási–Albert: start with a small clique, then each newcomer links to m existing nodes picked in proportion to how many links they already have. */
export function barabasiAlbert(n: number, m: number, rnd: () => number): Net {
  m = Math.max(1, Math.min(m, n - 1));
  const edges: [number, number][] = [], ends: number[] = []; // every link end once, so a uniform pick is proportional to degree
  const m0 = m + 1;
  for (let i = 0; i < m0; i++) for (let j = i + 1; j < m0; j++) { edges.push([i, j]); ends.push(i, j); }
  for (let v = m0; v < n; v++) {
    const picked = new Set<number>();
    while (picked.size < m) picked.add(ends[Math.floor(rnd() * ends.length)]);
    for (const u of picked) { edges.push([u, v]); ends.push(u, v); }
  }
  return build('ba', n, edges);
}

/** For the lattice family n is rounded down to a square, and `degree` picks the neighbourhood. `lay` false skips the layout for a network that is only run, never drawn. */
export function makeNet(kind: NetKind, n: number, param: number, seed: number, degree: 4 | 8 = 8, lay = true): Net {
  const rnd = makeRng(seed);
  if (kind === 'lat') return lattice(Math.max(3, Math.floor(Math.sqrt(n))), degree, param, rnd);
  const net = kind === 'ws' ? wattsStrogatz(n, param, rnd) : kind === 'er' ? erdosRenyi(n, param, rnd) : barabasiAlbert(n, param, rnd);
  if (lay) layout(net, rnd, n > 300 ? 120 : 250); // ponytail: O(n²) per iteration, fewer iterations past 300 nodes; a Barnes–Hut tree if larger nets are wanted
  return net;
}

/** Fruchterman–Reingold from a circle in node order (so a ring stays a ring), then the linked nodes fitted into the unit square with a margin; an isolated node ends up on the rim. */
export function layout(net: Net, rnd: () => number, iters = 250): void {
  const { n, edges, xy } = net;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    xy[2 * i] = 0.5 + 0.4 * Math.cos(a) + 0.01 * (rnd() - 0.5); xy[2 * i + 1] = 0.5 + 0.4 * Math.sin(a) + 0.01 * (rnd() - 0.5);
  }
  const k = Math.sqrt(1 / n), dx = new Float32Array(n), dy = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    const temp = 0.1 * (1 - it / iters) + 0.002;
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let ex = xy[2 * i] - xy[2 * j], ey = xy[2 * i + 1] - xy[2 * j + 1];
      let d2 = ex * ex + ey * ey; if (d2 < 1e-8) { ex = 1e-4 * (rnd() - 0.5); ey = 1e-4 * (rnd() - 0.5); d2 = ex * ex + ey * ey; }
      const f = (k * k) / d2; // repulsion k²/d along the unit vector
      dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
    }
    for (const [i, j] of edges) {
      const ex = xy[2 * i] - xy[2 * j], ey = xy[2 * i + 1] - xy[2 * j + 1];
      const d = Math.hypot(ex, ey), f = d / k; // attraction d²/k along the unit vector
      dx[i] -= ex * f; dy[i] -= ey * f; dx[j] += ex * f; dy[j] += ey * f;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dy[i]) || 1, s = Math.min(d, temp) / d;
      xy[2 * i] += dx[i] * s; xy[2 * i + 1] += dy[i] * s;
    }
  }
  // Fit the largest connected piece into [0.04, 0.96]², keeping the aspect ratio. Small pieces and isolated
  // nodes get pushed away without limit, so whatever lands outside is set on a circle round the rim instead.
  const main = largestComponent(net);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!main[i]) continue;
    x0 = Math.min(x0, xy[2 * i]); x1 = Math.max(x1, xy[2 * i]); y0 = Math.min(y0, xy[2 * i + 1]); y1 = Math.max(y1, xy[2 * i + 1]);
  }
  const span = Math.max(x1 - x0, y1 - y0) || 1, s = 0.92 / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < n; i++) {
    let x = 0.5 + (xy[2 * i] - cx) * s, y = 0.5 + (xy[2 * i + 1] - cy) * s;
    if (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98) { const a = Math.atan2(y - 0.5, x - 0.5); x = 0.5 + 0.48 * Math.cos(a); y = 0.5 + 0.48 * Math.sin(a); }
    xy[2 * i] = x; xy[2 * i + 1] = y;
  }
}

/** Membership of the largest connected component. */
function largestComponent(net: Net): Uint8Array {
  const { n, adj } = net, comp = new Int32Array(n).fill(-1), size: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const id = size.length, queue = [s]; comp[s] = id; let m = 0;
    while (queue.length) { const u = queue.pop()!; m++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = id; queue.push(v); } }
    size.push(m);
  }
  const best = size.indexOf(Math.max(...size)), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = comp[i] === best ? 1 : 0;
  return out;
}

/** One generation of the parity rule on the network. */
export function stepNet(s: Uint8Array, net: Net, self: boolean): Uint8Array {
  const out = new Uint8Array(net.n);
  for (let i = 0; i < net.n; i++) {
    let sum = self ? s[i] : 0;
    for (const j of net.adj[i]) sum += s[j];
    out[i] = sum & 1;
  }
  return out;
}

/** A single live node: the one of the given rank by degree, 1 = most connected. */
export function seedNet(net: Net, rank: number): Uint8Array {
  const s = new Uint8Array(net.n);
  s[net.order[Math.min(net.n, Math.max(1, rank)) - 1]] = 1;
  return s;
}

export function count(s: Uint8Array): number { let n = 0; for (let i = 0; i < s.length; i++) n += s[i]; return n; }
