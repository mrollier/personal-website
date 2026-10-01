// Self-check for /demos/cnn-classification/: the Li–Packard labels and their symmetries, the hand-set network that reads
// the rule off a diagram, the browser's forward pass of the retrained networks against PyTorch's outputs, and the exact
// chance that one row shows every neighbourhood. Run: npm test
import assert from 'node:assert/strict';
import { CLASSES, PAPER_CONFUSION, image, augment, detector, channel, readRule, HANDSET_PARAMS, classify, paramCount, allNeighbourhoods, type Weights } from '../src/scripts/lpcnn.ts';
import { evolve, seedRow } from '../src/scripts/eca.ts';
import { equivalents, mirrorRule, complementRule } from '../src/scripts/wolfram.ts';
import { makeRng } from '../src/scripts/net.ts';
import data from '../src/data/lp-cnn.json' with { type: 'json' };

// The labels: 24 / 97 / 89 / 10 / 36 rules, one class per rule, the same for a rule, its mirror and its complement;
// 64 rules are their own mirror, 16 their own complement, and the 256 fall into the 88 classes the 88-way network names.
{
  const lp = data.lp, sizes = [0, 0, 0, 0, 0];
  lp.forEach((c) => sizes[c]++);
  assert.deepEqual(sizes, [24, 97, 89, 10, 36]);
  for (let r = 0; r < 256; r++) { const e = equivalents(r); assert.ok(lp[e.mirror] === lp[r] && lp[e.complement] === lp[r] && lp[e.both] === lp[r], `rule ${r}`); }
  assert.equal([...Array(256).keys()].filter((r) => mirrorRule(r) === r).length, 64);
  assert.equal([...Array(256).keys()].filter((r) => complementRule(r) === r).length, 16);
  assert.deepEqual(data.reps, [...new Set([...Array(256).keys()].map((r) => equivalents(r).rep))].sort((a, b) => a - b));
  assert.equal(data.reps.length, 88);
  assert.equal(data.classes.join(), CLASSES.join());
}

// A detector is 1 on its own T-tetromino, its neighbourhood followed by a 1, and at most 0 on the other fifteen.
for (let n = 0; n < 8; n++) for (let m = 0; m < 8; m++) for (const s of [0, 1]) {
  const d = detector(n), top = [(m >> 2) & 1, (m >> 1) & 1, m & 1];
  const v = d.top[0] * top[0] + d.top[1] * top[1] + d.top[2] * top[2] + d.below * s + d.bias;
  if (m === n && s === 1) assert.equal(v, 1); else assert.ok(v <= 0, `detector ${n} on ${m}→${s}`);
}
assert.equal(HANDSET_PARAMS, 2360);

// The reader names the rule whenever the diagram shows all eight neighbourhoods, and otherwise the rule with the unseen
// entries read as 0; node i scores 1 minus its Hamming distance to the rule. Fig. 8.8: rule 120.
{
  let complete = 0;
  for (let r = 0; r < 256; r++) for (let s = 1; s <= 4; s++) {
    const rows = evolve(seedRow(64, 'random', makeRng(r * 7 + s)), r, 63), x = image(rows), { rule, scores, maxima } = readRule(x, 64);
    const seen = maxima.map((_, n) => rows.slice(0, -1).some((row) => row.some((_, j) => ((row[(j + 63) % 64] << 2) | (row[j] << 1) | row[(j + 1) % 64]) === n)));
    let expect = r; seen.forEach((v, n) => { if (!v) expect &= ~(1 << n); });
    assert.equal(rule, expect, `rule ${r}, start ${s}`);
    if (seen.every(Boolean)) complete++;
    for (const i of [0, 37, 255]) { let h = 0; for (let j = 0; j < 8; j++) h += ((i ^ expect) >> j) & 1; assert.ok(Math.abs(scores[i] - (1 - h)) < 1e-9); }
  }
  assert.ok(complete > 1010, `${complete} of 1024 complete`);
  const x = image(evolve(seedRow(64, 'random', makeRng(5)), 120, 63));
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => Math.max(...channel(x, 64, n))), [0, 0, 0, 1, 1, 1, 1, 0]);
}
// Inverting reads the complement, mirroring the mirror image: same class, different rule.
{
  const x = image(evolve(seedRow(64, 'random', makeRng(3)), 110, 63));
  assert.equal(readRule(augment(x, 64, 'invert'), 64).rule, 137);
  assert.equal(readRule(augment(x, 64, 'mirror'), 64).rule, 124);
}

