// Gravitational-wave echoes as a train of sine-Gaussians (the generalised wavelet of the MSc thesis
// and Tsang et al. 2018), plus the small amount of signal processing the demo needs: seeded noise,
// matched-filter SNR, a radix-2 FFT for the spectrum, the echo delay for a near-horizon surface, and
// an interpolation of the thesis's measured log Bayes factors. Pure functions, no DOM.

export type Train = {
  f0: number;    // central frequency, Hz
  q: number;     // quality factor of the first echo; its Gaussian width is tau = q / (2 pi f0)
  dt: number;    // time between echoes, s
  gamma: number; // amplitude ratio between successive echoes (damping), 0..1
  w: number;     // width ratio between successive echoes (widening), >= 1
  dphi: number;  // phase step between successive echoes, rad
  n: number;     // number of echoes
  t0: number;    // centre of the first echo, s
  phi0: number;  // phase of the first echo, rad
};

/** The paper's injection: f0 166.7 Hz, tau 9.5 ms (Q 10), dt 0.04 s, gamma 0.7, w 1.2. */
export const DEFAULT: Train = { f0: 166.7, q: 10, dt: 0.04, gamma: 0.7, w: 1.2, dphi: 0, n: 8, t0: 0.04, phi0: 0 };

/** Sample rate used for drawing and for the noise, as in the thesis's frame files. */
export const RATE = 4096;

/** Gaussian width of echo k. */
export const tau = (p: Train, k: number) => (p.w ** k * p.q) / (2 * Math.PI * p.f0);

/** Envelope of echo k at time t (without the cosine). */
export function envelope(p: Train, k: number, t: number): number {
  const u = (t - p.t0 - k * p.dt) / tau(p, k);
  return p.gamma ** k * Math.exp(-u * u);
}

/** The train, eq. (2) of the paper: sum over k of gamma^k exp(-((t-t0-k dt)/tau_k)^2) cos(2 pi f0 (t-t0-k dt) + phi0 + k dphi). */
export function trainAt(t: number, p: Train): number {
  let s = 0;
  for (let k = 0; k < p.n; k++) {
    const tk = t - p.t0 - k * p.dt, tk_ = tau(p, k);
    if (Math.abs(tk) > 4 * tk_) continue;
    s += p.gamma ** k * Math.exp(-(tk * tk) / (tk_ * tk_)) * Math.cos(2 * Math.PI * p.f0 * tk + p.phi0 + k * p.dphi);
  }
  return s;
}

/** How long the train lasts: the last echo's centre plus a few widths. */
export const duration = (p: Train, tails = 3) => p.t0 + (p.n - 1) * p.dt + tails * tau(p, p.n - 1);

/**
 * The train sampled at `rate` Hz over `dur` seconds. Loops over echoes, not samples, so short wavelets
 * cost little. `amps` overrides the geometric amplitudes gamma^k (the well cartoon uses it for a first
 * echo that is not gamma times the ringdown).
 */
export function sampleTrain(p: Train, rate: number, dur: number, amps?: ArrayLike<number>): Float32Array {
  const N = Math.max(1, Math.ceil(dur * rate)), h = new Float32Array(N);
  for (let k = 0; k < p.n; k++) {
    const c = p.t0 + k * p.dt, tk_ = tau(p, k), a = amps ? amps[k] : p.gamma ** k;
    const i0 = Math.max(0, Math.floor((c - 4 * tk_) * rate)), i1 = Math.min(N - 1, Math.ceil((c + 4 * tk_) * rate));
    for (let i = i0; i <= i1; i++) {
      const tk = i / rate - c;
      h[i] += a * Math.exp(-(tk * tk) / (tk_ * tk_)) * Math.cos(2 * Math.PI * p.f0 * tk + p.phi0 + k * p.dphi);
    }
  }
  return h;
}

/** xorshift32 in [0, 1), seeded so a noise realisation can be reproduced from the URL. */
export function makeRng(seed: number): () => number {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Standard normal draws by Box-Muller, keeping the spare. */
export function gaussian(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0; while (u === 0) u = rng();
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * rng();
    spare = r * Math.sin(a);
    return r * Math.cos(a);
  };
}

/** White Gaussian noise of unit variance. */
export function whiteNoise(len: number, rng: () => number): Float32Array {
  const g = gaussian(rng), n = new Float32Array(len);
  for (let i = 0; i < len; i++) n[i] = g();
  return n;
}

