// Self-check for /demos/nuca-cnn/: the network of src/scripts/cnn.ts reproduces the published Figs 1, 2 and 4 cell for
// cell, and the hand-written training of src/scripts/training.ts behaves as the training study of
// mrollier/emulating-and-learning-CAs found. Run: npm test
import assert from 'node:assert/strict';
import { cnnStep, nucaStep, candidates, select, paramCount } from '../src/scripts/cnn.ts';
import { init, train, exact, stuck } from '../src/scripts/training.ts';
import { makeRng } from '../src/scripts/net.ts';
import data from '../src/data/nuca-cnn.json' with { type: 'json' };

const u8 = (a: number[]) => Uint8Array.from(a);

// Fig. 1: rules 30 and 90, one allocation for all time, 32 cells and 32 rows.
{
  const { rules, alloc, diagram } = data.fig1;
  let row = u8(diagram[0]);
  for (let t = 1; t < diagram.length; t++) { row = nucaStep(row, rules, alloc); assert.deepEqual(Array.from(row), diagram[t], `Fig. 1, row ${t}`); }
}
// Fig. 4: eight rules, the allocation of row t moves the cells of row t to row t + 1 (it shifts by one cell per row).
{
  const { rules, alloc, diagram } = data.fig4;
  assert.equal(rules.length, 8);
  for (let t = 1; t < diagram.length; t++) assert.deepEqual(Array.from(nucaStep(u8(diagram[t - 1]), rules, alloc[t - 1])), diagram[t], `Fig. 4, row ${t}`);
  assert.deepEqual(alloc[1], [...alloc[0].slice(1), alloc[0][0]], 'the allocation shifts left');
}
// Figs 2 and 3: the rule-54 example goes to its published image in one update.
assert.deepEqual(Array.from(cnnStep(u8(data.fig3.x), 54)), data.fig3.y);
// The selection layer picks, per cell, the candidate of its own rule.
{
  const row = u8(data.fig1.diagram[5]), c = candidates(row, [30, 90]);
  assert.deepEqual(Array.from(select(c, data.fig1.alloc)), Array.from(nucaStep(row, [30, 90], data.fig1.alloc)));
  assert.deepEqual(Array.from(c[0]), Array.from(cnnStep(row, 30)));
}
// Eqs. (1) and (2) for the example of Fig. 4.
assert.equal(paramCount(32, 8, 'local'), 352); assert.equal(paramCount(32, 8, 'dense'), 8288);

// Training. The reliable recipe is exact for every rule; the 2024 head without its pretraining filter is exact in about
// half the runs (the study: 46.7%), and never for rule 1, whose only 1 comes from 000, where the 0/1 inputs and zero
// biases leave no gradient.
{
  let reliable = 0, old = 0;
  for (let rule = 0; rule < 256; rule++) for (let seed = 1; seed <= 8; seed++) {
    if (train(init('reliable', makeRng(seed * 7919 + rule)), rule) >= 0) reliable++;
    if (train(init('2024', makeRng(seed * 7919 + rule)), rule) >= 0) old++;
  }
  assert.equal(reliable, 2048);
  assert.ok(old >= 960 && old <= 990, `2024 head: ${old} of 2048`); // about 47 to 48%, quoted on the page; 973 here, 974 in Chrome
  for (let seed = 1; seed <= 8; seed++) {
    const net = init('2024', makeRng(seed));
    assert.ok(train(net, 1) < 0 && !exact(net, 1), 'rule 1 under the 2024 head');
    assert.deepEqual(stuck(net, 1), [0], 'and 000 is stuck');
  }
}

console.log('nuca ok');
