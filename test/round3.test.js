// Round 3: volunteer shifts and sign-ups, veteran help requests, site settings, the TV/volunteer/help/donate markers, and the audit fixes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, getSettings, purgeHelp, purgeShifts, setSettings } from '../src/db.js';
import { donateHtml, helpFormHtml, injectMarkers, regularHtml, specialOrder, specialsHtml, tvHtml, upcomingHtml, validateHelp, validateSettings, validateShift, validateSignup, volunteerHtml, etDay } from '../src/lib/state.js';

// ---------- validators and renderers ----------
const code = (v) => v.error;
test('validateShift: one assert per error code', () => {
  const ok = { title: 'Flags', date: '2026-10-25', start: '09:00', end: '11:00', slots: 5, notes: 'Meet at the gate.' };
  assert.equal(validateShift(ok, '2026-10-20').value.slots, 5);
  assert.equal(code(validateShift({ ...ok, title: ' ' }, '2026-10-20')), 'title');
  assert.equal(code(validateShift({ ...ok, date: '2026-13-40' }, '2026-10-20')), 'date');
  assert.equal(code(validateShift({ ...ok, date: '2026-10-19' }, '2026-10-20')), 'past');
  assert.equal(validateShift({ ...ok, id: 'abcd1234', date: '2026-10-19' }, '2026-10-20').value.date, '2026-10-19'); // an edit may keep a past date
  assert.equal(code(validateShift({ ...ok, start: '9am' }, '2026-10-20')), 'start');
  assert.equal(code(validateShift({ ...ok, end: '25:00' }, '2026-10-20')), 'end');
  for (const slots of [0, 101, 1.5, 'x', undefined]) assert.equal(code(validateShift({ ...ok, slots }, '2026-10-20')), 'slots');
  assert.equal(validateShift({ ...ok, slots: '12' }, '2026-10-20').value.slots, 12); // form field as text
  assert.equal(code(validateShift({ ...ok, slots: 2 }, '2026-10-20', 3)), 'slots_taken');
  assert.equal(validateShift({ ...ok, notes: 'x'.repeat(500), enabled: false }, '2026-10-20').value.notes.length, 300);
});
test('validateSignup and validateHelp: one assert per error code', () => {
  const s = { shift: 'abcd1234', name: 'Jane Smith', phone: '215-555-0100', email: '' };
  assert.equal(validateSignup(s).value.name, 'Jane Smith');
  assert.equal(code(validateSignup({ ...s, shift: '../x' })), 'shift');
  assert.equal(code(validateSignup({ ...s, name: '' })), 'name');
  assert.equal(code(validateSignup({ ...s, phone: '12' })), 'phone');
  assert.equal(code(validateSignup({ ...s, phone: '', email: 'nope' })), 'email');
  assert.equal(code(validateSignup({ ...s, phone: '' })), 'contact');
  const h = { name: 'Sam', phone: '215-555-0100', kind: 'ride', bestTime: 'evening', message: 'Need a ride.' };
  assert.equal(validateHelp(h).value.kind, 'ride');
  assert.equal(code(validateHelp({ ...h, name: '' })), 'name');
  assert.equal(code(validateHelp({ ...h, phone: '' })), 'contact');
  assert.equal(code(validateHelp({ ...h, kind: 'money' })), 'kind');
  assert.equal(code(validateHelp({ ...h, bestTime: 'noon' })), 'bestTime');
  assert.equal(validateHelp({ ...h, bestTime: undefined }).value.bestTime, '');
  assert.equal(validateHelp({ ...h, message: 'x'.repeat(3000) }).value.message.length, 1000);
});
test('validateSettings: https only, responder required to turn the form on', () => {
  assert.equal(code(validateSettings({ helpEnabled: true, responderName: '' })), 'responder');
  assert.equal(validateSettings({ helpEnabled: true, responderName: 'Bill Zuk' }).value.helpEnabled, true);
  assert.equal(code(validateSettings({ responderEmail: 'nope' })), 'responderEmail');
  for (const u of ['http://pay.example/x', 'javascript:alert(1)', 'https://user:pw@pay.example/', 'pay.example', 'https://a.example/"onclick', 'data:text/html,hi', 'https://' + 'a'.repeat(300) + '.example'])
    assert.equal(code(validateSettings({ donateUrl: u })), 'donateUrl', u);
  assert.equal(validateSettings({ donateUrl: 'https://pay.example/give?x=1', donateLabel: 'Give' }).value.donateUrl, 'https://pay.example/give?x=1');
  assert.equal(validateSettings({}).value.donateUrl, '');
});
test('markers escape everything and keep private data out', () => {
  const shifts = [{ id: 'abcd1234', title: '<img src=x onerror=1>', date: '2099-05-16', start: '09:00', end: '11:00', notes: '"quoted" & <b>', slots: 5, left: 3 }, { id: 'full1234', title: 'Full one', date: '2099-05-17', start: '', end: '', notes: '', slots: 2, left: 0 }];
  const v = volunteerHtml(shifts);
  assert.ok(!v.includes('<img') && v.includes('&lt;img') && v.includes('3 of 5 spots left') && v.includes('Full, thank you') && !v.includes('<script'));
  assert.match(v, /value="full1234" required disabled/);
  assert.match(volunteerHtml([]), /vfw-empty.*215-773-0693/);
  assert.ok(!volunteerHtml([]).includes('<form'));
  const on = { helpEnabled: true, responderName: 'Bill <Zuk>', responderRole: 'Service Officer', responderEmail: 'secret@example.org', donateUrl: 'https://pay.example/g?a=1&b=2', donateLabel: 'Give "now"' };
  const h = helpFormHtml(on);
  assert.ok(h.includes('Bill &lt;Zuk&gt;, Service Officer') && h.includes('action="/api/help-request"') && h.includes('name="website"') && !h.includes('secret@example.org'));
  assert.match(helpFormHtml({}), /vfw-help-off/);
  assert.match(helpFormHtml({ helpEnabled: true, responderName: '' }), /vfw-help-off/); // no named responder: stays off
  const d = donateHtml(on);
  assert.ok(d.includes('href="https://pay.example/g?a=1&amp;b=2"') && d.includes('Give &quot;now&quot;') && d.includes('rel="noopener"'));
  assert.equal(donateHtml({}), '');
  const page = injectMarkers('<!--vfw:volunteer-board--><!--vfw:help-form--><!--vfw:donate-link--><!--vfw:tv-slides--><!--vfw:data-->', { events: [], specials: [], news: [], menu: { sections: [] } }, '2099-05-10', null, { shifts, settings: on });
  assert.ok(!page.includes('secret@example.org') && page.includes('id="vfw-data"') && !/"shifts"|responder/.test(page.match(/id="vfw-data">([^<]*)/)[1])); // the data script never carries shifts or settings
});
test('tvHtml: slides, 5-row split, today-only specials, no blank screen, escaped', () => {
  const today = '2026-10-19'; // a Monday
  const ev = (o) => ({ id: 'e' + o.title, category: 'Bar', recurring: 'none', enabled: true, description: 'First sentence. Second.', start: '19:00', end: '21:00', ...o });
  const state = {
    events: [ev({ title: 'Cornhole', date: today }), ev({ title: '<b>Big night</b>', date: '2026-11-07' }), ev({ title: 'Later', date: '2026-11-14' })],
    specials: [{ label: 'Mon deal', price: '$2', period: 'weekly', weekday: 1, enabled: true }, { label: 'Fri deal', price: '$3', period: 'weekly', weekday: 5, enabled: true }, { label: 'Hidden', period: 'daily', enabled: false }],
    menu: { hours: 'Mon 6:30 to 8 PM', sections: [{ name: 'Food', items: Array.from({ length: 10 }, (_, i) => ({ name: 'Item ' + i, price: '$' + i, available: i !== 9 })) }] },
  };
  const shifts = [{ id: 'a1b2c3', title: 'Flags', date: '2026-10-24', slots: 5, left: 2 }, { id: 'zzzz11', title: 'Past full', date: '2026-10-25', slots: 1, left: 0 }, { id: 'far111', title: 'Far', date: '2026-12-25', slots: 1, left: 1 }];
  const html = tvHtml(state, today, { shifts });
  assert.equal((html.match(/class="tv-slide"/g) ?? []).length, 5);
  assert.ok(html.includes('data-secs="20"') && html.includes('Mon deal') && !html.includes('Fri deal') && !html.includes('Hidden'));
  assert.ok(html.includes('7 PM to 9 PM') && html.includes('<p class="tv-note">First sentence.</p>'));
  assert.ok(html.includes('&lt;b&gt;Big night') && !html.includes('<b>Big'));
  assert.ok(html.includes('class="vfw-datebox tv-big"') && html.includes('2 spots left') && !html.includes('Far') && !html.includes('Past full'));
  assert.equal((html.match(/class="tv-row"/g) ?? []).length, 1 + 1 + 6 + 1 + 1); // tonight, specials, kitchen (6 max), coming up (1 more besides the big one), help
  const many = tvHtml({ events: Array.from({ length: 7 }, (_, i) => ev({ title: 'N' + i, date: today, start: '1' + i + ':00' })) }, today);
  assert.ok(many.includes('Tonight at the post (1 of 2)') && many.includes('(2 of 2)'));
  const none = tvHtml({}, today);
  assert.equal((none.match(/class="tv-slide"/g) ?? []).length, 1); // a fallback slide, never blank
});
test('audit fixes: specials in weekday order, "6 PM" times, merged line-dancing label', () => {
  const sp = (label, period, weekday = null) => ({ label, period, weekday, price: '', enabled: true, start: '', end: '' });
  const sorted = [sp('Season', 'seasonal'), sp('Fri', 'weekly', 5), sp('Sun', 'weekly', 0), sp('Wed', 'weekly', 3), sp('Mon', 'weekly', 1), sp('Month', 'monthly'), sp('Daily', 'daily')].sort(specialOrder).map((s) => s.label);
  assert.deepEqual(sorted, ['Daily', 'Mon', 'Wed', 'Fri', 'Sun', 'Month', 'Season']);
  const html = specialsHtml([sp('Fri', 'weekly', 5), sp('Wed', 'weekly', 3)], '2026-10-20');
  assert.ok(html.indexOf('Wed') < html.indexOf('Fri'));
  assert.match(upcomingHtml([{ id: 'x1x1', title: 'T', date: '2026-10-20', start: '18:00', end: '22:00', recurring: 'none', category: 'Bar', enabled: true }], '2026-10-19'), /6 PM to 10 PM/);
  const ld = (date) => ({ id: 'ld' + date, title: 'Line dancing', date, start: '18:00', end: '22:00', description: 'DJ', recurring: 'monthly_weekday', category: 'Auxiliary', enabled: true });
  const reg = regularHtml([ld('2026-10-05'), ld('2026-10-19'), ld('2026-10-26')]);
  assert.ok(reg.includes('1st, 3rd and 4th Monday of the month') && !reg.includes('Monday of the month, '));
  assert.ok(regularHtml([ld('2026-10-05'), ld('2026-10-19')]).includes('1st and 3rd Monday of the month'));
});

