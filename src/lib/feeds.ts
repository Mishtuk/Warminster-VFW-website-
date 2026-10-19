// Veteran-world headlines, read at build time. A dead feed never fails the build: each fetch has a 6 s timeout and errors are swallowed.
export interface FeedItem { title: string; link: string; date: Date; source: string }

const FEEDS = [
  { source: 'VA News', url: 'https://news.va.gov/feed' },
  { source: 'VA Press Room', url: 'https://news.va.gov/press-room/feed' },
  { source: 'DVIDS', url: 'https://www.dvidshub.net/rss/news' },
  { source: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml' },
];

/** Shown whenever no feed answers. */
export const FALLBACK_LINKS = [
  { title: 'VA News', note: 'news.va.gov', url: 'https://news.va.gov/' },
  { title: 'VFW national news releases', note: 'vfw.org', url: 'https://www.vfw.org/media-and-events/latest-releases' },
  { title: 'VA benefits and health care', note: 'va.gov', url: 'https://www.va.gov/' },
  { title: 'Military Times', note: 'militarytimes.com', url: 'https://www.militarytimes.com/' },
  { title: 'DVIDS military news', note: 'dvidshub.net', url: 'https://www.dvidshub.net/' },
];

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (NAMED[k]) return NAMED[k];
    const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  })
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

async function read(f: { source: string; url: string }): Promise<FeedItem[]> {
  try {
    const res = await fetch(f.url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; VFWPost6493-site)' } });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].slice(0, 12).flatMap((m) => {
      const title = decode(tag(m[0], 'title') ?? '');
      const link = decode(tag(m[0], 'link') ?? '');
      const date = new Date(decode(tag(m[0], 'pubDate') ?? ''));
      return title && /^https?:\/\//.test(link) && !isNaN(+date) ? [{ title, link, date, source: f.source }] : [];
    });
  } catch { return []; }
}

/** ~8 latest items, at most 3 per source. Empty array when every feed fails. */
export async function latestVeteranNews(total = 8): Promise<FeedItem[]> {
  const all = (await Promise.all(FEEDS.map(read))).flatMap((items) => items.sort((a, b) => +b.date - +a.date).slice(0, 3));
  return all.sort((a, b) => +b.date - +a.date).slice(0, total);
}
