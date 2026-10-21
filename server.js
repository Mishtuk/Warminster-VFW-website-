// The whole website server (`node server.js`): serves the static Astro build in dist/, fills admin-edited content into the HTML at
// <!--vfw:*--> markers, answers /api/*, and runs the single admin sign-in. No framework; Node 22+ built-ins and nodemailer only.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import { openDb, getState, setState, backup, purgeInquiries, retentionDays, purgeHelp, purgeOrders, purgeShifts, purgeHall, getSettings, setSettings, shiftsWithCounts, getContent, setContent } from './src/db.js';
import { clean, createAudit } from './src/audit.js';
import {
  allow, adminRow, checkLogin, clearFailures, clientIp, cookieHeader, dataDirProblem, defaultInUse, locked, readCookie, recordFailure, sameOrigin, seedAdmin, setPassword,
  signSession, startupProblem, verifySession, SESSION_DAYS,
} from './src/auth.js';
import { etDay, HELP_KINDS, injectMarkers, specialOrder, validateEvent, validateHallBooking, validateHelp, validateHonor, validateMenu, validateNews, validateOrder, validateProduct, validateSettings, validateShift, validateSignup, validateSpecial, validateTap } from './src/lib/state.js';
import { createInquiryHandler, createMailer, HONEYPOT } from './src/email/index.js';
import { createStats } from './src/stats/index.js';
import { createSiteBuilder } from './src/site-build.js';
import { POST_DEFAULTS, POST_FIELDS, setPost, validatePost } from './src/lib/post.js';