// ---------- database: retention ----------
test('retention: help requests after 90 days, shifts and sign-ups a week after the date', () => {
  const db = openDb(':memory:');
  const now = Date.UTC(2026, 9, 20, 12);
  const help = db.prepare("INSERT INTO help_requests (at, day, name, kind) VALUES (?, '2026-01-01', 'A', 'ride')");
  help.run(now - 91 * 864e5); help.run(now - 89 * 864e5);
  assert.equal(purgeHelp(db, now), 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM help_requests').get().n, 1);
  const sh = db.prepare("INSERT INTO shifts (id, title, date, slots, created_at) VALUES (?, 'S', ?, 3, 0)");
  sh.run('old11', '2026-10-12'); sh.run('edge1', '2026-10-13'); sh.run('new11', '2026-10-30');
  const su = db.prepare("INSERT INTO shift_signups (shift_id, at, name) VALUES (?, 0, 'P')");
  su.run('old11'); su.run('old11'); su.run('edge1'); su.run('new11');
  assert.equal(purgeShifts(db, '2026-10-13'), 1); // cutoff = today minus 7 days: strictly older goes
  assert.deepEqual(db.prepare('SELECT shift_id FROM shift_signups ORDER BY id').all().map((r) => r.shift_id), ['edge1', 'new11']);
  setSettings(db, { helpEnabled: true });
  assert.equal(getSettings(db).helpEnabled, true);
  assert.equal(getSettings(db).donateUrl, '');
});

// ---------- the real server ----------
const REPO = join(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'vfw-r3-'));
const dist = join(tmp, 'dist');
const seed = join(tmp, 'seed');
mkdirSync(seed);
for (const [dir, body] of [['tv', '<main id="tv-slides"><!--vfw:tv-slides--></main>'], ['volunteer', '<main><!--vfw:volunteer-board--></main>'], ['help', '<main><!--vfw:help-form--></main>'], ['support', '<main><!--vfw:donate-link--><!--vfw:data--></main>']]) {
  mkdirSync(join(dist, dir), { recursive: true });
  writeFileSync(join(dist, dir, 'index.html'), body);
}
mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main>home</main>');
let proc, origin, cookie = '';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 test' };
before(async () => {
  proc = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: '0', DATA_DIR: join(tmp, 'data'), DIST_DIR: dist, SEED_DIR: seed, ALLOW_DEFAULT_ADMIN: '1', POST_EMAIL: 'post@example.org', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((ok, no) => { proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); }); proc.on('exit', (c) => no(new Error(`server exited ${c}`))); });
  origin = `http://localhost:${port}`;
  const r = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { proc?.kill(); try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {} }); // Windows may still hold the db file for a moment
