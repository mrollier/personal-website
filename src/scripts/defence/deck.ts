// The defence deck. Every slide is a <section data-slide data-builds="n"> with n builds: Next performs the next build or
// moves on, Prev undoes one (the slide is set to the previous build state) or goes back a slide, shown in its final state.
// Elements with data-b="k" appear from build k on, data-b-off="k" vanishes from build k on; anything else a build does
// is the slide's own `set`. On the page each slide is a card with its own buttons. While presenting, the deck owns the
// clicker keys in the capture phase, so no widget (a focused range input in Firefox) can swallow PageDown or PageUp.
// Escape leaves fullscreen but not the deck, which stays full-window until `f` or `q`.

export type How = 'next' | 'prev' | 'jump';
export type SlideApi = {
  /** Bring the slide to build state b (0 … builds): `next` animates the step, `prev` and `jump` snap to it. */
  set?(b: number, how: How): void;
  /** The slide comes on screen in the deck: back to its preset state, before `set`. */
  enter?(): void;
  /** The slide leaves the screen in the deck: pause. */
  leave?(): void;
  /** Called before Next (+1) or Prev (−1) is acted on; true swallows it, e.g. Next during a countdown finishes the countdown. */
  intercept?(dir: 1 | -1): boolean;
  /** A key the deck does not use, such as `c` on the rounds slide; true when handled. */
  key?(k: string): boolean;
};

const apis = new WeakMap<Element, SlideApi>();
/** Register what a slide does on its builds. Its script calls this once for its <section>. */
export function slide(el: Element, api: SlideApi): void { apis.set(el, api); }
export const buildOf = (el: Element) => +((el as HTMLElement).dataset.at ?? 0);

const NEXT = new Set(['PageDown', 'ArrowRight', 'ArrowDown', ' ', 'n', 'N']);
const PREV = new Set(['PageUp', 'ArrowLeft', 'ArrowUp', 'Backspace', 'p', 'P']);

