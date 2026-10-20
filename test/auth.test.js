import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { adminRow, allow, checkLogin, clearFailures, clientIp, cookieHeader, defaultInUse, locked, passwordProblem, pickIp, readCookie, recordFailure, sameOrigin, seedAdmin, setPassword, signSession, startupProblem, verifySession } from '../src/auth.js';

const SECRET = 'test-secret';

test('seed: admin/admin only when allowed, else env password, else a random one; seeds once', async () => {
  const a = openDb(':memory:');
  assert.deepEqual(seedAdmin(a, { allowDefault: true }), { username: 'admin', password: 'admin', generated: false });
  assert.equal(defaultInUse(a), true);
  assert.equal(seedAdmin(a, { allowDefault: true }), null);
  const b = openDb(':memory:');
  assert.equal(seedAdmin(b, { password: 'a-long-password' }).generated, false);
  assert.ok(await checkLogin(b, 'admin', 'a-long-password'));
  assert.equal(await checkLogin(b, 'admin', 'admin'), null);
  assert.equal(defaultInUse(b), false);
  const c = openDb(':memory:');
  const g = seedAdmin(c, {});
  assert.ok(g.generated && g.password.length >= 10 && g.password !== 'admin');
  assert.ok(await checkLogin(c, 'admin', g.password));
});

test('login: right user + password only, case-insensitive username', async () => {
  const db = openDb(':memory:');
  seedAdmin(db, { allowDefault: true });
  assert.ok(await checkLogin(db, ' Admin ', 'admin'));
  assert.equal(await checkLogin(db, 'admin', 'nope'), null);
  assert.equal(await checkLogin(db, 'root', 'admin'), null);
  assert.equal(await checkLogin(db, 'admin', undefined), null);
});

test('change password: rules, ends other sessions, clears default flag', () => {
  const db = openDb(':memory:');
  seedAdmin(db, { allowDefault: true });
  assert.equal(setPassword(db, 'short').error, 'too_short');
  const old = signSession('admin', Date.now() + 1e6, SECRET, 0);
  assert.equal(verifySession(old, SECRET, { name: 'admin', version: 0 }), 'admin');
  assert.equal(setPassword(db, 'administrator').value, 'admin'); // long enough and not "admin": fine
  assert.equal(adminRow(db).session_v, 1);
  assert.equal(verifySession(old, SECRET, { name: 'admin', version: adminRow(db).session_v }), null);
  assert.equal(defaultInUse(db), false);
  assert.equal(setPassword(db, 'administrator').error, 'same');
  assert.equal(passwordProblem('admin'), 'too_short');
  assert.equal(passwordProblem('passwordpassword'), null);
  assert.equal(passwordProblem('x'.repeat(201)), 'too_long');
});

test('session cookie: forged, tampered, expired and wrong-name values are refused', () => {
  const k = { name: 'admin', version: 0 };
  const good = signSession('admin', Date.now() + 1e6, SECRET, 0);
  assert.equal(verifySession(good, SECRET, k), 'admin');
  assert.equal(verifySession(good, 'other-secret', k), null);
  assert.equal(verifySession(good.slice(0, -2) + 'xx', SECRET, k), null);
  assert.equal(verifySession(signSession('admin', Date.now() - 1, SECRET, 0), SECRET, k), null);
  assert.equal(verifySession(signSession('mallory', Date.now() + 1e6, SECRET, 0), SECRET, k), null);
  assert.equal(verifySession('', SECRET, k), null);
  assert.equal(verifySession(`${good}.extra`, SECRET, k), null);
});

test('cookie flags, same-origin check, client ip', () => {
  const c = cookieHeader('v', { secure: true });
  assert.ok(c.includes('HttpOnly') && c.includes('SameSite=Strict') && c.includes('Secure'));
  assert.ok(!cookieHeader('v', { secure: false }).includes('Secure'));
  const req = (origin) => ({ headers: new Headers(origin ? { origin } : {}) });
  assert.equal(sameOrigin(req('https://a.org'), 'https://a.org', 'https://b.org'), true);
  assert.equal(sameOrigin(req('https://evil.org'), 'https://a.org'), false);
  assert.equal(sameOrigin(req(null), 'https://a.org'), false);
});