const call = (method, path, body, headers = {}) => fetch(origin + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const admin = (method, path, body) => call(method, `/api/admin/${path}`, body, { Origin: origin, Cookie: cookie });
const pub = (path, body, headers = {}) => call('POST', path, body, { Origin: origin, ...headers });
const day = (n) => etDay(new Date(Date.now() + n * 864e5));
const outbox = () => { try { return readdirSync(join(tmp, 'data', 'outbox')).map((f) => readFileSync(join(tmp, 'data', 'outbox', f), 'utf8')); } catch { return []; } };
let shiftId;

test('admin shifts: create, validation, edit, slots below sign-ups refused; needs sign-in and origin', async () => {
  assert.equal((await call('GET', '/api/admin/shifts')).status, 401);
  assert.equal((await call('PUT', '/api/admin/shifts/new', { title: 'x' }, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  const base = { title: 'Flags at Sunset Memorial Park', date: day(5), start: '09:00', end: '11:00', slots: 2, notes: 'Meet at the gate.' };
  assert.equal((await (await admin('PUT', 'shifts/new', { ...base, date: day(-1) })).json()).error, 'past');
  assert.equal((await (await admin('PUT', 'shifts/new', { ...base, slots: 0 })).json()).error, 'slots');
  const r = await (await admin('PUT', 'shifts/new', base)).json();
  shiftId = r.item.id;
  assert.equal(r.shifts.length, 1);
  assert.equal((await admin('PUT', 'shifts/nope1234', base)).status, 404);
  const hidden = await (await admin('PUT', 'shifts/new', { ...base, title: 'Hidden', enabled: false })).json();
  assert.equal(hidden.item.enabled, false);
  const list = await (await admin('GET', 'shifts')).json();
  assert.deepEqual(list.shifts.map((s) => s.title), ['Flags at Sunset Memorial Park', 'Hidden']);
  assert.equal(list.shifts[0].filled, 0);
  assert.equal((await (await admin('PUT', `shifts/${hidden.item.id}`, { ...base, title: 'Hidden', enabled: false, notes: 'new' })).json()).item.notes, 'new');
});

test('volunteer board: public page lists only open shifts, no private data; sign-up works; full, duplicate, closed and unknown shift', async () => {
  const page = await (await call('GET', '/volunteer/', null, UA)).text();
  assert.ok(page.includes('Flags at Sunset Memorial Park') && page.includes('2 of 2 spots left') && !page.includes('Hidden'));
  const j = { shift: shiftId, name: 'Jane Smith', phone: '215-555-0100', email: '', website: '', _page: '/volunteer' };
  const ok = await pub('/api/volunteer', j);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual(body, { ok: true, shift: { title: 'Flags at Sunset Memorial Park', date: day(5) } });
  assert.equal((await (await pub('/api/volunteer', { ...j, phone: '(215) 555 0100' })).json()).ok, true); // same phone digits: ok, no new row
  assert.equal((await (await admin('GET', 'shifts')).json()).shifts[0].filled, 1);
  assert.equal((await (await pub('/api/volunteer', { ...j, name: 'Bob Jones', phone: '', email: 'bob@example.org' })).json()).ok, true);
  const full = await pub('/api/volunteer', { ...j, name: 'Late Lee', phone: '215-555-0199' });
  assert.deepEqual([full.status, (await full.json()).error], [400, 'full']);
  const after2 = await (await call('GET', '/volunteer/', null, UA)).text();
  assert.ok(after2.includes('Full, thank you') && !after2.includes('Jane') && !after2.includes('215-555-0100') && !after2.includes('bob@example.org')); // sign-ups never appear on the public page
  assert.equal((await (await pub('/api/volunteer', { ...j, shift: 'zzzz9999' })).json()).error, 'shift');
  assert.equal((await (await pub('/api/volunteer', { ...j, shift: 'x' })).json()).error, 'shift');
  assert.equal((await (await pub('/api/volunteer', { ...j, name: '' })).json()).error, 'name');
  assert.equal((await (await pub('/api/volunteer', { ...j, phone: '', email: '' })).json()).error, 'contact');
  assert.equal((await (await pub('/api/volunteer', { ...j, phone: '1' })).json()).error, 'phone');
  assert.equal((await (await pub('/api/volunteer', { ...j, phone: '', email: 'bad' })).json()).error, 'email');
  const sec = await (await admin('GET', 'security')).json();
  const types = sec.events.map((e) => e.type);
  assert.equal(types.filter((t) => t === 'volunteer_signup').length, 2);
  assert.ok(sec.events.filter((e) => e.type === 'volunteer_signup').every((e) => e.detail === 'Flags at Sunset Memorial Park' && !/Jane|Bob|555/.test(JSON.stringify(e)))); // no client text in the log
});

test('volunteer: bad origin, honeypot, closed shift, form post redirects (allow-listed), oversize body', async () => {
  const j = { shift: shiftId, name: 'Eve', phone: '215-555-0111', website: '', _page: '/volunteer' };
  const evil = await call('POST', '/api/volunteer', j, { Origin: 'http://evil.example' });
  assert.deepEqual([evil.status, (await evil.json()).error], [403, 'origin']);
  const spam = await pub('/api/volunteer', { ...j, website: 'http://spam.example' });
  assert.deepEqual([spam.status, await spam.json()], [200, { ok: true }]);
  assert.ok(!(await (await admin('GET', 'shifts')).json()).shifts[0].signups.some((s) => s.name === 'Eve'));
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'volunteer_honeypot'));
  // a shift whose date has passed (edit it to the past) refuses new claims
  const old = await (await admin('PUT', 'shifts/new', { title: 'Tomorrow', date: day(1), slots: 3 })).json();
  await admin('PUT', `shifts/${old.item.id}`, { title: 'Tomorrow', date: day(-2), slots: 3 });
  assert.equal((await (await pub('/api/volunteer', { ...j, shift: old.item.id })).json()).error, 'closed');
  assert.ok(!(await (await call('GET', '/volunteer/', null, UA)).text()).includes('Tomorrow'));
  const form = (extra) => call('POST', '/api/volunteer', null, { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }).then(() => fetch(`${origin}/api/volunteer`, { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ shift: shiftId, name: 'Pat', phone: '215-555-0122', _page: '/volunteer', ...extra }) }));
  const sent = await form({ shift: old.item.id });
  assert.deepEqual([sent.status, sent.headers.get('location')], [303, '/volunteer/?error=closed#signup']);
  const away = await form({ shift: 'zzzz9999', _page: 'https://evil.example/' });
  assert.equal(away.headers.get('location'), '/volunteer/?error=shift#signup'); // a visitor-supplied page is ignored
  const big = await call('POST', '/api/volunteer', { ...j, name: 'x'.repeat(300 * 1024) }, { Origin: origin });
  assert.equal(big.status, 413);
});

