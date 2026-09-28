// buildNet without the wait. A network drawn by force comes back at once and is laid out in the worker, so
// rebuilding a 300-node network never holds the page; until the layout arrives, `settling` is true and a figure
// draws `arranging` in its place instead of a placeholder that would visibly jump. Other families have a
// natural picture and are built as before.
import { buildNet, needsForce, type Net, type NetSpec } from './net';
import { Jobs, Cancelled } from './jobs';
import { label, type Box, type Tokens } from './figure';

const busy = new WeakSet<Net>();

export function buildLive(spec: NetSpec, seed: number, jobs: Jobs, repaint: () => void): Net {
  if (!needsForce(spec)) { jobs.cancel(); return buildNet(spec, seed); }
  const net = buildNet(spec, seed, 'ring'); // positions for hit tests only; nothing is drawn until the layout is in
  busy.add(net);
  jobs.run<Float32Array>('layout', { spec, seed })
    .then((xy) => { net.xy.set(xy); busy.delete(net); repaint(); }, (e) => { if (!(e instanceof Cancelled)) console.error(e); });
  return net;
}

/** True while the worker is still laying this network out. */
export const settling = (net: Net) => busy.has(net);

/** What a figure draws in the network's place meanwhile. */
export function arranging(ctx: CanvasRenderingContext2D, b: Box, t: Tokens): void {
  label(ctx, 'arranging the network…', b.x + b.w / 2, b.y + b.h / 2, t, { align: 'center' });
}
