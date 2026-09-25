// Structural measures of a network (Ch. 3 of the thesis): the six centralities used to rank nodes,
// clustering, path length and Telesford's small-world index ω, plus the ω(p) sweep as a worker job.
// Pure, no DOM, safe in a worker.
import { type Net, type NetSpec, buildNet } from './net.ts'; // the extension so `npm test` can run this file in node

export type Centrality = 'deg' | 'and' | 'h' | 'eig' | 'btw' | 'clo';
export const CENTRALITIES: { id: Centrality; name: string; symbol: string; scale: 'local' | 'mesoscopic' | 'global'; blurb: string }[] = [
  { id: 'deg', name: 'degree', symbol: 'k', scale: 'local', blurb: 'how many links a node has' },
  { id: 'and', name: 'average neighbour degree', symbol: 'k̄', scale: 'mesoscopic', blurb: 'how well connected its neighbours are' },
  { id: 'h', name: 'h index', symbol: 'h', scale: 'mesoscopic', blurb: 'the largest h such that h neighbours have at least h links' },
  { id: 'eig', name: 'eigenvector', symbol: 'x', scale: 'global', blurb: 'connected to nodes that are themselves well connected, recursively' },
  { id: 'btw', name: 'betweenness', symbol: 'b', scale: 'global', blurb: 'on how many shortest paths between other nodes it lies' },
  { id: 'clo', name: 'closeness', symbol: 'c', scale: 'global', blurb: 'how few steps it takes to reach everyone else' },
];

export const degree = (net: Net) => Float64Array.from(net.deg);

/** k̄ᵢ, Eq. (3.4): the mean degree of a node's neighbours; 0 for an isolated node. */
export function avgNeighbourDegree(net: Net): Float64Array {
  const out = new Float64Array(net.n);
  for (let i = 0; i < net.n; i++) { const nb = net.adj[i]; let s = 0; for (const j of nb) s += net.deg[j]; out[i] = nb.length ? s / nb.length : 0; }
  return out;
}

/** hᵢ: the largest h such that at least h neighbours have degree at least h. */
export function hIndex(net: Net): Float64Array {
  const out = new Float64Array(net.n);
  for (let i = 0; i < net.n; i++) {
    const ds = net.adj[i].map((j) => net.deg[j]).sort((a, b) => b - a);
    let h = 0; while (h < ds.length && ds[h] >= h + 1) h++;
    out[i] = h;
  }
  return out;
}

/** Leading eigenvector of A by power iteration on A + I, which also converges on bipartite networks; scaled so the largest entry is 1. */
export function eigenvector(net: Net, iters = 300): Float64Array {
  const { n, adj } = net;
  let x = new Float64Array(n).fill(1), y = new Float64Array(n);
  for (let it = 0; it < iters; it++) {
    let max = 0;
    for (let i = 0; i < n; i++) { let s = x[i]; for (const j of adj[i]) s += x[j]; y[i] = s; if (s > max) max = s; }
    if (max === 0) break;
    let delta = 0;
    for (let i = 0; i < n; i++) { y[i] /= max; delta = Math.max(delta, Math.abs(y[i] - x[i])); }
    [x, y] = [y, x];
    if (delta < 1e-10) break;
  }
  return x;
}

/** Breadth-first search from s: distances (−1 unreached), visit order, and shortest-path counts σ. */
function bfs(net: Net, s: number, dist: Int32Array, order: Int32Array, sigma: Float64Array): number {
  dist.fill(-1); sigma.fill(0); dist[s] = 0; sigma[s] = 1; order[0] = s;
  let head = 0, tail = 1;
  while (head < tail) {
    const u = order[head++];
    for (const v of net.adj[u]) {
      if (dist[v] < 0) { dist[v] = dist[u] + 1; order[tail++] = v; }
      if (dist[v] === dist[u] + 1) sigma[v] += sigma[u];
    }
  }
  return tail;
}

/** cᵢ, Eq. (3.7): (N − 1) over the summed distance to everyone; on a network in pieces, over the reachable nodes, scaled by the share reached. */
export function closeness(net: Net): Float64Array {
  const { n } = net, out = new Float64Array(n), dist = new Int32Array(n), order = new Int32Array(n), sigma = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const reached = bfs(net, s, dist, order, sigma) - 1;
    let sum = 0; for (let i = 0; i < n; i++) if (dist[i] > 0) sum += dist[i];
    out[s] = reached && sum ? (reached / sum) * (reached / (n - 1)) : 0;
  }
  return out;
}

