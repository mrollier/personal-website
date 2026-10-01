// The groundwater cellular automaton for slide I2 (beyond this thesis), after MACCA-GW (Ravazzani et al. 2011) as
// applied to De Wilde Landen in the Netherlands (Rollier, Landuyt and Baetens, ACRI 2026), on a stylised nature reserve:
// not the calibrated model, and not the real map. Every cell holds the hydraulic head H, the height of the water table
// above the clay at the base of the aquifer (the surface is 7.5 m above it). Each step, water flows to every cell from
// its four neighbours in proportion to the difference in head, through the harmonic mean of their transmissivities
// T = Ks·H; rain falls on every cell, the land cover draws some of it back by evapotranspiration (grass least, forest
// more, open water most), and a line of 30 filters pumps water out, twice as fast in summer as in winter. The east side
// is a stream at a fixed level; no water crosses the other three sides. All cells change at once:
// H ← H + (ΣQ + W)/(Sy·ΔX·ΔY)·ΔT. The grid is twice as coarse as the paper's (20 m cells) and the step four times as
// long (9 steps a day), which keeps the scheme stable (D = 4·T/Sy·ΔT/ΔX² ≈ 0.55 at the surface; it must stay below 1).
// Tuned so that the map tells its story at a glance: the whole water table is highest in March and April and lowest in
// September (far from the filters, between about 6.5 and 5.95 m, as in the paper), the filters draw a trough that is
// deepest in September (4.35 m), the stream is the high side, and the forest in the north-west corner keeps the water
// table there about 0.45 m below the grassy south-west in spring and 0.7 m in September. The weather is the same every
// year, so a year that starts from the spun-up 1 January ends where it began (to within a few mm). Pure, no DOM.
import { makeRng } from '../net.ts';

export const GRASS = 0, FOREST = 1, WATER = 2;

const YEAR = 365, DAY = 86400, OMEGA = (2 * Math.PI) / YEAR;

export const GW = {
  W: 38, H: 45,
  /** cell size, m */
  dx: 20,
  /** time step, s: 9 steps a day */
  dt: 9600,
  /** hydraulic conductivity, m/s, and specific yield, as in the paper */
  Ks: 1.442e-4, Sy: 0.19,
  /** the surface above the base, m */
  base: 7.5,
  /** the stream along the east side, m above the base */
  stream: 6.75,
  /** the filters never draw the head below this, m */
  minHead: 0.1,
  /** rain, mm a year, a little more in late summer than in spring (by `rainSwing`, most on day `rainPeak`) */
  rain: 870, rainSwing: 0.2, rainPeak: 230,
  /** the share of the rain that falls in showers on some days rather than as a steady drizzle */
  showers: 0.3,
  /** evapotranspiration, mm a year, for grass, forest and open water (600 on average over the reserve), most on day
   * `etPeak` (by `etSwing`) */
  et: [520, 860, 940] as [number, number, number], etSwing: 0.7, etPeak: 182,
  /** extraction, m³ a year (two thirds of the paper's), by `filters` filters on a line, twice as fast in midsummer as
   * in midwinter */
  pumped: 0.2e6, pumpRatio: 2, pumpPeak: 196, filters: 30,
  /** the filters' line, from (x, y) to (x, y), one filter per row */
  line: [13, 8, 18, 37] as [number, number, number, number],
  /** the noise level above which a cell is forest */
  forest: 0.55,
  /** the days run up to the spun-up 1 January, from the year's mean and seasonal swing */
  lead: 10,
  seed: 2026,
};

/** The head at cell i as a share of the colour scale used on the slide: 0 at `lo` m, 1 at `hi` m (clamped). */
export const GW_SCALE = { lo: 4.3, hi: 6.9 };

