// Self-check for the defence deck's engines (src/scripts/defence/). Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reedSolomon, formatBits, qr } from '../src/scripts/defence/qr.ts';
import { pack, noise, bank, spark } from '../src/scripts/defence/cover.ts';
import { decodeMosaic, BREAK } from '../src/scripts/defence/mosaic.ts';
import { stepLife, putRle, GOSPER_GUN, EATER, EATER_AT, ActiveLife } from '../src/scripts/life.ts';
import { makeRng } from '../src/scripts/net.ts';
import { room, wire, degrees, SEATS, COLS, ROWS } from '../src/scripts/defence/room.ts';
import { brain, fire, outline } from '../src/scripts/defence/brain.ts';
import { flock, stepFlock } from '../src/scripts/defence/boids.ts';
import { remap, ends, intervalOf, cousin } from '../src/scripts/defence/rings.ts';
import { step, randomState, phi, type Rule as LlnaRule } from '../src/scripts/llna.ts';
import { trioNet, trioStart, PHONES } from '../src/scripts/defence/trio.ts';
import { wildfire, FIRE, BARE, BURNING, BURNT } from '../src/scripts/defence/wildfire.ts';
import { fingerprinter, PRINT } from '../src/scripts/defence/print.ts';
import { neighbourDegree, knnSpearman } from '../src/scripts/defence/importance.ts';
import type { NetSpec } from '../src/scripts/net.ts';

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

// How many cells differ from the still life `g` 200 generations after cell i is taken away.
function spread(g: Uint8Array, W: number, H: number, i: number): number {
  const t = g.slice(), life = new ActiveLife(W, H);
  t[i] = 0; life.touch(i % W, Math.floor(i / W));
  for (let k = 0; k < 200; k++) life.step(t);
  return t.reduce((d, v, j) => d + (v !== g[j] ? 1 : 0), 0);
}

