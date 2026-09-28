// Self-check for the defence deck's engines (src/scripts/defence/). Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reedSolomon, formatBits, qr } from '../src/scripts/defence/qr.ts';
import { stillMosaic } from '../src/scripts/defence/cover.ts';
import { stepLife } from '../src/scripts/life.ts';

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

// The stand-in cover art is a still life, with and without tiles across the torus edge.
const tiles = JSON.parse(readFileSync(new URL('../src/data/tiles.json', import.meta.url), 'utf8'));
for (const wrap of [false, true]) {
  const art = stillMosaic(tiles, 13, 8, 3, 20261002, 0.5, -0.25, wrap), out = new Uint8Array(art.W * art.H);
  assert.ok(art.g.some((v) => v === 1));
  assert.equal(stepLife(art.g, art.W, art.H, out), 0, `mosaic with wrap=${wrap} is not a still life`);
}
console.log('defence checks passed');
