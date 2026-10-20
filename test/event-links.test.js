import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml, featuredHtml, regularHtml, upcomingHtml } from '../src/lib/state.js';

const ev = (o) => ({ id: 'abcd1', title: 'Meeting', date: '2026-10-22', start: '19:00', end: '21:00', description: 'Bring a friend.', recurring: 'none', category: 'Post', enabled: true, ...o });
const TODAY = '2026-10-20';
const events = [
  ev({ id: 'oneoff1', title: 'Chili Cook-Off', date: '2026-10-24' }),
  ev({ id: 'Odd_Id!', title: 'Fall Dance', date: '2026-11-07' }),
  ev({ id: 'bingo1', title: 'Thursday Bingo', date: '2026-01-01', recurring: 'weekly', start: '16:30', end: '' }),
  ev({ id: 'ld1', title: 'Line dancing', date: '2026-10-05', recurring: 'monthly_weekday' }),
  ev({ id: 'ld2', title: 'Line dancing', date: '2026-10-19', recurring: 'monthly_weekday' }),
];
const page = () => upcomingHtml(events, TODAY) + regularHtml(events) + calendarHtml(events, 2026, TODAY);
const ids = (html) => [...html.matchAll(/\sid="(ev-[^"]*)"/g)].map((m) => m[1]);
const links = (html) => [...html.matchAll(/href="\/events#(ev-[^"]*)"/g)].map((m) => m[1]);

test('featured Details and card titles link to anchors that exist on /events', () => {
  const html = featuredHtml(events, TODAY, { compact: 10 });
  const found = links(html);
  assert.ok(found.length >= 3);
  const have = new Set(ids(page()));
  for (const l of found) assert.ok(have.has(l), `missing target ${l}`);
  assert.match(html, /vfw-feature-more[^>]*href="\/events#ev-[a-z0-9-]+">Details<span class="sr-only"> about /);
  assert.match(html, /<strong class="vfw-card-title"><a href="\/events#ev-/);
});

test('anchors are sanitized and unique within the /events markup', () => {
  const all = ids(page());
  assert.ok(all.includes('ev-oneoff1') && all.includes('ev-odd-id'));
  assert.equal(new Set(all).size, all.length);
  for (const a of all) assert.match(a, /^ev-[a-z0-9-]+$/);
});

test('anchors follow the base path given as eventsHref, and work for events without ids', () => {
  const noId = events.map(({ id, ...rest }) => rest);
  const html = featuredHtml(noId, TODAY, { eventsHref: '/base/events', compact: 10 });
  assert.match(html, /href="\/base\/events#ev-/);
  const have = new Set(ids(regularHtml(noId) + calendarHtml(noId, 2026, TODAY)));
  for (const m of html.matchAll(/href="\/base\/events#(ev-[^"]*)"/g)) assert.ok(have.has(m[1]), m[1]);
});
