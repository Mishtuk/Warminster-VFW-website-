// Wall of Honor admin: validator, the honor marker, admin CRUD and reorder (auth, origin), consent never leaks, security log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectMarkers, validateHonor } from '../src/lib/state.js';

const ok = { name: 'Jane Doe', branch: 'Army', era: 'Vietnam War', served: '1968 to 1970', consent: true };

test('validateHonor: branch from the list, consent only when exactly true', () => {
  const v = validateHonor(ok).value;
  assert.deepEqual(v, { id: v.id, name: 'Jane Doe', branch: 'Army', era: 'Vietnam War', served: '1968 to 1970', photo: '', note: '', consent: true, enabled: true });
  assert.equal(validateHonor({ ...ok, name: ' ' }).error, 'name');
  for (const b of ['Foreign Legion', '', 'army', undefined]) assert.equal(validateHonor({ ...ok, branch: b }).error, 'branch', String(b));
  assert.equal(validateHonor({ ...ok, photo: '../x.webp' }).error, 'photo');
  for (const c of [false, 'true', 1, 'on', undefined]) assert.equal(validateHonor({ ...ok, consent: c }).value.consent, false, String(c));
});

test('honor marker: consented only, escaped, hidden skipped, Coming soon when none', () => {
  const e = [{ ...ok, id: 'a1', name: '<b>Jane</b> & Co' }, { ...ok, id: 'b2', name: 'Secret Person', consent: false }, { ...ok, id: 'c3', name: 'Hidden One', enabled: false }];
  const html = injectMarkers('<!--vfw:honor-->seed<!--/vfw:honor-->', { honor: e }, '2026-01-01');
  assert.ok(html.includes('&lt;b&gt;Jane&lt;/b&gt; &amp; Co') && !html.includes('<b>Jane') && !html.includes('Secret') && !html.includes('Hidden One'));
  assert.equal((html.match(/<li class="honor-card">/g) ?? []).length, 1);
  assert.ok(injectMarkers('<!--vfw:honor-->seed<!--/vfw:honor-->', { honor: [e[1]] }, '2026-01-01').includes('Coming soon'));
});

test('admin honor: auth and origin, validation, create, reorder, consent never leaks, live marker, delete, security log', async () => {
  assert.equal((await call('PUT', '/api/admin/honor/new', ok)).status, 401);
  assert.equal((await call('PUT', '/api/admin/honor/new', ok, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await call('PUT', '/api/admin/honor-order', { ids: [] }, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await call('DELETE', '/api/admin/honor/x')).status, 401);
  assert.deepEqual((await (await admin('GET', 'state')).json()).honor, []);
  assert.equal((await (await admin('PUT', 'honor/new', { ...ok, name: '' })).json()).error, 'name');
  assert.equal((await (await admin('PUT', 'honor/new', { ...ok, branch: 'Pirates' })).json()).error, 'branch');
  const page = async () => (await call('GET', '/')).text();
  assert.ok((await page()).includes('Coming soon'));
  const a = (await (await admin('PUT', 'honor/new', { ...ok, name: 'Showing Sam' })).json()).item;
  const b = (await (await admin('PUT', 'honor/new', { ...ok, name: 'Private Pat', consent: false })).json()).item;
  const c = (await (await admin('PUT', 'honor/new', { ...ok, name: 'Another Al', branch: 'Navy' })).json()).item;
  assert.equal(b.consent, false);
  let html = await page();
  assert.ok(html.includes('Showing Sam') && html.includes('Another Al') && !html.includes('Private Pat') && html.includes('id="vfw-data"'));
  assert.ok(html.indexOf('Showing Sam') < html.indexOf('Another Al')); // staff order, not alphabetical
  assert.equal((await (await admin('PUT', 'honor-order', { ids: [a.id] })).json()).error, 'order');
  const ids = [c.id, b.id, a.id];
  assert.deepEqual((await (await admin('PUT', 'honor-order', { ids })).json()).items.map((x) => x.id), ids);
  html = await page();
  assert.ok(html.indexOf('Another Al') < html.indexOf('Showing Sam') && !html.includes('Private Pat'));
  await admin('PUT', `honor/${b.id}`, { ...b, consent: true });
  assert.ok((await page()).includes('Private Pat'));
  await admin('PUT', `honor/${b.id}`, { ...b, consent: 'true' }); // not the boolean: back to hidden
  assert.ok(!(await page()).includes('Private Pat'));
  assert.equal((await admin('DELETE', `honor/${a.id}`)).status, 200);
  assert.equal((await admin('DELETE', `honor/${a.id}`)).status, 404);
  const ev = (await (await admin('GET', 'security')).json()).events.map((e) => e.what ?? e.event ?? e.type);
  for (const k of ['honor_create', 'honor_update', 'honor_delete', 'honor_reorder']) assert.ok(ev.includes(k), k);
});

const tmp = mkdtempSync(join(tmpdir(), 'vfw-honor-'));
const dist = join(tmp, 'dist'), seed = join(tmp, 'seed'), data = join(tmp, 'data');
mkdirSync(seed); mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main><div id="w"><!--vfw:honor-->seed<!--/vfw:honor--></div><!--vfw:data--></main>');
writeFileSync(join(seed, 'honor.json'), '[]');
let proc, origin, cookie = '';
before(async () => {
  proc = spawn(process.execPath, ['server.js'], { cwd: join(import.meta.dirname, '..'), env: { ...process.env, PORT: '0', DATA_DIR: data, DIST_DIR: dist, SEED_DIR: seed, ALLOW_DEFAULT_ADMIN: '1', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((res, no) => { proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) res(+m[1]); }); proc.on('exit', (c) => no(new Error(`server exited ${c}`))); });
  origin = `http://localhost:${port}`;
  const r = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { proc?.kill(); try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {} });
const call = (method, path, body, headers = {}) => fetch(origin + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const admin = (method, path, body) => call(method, `/api/admin/${path}`, body, { Origin: origin, Cookie: cookie });