const ROOT = import.meta.dirname;
const PROD = process.env.NODE_ENV === 'production';
if (!PROD && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const env = process.env;
const PORT = env.PORT === undefined ? 8080 : Number(env.PORT);
const startup = startupProblem(env, PROD);
if (startup) { console.error(`Refusing to start: ${startup}`); process.exit(1); }
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DIST = env.DIST_DIR || join(ROOT, 'dist');
const DATA = env.DATA_DIR || (PROD ? '/home/data' : join(ROOT, '.data'));
/** Production with no SESSION_SECRET set: a random key made on first start and kept in the data folder (never served), so nobody has to type one in. */
function keptSecret(f) {
  try { const s = readFileSync(f, 'utf8').trim(); if (s.length >= 32) return s; } catch {}
  mkdirSync(DATA, { recursive: true });
  const s = randomBytes(32).toString('hex');
  writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SESSION_SECRET = env.SESSION_SECRET || (PROD ? keptSecret(join(DATA, 'session-secret')) : randomBytes(32).toString('hex')); // dev: new secret each start, so sessions end on restart
const log = (...a) => console.log(new Date().toISOString(), ...a);

// News photos: the built ones in dist/media/photos plus admin uploads in DATA/photos (dist is wiped on every build). Folders are read when
// needed, so new files are picked up without a restart.
// ponytail: one readdir per folder per page view (about 100 names); cache by folder mtime if the folders ever get large.
const PHOTOS = join(DATA, 'photos');
const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
const photoFiles = () => new Set([...ls(join(site.live(), 'media', 'photos')), ...ls(PHOTOS)]);
// Uploads are re-encoded with sharp when it loads (it ships with astro, but is not our dependency), otherwise only validated.
const sharp = (await import('sharp').catch(() => null))?.default ?? null;
log(sharp ? 'upload: sharp found, re-encoding pictures to WebP' : 'upload: sharp missing, validate-only');
const pickablePhotos = (set) => [...set].filter((f) => !f.includes('-400.') && !f.includes('-800.') && !f.includes('-full.')).sort();

const dirProblem = dataDirProblem(DATA, DIST, join(ROOT, '.env'));
if (dirProblem) { console.error(`Refusing to start: ${dirProblem}`); process.exit(1); }

const db = openDb(DATA);
// Staff edits to baked-in content (Admin > Post details): saved in the database, then the site is rebuilt into DATA/site and served
// from there (src/site-build.js). Until a rebuild has finished, the deployed dist/ is served. POST is refreshed in memory at once.
const site = createSiteBuilder({ root: ROOT, data: DATA, dist: DIST, log, getContent: () => getContent(db) });
setPost(getContent(db).post);
site.start();
/** Saves one content key, refreshes what the server renders live, and rebuilds the static pages. For every self-service view. */
function saveContent(name, value) {
  setContent(db, name, value);
  if (name === 'post') setPost(value);
  site.rebuild();
  return site.status();
}
const audit = createAudit({ db, log });
const stats = createStats({ db, log });
const submitInquiry = createInquiryHandler({ db, env, dataDir: DATA, log, audit: audit.event });
const RETENTION = retentionDays(env.INQUIRY_RETENTION_DAYS), SHOP_RETENTION = retentionDays(env.SHOP_RETENTION_DAYS);
const sendMail = createMailer({ env, dataDir: DATA, log });
const purge = () => {
  try { const n = purgeInquiries(db, RETENTION); if (n) audit.event('inquiries_purged', 'system', '', `${n} older than ${RETENTION} days`); } catch (e) { log('purge failed', e.message); }
  try { const n = purgeShifts(db, etDay(new Date(Date.now() - 7 * 864e5))); if (n) audit.event('shifts_purged', 'system', '', `${n} shifts, a week after the date`); } catch (e) { log('shift purge failed', e.message); }
  try { const n = purgeOrders(db, SHOP_RETENTION); if (n) audit.event('orders_purged', 'system', '', `${n} older than ${SHOP_RETENTION} days`); } catch (e) { log('order purge failed', e.message); }
  try { const n = purgeHall(db, etDay(new Date(Date.now() - 30 * 864e5))); if (n) audit.event('hall_purged', 'system', '', `${n} dates, 30 days after the date`); } catch (e) { log('hall purge failed', e.message); }
  try { const n = purgeHelp(db); if (n) audit.event('help_purged', 'system', '', `${n} older than 90 days`); } catch (e) { log('help purge failed', e.message); }
};
purge();
setInterval(purge, 24 * 3600e3).unref();

// First run: the admin account, and seed content from src/content/*.json. Never invented here.
const first = seedAdmin(db, { allowDefault: env.ALLOW_DEFAULT_ADMIN === '1', password: env.ADMIN_PASSWORD });
if (first) log(first.generated ? `Created the admin account. Username: ${first.username}  Password: ${first.password}  (shown once; change it in Admin > Account)` : `Created the admin account: ${first.username} (${env.ALLOW_DEFAULT_ADMIN === '1' ? 'password admin, testing only' : 'password from ADMIN_PASSWORD'}).`);
if (defaultInUse(db)) log('Warning: the default admin/admin password is in use (ALLOW_DEFAULT_ADMIN=1). Change it before launch.');
{
  const state = getState(db);
  let changed = false;
  for (const [key, check] of [['events', validateEvent], ['specials', validateSpecial], ['news', validateNews], ['menu', validateMenu], ['taps', validateTap], ['honor', validateHonor]]) {
    const f = join(env.SEED_DIR || join(ROOT, 'src/content'), `${key}.json`);
    if (state[key] !== undefined || !existsSync(f)) continue;
    try {
      const seed = JSON.parse(readFileSync(f, 'utf8'));
      if (key === 'menu') { const v = check(seed); if (!v.error) { state.menu = v.value; changed = true; } continue; }
      const photos = photoFiles();
      state[key] = seed.map((x) => { const v = check(x, { photos }); return v.error === 'photo' ? check({ ...x, photo: '' }) : v; }).filter((v) => v.value).map((v) => v.value); // a missing seed photo is dropped, not the item
      changed = true;
    } catch (e) { log(`seed ${key}.json skipped: ${e.message}`); }
  }
  if (changed) { setState(db, state); log('Imported seed content from src/content/*.json'); }
}
const runBackup = () => { try { backup(db, DATA); } catch (e) { log('backup failed', e.message); } };
runBackup();
setInterval(runBackup, 3600e3).unref();

// ---------- responses ----------
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const bad = (error, status = 400) => json({ error }, status);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ics': 'text/calendar; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf' };
const TEXT = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

// Security headers go on EVERY response, errors included. The CSP lists a hash for each inline script (and inline on*= handler) found in the
// page being sent, so Astro's inline scripts run but injected script text would not. Inline styles stay allowed (style-src 'unsafe-inline').
const sha = (t) => `'sha256-${createHash('sha256').update(t).digest('base64')}'`;
const unent = (t) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function csp(html = '') {
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => sha(m[1]));
  const attrs = [...html.matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => sha(unent(m[1])));
  return ["default-src 'self'", `script-src 'self' ${scripts.join(' ')}`.trim(), `script-src-attr ${attrs.length ? `'unsafe-hashes' ${attrs.join(' ')}` : "'none'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "media-src 'self'", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'"].join('; ');
}
function baseHeaders(url, html) {
  const h = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()', 'Content-Security-Policy': csp(html) };
  if (url.protocol === 'https:') h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}
function compress(nreq, buf, type, headers) {
  if (!TEXT.test(type) || buf.length < 1024) return buf;
  const ae = String(nreq.headers['accept-encoding'] ?? '');
  headers.Vary = 'Accept-Encoding';
  if (/\bbr\b/.test(ae)) { headers['Content-Encoding'] = 'br'; return brotliCompressSync(buf, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }); }
  if (/\bgzip\b/.test(ae)) { headers['Content-Encoding'] = 'gzip'; return gzipSync(buf); }
  return buf;
}
async function send(nreq, nres, url, r) {
  const headers = baseHeaders(url);
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) headers['Set-Cookie'] = cookies;
  let body = r.body ? Buffer.from(await r.arrayBuffer()) : null;
  if (body) body = compress(nreq, body, headers['content-type'] ?? '', headers);
  nres.writeHead(r.status, headers);
  nres.end(nreq.method === 'HEAD' ? undefined : body);
}

// ---------- static files ----------
const statSafe = (f) => { try { return statSync(f); } catch { return null; } };
function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  const root = site.live(), file = normalize(join(root, p));
  return file === root || file.startsWith(root + sep) ? file : null;
}
function notFound(nreq, nres, url) {
  const f = join(site.live(), '404.html');
  const body = existsSync(f) ? readFileSync(f) : undefined;
  nres.writeHead(404, { ...baseHeaders(url, body?.toString('utf8')), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); // hashes the 404 page's own inline scripts
  nres.end(nreq.method === 'HEAD' ? undefined : body);
}
/** Public shape of the open shifts and the public part of the settings, only when the page has a marker that needs them. Never sign-ups, never responderEmail. */
function publicExtras(html, url) {
  const out = {};
  if (/<!--vfw:(volunteer-board|tv-slides)-->/.test(html)) {
    const today = etDay();
    out.shifts = shiftsWithCounts(db).filter((s) => s.enabled && s.date >= today).map(({ filled, enabled, ...s }) => ({ ...s, left: Math.max(0, s.slots - filled) }));
  }
  if (/<!--vfw:hall-calendar-->/.test(html)) { // dates and status only; the staff note never leaves the database
    out.hall = { bookings: db.prepare('SELECT date, status FROM hall_bookings WHERE date >= ? ORDER BY date').all(etDay()).map(({ date, status }) => ({ date, status })), month: url?.searchParams.get('cal') };
  }
  if (/<!--vfw:(help-form|donate-link)-->/.test(html)) { const { helpEnabled, responderName, responderRole, donateUrl, donateLabel } = getSettings(db); out.settings = { helpEnabled, responderName, responderRole, donateUrl, donateLabel }; }
  return out;
}
async function serveStatic(nreq, nres, url) {
  const p = url.pathname;
  // Dotfiles and dot-folders (.env, .git, .data ...) are never served; only /.well-known/ is allowed.
  let decoded = p;
  try { decoded = decodeURIComponent(p); } catch { return notFound(nreq, nres, url); }
  if (decoded.split('/').some((seg, i, all) => seg.startsWith('.') && !(seg === '.well-known' && i === 1 && all.length > 2))) return notFound(nreq, nres, url);
  let file = resolveFile(p);
  let st = file && statSafe(file);
  if (st?.isDirectory()) {
    if (!p.endsWith('/')) { nres.writeHead(301, { ...baseHeaders(url), Location: `/${p.replace(/^\/+/, '')}/${url.search}` }); return nres.end(); }
    file = join(file, 'index.html');
    st = statSafe(file);
  }
  const up = !st?.isFile() && /^\/media\/photos\/(news-\d{8}-[0-9a-f]{6}(-800)?\.webp)$/.exec(decoded); // uploaded pictures live in DATA/photos
  if (up) { const f = join(PHOTOS, up[1]); if (f.startsWith(PHOTOS + sep) && statSafe(f)?.isFile()) { file = f; st = statSafe(f); } }
  if (!st?.isFile()) return notFound(nreq, nres, url);
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const headers = { ...baseHeaders(url), 'Content-Type': type };

  if (type.startsWith('text/html')) {
    const isAdmin = p.startsWith('/admin');
    let html = readFileSync(file, 'utf8');
    const isTv = /^\/tv(\/|$)/.test(p);
    if (!isAdmin) { try { html = injectMarkers(html, getState(db), etDay(), url.searchParams.get('year'), { photos: photoFiles(), ...publicExtras(html, url) }); } catch (e) { log('inject failed, serving the static page', e.message); } } // fail open: static HTML is a correct default
    headers['Cache-Control'] = isAdmin || isTv ? 'no-store' : 'no-cache';
    if (isAdmin || isTv) headers['X-Robots-Tag'] = 'noindex, nofollow';
    Object.assign(headers, baseHeaders(url, html)); // CSP hashes for this page's inline scripts
    const body = compress(nreq, Buffer.from(html), type, headers);
    nres.writeHead(200, headers);
    if (!isAdmin && !isTv) stats.record(nreq, nres); // the bar TV refreshes all night: not a page view
    return nres.end(nreq.method === 'HEAD' ? undefined : body);
  }
  headers['Cache-Control'] = p.startsWith('/_astro/') || file.startsWith(PHOTOS + sep) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
  headers['Last-Modified'] = st.mtime.toUTCString();
  if (nreq.headers['if-modified-since'] && new Date(nreq.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) { nres.writeHead(304, headers); return nres.end(); }
  if (TEXT.test(type)) {
    const body = compress(nreq, readFileSync(file), type, headers);
    nres.writeHead(200, headers);
    return nres.end(nreq.method === 'HEAD' ? undefined : body);
  }
  return sendRange(nreq, nres, file, st, headers);
}
/** Video needs byte ranges (iPhone Safari won't play an mp4 without them). */
function sendRange(nreq, nres, file, st, headers) {
  headers['Accept-Ranges'] = 'bytes';
  const range = /^bytes=(\d*)-(\d*)$/.exec(nreq.headers.range ?? '');
  let start = 0, end = st.size - 1, status = 200;
  if (range) {
    start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]);
    end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { nres.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` }); return nres.end(); }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  nres.writeHead(status, headers);
  if (nreq.method === 'HEAD') return nres.end();
  createReadStream(file, { start, end }).on('error', () => nres.destroy()).pipe(nres);
}

