// LaTeX in the deck, typeset by KaTeX at build time, so slides, page text and the offline file all show formulas the
// way the thesis does, with no script. `tex` is one formula; `texify` is plain text with $…$ around each formula, as
// HTML for set:html. A rule label that changes on the slide marks its numbers with \htmlClass{…}{…}, so a script can
// swap them in place (the only command `trust` lets through). A formula KaTeX cannot parse fails the build.
import katex from 'katex';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const tex = (t: string, display = false) =>
  katex.renderToString(t, {
    displayMode: display, throwOnError: true,
    trust: (c) => c.command === '\\htmlClass', strict: (code: string) => (code === 'htmlExtension' ? 'ignore' : 'warn'),
  });

export const texify = (s: string) => s.split(/\$([^$]+)\$/).map((p, i) => (i % 2 ? tex(p) : esc(p))).join('');

/** φ with the resolution above and the born and survive numbers below, as in the thesis: φ⁹₈,₁₂ is the Game of Life.
 * With `live`, the three numbers sit in spans of class phi-r, phi-b and phi-s, for a script to change (setPhi). */
export const phi = (r: number, B: number, S: number, live = false) =>
  live ? tex(`\\phi^{\\htmlClass{phi-r}{${r}}}_{\\htmlClass{phi-b}{${B}},\\htmlClass{phi-s}{${S}}}`) : tex(`\\phi^{${r}}_{${B},${S}}`);
