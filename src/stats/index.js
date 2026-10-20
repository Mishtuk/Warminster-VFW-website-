// Cookieless statistics: page views, visitors, top pages and referrers per day, counted by the server from HTML page requests.
// A visitor code = sha256(today's salt + host + IP + browser); the salt lives in memory for one Eastern day and is never written down,
// so a code can't be reversed or followed across days. Only daily totals are stored (table stats_daily). Hall inquiries come from their own table.
import { createHash, randomBytes } from 'node:crypto';
import { etDay } from '../lib/state.js';
import { COOKIE, SECURE_COOKIE, pickIp } from '../auth.js';

// Things that aren't people. Cheap and honest, not exhaustive.
const BOT = /bot|crawl|spider|slurp|scrap|preview|curl|wget|python|httpclient|java\/|go-http|okhttp|axios|node-fetch|monitor|uptime|pingdom|headless|lighthouse|facebookexternalhit|embedly|whatsapp|scan/i;
export const isBot = (ua) => !ua || ua.length < 12 || BOT.test(ua);
export const RANGES = { '7d': 6, '30d': 29, '90d': 89, '365d': 364 };

const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const header = (r, name) => String((typeof r?.headers?.get === 'function' ? r.headers.get(name) : r?.headers?.[name]) ?? '');

export function createStats({ db, log = () => {}, now: clock = () => new Date() }) {
  const q = (sql) => db.prepare(sql);
  let today = { day: '', salt: null, seen: new Set() };
  function visitor(req, now) {
    const day = etDay(now);
    if (today.day !== day) today = { day, salt: randomBytes(32), seen: new Set() };
    if (today.seen.size > 50000) return { fresh: false, day }; // flood guard: stop counting new visitors for today
    const ip = pickIp(header(req, 'x-forwarded-for'), req.socket?.remoteAddress);
    const id = createHash('sha256').update(today.salt).update(`|${header(req, 'host')}|${ip}|${header(req, 'user-agent')}`).digest('base64url').slice(0, 22);
    const fresh = !today.seen.has(id);
    if (fresh) today.seen.add(id);
    return { fresh, day };
  }
  const add = (day, metric, item = '') => q('INSERT INTO stats_daily (day, metric, item, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, metric, item) DO UPDATE SET n = n + 1').run(day, metric, item);

  /** Count a page view. Call after serving an HTML response. GET 200 HTML only, never /admin or /api, never the signed-in admin. */
  function record(req, res) {
    try {
      if ((req.method ?? 'GET') !== 'GET' || (res.status ?? res.statusCode ?? 200) !== 200) return false;
      const type = String((typeof res.getHeader === 'function' ? res.getHeader('content-type') : header(res, 'content-type')) ?? '');
      if (type && !type.includes('text/html')) return false;
      let path = new URL(req.url, 'http://x').pathname.toLowerCase();
      path = path.length > 1 ? path.replace(/\/(index\.html)?$/, '') || '/' : path;
      if (path.length > 100 || !/^\/[a-z0-9/_-]*$/.test(path) || /^\/(admin|api)(\/|$)/.test(path)) return false;
      const ua = header(req, 'user-agent');
      if (new RegExp(`(^|;\\s*)(${COOKIE}|${SECURE_COOKIE})=`).test(header(req, 'cookie')) || header(req, 'sec-gpc') === '1' || header(req, 'dnt') === '1' || isBot(ua)
        || /prefetch|prerender/i.test(header(req, 'sec-purpose') + header(req, 'purpose'))) return false;
      const v = visitor(req, clock());
      add(v.day, 'views');
      add(v.day, 'page', path);
      if (v.fresh) {
        add(v.day, 'visitors');
        let ref = '';
        try { ref = new URL(header(req, 'referer')).host.replace(/^www\./, ''); } catch {}
        if (ref && ref !== header(req, 'host').replace(/^www\./, '') && q("SELECT COUNT(*) n FROM stats_daily WHERE day = ? AND metric = 'ref'").get(v.day).n < 200) add(v.day, 'ref', ref.slice(0, 80));
      }
      return true;
    } catch (e) { log(`stats: ${e.message}`); return false; } // counting must never break a page
  }

  const sum = (metric, a, b) => q('SELECT COALESCE(SUM(n), 0) n FROM stats_daily WHERE metric = ? AND day BETWEEN ? AND ?').get(metric, a, b).n;
  const top = (metric, a, b) => q('SELECT item, SUM(n) n FROM stats_daily WHERE metric = ? AND day BETWEEN ? AND ? GROUP BY item ORDER BY n DESC, item LIMIT 8').all(metric, a, b);

  /** Totals for the last N days (range key 7d/30d/90d/365d), a per-day series with zeros filled in, top pages and referrers, inquiry counts. */
  function summary(range = '30d') {
    const end = etDay(clock());
    const start = addDays(end, -(RANGES[range] ?? RANGES['30d']));
    const by = Object.fromEntries(q("SELECT day, SUM(n) n FROM stats_daily WHERE metric = 'visitors' AND day BETWEEN ? AND ? GROUP BY day").all(start, end).map((r) => [r.day, r.n]));
    const series = [];
    for (let d = start; d <= end; d = addDays(d, 1)) series.push({ day: d, n: by[d] ?? 0 });
    const inq = q('SELECT COUNT(*) n FROM inquiries WHERE day BETWEEN ? AND ?').get(start, end);
    return {
      range: RANGES[range] === undefined ? '30d' : range, start, end, views: sum('views', start, end), visitors: sum('visitors', start, end), series,
      pages: top('page', start, end).map((p) => ({ path: p.item, n: p.n })), referrers: top('ref', start, end).map((p) => ({ host: p.item, n: p.n })),
      inquiries: { inRange: inq.n, new: q('SELECT COUNT(*) n FROM inquiries WHERE handled = 0').get().n, total: q('SELECT COUNT(*) n FROM inquiries').get().n },
    };
  }
  return { record, summary };
}
