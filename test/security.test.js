import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, purgeInquiries, retentionDays } from '../src/db.js';
import { clean, createAudit } from '../src/audit.js';
import { dataDirProblem, signSession, startupProblem } from '../src/auth.js';

const CRLF = String.fromCharCode(13, 10);
const ESC = String.fromCharCode(27);

test('log injection: control characters in user values are flattened, so no forged log lines', () => {
  const evil = `admin${CRLF}2026-01-01 security: login_ok who=admin${ESC}[31m${String.fromCharCode(0)}${String.fromCharCode(0x2028)}x`;
  const out = clean(evil);
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(out));
  assert.ok(out.startsWith('admin 2026-01-01 security: login_ok'));
  assert.equal(clean('a'.repeat(500), 80).length, 80);
  assert.equal(clean(null), '');
});

test('audit: every field is cleaned before it is stored or printed; newest first; capped', () => {
  const db = openDb(':memory:');
  const printed = [];
  const audit = createAudit({ db, log: (m) => printed.push(m) });
  audit.event('login_fail', `bob${CRLF}FAKE LINE`, `1.2.3.4${CRLF}x`, `wrong${CRLF}password`, 1000);
  assert.equal(printed.length, 1);
  assert.ok(!printed[0].includes(CRLF) && !printed[0].includes(String.fromCharCode(10)));
  const [row] = audit.recent();
  assert.deepEqual([row.type, row.who, row.ip, row.detail], ['login_fail', 'bob FAKE LINE', '1.2.3.4 x', 'wrong password']);
  for (let i = 0; i < 520; i++) audit.event('e', 'w', '', String(i), 2000 + i);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM security_events').get().n, 500);
  assert.equal(audit.recent(50).length, 50);
  assert.equal(audit.recent(1)[0].detail, '519');
});

test('session cookies carry 128 random bits: two sessions for the same login differ', () => {
  const a = signSession('admin', 1e13, 's', 0), b = signSession('admin', 1e13, 's', 0);
  assert.notEqual(a, b);
});

test('web root: DATA_DIR and .env may not be inside dist/', () => {
  assert.match(dataDirProblem('/srv/app/dist', '/srv/app/dist', ''), /inside the web root/);
  assert.match(dataDirProblem('/srv/app/dist/data', '/srv/app/dist', ''), /inside the web root/);
  assert.match(dataDirProblem('/srv/data', '/srv/app/dist', '/srv/app/dist/.env'), /\.env/);
  assert.equal(dataDirProblem('/srv/app/dist-data', '/srv/app/dist', '/srv/app/.env'), null); // sibling with a similar name is fine
  assert.equal(dataDirProblem('/home/data', '/srv/app/dist', '/srv/app/.env'), null);
});

test('production needs a 32+ character SESSION_SECRET', () => {
  assert.match(startupProblem({ SESSION_SECRET: 'short' }, true), /SESSION_SECRET/);
  assert.equal(startupProblem({ SESSION_SECRET: 'x'.repeat(32) }, true), null);
  assert.equal(startupProblem({}, true), null, 'unset: the server makes and keeps its own');
});

test('retention: default 365, bad values fall back; purge deletes only older inquiries', () => {
  assert.deepEqual([retentionDays(undefined), retentionDays(''), retentionDays('0'), retentionDays('abc'), retentionDays('-5'), retentionDays('30')], [365, 365, 365, 365, 365, 30]);
  const db = openDb(':memory:');
  const now = Date.UTC(2027, 0, 1);
  const add = (daysAgo, name) => db.prepare('INSERT INTO inquiries (at, day, name) VALUES (?, ?, ?)').run(now - daysAgo * 864e5, '2026-01-01', name);
  add(400, 'old'); add(366, 'older'); add(364, 'recent'); add(0, 'today');
  assert.equal(purgeInquiries(db, 365, now), 2);
  assert.deepEqual(db.prepare('SELECT name FROM inquiries ORDER BY id').all().map((r) => r.name), ['recent', 'today']);
  assert.equal(purgeInquiries(db, 365, now), 0);
});
