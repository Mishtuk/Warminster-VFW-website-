import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { adminRow, allow, checkLogin, clearFailures, clientIp, cookieHeader, defaultInUse, locked, passwordProblem, recordFailure, sameOrigin, seedAdmin, setPassword, signSession, verifySession } from '../src/auth.js';

const SECRET = 'test-secret';

test('seed: admin/admin only when allowed, else env password, else a random one; seeds once', () => {
  const a = openDb(':memory:');
  assert.deepEqual(seedAdmin(a, { allowDefault: true }), { username: 'admin', password: 'admin', generated: false });
  assert.equal(defaultInUse(a), true);
  assert.equal(seedAdmin(a, { allowDefault: true }), null);
  const b = openDb(':memory:');
  assert.equal(seedAdmin(b, { password: 'a-long-password' }).generated, false);
  assert.ok(checkLogin(b, 'admin', 'a-long-password'));
  assert.equal(checkLogin(b, 'admin', 'admin'), null);
  assert.equal(defaultInUse(b), false);
  const c = openDb(':memory:');
  const g = seedAdmin(c, {});
  assert.ok(g.generated && g.password.length >= 10 && g.password !== 'admin');
  assert.ok(checkLogin(c, 'admin', g.password));
});

test('login: right user + password only, case-insensitive username', () => {
  const db = openDb(':memory:');
  seedAdmin(db, { allowDefault: true });
  assert.ok(checkLogin(db, ' Admin ', 'admin'));
  assert.equal(checkLogin(db, 'admin', 'nope'), null);
  assert.equal(checkLogin(db, 'root', 'admin'), null);
  assert.equal(checkLogin(db, 'admin', undefined), null);
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
  assert.equal(clientIp({ headers: new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9:5000' }) }), '203.0.113.9');
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