/** bᵢ, Eq. (3.6), over unordered pairs, by Brandes' algorithm: O(NM). */
export function betweenness(net: Net): Float64Array {
  const { n } = net, out = new Float64Array(n), dist = new Int32Array(n), order = new Int32Array(n), sigma = new Float64Array(n), delta = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const m = bfs(net, s, dist, order, sigma);
    delta.fill(0);
    for (let k = m - 1; k > 0; k--) {
      const w = order[k];
      for (const v of net.adj[w]) if (dist[v] === dist[w] - 1) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      out[w] += delta[w];
    }
  }
  for (let i = 0; i < n; i++) out[i] /= 2;
  return out;
}

/** Cᵢ, Eq. (3.2): the share of a node's neighbour pairs that are linked; 0 below degree 2. */
export function clustering(net: Net): { local: Float64Array; mean: number } {
  const { n, adj } = net, local = new Float64Array(n), sets = adj.map((a) => new Set(a));
  let total = 0;
  for (let i = 0; i < n; i++) {
    const nb = adj[i], k = nb.length; if (k < 2) continue;
    let l = 0; for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (sets[nb[a]].has(nb[b])) l++;
    local[i] = (2 * l) / (k * (k - 1)); total += local[i];
  }
  return { local, mean: total / n };
}

/** ⟨l⟩, Eq. (3.3): the mean shortest distance over the pairs that can reach each other. */
export function pathLength(net: Net): number {
  const { n } = net, dist = new Int32Array(n), order = new Int32Array(n), sigma = new Float64Array(n);
  let sum = 0, pairs = 0;
  for (let s = 0; s < n; s++) { bfs(net, s, dist, order, sigma); for (let i = 0; i < n; i++) if (dist[i] > 0) { sum += dist[i]; pairs++; } }
  return pairs ? sum / pairs : NaN;
}

export function centrality(kind: Centrality, net: Net): Float64Array {
  switch (kind) {
    case 'deg': return degree(net);
    case 'and': return avgNeighbourDegree(net);
    case 'h': return hIndex(net);
    case 'eig': return eigenvector(net);
    case 'btw': return betweenness(net);
    case 'clo': return closeness(net);
  }
}

/** Telesford's ω, Eq. (3.5): ⟨l⟩ of the random end over ⟨l⟩, minus ⟨C⟩ over ⟨C⟩ of the lattice end. Near −1 lattice-like, near +1 random-like, small-world in between. */
export const smallWorldIndex = (C: number, l: number, cLatt: number, lRand: number) => (cLatt > 0 && l > 0 ? lRand / l - C / cLatt : NaN);

/** The two reference values for a Watts–Strogatz family: the p = 0 lattice's clustering and the p = 1 network's path length, averaged over a few seeds. */
export function references(spec: NetSpec, seed: number, seeds = 3): { cLatt: number; lRand: number } {
  if (spec.kind !== 'ws' && spec.kind !== 'lat') return { cLatt: NaN, lRand: NaN };
  const cLatt = clustering(buildNet({ ...spec, p: 0 }, seed, 'none')).mean;
  let lRand = 0; for (let s = 0; s < seeds; s++) lRand += pathLength(buildNet({ ...spec, p: 1 }, seed + 1000 * (s + 1), 'none'));
  return { cLatt, lRand: lRand / seeds };
}

export type OmegaPoint = { p: number; omega: number; C: number; l: number };

/** Worker job: ω over a list of rewiring probabilities, `seeds` networks each; yields the points so far. */
export function* omegaSweep(params: { spec: NetSpec & { kind: 'ws' | 'lat' }; ps: number[]; seeds: number; seed: number }): Generator<{ p: number; partial: OmegaPoint[] }, OmegaPoint[]> {
  const { spec, ps, seeds, seed } = params, ref = references(spec, seed, seeds), out: OmegaPoint[] = [];
  for (let i = 0; i < ps.length; i++) {
    let C = 0, l = 0;
    for (let s = 0; s < seeds; s++) {
      const net = buildNet({ ...spec, p: ps[i] }, seed + 7 * i + 1000 * (s + 1), 'none');
      C += clustering(net).mean; l += pathLength(net);
    }
    C /= seeds; l /= seeds;
    out.push({ p: ps[i], omega: smallWorldIndex(C, l, ref.cLatt, ref.lRand), C, l });
    yield { p: (i + 1) / ps.length, partial: out.slice() };
  }
  return out;
}
