// The taxonomy's central diagram (Fig. 1.3 of the CNSNS paper, Fig. 2.1 of the thesis) as SVG geometry: the elementary
// automaton in the middle, the five families on a pentagon, spokes that say what each family changes and rim arrows for
// the identities between neighbours. Shared by CaFamilies.astro and FamilyMap.astro. Pure, no DOM.

export type Fam = { id: string; short: string; name: string[]; angle: number; spoke: [string, string] };
export const FAMS: Fam[] = [
  { id: 'nuca', short: 'νCA', name: ['non-uniform'], angle: -90, spoke: ['more rules', ''] },
  { id: 'msca', short: 'MSCA', name: ['multi-state'], angle: -18, spoke: ['more states', ''] },
  { id: 'enca', short: 'ENCA', name: ['extended', 'neighbourhood'], angle: 54, spoke: ['larger', 'neighbourhood'] },
  { id: 'aca', short: 'ACA', name: ['asynchronous'], angle: 126, spoke: ['asynchronous', 'update'] },
  { id: 'sca', short: 'SCA', name: ['stochastic'], angle: 198, spoke: ['non-deterministic', 'update'] },
];
export const RIM: [string, string, string, string][] = [
  ['nuca', 'msca', 'mapping onto', 'product states'],
  ['msca', 'enca', 'more time steps', 'or fewer cells'],
  ['enca', 'aca', 'network wiring', 'or ±1 dimension'],
  ['aca', 'sca', 'probabilistic', 'update sequence'],
  ['sca', 'nuca', 'probabilistic', 'rule allocation'],
];
export const CX = 320, CY = 305, R = 240, R0 = 52, GAP = R0 + 5;
export const f1 = (v: number) => v.toFixed(1);

const at = (id: string) => { const f = FAMS.find((x) => x.id === id)!, a = (f.angle * Math.PI) / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };

/** An arrow between two circle centres, shortened to the rims, with a label on each side that reads upright. */
function edge(a: number[], b: number[], above: string, below: string, outward = false) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const x1 = a[0] + ux * GAP, y1 = a[1] + uy * GAP, x2 = b[0] - ux * GAP, y2 = b[1] - uy * GAP, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI; if (ang > 90 || ang < -90) ang += 180;
  // "above" the text line points along (sin, −cos); round the rim the first label goes on the outside
  const r = (ang * Math.PI) / 180, up = Math.sin(r) * (mx - CX) - Math.cos(r) * (my - CY) > 0;
  const [top, bottom] = outward && !up ? [below, above] : [above, below];
  return { d: `M${f1(x1)},${f1(y1)} L${f1(x2)},${f1(y2)}`, t: `translate(${f1(mx)},${f1(my)}) rotate(${f1(ang)})`, top, bottom };
}

export const spokes = FAMS.map((f) => ({ id: f.id, ...edge([CX, CY], at(f.id), f.spoke[0], f.spoke[1]) }));
export const rims = RIM.map(([a, b, o, i]) => ({ id: `${a}-${b}`, ...edge(at(a), at(b), o, i, true) }));
export const band = `M${FAMS.map((f) => at(f.id).map(f1).join(',')).join(' L')} Z ` + FAMS.map((f) => `M${CX},${CY} L${at(f.id).map(f1).join(',')}`).join(' ');
export const nodes = [{ id: 'eca', short: 'ECA', name: ['elementary'], x: CX, y: CY }, ...FAMS.map((f) => { const [x, y] = at(f.id); return { id: f.id, short: f.short, name: f.name, x, y }; })];