// The title and closing mosaic (packed with the cover's code) is a still life on its padded torus, every live cell of
// the page sits on a tile's ground, and the cell the closing slide takes away (BREAK) is alive and breaks it down: after
// a hundred generations thousands of cells have changed.
{
  const m = decodeMosaic(JSON.parse(readFileSync(new URL('../src/data/defence/mosaic.json', import.meta.url), 'utf8')));
  assert.equal(m.W * 9, m.H * 16);
  assert.equal(stepLife(m.live, m.PW, m.PH, new Uint8Array(m.PW * m.PH)), 0, 'the title mosaic is not a still life');
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.live[(y + m.M) * m.PW + x + m.M]) assert.ok(m.ground[y * m.W + x] > 0, 'a live cell on the field');
  const at = (BREAK.y + m.M) * m.PW + BREAK.x + m.M, g = m.live.slice(), life = new ActiveLife(m.PW, m.PH);
  assert.equal(g[at], 1, 'the closing slide takes away a dead cell');
  g[at] = 0; life.touch(BREAK.x + m.M, BREAK.y + m.M);
  for (let t = 0; t < 100; t++) life.step(g);
  assert.ok(g.reduce((d, v, j) => d + (v !== m.live[j] ? 1 : 0), 0) >= 5000, 'the closing slide does not break the still life down');
}
// The still-life art of slide C3: any packing of tiles of levels 5, 4 and 3 and ponds on the pond lattice is a still
// life, whatever the heights and the seed, and no tile lands where it must keep clear (the note). Every tile of the bank,
// as the corner tiles use them, is a still life on its own.
const tiles = JSON.parse(readFileSync(new URL('../src/data/tiles.json', import.meta.url), 'utf8'));
for (let seed = 1; seed <= 40; seed++) {
  const W = 216, H = 126, clear = (x: number, y: number) => x > 110 || y < 90;
  const art = pack(tiles, W, H, noise(W, H, 20 + seed, makeRng(seed)), { 5: 0.66, 4: 0.56, 3: 0.46, 1: 0.34 }, seed, clear);
  assert.ok(art.g.some((v) => v === 1) && new Set(art.ground).size >= 3, `packing ${seed} has too few levels`);
  assert.equal(stepLife(art.g, W, H, new Uint8Array(W * H)), 0, `packing ${seed} is not a still life`);
  for (let i = 0; i < W * H; i++) if (!clear(i % W, Math.floor(i / W))) assert.equal(art.ground[i], 0, `packing ${seed} covers the note`);
  if (seed <= 10) assert.ok(spread(art.g, W, H, spark(art.g, W, H, 0.64 * W, 0.4 * H)) >= 1000, `the disturbance of packing ${seed} heals`);
}
for (const L of [1, 3, 4, 5]) for (const t of bank(tiles, L)) {
  const n = 6 * L, P = n + 4, g = new Uint8Array(P * P);
  for (let k = 0; k < n * n; k++) g[(Math.floor(k / n) + 2) * P + (k % n) + 2] = t[k];
  assert.equal(stepLife(g, P, P, new Uint8Array(P * P)), 0, `a level-${L} tile is not a still life on its own`);
}
// C2: Gosper's gun firing into the eater, on the slide's 130 × 66 torus, settles into a cycle of 30 generations.
{
  const W = 130, H = 66, seen: string[] = [];
  let g = new Uint8Array(W * H), o = new Uint8Array(W * H);
  putRle(GOSPER_GUN, g, W, 26, 1); putRle(EATER, g, W, 26 + EATER_AT[0], 1 + EATER_AT[1]);
  for (let t = 1; t <= 660; t++) { stepLife(g, W, H, o); [g, o] = [o, g]; if (t > 600) seen.push(Buffer.from(g).toString('base64')); }
  assert.equal(seen[0], seen[30], 'the gun and the eater do not cycle with period 30');
}
// F1: the room. At p = 0 everyone is linked to the eight people around them, the room wrapping round at its edges; the
// long row (up from the back, snaking, closed over the back edge) is made of those links; the seat in row 5, column 4
// keeps 8 contacts at every p (seed 114895); rewiring never doubles a link or loops a seat, keeps the number of links,
// and is monotone: a link rewired at p sits at the same seat at every larger p.
{
  const R = room(114895), home = wire(R, 0), key = (i: number, j: number) => (i < j ? i * SEATS + j : j * SEATS + i);
  assert.equal(R.links.length, 320);
  assert.ok(degrees(R, home).every((d) => d === 8), 'not everyone has eight contacts at p = 0');
  const grid = new Set(R.links.map((l) => key(l.stay, l.home)));
  const row = Array.from({ length: SEATS }, (_, i) => { const q = Math.floor(i / COLS), c = i % COLS; return (ROWS - 1 - q) * COLS + (q % 2 ? COLS - 1 - c : c); });
  assert.equal(new Set(row).size, SEATS);
  assert.ok(row.every((a, i) => grid.has(key(a, row[(i + 1) % SEATS]))), 'the long row leaves the grid');
  let prev = home;
  for (let q = 0; q <= 100; q++) {
    const to = wire(R, q / 100), pairs = new Set(R.links.map((l, k) => key(l.stay, to[k])));
    assert.equal(pairs.size, R.links.length, `a doubled link at p = ${q / 100}`);
    assert.ok(R.links.every((l, k) => l.stay !== to[k]));
    assert.equal(degrees(R, to)[35], 8, `you at p = ${q / 100}`);
    R.links.forEach((l, k) => { if (prev[k] !== l.home) assert.equal(to[k], prev[k], `link ${k} moved again at p = ${q / 100}`); });
    prev = to;
  }
  assert.ok(prev.filter((t, k) => t !== R.links[k].home).length > 310);
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
// I2: the wildfire, from any forest, crosses to the east edge and goes out; it burns part of the forest, hardly any of
// it upwind of where it started, and its scar fans out downwind: a column in the east third has more burnt trees than
// one in the west third. Every tree burns for 8 to 14 rounds.
{
  const f = wildfire(), [x0] = FIRE.at, col = (k: number) => { let c = 0; for (let y = 0; y < f.H; y++) c += f.kind[y * f.W + k] === BURNT ? 1 : 0; return c; };
  for (let seed = 1; seed <= 12; seed++) {
    f.plant(seed);
    const lit = new Int32Array(f.W * f.H).fill(-1);
    let t = 0, edge = false, trees = 0;
    for (let i = 0; i < f.W * f.H; i++) trees += f.kind[i] !== BARE ? 1 : 0;
    while (t < 600) {
      for (let i = 0; i < f.W * f.H; i++) if (f.kind[i] === BURNING && lit[i] < 0) lit[i] = t; else if (f.kind[i] === BURNT && lit[i] >= 0) { assert.ok(t - lit[i] >= FIRE.burn[0] && t - lit[i] <= FIRE.burn[1], `wildfire ${seed}: a tree burnt for ${t - lit[i]} rounds`); lit[i] = -2; }
      if (f.step()) break;
      t++;
      for (let y = 0; y < f.H; y++) edge ||= f.kind[y * f.W + f.W - 1] === BURNING;
    }
    let burnt = 0, west = 0, upwind = 0;
    for (let i = 0; i < f.W * f.H; i++) if (f.kind[i] === BURNT) { burnt++; if (i % f.W < x0 - 3) upwind++; }
    for (let k = x0 + 2; k < x0 + 2 + (f.W - x0) / 3; k++) west += col(k);
    let east = 0; for (let k = f.W - Math.floor((f.W - x0) / 3); k < f.W; k++) east += col(k);
    assert.ok(edge && t < 600, `wildfire ${seed}: reaches the east edge and goes out (${t} rounds)`);
    assert.ok(burnt > trees / 3 && burnt < (4 * trees) / 5 && upwind < burnt / 50, `wildfire ${seed}: ${burnt} of ${trees} trees burnt, ${upwind} upwind`);
    assert.ok(east > 1.3 * west, `wildfire ${seed}: east ${east} against west ${west}`);
  }
}
// D2: a bird near the pointer flies away from it.
{
  const f = flock(1, 800, 600, makeRng(1));
  f.x[0] = 400; f.y[0] = 300; f.vx[0] = 2; f.vy[0] = 0;
  stepFlock(f, { x: 440, y: 300 });
  assert.ok(f.vx[0] < 2, 'the bird does not turn away from the pointer');
}
// C3: the tiles of levels 2 and 6 (src/data/defence/still.json) are still lifes on their own, like the others.
{
  const extra = JSON.parse(readFileSync(new URL('../src/data/defence/still.json', import.meta.url), 'utf8'));
  for (const L of [2, 6]) {
    const n = 6 * L, P = n + 4, g = new Uint8Array(P * P), bytes = Buffer.from(extra[L], 'base64');
    for (let k = 0; k < n * n; k++) g[(Math.floor(k / n) + 2) * P + (k % n) + 2] = (bytes[k >> 3] >> (7 - (k & 7))) & 1;
    assert.ok(g.some((v) => v === 1));
    assert.equal(stepLife(g, P, P, new Uint8Array(P * P)), 0, `the level-${L} tile of C3 is not a still life`);
  }
}
// F2 and D3: the rings keep the chosen density regions. Carried to a finer odd resolution and back, any rule at
// resolution 5 comes back as it was; φ⁵₆,₁₁ at resolution 7 is φ⁷₁₄,₅₅ (worked out by hand).
for (let x = 0; x < 32; x++) for (const r of [7, 9, 11, 13]) assert.equal(remap(remap(x, 5, r), r, 5), x, `rule ${x} through resolution ${r}`);
assert.equal(remap(6, 5, 7), 14); assert.equal(remap(11, 5, 7), 55);
// F2: the ends each interval includes (solid on the rings) follow the thesis: at r = 5 [0, 1/5[, [1/5, 2/5[, [2/5, 3/5], ]3/5, 4/5],
// ]4/5, 1]; at even r the born ring gives ½ to the interval left of it (R⁺), the survive ring to the one right of it (R⁻).
assert.deepEqual([0, 1, 2, 3, 4].map((k) => ends(k, 5, false)), [[true, false], [true, false], [true, true], [false, true], [false, true]]);
assert.equal(intervalOf(0.4, 5, false), 2); assert.equal(intervalOf(0.6, 5, true), 2); assert.equal(intervalOf(0.2, 5, true), 1);
assert.equal(intervalOf(0.5, 4, false), 1); assert.equal(intervalOf(0.5, 4, true), 2);
// Swapping on and off (ρ → 1 − ρ) carries every interval of one ring to its mirror image on the other, at every r.
for (let r = 2; r <= 13; r++) for (let k = 1; k <= 16; k++) for (let q = 0; q <= k; q++) for (const on of [false, true])
  assert.equal(intervalOf(1 - q / k, r, !on), r - 1 - intervalOf(q / k, r, on), `r ${r}, ${q}/${k}`);
// The cousin (App. C): φ⁵₆,₂₈ and φ⁵₂₄,₁₉ are each other's; a cousin's cousin is the rule itself; φ⁹₄₈₈,₄₆₄ is its own.
assert.deepEqual(cousin({ r: 5, B: 6, S: 28 }), { r: 5, B: 24, S: 19 });
for (const r of [4, 5]) for (let B = 0; B < 1 << r; B++) for (let S = 0; S < 1 << r; S++) assert.deepEqual(cousin(cousin({ r, B, S })), { r, B, S });
assert.deepEqual(cousin({ r: 9, B: 488, S: 464 }), { r: 9, B: 488, S: 464 });
// …and it behaves exactly the same with the colours swapped, as the simulator (llna.ts) runs it, at odd r.
{
  const net = buildNet({ kind: 'npa', n: 120, m: 4, alpha: 1 }, 5, 'none'), rnd = makeRng(77);
  for (let k = 0; k < 60; k++) {
    const r = [3, 5, 7, 9][k % 4], rule: LlnaRule = { r, B: Math.floor(rnd() * (1 << r)), S: Math.floor(rnd() * (1 << r)) }, twin = cousin(rule);
    const a = randomState(net.n, 0.5, rnd), na = a.map((v) => 1 - v), out = step(a, net, rule), nout = step(na, net, twin);
    assert.ok(out.every((v, i) => v === 1 - nout[i]), `the cousin of φ${r} ${rule.B},${rule.S} does not mirror it`);
  }
}
// The talk's three networks (trio.ts), as the say texts of F3 and G2 describe them: all connected; the random one with
// two to thirteen neighbours, the ring with nearly eight each, the scale-free one with four for more than half of its
// nodes and one hub of 106.
{
  const nets = [0, 1, 2].map((k) => trioNet(k, 'none'));
  for (const net of nets) { const seen = new Uint8Array(net.n), q = [0]; seen[0] = 1; while (q.length) { const v = q.pop()!; for (const w of net.adj[v]) if (!seen[w]) { seen[w] = 1; q.push(w); } } assert.ok(seen.every((x) => x), 'a trio network falls apart'); }
  const deg = nets.map((net) => Array.from(net.deg as ArrayLike<number>));
  assert.deepEqual([Math.min(...deg[0]), Math.max(...deg[0])], [2, 13]);
  assert.deepEqual([Math.min(...deg[1]), Math.max(...deg[1])], [5, 12]);
  assert.equal(deg[2].filter((d) => d === 4).length, 80); assert.equal(Math.max(...deg[2]), 106);
  // F3: from each network's start, φ⁹₁₆₈,₄₈₆ keeps going on the random network (still changing after a hundred
  // timesteps), fills up and freezes on the ring (nine in ten on, still within sixty) and all but dies out on the
  // scale-free one (at most a tenth on after sixty); a node with two or four links can never be born under it
  const run = (k: number, rule: Rule, T: number) => {
    const net = nets[k];
    let a = trioStart(k, net.n), b = new Uint8Array(net.n), last = 0;
    for (let t = 1; t <= T; t++) { step(a, net, rule, b); let c = 0; for (let x = 0; x < net.n; x++) c += a[x] ^ b[x]; [a, b] = [b, a]; if (c > 0) last = t; }
    return { last, on: a.reduce((m, v) => m + v, 0) / net.n };
  };
  const F3: Rule = { r: 9, B: 168, S: 486 }, f3 = [0, 1, 2].map((k) => run(k, F3, k ? 60 : 100));
  assert.equal(f3[0].last, 100, 'F3: the rule settles on the random network');
  assert.ok(f3[0].on > 0.2 && f3[0].on < 0.7, `F3: the random network's share on: ${f3[0].on}`);
  assert.ok(f3[1].last < 60 && f3[1].on >= 0.9, `F3: the ring does not fill up and freeze: ${JSON.stringify(f3[1])}`);
  assert.ok(f3[2].on <= 0.1, `F3: the scale-free network lives on: ${f3[2].on}`);
  assert.deepEqual([stepOne(F3, 2), stepOne(F3, 4)], [0, 0], 'F3: a node with two or four links can be born');
  // G2: under the good detective φ⁹₁₇₀,₄₈ all three stay lively and their fingerprints over the whole run of 100
  // timesteps differ clearly, from the networks' own starts and from any of 40 others; nodes with two or four neighbours
  // can never be born under it. Under the consensus-seeking winner all three are all off within twenty timesteps, the
  // slide's run stops a second (twelve timesteps) after all three stand still, and their fingerprints are alike: each
  // pair closer than the same pair under the detective from the same starts, the density piled up at 0 on all three.
  const DET: Rule = { r: 9, B: 170, S: 48 }, prints = (rule: Rule, seed = -1) => nets.map((net, k) => {
    const fp = fingerprinter(net), rnd = makeRng(seed);
    let a = seed < 0 ? trioStart(k, net.n) : randomState(net.n, 0.3, rnd), b = new Uint8Array(net.n), flips = 0, off = -1;
    fp.push(a);
    for (let t = 1; t <= PRINT.T; t++) { step(a, net, rule, b); if (t > PRINT.T - 20) for (let x = 0; x < net.n; x++) flips += a[x] ^ b[x]; [a, b] = [b, a]; fp.push(a); if (off < 0 && a.every((v) => !v)) off = t; }
    return { print: fp.print(), flips: flips / 20 / net.n, off };
  });
  const dist = (x: ReturnType<typeof prints>[number], y: ReturnType<typeof prints>[number]) => (['entropy', 'lz', 'density'] as const).reduce((acc, f) => acc + x.print[f]!.reduce((m, v, b) => m + Math.abs(v - y.print[f]![b]), 0), 0);
  const pairs = [[0, 1], [0, 2], [1, 2]], detOwn = pairs.map(() => 0);
  for (const seed of [-1, ...Array.from({ length: 40 }, (_, i) => 5000 + i)]) {
    const det = prints(DET, seed);
    if (seed < 0) pairs.forEach(([x, y], q) => (detOwn[q] = dist(det[x], det[y])));
    for (const m of det) assert.ok(m.flips >= 0.3, `G2: the detective is not lively on a trio network (start ${seed})`);
    for (const [x, y] of pairs) { const d = dist(det[x], det[y]); assert.ok(d >= 1, `G2: fingerprints ${x} and ${y} look alike under the detective (start ${seed})`); }
  }
  assert.deepEqual([stepOne(DET, 2), stepOne(DET, 4)], [0, 0], 'G2: a node with two or four neighbours can be born under the detective');
  // G5: the phones' hidden network has one hub of 34 links, and the good detective keeps half of the phones or more
  // switching every timestep, from the slide's start and from twenty others
  {
    const net = buildNet(PHONES.spec, PHONES.seed, 'none');
    assert.equal(Math.max(...Array.from(net.deg as ArrayLike<number>)), 34, 'G5: the hub');
    for (const rnd of [makeRng(PHONES.start), ...Array.from({ length: 20 }, (_, i) => makeRng(700 + i))]) {
      let a = randomState(net.n, 0.5, rnd), b = new Uint8Array(net.n), f = 0;
      for (let t = 1; t <= 80; t++) { step(a, net, DET, b); if (t > 20) for (let x = 0; x < net.n; x++) f += a[x] ^ b[x]; [a, b] = [b, a]; }
      assert.ok(f / 60 / net.n >= 0.5, 'G5: the phones go quiet');
    }
  }
  const win = prints({ r: 9, B: 488, S: 464 });
  for (const w of win) assert.ok(w.off >= 0 && w.off <= 20, 'G2: the winner does not bring a trio network to all off');
  {
    // the slide's own run of the consensus-seeking rule: all three in step, until twelve timesteps after none of them moved
    const W: Rule = { r: 9, B: 488, S: 464 }, fps = nets.map((net) => fingerprinter(net));
    let a = nets.map((net, k) => trioStart(k, net.n)), still = 0, t = 0;
    a.forEach((x, k) => fps[k].push(x));
    while (t < PRINT.T && still < 12) {
      let moved = false;
      a = a.map((x, k) => { const y = new Uint8Array(x.length); step(x, nets[k], W, y); if (!moved && y.some((v, i) => v !== x[i])) moved = true; fps[k].push(y); return y; });
      still = moved ? 0 : still + 1; t++;
    }
    assert.ok(t <= 35 && a.every((x) => x.every((v) => !v)), `G2: the consensus run does not settle on all off within 35 timesteps (${t})`);
    const ws = fps.map((fp) => ({ print: fp.print(), flips: 0, off: 0 }));
    pairs.forEach(([x, y], q) => assert.ok(dist(ws[x], ws[y]) < 0.9 * detOwn[q], `G2: the consensus prints ${x} and ${y} are not alike (${dist(ws[x], ws[y]).toFixed(2)} against ${detOwn[q].toFixed(2)})`));
    for (const w of ws) assert.ok(w.print.density![0] >= 0.7, 'G2: the consensus density does not pile up at 0');
  }
}
// D3: on the 16 × 16 small-world grid (network 31, start 70) the Game of Life is still busy after 300 rounds.
{
  const net = buildNet({ kind: 'lat', side: 16, degree: 8, p: 0.05 }, 31, 'none');
  let a = randomState(net.n, 0.4, makeRng(70)), b = new Uint8Array(net.n), last = 0;
  for (let t = 1; t <= 300; t++) { step(a, net, { r: 9, B: 8, S: 12 }, b); let c = 0; for (let x = 0; x < net.n; x++) c += a[x] ^ b[x]; [a, b] = [b, a]; if (c > 0) last = t; }
  assert.equal(last, 300, 'D3: the Game of Life stops on the grid');
}
/** Whether an off node with `k` neighbours can be born under `rule` at any count of neighbours on: 1 if so. */
function stepOne(rule: Rule, k: number): number { for (let q = 0; q <= k; q++) if (phi(0, q, k, rule)) return 1; return 0; }
console.log('defence checks passed');

// ── §6 of the brief: the genotype anchors, recomputed from the thesis definitions (Ch. 5 §5.3, Ch. 6, Ch. 9) ──
import { sensitivity, selfEquivalentRules, candidates, jaggedness, derrida } from '../src/scripts/genotype.ts';
import { type Rule, hammingWeight, meanField, complement, selfEquivalent, flipsTowardsHomogeneous, trial } from '../src/scripts/llna.ts';
import { lattice } from '../src/scripts/net.ts';
import { pearson } from '../src/scripts/stats.ts';
import { curveOf, tangentOf, type Kind } from '../src/scripts/defence/curves.ts';
import { agree, agreement, WINNER, THRESHOLD } from '../src/scripts/defence/agree.ts';
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
  near(jaggedness(R9(170, 340)).Jbar, 0.94, 5e-3, 'Jbar 170,340'); near(jaggedness(R9(170, 48)).Jbar, 0.625, 1e-9, 'Jbar 170,48'); near(jaggedness(R9(503, 120)).Jbar, 0.25, 1e-9, 'Jbar 503,120'); near(jaggedness(win).Jbar, 0.375, 1e-9, 'Jbar 23,47');
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
  // the mission slides (F5, F7): the 27 consensus candidates are the 27 above turned over, and consensus.json agrees with a
  // fresh computation; the threshold rule is one of them and moves away from ½ the fastest, yet the winner is far more
  // sensitive; the demo and all forty trials replay as stored
  const k27 = candidates(9, [8], 'consensus'), mission = JSON.parse(readFileSync(new URL('../src/data/defence/consensus.json', import.meta.url), 'utf8'));
  assert.deepEqual(k27.map((r) => `${r.B},${r.S}`).sort(), c27.map((r) => { const f = complement(r); return `${f.B},${f.S}`; }).sort());
  assert.deepEqual(mission.candidates.map((c: Rule) => `${c.B},${c.S}`).sort(), k27.map((r) => `${r.B},${r.S}`).sort());
  for (const c of mission.candidates) { near(c.bs8, sensitivity(R9(c.B, c.S), 8).BS, 6e-4, 'consensus.json bs8'); near(c.slope, slope(R9(c.B, c.S)), 6e-4, 'consensus.json slope'); }
  const steepest = k27.reduce((a, r) => (slope(r) > slope(a) ? r : a)); assert.deepEqual([steepest.B, steepest.S], [480, 496]);
  near(sensitivity(R9(480, 496), 8).BS, 2.46, 5e-3, 'BS8 of the threshold rule'); near(sensitivity(R9(488, 464), 8).BS, 6.398, 5e-4, 'BS8 of the winner');
  const again = (rule: Rule, netSeed: number, startSeed: number, limit?: number) => agree(lattice(30, 8, 0.2, makeRng(netSeed)), rule, randomState(900, 0.5, makeRng(startSeed)), limit);
  const dv = again(WINNER, mission.demo.netSeed, mission.demo.startSeed); assert.ok(dv.ok); assert.equal(dv.tick, mission.demo.tick);
  assert.deepEqual(again(THRESHOLD, mission.demo.netSeed, mission.demo.startSeed), mission.demo.threshold);
  for (const [rule, ts] of [[WINNER, mission.trials.winner], [THRESHOLD, mission.trials.threshold]] as const) for (const t of ts) assert.deepEqual(again(rule, t.netSeed, t.startSeed), { ok: t.ok, tick: t.tick });
  assert.equal(mission.summary.winnerTrials, 19); assert.equal(mission.summary.thresholdTrials, 0); // as the say slot of F7 tells
  // F5's race, as its say slot tells: all 27 on the demo grid from the demo start, for at most 100 rounds; three agree,
  // the winner among them, and the threshold rule is stuck from round 10
  const race = (mission.candidates as Rule[]).map((c) => ({ c, v: again(R9(c.B, c.S), mission.demo.netSeed, mission.demo.startSeed, 100) }));
  assert.deepEqual(race.filter((x) => x.v.ok).map((x) => `${x.c.B},${x.c.S}`).sort(), ['368,482', '432,484', '488,464'], 'F5: who agrees');
  assert.deepEqual(race.find((x) => x.c.B === THRESHOLD.B && x.c.S === THRESHOLD.S)!.v, { ok: false, tick: 10 }, 'F5: the threshold rule');
  // and, as its conclusion tells, no other rule that is its own cousin agrees for good in that race: of all 512, only these
  // three (a synchroniser makes every node the same colour too, but flips them all the next round)
  const net0 = lattice(30, 8, 0.2, makeRng(mission.demo.netSeed)), start0 = randomState(900, 0.5, makeRng(mission.demo.startSeed));
  const lasting = (rule: Rule) => {
    const run = agreement(net0, rule, start0, 100);
    let o = run.next(); while (!o) o = run.next();
    return o.ok && step(run.state, net0, rule).every((v, i) => v === run.state[i]);
  };
  assert.deepEqual(selfEquivalentRules(9).filter(lasting).map((r) => `${r.B},${r.S}`).sort(), ['368,482', '432,484', '488,464'], 'F5: no other rule that is its own cousin');
  // the metrics slides' red lines, as their say slots quote them: Life unstable near a fifth with slope 1.7, sensitivity
  // about three; the consensus-seeker unstable at ½, sensitivity over six; the defect tangent is the Boolean sensitivity
  const life = R9(8, 12), tan = (rule: Rule, kind: Kind) => tangentOf(curveOf(rule, kind), kind)!;
  const tl = tan(life, 'density'); near(tl.x, 0.192, 1e-3, 'Life unstable equilibrium'); near(tl.slope, 1.74, 5e-3, 'Life slope there');
  const metric = R9(488, 464), tc = tan(metric, 'density'); near(tc.x, 0.5, 1e-3, 'consensus unstable equilibrium'); near(tc.slope, 1.148, 5e-3, 'consensus slope there');
  near(tan(life, 'defect').slope, sensitivity(life, 8).BS, 1e-3, 'Life defect tangent = BS8'); near(sensitivity(life, 8).BS, 3.17, 5e-3, 'Life BS8');
  near(tan(metric, 'defect').slope, 6.398, 1e-3, 'consensus defect tangent');
  // the ring slides' numbers (Metrics.astro), as the say slots quote them: Hamming weights 0.27 and 0.50, Boolean
  // sensitivities 3.17 and 6.40
  const two = (x: number) => Math.round(x * 100) / 100;
  assert.deepEqual([life, metric].map((r) => two(hammingWeight(r, 8))), [0.27, 0.5], 'Hamming weights');
  assert.deepEqual([life, metric].map((r) => two(sensitivity(r, 8).BS)), [3.17, 6.4], 'Boolean sensitivities');
  assert.equal(tangentOf(curveOf(R9(0, 0), 'density'), 'density'), null, 'a rule that switches everything off has no unstable equilibrium');
  // the detective slide counts the changes of answer on the rings: 6 of 16 for the consensus-seeking rule, 10 of 16 for
  // the good detective (inside the band J̄ 0.5–0.9 of the best detectives; Miranda et al.'s rule has 15)
  assert.deepEqual([jaggedness(metric).J, jaggedness(R9(170, 48)).J, jaggedness(R9(170, 340)).J], [6, 10, 15], 'changes of answer on the detective slide');
  console.log('genotype anchors of the brief hold');
}

