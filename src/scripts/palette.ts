// Colours for the raster figures: parse the site's CSS tokens, mix them, build ramps, and squash a
// wide range onto [0, 1] on a log scale. Pure, no DOM.

export type RGB = [number, number, number];

/** #rgb, #rrggbb, rgb(r, g, b) or rgba(...) to numbers; anything else is mid grey. */
export function parse(css: string): RGB {
  const s = css.trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    const v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
}

export const css = (c: RGB) => `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;

export function mix(a: RGB, b: RGB, t: number): RGB {
  t = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A piecewise-linear ramp through the stops, t in [0, 1]. */
export function ramp(stops: RGB[]): (t: number) => RGB {
  const n = stops.length - 1;
  return (t) => {
    const x = Math.min(1, Math.max(0, t)) * n, i = Math.min(n - 1, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
  };
}

/** log(1 + v) / log(1 + vmax): 0 stays 0, and a value of 3ᵗ stays readable next to 1. */
export const logScale = (v: number, vmax: number) => (v <= 0 || vmax <= 0 ? 0 : Math.log1p(v) / Math.log1p(vmax));