/** A head as a share of the slide's colour scale, from 0 (at GW_SCALE.lo) to 1 (at GW_SCALE.hi). */
export function shareOf(h: number): number {
  const s = (h - GW_SCALE.lo) / (GW_SCALE.hi - GW_SCALE.lo);
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_END = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/** The month of a day of the year (0 = 1 January), as 'Jan' … 'Dec'. */
export function monthOf(day: number): string {
  const d = ((day % YEAR) + YEAR) % YEAR;
  let m = 0;
  while (d >= MONTH_END[m]) m++;
  return MONTHS[m];
}

export type Aquifer = {
  W: number; H: number;
  /** m above the base, row by row (y * W + x), y = 0 at the top (north); the last column is the stream */
  head: Float64Array;
  /** GRASS | FOREST | WATER per cell */
  cover: Uint8Array;
  /** cell indices of the filters */
  wells: number[];
  /** days since 1 January, 0 ≤ day < 365 (wraps) */
  readonly day: number;
  /** back to the spun-up 1 January */
  reset(): void;
  /** whole model steps covering `days` (the remainder carries over to the next call) */
  advance(days: number): void;
  /** total extraction at that day, m³/s */
  pumping(day: number): number;
};

const wave = (day: number, peak: number) => Math.cos(OMEGA * (day - peak));

/** The reserve's land cover: a forest in the north-west corner, a belt along the south side and a copse in the north,
 * grass elsewhere, three ponds, and the stream along the east side. */
function landCover(seed: number): Uint8Array {
  const { W, H } = GW, rnd = makeRng(seed), cover = new Uint8Array(W * H);
  // smooth noise from two lattices, 7 and 3 cells apart
  const lattice = (step: number) => {
    const lw = Math.ceil(W / step) + 2, lh = Math.ceil(H / step) + 2, v = Float64Array.from({ length: lw * lh }, () => rnd());
    return (x: number, y: number) => {
      const fx = x / step, fy = y / step, ix = Math.floor(fx), iy = Math.floor(fy);
      const sx = (1 - Math.cos(Math.PI * (fx - ix))) / 2, sy = (1 - Math.cos(Math.PI * (fy - iy))) / 2;
      const a = v[iy * lw + ix], b = v[iy * lw + ix + 1], c = v[(iy + 1) * lw + ix], d = v[(iy + 1) * lw + ix + 1];
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
  };
  const big = lattice(7), small = lattice(3);
  const bump = (x: number, y: number, cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = 0.3 * big(x, y) + 0.2 * small(x, y) + 0.9 * bump(x, y, 2, 4, 8) + 0.55 * bump(x, y, 17, 46, 7)
      + 0.4 * bump(x, y, 22, 2, 4) - 0.5 * bump(x, y, 6, 32, 7) - 0.4 * bump(x, y, 30, 24, 7);
    cover[y * W + x] = f > GW.forest ? FOREST : GRASS;
  }
  // three ponds with ragged edges
  for (const [cx, cy, r] of [[27, 13, 2.6], [7, 31, 2.2], [26, 34, 1.8]]) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= W - 1 || y >= H) continue;
      if (Math.hypot(x - cx, (y - cy) * 0.8) <= r * (0.85 + 0.3 * small(x + 0.5, y + 0.5))) cover[y * W + x] = WATER;
    }
  }
  for (let y = 0; y < H; y++) cover[y * W + W - 1] = WATER;
  return cover;
}

/** The filters, one per row along the line, on grass. */
function wellLine(cover: Uint8Array): number[] {
  const { W } = GW, [x0, y0, x1, y1] = GW.line, wells: number[] = [];
  for (let y = y0; y <= y1 && wells.length < GW.filters; y++) {
    const x = Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
    wells.push(y * W + x);
    cover[y * W + x] = GRASS;
  }
  return wells;
}

/** Rain per day of the year, m/s: the seasonal mean, part of it gathered into showers on some days, GW.rain mm in all.
 * The showers are scaled by their own monthly mean, so they shift no rain from one month to another. */