// ── G and H: the precomputed toy data replays exactly from its seeds ──
import { toyNet, toyFeatures, startSeed, lempelZiv, shannon, TOY } from '../src/scripts/defence/toy.ts';
import { runFrom } from '../src/scripts/consensus.ts';
import { buildNet } from '../src/scripts/net.ts';
import { villageNet } from '../src/scripts/defence/village.ts';
import { aquifer, GW, GW_SCALE } from '../src/scripts/defence/groundwater.ts';
{
  // the worked example of Miranda et al. 2016 (supplement S2): 0101…01 of length 20 is seven blocks, 7 ln 20 / 20 =
  // 1.049; Shannon entropy in bits: 0 for a node that never changes, 1 for one on half of the time, 0.811 for a quarter
  assert.equal(lempelZiv(Array.from({ length: 20 }, (_, i) => i % 2)).toFixed(3), '1.049');
  assert.equal(shannon([1, 1, 1]), 0); assert.equal(shannon([0, 0]), 0);
  assert.equal(shannon([0, 1, 1, 0]), 1); assert.equal(shannon([0, 0, 0, 1]).toFixed(3), '0.811');
  const classify = JSON.parse(readFileSync(new URL('../src/data/defence/classify.json', import.meta.url), 'utf8'));
  for (const x of classify.examples) {
    const rule: Rule = { r: x.r, B: x.B, S: x.S, part: x.part };
    for (const [c, j] of [[0, 0], [1, 0], [2, 0], [1, 2], [2, 4]]) {
      const f = toyFeatures(toyNet(c, j), rule, startSeed(c, j));
      for (const k of ['entropy', 'lz', 'density'] as const) f[k].forEach((v, b) => assert.ok(Math.abs(v - x[k][c * TOY.perType + j][b]) < 1e-4, `classify.json ${k} ${x.B},${x.S} type ${c} net ${j}`));
    }
  }
  const [cons, det] = classify.examples;
  assert.ok(cons.B === 488 && cons.S === 464 && det.jbar >= 0.5 && det.jbar <= 0.9 && det.acc.all === 1 && (['entropy', 'lz', 'density'] as const).every((k) => det.acc[k] >= 13 / 15 - 1e-3));
  // the three networks slide G3 shows reach consensus under the consensus-seeking rule
  for (const c of [0, 1, 2]) assert.ok(classify.consensusRounds[c * TOY.perType] !== null, `G3 network ${c} reaches consensus`);
  const clamp = JSON.parse(readFileSync(new URL('../src/data/defence/clamp.json', import.meta.url), 'utf8'));
  const net = villageNet(clamp.params.village), rule: Rule = { r: 9, B: 464, S: 488 };
  assert.deepEqual(Array.from(net.deg), clamp.deg);
  const s0 = Uint8Array.from(clamp.demo.bits, (ch: string) => +ch), n = net.n, cl = new Int8Array(n);
  assert.equal(runFrom(net, rule, s0, 100).rho, 1, 'the H1 start ends all up');
  for (const [k, want] of [['hi', 0], ['lo', (n - 1) / n]] as const) {
    cl.fill(-1); cl[clamp.demo[k]] = 0; const x = s0.slice(); x[clamp.demo[k]] = 0;
    assert.ok(Math.abs(runFrom(net, rule, x, 100, cl).rho - want) < 1e-9, `H1 clamp ${k}`);
  }
  assert.ok(clamp.summary.spearmanEtaDegree > 0.5 && clamp.summary.spearmanEtaDegree < 0.9);
  // H2 draws the very network the scores were computed on: its links are the network's, and its degrees count them;
  // against the average degree of the neighbours the score goes, if anything, the other way (the outskirts know
  // well-connected people); and, as H2 says, the three villagers with the most contacts (21) are not among the ten
  // most important
  const key = ([i, j]: number[]) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  assert.deepEqual(clamp.edges.map(key).sort(), net.edges.map(key).sort(), 'H2 draws another network');
  assert.deepEqual(clamp.deg, neighbourDegree(clamp).map((_, i) => clamp.edges.filter((e: number[]) => e.includes(i)).length));
  assert.ok(knnSpearman(clamp) < -0.2, 'H2: the score goes with the average neighbour degree');
  const byEta = clamp.eta.map((_: number, i: number) => i).sort((a: number, b: number) => clamp.eta[b] - clamp.eta[a]);
  const busiest = clamp.deg.map((_: number, i: number) => i).sort((a: number, b: number) => clamp.deg[b] - clamp.deg[a] || a - b).slice(0, 3);
  assert.deepEqual(busiest.map((i: number) => clamp.deg[i]), [21, 21, 21], 'H2: three villagers with 21 contacts');
  assert.ok(busiest.every((i: number) => byEta.indexOf(i) >= 10), 'H2: a best-connected villager among the ten most important');
  // the closing summary's stubborn people replay: the best-connected one does not flip the village, the most important does
  assert.deepEqual(clamp.cycle.map((x: { node: number }) => x.node), [busiest[0], byEta[0], clamp.demo.lo, clamp.demo.hi], 'I1: who is stubborn');
  for (const x of clamp.cycle as { node: number; flips: boolean; bits: string }[]) {
    cl.fill(-1); cl[x.node] = 0; const a = Uint8Array.from(x.bits, (ch) => +ch); a[x.node] = 0;
    const o = runFrom(net, rule, a, 100, cl);
    assert.ok(x.flips ? o.rho === 0 : o.rho >= 1 - 1.5 / n, `I1: stubborn ${x.node}`);
  }
  assert.deepEqual(clamp.cycle.map((x: { flips: boolean }) => x.flips), [false, true, false, true], 'I1: two follow, two do not');
  console.log('toy data for G and H replays');
}

