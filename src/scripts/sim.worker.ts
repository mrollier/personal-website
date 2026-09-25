// The one worker behind every heavy figure on the thesis page. A job is a pure generator function in
// an engine module; this file drives it and posts each yield as progress, then the return value as the
// result. Cancelling is done by terminating the worker (see jobs.ts), so nothing here needs to listen.
import { omegaSweep } from './centrality';
import { successSweep } from './sync';
import { swapCurve, etaScan } from './consensus';

const JOBS: Record<string, (params: any) => Generator<{ p: number; partial?: unknown }, unknown>> = {
  'omega-sweep': omegaSweep,
  'success-sweep': successSweep,
  'swap-curve': swapCurve,
  'eta': etaScan,
};

self.onmessage = (e: MessageEvent<{ id: number; kind: string; params: unknown }>) => {
  const { id, kind, params } = e.data;
  try {
    const job = JOBS[kind];
    if (!job) throw new Error(`unknown job ${kind}`);
    const gen = job(params);
    for (;;) {
      const r = gen.next();
      if (r.done) { postMessage({ id, done: true, result: r.value }); return; }
      postMessage({ id, p: r.value.p, partial: r.value.partial });
    }
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
