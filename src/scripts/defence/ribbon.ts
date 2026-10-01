// The thesis as the map slide draws it: four parts with their chapters, and which of them tonight skips. The ribbon
// along the bottom of the slides after the map keeps only the four chapters of the talk, in the two halves of the
// research question they answer.
export type Chapter = { ch: number; name: string; skip?: boolean };
export const PARTS: { n: string; name: string; chs: Chapter[] }[] = [
  { n: 'I', name: 'Setting the stage', chs: [{ ch: 2, name: 'families' }, { ch: 3, name: 'networks' }] },
  { n: 'II', name: 'Rules and their metrics', chs: [{ ch: 4, name: 'defects', skip: true }, { ch: 5, name: 'metrics' }, { ch: 6, name: 'synchronisation' }] },
  { n: 'III', name: 'Machine learning', chs: [{ ch: 7, name: 'CA as CNN', skip: true }, { ch: 8, name: 'classifying CA', skip: true }] },
  { n: 'IV', name: 'Applications in network science', chs: [{ ch: 9, name: 'network classification' }, { ch: 10, name: 'impact analysis' }] },
];
const name = (ch: number) => PARTS.flatMap((p) => p.chs).find((c) => c.ch === ch)!.name;
/** The id of the first slide of each chapter of the talk, where a click on its tile in the ribbon goes. */
export const START: Record<number, string> = { 5: 'ch-metrics', 6: 'ch-synchronisation', 9: 'ch-classification', 10: 'ch-impact' };
export const HALVES: { name: string; chs: Chapter[] }[] = [
  { name: 'getting to know the rules', chs: [5, 6] },
  { name: 'applying them', chs: [9, 10] },
].map((h) => ({ name: h.name, chs: h.chs.map((ch) => ({ ch, name: name(ch) })) }));
