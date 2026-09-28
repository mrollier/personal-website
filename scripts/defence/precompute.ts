// Precomputed data for the defence deck (src/data/defence/*.json): seeded and deterministic, with the parameters and
// summary numbers written into every file, so a rehearsal equals the performance and the report can quote them.
// The browser rebuilds networks and starts from the same seeds with the same code. Run: npm run precompute
import { writeFileSync, mkdirSync } from 'node:fs';
import { lattice, makeRng, buildNet, type NetSpec } from '../../src/scripts/net.ts';
import { type Rule, meanField, trial, randomState } from '../../src/scripts/llna.ts';
import { runFrom } from '../../src/scripts/consensus.ts';
import { candidates, sensitivity, jaggedness } from '../../src/scripts/genotype.ts';
import { pearson, spearman, median } from '../../src/scripts/stats.ts';
import { TOY, toyNet, toyRun, startSeed, separability } from '../../src/scripts/defence/toy.ts';

const out = new URL('../../src/data/defence/', import.meta.url);
mkdirSync(out, { recursive: true });
const save = (name: string, data: unknown) => { writeFileSync(new URL(name, out), JSON.stringify(data, null, 1) + '\n'); console.log(`wrote src/data/defence/${name}`); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const slope = (rule: Rule, k: number) => { const h = 1e-6; return (meanField(rule, k, 0.5 + h) - meanField(rule, k, 0.5 - h)) / (2 * h); };
const only = process.argv.slice(2);
const want = (name: string) => !only.length || only.includes(name);

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

// ── classify.json: which rule tells random, scale-free and small-world networks apart (G2, G3) ──
type Row = { B: number; S: number; J: number; jbar: number; acc: number; ratio: number; fps: number[][]; lively: boolean };
function classify() {
  const nets = TOY.types.flatMap((_, c) => Array.from({ length: TOY.perType }, (_, j) => ({ c, j, net: toyNet(c, j) })));
  const cls = nets.map((x) => x.c), rows: Row[] = [];
  for (let B = 0; B < 1 << TOY.r; B++) for (let S = 0; S < 1 << TOY.r; S++) {
    const rule: Rule = { r: TOY.r, B, S, part: 'uni' }, { J, Jbar } = jaggedness(rule);
    const runs = nets.map((x) => toyRun(x.net, rule, startSeed(x.c, x.j)));
    // lively: on every network the rule keeps between a fifth and four fifths of the hands up and at least a fifth changing
    // each round after the transient, so it separates by the texture of its pattern, not by dying out on one kind of network
    const lively = runs.every((r, k) => { const n = nets[k].net.n, t0 = TOY.burn * n; let on = 0, flip = 0; for (let t = t0; t < r.s.length; t++) { on += r.s[t]; if (t >= t0 + n) flip += r.s[t] ^ r.s[t - n]; } const d = on / (r.s.length - t0), f = flip / (r.s.length - t0 - n); return d >= 0.2 && d <= 0.8 && f >= 0.2; });
    const fps = runs.map((r) => r.fp);
    rows.push({ B, S, J, jbar: Jbar, ...separability(fps, cls), fps, lively });
  }
  const byScore = (a: Row, b: Row) => a.acc - b.acc || a.ratio - b.ratio;
  const typical = (xs: Row[]) => xs.slice().sort(byScore)[Math.floor((xs.length - 1) / 2)];
  const sweet = rows.filter((x) => x.jbar >= 0.5 && x.jbar <= 0.9 && x.lively).sort(byScore).at(-1)!;
  const smooth = typical(rows.filter((x) => x.jbar <= 0.2)), jagged = typical(rows.filter((x) => x.jbar >= 0.9));
  const corr = pearson(rows.map((x) => x.jbar), rows.map((x) => x.acc));
  const mean = (lo: number, hi: number) => { const g = rows.filter((x) => x.jbar >= lo && x.jbar <= hi); return r3(g.reduce((s, x) => s + x.acc, 0) / g.length); };
  const pick = (x: Row, role: string) => ({ role, B: x.B, S: x.S, J: x.J, jbar: r3(x.jbar), acc: r3(x.acc), ratio: r3(x.ratio), fps: x.fps.map((f) => f.map((v) => Math.round(v * 1e4) / 1e4)) });
  console.log(`classify: sweet ${sweet.B},${sweet.S} (J̄ ${sweet.jbar}, acc ${sweet.acc.toFixed(2)}, ratio ${sweet.ratio.toFixed(2)}), smooth ${smooth.B},${smooth.S} (J̄ ${smooth.jbar}, acc ${smooth.acc.toFixed(2)}), jagged ${jagged.B},${jagged.S} (acc ${jagged.acc.toFixed(2)}); Pearson(J̄, acc) over ${rows.length} rules = ${corr.toFixed(3)}; mean acc smooth/sweet/jagged ${mean(0, 0.2)}/${mean(0.5, 0.9)}/${mean(0.9, 1)}`);
  save('classify.json', {
    about: 'Toy version of the Ch. 9 pipeline: which r = 5 rule (uniform left-closed cut) tells three network types apart from their density fingerprints. Illustration, not a thesis figure; the thesis used 23 datasets, degree-segmented density histograms and an SVM.',
    params: { types: TOY.types, perType: TOY.perType, T: TOY.T, burn: TOY.burn, bins: TOY.bins, r: TOY.r, part: 'uni', rho0: 0.5, netSeeds: '500 + 10·type + j', startSeeds: '3000 + 10·type + j', fingerprint: 'normalised histogram of the neighbourhood density of every node, rounds burn to T − 1', classifier: 'leave-one-out nearest centroid, L1 distance, ties to the lower type index', tieBreak: 'between/within spread ratio', choice: 'sweet = most separable (accuracy, then spread ratio) with 0.5 ≤ J̄ ≤ 0.9 among lively rules; smooth = median separability with J̄ ≤ 0.2; jagged = median with J̄ ≥ 0.9', lively: 'on every network, density between 0.2 and 0.8 and at least 0.2 of the nodes changing per round after the transient' },
    summary: { rules: rows.length, lively: rows.filter((x) => x.lively).length, pearsonJbarAcc: r3(corr), meanAccSmooth: mean(0, 0.2), meanAccSweet: mean(0.5, 0.9), meanAccJagged: mean(0.9, 1), perfect: rows.filter((x) => x.acc === 1).length },
    examples: [pick(smooth, 'smooth'), pick(sweet, 'sweet'), pick(jagged, 'jagged')],
  });
}

// ── clamp.json: one stubborn person on a scale-free network (H1, H2, backup Q3) ──
function clamp() {
  const spec: NetSpec = { kind: 'ba', n: 100, m: 4 }, seed = 1, rule: Rule = { r: 9, B: 464, S: 488 }, T = 100, M = 100;
  const net = buildNet(spec, seed, 'force'), n = net.n, rnd = makeRng(seed * 7919 + 1);
  const starts: Uint8Array[] = [];
  let down = 0;
  for (let m = 0; m < M; m++) {
    const s0 = randomState(n, 0.5, rnd), o = runFrom(net, rule, s0, T);
    if (!o.consensus) continue;
    if (o.rho === 0) { down++; for (let j = 0; j < n; j++) s0[j] ^= 1; } // ends all-up by the rule's self-equivalence
    starts.push(s0);
  }
  const eta = new Float64Array(n), rev = new Float64Array(n), gen = new Float64Array(n), conf = new Float64Array(n), rhoT: number[][] = [], cl = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    cl.fill(-1); cl[i] = 0;
    const row: number[] = [];
    let sg = 0, ng = 0, sc = 0, nc = 0, sum = 0, r0 = 0;
    for (const s0 of starts) {
      const x = s0.slice(), was = x[i]; x[i] = 0;
      const o = runFrom(net, rule, x, T, cl), v = 1 - o.rho;
      row.push(o.rho); sum += v; if (o.rho === 0) r0++;
      if (was) { sg += v; ng++; } else { sc += v; nc++; }
    }
    eta[i] = sum / starts.length; rev[i] = r0 / starts.length; gen[i] = ng ? sg / ng : NaN; conf[i] = nc ? sc / nc : NaN; rhoT.push(row);
  }
  const deg = Float64Array.from(net.deg), idx = Array.from({ length: n }, (_, i) => i);
  const okg = idx.filter((i) => Number.isFinite(gen[i])), okc = idx.filter((i) => Number.isFinite(conf[i]));
  const sp = spearman(eta, deg), spg = spearman(okg.map((i) => gen[i]), okg.map((i) => deg[i])), spc = spearman(okc.map((i) => conf[i]), okc.map((i) => deg[i]));
  // H1: a start in which silencing one of the five most important people (hand up at the start) flips the whole network,
  // and silencing a quiet one (hand up too) changes nothing for anyone else
  const order = idx.slice().sort((a, b) => eta[b] - eta[a]);
  let demo = { start: -1, hi: -1, lo: -1 };
  for (let c = 0; c < starts.length && demo.start < 0; c++) {
    const hi = order.slice(0, 5).find((i) => starts[c][i] === 1 && rhoT[i][c] === 0);
    const lo = order.slice().reverse().find((i) => starts[c][i] === 1 && rhoT[i][c] >= 1 - 1.5 / n); // everyone else ends up: the clamped one is the only hand down
    if (hi !== undefined && lo !== undefined) demo = { start: c, hi, lo };
  }
  if (demo.start < 0) throw new Error('no start in which one of the top five flips the network and a quiet node does not');
  const s0 = starts[demo.start], runs: Record<string, { rho: number; tick: number; consensus: boolean }> = { free: runFrom(net, rule, s0, T) };
  for (const [k, i] of [['lo', demo.lo], ['hi', demo.hi]] as const) { cl.fill(-1); cl[i] = 0; const x = s0.slice(); x[i] = 0; runs[k] = runFrom(net, rule, x, T, cl); }
  console.log(`clamp: ${starts.length}/${M} starts reach consensus (${down} complemented); η ${r3(Math.min(...eta))}–${r3(Math.max(...eta))}, median ${r3(median(eta))}; Spearman(η, degree) ${sp.toFixed(3)}, genuine clampings only ${spg.toFixed(3)}, confirmatory only ${spc.toFixed(3)}; demo start ${demo.start}: node ${demo.hi} (k ${deg[demo.hi]}, η ${r3(eta[demo.hi])}) flips it, node ${demo.lo} (k ${deg[demo.lo]}, η ${r3(eta[demo.lo])}) does not`);
  save('clamp.json', {
    about: 'Dynamical importance on a toy scale-free network: every node clamped dead in turn under the consensus-seeking rule φ⁹₄₆₄,₄₈₈, over the random starts that reach consensus (those ending all-down complemented, as in the thesis). Illustration, not a thesis figure.',
    params: { spec, seed, rule: { r: 9, B: 464, S: 488 }, T, M, rho0: 0.5, layout: 'buildNet force layout, stored so the browser lays out nothing', startRng: 'makeRng(seed · 7919 + 1)', eta: 'η_i = 1 − ⟨ρᵀ⟩ with node i clamped at 0 from the start (thesis Eq. 10.2)', genuine: 'starts in which node i had its hand up', confirmatory: 'starts in which it was already down' },
    summary: { starts: starts.length, complemented: down, etaMin: r3(Math.min(...eta)), etaMedian: r3(median(eta)), etaMax: r3(Math.max(...eta)), spearmanEtaDegree: r3(sp), spearmanGenuineDegree: r3(spg), spearmanConfirmatoryDegree: r3(spc) },
    xy: Array.from(net.xy, (v) => Math.round(v * 1e4) / 1e4),
    edges: net.edges,
    deg: Array.from(net.deg), eta: Array.from(eta, r3), reversal: Array.from(rev, r3),
    etaGenuine: Array.from(gen, (v) => (Number.isFinite(v) ? r3(v) : null)), etaConfirmatory: Array.from(conf, (v) => (Number.isFinite(v) ? r3(v) : null)),
    demo: { ...demo, bits: Array.from(s0).join(''), runs },
  });
}

if (want('sync')) sync();
if (want('classify')) classify();
if (want('clamp')) clamp();
