// Builds the public data behind /demos/mobility/ (Rollier, Miranda, Vergeynst et al., Math. Biosci. 2023).
// The paper's phone data (Proximus) and per-arrondissement hospital admissions are confidential, so this takes
// only public stand-ins: the 2011 census commuting matrix and the weekly excess deaths of 2020 per arrondissement
// from the UGentBiomath/COVID19-Model repository (pinned commit), the arrondissement borders from the same
// repository, simplified with mapshaper, Sciensano's public daily hospital admissions per province, and its public
// confirmed cases per municipality.
// Run: node scripts/export-mobility.mjs   (needs the network and npx; writes two files in src/data/)
// Sciensano's server is slow (the case files are 90 MB): SCIENSANO=http://localhost:8000 reads a local copy instead.
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHA = '0f73a0ff05a83e570e3e863297e76e09568e3ffa';
const REPO = `https://raw.githubusercontent.com/UGentBiomath/COVID19-Model/${SHA}/data/covid19_DTM`;
const SCIENSANO = process.env.SCIENSANO ?? 'https://epistat.sciensano.be/Data';
const HOSP = `${SCIENSANO}/COVID19BE_HOSP.csv`;

// Names as in Table A.1 of the paper: Dutch in Flanders, French in Wallonia, English for Brussels.
const NAMES = {
  11: 'Antwerpen', 12: 'Mechelen', 13: 'Turnhout', 21: 'Brussels-Capital', 23: 'Halle-Vilvoorde', 24: 'Leuven', 25: 'Nivelles',
  31: 'Brugge', 32: 'Diksmuide', 33: 'Ieper', 34: 'Kortrijk', 35: 'Oostende', 36: 'Roeselare', 37: 'Tielt', 38: 'Veurne',
  41: 'Aalst', 42: 'Dendermonde', 43: 'Eeklo', 44: 'Gent', 45: 'Oudenaarde', 46: 'Sint-Niklaas',
  51: 'Ath', 52: 'Charleroi', 53: 'Mons', 55: 'Soignies', 56: 'Thuin', 57: 'Tournai-Mouscron', 58: 'La Louvière',
  61: 'Huy', 62: 'Liège', 63: 'Verviers', 64: 'Waremme', 71: 'Hasselt', 72: 'Maaseik', 73: 'Tongeren',
  81: 'Arlon', 82: 'Bastogne', 83: 'Marche-en-Famenne', 84: 'Neufchâteau', 85: 'Virton', 91: 'Dinant', 92: 'Namur', 93: 'Philippeville',
};
// The eleven units of Sciensano's provincial data (Brussels counts as one), in NIS order, with their key in that file.
const PROV = [
  ['Antwerpen', 'Antwerpen'], ['Brussels-Capital', 'Brussels'], ['Vlaams-Brabant', 'VlaamsBrabant'], ['Brabant Wallon', 'BrabantWallon'],
  ['West-Vlaanderen', 'WestVlaanderen'], ['Oost-Vlaanderen', 'OostVlaanderen'], ['Hainaut', 'Hainaut'], ['Liège', 'Liège'],
  ['Limburg', 'Limburg'], ['Luxembourg', 'Luxembourg'], ['Namur', 'Namur'],
];
const provOf = (nis) => { const s = String(nis); return { 1: 0, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10 }[s[0]] ?? { 21: 1, 23: 2, 24: 2, 25: 3 }[s.slice(0, 2)]; };

const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const csv = (text) => text.trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '')));

// Arrondissements, populations (census-based initial condition of the model, as in Table A.1).
// The header has quoted commas ("[0, 10)"), so read the total as the last field.
const popRows = csv(await (await get(`${REPO}/interim/demographic/initN_arr.csv`)).text());
const arr = popRows.slice(1).map((r) => { const nis = +r[0]; return { nis, name: NAMES[nis / 1000], prov: provOf(nis), pop: +r[r.length - 1] }; });
if (arr.length !== 43 || arr.some((a) => !a.name || a.prov === undefined || !(a.pop > 0))) throw new Error('arrondissement table');
const order = arr.map((a) => String(a.nis));

// Commuting: row lives in, column works in (2011 census).
const cm = csv(await (await get(`${REPO}/interim/census_2011/census-2011-updated_row-commutes-to-column_arr.csv`)).text());
const col = cm[0].slice(1), row = new Map(cm.slice(1).map((r) => [r[0], r.slice(1).map(Number)]));
const commute = order.flatMap((g) => order.map((h) => row.get(g)[col.indexOf(h)]));

// Weekly excess deaths of 2020 in percent, one row per week.
const ed = csv(await (await get(`${REPO}/interim/sciensano/excess_deaths_2020.csv`)).text());
const edCol = order.map((n) => ed[0].indexOf(n));
const excess = { start: ed[1][0], values: ed.slice(1).map((r) => edCol.map((i) => Math.round(+r[i] * 10) / 10)) };

