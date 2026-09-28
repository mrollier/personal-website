// buildNet without the wait. A network drawn by force comes back at once on a ring, and its nodes then drift
// into place while the worker lays it out, so rebuilding a 300-node network never holds the page. Other
// families have a natural picture and are built as before.
import { buildNet, needsForce, type Net, type NetSpec } from './net';
import { Jobs, Cancelled } from './jobs';

export function buildLive(spec: NetSpec, seed: number, jobs: Jobs, repaint: () => void): Net {
  if (!needsForce(spec)) { jobs.cancel(); return buildNet(spec, seed); }
  const net = buildNet(spec, seed, 'ring');
  let pending = false;
  const frame = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; repaint(); }); };
  jobs.run<Float32Array>('layout', { spec, seed }, (_, xy) => { if (xy) { net.xy.set(xy as Float32Array); frame(); } })
    .then((xy) => { net.xy.set(xy); frame(); }, (e) => { if (!(e instanceof Cancelled)) console.error(e); });
  return net;
}