// ---------- sign-in ----------
const origins = (url) => [url.origin, PUBLIC_URL];
const sessionVersion = () => adminRow(db)?.session_v ?? 0;
const secure = (url) => PROD || url.protocol === 'https:';
const sessionCookie = (url) => cookieHeader(signSession(adminRow(db).username, Date.now() + SESSION_DAYS * 86400e3, SESSION_SECRET, sessionVersion()), { secure: secure(url) });
const signedIn = (req, url) => { const row = adminRow(db); return row ? verifySession(readCookie(req.headers.get('cookie'), secure(url)), SESSION_SECRET, { name: row.username, version: row.session_v }) : null; };

const WRONG = 'That username and password do not match. Check them and try again.';
async function login(req, url) {
  if (!sameOrigin(req, ...origins(url))) return bad('origin', 403);
  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? '').trim().toLowerCase().slice(0, 64);
  const ip = clientIp(req);
  // Lockout with backoff, per address and per username+address. Not per username alone: a stranger could lock the real admin out that way.
  const keys = [`ip:${ip}`, `user:${username}|${ip}`];
  if (keys.some((k) => locked(k))) { audit.event('login_blocked', username, ip, 'locked out, try refused'); return json({ error: 'locked', message: 'Too many tries. Wait a few minutes, then try again.' }, 429); }
  if (!(await checkLogin(db, username, String(b?.password ?? '').slice(0, 200)))) { // async scrypt: same cost for unknown names, never blocks other requests
    keys.forEach((k) => recordFailure(k));
    audit.event('login_fail', username, ip, 'wrong username or password');
    if (keys.some((k) => locked(k))) audit.event('lockout', username, ip, 'too many wrong tries, backing off');
    return json({ error: 'wrong', message: WRONG }, 401);
  }
  keys.forEach((k) => clearFailures(k));
  audit.event('login_ok', username, ip);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url) });
}

// ---------- API ----------
const FIELDS = { events: validateEvent, specials: validateSpecial, news: validateNews, products: validateProduct, taps: validateTap, honor: validateHonor };
const SORT = { events: (a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''), specials: specialOrder, news: (a, b) => b.date.localeCompare(a.date) }; // products have no sort: the array order is the display order