// Daily new hospital admissions per province, 1 March to 31 December 2020.
const hosp = csv(await (await get(HOSP)).text());
const h = hosp[0], iD = h.indexOf('DATE'), iP = h.indexOf('PROVINCE'), iN = h.indexOf('NEW_IN');
const day0 = Date.UTC(2020, 2, 1), days = (Date.UTC(2020, 11, 31) - day0) / 864e5 + 1;
const admissions = Array.from({ length: days }, () => new Array(PROV.length).fill(0));
for (const r of hosp.slice(1)) {
  const d = (Date.parse(r[iD]) - day0) / 864e5, p = PROV.findIndex(([, k]) => k === r[iP]);
  if (d >= 0 && d < days && p >= 0 && r[iN] !== 'NA') admissions[d][p] += +r[iN];
}

// Confirmed cases per arrondissement and week, the weeks of the excess deaths. Sciensano publishes cases per
// municipality and day, but a day with 1 to 4 cases only as "<5". Its exact totals per province and day are public
// too, so what a province's "<5" days add up to is known: the total minus the exact counts. That remainder is spread
// evenly over the province's "<5" municipalities, each kept between 1 and 4.
const wk0 = Date.parse(excess.start), WEEKS = excess.values.length;
const total = new Map(); // date|province → exact cases
for (const r of csv(await (await get(`${SCIENSANO}/COVID19BE_CASES_AGESEX.csv`)).text()).slice(1)) {
  const p = PROV.findIndex(([, k]) => k === r[1]), k = `${r[0]}|${p}`;
  if (p >= 0) total.set(k, (total.get(k) ?? 0) + +r[r.length - 1]);
}
const cases = Array.from({ length: WEEKS }, () => new Array(arr.length).fill(0));
const day = new Map(); // date|province → { w, exact, masked: arrondissement of each "<5" municipality, −1 if unknown }
for (const r of csv(await (await get(`${SCIENSANO}/COVID19BE_CASES_MUNI.csv`)).text()).slice(1)) {
  const w = Math.floor((Date.parse(r[1]) - wk0) / (7 * 864e5));
  if (!(w >= 0 && w < WEEKS)) continue;
  const a = r[0] === 'NA' ? -1 : order.indexOf(String(Math.floor(+r[0] / 1000) * 1000));
  if (a < 0 && r[0] !== 'NA') throw new Error(`municipality ${r[0]}`);
  const p = a >= 0 ? arr[a].prov : PROV.findIndex(([, k]) => k === r[6]);
  if (p < 0) continue;
  const k = `${r[1]}|${p}`, c = r[r.length - 1];
  if (!day.has(k)) day.set(k, { w, exact: 0, masked: [] });
  const e = day.get(k);
  if (c === '<5') e.masked.push(a); else { e.exact += +c; if (a >= 0) cases[w][a] += +c; }
}
let off = 0;
for (const [k, e] of day) {
  if (!e.masked.length) continue;
  const each = ((total.get(k) ?? 0) - e.exact) / e.masked.length;
  if (each < 1 || each > 4) off++;
  for (const a of e.masked) if (a >= 0) cases[e.w][a] += Math.min(4, Math.max(1, each));
}
console.log(`cases: ${day.size} province-days, ${off} of them with a "<5" share outside 1 to 4`);

writeFileSync('src/data/mobility.json', JSON.stringify({
  source: { repo: `UGentBiomath/COVID19-Model@${SHA.slice(0, 7)}`, sciensano: 'https://epistat.sciensano.be/Data' },
  prov: PROV.map(([name]) => name), arr, commute, excess, cases: { start: excess.start, values: cases.map((r) => r.map(Math.round)) },
  hosp: { start: '2020-03-01', values: admissions },
}));

// Borders: simplified with shared arcs so neighbours still meet, then as SVG paths in km on the Belgian Lambert 2008 grid.
const dir = mkdtempSync(join(tmpdir(), 'arr-'));
for (const ext of ['shp', 'shx', 'dbf', 'prj']) writeFileSync(join(dir, `a.${ext}`), Buffer.from(await (await get(`${REPO}/raw/GIS/shapefiles/BE/Arrondissements.${ext}`)).arrayBuffer()));
execFileSync('npx', ['-y', 'mapshaper@0.6', join(dir, 'a.shp'), '-simplify', '1%', 'keep-shapes', '-o', 'format=geojson', 'precision=100', join(dir, 'a.json')], { stdio: 'inherit' });
const geo = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')).features;
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
const all = geo.flatMap((f) => rings(f.geometry).flat());
const x0 = Math.min(...all.map((p) => p[0])), y1 = Math.max(...all.map((p) => p[1]));
const km = (v) => Math.round(v / 100) / 10;
const paths = order.map((nis) => {
  const f = geo.find((g) => String(g.properties.NIS) === nis);
  return rings(f.geometry).map((r) => 'M' + r.slice(0, -1).map(([x, y]) => `${km(x - x0)} ${km(y1 - y)}`).join('L') + 'Z').join('');
});
writeFileSync('src/data/belgium-arrondissements.json', JSON.stringify({
  w: km(Math.max(...all.map((p) => p[0])) - x0), h: km(y1 - Math.min(...all.map((p) => p[1]))), paths,
}));
console.log(`43 arrondissements, ${excess.values.length} weeks of excess deaths, ${days} days of admissions`);
