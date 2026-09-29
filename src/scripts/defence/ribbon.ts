// The thesis as the ribbon and the map slide draw it: four parts with their chapters, and which of them tonight skips.
export type Chapter = { ch: number; name: string; skip?: boolean };
export const PARTS: { n: string; name: string; chs: Chapter[] }[] = [
  { n: 'I', name: 'Setting the stage', chs: [{ ch: 2, name: 'families' }, { ch: 3, name: 'networks' }] },
  { n: 'II', name: 'Rules and their metrics', chs: [{ ch: 4, name: 'defects', skip: true }, { ch: 5, name: 'two numbers' }, { ch: 6, name: 'synchronisation' }] },
  { n: 'III', name: 'Machine learning', chs: [{ ch: 7, name: 'CA as CNN', skip: true }, { ch: 8, name: 'classifying CA', skip: true }] },
  { n: 'IV', name: 'Applications in network science', chs: [{ ch: 9, name: 'which network?' }, { ch: 10, name: 'stubborn person' }] },
];