export function mountDeck(deck: HTMLElement): void {
  const slides = Array.from(deck.querySelectorAll<HTMLElement>('[data-slide]'));
  const mains = slides.filter((s) => !s.hasAttribute('data-appendix'));
  const firstAppendix = slides.findIndex((s) => s.hasAttribute('data-appendix'));
  const standalone = deck.hasAttribute('data-standalone');
  const $ = <T extends HTMLElement>(sel: string) => deck.querySelector<T>(sel)!;
  const counter = $<HTMLOutputElement>('[data-counter]'), clock = $<HTMLOutputElement>('[data-clock]');
  const blank = $<HTMLElement>('[data-blank]'), gate = deck.querySelector<HTMLElement>('[data-gate]');
  const builds = (s: HTMLElement) => +(s.dataset.builds ?? 0);
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const fsEl = () => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  let cur = 0, presenting = false, started = 0, timer = false, digits = '', digitsAt = 0;

  slides.forEach((s, i) => { s.dataset.index = String(i); s.dataset.at = '0'; });

  function setBuild(s: HTMLElement, b: number, how: How) {
    b = Math.max(0, Math.min(builds(s), b));
    s.dataset.at = String(b);
    s.querySelectorAll<HTMLElement>('[data-b]').forEach((e) => e.classList.toggle('on', +e.dataset.b! <= b));
    s.querySelectorAll<HTMLElement>('[data-b-off]').forEach((e) => e.classList.toggle('off', +e.dataset.bOff! <= b));
    apis.get(s)?.set?.(b, how);
    s.dispatchEvent(new CustomEvent('deck:build', { detail: b }));
  }

  // ── the page: one card per slide, with its own build buttons ──
  if (!standalone) for (const s of slides) {
    const bar = document.createElement('div');
    bar.className = 'cardbar';
    const n = builds(s), num = s.hasAttribute('data-appendix') ? 'backup' : `${mains.indexOf(s) + 1} / ${mains.length}`;
    bar.innerHTML = `<span>${num}</span>` +
      (n ? `<button type="button" data-step="-1" aria-label="previous build">&lsaquo;</button><output>build 0 of ${n}</output><button type="button" data-step="1" aria-label="next build">&rsaquo;</button>` : '') +
      `<button type="button" data-here>present from here</button>`;
    s.after(bar);
    const out = bar.querySelector('output');
    s.addEventListener('deck:build', (e) => { if (out) out.value = `build ${(e as CustomEvent).detail} of ${n}`; });
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      if (b.dataset.step) { const d = +b.dataset.step as 1 | -1; if (!apis.get(s)?.intercept?.(d)) setBuild(s, +(s.dataset.at ?? 0) + d, d > 0 ? 'next' : 'prev'); }
      else start(+s.dataset.index!);
    });
  }

  // ── presenting ──
  function show(i: number, back = false) {
    const old = slides[cur];
    if (old && old !== slides[i]) { old.classList.remove('current'); if (presenting) apis.get(old)?.leave?.(); }
    cur = i;
    const s = slides[i];
    s.classList.add('current');
    apis.get(s)?.enter?.();
    setBuild(s, back ? builds(s) : 0, 'jump');
    label();
  }
  const terminal = (i: number) => i === mains.length - 1 || i === slides.length - 1;
  function next() {
    const s = slides[cur], b = +s.dataset.at!;
    if (apis.get(s)?.intercept?.(1)) return;
    if (b < builds(s)) setBuild(s, b + 1, 'next');
    else if (!terminal(cur)) show(cur + 1);
  }
  function prev() {
    const s = slides[cur], b = +s.dataset.at!;
    if (apis.get(s)?.intercept?.(-1)) return;
    if (b > 0) setBuild(s, b - 1, 'prev');
    else if (cur > 0) show(cur - 1, true);
  }
  function label() {
    const s = slides[cur], a = s.hasAttribute('data-appendix');
    counter.value = digits ? `go to ${digits}…` : a ? (cur === firstAppendix ? 'backup' : `backup ${cur - firstAppendix}`) : `${cur + 1} / ${mains.length}`;
    tick();
  }
  // Rehearsal clock: elapsed time and when the current block should end.
  function tick() {
    if (!timer || !presenting) { clock.hidden = true; return; }
    const sec = Math.floor((Date.now() - started) / 1000), mm = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    const until = slides[cur].closest<HTMLElement>('[data-until]')?.dataset.until;
    clock.hidden = false; clock.value = mm(sec) + (until ? ` · block ends ${until}` : '');
  }
  setInterval(tick, 1000);

  function fullscreen() {
    const req = deck.requestFullscreen ?? (deck as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen;
    try { const p = req?.call(deck); if (p && 'catch' in p) p.catch(() => {}); } catch { /* stays full-window */ }
  }
  function start(i: number, fs = true) {
    if (!presenting) {
      presenting = true;
      deck.classList.add('presenting', 'full'); document.documentElement.classList.add('deck-on');
      slides.forEach((s) => s.classList.remove('current'));
    }
    if (gate) gate.hidden = true;
    started ||= Date.now();
    show(i);
    deck.focus({ preventScroll: true });
    if (fs) fullscreen();
  }
  function stop() {
    if (standalone) return; // the standalone file has nowhere to go back to
    presenting = false; blank.hidden = true;
    apis.get(slides[cur])?.leave?.();
    if (fsEl() === deck) (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document);
    deck.classList.remove('presenting', 'full'); document.documentElement.classList.remove('deck-on');
    const s = slides[cur];
    s.classList.remove('current');
    deck.dispatchEvent(new CustomEvent('deck:exit', { detail: s }));
    s.scrollIntoView({ block: 'center' });
  }

  // The deck owns every clicker key while presenting, before any widget sees it.
  addEventListener('keydown', (e) => {
    if (!presenting || e.altKey || e.ctrlKey || e.metaKey) {
      if (presenting && (e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey)) e.preventDefault(); // no reload mid-talk
      return;
    }
    const k = e.key;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (gate && !gate.hidden) { if (NEXT.has(k) || PREV.has(k) || k === 'Enter') { eat(); start(cur, false); } else if (k === 'f') { eat(); start(cur); } return; }
    if (/^[0-9]$/.test(k)) { eat(); digits = (Date.now() - digitsAt < 3000 ? digits : '') + k; digitsAt = Date.now(); label(); return; }
    if (k === 'Enter' && digits) { eat(); const n = +digits; digits = ''; if (n >= 1 && n <= mains.length) show(n - 1); else label(); return; }
    if (k === 'Escape') { eat(); digits = ''; label(); return; } // fullscreen may end; the deck stays
    if (NEXT.has(k)) { eat(); if (!blank.hidden) blank.hidden = true; else next(); return; }
    if (PREV.has(k)) { eat(); if (!blank.hidden) blank.hidden = true; else prev(); return; }
    switch (k) {
      case 'b': case 'B': case '.': blank.hidden = !blank.hidden; break;
      case 'F5': break; // a reload would restart the talk
      case 'f': case 'F': fullscreen(); break;
      case 'q': case 'Q': stop(); break;
      case 'a': case 'A': if (firstAppendix >= 0) show(firstAppendix); break;
      case 'Home': show(0); break;
      case 't': case 'T': timer = !timer; tick(); break;
      default: if (!apis.get(slides[cur])?.key?.(k)) return;
    }
    eat();
  }, { capture: true });

  // After a click or drag on a demo, the next clicker press must still reach the deck.
  const refocus = () => { if (presenting) deck.focus({ preventScroll: true }); };
  deck.addEventListener('pointerup', refocus);
  deck.addEventListener('change', refocus);
  addEventListener('beforeunload', (e) => { if (presenting) { e.preventDefault(); e.returnValue = ''; } });

  deck.querySelector('[data-exit]')?.addEventListener('click', stop);
  deck.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
    const to = go ? document.getElementById(go.dataset.go!)?.closest<HTMLElement>('[data-slide]') : null;
    if (to && presenting) { e.preventDefault(); show(+to.dataset.index!); }
  });
  gate?.querySelector('button')?.addEventListener('click', () => start(cur));
  for (const b of document.querySelectorAll<HTMLElement>(`[data-present="${deck.id}"]`)) b.addEventListener('click', () => start(0));

  if (standalone) { presenting = true; deck.classList.add('presenting', 'full'); document.documentElement.classList.add('deck-on'); show(0); deck.focus({ preventScroll: true }); }
}
