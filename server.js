// The whole website server (`node server.js`): serves the static Astro build in dist/, fills admin-edited content into the HTML at
// <!--vfw:*--> markers, answers /api/*, and runs the single admin sign-in. No framework; Node 22+ built-ins and nodemailer only.
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import { openDb, getState, setState, backup } from './src/db.js';
import {
  allow, adminRow, checkLogin, clearFailures, clientIp, cookieHeader, defaultInUse, locked, readCookie, recordFailure, sameOrigin, seedAdmin, setPassword,
  signSession, verifySession, SESSION_DAYS,
} from './src/auth.js';
import { etDay, injectMarkers, validateEvent, validateMenu, validateNews, validateSpecial } from './src/lib/state.js';
import { createInquiryHandler } from './src/email/index.js';
import { createStats } from './src/stats/index.js';

const ROOT = import.meta.dirname;
const PROD = process.env.NODE_ENV === 'production';
if (!PROD && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const env = process.env;
const PORT = env.PORT === undefined ? 8080 : Number(env.PORT);
if (PROD && !env.SESSION_SECRET) { console.error('Refusing to start: set SESSION_SECRET.'); process.exit(1); }
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = env.SESSION_SECRET || randomBytes(32).toString('hex'); // dev: new secret each start, so sessions end on restart
const DIST = env.DIST_DIR || join(ROOT, 'dist');
const DATA = env.DATA_DIR || (PROD ? '/home/data' : join(ROOT, '.data'));
const log = (...a) => console.log(new Date().toISOString(), ...a);

const db = openDb(DATA);
const stats = createStats({ db, log });
const submitInquiry = createInquiryHandler({ db, env, dataDir: DATA, log });

// First run: the admin account, and seed content from src/content/*.json. Never invented here.
const first = seedAdmin(db, { allowDefault: env.ALLOW_DEFAULT_ADMIN === '1', password: env.ADMIN_PASSWORD });
if (first) log(first.generated ? `Created the admin account. Username: ${first.username}  Password: ${first.password}  (shown once; change it in Admin > Account)` : `Created the admin account: ${first.username} (${env.ALLOW_DEFAULT_ADMIN === '1' ? 'password admin, testing only' : 'password from ADMIN_PASSWORD'}).`);
if (defaultInUse(db)) log('Warning: the default admin/admin password is in use (ALLOW_DEFAULT_ADMIN=1). Change it before launch.');
{
  const state = getState(db);
  let changed = false;
  for (const [key, check] of [['events', validateEvent], ['specials', validateSpecial], ['news', validateNews], ['menu', validateMenu]]) {
    const f = join(ROOT, 'src/content', `${key}.json`);
    if (state[key] !== undefined || !existsSync(f)) continue;
    try {
      const seed = JSON.parse(readFileSync(f, 'utf8'));
      if (key === 'menu') { const v = check(seed); if (!v.error) { state.menu = v.value; changed = true; } continue; }
      state[key] = seed.map((x) => check(x)).filter((v) => v.value).map((v) => v.value);
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf' };
const TEXT = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

function baseHeaders(url) {
  const h = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };
  if (url.protocol === 'https:') h['Strict-Transport-Security'] = 'max-age=31536000';
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
  const file = normalize(join(DIST, p));
  return file === DIST || file.startsWith(DIST + sep) ? file : null;
}
function notFound(nreq, nres, url) {
  const f = join(DIST, '404.html');
  nres.writeHead(404, { ...baseHeaders(url), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  nres.end(nreq.method === 'HEAD' || !existsSync(f) ? undefined : readFileSync(f));
}
async function serveStatic(nreq, nres, url) {
  const p = url.pathname;
  let file = resolveFile(p);
  let st = file && statSafe(file);
  if (st?.isDirectory()) {
    if (!p.endsWith('/')) { nres.writeHead(301, { ...baseHeaders(url), Location: `${p}/${url.search}` }); return nres.end(); }
    file = join(file, 'index.html');
    st = statSafe(file);
  }
  if (!st?.isFile()) return notFound(nreq, nres, url);
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const headers = { ...baseHeaders(url), 'Content-Type': type };

  if (type.startsWith('text/html')) {
    const isAdmin = p.startsWith('/admin');
    let html = readFileSync(file, 'utf8');
    if (!isAdmin) { try { html = injectMarkers(html, getState(db), etDay(), url.searchParams.get('year')); } catch (e) { log('inject failed, serving the static page', e.message); } } // fail open: static HTML is a correct default
    headers['Cache-Control'] = isAdmin ? 'no-store' : 'no-cache';
    if (isAdmin) headers['X-Robots-Tag'] = 'noindex, nofollow';
    const body = compress(nreq, Buffer.from(html), type, headers);
    nres.writeHead(200, headers);
    if (!isAdmin) stats.record(nreq, nres);
    return nres.end(nreq.method === 'HEAD' ? undefined : body);
  }
  headers['Cache-Control'] = p.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
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
  createReadStream(file, { start, end }).pipe(nres);
}

// ---------- sign-in ----------
const origins = (url) => [url.origin, PUBLIC_URL];
const sessionVersion = () => adminRow(db)?.session_v ?? 0;
const sessionCookie = (url) => cookieHeader(signSession(adminRow(db).username, Date.now() + SESSION_DAYS * 86400e3, SESSION_SECRET, sessionVersion()), { secure: PROD || url.protocol === 'https:' });
const signedIn = (req) => { const row = adminRow(db); return row ? verifySession(readCookie(req.headers.get('cookie')), SESSION_SECRET, { name: row.username, version: row.session_v }) : null; };

const WRONG = 'That username and password do not match. Check them and try again.';
async function login(req, url) {
  if (!sameOrigin(req, ...origins(url))) return bad('origin', 403);
  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? '').trim().toLowerCase().slice(0, 64);
  const ip = clientIp(req);
  // Lockout after 5 failures, per IP and per username (whether or not it exists).
  if (locked(`ip:${ip}`) || locked(`user:${username}`)) return json({ error: 'locked', message: 'Too many tries. Wait 15 minutes, then try again.' }, 429);
  if (!checkLogin(db, username, String(b?.password ?? '').slice(0, 200))) {
    recordFailure(`ip:${ip}`);
    recordFailure(`user:${username}`);
    return json({ error: 'wrong', message: WRONG }, 401);
  }
  clearFailures(`user:${username}`);
  log('admin signed in');
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url) });
}

// ---------- API ----------
const FIELDS = { events: validateEvent, specials: validateSpecial, news: validateNews };
const SORT = { events: (a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''), specials: (a, b) => a.label.localeCompare(b.label), news: (a, b) => b.date.localeCompare(a.date) };

/** Public hall form: JSON (fetch) gets JSON back; a plain browser form post gets a 303 back to the hall page (works without JS). */
async function hallInquiry(req, url) {
  const origin = req.headers.get('origin');
  if (origin && !origins(url).includes(origin)) return bad('origin', 403);
  const isJson = (req.headers.get('content-type') ?? '').includes('application/json');
  const fields = isJson ? await req.json().catch(() => null) : Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].map(([k, v]) => [k, String(v)]));
  const r = await submitInquiry(fields ?? {}, clientIp(req));
  if (isJson || (req.headers.get('accept') ?? '').includes('application/json')) return json(r.body, r.status);
  const page = /^\/[a-z0-9\/_-]{1,60}$/i.test(String(fields?._page ?? '')) ? fields._page : '/hall-rental';
  return new Response(null, { status: 303, headers: { Location: r.status === 200 ? `${page}?sent=1` : `${page}?error=${r.body.error}#inquiry`, 'Cache-Control': 'no-store' } });
}