test('admin: who signed up, remove a person, delete a shift removes its sign-ups', async () => {
  const list = (await (await admin('GET', 'shifts')).json()).shifts.find((s) => s.id === shiftId);
  assert.deepEqual(list.signups.map((s) => s.name), ['Jane Smith', 'Bob Jones']);
  assert.ok(list.signups[0].phone && list.signups[1].email && list.signups[0].at);
  assert.equal((await (await admin('PUT', `shifts/${shiftId}`, { title: 'Flags', date: day(5), slots: 1 })).json()).error, 'slots_taken');
  assert.equal((await admin('DELETE', `signups/${list.signups[0].id}`)).status, 200);
  assert.equal((await admin('DELETE', `signups/${list.signups[0].id}`)).status, 404);
  assert.equal((await (await pub('/api/volunteer', { shift: shiftId, name: 'Late Lee', phone: '215-555-0199' })).json()).ok, true); // the spot is free again
  const del = await (await admin('DELETE', `shifts/${shiftId}`)).json();
  assert.ok(del.ok && !del.shifts.some((s) => s.id === shiftId));
  assert.equal((await admin('DELETE', `shifts/${shiftId}`)).status, 404);
  const sec = (await (await admin('GET', 'security')).json()).events;
  assert.ok(sec.some((e) => e.type === 'shifts_delete' && /2 signed up removed/.test(e.detail)) && sec.some((e) => e.type === 'signup_remove'));
});

