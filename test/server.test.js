// Starts the real server on a free port with a temp DATA_DIR and a tiny fake dist/, then talks to it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..');
const emptySeed = join(REPO, '.data', 'test-seed'); // empty folder: tests start with no seeded content
mkdirSync(emptySeed, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'vfw-srv-'));
const dist = join(tmp, 'dist');
mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main><!--vfw:events-upcoming-->baked seed<!--/vfw:events-upcoming--><!--vfw:data--></main>');
writeFileSync(join(dist, 'admin', 'index.html'), '<p>admin page</p>');
let proc, base, origin;
const ADMIN = { username: 'admin', password: 'admin' };

before(async () => {
  proc = spawn(process.execPath, ['server.js'], { cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', DATA_DIR: join(tmp, 'data'), DIST_DIR: dist, SEED_DIR: emptySeed, ALLOW_DEFAULT_ADMIN: '1', POST_EMAIL: 'post@example.org', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((ok, no) => {
    proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); });
    proc.on('exit', (c) => no(new Error(`server exited ${c}`)));
  });
  origin = `http://localhost:${port}`;
  base = origin;
});
after(() => { proc?.kill(); rmSync(emptySeed, { recursive: true, force: true }); });

const call = (method, path, body, headers = {}) => fetch(base + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
let cookie = '';
const admin = (method, path, body) => call(method, `/api/admin/${path}`, body, { Origin: origin, Cookie: cookie });

test('static pages: markers filled, admin page noindex, unknown path 404', async () => {
  const home = await (await call('GET', '/')).text();
  assert.ok(!home.includes('baked seed') && home.includes('vfw-empty') && home.includes('id="vfw-data"'));
  const a = await call('GET', '/admin/');
  assert.equal(a.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('GET', '/../server.js')).status, 404);
});