async function route(req, url) {
  const p = url.pathname;
  if (p === '/api/hall-inquiry' && req.method === 'POST') return hallInquiry(req, url);
  if (p === '/api/login' && req.method === 'POST') return login(req, url);
  if (p === '/api/logout' && req.method === 'POST') {
    if (!sameOrigin(req, ...origins(url))) return bad('origin', 403);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', { secure: PROD || url.protocol === 'https:', maxAge: 0 }) });
  }
  if (p.startsWith('/api/admin/')) {
    const user = signedIn(req);
    if (!user) return bad('signed_out', 401);
    if (req.method !== 'GET' && !sameOrigin(req, ...origins(url))) return bad('origin', 403);
    return adminApi(req, url, user);
  }
  return bad('not_found', 404);
}

async function adminApi(req, url, user) {
  const [section, a1] = url.pathname.slice('/api/admin/'.length).split('/');
  const key = `${req.method} ${section}`;
  const body = ['POST', 'PUT'].includes(req.method) ? await req.json().catch(() => null) : null;
  const state = getState(db);
  const list = (name) => (state[name] ??= []);
  const emptyMenu = { hours: '', sections: [] };

  if (key === 'GET state') return json({ user, defaultPassword: defaultInUse(db), events: list('events'), specials: list('specials'), news: list('news'), menu: state.menu ?? emptyMenu, today: etDay(new Date()) });
  if (key === 'GET stats') return json(stats.summary(url.searchParams.get('range') ?? '30d'));

  if (FIELDS[section] && ['PUT', 'DELETE'].includes(req.method)) { // /api/admin/<events|specials|news>/<id or "new">
    const items = list(section);
    if (a1 !== 'new' && !items.some((x) => x.id === a1)) return bad('not_found', 404);
    if (req.method === 'DELETE') { state[section] = items.filter((x) => x.id !== a1); setState(db, state); return json({ ok: true, items: state[section] }); }
    const v = FIELDS[section]({ ...body, id: a1 === 'new' ? undefined : a1 });
    if (v.error) return bad(v.error);
    state[section] = [...items.filter((x) => x.id !== v.value.id), v.value].sort(SORT[section]);
    setState(db, state);
    return json({ item: v.value, items: state[section] });
  }
  if (key === 'PUT menu') {
    const v = validateMenu(body);
    if (v.error) return bad(v.error);
    state.menu = v.value;
    setState(db, state);
    return json({ menu: v.value });
  }

  if (key === 'GET inquiries') return json({ inquiries: db.prepare('SELECT * FROM inquiries ORDER BY id DESC LIMIT 500').all().map((r) => ({ ...r, handled: Boolean(r.handled), emailed: Boolean(r.emailed) })) });
  if ((key === 'PUT inquiries' || key === 'DELETE inquiries') && /^\d{1,12}$/.test(a1 ?? '')) {
    const r = req.method === 'PUT' ? db.prepare('UPDATE inquiries SET handled = ? WHERE id = ?').run(body?.handled ? 1 : 0, +a1) : db.prepare('DELETE FROM inquiries WHERE id = ?').run(+a1);
    return r.changes ? json({ ok: true }) : bad('not_found', 404);
  }

  if (key === 'POST password') { // change password: prove it's you first
    if (!allow(`pw:${clientIp(req)}`, 10)) return bad('rate', 429);
    if (!checkLogin(db, user, body?.current)) return bad('current');
    const r = setPassword(db, body?.password);
    if (r.error) return bad(r.error);
    log('admin password changed');
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url) }); // other sessions just ended (new session version); keep this one
  }
  return bad('not_found', 404);
}

