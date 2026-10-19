import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createInquiryHandler } from '../src/email/index.js';

const form = { name: 'Pat Smith', phone: '215-555-0100', email: 'pat@example.org', eventDate: '2027-01-02', eventType: 'Birthday', guests: '60', message: 'Do you have a stage?' };
const setup = (env = { POST_EMAIL: 'post@example.org' }, extra = {}) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'vfw-'));
  const db = openDb(':memory:');
  return { db, dataDir, submit: createInquiryHandler({ db, env, dataDir, ...extra }), rows: () => db.prepare('SELECT * FROM inquiries').all() };
};

test('valid inquiry is stored and written to the outbox as .eml when there is no SMTP_URL', async () => {
  const { submit, rows, dataDir } = setup();
  const r = await submit(form, '198.51.100.1');
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  const [row] = rows();
  assert.equal(row.name, 'Pat Smith');
  assert.equal(row.guests, 60);
  assert.equal(row.emailed, 1);
  const files = readdirSync(join(dataDir, 'outbox'));
  assert.equal(files.length, 1);
  const eml = readFileSync(join(dataDir, 'outbox', files[0]), 'utf8');
  assert.match(eml, /To: post@example\.org/);
  assert.match(eml, /Reply-To: pat@example\.org/);
  assert.match(eml, /Do you have a stage\?/);
});

test('invalid input is refused with the field name and nothing is stored', async () => {
  const { submit, rows } = setup();
  const r = await submit({ ...form, phone: '', email: '' }, '198.51.100.2');
  assert.deepEqual([r.status, r.body.error], [400, 'contact']);
  assert.equal((await submit({ ...form, name: '' }, '198.51.100.2')).body.error, 'name');
  assert.equal(rows().length, 0);
});

test('honeypot: looks successful, stores and sends nothing', async () => {
  const sent = [];
  const { submit, rows } = setup(undefined, { send: async (m) => sent.push(m) });
  const r = await submit({ ...form, website: 'http://spam.example' }, '198.51.100.3');
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  assert.equal(rows().length, 0);
  assert.equal(sent.length, 0);
});

test('rate limit: 5 per address per hour, then 429', async () => {
  const { submit, rows } = setup(undefined, { send: async () => {} });
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await submit(form, '198.51.100.4')).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(rows().length, 5);
  assert.equal((await submit(form, '198.51.100.5')).status, 200); // another address is fine
});

test('mail failure keeps the inquiry (emailed = 0); no POST_EMAIL writes a placeholder .eml', async () => {
  const a = setup(undefined, { send: async () => { throw new Error('smtp down'); }, log: () => {} });
  assert.equal((await a.submit(form, '198.51.100.6')).status, 200);
  assert.equal(a.rows()[0].emailed, 0);
  const b = setup({}, { log: () => {} });
  assert.equal((await b.submit(form, '198.51.100.7')).status, 200);
  assert.equal(b.rows().length, 1);
  assert.equal(b.rows()[0].emailed, 1); // no SMTP_URL: still written to the outbox, with a placeholder To
  assert.equal(readdirSync(join(b.dataDir, 'outbox')).length, 1);
  const c = setup({ SMTP_URL: 'smtp://x' }, { log: () => {}, send: async () => { throw new Error('no'); } });
  await c.submit(form, '198.51.100.8');
  assert.equal(c.rows()[0].emailed, 0);
});
