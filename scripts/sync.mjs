#!/usr/bin/env node
// Refreshes the record and book collections from Discogs and Goodreads:
//   src/content/records.json, src/content/books.json and the covers in public/covers/.
// Run by hand (`npm run sync`) and commit the result; the site build itself never touches the network.
// Bandcamp has no public API and blocks scripted requests, so it stays a plain link.
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DISCOGS_USER = 'michielrollier';
const GOODREADS_LIST = '176815309';
const UA = 'michielrollier.be sync script (+https://michielrollier.be)';
const root = fileURLToPath(new URL('..', import.meta.url));
const content = (f) => path.join(root, 'src', 'content', f);
const coverDir = (kind) => path.join(root, 'public', 'covers', kind);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDate = (s) => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toISOString().slice(0, 10) : null; };

async function get(url, accept = 'application/json') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
    if (res.status === 429) { await sleep(1000 * (+res.headers.get('retry-after') || 60)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return accept === 'application/json' ? res.json() : res.text();
  }
  throw new Error(`rate limited: ${url}`);
}

// ---- Discogs -------------------------------------------------------------------------------------
// Public collection API, no key needed. 25 requests/minute unauthenticated; the collection is a handful of pages.
const cleanName = (n) => n.replace(/\s\(\d+\)$/, '');
function artistLine(artists = []) {
  let out = '';
  artists.forEach((a, i) => {
    out += cleanName(a.anv || a.name);
    const j = (a.join || '').trim();
    if (i < artists.length - 1) out += j === ',' || j === '' ? ', ' : ` ${j} `;
  });
  return out || 'Unknown artist';
}
const SIZES = ['12"', '10"', '7"', 'LP', 'EP', 'Cass', 'CD'];
async function discogs() {
  const out = new Map();
  for (let page = 1, pages = 1; page <= pages; page++) {
    const d = await get(`https://api.discogs.com/users/${DISCOGS_USER}/collection/folders/0/releases?per_page=100&sort=added&sort_order=desc&page=${page}`);
    pages = d.pagination.pages;
    for (const r of d.releases) {
      const b = r.basic_information;
      if (out.has(String(b.id))) continue; // the same release filed twice
      const f = b.formats?.[0] ?? {};
      const size = (f.descriptions || []).find((x) => SIZES.includes(x));
      out.set(String(b.id), {
        id: String(b.id),
        artist: artistLine(b.artists),
        title: b.title,
        label: b.labels?.[0]?.name ? cleanName(b.labels[0].name) : undefined,
        catno: b.labels?.[0]?.catno && b.labels[0].catno !== 'none' ? b.labels[0].catno : undefined,
        year: b.year || undefined,
        format: [f.name, size].filter(Boolean).join(' '),
        styles: b.styles || [],
        url: `https://www.discogs.com/release/${b.id}`,
        added: isoDate(r.date_added),
        image: b.thumb || null, // 150 px thumbnail, replaced by the local path below
      });
    }
    process.stdout.write(`discogs page ${page}/${pages}\r`);
  }
  console.log(`discogs: ${out.size} releases`);
  return [...out.values()];
}

// ---- Goodreads -----------------------------------------------------------------------------------
// The API is gone (2020) but every public shelf still has an RSS feed, 100 items per page.
const entity = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39|#(\d+));/g, (m, k, n) =>
  ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[k] ?? String.fromCodePoint(+n));
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  const cdata = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : entity(m[1])).trim();
};
async function goodreads() {
  const out = new Map();
  for (const shelf of ['read', 'currently-reading', 'to-read']) {
    let n = 0;
    for (let page = 1; ; page++) {
      const xml = await get(`https://www.goodreads.com/review/list_rss/${GOODREADS_LIST}?shelf=${shelf}&page=${page}`, 'application/rss+xml');
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const it of items) {
        const id = tag(it, 'book_id');
        if (!id || out.has(id)) continue;
        const image = tag(it, 'book_large_image_url');
        out.set(id, {
          id,
          title: tag(it, 'title'),
          author: tag(it, 'author_name').replace(/\s+/g, ' '),
          shelf,
          shelves: tag(it, 'user_shelves').split(',').map((s) => s.trim()).filter(Boolean),
          rating: +tag(it, 'user_rating') || 0,
          readAt: isoDate(tag(it, 'user_read_at')) ?? undefined,
          added: isoDate(tag(it, 'user_date_added')),
          published: +tag(it, 'book_published') || undefined,
          pages: +tag(it, 'num_pages') || undefined,
          url: `https://www.goodreads.com/book/show/${id}`,
          // Covers only for books actually read; the pile is a text list.
          image: image && !image.includes('/nophoto/') && shelf !== 'to-read' ? image : null,
        });
        n++;
      }
      if (items.length < 100) break;
    }
    console.log(`goodreads: ${n} on ${shelf}`);
  }
  return [...out.values()];
}

// ---- covers --------------------------------------------------------------------------------------
// Downloaded once into public/, so visitors never hit Discogs or Goodreads. Missing = re-downloaded, unreferenced = deleted.
// Goodreads serves anything up to multi-megabyte scans; sharp (already installed by Astro) shrinks them to a wall-sized JPEG.
const sharp = await import('sharp').then((m) => m.default).catch(() => null);
async function shrink(buf, kind) {
  if (!sharp || kind !== 'books') return buf;
  return sharp(buf).resize({ height: 360, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}
function dimensions(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; // PNG
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
async function covers(kind, items) {
  const dir = coverDir(kind);
  await mkdir(dir, { recursive: true });
  const keep = new Set();
  let fetched = 0, failed = 0;
  const queue = items.filter((x) => x.image);
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let x; (x = queue.shift()); ) {
      const file = path.join(dir, `${x.id}.jpg`);
      if (!existsSync(file)) {
        try {
          const res = await fetch(x.image, { headers: { 'User-Agent': UA } });
          if (!res.ok) throw new Error(res.status);
          await writeFile(file, await shrink(Buffer.from(await res.arrayBuffer()), kind));
          fetched++;
        } catch (e) {
          failed++; console.warn(`  cover ${kind}/${x.id}: ${e.message}`); x.image = null; continue;
        }
      }
      const dim = dimensions(await readFile(file));
      if (!dim) { await unlink(file); x.image = null; failed++; continue; }
      keep.add(`${x.id}.jpg`);
      x.cover = `/covers/${kind}/${x.id}.jpg`; x.w = dim.w; x.h = dim.h;
    }
  }));
  let pruned = 0;
  for (const f of await readdir(dir)) if (!keep.has(f)) { await unlink(path.join(dir, f)); pruned++; }
  for (const x of items) { if (!x.cover) x.cover = null; delete x.image; }
  console.log(`${kind} covers: ${keep.size} kept, ${fetched} new, ${failed} missing, ${pruned} pruned`);
}

async function save(file, items) {
  const clean = items.map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)));
  await writeFile(content(file), JSON.stringify(clean, null, 2) + '\n');
  console.log(`wrote src/content/${file} (${clean.length})`);
}

let ok = true;
try {
  const records = (await discogs()).sort((a, b) => (b.added ?? '').localeCompare(a.added ?? ''));
  await covers('discogs', records);
  await save('records.json', records);
} catch (e) { ok = false; console.error('discogs failed, keeping the old records.json:', e.message); }
try {
  const books = await goodreads();
  await covers('books', books);
  await save('books.json', books);
} catch (e) { ok = false; console.error('goodreads failed, keeping the old books.json:', e.message); }
process.exit(ok ? 0 : 1);
