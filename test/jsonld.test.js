// JSON-LD: org facts from POST, Eastern offsets across DST, absolute URLs with BASE, script-safe strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orgLd, eventsLd } from '../src/lib/jsonld.js';
import { POST } from '../src/lib/post.js';

const SITE = 'https://example.org/Warminster-VFW-website-/';
const ev = (o) => ({ id: 'x', title: 'Night', date: '2026-10-30', start: '18:00', end: '21:00', description: 'Fun. More text.', recurring: 'none', category: 'Post', enabled: true, ...o });

test('org has address, phone, email, sameAs and absolute URLs with BASE', () => {
  const o = orgLd(SITE);
  assert.equal(o['@context'], 'https://schema.org');
  assert.equal(o.name, POST.name);
  assert.equal(o.telephone, POST.phone);
  assert.deepEqual(o.address, { '@type': 'PostalAddress', streetAddress: '645 Louis Dr', addressLocality: 'Warminster', addressRegion: 'PA', postalCode: '18974', addressCountry: 'US' });
  assert.equal(o.url, 'https://example.org/Warminster-VFW-website-/');
  assert.equal(o.logo, 'https://example.org/Warminster-VFW-website-/brand/icon-512.png');
  assert.deepEqual(o.sameAs, [POST.facebook]);
  assert.equal(o.geo, undefined);
});

test('opening hours: Fri and Sat close at 23:59, Sunday 13:00 to 19:00, all days listed', () => {
  const h = orgLd(SITE).openingHoursSpecification;
  assert.equal(h.length, 7);
  const by = Object.fromEntries(h.map((x) => [x.dayOfWeek, x]));
  assert.deepEqual([by.Friday.opens, by.Friday.closes], ['16:00', '23:59']);
  assert.deepEqual([by.Saturday.opens, by.Saturday.closes], ['18:00', '23:59']);
  assert.deepEqual([by.Sunday.opens, by.Sunday.closes], ['13:00', '19:00']);
  assert.deepEqual([by.Monday.opens, by.Monday.closes], ['17:00', '22:00']);
});

test('events: Eastern offset follows DST', () => {
  const [oct, dec] = eventsLd([ev({ id: 'a', date: '2026-10-30' }), ev({ id: 'b', date: '2026-12-05', start: '19:30', end: '' })], '2026-10-21', SITE);
  assert.equal(oct.startDate, '2026-10-30T18:00:00-04:00');
  assert.equal(oct.endDate, '2026-10-30T21:00:00-04:00');
  assert.equal(dec.startDate, '2026-12-05T19:30:00-05:00');
  assert.equal(dec.endDate, undefined);
});

test('events: window, one-off only, enabled only, limit, past dropped', () => {
  const list = [ev({ id: 'in', date: '2026-11-01' }), ev({ id: 'past', date: '2026-10-01' }), ev({ id: 'far', date: '2027-06-01' }), ev({ id: 'rep', recurring: 'weekly' }), ev({ id: 'off', enabled: false })];
  assert.deepEqual(eventsLd(list, '2026-10-21', SITE).map((e) => e.url.split('#')[1]), ['ev-in']);
  const many = Array.from({ length: 15 }, (_, i) => ev({ id: `e${i}`, date: `2026-11-${String(i + 1).padStart(2, '0')}` }));
  assert.equal(eventsLd(many, '2026-10-21', SITE).length, 10);
});

test('events: absolute URLs carry BASE, status, mode, location, description, image', () => {
  const [e] = eventsLd([ev({ id: 'Fall Fest!' })], '2026-10-21', SITE);
  assert.equal(e.url, 'https://example.org/Warminster-VFW-website-/events#ev-fall-fest');
  assert.equal(e.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(e.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(e.location.address.postalCode, '18974');
  assert.equal(e.description, 'Fun.');
  assert.match(e.image[0], /^https:\/\/example\.org\/Warminster-VFW-website-\/media\/photos\/[\w-]+\.webp$/);
});

test('an end before the start runs past midnight to the next day', () => {
  const [e] = eventsLd([ev({ start: '20:00', end: '01:00' })], '2026-10-21', SITE);
  assert.equal(e.endDate, '2026-10-31T01:00:00-04:00');
});

test('a closing script tag in a title cannot break out once serialized the way Base.astro does', () => {
  const [e] = eventsLd([ev({ title: '</script><script>alert(1)</script>' })], '2026-10-21', SITE);
  const out = JSON.stringify(e).replace(/</g, '\\u003c');
  assert.ok(!out.includes('</script'));
  assert.equal(JSON.parse(out).name, '</script><script>alert(1)</script>');
});
