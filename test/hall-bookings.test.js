// Hall booking calendar: validator, marker (no notes), admin routes with auth and origin, past dates refused, purge.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, purgeHall } from '../src/db.js';
import { etDay, hallCalendarHtml, injectMarkers, validateHallBooking } from '../src/lib/state.js';

const plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('validateHallBooking: strict dates, past refused, status and note rules', () => {
  const T = '2026-10-21';
  assert.deepEqual(validateHallBooking('2026-11-01', { status: 'booked', note: ' Jane <b>x</b> ' }, T).value, { date: '2026-11-01', status: 'booked', note: 'Jane x' });
  assert.equal(validateHallBooking(T, { status: 'hold' }, T).value.status, 'hold'); // today is allowed
  assert.equal(validateHallBooking('2026-10-20', { status: 'booked' }, T).error, 'past');
  for (const d of ['2026-02-30', '2026-13-01', '26-11-01', '2026-1-1', '2026-11-01T00:00', '', null, undefined, 20261101, '2028-01-01']) assert.equal(validateHallBooking(d, { status: 'booked' }, T).error, 'date', String(d));
  for (const s of ['open', 'Booked', '', undefined, 1]) assert.equal(validateHallBooking('2026-11-01', { status: s }, T).error, 'status', String(s));
  assert.equal(validateHallBooking('2026-11-01', null, T).error, 'status');
  assert.equal(validateHallBooking('2026-11-01', { status: 'booked', note: 'x'.repeat(300) }, T).value.note.length, 120);
});

test('hall-calendar marker: three months, text labels, no notes, seed note without a server', () => {
  const T = '2026-10-21';
  const h = hallCalendarHtml([{ date: '2026-10-30', status: 'booked' }, { date: '2026-11-07', status: 'hold' }], T, {});
  assert.equal((h.match(/<section class="vfw-month"/g) ?? []).length, 3);
  assert.ok(h.includes('October 2026') && h.includes('November 2026') && h.includes('December 2026'));
  assert.ok(h.includes('>Booked</span>') && h.includes('>On hold</span>') && h.includes('data-date="2026-10-22"') && h.includes('href="#inquiry"'));
  assert.ok(!h.includes('data-date="2026-10-30"') && !h.includes('data-date="2026-10-20"')); // booked and past days are not links
  assert.ok(h.includes('hc-past') && !h.includes('<script') && !h.includes(' on'.concat('click')));
  assert.ok(h.includes('?cal=2027-01#open-dates') && h.includes('vfw-cal-off')); // Next works, Previous is off on the first month
  const later = hallCalendarHtml([], T, { month: '2027-01' });
  assert.ok(later.includes('January 2027') && later.includes('?cal=2026-10#open-dates'));
  assert.ok(hallCalendarHtml([], T, { month: 'junk' }).includes('October 2026') && hallCalendarHtml([], T, { month: '2020-01' }).includes('October 2026'));
  const seed = hallCalendarHtml(undefined, '');
  assert.ok(seed.includes('Send an inquiry or call the post to check a date') && seed.includes('href="tel:2157730693"') && !seed.includes('data-date'));
  const state = { events: [], specials: [], news: [], menu: { sections: [] } };
  const page = injectMarkers('<!--vfw:hall-calendar-->OLDSEED<!--/vfw:hall-calendar--><!--vfw:data-->', state, T, null, { hall: { bookings: [{ date: '2026-10-30', status: 'booked', note: 'SECRET NOTE' }], month: null } });
  assert.ok(page.includes('vfw-hall') && !page.includes('OLDSEED') && !page.includes('SECRET NOTE') && !/hall|booking/i.test(page.match(/id="vfw-data">([^<]*)/)[1]));
});

test('retention: dates more than 30 days past are purged', () => {
  const db = openDb(':memory:');
  const ins = db.prepare("INSERT INTO hall_bookings (date, status, note, updated_at) VALUES (?, 'booked', 'n', 1)");
  for (const d of ['2026-09-01', '2026-09-20', '2026-09-21', '2026-11-01']) ins.run(d);
  assert.equal(purgeHall(db, '2026-09-21'), 2); // today 2026-10-21 minus 30 days
  assert.deepEqual(db.prepare('SELECT date FROM hall_bookings ORDER BY date').all().map((r) => r.date), ['2026-09-21', '2026-11-01']);
  assert.throws(() => db.prepare("INSERT INTO hall_bookings (date, status, updated_at) VALUES ('2026-12-01', 'open', 1)").run()); // table only allows booked or hold
});

