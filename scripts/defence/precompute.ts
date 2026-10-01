// Precomputed data for the defence deck (src/data/defence/*.json): seeded and deterministic, with the parameters and
// summary numbers written into every file, so a rehearsal equals the performance and the report can quote them.
// The browser rebuilds networks and starts from the same seeds with the same code. Run: npm run precompute
import { writeFileSync, mkdirSync } from 'node:fs';
import { lattice, makeRng, buildNet, type NetSpec } from '../../src/scripts/net.ts';
import { type Rule, meanField, trial, randomState } from '../../src/scripts/llna.ts';
import { runFrom } from '../../src/scripts/consensus.ts';
import { candidates, sensitivity, jaggedness } from '../../src/scripts/genotype.ts';
import { pearson, spearman, median } from '../../src/scripts/stats.ts';
import { TOY, FEATURES, toyNet, toyFeatures, startSeed, separability, type Features } from '../../src/scripts/defence/toy.ts';
import { agree, WINNER, THRESHOLD, LIMIT } from '../../src/scripts/defence/agree.ts';
import { VILLAGE, villageNet } from '../../src/scripts/defence/village.ts';

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

// ── consensus.json: the mission of slides F5 and F7, every node the same colour: the 27 candidates (their own cousin,
// and the average next density moves away from ½ towards all on or all off), how sensitive each is, and the winner and
// the threshold rule on the rewired grid of "Watch it work", a demo and twenty fresh networks each ──
function consensus() {
  const cands = candidates(9, [8], 'consensus').map((rule) => ({ B: rule.B, S: rule.S, bs8: r3(sensitivity(rule, 8).BS), slope: r3(slope(rule, 8)) }));
  if (cands.length !== 27) throw new Error(`expected 27 consensus candidates, got ${cands.length}`);
  for (const r of [WINNER, THRESHOLD]) if (!cands.some((c) => c.B === r.B && c.S === r.S)) throw new Error(`φ⁹ ${r.B},${r.S} is not among the 27`);
  const side = 30, degree = 8 as const, p = 0.2, N = side * side;
  const run = (rule: Rule, netSeed: number, startSeed: number) => agree(lattice(side, degree, p, makeRng(netSeed)), rule, randomState(N, 0.5, makeRng(startSeed)));
  // the demo: the first seed pair on which the winner agrees within 25–60 rounds (seconds at three a second) and the
  // threshold rule, from the same start, gets stuck
  let demo = { netSeed: 0, startSeed: 0, tick: 0, threshold: { ok: false, tick: 0 } };
  for (let s = 1; s < 500 && !demo.netSeed; s++) {
    const v = run(WINNER, s, 7000 + s), w = run(THRESHOLD, s, 7000 + s);
    if (v.ok && v.tick >= 25 && v.tick <= 60 && !w.ok) demo = { netSeed: s, startSeed: 7000 + s, tick: v.tick, threshold: w };
  }
  if (!demo.netSeed) throw new Error('no demo seed');
  const trials = (rule: Rule) => Array.from({ length: 20 }, (_, i) => { const netSeed = 101 + i, startSeed = 9101 + i, v = run(rule, netSeed, startSeed); return { netSeed, startSeed, ok: v.ok, tick: v.tick }; });
  const won = trials(WINNER), stuck = trials(THRESHOLD), wins = (t: { ok: boolean }[]) => t.filter((x) => x.ok).length;
  console.log(`consensus: 27 candidates; demo agrees at round ${demo.tick}, the threshold rule stops at ${demo.threshold.tick}; trials ${wins(won)}/20 and ${wins(stuck)}/20`);
  save('consensus.json', {
    about: 'Consensus candidates at r = 9, k = 8 (their own cousin, mean-field away from ½ to a homogeneous rest) and the winner φ⁹₄₈₈,₄₆₄ against the threshold rule φ⁹₄₈₀,₄₉₆ on a rewired 30 × 30 grid; illustration, not a thesis figure.',
    params: { r: 9, k: 8, winner: { B: WINNER.B, S: WINNER.S }, threshold: { B: THRESHOLD.B, S: THRESHOLD.S }, net: { kind: 'lat', side, degree, p }, rho0: 0.5, limit: LIMIT, trialSeeds: 'netSeed 101–120, startSeed 9101–9120', demoSearch: 'first netSeed s ≥ 1 with startSeed 7000 + s on which the winner agrees within 25–60 rounds and the threshold rule does not' },
    summary: { candidates: cands.length, winnerTrials: wins(won), thresholdTrials: wins(stuck), trials: 20 },
    candidates: cands, demo, trials: { winner: won, threshold: stuck },
  });
}

