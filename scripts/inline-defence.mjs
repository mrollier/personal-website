// After `astro build`: turn the built deck route into one self-contained file that runs by double-clicking,
// with no network request at all: dist/demos/defence/rollier-defence.html. Stylesheets become <style>, every
// module script of the page is bundled by esbuild into one classic script (one bundle, so the slides and the deck
// engine share a single copy of every module), and images, videos and CSS urls become data URIs. Run: npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = 'dist', from = join(dist, 'demos/defence/present/index.html'), to = join(dist, 'demos/defence/rollier-defence.html');
if (!existsSync(from)) throw new Error(`${from} is missing: run astro build first`);
let html = readFileSync(from, 'utf8');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const dataUri = (path) => `data:${MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(join(dist, path)).toString('base64')}`;
const local = (u) => u.startsWith('/') && !u.startsWith('//');

// Stylesheets, with their urls inlined.
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_, href) => {
  const css = readFileSync(join(dist, href), 'utf8').replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (m, q, u) => (local(u) ? `url(${dataUri(u)})` : m));
  return `<style>${css}</style>`;
});

// Every module script, external or inline, in document order, into one bundle.
const entries = [];
html = html.replace(/<script type="module"(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g, (_, src, body) => {
  if (src) entries.push(`import ${JSON.stringify('.' + src)};`);
  else if (body.trim()) { const f = `_astro/__inline_${entries.length}.js`; writeFileSync(join(dist, f), body); entries.push(`import ${JSON.stringify('./' + f)};`); }
  return '';
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
const out = await build({
  stdin: { contents: entries.join('\n'), resolveDir: dist, sourcefile: 'defence-entry.js', loader: 'js' },
  bundle: true, format: 'iife', target: ['firefox115', 'chrome110'], minify: true, write: false, legalComments: 'none',
});
const code = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
if (/\bimport\s*\(/.test(code)) throw new Error('the deck bundle still has a dynamic import, which a file:// page cannot load');
html = html.replace('</body>', `<script>${code}</script>\n</body>`);

// Images and videos.
html = html.replace(/(<(?:img|video)[^>]*\ssrc=")([^"]+)"/g, (m, pre, u) => (local(u) ? `${pre}${dataUri(u)}"` : m));

const left = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (left.length) throw new Error(`still pointing at the site: ${left.join(', ')}`);
writeFileSync(to, html);
console.log(`${to}: ${(html.length / 1024).toFixed(0)} kB, ${entries.length} scripts in one bundle`);
