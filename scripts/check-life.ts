// Self-check for src/scripts/life.ts. Run: npm test
import assert from 'node:assert/strict';
import { stepLife, stepLifeLike, glider, randomLife, population, ActiveLife } from '../src/scripts/life.ts';
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

// Stepping only the active blocks gives the same history as stepping everything, on a size that is not a multiple of 16,
// and a still life with a glider dropped on it only ever looks at a few blocks.
for (const [w, hh, rho] of [[50, 37, 0.35], [64, 64, 0.1]] as const) {
  let full = randomLife(w, hh, rho, makeRng(7)), tmp = new Uint8Array(w * hh);
  const part = full.slice(), life = new ActiveLife(w, hh);
  for (let t = 0; t < 60; t++) {
    const c1 = stepLife(full, w, hh, tmp); [full, tmp] = [tmp, full];
    const c2 = life.step(part); assert.equal(c2, c1, `changes at tick ${t}`); assert.deepEqual(Array.from(part), Array.from(full));
    if (t === 30) { glider(full, w, hh, 3, 3); glider(part, w, hh, 3, 3); life.touch(4, 4); }
  }
}
{
  const w = 160, still = new Uint8Array(w * w);
  for (let y = 2; y < w - 4; y += 5) for (let x = 2; x < w - 4; x += 5) still[y * w + x] = still[y * w + x + 1] = still[(y + 1) * w + x] = still[(y + 1) * w + x + 1] = 1; // blocks
  const life = new ActiveLife(w, w); assert.equal(life.step(still), 0); assert.equal(life.hits, 0);
  assert.equal(life.step(still), 0); // nothing active any more
  for (let i = 0; i < 12 * 12; i++) still[70 * w + 70] = 0;
  glider(still, w, w, 80, 80); life.touch(81, 81); assert.ok(life.step(still) > 0); assert.ok(life.hits <= 4, `hits ${life.hits}`);
}

console.log('life ok');
