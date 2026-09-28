// A QR code for a short text, computed at build time so the page ships an SVG and no library: byte mode,
// versions 1 to 6 (up to 106 bytes at level L), the mask with the lowest penalty. Follows ISO/IEC 18004 in the
// structure of Nayuki's reference generator. Pure, no DOM.

export type Level = 'L' | 'M' | 'Q' | 'H';

// Per version 1–6 and level: error-correction codewords per block, then the data codewords of each block.
const BLOCKS: Record<Level, [number, number[]][]> = {
  L: [[7, [19]], [10, [34]], [15, [55]], [20, [80]], [26, [108]], [18, [68, 68]]],
  M: [[10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]], [16, [27, 27, 27, 27]]],
  Q: [[13, [13]], [22, [22]], [18, [17, 17]], [26, [24, 24]], [18, [15, 15, 16, 16]], [24, [19, 19, 19, 19]]],
  H: [[17, [9]], [28, [16]], [22, [13, 13]], [16, [9, 9, 9, 9]], [22, [11, 11, 12, 12]], [28, [15, 15, 15, 15]]],
};
const FORMAT: Record<Level, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Multiplication in GF(256) modulo x^8 + x^4 + x^3 + x^2 + 1. */
function gmul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}

/** The Reed–Solomon error-correction codewords of `data`. */
export function reedSolomon(data: number[], degree: number): number[] {
  const div = new Array<number>(degree).fill(0); div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { div[j] = gmul(div[j], root); if (j + 1 < degree) div[j] ^= div[j + 1]; }
    root = gmul(root, 2);
  }
  const out = new Array<number>(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift()!; out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= gmul(div[i], f);
  }
  return out;
}

/** The 15 format bits for a level and mask, BCH-coded and masked. */
export function formatBits(level: Level, mask: number): number {
  const data = (FORMAT[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The codewords of `bytes` at a version and level: header, data, padding, then the blocks interleaved with their error correction. */
function codewords(bytes: number[], version: number, level: Level): number[] | null {
  const [ec, blocks] = BLOCKS[level][version - 1], capacity = blocks.reduce((a, b) => a + b, 0);
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  if (bits.length > capacity * 8) return null;
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);
  const split: number[][] = [];
  let at = 0;
  for (const n of blocks) { split.push(data.slice(at, at + n)); at += n; }
  const checks = split.map((b) => reedSolomon(b, ec)), out: number[] = [];
  for (let i = 0; i < Math.max(...blocks); i++) for (const b of split) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const c of checks) out.push(c[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export type Qr = { size: number; version: number; mask: number; dark: (x: number, y: number) => boolean };

/** The smallest QR code of version ≤ 6 that holds `text` (UTF-8) at `level`. Throws when it does not fit. */
export function qr(text: string, level: Level = 'M'): Qr {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1, words: number[] | null = null;
  for (; version <= 6; version++) if ((words = codewords(bytes, version, level))) break;
  if (!words) throw new Error(`too long for a version-6 QR code: ${text}`);
  const size = 17 + 4 * version;
  const mod = new Uint8Array(size * size), fn = new Uint8Array(size * size);
  const set = (x: number, y: number, v: boolean) => { mod[y * size + x] = v ? 1 : 0; fn[y * size + x] = 1; };

  // Timing lines, then the three finders with their light separators, the alignment pattern, and the format area.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  if (version > 1) {
    const c = 4 * version + 10;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (bits: number) => {
    const b = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
    set(8, size - 8, true);
  };
  format(0);

  // Data in two-column zigzags from the bottom right, skipping the vertical timing line.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (fn[y * size + x]) continue;
      mod[y * size + x] = i < words.length * 8 ? (words[i >>> 3] >>> (7 - (i & 7))) & 1 : 0;
      i++;
    }
  }

  // Every mask, scored by the four penalty rules; keep the lowest.
  const base = mod.slice();
  let best = -1, bestScore = Infinity, bestGrid = base;
  for (let m = 0; m < 8; m++) {
    const g = base.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y * size + x] && MASKS[m](x, y)) g[y * size + x] ^= 1;
    mod.set(g); format(formatBits(level, m)); g.set(mod);
    const s = penalty(g, size);
    if (s < bestScore) { bestScore = s; best = m; bestGrid = g; }
  }
  return { size, version, mask: best, dark: (x, y) => bestGrid[y * size + x] === 1 };
}

/** The ISO penalty: runs of five or more, 2×2 blocks, finder-like 1:1:3:1:1 runs with light margins, and the dark share away from half. */
function penalty(g: Uint8Array, n: number): number {
  let score = 0, dark = 0;
  const at = (x: number, y: number, byRow: boolean) => (byRow ? g[y * n + x] : g[x * n + y]);
  for (const byRow of [true, false]) {
    for (let y = 0; y < n; y++) {
      let run = 1;
      for (let x = 1; x <= n; x++) {
        if (x < n && at(x, y, byRow) === at(x - 1, y, byRow)) { run++; continue; }
        if (run >= 5) score += run - 2;
        run = 1;
      }
      for (let x = 0; x + 7 <= n; x++) {
        const p = [1, 0, 1, 1, 1, 0, 1].every((v, k) => at(x + k, y, byRow) === v);
        if (!p) continue;
        const light = (a: number, b: number) => { for (let k = a; k < b; k++) if (k >= 0 && k < n && at(k, y, byRow)) return false; return true; };
        if (light(x - 4, x) || light(x + 7, x + 11)) score += 40;
      }
    }
  }
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) {
    const v = g[y * n + x];
    if (v === g[y * n + x + 1] && v === g[(y + 1) * n + x] && v === g[(y + 1) * n + x + 1]) score += 3;
  }
  for (let k = 0; k < n * n; k++) dark += g[k];
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return score;
}

/** The code as one SVG path in module units, with a four-module quiet zone: `viewBox="0 0 size+8 size+8"`. */
export function qrPath(code: Qr): string {
  let d = '';
  for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.dark(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  return d;
}