// The retrained networks: 389 and 664 parameters, and the browser's forward pass gives PyTorch's probabilities.
{
  const nets = data.nets as unknown as Record<'class' | 'indep', { weights: Weights; probe: number[]; probeCoarse: number[]; params: number; test: number; confusion?: number[][] }>;
  assert.equal(paramCount(nets.class.weights), 389); assert.equal(paramCount(nets.indep.weights), 664);
  for (const key of ['class', 'indep'] as const) {
    const k = key === 'class' ? 5 : 88;
    data.probe.rules.forEach((r, q) => {
      const x = image(evolve(Uint8Array.from(data.probe.starts[q], Number), r, 63));
      const plain = classify(nets[key].weights, x, 64).probs, coarse = classify(nets[key].weights, augment(x, 64, 'coarse'), 64).probs;
      for (let c = 0; c < k; c++) {
        assert.ok(Math.abs(plain[c] - nets[key].probe[q * k + c]) < 2e-4, `${key}, rule ${r}, output ${c}: ${plain[c]} vs ${nets[key].probe[q * k + c]}`);
        assert.ok(Math.abs(coarse[c] - nets[key].probeCoarse[q * k + c]) < 2e-4, `${key} coarse, rule ${r}, output ${c}`);
      }
    });
  }
  const conf = nets.class.confusion!, total = conf.flat().reduce((a, b) => a + b, 0);
  assert.equal(total, 32768);
  assert.ok(Math.abs(conf.reduce((s, row, i) => s + row[i], 0) / total - nets.class.test) < 1e-4);
}

// The chapter's confusion matrix: 128 test diagrams per rule, 98.17% right, 92.8% of the locally chaotic ones.
{
  assert.deepEqual(PAPER_CONFUSION.map((r) => r.reduce((a, b) => a + b, 0)), [24, 97, 89, 10, 36].map((n) => 128 * n));
  assert.equal((PAPER_CONFUSION.reduce((s, r, i) => s + r[i], 0) / 32768 * 100).toFixed(2), '98.17');
  assert.equal((PAPER_CONFUSION[3][3] / 1280 * 100).toFixed(1), '92.8');
}

// One row of 64 random cells shows all eight neighbourhoods with probability 0.99015 round the ring (the chapter's
// "over 99%"), 0.98874 along a line of 62 windows. Checked against counting all 2^16 rows of 16 cells.
{
  assert.ok(Math.abs(allNeighbourhoods(64) - 0.9901505356743534) < 1e-12);
  assert.ok(Math.abs(allNeighbourhoods(64, false) - 0.9887355407928607) < 1e-12);
  let ring = 0, line = 0;
  for (let v = 0; v < 1 << 16; v++) {
    let a = 0, b = 0;
    for (let j = 0; j < 16; j++) { const n = (((v >> j) & 1) << 2) | (((v >> ((j + 1) % 16)) & 1) << 1) | ((v >> ((j + 2) % 16)) & 1); a |= 1 << n; if (j < 14) b |= 1 << n; }
    if (a === 255) ring++; if (b === 255) line++;
  }
  assert.ok(Math.abs(allNeighbourhoods(16) - ring / 65536) < 1e-12 && Math.abs(allNeighbourhoods(16, false) - line / 65536) < 1e-12);
}
console.log('lpcnn ok');