// ---------- HTTP ----------
const MAX_BODY = 256 * 1024;
function readBody(nreq) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    nreq.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); nreq.destroy(); } else chunks.push(c); });
    nreq.on('end', () => resolve(Buffer.concat(chunks)));
    nreq.on('error', reject);
  });
}

const server = createServer(async (nreq, nres) => {
  let url;
  try {
    const proto = String(nreq.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim() === 'https' ? 'https' : 'http'; // the host's proxy ends TLS
    url = new URL(nreq.url, `${proto}://${nreq.headers.host ?? 'localhost'}`);
  } catch { nres.writeHead(400).end(); return; }
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(nreq.method)) { nres.writeHead(405, baseHeaders(url)).end(); return; }
      return await serveStatic(nreq, nres, url);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(nreq.headers)) for (const x of [v].flat()) headers.append(k, x);
    const body = ['GET', 'HEAD'].includes(nreq.method) ? undefined : await readBody(nreq);
    await send(nreq, nres, url, await route(new Request(url, { method: nreq.method, headers, body }), url));
  } catch (e) {
    if (e.status !== 413) log('error', nreq.method, url.pathname, e.stack ?? e);
    if (!nres.headersSent) { nres.writeHead(e.status ?? 500, { 'Content-Type': 'application/json' }); nres.end(JSON.stringify({ error: e.status === 413 ? 'too_large' : 'server' })); }
  }
});

server.listen(PORT, () => log(`VFW Post 6493 site on ${PUBLIC_URL} (port ${server.address().port}, data in ${DATA}${PROD ? '' : ', development'})`));
const stop = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