test('rate limits: lockout after 5 failures, hourly allowance', () => {
  const now = 1e12;
  for (let i = 0; i < 4; i++) recordFailure('ip:t1', now);
  assert.equal(locked('ip:t1', now), false);
  recordFailure('ip:t1', now);
  assert.equal(locked('ip:t1', now + 1000), true);
  assert.equal(locked('ip:t1', now + 16 * 60e3), false);
  clearFailures('ip:t1');
  const ok = Array.from({ length: 4 }, () => allow('k-test', 3, now));
  assert.deepEqual(ok, [true, true, true, false]);
  assert.equal(allow('k-test', 3, now + 3600e3 + 1), true);
});

test('M1 lockout backoff: per address and per username+address; one stranger cannot lock the real admin out', () => {
  const t = 2e12;
  for (let i = 0; i < 5; i++) recordFailure('user:admin|6.6.6.6', t); // an attacker's address
  assert.equal(locked('user:admin|6.6.6.6', t + 1), true);
  assert.equal(locked('user:admin|9.9.9.9', t + 1), false); // the real admin, other address
  assert.equal(locked('ip:9.9.9.9', t + 1), false);
  assert.equal(locked('user:admin|6.6.6.6', t + 61e3), false); // first lock: 1 minute
  for (let i = 0; i < 5; i++) recordFailure('user:admin|6.6.6.6', t + 61e3);
  assert.equal(locked('user:admin|6.6.6.6', t + 61e3 + 119e3), true); // second lock: 2 minutes
  assert.equal(locked('user:admin|6.6.6.6', t + 61e3 + 121e3), false);
  for (let i = 0; i < 40; i++) recordFailure('ip:caps', t);
  assert.equal(locked('ip:caps', t + 15 * 60e3 + 1), false); // never longer than 15 minutes
});

test('M1 unknown usernames take the same async path (no early return) and do not throw', async () => {
  const db = openDb(':memory:');
  seedAdmin(db, { allowDefault: true });
  const t0 = Date.now();
  const [a, b] = await Promise.all([checkLogin(db, 'nobody', 'x'), checkLogin(db, 'admin', 'x')]);
  assert.deepEqual([a, b], [null, null]);
  assert.ok(Date.now() - t0 >= 10); // scrypt really ran for the unknown name
});

test('M2 client address: header ignored unless TRUST_PROXY=1', () => {
  const was = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;
    assert.equal(pickIp('1.2.3.4', '10.0.0.5'), '10.0.0.5');
    assert.equal(clientIp({ headers: new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-vfw-peer': '10.0.0.5' }) }), '10.0.0.5');
    assert.equal(pickIp('1.2.3.4', ''), 'unknown');
    process.env.TRUST_PROXY = '1';
    assert.equal(pickIp('9.9.9.9, 203.0.113.9:5000', '10.0.0.5'), '203.0.113.9');
    assert.equal(pickIp('', '10.0.0.5'), '10.0.0.5');
  } finally { if (was === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = was; }
});

test('M3 production refuses weak startup settings', () => {
  assert.match(startupProblem({ ALLOW_DEFAULT_ADMIN: '1', SESSION_SECRET: 'x'.repeat(32) }, true), /ALLOW_DEFAULT_ADMIN/);
  assert.equal(startupProblem({ ALLOW_DEFAULT_ADMIN: '1' }, false), null);
  assert.match(startupProblem({ ADMIN_PASSWORD: 'elevenchars', SESSION_SECRET: 'x'.repeat(32) }, true), /ADMIN_PASSWORD/);
  assert.equal(startupProblem({ ADMIN_PASSWORD: 'twelve-chars', SESSION_SECRET: 'x'.repeat(32) }, true), null);
  assert.match(startupProblem({ ADMIN_PASSWORD: 'admin' }, false), /ADMIN_PASSWORD/);
  assert.equal(startupProblem({ SESSION_SECRET: 'x'.repeat(32) }, true), null);
});

test('L9 cookie: host-locked name over https, plain name otherwise; the other name is not read', () => {
  assert.ok(cookieHeader('v', { secure: true }).startsWith('__Host-vfw_admin=v;'));
  assert.ok(cookieHeader('v', { secure: false }).startsWith('vfw_admin=v;'));
  assert.equal(readCookie('a=1; __Host-vfw_admin=tok', true), 'tok');
  assert.equal(readCookie('vfw_admin=planted', true), null);
  assert.equal(readCookie('vfw_admin=tok', false), 'tok');
});
