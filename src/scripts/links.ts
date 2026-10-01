// Every link that leaves the site opens in a new tab: an <a> whose href names another host gets target="_blank" and
// rel="noopener noreferrer" (added to any rel it has, such as "me"). Links on this site, relative or absolute, mail
// links and anchors that already say where to open are left alone. Pure, on a page's HTML; src/middleware.ts runs it on
// every page, in dev and in the build.
const HOME = /^(www\.)?michielrollier\.be$/i;

export function externalLinks(html: string): string {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const host = /\shref\s*=\s*["']?(?:https?:)?\/\/([^/"'\s>?#:]+)/i.exec(tag)?.[1];
    if (!host || HOME.test(host) || /\starget\s*=/i.test(tag)) return tag;
    const rel = /\srel\s*=\s*"([^"]*)"/i.exec(tag);
    const end = tag.endsWith('/>') ? -2 : -1;
    if (!rel) return `${tag.slice(0, end)} target="_blank" rel="noopener noreferrer"${tag.slice(end)}`;
    const words = new Set(rel[1].split(/\s+/).filter(Boolean).concat('noopener', 'noreferrer'));
    return tag.replace(rel[0], ` rel="${[...words].join(' ')}"`).replace(/^<a\b/i, '<a target="_blank"');
  });
}
