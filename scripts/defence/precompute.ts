// Precomputed data for the defence deck (src/data/defence/*.json): seeded and deterministic, with the parameters and
// summary numbers written into every file, so a rehearsal equals the performance and the report can quote them.
// The browser rebuilds networks and starts from the same seeds with the same code. Run: npm run precompute
import { writeFileSync, mkdirSync } from 'node:fs';
import { lattice, makeRng } from '../../src/scripts/net.ts';
import { type Rule, meanField, trial } from '../../src/scripts/llna.ts';
import { candidates, sensitivity, jaggedness } from '../../src/scripts/genotype.ts';
import { pearson } from '../../src/scripts/stats.ts';

const out = new URL('../../src/data/defence/', import.meta.url);
mkdirSync(out, { recursive: true });
const save = (name: string, data: unknown) => { writeFileSync(new URL(name, out), JSON.stringify(data, null, 1) + '\n'); console.log(`wrote src/data/defence/${name}`); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const slope = (rule: Rule, k: number) => { const h = 1e-6; return (meanField(rule, k, 0.5 + h) - meanField(rule, k, 0.5 - h)) / (2 * h); };

// ── sync.json: the 27 candidates (F5, F6) and the demo on a rewired grid (F7) ──
function sync() {
  const cands = candidates(9, [8], 'sync').map((rule) => ({ B: rule.B, S: rule.S, bs8: r3(sensitivity(rule, 8).BS), slope: r3(slope(rule, 8)), jbar: r3(jaggedness(rule).Jbar) }));
  if (cands.length !== 27) throw new Error(`expected 27 candidates, got ${cands.length}`);
  const r = pearson(cands.map((c) => Math.abs(c.slope)), cands.map((c) => c.bs8));
  const rule: Rule = { r: 9, B: 23, S: 47 }, side = 30, degree = 8 as const, p = 0.2, N = side * side, limit = 2 * N;
  const run = (netSeed: number, startSeed: number) => trial('fssp', lattice(side, degree, p, makeRng(netSeed)), rule, 0.5, makeRng(startSeed), limit);
  // the demo: the first seed pair that synchronises within 60 ticks, so the room sees it happen in seconds
  let demo = { netSeed: 0, startSeed: 0, tick: 0 };
  for (let s = 1; s < 500 && !demo.netSeed; s++) { const v = run(s, 7000 + s); if (v.ok && v.tick <= 60) demo = { netSeed: s, startSeed: 7000 + s, tick: v.tick }; }
  if (!demo.netSeed) throw new Error('no demo seed synchronised within 60 ticks');
  // twenty fresh trials, each with its own network and start
  const trials = Array.from({ length: 20 }, (_, i) => { const netSeed = 101 + i, startSeed = 9101 + i, v = run(netSeed, startSeed); return { netSeed, startSeed, ok: v.ok, tick: v.tick }; });
  const wins = trials.filter((t) => t.ok).length;
  console.log(`sync: 27 candidates, Pearson(|slope|, BS8) = ${r.toFixed(3)}; demo syncs at tick ${demo.tick}; trials ${wins}/20`);
  if (wins < 17) console.warn('WARNING: fewer than 17 of 20 trials synchronised; choose other trial seeds');
  save('sync.json', {
    about: 'Synchronisation candidates at r = 9, k = 8 (self-equivalent, mean-field flips away from ½) and a demo of φ⁹₂₃,₄₇ on a rewired 30 × 30 grid; illustration, not a thesis figure.',
    params: { r: 9, k: 8, rule: { B: 23, S: 47 }, net: { kind: 'lat', side, degree, p }, rho0: 0.5, limit, trialSeeds: 'netSeed 101–120, startSeed 9101–9120', demoSearch: 'first netSeed s ≥ 1 with startSeed 7000 + s that synchronises within 60 ticks' },
    summary: { candidates: cands.length, pearsonAbsSlopeBs8: r3(r), trialsSynchronised: wins, trials: trials.length },
    candidates: cands, demo, trials,
  });
}

sync();