// ---------- the real server ----------
const REPO = join(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'vfw-hall-'));
const dist = join(tmp, 'dist'), seed = join(tmp, 'seed'), data = join(tmp, 'data');
mkdirSync(seed);
mkdirSync(join(dist, 'hall'), { recursive: true });
writeFileSync(join(dist, 'hall', 'index.html'), '<main><!--vfw:hall-calendar-->seed note<!--/vfw:hall-calendar--><!--vfw:data--></main>');
writeFileSync(join(dist, 'index.html'), '<main><!--vfw:data-->home</main>');
let proc, origin, cookie = '';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 test' };
before(async () => {
  const db = openDb(data); // an old date planted before the server starts: its startup purge must remove it
  db.prepare("INSERT INTO hall_bookings (date, status, note, updated_at) VALUES (?, 'booked', 'old', 1)").run(plus(-45));
  db.close();
  proc = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: '0', DATA_DIR: data, DIST_DIR: dist, SEED_DIR: seed, ALLOW_DEFAULT_ADMIN: '1', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((ok, no) => { proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); }); proc.on('exit', (c) => no(new Error(`server exited ${c}`))); });
  origin = `http://localhost:${port}`;
  const r = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { proc?.kill(); try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {} });
const call = (method, path, body, headers = {}) => fetch(origin + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const admin = (method, path, body) => call(method, `/api/admin/${path}`, body, { Origin: origin, Cookie: cookie });

test('admin hall routes: sign-in and origin needed, validation, past refused, set, update, open', async () => {
  const d1 = plus(10), d2 = plus(11), d3 = plus(12);
  assert.equal((await call('GET', '/api/admin/hall-bookings')).status, 401);
  assert.equal((await call('PUT', `/api/admin/hall-bookings/${d1}`, { status: 'booked' })).status, 401);
  assert.equal((await call('PUT', `/api/admin/hall-bookings/${d1}`, { status: 'booked' }, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await call('DELETE', `/api/admin/hall-bookings/${d1}`, null, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await (await admin('PUT', `hall-bookings/${plus(-1)}`, { status: 'booked' })).json()).error, 'past');
  assert.equal((await (await admin('DELETE', `hall-bookings/${plus(-1)}`)).json()).error, 'past');
  for (const d of ['2026-02-30', 'abc', '2026-1-1', plus(400)]) assert.equal((await (await admin('PUT', `hall-bookings/${d}`, { status: 'booked' })).json()).error, 'date', d);
  assert.equal((await (await admin('PUT', `hall-bookings/${d1}`, { status: 'open' })).json()).error, 'status');
  assert.equal((await admin('PUT', `hall-bookings/${d1}`, { status: 'booked', note: 'Smith wedding, deposit paid' })).status, 200);
  await admin('PUT', `hall-bookings/${d2}`, { status: 'booked' });
  await admin('PUT', `hall-bookings/${d3}`, { status: 'hold', note: 'x'.repeat(300) });
  let list = (await (await admin('GET', 'hall-bookings')).json()).bookings;
  assert.deepEqual(list.map((b) => [b.date, b.status, b.note.length]), [[d1, 'booked', 27], [d2, 'booked', 0], [d3, 'hold', 120]]); // the planted old date is gone, notes cut to 120
  await admin('PUT', `hall-bookings/${d2}`, { status: 'hold', note: 'call back' }); // an edit replaces, never duplicates
  assert.deepEqual((await (await admin('GET', 'hall-bookings')).json()).bookings.map((b) => b.status), ['booked', 'hold', 'hold']);
  assert.equal((await admin('DELETE', `hall-bookings/${d2}`)).status, 200);
  list = (await (await admin('GET', 'hall-bookings')).json()).bookings;
  assert.deepEqual(list.map((b) => b.date), [d1, d3]);
  const sec = (await (await admin('GET', 'security')).json()).events;
  assert.ok(sec.some((e) => e.type === 'hall_booking_set') && sec.some((e) => e.type === 'hall_booking_open') && sec.some((e) => e.type === 'hall_purged'));
  assert.ok(!sec.some((e) => /Smith|deposit/.test(e.detail))); // notes stay out of the log
});

test('public /hall: dates and status only, never the note; the old date was purged at start', async () => {
  const page = await (await call('GET', '/hall/', null, UA)).text();
  assert.ok(page.includes('vfw-hall') && page.includes('>Booked</span>') && page.includes('>On hold</span>') && !page.includes('seed note'));
  assert.ok(!/Smith|deposit|call back|x{20}/.test(page));
  assert.ok(!(await (await call('GET', '/', null, UA)).text()).includes('Smith'));
  const next = await (await call('GET', `/hall/?cal=${plus(100).slice(0, 7)}`, null, UA)).text();
  assert.ok(next.includes('rel="prev"'));
  assert.ok(etDay() <= plus(0));
});