export const sumSq = (h: ArrayLike<number>) => { let s = 0; for (let i = 0; i < h.length; i++) s += h[i] * h[i]; return s; };
export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Noise standard deviation that gives the optimal matched-filter SNR `snr`: SNR^2 = sum(h^2) / sigma^2 for white noise. */
export const sigmaForSnr = (h: ArrayLike<number>, snr: number) => Math.sqrt(sumSq(h)) / snr;

/** Best-fit amplitude of template h in data d, and the SNR it recovers. With d = h + noise, amp ~ 1 and snr ~ injected +- 1. */
export function matchedFilter(d: ArrayLike<number>, h: ArrayLike<number>, sigma: number): { amp: number; snr: number } {
  const hh = sumSq(h), dh = dot(d, h);
  return { amp: hh > 0 ? dh / hh : 0, snr: hh > 0 ? dh / (sigma * Math.sqrt(hh)) : 0 };
}

/** In-place iterative radix-2 FFT; lengths must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** One-sided amplitude spectrum, zero-padded to a power of two (at least 4096 points) and normalised to its peak. */
export function spectrum(x: Float32Array, rate: number): { f: Float32Array; mag: Float32Array } {
  let n = 4096; while (n < x.length) n <<= 1;
  const re = new Float32Array(n), im = new Float32Array(n); re.set(x);
  fft(re, im);
  const m = n >> 1, f = new Float32Array(m), mag = new Float32Array(m);
  let peak = 0;
  for (let i = 0; i < m; i++) { f[i] = (i * rate) / n; mag[i] = Math.hypot(re[i], im[i]); if (mag[i] > peak) peak = mag[i]; }
  if (peak > 0) for (let i = 0; i < m; i++) mag[i] /= peak;
  return { f, mag };
}

/** One sine-Gaussian wave packet found by the fit: centre t0 (s), amplitude, phase, and the SNR it stands out with. */
export type Packet = { f: number; q: number; t0: number; a: number; phi: number; snr: number };
export type Fit = { packets: Packet[]; model: Float32Array; done: boolean };

type Atom = { f: number; q: number; re: Float32Array; im: Float32Array; norm2: number };
const dicts = new Map<string, Atom[]>();

/**
 * The fit's dictionary: sine-Gaussians at 18 frequencies from 50 to 450 Hz and three quality factors,
 * each stored as the spectrum of the analytic wavelet centred at t = 0 on a periodic grid of n samples,
 * so one inverse FFT gives its correlation with the data at every time shift, in both phases at once.
 */
function dictionary(n: number, rate: number): Atom[] {
  const key = `${n}/${rate}`, hit = dicts.get(key); if (hit) return hit;
  const d: Atom[] = [];
  for (let i = 0; i < 18; i++) {
    const f = 50 * 9 ** (i / 17);
    for (const q of [4, 7, 12]) {
      const tk = q / (2 * Math.PI * f), re = new Float32Array(n), im = new Float32Array(n), span = Math.min(n >> 2, Math.ceil(4 * tk * rate));
      let norm2 = 0;
      for (let k = -span; k <= span; k++) {
        const t = k / rate, e = Math.exp(-(t * t) / (tk * tk)), j = (k + n) % n;
        re[j] = e * Math.cos(2 * Math.PI * f * t); im[j] = e * Math.sin(2 * Math.PI * f * t);
        norm2 += re[j] * re[j];
      }
      fft(re, im);
      d.push({ f, q, re, im, norm2 });
    }
  }
  dicts.set(key, d);
  return d;
}

/**
 * A small cousin of BayesWave: fit the data with sine-Gaussian packets one at a time (matching pursuit
 * over the dictionary), keeping a packet only if it stands `threshold` noise standard deviations out,
 * which over this many trial packets is where noise alone hardly ever reaches. It knows nothing about
 * echoes. `step()` adds one packet or finishes; drive it from a timer so the page stays responsive.
 */
