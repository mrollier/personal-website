// Links that leave the site open in a new tab (src/scripts/links.ts), on every page, whatever wrote the link: a
// component, a Markdown page or a data file.
import { defineMiddleware } from 'astro:middleware';
import { externalLinks } from './scripts/links';

export const onRequest = defineMiddleware(async (_, next) => {
  const res = await next();
  if (!res.headers.get('content-type')?.includes('text/html')) return res;
  return new Response(externalLinks(await res.text()), { status: res.status, statusText: res.statusText, headers: res.headers });
});
