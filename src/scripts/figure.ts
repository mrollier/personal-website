// Plumbing shared by the canvas figures: DPR-aware sizing, the site's colour tokens read from CSS,
// repaint on resize and on the theme toggle, a paused-when-off-screen animation loop, one-rAF
// coalescing for slider-driven redraws, fullscreen with the class fallback where the API is missing
// (iPhone), URL state and scoped keys. Imports nothing; a figure lifts out with this file.

export type Size = { w: number; h: number; dpr: number };

/** Bitmap = CSS box x DPR, with the context scaled so drawing is in CSS px. Null when the canvas has no size (display: none). */
export function fit(c: HTMLCanvasElement): Size | null {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  if (r.width < 1 || r.height < 1) return null;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height, dpr };
}

export type Tokens = { bg: string; ink: string; muted: string; line: string; panel: string; accent: string; sun: string; danger: string; mono: string };

/** The site's colour and font tokens as currently computed, so light and dark both work. Read at the top of every paint. */
export function tokens(el: Element): Tokens {
  const cs = getComputedStyle(el), v = (n: string) => cs.getPropertyValue(n).trim();
  return { bg: v('--bg'), ink: v('--ink'), muted: v('--muted'), line: v('--line'), panel: v('--panel'), accent: v('--accent'), sun: v('--sun'), danger: v('--danger'), mono: v('--mono') };
}

/** Repaint when the canvas changes size (a resize wipes the bitmap) and when the theme toggles (no event, so watch the attribute). */
export function watch(c: HTMLCanvasElement, repaint: () => void): void {
  new ResizeObserver(() => { if (c.getBoundingClientRect().width >= 1) repaint(); }).observe(c);
  new MutationObserver(repaint).observe(document.documentElement, { attributeFilter: ['data-theme'] });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Loop = { play(on?: boolean): void; readonly playing: boolean; onchange?: (on: boolean) => void };

/** rAF loop with a model clock that only runs while playing; `tick` gets model time and the step. Frames are skipped while the element is off screen. */
export function loop(el: HTMLElement, tick: (t: number, dt: number) => void): Loop {
  let playing = false, visible = true, last = 0, t = 0, raf = 0;
  const frame = (now: number) => {
    raf = 0;
    if (!playing) return;
    if (visible) { const dt = Math.min(0.1, (now - last) / 1000); t += dt; tick(t, dt); }
    last = now; raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
  const api: Loop = {
    get playing() { return playing; },
    play(on = !playing) {
      if (on === playing) return;
      playing = on; api.onchange?.(on);
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
  };
  return api;
}

/** Many input events, one repaint per frame. */
export function schedule(paint: () => void): () => void {
  let pending = false;
  return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; paint(); }); };
}

/** Fullscreen on the figure so its controls stay usable; a `.full` class where the API is missing. Mirrors Eca.astro. */
export function fullscreen(el: HTMLElement, btn: HTMLButtonElement): { toggle(): void; on(): boolean } {
  const doc = document as any;
  const fsEl = () => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  const on = () => fsEl() === el || el.classList.contains('full');
  function show() {
    const o = on();
    btn.textContent = o ? 'exit fullscreen' : 'fullscreen'; btn.setAttribute('aria-pressed', String(o));
    if (o) el.focus();
  }
  function fallback() { el.classList.add('full'); show(); }
  function toggle() {
    if (el.classList.contains('full')) { el.classList.remove('full'); show(); return; }
    if (fsEl() === el) { (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document); return; }
    const req = el.requestFullscreen ?? (el as any).webkitRequestFullscreen;
    if (!req) return fallback();
    try { const p = req.call(el); if (p && p.catch) p.catch(fallback); } catch { fallback(); }
  }
  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  return { toggle, on };
}

/** Query-string state under a prefix (`train.dt`), so several figures share one address. Only non-defaults are written, debounced: Safari throws after 100 replaceState calls in 30 s. */
export function urlState(prefix: string, defaults: Record<string, string>): { get(k: string): string; set(k: string, v: string): void } {
  const key = (k: string) => `${prefix}.${k}`;
  const pending = new Map<string, string>();
  let timer = 0;
  const flush = () => {
    timer = 0;
    try {
      const u = new URL(location.href), p = u.searchParams;
      for (const [k, v] of pending) (v === defaults[k] ? p.delete(key(k)) : p.set(key(k), v));
      pending.clear();
      history.replaceState(null, '', u);
    } catch { /* throttled or sandboxed: the page state is still right */ }
  };
  return {
    get: (k) => new URLSearchParams(location.search).get(key(k)) ?? defaults[k],
    set: (k, v) => { pending.set(k, v); if (!timer) timer = window.setTimeout(flush, 300); },
  };
}

/** Keys scoped to the focused figure. Inputs keep their keys; buttons keep space and Enter. Only handled keys are prevented, so an unhandled one still reaches the page. */
export function keys(el: HTMLElement, map: Record<string, () => void>): void {
  el.querySelector('canvas')?.addEventListener('pointerdown', () => el.focus());
  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement, k = e.key;
    if (t.matches('input, select, textarea')) return;
    if (t.matches('button, a') && (k === ' ' || k === 'Enter')) return;
    const f = map[k]; if (!f) return;
    f(); e.preventDefault();
  });
}

export type Box = { x: number; y: number; w: number; h: number };
export type Stroke = { stroke: string; width?: number; dash?: number[]; alpha?: number };

/** A time trace as a polyline: one min/max pair per pixel column when the data is denser than the pixels, so peaks survive. `scale` = px per unit of y, centred on the box. */
export function trace(ctx: CanvasRenderingContext2D, y: ArrayLike<number>, box: Box, scale: number, style: Stroke, from = 0, to = y.length): void {
  const n = to - from; if (n < 2) return;
  const mid = box.y + box.h / 2, cols = Math.max(1, Math.floor(box.w));
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  ctx.strokeStyle = style.stroke; ctx.lineWidth = style.width ?? 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash(style.dash ?? []); ctx.globalAlpha = style.alpha ?? 1;
  ctx.beginPath();
  if (n <= cols * 2) {
    for (let i = 0; i < n; i++) { const px = box.x + (i / (n - 1)) * box.w, py = mid - y[from + i] * scale; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  } else {
    for (let c = 0; c < cols; c++) {
      const i0 = from + Math.floor((c / cols) * n), i1 = from + Math.floor(((c + 1) / cols) * n);
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i < i1; i++) { const v = y[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (lo === Infinity) continue;
      const px = box.x + c + 0.5;
      if (c === 0) ctx.moveTo(px, mid - hi * scale); else ctx.lineTo(px, mid - hi * scale);
      ctx.lineTo(px, mid - lo * scale);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Small mono label. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: Tokens, opts: { color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; size?: number } = {}): void {
  ctx.save();
  ctx.font = `${opts.size ?? 11}px ${t.mono}`; ctx.fillStyle = opts.color ?? t.muted;
  ctx.textAlign = opts.align ?? 'left'; ctx.textBaseline = opts.base ?? 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}