const HALL_PAGES = { __proto__: null, '/hall': '/hall/', '/hall/': '/hall/' };
/** Public hall form: JSON (fetch) gets JSON back; a plain browser form post gets a 303 back to the hall page (works without JS). */
async function hallInquiry(req, url) {
  const origin = req.headers.get('origin');
  if (origin && !origins(url).includes(origin)) return bad('origin', 403);
  const isJson = (req.headers.get('content-type') ?? '').includes('application/json');
  const fields = isJson ? await req.json().catch(() => null) : Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].map(([k, v]) => [k, String(v)]));
  const r = await submitInquiry(fields ?? {}, clientIp(req));
  if (isJson || (req.headers.get('accept') ?? '').includes('application/json')) return json(r.body, r.status);
  const page = HALL_PAGES[fields?._page] ?? '/hall/'; // allow-list: never redirect to a visitor-supplied path
  return new Response(null, { status: 303, headers: { Location: r.status === 200 ? `${page}?sent=1` : `${page}?error=${r.body.error}#inquiry`, 'Cache-Control': 'no-store' } });
}

/** Shared by the volunteer and help forms: JSON (fetch) gets JSON back, a plain form post gets a 303 to the page (allow-list, never a visitor-supplied path). */
async function publicForm(req, url, handle, pages, anchor) {
  const origin = req.headers.get('origin');
  if (origin && !origins(url).includes(origin)) return bad('origin', 403);
  const isJson = (req.headers.get('content-type') ?? '').includes('application/json');
  const fields = isJson ? await req.json().catch(() => null) : Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].map(([k, v]) => [k, String(v)]));
  const r = await handle(fields && typeof fields === 'object' ? fields : {}, clientIp(req));
  if (isJson || (req.headers.get('accept') ?? '').includes('application/json')) return json(r.body, r.status);
  const page = pages[fields?._page] ?? Object.values(pages)[0];
  return new Response(null, { status: 303, headers: { Location: r.status === 200 ? `${page}?sent=1${anchor}` : `${page}?error=${r.body.error}${anchor}`, 'Cache-Control': 'no-store' } });
}
const VOL_PAGES = { __proto__: null, '/volunteer': '/volunteer/', '/volunteer/': '/volunteer/' };
const HELP_PAGES = { __proto__: null, '/help': '/help/', '/help/': '/help/' };
const SHOP_PAGES = { __proto__: null, '/shop': '/shop/', '/shop/': '/shop/' };
const digits = (s) => String(s).replace(/\D/g, '');