function rainfall(seed: number): Float64Array {
  const rnd = makeRng(seed ^ 0x2545f491), rain = new Float64Array(YEAR), g = new Float64Array(YEAR);
  for (let d = 0; d < YEAR; d++) {
    // wet spells: a wet day is more likely after a wet day
    const p = d > 0 && g[d - 1] > 0 ? 0.6 : 0.35;
    g[d] = rnd() < p ? -Math.log(1 - rnd()) : 0;
  }
  let total = 0;
  for (let d = 0; d < YEAR; d++) {
    let m = 0;
    for (let k = -15; k <= 15; k++) m += g[(d + k + YEAR) % YEAR] / 31;
    rain[d] = (1 + GW.rainSwing * wave(d + 0.5, GW.rainPeak)) * (1 - GW.showers + (m > 0 ? (GW.showers * g[d]) / m : GW.showers));
    total += rain[d];
  }
  const perUnit = GW.rain / 1000 / total; // m, so that the year adds up to GW.rain mm
  for (let d = 0; d < YEAR; d++) rain[d] *= perUnit / DAY;
  return rain;
}

/** Solves (L + i·diag(shift))·z = r for the complex z, where L is the grid Laplacian on `rows` rows of m cells (row by
 * row) with no flow across the north, west and south sides and a fixed neighbour beyond the east side. L is the sum of
 * an east–west and a north–south part, so with the mean shift everywhere the system falls apart into one small
 * tridiagonal system per north–south cosine mode; a few rounds of correction take up the shift's spread. */
function solve(m: number, rows: number, shift: Float64Array, rr: Float64Array, ri: Float64Array): [Float64Array, Float64Array] {
  const n = m * rows;
  let mean = 0;
  for (let u = 0; u < n; u++) mean += shift[u] / n;
  // the north–south modes cos(πk(y + ½)/rows), with eigenvalues 2 − 2·cos(πk/rows)
  const modes = new Float64Array(rows * rows), mu = new Float64Array(rows);
  for (let k = 0; k < rows; k++) {
    mu[k] = 2 - 2 * Math.cos((Math.PI * k) / rows);
    for (let y = 0; y < rows; y++) modes[k * rows + y] = Math.cos((Math.PI * k * (y + 0.5)) / rows);
  }
  const tr = new Float64Array(n), ti = new Float64Array(n), cr = new Float64Array(m), ci = new Float64Array(m);
  /** adds (L + i·mean)⁻¹·(dr + i·di) to (zr + i·zi) */
  const approx = (dr: Float64Array, di: Float64Array, zr: Float64Array, zi: Float64Array) => {
    for (let k = 0; k < rows; k++) {
      const norm = k ? 2 / rows : 1 / rows, at = k * m;
      for (let x = 0; x < m; x++) {
        let a = 0, b = 0;
        for (let y = 0; y < rows; y++) { const v = modes[k * rows + y]; a += dr[y * m + x] * v; b += di[y * m + x] * v; }
        tr[at + x] = a * norm; ti[at + x] = b * norm;
      }
      // −z[x−1] + (west + east + mu + i·mean)·z[x] − z[x+1] = t[x], by elimination down and back up the row
      for (let x = 0; x < m; x++) {
        let br = (x > 0 ? 1 : 0) + 1 + mu[k], bi = mean;
        if (x > 0) { br += cr[x - 1]; bi += ci[x - 1]; tr[at + x] += tr[at + x - 1]; ti[at + x] += ti[at + x - 1]; }
        const den = br * br + bi * bi, pr = tr[at + x], pi = ti[at + x];
        cr[x] = -br / den; ci[x] = bi / den; // −1/b
        tr[at + x] = (pr * br + pi * bi) / den; ti[at + x] = (pi * br - pr * bi) / den;
      }
      for (let x = m - 2; x >= 0; x--) {
        tr[at + x] -= cr[x] * tr[at + x + 1] - ci[x] * ti[at + x + 1];
        ti[at + x] -= cr[x] * ti[at + x + 1] + ci[x] * tr[at + x + 1];
      }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < m; x++) {
      let a = 0, b = 0;
      for (let k = 0; k < rows; k++) { const v = modes[k * rows + y]; a += tr[k * m + x] * v; b += ti[k * m + x] * v; }
      zr[y * m + x] += a; zi[y * m + x] += b;
    }
  };
  const zr = new Float64Array(n), zi = new Float64Array(n), er = Float64Array.from(rr), ei = Float64Array.from(ri);
  for (let round = 0; round < 12; round++) {
    approx(er, ei, zr, zi);
    // what is left: r − (L + i·shift)·z
    let most = 0, size = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < m; x++) {
      const u = y * m + x, d = (x > 0 ? 1 : 0) + 1 + (y > 0 ? 1 : 0) + (y < rows - 1 ? 1 : 0);
      let ar = d * zr[u] - shift[u] * zi[u], ai = d * zi[u] + shift[u] * zr[u];
      if (x > 0) { ar -= zr[u - 1]; ai -= zi[u - 1]; }
      if (x < m - 1) { ar -= zr[u + 1]; ai -= zi[u + 1]; }
      if (y > 0) { ar -= zr[u - m]; ai -= zi[u - m]; }
      if (y < rows - 1) { ar -= zr[u + m]; ai -= zi[u + m]; }
      er[u] = rr[u] - ar; ei[u] = ri[u] - ai;
      most = Math.max(most, Math.abs(er[u]) + Math.abs(ei[u])); size = Math.max(size, Math.abs(rr[u]) + Math.abs(ri[u]));
    }
    if (most <= 1e-7 * size) break;
  }
  return [zr, zi];
}