// ── classify.json: a consensus-seeking rule and a jagged rule on three network types (G2, G3) ──
type Sep = { acc: number; ratio: number };
type Feat = 'entropy' | 'lz' | 'density';
type Row = { B: number; S: number; J: number; jbar: number; lively: boolean; all: Sep } & Record<Feat, Sep>;
const FEATS: Feat[] = ['entropy', 'lz', 'density'];
function classify() {
  const nets = TOY.types.flatMap((_, c) => Array.from({ length: TOY.perType }, (_, j) => ({ c, j, net: toyNet(c, j) })));
  const cls = nets.map((x) => x.c), rows: Row[] = [];
  const featuresOf = (rule: Rule) => nets.map((x) => toyFeatures(x.net, rule, startSeed(x.c, x.j)));
  // lively: on every network the rule keeps between a fifth and four fifths of the hands up and at least a fifth changing
  // each round after the transient, so it separates by the texture of its pattern, not by dying out on one kind of network
  const isLively = (fs: Features[]) => fs.every((f, k) => { const n = nets[k].net.n, t0 = TOY.burn * n; let on = 0, flip = 0; for (let t = t0; t < f.s.length; t++) { on += f.s[t]; if (t >= t0 + n) flip += f.s[t] ^ f.s[t - n]; } const d = on / (f.s.length - t0), fl = flip / (f.s.length - t0 - n); return d >= 0.2 && d <= 0.8 && fl >= 0.2; });
  // each feature on its own, and all three side by side as one fingerprint
  const seps = (fs: Features[]) => ({ ...(Object.fromEntries(FEATS.map((k) => [k, separability(fs.map((f) => f[k]), cls)])) as Record<Feat, Sep>), all: separability(fs.map((f) => FEATS.flatMap((k) => f[k])), cls) });
  for (let B = 0; B < 1 << TOY.r; B++) for (let S = 0; S < 1 << TOY.r; S++) {
    const rule: Rule = { r: TOY.r, B, S, part: 'uni' }, { J, Jbar } = jaggedness(rule), fs = featuresOf(rule);
    rows.push({ B, S, J, jbar: Jbar, lively: isLively(fs), ...seps(fs) });
  }
  // the detective: chosen by eye for three clearly different textures among the rules that qualify (lively, 0.5 ≤ J̄ ≤ 0.9,
  // the three features together classifying all 15 networks right, and each alone at least 13); the qualifying rules are
  // ranked by their weakest spread ratio
  const qualifies = (x: Row) => x.lively && x.jbar >= 0.5 && x.jbar <= 0.9 && x.all.acc === 1 && FEATS.every((k) => x[k].acc >= 13 / 15 - 1e-9);
  const weakest = (x: Row) => Math.min(...FEATS.map((k) => x[k].ratio));
  const ranked = rows.filter(qualifies).sort((x, y) => weakest(y) - weakest(x));
  const det = rows.find((x) => x.B === 14 && x.S === 13)!;
  if (!qualifies(det)) throw new Error('φ⁵₁₄,₁₃ no longer qualifies as the detective');
  // the consensus-seeking rule of slide F8 (φ⁹₄₈₈,₄₆₄): how many networks reach consensus, and how alike its fingerprints are
  const cons: Rule = { r: 9, B: 488, S: 464 }, cf = featuresOf(cons), df = featuresOf({ r: TOY.r, B: det.B, S: det.S, part: 'uni' });
  const consensus = cf.map((f, k) => { const n = nets[k].net.n; for (let t = 0; t < TOY.T; t++) { let on = 0; for (let i = 0; i < n; i++) on += f.s[t * n + i]; if (on === 0 || on === n) return { round: t, up: on === n }; } return null; });
  const csep = seps(cf), accOf = (xs: Row[], k: Feat) => r3(xs.reduce((acc, x) => acc + x[k].acc, 0) / xs.length);
  const band = (lo: number, hi: number) => rows.filter((x) => x.jbar >= lo && x.jbar <= hi);
  const corr = pearson(rows.map((x) => x.jbar), rows.map((x) => x.lz.acc));
  const r4 = (f: number[]) => f.map((v) => Math.round(v * 1e4) / 1e4);
  const pack = (role: string, rule: Rule, fs: Features[], sep: ReturnType<typeof seps>) => ({ role, r: rule.r, B: rule.B, S: rule.S, part: rule.part ?? 'pal', jbar: r3(jaggedness(rule).Jbar), acc: Object.fromEntries([...FEATS, 'all' as const].map((k) => [k, r3(sep[k].acc)])), ratio: Object.fromEntries([...FEATS, 'all' as const].map((k) => [k, r3(sep[k].ratio)])), entropy: fs.map((f) => r4(f.entropy)), lz: fs.map((f) => r4(f.lz)), density: fs.map((f) => r4(f.density)) });
  console.log(`classify: detective ${det.B},${det.S} (J̄ ${det.jbar}, weakest ratio ${weakest(det).toFixed(2)}, rank ${ranked.indexOf(det) + 1} of ${ranked.length} qualifying; top ${ranked.slice(0, 3).map((x) => `${x.B},${x.S}`).join(' ')}); consensus φ⁹₄₈₈,₄₆₄ reaches consensus on ${consensus.filter(Boolean).length}/15, LZ accuracy ${csep.lz.acc.toFixed(2)} ratio ${csep.lz.ratio.toFixed(2)}; Pearson(J̄, LZ accuracy) over ${rows.length} rules = ${corr.toFixed(3)}`);
  save('classify.json', {
    about: 'Toy version of the Ch. 9 pipeline: fingerprints of three network types under a jagged r = 5 rule (uniform left-closed cut) and under the consensus-seeking rule φ⁹₄₈₈,₄₆₄. Illustration, not a thesis figure; the thesis used 23 datasets, degree-segmented density histograms and an SVM.',
    params: { types: TOY.types, perType: TOY.perType, T: TOY.T, burn: TOY.burn, bins: TOY.bins, r: TOY.r, part: 'uni', rho0: 0.5, netSeeds: '500 + 10·type + j', startSeeds: '3000 + 10·type + j', features: { entropy: { ...FEATURES.entropy, about: 'Shannon entropy in bits of each node’s row after the transient, as Miranda et al. 2016 (Methods) define it and bin it: [0, 1] in 20 bins' }, lz: { ...FEATURES.lz, about: 'Lempel–Ziv complexity of each node’s row after the transient as Miranda et al. 2016 (S2) define it: g blocks of the dictionary parsing, times ln l / l' }, density: { lo: 0, hi: 1, bins: TOY.bins, about: 'the share of contacts up that every person sees, every round after the transient (Ch. 9 used this, per degree, 40 bins)' } }, classifier: 'leave-one-out nearest centroid, L1 distance, ties to the lower type index; ratio = between-centroid over within-type spread; all = the three histograms side by side as one fingerprint', lively: 'on every network, density between 0.2 and 0.8 and at least 0.2 of the nodes changing per round after the transient', choice: 'detective φ⁵₁₄,₁₃ picked by eye for distinct textures among the qualifying rules (lively, 0.5 ≤ J̄ ≤ 0.9, all 15 right on the three features together and at least 13 of 15 on each alone; it gets 13 on entropy alone, 15 on the others and together); consensus φ⁹₄₈₈,₄₆₄ = the consensus-seeking rule of slide F8' },
    summary: { rules: rows.length, lively: rows.filter((x) => x.lively).length, qualifying: ranked.length, detectiveRank: ranked.indexOf(det) + 1, consensusReached: consensus.filter(Boolean).length, pearsonJbarLzAcc: r3(corr), meanLzAccSmooth: accOf(band(0, 0.2), 'lz'), meanLzAccBand: accOf(band(0.5, 0.9), 'lz'), meanLzAccJagged: accOf(band(0.9, 1), 'lz') },
    consensusRounds: consensus,
    examples: [pack('consensus', cons, cf, csep), pack('detective', { r: TOY.r, B: det.B, S: det.S, part: 'uni' }, df, seps(df))],
  });
}

