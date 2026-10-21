import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST, POST_DEFAULTS, setPost, validatePost } from '../src/lib/post.js';
import { upcomingHtml } from '../src/lib/state.js';
import { createSiteBuilder } from '../src/site-build.js';
import { openDb, getContent, setContent, getState } from '../src/db.js';

const BASE = join(import.meta.dirname, '..', '.claude', 'work', 'tmp');

test('Post details: defaults pass, bad input is refused with a plain reason, text is tidied', () => {
  assert.ok(validatePost(POST_DEFAULTS).value, 'the built-in facts are valid');
  const ok = (over) => validatePost({ ...POST_DEFAULTS, ...over });
  assert.equal(ok({ phone: '(215) 555 0100' }).value.phone, '215-555-0100');
  assert.equal(ok({ phone: '555-0100' }).error, 'phone');
  assert.equal(ok({ email: 'not an email' }).error, 'email');
  assert.equal(ok({ facebook: 'http://x.com' }).error, 'facebook');
  assert.equal(ok({ commander: 'Bill <b>' }).error, 'commander');
  assert.equal(ok({ hours: [['Fri', '4 PM to 12 AM']] }).error, 'hours', 'days must be written out');
  assert.equal(ok({ hours: [] }).error, 'hours');
  assert.deepEqual(ok({ hours: [['Friday', '4 PM to 12 AM'], ['', '']] }).value.hours, [['Friday', '4 PM to 12 AM']], 'empty lines dropped');
  assert.equal(ok({ commander: '  Bill   "Z" O\'Neil ' }).value.commander, 'Bill “Z” O’Neil', 'no straight quotes, so safe in attributes');
  assert.equal(ok({ entrance: '' }).value.entrance, null, 'optional and empty = unknown');
  assert.equal(ok({ membership: '' }).error, 'membership');
  assert.equal(ok({ region: 'pa' }).value.region, 'PA');
});

test('setPost: every derived fact and the live renderers follow a saved change, and it can be undone', () => {
  try {
    setPost({ phone: '215-555-0100', parking: 'Lot behind the hall.', nonsense: 'ignored' });
    assert.equal(POST.tel, 'tel:+12155550100');
    assert.equal(POST.callText, 'Call the post 215-555-0100');
    assert.equal(POST.gettingHere[0].text, 'Lot behind the hall.');
    assert.equal(POST.nonsense, undefined);
    assert.match(upcomingHtml([], '2030-01-01'), /215-555-0100/, 'module-level strings are not frozen at import');
  } finally { setPost({}); }
  assert.equal(POST.phone, POST_DEFAULTS.phone);
});

test('content lives in the database under content:*, separate from the public state', () => {
  mkdirSync(BASE, { recursive: true });
  const dir = mkdtempSync(join(BASE, 'ct-'));
  try {
    const db = openDb(dir);
    setContent(db, 'post', { phone: '215-555-0100' });
    assert.deepEqual(getContent(db), { post: { phone: '215-555-0100' } });
    assert.equal(JSON.stringify(getState(db)).includes('555-0100'), false);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A stand-in for `astro build`: writes index.html with the content it was given, or fails when the content says so.
const FAKE = `const fs = require('fs'), path = require('path'); const out = process.argv[process.argv.indexOf('--outDir') + 1];
const c = JSON.parse(fs.readFileSync(process.env.VFW_CONTENT, 'utf8')); if (c.fail) process.exit(1);
fs.mkdirSync(out, { recursive: true }); setTimeout(() => fs.writeFileSync(path.join(out, 'index.html'), JSON.stringify(c)), 50);`;

test('site builder: a good build goes live, a failed one keeps the old site, saves during a build queue one more', async () => {
  mkdirSync(BASE, { recursive: true });
  const root = mkdtempSync(join(BASE, 'sb-'));
  try {
    const dist = join(root, 'dist'), data = join(root, 'data'), fake = join(root, 'fake.cjs');
    mkdirSync(dist); writeFileSync(join(dist, 'index.html'), 'deployed'); writeFileSync(fake, FAKE);
    let content = {};
    const mk = () => createSiteBuilder({ root, data, dist, getContent: () => content, cmd: [process.execPath, fake], keep: 1 });
    const site = mk();
    site.start();
    assert.equal(site.live(), dist, 'nothing saved: the deployed build, and no rebuild');
    assert.equal(site.status().building, false);

    content = { post: { phone: 'one' } };
    await site.rebuild();
    const first = site.live();
    assert.notEqual(first, dist);
    assert.match(readFileSync(join(first, 'index.html'), 'utf8'), /one/);

    content = { fail: true };
    await site.rebuild();
    assert.equal(site.live(), first, 'failed build: still the last good one');
    assert.equal(site.status().last.ok, false);

    content = { post: { phone: 'two' } };
    const a = site.rebuild(); content = { post: { phone: 'three' } }; const b = site.rebuild();
    assert.equal(a, b, 'one queue');
    await b;
    assert.match(readFileSync(join(site.live(), 'index.html'), 'utf8'), /three/, 'the queued build has the newest save');
    assert.equal(existsSync(first), false, 'old builds pruned');

    const again = mk(); again.start(); // a restart serves the newest finished build
    assert.equal(again.live(), site.live());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