/** the spun-up 1 January of each seed, worked out once a page */
const cache = new Map<number, Float64Array>();

export function aquifer(seed = GW.seed): Aquifer {
  const { W, H, dx, dt, Ks, Sy } = GW, n = W * H, A = dx * dx, perDay = DAY / dt, stepsInYear = YEAR * perDay;
  const cover = landCover(seed), wells = wellLine(cover), rain = rainfall(seed);
  const head = new Float64Array(n), next = new Float64Array(n), flow = new Float64Array(n);
  const isWell = new Uint8Array(n);
  for (const i of wells) isWell[i] = 1;
  const et = Float64Array.from(cover, (c) => (GW.et[c] / 1000 / (YEAR * DAY)) * A); // m³/s on average, per cell
  const k = dt / (Sy * A), aPump = (GW.pumpRatio - 1) / (GW.pumpRatio + 1), perWell = 1 / wells.length;
  let step = 0, carry = 0;

  const pumping = (day: number) => (GW.pumped / (YEAR * DAY)) * (1 + aPump * wave(day, GW.pumpPeak));

  /** ΣQ/Ks for every cell: the flow in from its neighbours, through the harmonic mean of the heads (T = Ks·H) */
  const flows = (h: Float64Array) => {
    flow.fill(0);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W - 1; x++) {
        const i = row + x, hi = h[i];
        let hj = h[i + 1], f = ((2 * hi * hj) / (hi + hj)) * (hj - hi);
        flow[i] += f; flow[i + 1] -= f;
        if (y < H - 1) { hj = h[i + W]; f = ((2 * hi * hj) / (hi + hj)) * (hj - hi); flow[i] += f; flow[i + W] -= f; }
      }
    }
  };

  /** one step of the automaton, the step `s` of the year, from h into out */
  const once = (s: number, h: Float64Array, out: Float64Array) => {
    const day = s / perDay, r = rain[Math.floor(day)] * A, e = 1 + GW.etSwing * wave(day, GW.etPeak), q = pumping(day) * perWell;
    flows(h);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W - 1; x++) {
        const i = row + x;
        let v = h[i] + k * (Ks * flow[i] + r - e * et[i]);
        if (isWell[i]) { v -= k * q; if (v < GW.minHead) v = GW.minHead; }
        out[i] = v;
      }
      out[row + W - 1] = GW.stream;
    }
  };

  /** The spun-up 1 January, without running years. With T = Ks·H, the flow between two cells is Ks times the
   * difference in Φ = H²/2 (the harmonic mean of their heads is within a fraction of a per cent of the plain mean here),
   * so the heads under the year's mean weather and pumping, which are the year's mean of the yearly cycle, follow from
   * one linear system; the seasonal swing that the first harmonic of the rain, the evapotranspiration and the pumping
   * drives follows from a second, complex one; then `lead` days of the automaton itself up to 1 January. */
  const spinUp = (h: Float64Array) => {
    const m = W - 1, cells = m * H; // the land cells, u = y·m + x
    let rMean = 0, rCos = 0, rSin = 0; // the rain on a cell: its mean and first harmonic, a·cos(ωt) + b·sin(ωt)
    for (let d = 0; d < YEAR; d++) {
      const r = (rain[d] * A) / YEAR;
      rMean += r; rCos += 2 * r * Math.cos(OMEGA * (d + 0.5)); rSin += 2 * r * Math.sin(OMEGA * (d + 0.5));
    }
    const qMean = (GW.pumped / (YEAR * DAY)) * perWell, zero = new Float64Array(cells), mean = new Float64Array(cells);
    for (let y = 0; y < H; y++) for (let x = 0; x < m; x++) {
      const i = y * W + x;
      mean[y * m + x] = (rMean - et[i] - (isWell[i] ? qMean : 0)) / Ks + (x === m - 1 ? GW.stream ** 2 / 2 : 0);
    }
    const [phi] = solve(m, H, zero, mean, zero), hMean = phi.map((p) => Math.sqrt(2 * p));
    // the swing Re(Ĥ·e^{iωt}): the source's first harmonic is Re(F̂·e^{iωt}) with F̂ = a − i·b, and Φ̂ = H·Ĥ solves
    // (L + i·ω·Sy·ΔX·ΔY/(Ks·H))·Φ̂ = F̂/Ks
    const ce = Math.cos(OMEGA * GW.etPeak) * GW.etSwing, se = Math.sin(OMEGA * GW.etPeak) * GW.etSwing;
    const cp = Math.cos(OMEGA * GW.pumpPeak) * aPump * qMean, sp = Math.sin(OMEGA * GW.pumpPeak) * aPump * qMean;
    const shift = new Float64Array(cells), fr = new Float64Array(cells), fi = new Float64Array(cells);
    for (let y = 0; y < H; y++) for (let x = 0; x < m; x++) {
      const i = y * W + x, u = y * m + x;
      shift[u] = ((OMEGA / DAY) * Sy * A) / (Ks * hMean[u]);
      fr[u] = (rCos - et[i] * ce - (isWell[i] ? cp : 0)) / Ks;
      fi[u] = -(rSin - et[i] * se - (isWell[i] ? sp : 0)) / Ks;
    }
    const [sr, si] = solve(m, H, shift, fr, fi);
    // the lead's first day, then the automaton up to 1 January
    const t0 = YEAR - GW.lead, c0 = Math.cos(OMEGA * t0), s0 = Math.sin(OMEGA * t0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < m; x++) { const u = y * m + x; h[y * W + x] = hMean[u] + (sr[u] * c0 - si[u] * s0) / hMean[u]; }
      h[y * W + m] = GW.stream;
    }
    let a: Float64Array = h, b: Float64Array = next;
    for (let s = t0 * perDay; s < stepsInYear; s++) { once(s, a, b); const t = a; a = b; b = t; }
    if (a !== h) h.set(a);
  };

  const spunUp = () => {
    let s = cache.get(seed);
    if (!s) { s = new Float64Array(n); spinUp(s); cache.set(seed, s); }
    return s;
  };

  const me: Aquifer = {
    W, H, head, cover, wells,
    get day() { return step / perDay; },
    reset() { head.set(spunUp()); step = 0; carry = 0; },
    advance(days) {
      carry += days * perDay;
      const count = Math.floor(carry + 1e-9);
      carry -= count;
      for (let c = 0; c < count; c++) { once(step, head, next); head.set(next); step = (step + 1) % stepsInYear; }
    },
    pumping,
  };
  me.reset();
  return me;
}
