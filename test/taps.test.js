// Beer taps: validator, the taps marker, admin CRUD and reorder (auth, origin), security log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectMarkers, tapsHtml, validateTap } from '../src/lib/state.js';

const ok = { name: 'Yuengling', bg: '#C8102E', fg: '#ffffff' };

test('validateTap: one assert per error code, colours strict', () => {
  const v = validateTap(ok).value;
  assert.deepEqual(v, { id: v.id, name: 'Yuengling', bg: '#c8102e', fg: '#ffffff', enabled: true });
  assert.equal(validateTap({ ...ok, name: ' ' }).error, 'name');
  assert.equal(validateTap({ ...ok, name: 'x'.repeat(41) }).value.name.length, 40); // text() trims to 40
  for (const c of ['red', '#fff', '#12345g', 'red;background:url(x)', '#ffffff"onload="x', '#1234567', undefined, 5]) {
    assert.equal(validateTap({ ...ok, bg: c }).error, 'bg', String(c));
    assert.equal(validateTap({ ...ok, fg: c }).error, 'fg', String(c));
  }
  assert.equal(validateTap({ ...ok, enabled: false }).value.enabled, false);
});

test('taps marker: exact markup, escaped, hidden skipped, empty when none shown', () => {
  const taps = [{ id: 'a1', name: '<img src=x onerror=1> "Ale" & Co', bg: '#112233', fg: '#ffffff', enabled: true }, { id: 'b2', name: 'Hidden', bg: '#000000', fg: '#ffffff', enabled: false }, { id: 'c3', name: 'Bad', bg: 'red;x:y', fg: '#ffffff' }];
  const html = tapsHtml(taps);
  assert.ok(html.startsWith('<ul class="tap-row"><li class="tap" style="--tap-bg:#112233;--tap-fg:#ffffff"><button type="button" class="tap-handle" aria-label="Pour a &lt;img'));
  assert.ok(!html.includes('<img') && !html.includes('Hidden') && !html.includes('red;x'));
  assert.equal((html.match(/<li /g) ?? []).length, 1);
  assert.ok(html.endsWith('<span class="tap-nozzle" aria-hidden="true"></span></li></ul>'));
  assert.equal(tapsHtml([]), '');
  assert.equal(tapsHtml([{ ...taps[0], enabled: false }]), '');
  assert.equal(injectMarkers('<div class="taps"><!--vfw:taps-->seed<!--/vfw:taps--></div>', { taps: [] }, '2026-01-01'), '<div class="taps"></div>');
});

const tmp = mkdtempSync(join(tmpdir(), 'vfw-taps-'));
const dist = join(tmp, 'dist'), seed = join(tmp, 'seed'), data = join(tmp, 'data');
mkdirSync(seed); mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main><div class="taps" data-pour><!--vfw:taps--><!--/vfw:taps--></div><!--vfw:data--></main>');
writeFileSync(join(seed, 'taps.json'), JSON.stringify([{ name: 'Seed Lager', bg: '#aa0000', fg: '#ffffff' }]));
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

test('admin taps: seeded, auth and origin, validation, create, reorder, hide, live marker, delete, security log', async () => {
  assert.equal((await call('PUT', '/api/admin/taps/new', ok)).status, 401);
  assert.equal((await call('PUT', '/api/admin/taps/new', ok, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await call('PUT', '/api/admin/taps-order', { ids: [] }, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await call('DELETE', '/api/admin/taps/x')).status, 401);
  const st = await (await admin('GET', 'state')).json();
  assert.deepEqual(st.taps.map((t) => t.name), ['Seed Lager']);
  assert.equal((await (await admin('PUT', 'taps/new', { ...ok, name: '' })).json()).error, 'name');
  assert.equal((await (await admin('PUT', 'taps/new', { ...ok, bg: 'red' })).json()).error, 'bg');
  assert.equal((await (await admin('PUT', 'taps/new', { ...ok, fg: '#fff;"><script>' })).json()).error, 'fg');
  const a = (await (await admin('PUT', 'taps/new', ok)).json()).item;
  const r = await (await admin('PUT', 'taps/new', { name: 'Stout "X"', bg: '#000000', fg: '#ffffff' })).json();
  const b = r.item;
  assert.deepEqual(r.items.map((t) => t.name), ['Seed Lager', 'Yuengling', 'Stout "X"']); // new ones go last
  assert.equal((await admin('PUT', 'taps/nope1234', ok)).status, 404);
  assert.equal((await (await admin('PUT', 'taps-order', { ids: [b.id] })).json()).error, 'order');
  const ids = [b.id, a.id, st.taps[0].id];
  assert.deepEqual((await (await admin('PUT', 'taps-order', { ids })).json()).items.map((t) => t.id), ids);
  const page = await (await call('GET', '/', null, { 'User-Agent': 'Mozilla/5.0 Chrome/120 test' })).text();
  assert.ok(page.includes('aria-label="Pour a Stout &quot;X&quot;"') && page.indexOf('Stout') < page.indexOf('Yuengling'));
  for (const t of [a, b, st.taps[0]]) await admin('PUT', `taps/${t.id}`, { ...t, enabled: false });
  const none = await (await call('GET', '/', null, { 'User-Agent': 'Mozilla/5.0 Chrome/120 test' })).text();
  assert.ok(none.includes('<div class="taps" data-pour></div>') && !none.includes('tap-row')); // no taps shown: nothing rendered
  assert.equal((await admin('DELETE', `taps/${a.id}`)).status, 200);
  assert.equal((await admin('DELETE', `taps/${a.id}`)).status, 404);
  const ev = (await (await admin('GET', 'security')).json()).events.map((e) => e.what ?? e.event ?? e.type);
  for (const k of ['taps_create', 'taps_update', 'taps_delete', 'taps_reorder']) assert.ok(ev.includes(k), k);
});
