// Starts the real server on a free port with a temp DATA_DIR and a tiny fake dist/, then talks to it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'vfw-srv-'));
const dist = join(tmp, 'dist');
mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main><!--vfw:events-upcoming-->baked seed<!--/vfw:events-upcoming--><!--vfw:data--></main>');
writeFileSync(join(dist, 'admin', 'index.html'), '<p>admin page</p>');
let proc, base, origin;
const ADMIN = { username: 'admin', password: 'admin' };

before(async () => {
  proc = spawn(process.execPath, ['server.js'], { cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', DATA_DIR: join(tmp, 'data'), DIST_DIR: dist, ALLOW_DEFAULT_ADMIN: '1', POST_EMAIL: 'post@example.org', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((ok, no) => {
    proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); });
    proc.on('exit', (c) => no(new Error(`server exited ${c}`)));
  });
  origin = `http://localhost:${port}`;
  base = origin;
});
after(() => proc?.kill());

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
  assert.match(f.headers.get('location'), /^\/hall-rental\?error=name/);
  const body = new URLSearchParams({ name: 'Form Person', email: 'f@example.org' });
  const ok = await fetch(`${base}/api/hall-inquiry`, { method: 'POST', redirect: 'manual', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/hall-rental?sent=1');
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

test('login lockout: 5 wrong tries lock the account', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/login', { username: 'admin', password: `nope${i}` }, { Origin: origin });
  assert.equal(last.status, 429);
});
