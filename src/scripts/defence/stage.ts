// Canvases on a slide draw in the slide's design pixels, 1920 wide and 1080 high, whatever size the slide has on
// screen: a card on the page and the projector get the same picture, sharp at both. Plus a fixed-rate ticker for the
// live demos, paused whenever its slide is off screen (the deck hides every slide but one).
import { tokens, loop, type Tokens } from '../figure';

export const DESIGN = 1920;
export type Stage = { ctx: CanvasRenderingContext2D; w: number; h: number; s: number; t: Tokens & { sans: string } };

const scaleOf = (c: Element) => (c.closest('.slide')?.getBoundingClientRect().width ?? DESIGN) / DESIGN;

/** Size the bitmap to the CSS box × DPR (at most 2) and scale the context to design pixels. Null while hidden. */
export function stage(c: HTMLCanvasElement): Stage | null {
  const r = c.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const s = scaleOf(c), dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  ctx.clearRect(0, 0, r.width / s, r.height / s);
  return { ctx, w: r.width / s, h: r.height / s, s, t: { ...tokens(c), sans: getComputedStyle(c).getPropertyValue('--sans').trim() } };
}

/** The canvas's size in design pixels, without touching its bitmap (stage clears it). */
export function size(c: HTMLCanvasElement): { w: number; h: number } {
  const r = c.getBoundingClientRect(), s = scaleOf(c);
  return { w: r.width / s, h: r.height / s };
}

/** The pointer in design pixels. */
export function pointer(c: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
  const r = c.getBoundingClientRect(), s = scaleOf(c);
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
}

/** Repaint whenever the canvas changes size: page card to projector and back. */
export function onSize(c: HTMLCanvasElement, paint: () => void): void {
  let w = 0, h = 0;
  new ResizeObserver(() => {
    const r = c.getBoundingClientRect();
    if (r.width < 1 || (Math.round(r.width) === w && Math.round(r.height) === h)) return;
    w = Math.round(r.width); h = Math.round(r.height); paint();
  }).observe(c);
}

export type Ticker = { play(on?: boolean): void; readonly playing: boolean; rate: number };

/** `advance` at `rate` ticks per second (at most 8 per frame), `paint` after each frame that moved; `advance` returning
 * true stops it. Runs only while `el` is on screen. */
export function ticker(el: HTMLElement, rate: number, advance: () => boolean | void, paint: () => void): Ticker {
  let acc = 0;
  const api: Ticker = {
    rate,
    get playing() { return lp.playing; },
    play(on?: boolean) { if (on !== false && !lp.playing) acc = 1; lp.play(on); },
  };
  const lp = loop(el, (_, dt) => {
    acc += dt * api.rate;
    let k = 0, stop = false;
    while (acc >= 1 && k < 8) { acc -= 1; k++; if (advance()) { stop = true; break; } }
    if (k === 8) acc = 0;
    if (k) paint();
    if (stop) lp.play(false);
  });
  return api;
}

/** Text in design pixels. */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: number; color: string; font: string; weight?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline }) {
  ctx.font = `${o.weight ?? 400} ${o.size ?? 34}px ${o.font}`;
  ctx.fillStyle = o.color; ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = o.base ?? 'alphabetic';
  ctx.fillText(s, x, y);
}
