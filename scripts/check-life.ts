// Self-check for src/scripts/life.ts. Run: npm test
import assert from 'node:assert/strict';
import { stepLife, stepLifeLike, glider, randomLife, population } from '../src/scripts/life.ts';
import { makeRng } from '../src/scripts/net.ts';

const W = 16, H = 16, at = (x: number, y: number) => y * W + x;
// A blinker flips between horizontal and vertical and is back after two ticks.
let g = new Uint8Array(W * H); g[at(3, 3)] = g[at(4, 3)] = g[at(5, 3)] = 1;
let h = new Uint8Array(W * H);
assert.equal(stepLife(g, W, H, h), 4); assert.equal(population(h), 3); assert.equal(h[at(4, 2)] | h[at(4, 4)], 1);
const g2 = new Uint8Array(W * H); stepLife(h, W, H, g2); assert.deepEqual(Array.from(g2), Array.from(g));
// A block is a still life: zero changes.
g = new Uint8Array(W * H); g[at(5, 5)] = g[at(6, 5)] = g[at(5, 6)] = g[at(6, 6)] = 1;
assert.equal(stepLife(g, W, H, h), 0); assert.deepEqual(Array.from(h), Array.from(g));
// A glider is itself again, one cell down and right, after four ticks, and crosses the wrap.
g = new Uint8Array(W * H); glider(g, W, H, 13, 13);
const want = new Uint8Array(W * H); glider(want, W, H, 14, 14);
for (let t = 0; t < 4; t++) { stepLife(g, W, H, h); [g, h] = [h, g]; }
assert.deepEqual(Array.from(g), Array.from(want));
// The generic stepper with Life's masks is Life; Seeds (B2/S) kills everything that was alive.
g = randomLife(32, 32, 0.4, makeRng(1)); const a = new Uint8Array(32 * 32), b = new Uint8Array(32 * 32);
stepLife(g, 32, 32, a); stepLifeLike(g, 32, 32, b, 8, 12); assert.deepEqual(Array.from(a), Array.from(b));
stepLifeLike(g, 32, 32, b, 4, 0); for (let i = 0; i < g.length; i++) if (g[i]) assert.equal(b[i], 0);

console.log('life ok');
