// Play a Float32Array once through the Web Audio API. The context is made lazily inside a click
// handler (autoplay policy) and shared by the page. Peak-normalised, faded at both ends, one shot.

let ctx: AudioContext | null = null;

export const canPlay = () => typeof window !== 'undefined' && 'AudioContext' in window;

/** Preferred sample rate for samples that will be played (the context's, once it exists). */
export const sampleRate = () => ctx?.sampleRate ?? 44100;

/** Resolves when playback ends. `rate` is the sample rate of `samples`. Returns a stop function through the second argument. */
export function play(samples: Float32Array, rate: number, gain = 0.3, handle?: { stop?: () => void }): Promise<void> {
  ctx ??= new AudioContext();
  ctx.resume().catch(() => {});
  const N = samples.length, buf = ctx.createBuffer(1, N, rate), ch = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const k = peak > 0 ? 0.8 / peak : 0, fade = Math.max(1, Math.min(N >> 1, Math.round(rate * 0.005)));
  for (let i = 0; i < N; i++) ch[i] = samples[i] * k * Math.min(1, i / fade, (N - 1 - i) / fade);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; g.gain.value = gain; src.connect(g).connect(ctx.destination);
  if (handle) handle.stop = () => { try { src.stop(); } catch {} };
  return new Promise((res) => { src.onended = () => { src.disconnect(); g.disconnect(); res(); }; src.start(); });
}
