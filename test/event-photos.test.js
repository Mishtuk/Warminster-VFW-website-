import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { eventPhoto, eventPhotos } from '../src/lib/event-photos.js';
import { featuredHtml } from '../src/lib/state.js';

const events = JSON.parse(readFileSync(new URL('../src/content/events.json', import.meta.url), 'utf8'));
const photoFile = (name, tail) => new URL(`../public/media/photos/${name}${tail}`, import.meta.url);

test('every event gets photos that exist on disk, with alt text; one photo or a bundle of three to four', () => {
  for (const o of events) {
    const list = eventPhotos(o);
    assert.ok([1, 3, 4].includes(list.length), `${o.title}: ${list.length} photos`);
    assert.equal(new Set(list.map((p) => p.name)).size, list.length, `${o.title}: repeated photo`);
    for (const p of list) {
      assert.ok(p.alt && !/[()\[\]]/.test(p.alt), `${o.title}: alt for ${p.name}`);
      assert.ok(existsSync(photoFile(p.name, '.webp')) && existsSync(photoFile(p.name, '-800.webp')), `${o.title}: missing ${p.name}`);
    }
    assert.deepEqual(eventPhoto(o), list[0]);
  }
});

test('Cash Bash shows prizes and the hall, not the large check', () => {
  const names = eventPhotos({ title: 'Auxiliary Cash Bash', category: 'Auxiliary' }).map((p) => p.name);
  assert.ok(names.length >= 3 && !names.includes('hero-check'));
});

test('unknown titles fall back by category, then to the building', () => {
  assert.equal(eventPhoto({ title: 'Something new', category: 'Community' }).name, 'hero-june-group');
  assert.equal(eventPhoto({ title: 'Something new', category: 'Nope' }).name, 'hall-01');
  assert.equal(eventPhoto({}).name, 'hall-01');
});

test('featured block stacks a bundle (first photo on, the rest silent) and leaves a single photo plain', () => {
  const ev = (o) => ({ id: 'x1', date: '2026-10-24', start: '18:00', end: '', description: '', recurring: 'none', category: 'Auxiliary', enabled: true, ...o });
  const bundle = featuredHtml([ev({ title: 'Auxiliary Cash Bash' }), ev({ id: 'x2', title: 'Thursday Bingo', date: '2026-10-25' })], '2026-10-20');
  const fig = bundle.match(/<figure class="vfw-feature-photo snap" data-cycle>(.*?)<\/figure>/)[1];
  const imgs = fig.match(/<img [^>]*>/g);
  assert.ok(imgs.length >= 3);
  assert.match(imgs[0], /class="vfw-feature-img is-on"[^>]*alt="[^"]+"/);
  for (const i of imgs.slice(1)) assert.match(i, /alt="" aria-hidden="true"/);
  assert.doesNotMatch(bundle, /<span class="vfw-card-photo" data-cycle>/); // Thursday Bingo has one photo
  assert.match(bundle, /<span class="vfw-card-photo"><img /);
  assert.doesNotMatch(bundle, /onload|onerror|onclick/);
});