async function volunteerSignup(f, ip) {
  if (String(f[HONEYPOT] ?? '').trim()) { audit.event('volunteer_honeypot', 'visitor', ip, 'hidden field filled, nothing stored'); return { status: 200, body: { ok: true } }; }
  const v = validateSignup(f);
  if (v.error) return { status: 400, body: { error: v.error } };
  if (!allow(`vol:ip:${ip}`, 10) || !allow('vol:all', 200)) { audit.event('volunteer_rate_limited', 'visitor', ip, 'too many sign-ups'); return { status: 429, body: { error: 'rate' } }; }
  const q = v.value;
  db.exec('BEGIN IMMEDIATE'); // count and insert together, so two people can't take the last spot
  try {
    const s = db.prepare('SELECT * FROM shifts WHERE id = ? AND enabled = 1').get(q.shift);
    let err = null;
    if (!s) err = 'shift';
    else if (s.date < etDay()) err = 'closed';
    else {
      const have = db.prepare('SELECT phone, email FROM shift_signups WHERE shift_id = ?').all(s.id);
      const dup = have.some((h) => (q.phone && digits(h.phone) === digits(q.phone)) || (q.email && h.email === q.email));
      if (!dup && have.length >= s.slots) err = 'full';
      else if (!dup) { db.prepare('INSERT INTO shift_signups (shift_id, at, name, phone, email) VALUES (?, ?, ?, ?, ?)').run(s.id, Date.now(), q.name, q.phone, q.email); audit.event('volunteer_signup', 'visitor', ip, s.title); }
    }
    db.exec('COMMIT');
    return err ? { status: 400, body: { error: err } } : { status: 200, body: { ok: true, shift: { title: s.title, date: s.date } } };
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

async function helpRequest(f, ip) {
  const set = getSettings(db);
  if (!set.helpEnabled || !set.responderName) return { status: 403, body: { error: 'off' } };
  if (String(f[HONEYPOT] ?? '').trim()) { audit.event('help_honeypot', 'visitor', ip, 'hidden field filled, nothing stored'); return { status: 200, body: { ok: true, responder: set.responderName } }; }
  const v = validateHelp(f);
  if (v.error) return { status: 400, body: { error: v.error } };
  if (!allow(`help:ip:${ip}`, 3) || !allow('help:all', 30)) { audit.event('help_rate_limited', 'visitor', ip, 'too many requests'); return { status: 429, body: { error: 'rate' } }; }
  const q = v.value, at = new Date();
  const r = db.prepare('INSERT INTO help_requests (at, day, name, phone, email, kind, best_time, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(+at, etDay(at), q.name, q.phone, q.email, q.kind, q.bestTime, q.message);
  audit.event('help_request', 'visitor', ip, '');
  const to = set.responderEmail || env.POST_EMAIL || (env.SMTP_URL ? '' : 'post@localhost.invalid');
  if (to) {
    try { // the message text is never emailed
      await sendMail({ to, subject: 'New help request on the post website', text: `New help request\n\nFrom: ${q.name.split(' ')[0]}\nHelp with: ${HELP_KINDS[q.kind]}\n${q.phone ? `Phone: ${q.phone}\n` : ''}${q.email ? `Email: ${q.email}\n` : ''}\nRead it in the website admin under Help requests.\n` });
      db.prepare('UPDATE help_requests SET emailed = 1 WHERE id = ?').run(r.lastInsertRowid);
    } catch (e) { log('help email failed:', e.message); }
  }
  return { status: 200, body: { ok: true, responder: set.responderName } };
}

/** Pickup order from the shop page: stored, then emailed to the post. The log never gets the customer's words. */
async function shopOrder(f, ip) {
  if (String(f[HONEYPOT] ?? '').trim()) { audit.event('shop_honeypot', 'visitor', ip, 'hidden field filled, nothing stored'); return { status: 200, body: { ok: true } }; }
  const v = validateOrder(f, getState(db).products);
  if (v.error) return { status: 400, body: { error: v.error } };
  if (!allow(`shop:ip:${ip}`, 5) || !allow('shop:all', 60)) { audit.event('shop_rate_limited', 'visitor', ip, 'too many orders'); return { status: 429, body: { error: 'rate' } }; }
  const q = v.value, at = new Date();
  const r = db.prepare('INSERT INTO shop_orders (at, day, product_id, product, option, price, qty, name, phone, email, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(+at, etDay(at), q.productId, q.product, q.option, q.price, q.qty, q.name, q.phone, q.email, q.note);
  audit.event('shop_order', 'visitor', ip, q.product);
  const to = env.POST_EMAIL || (env.SMTP_URL ? '' : 'post@localhost.invalid');
  if (to) {
    try {
      await sendMail({ to, subject: 'New shop order on the post website', text: `New shop order\n\nFrom: ${q.name.split(' ')[0]}\nOrder: ${q.qty} x ${q.product}${q.option ? ` - ${q.option}` : ''}\n${q.phone ? `Phone: ${q.phone}\n` : ''}${q.email ? `Email: ${q.email}\n` : ''}${q.note ? `Note: ${q.note}\n` : ''}\nRead it in the website admin under Shop.\n` });
      db.prepare('UPDATE shop_orders SET emailed = 1 WHERE id = ?').run(r.lastInsertRowid);
    } catch (e) { log('shop email failed:', e.message); }
  }
  return { status: 200, body: { ok: true, item: { name: q.product, option: q.option, qty: q.qty } } };
}

async function route(req, url) {
  const p = url.pathname;
  if (p === '/api/volunteer' && req.method === 'POST') return publicForm(req, url, volunteerSignup, VOL_PAGES, '#signup');
  if (p === '/api/help-request' && req.method === 'POST') return publicForm(req, url, helpRequest, HELP_PAGES, '#request');
  if (p === '/api/shop-order' && req.method === 'POST') return publicForm(req, url, shopOrder, SHOP_PAGES, '#order');
  if (p === '/api/hall-inquiry' && req.method === 'POST') return hallInquiry(req, url);
  if (p === '/api/login' && req.method === 'POST') return login(req, url);
  if (p === '/api/logout' && req.method === 'POST') {
    if (!sameOrigin(req, ...origins(url))) return bad('origin', 403);
    const who = signedIn(req, url);
    if (who) { db.prepare('UPDATE admin SET session_v = session_v + 1 WHERE id = 1').run(); audit.event('logout', who, clientIp(req), 'all sessions ended'); } // ends every session, so a copied cookie dies too
    return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', { secure: secure(url), maxAge: 0 }) });
  }
  if (p.startsWith('/api/admin/')) {
    const user = signedIn(req, url);
    if (!user) return bad('signed_out', 401);
    if (req.method !== 'GET' && !sameOrigin(req, ...origins(url))) return bad('origin', 403);
    return adminApi(req, url, user);
  }
  return bad('not_found', 404);
}

/** Width and height of a plain WebP, or null when it is not one: bad RIFF size, no VP8 chunk first, or an animation, EXIF or XMP chunk. */
function webpInfo(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP' || b.readUInt32LE(4) !== b.length - 8) return null;
  for (let o = 12, n; o + 8 <= b.length; o += 8 + n + (n & 1)) { n = b.readUInt32LE(o + 4); if (/^(ANIM|ANMF|EXIF|XMP )$/.test(b.toString('latin1', o, o + 4))) return null; }
  const t = b.toString('latin1', 12, 16);
  if (t === 'VP8 ') return b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a ? { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff } : null;
  if (t === 'VP8L') { const v = b.readUInt32LE(21); return b[20] === 0x2f ? { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 } : null; }
  return t === 'VP8X' ? { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 } : null;
}
const DATA_WEBP = /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/;
/** A base64 WebP data URL of exactly w x h, as bytes; otherwise the error key. The client's claimed type is ignored. */
async function takeWebp(v, w, h) {
  if (typeof v !== 'string' || !DATA_WEBP.test(v)) return 'file_type';
  let buf = Buffer.from(v.slice(23), 'base64');
  if (buf.length > 400 * 1024) return 'file_size';
  const i = webpInfo(buf);
  if (!i || i.w !== w || i.h !== h) return 'file_type';
  if (sharp) { try { buf = await sharp(buf).webp({ quality: 82 }).toBuffer(); } catch { return 'file_type'; } } // drops metadata and anything hidden in the file
  return buf;
}
async function uploadPhoto(body, ip, note, photoList) {
  const stop = (error, why, status = 400) => { note('photo_upload_blocked', why); return bad(error, status); };
  if (!allow(`up:${ip}`, 20)) return stop('rate', 'rate', 429);
  const big = await takeWebp(body?.big, 1024, 768), small = await takeWebp(body?.small, 800, 600);
  for (const x of [big, small]) if (typeof x === 'string') return stop(x, x === 'file_size' ? 'size' : 'type');
  const have = ls(PHOTOS).map((f) => statSafe(join(PHOTOS, f))?.size ?? 0);
  if (have.length >= 600 || have.reduce((a, b) => a + b, 0) + big.length + small.length > 100 * 1024 * 1024) { log('upload: quota reached'); return stop('upload', 'quota'); }
  mkdirSync(PHOTOS, { recursive: true, mode: 0o755 });
  let name;
  for (let i = 0; i < 3 && !name; i++) {
    const n = `news-${etDay().replaceAll('-', '')}-${randomBytes(3).toString('hex')}.webp`, wrote = [];
    try { for (const [f, b] of [[n.replace('.', '-800.'), small], [n, big]]) { writeFileSync(join(PHOTOS, f), b, { flag: 'wx', mode: 0o644 }); wrote.push(f); } name = n; } // small first, big last
    catch (e) { for (const f of wrote) try { unlinkSync(join(PHOTOS, f)); } catch {} if (e.code !== 'EEXIST') { log('upload: write failed', e.message); break; } }
  }
  if (!name) return bad('upload', 500);
  note('photo_upload', `${name} ${big.length} bytes`);
  return json({ name, photos: photoList() });
}

async function adminApi(req, url, user) {
  const [section, a1] = url.pathname.slice('/api/admin/'.length).split('/');
  const key = `${req.method} ${section}`;
  const body = ['POST', 'PUT'].includes(req.method) ? await req.json().catch(() => null) : null;
  const state = getState(db);
  const list = (name) => (state[name] ??= []);
  const emptyMenu = { hours: '', sections: [] };
  const ip = clientIp(req);
  const note = (what, detail = '') => audit.event(what, user, ip, detail); // who = the signed-in admin

  if (key === 'GET state') return json({ user, defaultPassword: defaultInUse(db), newHelp: db.prepare('SELECT COUNT(*) n FROM help_requests WHERE handled = 0').get().n, newOrders: db.prepare('SELECT COUNT(*) n FROM shop_orders WHERE handled = 0').get().n, products: list('products'), taps: list('taps'), honor: list('honor'), events: list('events'), specials: list('specials'), news: list('news'), menu: state.menu ?? emptyMenu, today: etDay(new Date()) });
  if (key === 'GET stats') return json(stats.summary(url.searchParams.get('range') ?? '30d'));
  const photoList = () => { const all = photoFiles(); return pickablePhotos(all).map((name) => ({ name, thumb: all.has(name.replace('.', '-800.')) ? name.replace('.', '-800.') : name })); };
  if (key === 'GET photos') return json({ photos: photoList() });
  if (key === 'POST photos') return uploadPhoto(body, ip, note, photoList);
  if (key === 'DELETE photos' && /^news-\d{8}-[0-9a-f]{6}\.webp$/.test(a1 ?? '')) { // only uploads; built photos are never touched
    if (list('news').some((n) => n.photo === a1) || list('products').some((n) => n.photo === a1) || list('honor').some((n) => n.photo === a1)) return bad('in_use', 409);
    if (!existsSync(join(PHOTOS, a1))) return bad('not_found', 404);
    for (const f of [a1, a1.replace('.', '-800.')]) try { unlinkSync(join(PHOTOS, f)); } catch {}
    note('photo_delete', a1);
    return json({ ok: true, photos: photoList() });
  }
  if (key === 'GET security') return json({ events: audit.recent(500) });

  if (Object.hasOwn(FIELDS, section) && ['PUT', 'DELETE'].includes(req.method)) { // /api/admin/<events|specials|news>/<id or "new">
    const items = list(section);
    if (a1 !== 'new' && !items.some((x) => x.id === a1)) return bad('not_found', 404);
    if (req.method === 'DELETE') { const gone = items.find((x) => x.id === a1); state[section] = items.filter((x) => x.id !== a1); setState(db, state); note(`${section}_delete`, gone.title ?? gone.label ?? gone.name); return json({ ok: true, items: state[section] }); }
    const v = FIELDS[section]({ ...body, id: a1 === 'new' ? undefined : a1 }, { photos: photoFiles() });
    if (v.error) return bad(v.error);
    const next = items.some((x) => x.id === v.value.id) ? items.map((x) => (x.id === v.value.id ? v.value : x)) : [...items, v.value]; // an edit keeps its place, a new one goes last
    state[section] = SORT[section] ? next.sort(SORT[section]) : next;
    setState(db, state);
    note(`${section}_${a1 === 'new' ? 'create' : 'update'}`, (v.value.title ?? v.value.label ?? v.value.name) + (v.value.enabled === false ? ' · hidden' : ''));
    return json({ item: v.value, items: state[section] });
  }
  for (const sec of ['products', 'taps', 'honor']) if (key === `PUT ${sec}-order`) { // the new order of the shop products or beer taps: exactly the ids that exist now
    const items = list(sec), ids = body?.ids;
    if (!Array.isArray(ids) || ids.length !== items.length || new Set(ids).size !== ids.length || !items.every((x) => ids.includes(x.id))) return bad('order');
    state[sec] = ids.map((i) => items.find((x) => x.id === i));
    setState(db, state);
    note(`${sec}_reorder`, '');
    return json({ items: state[sec] });
  }
  if (key === 'PUT menu') {
    const v = validateMenu(body);
    if (v.error) return bad(v.error);
    state.menu = v.value;
    setState(db, state);
    note('menu_update', `${v.value.sections.length} ${v.value.sections.length === 1 ? 'section' : 'sections'}`);
    return json({ menu: v.value });
  }

  if (key === 'GET inquiries') return json({ inquiries: db.prepare('SELECT * FROM inquiries ORDER BY id DESC LIMIT 500').all().map((r) => ({ ...r, handled: Boolean(r.handled), emailed: Boolean(r.emailed) })) });
  if ((key === 'PUT inquiries' || key === 'DELETE inquiries') && /^\d{1,12}$/.test(a1 ?? '')) {
    const who = db.prepare('SELECT name FROM inquiries WHERE id = ?').get(+a1)?.name ?? '';
    const r = req.method === 'PUT' ? db.prepare('UPDATE inquiries SET handled = ? WHERE id = ?').run(body?.handled ? 1 : 0, +a1) : db.prepare('DELETE FROM inquiries WHERE id = ?').run(+a1);
    if (r.changes) note(req.method === 'PUT' ? 'inquiry_update' : 'inquiry_delete', who + (req.method === 'PUT' ? (body?.handled ? ' · handled' : ' · new') : ''));
    return r.changes ? json({ ok: true }) : bad('not_found', 404);
  }

  // shop pickup orders (private; deleted after SHOP_RETENTION_DAYS, default 365)
  if (key === 'GET orders') return json({ orders: db.prepare('SELECT * FROM shop_orders ORDER BY id DESC LIMIT 500').all().map(({ id, at, product, option, price, qty, name, phone, email, note, handled, emailed }) => ({ id, at, product, option, price, qty, name, phone, email, note, handled: Boolean(handled), emailed: Boolean(emailed) })) });
  if ((key === 'PUT orders' || key === 'DELETE orders') && /^\d{1,12}$/.test(a1 ?? '')) {
    const what = db.prepare('SELECT product FROM shop_orders WHERE id = ?').get(+a1)?.product ?? '';
    const r = req.method === 'PUT' ? db.prepare('UPDATE shop_orders SET handled = ? WHERE id = ?').run(body?.handled ? 1 : 0, +a1) : db.prepare('DELETE FROM shop_orders WHERE id = ?').run(+a1);
    if (r.changes) note(req.method === 'PUT' ? 'order_update' : 'order_delete', what + (req.method === 'PUT' ? (body?.handled ? ' · handled' : ' · new') : ''));
    return r.changes ? json({ ok: true }) : bad('not_found', 404);
  }

  // hall booking calendar (staff only; the public page gets dates and status, never the note; dates 30 days past are purged daily)
  if (key === 'GET hall-bookings') return json({ bookings: db.prepare('SELECT date, status, note FROM hall_bookings WHERE date >= ? AND date <= ? ORDER BY date').all(etDay(), etDay(new Date(Date.now() + 366 * 864e5))).map(({ date, status, note }) => ({ date, status, note })), today: etDay() });
  if (key === 'PUT hall-bookings' || key === 'DELETE hall-bookings') {
    const v = validateHallBooking(a1, req.method === 'PUT' ? body : { status: 'booked' }, etDay());
    if (v.error) return bad(v.error);
    if (req.method === 'PUT') db.prepare('INSERT INTO hall_bookings (date, status, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at').run(v.value.date, v.value.status, v.value.note, Date.now());
    else db.prepare('DELETE FROM hall_bookings WHERE date = ?').run(v.value.date);
    note(req.method === 'PUT' ? 'hall_booking_set' : 'hall_booking_open', `${v.value.date} · ${req.method === 'PUT' ? v.value.status : 'open'}`);
    return json({ ok: true });
  }

  // volunteer shifts and who signed up
  const shiftList = () => { const so = db.prepare('SELECT id, shift_id, name, phone, email, at FROM shift_signups ORDER BY id').all(); return shiftsWithCounts(db).map((s) => ({ ...s, signups: so.filter((x) => x.shift_id === s.id).map(({ shift_id, ...x }) => x) })); };
  if (key === 'GET shifts') return json({ shifts: shiftList() });
  if (key === 'PUT shifts' && (a1 === 'new' || /^[a-z0-9]{4,24}$/.test(a1 ?? ''))) {
    const old = a1 === 'new' ? null : db.prepare('SELECT id FROM shifts WHERE id = ?').get(a1);
    if (a1 !== 'new' && !old) return bad('not_found', 404);
    const taken = old ? db.prepare('SELECT COUNT(*) n FROM shift_signups WHERE shift_id = ?').get(a1).n : 0;
    const v = validateShift({ ...body, id: old ? a1 : undefined }, etDay(), taken);
    if (v.error) return bad(v.error);
    const x = v.value;
    db.prepare('INSERT INTO shifts (id, title, date, start_time, end_time, slots, notes, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time, slots = excluded.slots, notes = excluded.notes, enabled = excluded.enabled')
      .run(x.id, x.title, x.date, x.start, x.end, x.slots, x.notes, x.enabled ? 1 : 0, Date.now());
    note(old ? 'shifts_update' : 'shifts_create', x.title + (x.enabled ? '' : ' · hidden'));
    return json({ item: x, shifts: shiftList() });
  }
  if (key === 'DELETE shifts' && /^[a-z0-9]{4,24}$/.test(a1 ?? '')) {
    const s = db.prepare('SELECT title FROM shifts WHERE id = ?').get(a1);
    if (!s) return bad('not_found', 404);
    db.exec('BEGIN');
    let n;
    try { n = Number(db.prepare('DELETE FROM shift_signups WHERE shift_id = ?').run(a1).changes); db.prepare('DELETE FROM shifts WHERE id = ?').run(a1); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    note('shifts_delete', `${s.title} · ${n} signed up removed`);
    return json({ ok: true, shifts: shiftList() });
  }
  if (key === 'DELETE signups' && /^\d{1,12}$/.test(a1 ?? '')) {
    const s = db.prepare('SELECT s.title FROM shift_signups g JOIN shifts s ON s.id = g.shift_id WHERE g.id = ?').get(+a1);
    const r = db.prepare('DELETE FROM shift_signups WHERE id = ?').run(+a1);
    if (r.changes) note('signup_remove', s?.title ?? '');
    return r.changes ? json({ ok: true }) : bad('not_found', 404);
  }

  // veteran help requests (private; deleted after 90 days)
  if (key === 'GET help') return json({ enabled: getSettings(db).helpEnabled, requests: db.prepare('SELECT * FROM help_requests ORDER BY id DESC LIMIT 500').all().map((r) => ({ id: r.id, at: r.at, day: r.day, name: r.name, phone: r.phone, email: r.email, kind: r.kind, kindLabel: HELP_KINDS[r.kind] ?? r.kind, bestTime: r.best_time, message: r.message, handled: Boolean(r.handled), emailed: Boolean(r.emailed) })) });
  if ((key === 'PUT help' || key === 'DELETE help') && /^\d{1,12}$/.test(a1 ?? '')) {
    const r = req.method === 'PUT' ? db.prepare('UPDATE help_requests SET handled = ? WHERE id = ?').run(body?.handled ? 1 : 0, +a1) : db.prepare('DELETE FROM help_requests WHERE id = ?').run(+a1);
    if (r.changes) note(req.method === 'PUT' ? 'help_update' : 'help_delete', req.method === 'PUT' ? (body?.handled ? 'handled' : 'new') : '');
    return r.changes ? json({ ok: true }) : bad('not_found', 404);
  }

  if (key === 'GET settings') return json({ settings: getSettings(db) });
  if (key === 'PUT settings') {
    const v = validateSettings(body);
    if (v.error) return bad(v.error);
    setSettings(db, v.value);
    note('settings_update', [v.value.helpEnabled ? 'help form on' : 'help form off', v.value.donateUrl ? 'donation link set' : 'no donation link'].join(', '));
    return json({ settings: v.value });
  }

  if (key === 'GET build') return json(site.status());
  if (key === 'GET content' && a1 === 'post') return json({ fields: POST_FIELDS, defaults: POST_DEFAULTS, value: { ...POST_DEFAULTS, ...getContent(db).post }, build: site.status() });
  if (key === 'PUT content' && a1 === 'post') {
    const v = validatePost(body);
    if (v.error) return json({ error: v.error, message: v.why }, 400);
    const before = { ...POST_DEFAULTS, ...getContent(db).post };
    const changed = Object.keys(v.value).filter((k) => JSON.stringify(v.value[k]) !== JSON.stringify(before[k]));
    note('post_details_update', changed.length ? changed.join(', ') : 'no changes');
    return json({ value: v.value, build: changed.length ? saveContent('post', v.value) : site.status() });
  }

  if (key === 'POST password') { // change password: prove it's you first
    if (!allow(`pw:${ip}`, 10)) { note('password_change_blocked', 'rate limit'); return bad('rate', 429); }
    if (!(await checkLogin(db, user, body?.current))) { note('password_change_fail', 'current password wrong'); return bad('current'); }
    const r = setPassword(db, body?.password);
    if (r.error) return bad(r.error);
    note('password_change', 'other sessions ended'); // session_v + 1 rotates the session; the cookie below is the new one
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url) }); // other sessions just ended (new session version); keep this one
  }
  return bad('not_found', 404);
}

// ---------- HTTP ----------
const MAX_BODY = 256 * 1024, MAX_PHOTO_BODY = 2 * 1024 * 1024;
function readBody(nreq, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    nreq.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('too large'), { status: 413 })); nreq.destroy(); } else chunks.push(c); });
    nreq.on('end', () => resolve(Buffer.concat(chunks)));
    nreq.on('error', reject);
  });
}