test('sign in: refused without a session, wrong password, or a foreign origin', async () => {
  assert.equal((await call('GET', '/api/admin/state')).status, 401);
  assert.equal((await call('POST', '/api/login', ADMIN)).status, 403); // no Origin
  assert.equal((await call('POST', '/api/login', ADMIN, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/login', { ...ADMIN, password: 'wrong' }, { Origin: origin })).status, 401);
  const ok = await call('POST', '/api/login', ADMIN, { Origin: origin });
  assert.equal(ok.status, 200);
  const set = ok.headers.get('set-cookie');
  assert.ok(set.includes('HttpOnly') && set.includes('SameSite=Strict'));
  cookie = set.split(';')[0];
  const st = await (await admin('GET', 'state')).json();
  assert.equal(st.defaultPassword, true);
});

test('CSRF: a signed-in POST without the site origin is refused', async () => {
  assert.equal((await call('PUT', '/api/admin/events/new', { title: 'x', date: '2026-10-20', category: 'Post' }, { Cookie: cookie })).status, 403);
  assert.equal((await call('PUT', '/api/admin/events/new', { title: 'x', date: '2026-10-20', category: 'Post' }, { Cookie: cookie, Origin: 'http://evil.example' })).status, 403);
});

test('events: add, list on the public page, disable hides it, delete removes it', async () => {
  const bad = await admin('PUT', 'events/new', { title: '', date: '2099-01-05', category: 'Post' });
  assert.deepEqual([bad.status, (await bad.json()).error], [400, 'title']);
  const r = await admin('PUT', 'events/new', { title: 'Monthly meeting', date: '2099-01-05', category: 'Post', recurring: 'weekly' });
  const { item } = await r.json();
  assert.ok((await (await call('GET', '/')).text()).includes('event-title">Monthly meeting') === false); // far future: outside the 120-day window
  await admin('PUT', `events/${item.id}`, { ...item, date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
  assert.ok((await (await call('GET', '/')).text()).includes('event-title">Monthly meeting'));
  await admin('PUT', `events/${item.id}`, { ...item, date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), enabled: false });
  assert.ok(!(await (await call('GET', '/')).text()).includes('event-title">Monthly meeting'));
  assert.equal((await (await admin('DELETE', `events/${item.id}`)).json()).items.length, 0);
});

test('update, disable or delete of an unknown id is 404 and creates nothing', async () => {
  for (const sec of ['events', 'specials', 'news']) {
    assert.equal((await admin('PUT', `${sec}/zzzz9999`, { title: 'x', label: 'x', body: 'x', date: '2026-10-20', category: 'Post', period: 'daily' })).status, 404);
    assert.equal((await admin('DELETE', `${sec}/zzzz9999`)).status, 404);
  }
  assert.equal((await (await admin('GET', 'state')).json()).events.length, 0);
});

test('specials, menu and news save and validate', async () => {
  assert.equal((await admin('PUT', 'specials/new', { label: 'Pitchers', period: 'weekly' })).status, 400);
  assert.equal((await admin('PUT', 'specials/new', { label: 'Pitchers', period: 'weekly', weekday: 5 })).status, 200);
  assert.equal((await admin('PUT', 'news/new', { title: 'Hello', date: '2026-10-01', body: 'Line one' })).status, 200);
  assert.equal((await admin('PUT', 'menu', { hours: 'Fri 5 to 8', sections: [{ name: 'Apps', items: [{ name: 'Wings', price: '$9' }] }] })).status, 200);
  assert.equal((await admin('PUT', 'menu', { sections: [{ name: '' }] })).status, 400);
  const st = await (await admin('GET', 'state')).json();
  assert.equal(st.specials.length, 1);
  assert.equal(st.menu.sections[0].items[0].name, 'Wings');
});

test('hall inquiry: JSON reply, no-JS form gets a 303, honeypot ignored, stored and listed in admin', async () => {
  const q = { name: 'Pat', phone: '215-555-0100', message: 'hi' };
  const j = await call('POST', '/api/hall-inquiry', q, { Origin: origin });
  assert.deepEqual([j.status, await j.json()], [200, { ok: true }]);
  const f = await call('POST', '/api/hall-inquiry', null, { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin });
  assert.equal(f.status, 303);
  assert.match(f.headers.get('location'), /^\/hall\/\?error=name/);
  const body = new URLSearchParams({ name: 'Form Person', email: 'f@example.org' });
  const ok = await fetch(`${base}/api/hall-inquiry`, { method: 'POST', redirect: 'manual', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/hall/?sent=1');
  await call('POST', '/api/hall-inquiry', { ...q, website: 'spam' }, { Origin: origin });
  assert.equal((await call('POST', '/api/hall-inquiry', q, { Origin: 'http://evil.example' })).status, 403);
  const list = (await (await admin('GET', 'inquiries')).json()).inquiries;
  assert.deepEqual(list.map((x) => x.name).sort(), ['Form Person', 'Pat']);
  assert.equal((await admin('PUT', `inquiries/${list[0].id}`, { handled: true })).status, 200);
  assert.equal(readdirSync(join(tmp, 'data', 'outbox')).length, 2);
});

test('stats counts a visit (not the signed-in admin) and the dashboard reports inquiries', async () => {
  await call('GET', '/', null, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Referer: 'https://www.facebook.com/' });
  const s = await (await admin('GET', 'stats?range=7d')).json();
  assert.equal(s.views, 1);
  assert.equal(s.visitors, 1);
  assert.deepEqual(s.referrers, [{ host: 'facebook.com', n: 1 }]);
  assert.equal(s.inquiries.total, 2);
  assert.equal(s.series.length, 7);
});

test('change password: needs the current one, then the old password stops working', async () => {
  assert.equal((await admin('POST', 'password', { current: 'wrong', password: 'a-better-password' })).status, 400);
  assert.equal((await (await admin('POST', 'password', { current: 'admin', password: 'admin' })).json()).error, 'too_short');
  const r = await admin('POST', 'password', { current: 'admin', password: 'a-better-password' });
  assert.equal(r.status, 200);
  const fresh = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', '/api/admin/state', null, { Cookie: cookie })).status, 401); // old session ended
  assert.equal((await call('GET', '/api/admin/state', null, { Cookie: fresh })).status, 200);
  assert.equal((await call('POST', '/api/login', ADMIN, { Origin: origin })).status, 401);
});

test('first run seeds the real src/content files (events > 0)', async () => {
  const data = mkdtempSync(join(tmpdir(), 'vfw-seed-'));
  const p = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: '0', DATA_DIR: data, DIST_DIR: dist, ALLOW_DEFAULT_ADMIN: '1', SEED_DIR: '', NODE_ENV: 'test' } });
  try {
    const port = await new Promise((ok, no) => { p.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); }); p.on('exit', (c) => no(new Error(`exit ${c}`))); });
    const o = `http://localhost:${port}`;
    const login = await fetch(`${o}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: o }, body: JSON.stringify(ADMIN) });
    const st = await (await fetch(`${o}/api/admin/state`, { headers: { Cookie: login.headers.get('set-cookie').split(';')[0] } })).json();
    assert.ok(st.events.length > 0);
  } finally { p.kill(); }
});

test('M5 hall form redirect: _page is allow-listed, never an arbitrary path', async () => {
  const post = (page) => fetch(`${base}/api/hall-inquiry`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ name: '', _page: page }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  for (const page of ['//2130706433', 'https://evil.example/', '/\\evil.example', '/about/', '/hall-rental']) {
    const r = await post(page);
    assert.match(r.headers.get('location'), /^\/hall\/\?error=name/, page);
  }
  assert.match((await post('/hall')).headers.get('location'), /^\/hall\/\?error=name/);
});

test('M4 security headers on pages, the admin page and error replies; CSP hashes inline scripts', async () => {
  writeFileSync(join(dist, 'inline.html'), '<script>var a=1</script><button onclick="print()">x</button><script type="module" src="/x.js"></script>');
  const check = (r) => { for (const h of ['content-security-policy', 'permissions-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy']) assert.ok(r.headers.get(h), h); };
  const page = await call('GET', '/inline.html');
  check(page);
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'self'"));
  assert.ok(csp.includes("'sha256-") && csp.includes("'unsafe-hashes'"));
  assert.ok(/script-src 'self' 'sha256-/.test(csp), 'inline script blocks must be hashed into script-src');
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp));
  check(await call('GET', '/admin/'));
  check(await call('GET', '/nope'));
  check(await call('GET', '/api/nothing'));
  check(await call('POST', '/', null)); // 405
  check(await call('POST', '/api/hall-inquiry', { name: 'x' }, { Origin: 'http://evil.example' }));
});

test('L2 directory redirect stays on this site', async () => {
  const r = await call('GET', '/.//admin');
  assert.ok(!(r.headers.get('location') ?? '').startsWith('//'));
});

test('M3 production refuses to start with ALLOW_DEFAULT_ADMIN=1', async () => {
  const code = await new Promise((ok) => spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'x', ALLOW_DEFAULT_ADMIN: '1', DATA_DIR: join(tmp, 'prod'), PORT: '0' } }).on('exit', ok));
  assert.equal(code, 1);
});

test('L1 sign out ends the session even for a copied cookie', async () => {
  const login = await call('POST', '/api/login', { username: 'admin', password: 'a-better-password' }, { Origin: origin });
  const c = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', '/api/admin/state', null, { Cookie: c })).status, 200);
  await call('POST', '/api/logout', null, { Origin: origin, Cookie: c });
  assert.equal((await call('GET', '/api/admin/state', null, { Cookie: c })).status, 401);
});

test('dotfiles are never served, even if present in dist/', async () => {
  writeFileSync(join(dist, '.env'), 'SECRET=1');
  mkdirSync(join(dist, '.git'), { recursive: true });
  writeFileSync(join(dist, '.git', 'config'), 'x');
  for (const p of ['/.env', '/.git/config', '/%2eenv', '/.data/vfw.db', '/a/.env']) assert.equal((await call('GET', p)).status, 404, p);
});

test('refuses to start when DATA_DIR is inside the web root', async () => {
  const code = await new Promise((ok) => spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, DIST_DIR: dist, DATA_DIR: join(dist, 'data'), PORT: '0', NODE_ENV: 'test' } }).on('exit', ok));
  assert.equal(code, 1);
});

test('security log: sign-in failure, edits and deletes are recorded; passwords never are', async () => {
  const bad = await call('POST', '/api/login', { username: 'ad' + String.fromCharCode(13, 10) + 'min', password: 'secret-wrong-pass' }, { Origin: origin, 'X-Forwarded-For': '9.9.9.9' });
  assert.equal(bad.status, 401);
  const login = await call('POST', '/api/login', { username: 'admin', password: 'a-better-password' }, { Origin: origin });
  const c = login.headers.get('set-cookie').split(';')[0];
  const as = (m, p, b) => call(m, `/api/admin/${p}`, b, { Origin: origin, Cookie: c });
  const { item } = await (await as('PUT', 'news/new', { title: 'Log me', date: '2026-10-01', body: 'x' })).json();
  await as('DELETE', `news/${item.id}`);
  const events = (await (await as('GET', 'security')).json()).events;
  const types = events.map((e) => e.type);
  for (const t of ['login_fail', 'login_ok', 'news_create', 'news_delete']) assert.ok(types.includes(t), t);
  const fail = events.find((e) => e.type === 'login_fail');
  assert.equal(fail.who, 'ad min'); // CR/LF flattened
  assert.ok(!JSON.stringify(events).includes('secret-wrong-pass') && !JSON.stringify(events).includes('a-better-password'));
  assert.ok(events.find((e) => e.type === 'news_create').detail.startsWith('id '));
  assert.notEqual(fail.ip, '9.9.9.9'); // X-Forwarded-For is ignored without TRUST_PROXY
  await call('POST', '/api/logout', null, { Origin: origin, Cookie: c });
});

test('malformed and aborted requests do not take the server down', async () => {
  const { connect } = await import('node:net');
  const port = new URL(origin).port;
  const CRLF = String.fromCharCode(13, 10);
  const raw = (data, end = true) => new Promise((ok) => {
    const s = connect(+port, '127.0.0.1', () => { s.write(data); if (end) s.end(); });
    let got = '';
    s.on('data', (d) => (got += d));
    s.on('close', () => ok(got));
    s.on('error', () => ok(got));
  });
  assert.match(await raw('GARBAGE NOT HTTP' + CRLF + CRLF), /^HTTP\/1\.1 400/);
  assert.match(await raw('GET /' + String.fromCharCode(0) + ' HTTP/1.1' + CRLF + 'Host: x' + CRLF + CRLF), /400|404/);
  await raw(`POST /api/hall-inquiry HTTP/1.1${CRLF}Host: x${CRLF}Content-Length: 500${CRLF}Content-Type: application/json${CRLF}${CRLF}{"name":`); // body cut short, socket closed
  const s = connect(+port, '127.0.0.1'); s.on('error', () => {}); s.write('GET / HTTP/1.1' + CRLF); s.destroy(); // aborted mid-headers
  assert.equal((await call('GET', '/')).status, 200);
  assert.equal(proc.exitCode, null);
});

test('login lockout: 5 wrong tries lock the account', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/login', { username: 'admin', password: `nope${i}` }, { Origin: origin });
  assert.equal(last.status, 429);
});