export function fitter(d: Float32Array, rate: number, sigma: number, threshold = 6, max = 10): { fit: Fit; step(): boolean } {
  let n = 4096; while (n < d.length) n <<= 1;
  const atoms = dictionary(n, rate), res = Float32Array.from(d), fit: Fit = { packets: [], model: new Float32Array(d.length), done: false };
  const re = new Float32Array(n), im = new Float32Array(n), pr = new Float32Array(n), pi = new Float32Array(n), s2 = sigma * sigma * n * n;
  function step(): boolean {
    if (fit.done) return false;
    re.fill(0); im.fill(0); re.set(res); fft(re, im);
    let best: Atom | null = null, bk = 0, bc = 0, bs = 0, brho2 = 0;
    for (const a of atoms) {
      // c(k) = sum_t r(t) conj(g(t - k)) = IFFT(R conj(G)) = conj(FFT(conj(R) G)) / n; real part <r, cos packet>, imaginary <r, sin packet>
      for (let i = 0; i < n; i++) { pr[i] = re[i] * a.re[i] + im[i] * a.im[i]; pi[i] = re[i] * a.im[i] - im[i] * a.re[i]; }
      fft(pr, pi);
      const inv = 1 / (s2 * a.norm2);
      for (let k = 0; k < d.length; k++) {
        const rho2 = (pr[k] * pr[k] + pi[k] * pi[k]) * inv;
        if (rho2 > brho2) { brho2 = rho2; best = a; bk = k; bc = pr[k]; bs = pi[k]; }
      }
    }
    if (!best || brho2 < threshold * threshold) { fit.done = true; return false; }
    const ac = bc / (n * best.norm2), as = bs / (n * best.norm2), tk = best.q / (2 * Math.PI * best.f), span = Math.ceil(4 * tk * rate);
    for (let k = Math.max(0, bk - span); k <= Math.min(d.length - 1, bk + span); k++) {
      const t = (k - bk) / rate, ph = 2 * Math.PI * best.f * t, v = Math.exp(-(t * t) / (tk * tk)) * (ac * Math.cos(ph) + as * Math.sin(ph));
      res[k] -= v; fit.model[k] += v;
    }
    fit.packets.push({ f: best.f, q: best.q, t0: bk / rate, a: Math.hypot(ac, as), phi: Math.atan2(-as, ac), snr: Math.sqrt(brho2) });
    if (fit.packets.length >= max) fit.done = true;
    return !fit.done;
  }
  return { fit, step };
}

/** The spacing the fit implies: the median gap between consecutive packet centres, or null with fewer than two packets. */
export function packetGap(packets: Packet[]): number | null {
  if (packets.length < 2) return null;
  const t = packets.map((p) => p.t0).sort((a, b) => a - b), gaps = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
  return gaps[(gaps.length - 1) >> 1];
}

/**
 * Log Bayes factor (signal versus noise) the thesis measured for the toy-model echo injections
 * analysed with the modified BayesWave, against the injected optimal SNR (Table C.1: dt 0.04 s,
 * gamma 0.7; averages over ten chains). SNR 0 is the pure-noise background (Table 5.1). A toy:
 * four points from one injection family, interpolated linearly in SNR^2 since the Bayes factor
 * grows roughly like SNR^2.
 */
export const LOGB: ReadonlyArray<readonly [number, number]> = [[0, -0.06], [8, -0.4], [12, 8.8], [18, 65.1], [25, 187]];

export function logBayes(snr: number): number {
  const x = snr * snr, P = LOGB;
  let i = 1; while (i < P.length - 1 && x > P[i][0] ** 2) i++;
  const [s0, b0] = P[i - 1], [s1, b1] = P[i], x0 = s0 * s0, x1 = s1 * s1;
  return b0 + ((b1 - b0) * (x - x0)) / (x1 - x0);
}

/** The smallest SNR whose log Bayes factor reaches `lb` (bisection on the rising part). */
export function snrFor(lb: number): number {
  let lo = 8, hi = 60;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (logBayes(mid) < lb) lo = mid; else hi = mid; }
  return hi;
}

/**
 * Bands. Below 3 sigma of the pure-noise background (-0.06 +- 1.55, Table 5.1) a run looks like
 * noise; the paper calls SNR 12 (log B ~ 9) a confident detection; the echo parameters only came
 * out cleanly from SNR 18 (log B ~ 65), with SNR 12 still too blurry, so "measurable" starts in between.
 */
export const BANDS = { detected: 4.6, measured: 30 } as const;
export type Verdict = 'noise' | 'detected' | 'measured';
export const verdict = (lb: number): Verdict => (lb < BANDS.detected ? 'noise' : lb < BANDS.measured ? 'detected' : 'measured');

/** G M_sun / c^3 in seconds. */
export const MSUN_S = 4.925e-6;

/**
 * Time between echoes for a surface at r = 2M (1 + eps): the light round trip between the surface
 * and the light ring at r = 3M in the tortoise coordinate, dt ~ n M |ln eps| with n = 4 for an
 * empty shell (paper: n = 4 gives 117 ms for the 65 solar-mass remnant of GW150914 with eps at the
 * Planck scale, eps ~ 1.7e-40).
 */
export const echoDelay = (eps: number, msun: number, n = 4) => n * MSUN_S * msun * Math.abs(Math.log(eps));