const server = createServer(async (nreq, nres) => {
  let url;
  try {
    const proto = String(nreq.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim() === 'https' ? 'https' : 'http'; // the host's proxy ends TLS
    url = new URL(nreq.url, `${proto}://${nreq.headers.host ?? 'localhost'}`);
  } catch { nres.writeHead(400, baseHeaders(new URL('http://localhost'))).end(); return; }
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(nreq.method)) { nres.writeHead(405, baseHeaders(url)).end(); return; }
      return await serveStatic(nreq, nres, url);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(nreq.headers)) for (const x of [v].flat()) headers.append(k, x);
    headers.set('x-vfw-peer', nreq.socket.remoteAddress ?? ''); // overwrites any copy the client sent; see clientIp()
    // Only a signed-in admin posting a picture may send up to 2 MB; everyone else gets 256 KB, checked before anything is buffered.
    const max = nreq.method === 'POST' && url.pathname === '/api/admin/photos' && signedIn({ headers: { get: (k) => nreq.headers[k] } }, url) ? MAX_PHOTO_BODY : MAX_BODY;
    if (Number(nreq.headers['content-length']) > max) throw Object.assign(new Error('too large'), { status: 413 });
    const body = ['GET', 'HEAD'].includes(nreq.method) ? undefined : await readBody(nreq, max);
    await send(nreq, nres, url, await route(new Request(url, { method: nreq.method, headers, body }), url));
  } catch (e) {
    if (e.status !== 413) log('error', clean(nreq.method, 10), clean(url.pathname, 200), clean(e.stack ?? e, 2000));
    if (!nres.headersSent) { nres.writeHead(e.status ?? 500, { ...baseHeaders(url), 'Content-Type': 'application/json' }); nres.end(JSON.stringify({ error: e.status === 413 ? 'too_large' : 'server' })); }
  }
});

server.headersTimeout = 10e3; // slow-connection guards
server.requestTimeout = 30e3;
server.listen(PORT, () => log(`VFW Post 6493 site on ${PUBLIC_URL} (port ${server.address().port}, data in ${DATA}${PROD ? '' : ', development'})`));
// Never die silently: a bad request is answered with 400, uncaught errors are logged and the process exits (the host restarts it),
// unhandled rejections are logged and the server keeps running.
server.on('clientError', (err, socket) => {
  log('clientError', clean(err.code ?? err.message, 100));
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  else socket.destroy();
});
process.on('uncaughtException', (e) => { log('uncaughtException, exiting', clean(e?.stack ?? e, 2000)); process.exit(1); });
process.on('unhandledRejection', (e) => log('unhandledRejection', clean(e?.stack ?? e, 2000)));
let stopping = false;
const stop = (sig) => {
  if (stopping) return;
  stopping = true;
  log(`${sig} received, shutting down`);
  server.close(() => { try { db.close(); } catch {} log('stopped'); process.exit(0); });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