test('/tv: not counted in stats, noindex and no-store, shows only public content', async () => {
  await admin('PUT', 'shifts/new', { title: 'TV shift', date: day(3), slots: 4 });
  const tv = await call('GET', '/tv/', null, UA);
  assert.equal(tv.status, 200);
  assert.equal(tv.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(tv.headers.get('cache-control'), 'no-store');
  const html = await tv.text();
  assert.ok(html.includes('class="tv-slide"') && html.includes('TV shift') && html.includes('4 spots left'));
  await call('GET', '/volunteer/', null, UA); // a normal page, counted
  const pages = (await (await admin('GET', 'stats?range=7d')).json()).pages.map((p) => p.path);
  assert.ok(pages.includes('/volunteer') && !pages.some((p) => p.startsWith('/tv')));
});

test('help form: rejected while off (403), the page shows the call panel', async () => {
  const page = await (await call('GET', '/help/', null, UA)).text();
  assert.ok(page.includes('vfw-help-off') && !page.includes('<form'));
  const r = await pub('/api/help-request', { name: 'Sam', phone: '215-555-0100', kind: 'ride' });
  assert.deepEqual([r.status, (await r.json()).error], [403, 'off']);
  assert.equal((await (await admin('GET', 'help')).json()).requests.length, 0);
  const form = await fetch(`${origin}/api/help-request`, { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Sam', _page: '/help' }) });
  assert.equal(form.headers.get('location'), '/help/?error=off#request');
});

test('settings: validation, https-only donation link, form cannot be turned on without a responder, nothing private on public pages', async () => {
  assert.equal((await call('GET', '/api/admin/settings')).status, 401);
  assert.equal((await (await admin('PUT', 'settings', { helpEnabled: true })).json()).error, 'responder');
  assert.equal((await (await admin('PUT', 'settings', { donateUrl: 'http://pay.example/' })).json()).error, 'donateUrl');
  assert.equal((await (await admin('PUT', 'settings', { donateUrl: 'javascript:alert(1)' })).json()).error, 'donateUrl');
  assert.equal((await (await admin('PUT', 'settings', { responderEmail: 'bad' })).json()).error, 'responderEmail');
  assert.ok(!(await (await call('GET', '/support/', null, UA)).text()).includes('btn')); // no link yet: no donate block
  const s = await (await admin('PUT', 'settings', { helpEnabled: true, responderName: 'Bill Zuk', responderRole: 'Post Service Officer', responderEmail: 'bill@example.org', donateUrl: 'https://pay.example/give', donateLabel: '' })).json();
  assert.equal(s.settings.donateUrl, 'https://pay.example/give');
  assert.equal((await (await admin('GET', 'settings')).json()).settings.responderEmail, 'bill@example.org');
  const support = await (await call('GET', '/support/', null, UA)).text();
  assert.ok(support.includes('href="https://pay.example/give"') && support.includes('Donate online'));
  assert.ok(!support.includes('bill@example.org') && !support.includes('responder'));
  const help = await (await call('GET', '/help/', null, UA)).text();
  assert.ok(help.includes('action="/api/help-request"') && help.includes('Bill Zuk, Post Service Officer') && !help.includes('bill@example.org'));
  const sec = (await (await admin('GET', 'security')).json()).events.find((e) => e.type === 'settings_update');
  assert.ok(sec && !/bill@|pay\.example/.test(sec.detail));
});

test('help request: stored, emailed without the message, honeypot, validation, admin inbox, handle and delete', async () => {
  const j = { name: 'Sam Veteran', phone: '215-555-0100', email: 'sam@example.org', kind: 'ride', bestTime: 'evening', message: 'SECRET-MESSAGE-TEXT', website: '', _page: '/help' };
  const ok = await pub('/api/help-request', j);
  assert.deepEqual([ok.status, await ok.json()], [200, { ok: true, responder: 'Bill Zuk' }]);
  const mail = outbox().find((m) => /New help request/.test(m));
  assert.ok(mail && /To: bill@example\.org/.test(mail) && /A ride to a VA appointment/.test(mail) && /215-555-0100/.test(mail) && /From: Sam\b/.test(mail) && !/Veteran/.test(mail.replace(/Subject.*/g, '')) && !mail.includes('SECRET-MESSAGE-TEXT') && /Help requests/.test(mail));
  const spam = await pub('/api/help-request', { ...j, name: 'Bot', website: 'http://spam.example' });
  assert.deepEqual([spam.status, (await spam.json()).ok], [200, true]);
  for (const [patch, err] of [[{ name: '' }, 'name'], [{ phone: '', email: '' }, 'contact'], [{ phone: '12' }, 'phone'], [{ email: 'bad' }, 'email'], [{ kind: 'x' }, 'kind'], [{ bestTime: 'x' }, 'bestTime']])
    assert.equal((await (await pub('/api/help-request', { ...j, ...patch })).json()).error, err);
  assert.equal((await call('POST', '/api/help-request', j, { Origin: 'http://evil.example' })).status, 403);
  const inbox = await (await admin('GET', 'help')).json();
  assert.equal(inbox.enabled, true);
  assert.equal(inbox.requests.length, 1);
  const r = inbox.requests[0];
  assert.deepEqual([r.name, r.kind, r.kindLabel, r.bestTime, r.message, r.handled], ['Sam Veteran', 'ride', 'A ride to a VA appointment', 'evening', 'SECRET-MESSAGE-TEXT', false]);
  assert.equal((await (await admin('GET', 'state')).json()).newHelp, 1);
  assert.equal((await admin('PUT', `help/${r.id}`, { handled: true })).status, 200);
  assert.equal((await (await admin('GET', 'state')).json()).newHelp, 0);
  const sec = (await (await admin('GET', 'security')).json()).events;
  assert.ok(sec.some((e) => e.type === 'help_request' && e.detail === '') && sec.some((e) => e.type === 'help_honeypot') && sec.some((e) => e.type === 'help_update'));
  assert.ok(!JSON.stringify(sec).includes('SECRET-MESSAGE-TEXT') && !JSON.stringify(sec).includes('Sam Veteran'));
  // no private data on any public page or the data script
  for (const p of ['/', '/help/', '/volunteer/', '/support/', '/tv/']) { const t = await (await call('GET', p, null, UA)).text(); assert.ok(!/SECRET-MESSAGE|Sam Veteran|sam@example|bill@example/.test(t), p); }
  // turning the form off again rejects new posts
  await admin('PUT', 'settings', { helpEnabled: false, responderName: 'Bill Zuk' });
  assert.equal((await pub('/api/help-request', j)).status, 403);
  await admin('PUT', 'settings', { helpEnabled: true, responderName: 'Bill Zuk' });
  assert.equal((await admin('DELETE', `help/${r.id}`)).status, 200);
  assert.equal((await admin('DELETE', `help/${r.id}`)).status, 404);
  assert.equal((await admin('PUT', 'help/abc', { handled: true })).status, 404);
});

test('rate limits: help 3 per hour per address (429 then), volunteer 10', async () => {
  // the earlier test used 1 help request that counted; two more are allowed, the next is refused
  const j = (i) => ({ name: 'Rate ' + i, phone: '215-555-02' + String(10 + i), kind: 'visit' });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await pub('/api/help-request', j(i))).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
  assert.equal((await (await pub('/api/help-request', j(9))).json()).error, 'rate');
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'help_rate_limited'));
  const s = await (await admin('PUT', 'shifts/new', { title: 'Rate shift', date: day(2), slots: 100 })).json();
  const used = 3; // sign-ups made earlier from this address that were counted: 4 (Jane, Jane again, Bob, Late Lee) plus Late Lee later; count by trying
  let limited = 0, okCount = 0;
  for (let i = 0; i < 14; i++) { const r = await pub('/api/volunteer', { shift: s.item.id, name: 'V' + i, phone: '215-555-03' + String(10 + i) }); r.status === 429 ? limited++ : okCount++; }
  assert.ok(limited > 0 && okCount > 0 && okCount + used >= 1);
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'volunteer_rate_limited'));
});
test('regularHtml links bingo and line dancing nights to their first-visit guide', () => {
  const e = (title) => ({ id: 'g' + title.length, title, date: '2026-10-19', start: '18:00', end: '', description: '', recurring: 'weekly', category: 'Auxiliary', enabled: true });
  const html = regularHtml([e('Thursday Bingo'), e('Line dancing'), e('Cornhole')]);
  assert.ok(html.includes('href="/events/first-visit#bingo"') && html.includes('#line-dancing'));
  assert.equal((html.match(/vfw-guide-link/g) ?? []).length, 2);
});