// ── clamp.json: one stubborn person in a toy village (H1–H3, the closing slides, backup Q18) ──
function clamp() {
  const seed = VILLAGE.seed, rule: Rule = { r: 9, B: 464, S: 488 }, T = 100, M = 100;
  const net = villageNet(), n = net.n, rnd = makeRng(seed * 7919 + 1);
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
  // the closing summary's stubborn people, one after the other: the best-connected, the most important, a quiet one and
  // H1's important one, each from the first start in which it does what it does in most starts (the whole village
  // follows, or not)
  const busiest = idx.slice().sort((a, b) => deg[b] - deg[a] || a - b)[0];
  const cycle = [busiest, order[0], demo.lo, demo.hi].map((i) => {
    const flips = rev[i] > 0.5, c = starts.findIndex((_, k) => (rhoT[i][k] === 0) === flips);
    return { node: i, flips, bits: Array.from(starts[c]).join('') };
  });
  const s0 = starts[demo.start], runs: Record<string, { rho: number; tick: number; consensus: boolean }> = { free: runFrom(net, rule, s0, T) };
  for (const [k, i] of [['lo', demo.lo], ['hi', demo.hi]] as const) { cl.fill(-1); cl[i] = 0; const x = s0.slice(); x[i] = 0; runs[k] = runFrom(net, rule, x, T, cl); }
  console.log(`clamp: ${starts.length}/${M} starts reach consensus (${down} complemented); η ${r3(Math.min(...eta))}–${r3(Math.max(...eta))}, median ${r3(median(eta))}; Spearman(η, degree) ${sp.toFixed(3)}, genuine clampings only ${spg.toFixed(3)}, confirmatory only ${spc.toFixed(3)}; demo start ${demo.start}: node ${demo.hi} (k ${deg[demo.hi]}, η ${r3(eta[demo.hi])}) flips it, node ${demo.lo} (k ${deg[demo.lo]}, η ${r3(eta[demo.lo])}) does not`);
  save('clamp.json', {
    about: 'Dynamical importance in a toy village (src/scripts/defence/village.ts): every node clamped dead in turn under the consensus-seeking rule φ⁹₄₆₄,₄₈₈, over the random starts that reach consensus (those ending all-down complemented, as in the thesis). Illustration, not a thesis figure.',
    params: { village: VILLAGE, rule: { r: 9, B: 464, S: 488 }, T, M, rho0: 0.5, layout: 'force layout from the seed (villageNet), stored so the browser lays out nothing', startRng: 'makeRng(seed · 7919 + 1)', eta: 'η_i = 1 − ⟨ρᵀ⟩ with node i clamped at 0 from the start (thesis Eq. 10.2)', genuine: 'starts in which node i had its hand up', confirmatory: 'starts in which it was already down' },
    summary: { starts: starts.length, complemented: down, etaMin: r3(Math.min(...eta)), etaMedian: r3(median(eta)), etaMax: r3(Math.max(...eta)), spearmanEtaDegree: r3(sp), spearmanGenuineDegree: r3(spg), spearmanConfirmatoryDegree: r3(spc) },
    xy: Array.from(net.xy, (v) => Math.round(v * 1e4) / 1e4),
    edges: net.edges,
    deg: Array.from(net.deg), eta: Array.from(eta, r3), reversal: Array.from(rev, r3),
    etaGenuine: Array.from(gen, (v) => (Number.isFinite(v) ? r3(v) : null)), etaConfirmatory: Array.from(conf, (v) => (Number.isFinite(v) ? r3(v) : null)),
    demo: { ...demo, bits: Array.from(s0).join(''), runs },
    cycle,
  });
}

if (want('sync')) sync();
if (want('consensus')) consensus();
if (want('classify')) classify();
if (want('clamp')) clamp();