// ── I2: the groundwater model of the beyond slide is stable, breathes with the seasons and is deepest along the wells ──
{
  // stable at the surface: D = 4·T/Sy·ΔT/ΔX² below 1 with T = Ks·H at H = 7.5 m
  assert.ok((4 * GW.Ks * GW.base * GW.dt) / (GW.Sy * GW.dx * GW.dx) < 1, 'I2: the groundwater scheme is unstable');
  const a = aquifer(), far = 42 * a.W + 2, month: number[] = [], wellLow: number[] = [];
  let lo = Infinity, hi = -Infinity;
  for (let m = 0; m < 12; m++) {
    let sum = 0, k = 0, w = Infinity;
    for (let d = 0; d < 30; d++) { a.advance(1); sum += a.head[far]; k++; for (const i of a.wells) w = Math.min(w, a.head[i]); for (const h of a.head) { lo = Math.min(lo, h); hi = Math.max(hi, h); } }
    a.advance(365 / 12 - 30); month.push(sum / k); wellLow.push(w);
  }
  // far from the wells, as in the paper: about 6.5 m in spring, 6.0 m at the end of summer
  const top = month.indexOf(Math.max(...month)), bottom = month.indexOf(Math.min(...month));
  assert.ok(top >= 1 && top <= 4 && bottom >= 7 && bottom <= 9, `I2: the seasons are off (highest in month ${top}, lowest in ${bottom})`);
  assert.ok(Math.max(...month) > 6.4 && Math.min(...month) < 6.1, 'I2: the water table hardly breathes');
  // the wells draw the deepest trough, deeper in summer; nothing leaves the slide's colour scale by much or reaches the surface
  assert.ok(Math.min(...wellLow.slice(6, 10)) < Math.min(...wellLow.slice(0, 4)) - 0.5, 'I2: the trough along the wells is no deeper in summer');
  assert.ok(lo > GW_SCALE.lo - 0.2 && hi < GW.base - 0.3, `I2: the head leaves its range (${lo.toFixed(2)}–${hi.toFixed(2)} m)`);
  console.log('groundwater model holds');
}
