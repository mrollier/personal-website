// Self-check for the defence deck's engines (src/scripts/defence/). Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reedSolomon, formatBits, qr } from '../src/scripts/defence/qr.ts';
import { stillMosaic } from '../src/scripts/defence/cover.ts';
import { decodeMosaic } from '../src/scripts/defence/mosaic.ts';
import { stepLife } from '../src/scripts/life.ts';
import { makeRng } from '../src/scripts/net.ts';
import { room, wire, degrees, SEATS } from '../src/scripts/defence/room.ts';
import { brain, fire, outline } from '../src/scripts/defence/brain.ts';
import { flock, stepFlock } from '../src/scripts/defence/boids.ts';

// QR: the Reed–Solomon codewords of the ISO worked example (HELLO WORLD, 1-M) and the published format-bit table.
assert.deepEqual(reedSolomon([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
const FORMAT = { L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
  M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'] } as const;
for (const L of ['L', 'M'] as const) FORMAT[L].forEach((bits, m) => assert.equal(formatBits(L, m).toString(2).padStart(15, '0'), bits));
const code = qr('https://michielrollier.be', 'M');
assert.equal(code.version, 2); assert.equal(code.size, 25);
// finder corners dark, their separators light, the dark module where the standard puts it
for (const [x, y] of [[0, 0], [24, 0], [0, 24], [8, 17]]) assert.ok(code.dark(x, y));
for (const [x, y] of [[7, 7], [17, 7], [7, 17]]) assert.ok(!code.dark(x, y));

// The title and closing mosaic (packed with the cover's code) is a still life on its padded torus, and every live cell
// of the page sits on a tile's ground.
{
  const m = decodeMosaic(JSON.parse(readFileSync(new URL('../src/data/defence/mosaic.json', import.meta.url), 'utf8')));
  assert.equal(m.W * 9, m.H * 16);
  assert.equal(stepLife(m.live, m.PW, m.PH, new Uint8Array(m.PW * m.PH)), 0, 'the title mosaic is not a still life');
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.live[(y + m.M) * m.PW + x + m.M]) assert.ok(m.ground[y * m.W + x] > 0, 'a live cell on the field');
}
// The still-life art of slide C3 is a still life, with and without tiles across the torus edge.
const tiles = JSON.parse(readFileSync(new URL('../src/data/tiles.json', import.meta.url), 'utf8'));
for (const wrap of [false, true]) {
  const art = stillMosaic(tiles, 13, 8, 3, 20261002, 0.5, -0.25, wrap), out = new Uint8Array(art.W * art.H);
  assert.ok(art.g.some((v) => v === 1));
  assert.equal(stepLife(art.g, art.W, art.H, out), 0, `mosaic with wrap=${wrap} is not a still life`);
}
// F1: the room. At p = 0 everyone is linked to the people around them (3 in a corner, 5 at a wall, 8 inside); the seat
// in row 5, column 4 keeps 8 contacts at every p (seed 12836); rewiring never doubles a link or loops a seat, keeps the number
// of links, and is monotone: a link rewired at p sits at the same seat at every larger p.
{
  const R = room(12836), home = wire(R, 0), key = (i: number, j: number) => (i < j ? i * SEATS + j : j * SEATS + i);
  assert.equal(R.links.length, 268);
  const d0 = degrees(R, home);
  assert.deepEqual([d0[0], d0[3], d0[35], d0[79]], [3, 5, 8, 3]);
  let prev = home;
  for (let q = 0; q <= 100; q++) {
    const to = wire(R, q / 100), pairs = new Set(R.links.map((l, k) => key(l.stay, to[k])));
    assert.equal(pairs.size, R.links.length, `a doubled link at p = ${q / 100}`);
    assert.ok(R.links.every((l, k) => l.stay !== to[k]));
    assert.equal(degrees(R, to)[35], 8, `you at p = ${q / 100}`);
    R.links.forEach((l, k) => { if (prev[k] !== l.home) assert.equal(to[k], prev[k], `link ${k} moved again at p = ${q / 100}`); });
    prev = to;
  }
  assert.ok(prev.filter((t, k) => t !== R.links[k].home).length > 260);
}
// D2: the brain network lies inside its outline and keeps firing, in avalanches, without ever saturating.
{
  const net = brain(260, 28, 6, 12, makeRng(3)), poly = outline();
  assert.ok(net.n > 200);
  let s = new Uint8Array(net.n), o = new Uint8Array(net.n), zeros = 0, most = 0;
  const rnd = makeRng(9);
  for (let t = 0; t < 1000; t++) { const f = fire(net, s, o, 0.25, 3, 0.003, rnd) / net.n; [s, o] = [o, s]; if (t >= 40) { zeros += f === 0 ? 1 : 0; most = Math.max(most, f); } }
  assert.ok(zeros < 10 && most < 0.3, `brain: ${zeros} silent rounds, at most ${most} firing`);
  assert.ok(poly.length === 160);
}
// D2: a bird near the pointer flies away from it.
{
  const f = flock(1, 800, 600, makeRng(1));
  f.x[0] = 400; f.y[0] = 300; f.vx[0] = 2; f.vy[0] = 0;
  stepFlock(f, { x: 440, y: 300 });
  assert.ok(f.vx[0] < 2, 'the bird does not turn away from the pointer');
}
console.log('defence checks passed');

// ── §6 of the brief: the genotype anchors, recomputed from the thesis definitions (Ch. 5 §5.3, Ch. 6, Ch. 9) ──
import { sensitivity, selfEquivalentRules, candidates, jaggedness, derrida } from '../src/scripts/genotype.ts';
import { type Rule, hammingWeight, meanField, complement, selfEquivalent, flipsTowardsHomogeneous, trial } from '../src/scripts/llna.ts';
import { lattice } from '../src/scripts/net.ts';
import { pearson } from '../src/scripts/stats.ts';
{
  const R9 = (B: number, S: number): Rule => ({ r: 9, B, S });
  const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  const slope = (rule: Rule) => { const h = 1e-6; return (meanField(rule, 8, 0.5 + h) - meanField(rule, 8, 0.5 - h)) / (2 * h); };
  const hl = R9(72, 12); // HighLife
  near(hammingWeight(hl, 4), 0.25, 5e-4, 'HighLife HW4'); near(hammingWeight(hl, 12), 0.368, 5e-4, 'HighLife HW12');
  near(sensitivity(hl, 4).BS, 2.5, 5e-3, 'HighLife BS4'); near(sensitivity(hl, 12).BS, 4.1, 5e-3, 'HighLife BS12');
  assert.equal(selfEquivalentRules(9).length, 512);
  const c27 = candidates(9, [8], 'sync'), has = (B: number, S: number) => c27.some((r) => r.B === B && r.S === S);
  assert.equal(c27.length, 27); assert.ok(has(23, 47) && has(79, 27) && !has(511, 0));
  const alt = selfEquivalentRules(9).filter((r) => flipsTowardsHomogeneous(r, 8));
  assert.deepEqual(alt.map((r) => `${r.B},${r.S}`).sort(), c27.map((r) => `${r.B},${r.S}`).sort());
  const win = R9(23, 47), bs = sensitivity(win, 8).BS;
  near(bs, 6.398, 5e-4, 'BS8 of 23,47'); near(slope(win), -1.148, 5e-4, 'slope of 23,47');
  near(derrida(win, 8, 0.5, 1e-6) / 1e-6, bs, 1e-3, 'Derrida slope at 0 = BS8');
  near(pearson(c27.map((r) => Math.abs(slope(r))), c27.map((r) => sensitivity(r, 8).BS)), -0.48, 5e-3, 'Pearson over the 27');
  const cons = complement(win); assert.deepEqual([cons.B, cons.S], [488, 464]); near(sensitivity(cons, 8).BS, bs, 1e-12, 'complement keeps BS8');
  const probe = R9(464, 488);
  near(sensitivity(probe, 8).BS, 6.398, 5e-4, 'BS8 of 464,488'); near(slope(probe), 1.477, 5e-4, 'slope of 464,488');
  assert.ok(selfEquivalent(probe) && selfEquivalent(R9(488, 464)));
  near(jaggedness(R9(170, 340)).Jbar, 0.94, 5e-3, 'Jbar 170,340'); near(jaggedness(R9(503, 120)).Jbar, 0.25, 1e-9, 'Jbar 503,120'); near(jaggedness(win).Jbar, 0.375, 1e-9, 'Jbar 23,47');
  const top = c27.reduce((a, r) => (sensitivity(r, 8).BS > sensitivity(a, 8).BS ? r : a));
  assert.deepEqual([top.B, top.S], [175, 21]); near(sensitivity(top, 8).BS, 6.96, 5e-3, 'highest BS8 among the 27');
  // the precomputed file agrees with a fresh computation
  const sync = JSON.parse(readFileSync(new URL('../src/data/defence/sync.json', import.meta.url), 'utf8'));
  assert.equal(sync.candidates.length, 27);
  for (const c of sync.candidates) { const r = R9(c.B, c.S); assert.ok(has(c.B, c.S)); near(c.bs8, sensitivity(r, 8).BS, 6e-4, 'sync.json bs8'); near(c.slope, slope(r), 6e-4, 'sync.json slope'); }
  assert.ok(sync.summary.trialsSynchronised >= 17);
  // and the stored runs are what the browser will replay: the demo and all twenty trials, rebuilt from their seeds
  const replay = (netSeed: number, startSeed: number) => trial('fssp', lattice(30, 8, 0.2, makeRng(netSeed)), win, 0.5, makeRng(startSeed), 1800);
  const d = replay(sync.demo.netSeed, sync.demo.startSeed); assert.ok(d.ok); assert.equal(d.tick, sync.demo.tick);
  for (const t of sync.trials) { const v = replay(t.netSeed, t.startSeed); assert.equal(v.ok, t.ok); assert.equal(v.tick, t.tick); }
  console.log('genotype anchors of the brief hold');
}

// ── G and H: the precomputed toy data replays exactly from its seeds ──
import { toyNet, toyFeatures, startSeed, lempelZiv, wordEntropy, TOY } from '../src/scripts/defence/toy.ts';
import { runFrom } from '../src/scripts/consensus.ts';
import { buildNet } from '../src/scripts/net.ts';
{
  // Lempel–Ziv: Kaspar and Schuster's worked example parses into six phrases; word entropy of runs 2, 1, 3 is log₂ 3
  const ks = '0001101001000101'.split('').map(Number);
  assert.equal(Math.round((lempelZiv(ks) * ks.length) / Math.log2(ks.length)), 6);
  assert.ok(Math.abs(wordEntropy([1, 1, 0, 1, 0, 1, 1, 1, 0]) - Math.log2(3)) < 1e-12);
  assert.equal(wordEntropy([1, 1, 1]), 0); assert.equal(wordEntropy([0, 0]), 0);
  const classify = JSON.parse(readFileSync(new URL('../src/data/defence/classify.json', import.meta.url), 'utf8'));
  for (const x of classify.examples) {
    const rule: Rule = { r: x.r, B: x.B, S: x.S, part: x.part };
    for (const [c, j] of [[0, 0], [1, 0], [2, 0], [1, 2], [2, 4]]) {
      const f = toyFeatures(toyNet(c, j), rule, startSeed(c, j));
      for (const k of ['lz', 'we', 'density'] as const) f[k].forEach((v, b) => assert.ok(Math.abs(v - x[k][c * TOY.perType + j][b]) < 1e-4, `classify.json ${k} ${x.B},${x.S} type ${c} net ${j}`));
    }
  }
  const [cons, det] = classify.examples;
  assert.ok(cons.B === 488 && cons.S === 464 && det.jbar >= 0.5 && det.jbar <= 0.9 && det.acc.lz === 1 && det.acc.we === 1 && det.acc.density === 1);
  // the three networks slide G3 shows reach consensus under the consensus-seeking rule
  for (const c of [0, 1, 2]) assert.ok(classify.consensusRounds[c * TOY.perType] !== null, `G3 network ${c} reaches consensus`);
  const clamp = JSON.parse(readFileSync(new URL('../src/data/defence/clamp.json', import.meta.url), 'utf8'));
  const net = buildNet(clamp.params.spec, clamp.params.seed, 'none'), rule: Rule = { r: 9, B: 464, S: 488 };
  assert.deepEqual(Array.from(net.deg), clamp.deg);
  const s0 = Uint8Array.from(clamp.demo.bits, (ch: string) => +ch), n = net.n, cl = new Int8Array(n);
  assert.equal(runFrom(net, rule, s0, 100).rho, 1, 'the H1 start ends all up');
  for (const [k, want] of [['hi', 0], ['lo', (n - 1) / n]] as const) {
    cl.fill(-1); cl[clamp.demo[k]] = 0; const x = s0.slice(); x[clamp.demo[k]] = 0;
    assert.ok(Math.abs(runFrom(net, rule, x, 100, cl).rho - want) < 1e-9, `H1 clamp ${k}`);
  }
  assert.ok(clamp.summary.spearmanEtaDegree > 0.5 && clamp.summary.spearmanEtaDegree < 0.9);
  console.log('toy data for G and H replays');
}
