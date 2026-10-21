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

test('anchors use ids: renaming or moving an event keeps its link, and repeating nights use the first id of their card', () => {
  const before = [ev({ id: 'chili-cook-off', title: 'Chili Cook-Off', date: '2026-10-24' }), ev({ id: 'ld-a', title: 'Line dancing', date: '2026-10-05', recurring: 'monthly_weekday' }), ev({ id: 'ld-b', title: 'Line dancing', date: '2026-10-19', recurring: 'monthly_weekday' })];
  const after = before.map((e) => (e.id === 'chili-cook-off' ? { ...e, title: 'Chili Night', date: '2026-10-31' } : e));
  assert.ok(ids(calendarHtml(before, 2026, TODAY)).includes('ev-chili-cook-off'));
  assert.ok(ids(calendarHtml(after, 2026, TODAY)).includes('ev-chili-cook-off'));
  const feat = featuredHtml(before, TODAY, { compact: 10 });
  assert.ok(links(feat).includes('ev-ld-a') && !links(feat).includes('ev-ld-b'));
  assert.deepEqual(ids(regularHtml(before)), ['ev-ld-a']);
});

test('an event in another year links to that year, and the link lands on the event', () => {
  const dec = '2026-12-28';
  const list = [ev({ id: 'new-years-eve', title: 'New Year party', date: '2027-01-02' }), ev({ id: 'xmas', title: 'Christmas party', date: '2026-12-30' })];
  const html = featuredHtml(list, dec, { compact: 5 });
  assert.match(html, /href="\/events\?year=2027#ev-new-years-eve"/);
  assert.match(html, /href="\/events#ev-xmas"/);
  assert.ok(ids(calendarHtml(list, 2027, dec)).includes('ev-new-years-eve'));
});

test('events with photos lead with a lazy 4:3 photo and See all N photos; a night without one gets a paper header', () => {
  const list = [ev({ id: 'halloween', title: 'Halloween happy hour', date: '2026-10-30', category: 'Bar' }), ev({ id: 'bingo', title: 'Thursday Bingo', recurring: 'weekly', date: '2026-01-01' }), ev({ id: 'nope', title: 'Something new', date: '2026-10-26', category: 'Post' })];
  const html = regularHtml(list) + calendarHtml(list, 2026, TODAY) + upcomingHtml(list, TODAY);
  const li = html.match(/<li id="ev-halloween"[^>]*>(.*?)<\/li>/)[1];
  assert.match(li, /<div class="vfw-evph" data-open-gallery="evg-ev-halloween"><img /);
  for (const i of li.match(/<img [^>]*>/g)) assert.match(i, /srcset="[^"]+-400\.webp 400w, [^"]+-800\.webp 800w, [^"]+\.webp 1024w" sizes="[^"]+"[^>]* width="800" height="600" loading="lazy" decoding="async"/);
  const json = JSON.parse(li.match(/data-gallery-list="evg-ev-halloween">(.*?)<\/script>/)[1]);
  assert.ok(json.length >= 3 && json.length <= 6);
  assert.match(li, new RegExp(`See all ${json.length} photos`));
  const bingo = html.match(/<li id="ev-bingo"[^>]*>(.*?)<\/li>/)[1];
  assert.match(bingo, /<div class="vfw-evhead vfw-evpaper"><strong class="vfw-event-date">Every Thursday<\/strong>/); // one photo, not of bingo: no photo
  assert.doesNotMatch(bingo, /<img /);
  assert.doesNotMatch(html.match(/<li id="ev-nope"[^>]*>(.*?)<\/li>/)[1], /<img |data-open-gallery/); // only a category photo: none
  assert.match(html, /<ul class="vfw-events vfw-upcoming">.*<div class="vfw-evpaper" aria-hidden="true">/); // upcoming: the date stamped on paper instead
  assert.equal(html.match(/data-gallery-list="/g).length, 1);
  assert.equal(new Set(ids(html)).size, ids(html).length);
});
