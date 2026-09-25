// Self-check for src/scripts/mosaic.ts against the shipped tile bank. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBank, assemble, pickTile, testImage } from '../src/scripts/mosaic.ts';
import { stepLife } from '../src/scripts/life.ts';
import { makeRng } from '../src/scripts/net.ts';

const json = JSON.parse(readFileSync(new URL('../src/data/tiles.json', import.meta.url), 'utf8'));
for (const level of [3, 4, 5]) {
  const bank = loadBank(json, level);
  assert.ok(bank.tiles.length > 0, `level ${level} empty`); assert.equal(bank.size, 6 * level);
  // every tile on its own is a still life on a torus with room around it
  for (const tile of bank.tiles.slice(0, 20)) {
    const S = bank.size + 4, g = new Uint8Array(S * S), out = new Uint8Array(S * S);
    for (let y = 0; y < bank.size; y++) for (let x = 0; x < bank.size; x++) g[(y + 2) * S + x + 2] = tile[y * bank.size + x];
    assert.equal(stepLife(g, S, S, out), 0, `level ${level} tile is not still`);
  }
  // densities sorted, the picker monotone: darker asks for denser
  for (let i = 1; i < bank.order.length; i++) assert.ok(bank.density[bank.order[i]] >= bank.density[bank.order[i - 1]]);
  const rnd = makeRng(1), dark = pickTile(bank, 0.05, 1, rnd)!, light = pickTile(bank, 0.9, 1, rnd)!;
  assert.ok(bank.density[dark] >= bank.density[light]); assert.equal(pickTile(bank, 0.99, 0.9, rnd), null);
  // the assembled mosaic is one big still life
  const g = level === 5 ? 8 : level === 4 ? 10 : 12, m = assemble(testImage(120, 120), g, bank, 1, false, makeRng(2));
  assert.equal(m.W, g * bank.size); assert.ok(m.placed > 0);
  const out = new Uint8Array(m.W * m.H), changed = stepLife(m.grid, m.W, m.H, out);
  assert.equal(changed, 0, `level ${level}: ${changed} cells change in the assembled mosaic`);
  console.log(`mosaic level ${level}: ${bank.tiles.length} tiles, ${m.placed} placed on ${m.W}², still`);
}
console.log('mosaic ok');
