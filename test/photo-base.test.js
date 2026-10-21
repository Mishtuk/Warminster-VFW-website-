import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml, regularHtml } from '../src/lib/state.js';

// The GitHub Pages preview lives under a sub-path, so every gallery image must use the base it is given.
const base = '/sub/media/photos/';
const events = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/content/events.json', import.meta.url), 'utf8'));

test('calendar and weekly-card galleries use the photo base they are given', () => {
  for (const html of [calendarHtml(events, 2026, '2026-10-21', { photoBase: base }), regularHtml(events, { photoBase: base })]) {
    const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(srcs.length, 'some gallery images render');
    for (const s of srcs) assert.ok(s.startsWith(base), `image outside the base: ${s}`);
    assert.ok(!/"\/media\/photos\//.test(html), 'no root-relative photo paths, including the Lightbox list');
  }
});
