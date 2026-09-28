// A flock from three local rules (Reynolds 1987): steer away from birds that are too close, match the heading of
// the birds around you, move towards their centre. On a torus of W × H design pixels. A point to avoid (the pointer)
// scatters the birds near it. Pure, no DOM.

export type Flock = { n: number; W: number; H: number; x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array };

export function flock(n: number, W: number, H: number, rnd: () => number): Flock {
  const f: Flock = { n, W, H, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const a = rnd() * 2 * Math.PI;
    f.x[i] = rnd() * W; f.y[i] = rnd() * H; f.vx[i] = Math.cos(a) * 2; f.vy[i] = Math.sin(a) * 2;
  }
  return f;
}

const NEAR = 70, CLOSE = 24, MIN = 1.6, MAX = 3.4, AVOID = 150, FLEE = 6;

/** One step of all three rules, and of fleeing from `avoid` if given; speeds in design pixels per step. */
export function stepFlock(f: Flock, avoid: { x: number; y: number } | null = null): void {
  const { n, W, H, x, y, vx, vy } = f, ax = new Float32Array(n), ay = new Float32Array(n), max = new Float32Array(n).fill(MAX);
  for (let i = 0; i < n; i++) {
    let cx = 0, cy = 0, hx = 0, hy = 0, sx = 0, sy = 0, k = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let dx = x[j] - x[i], dy = y[j] - y[i];
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      const d2 = dx * dx + dy * dy;
      if (d2 > NEAR * NEAR) continue;
      k++; cx += dx; cy += dy; hx += vx[j]; hy += vy[j];
      if (d2 < CLOSE * CLOSE && d2 > 0) { sx -= dx / d2; sy -= dy / d2; }
    }
    if (k) { ax[i] = 0.004 * cx / k + 0.05 * (hx / k - vx[i]) + 6 * sx; ay[i] = 0.004 * cy / k + 0.05 * (hy / k - vy[i]) + 6 * sy; }
    if (avoid) {
      let dx = x[i] - avoid.x, dy = y[i] - avoid.y;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      const d = Math.hypot(dx, dy);
      if (d < AVOID && d > 0) { const push = 1.4 * (1 - d / AVOID); ax[i] += (dx / d) * push; ay[i] += (dy / d) * push; max[i] = FLEE; }
    }
  }
  for (let i = 0; i < n; i++) {
    vx[i] += ax[i]; vy[i] += ay[i];
    const v = Math.hypot(vx[i], vy[i]) || 1, c = Math.min(max[i], Math.max(MIN, v)) / v;
    vx[i] *= c; vy[i] *= c;
    x[i] = (x[i] + vx[i] + W) % W; y[i] = (y[i] + vy[i] + H) % H;
  }
}
