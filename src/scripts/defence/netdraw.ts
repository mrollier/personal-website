// A small network as a picture: its links once, its nodes on (ink) or off (cream) every frame. A ring sits on a circle,
// a grid on its torus, where a link over the edge is drawn as a stub out of one side and back in at the other (as on
// slide F1), and anything else where a force layout put it. Coordinates in design pixels of a square canvas. Slides F3
// and D3 use it.
import { latticeLink, type Net } from '../net';
import type { Stage } from './stage';

export type Picture = { net: Net; x: Float32Array; y: Float32Array; links: Float32Array; node: Float32Array };

/** Lay `net` (its xy already in the unit square) into a square of `size` design pixels with `pad` round it, with nodes
 * of radius `node`; with `hubs`, a node with more links is a little larger (for eight links, `node`). */
export function picture(net: Net, size: number, pad: number, node: number, hubs = false): Picture {
  const n = net.n, span = size - 2 * pad, x = new Float32Array(n), y = new Float32Array(n), r = new Float32Array(n), segs: number[] = [];
  for (let i = 0; i < n; i++) {
    x[i] = pad + net.xy[2 * i] * span; y[i] = pad + net.xy[2 * i + 1] * span;
    r[i] = hubs ? node * (0.7 + 0.3 * Math.sqrt(net.deg[i] / 8)) : node;
  }
  const L = net.side;
  for (const [i, j] of net.edges) {
    if (L && latticeLink(net, i, j).wraps && latticeLink(net, i, j).grid) {
      // the shortest way round the torus, as two stubs
      let dx = (j % L) - (i % L), dy = Math.floor(j / L) - Math.floor(i / L);
      if (dx > L / 2) dx -= L; else if (dx < -L / 2) dx += L;
      if (dy > L / 2) dy -= L; else if (dy < -L / 2) dy += L;
      const h = span / L / 2;
      segs.push(x[i], y[i], x[i] + dx * h, y[i] + dy * h, x[j], y[j], x[j] - dx * h, y[j] - dy * h);
    } else segs.push(x[i], y[i], x[j], y[j]);
  }
  return { net, x, y, links: Float32Array.from(segs), node: r };
}

/** The links, then every node in its state. */
export function drawNet(st: Stage, p: Picture, s: Uint8Array): void {
  const { ctx, t } = st, l = p.links, r = p.node;
  ctx.beginPath();
  for (let k = 0; k < l.length; k += 4) { ctx.moveTo(l[k], l[k + 1]); ctx.lineTo(l[k + 2], l[k + 3]); }
  ctx.strokeStyle = t.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
  const on = new Path2D(), off = new Path2D();
  for (let i = 0; i < p.net.n; i++) { const q = s[i] ? on : off; q.moveTo(p.x[i] + r[i], p.y[i]); q.arc(p.x[i], p.y[i], r[i], 0, 2 * Math.PI); }
  ctx.fillStyle = t.panel; ctx.fill(off); ctx.lineWidth = 2; ctx.strokeStyle = t.muted; ctx.stroke(off);
  ctx.fillStyle = t.ink; ctx.fill(on);
}
