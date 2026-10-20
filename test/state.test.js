import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml, expand, injectMarkers, menuHtml, newsHtml, occurrences, specialsHtml, upcomingHtml, validateEvent, validateInquiry, validateMenu, validateNews, validateSpecial } from '../src/lib/state.js';

const ev = (o) => ({ id: 'abcd1', title: 'Meeting', date: '2026-10-13', start: '', end: '', description: '', recurring: 'none', category: 'Post', enabled: true, ...o });

test('event validation: required fields, cleaning, enums', () => {
  assert.equal(validateEvent({ date: '2026-10-13', category: 'Post' }).error, 'title');
  assert.equal(validateEvent({ title: 'x', date: '2026-02-30', category: 'Post' }).error, 'date');
  assert.equal(validateEvent({ title: 'x', date: '2026-10-13', category: 'Bingo' }).error, 'category');
  assert.equal(validateEvent({ title: 'x', date: '2026-10-13', category: 'Bar', start: '25:00' }).error, 'start');
  assert.equal(validateEvent({ title: 'x', date: '2026-10-13', category: 'Bar', recurring: 'daily' }).error, 'recurring');
  const v = validateEvent({ title: '  <b>Bingo</b> night ', date: '2026-10-13', category: 'Bar', start: '19:00', end: '', description: 'a\r\n\r\n\r\n\r\nb<script>', enabled: false });
  assert.equal(v.value.title, 'Bingo night');
  assert.equal(v.value.description, 'a\n\nb');
  assert.equal(v.value.enabled, false);
  assert.match(v.value.id, /^[a-z0-9]{10}$/);
  assert.equal(validateEvent({ id: 'keep1', title: 'x', date: '2026-10-13', category: 'Bar' }).value.id, 'keep1');
});

test('special, news and menu validation', () => {
  assert.equal(validateSpecial({ label: 'Pitchers', period: 'weekly' }).error, 'weekday');
  assert.equal(validateSpecial({ label: 'Pitchers', period: 'weekly', weekday: '9' }).error, 'weekday');
  assert.equal(validateSpecial({ label: 'P', period: 'daily', start: '2026-05-02', end: '2026-05-01' }).error, 'range');
  assert.equal(validateSpecial({ label: 'P', period: 'yearly' }).error, 'period');
  assert.equal(validateSpecial({ label: 'P', period: 'weekly', weekday: '5', price: '$2' }).value.weekday, 5);
  assert.equal(validateSpecial({ label: 'P', period: 'daily' }).value.weekday, null);
  assert.equal(validateNews({ title: 't', date: '2026-10-13', body: '  ' }).error, 'body');
  assert.equal(validateNews({ title: 't', date: '2026-10-13', body: '<i>hi</i>' }).value.body, 'hi');
  assert.equal(validateMenu({ sections: [{ name: '' }] }).error, 'section_name');
  assert.equal(validateMenu({ sections: [{ name: 'Apps', items: [{ name: '' }] }] }).error, 'item_name');
  const m = validateMenu({ hours: 'Fri 5 to 8', sections: [{ name: 'Apps', items: [{ name: 'Wings', price: '$9', available: false }] }] }).value;
  assert.equal(m.sections[0].items[0].available, false);
  assert.deepEqual(validateMenu({}).value, { hours: '', sections: [] });
});

test('inquiry validation', () => {
  const ok = { name: 'Pat', phone: '215-555-0100', eventDate: '2027-01-02', guests: '80' };
  assert.equal(validateInquiry(ok).value.guests, 80);
  assert.equal(validateInquiry({ ...ok, name: '' }).error, 'name');
  assert.equal(validateInquiry({ name: 'Pat' }).error, 'contact');
  assert.equal(validateInquiry({ ...ok, phone: 'abc' }).error, 'phone');
  assert.equal(validateInquiry({ name: 'Pat', email: 'nope' }).error, 'email');
  assert.equal(validateInquiry({ ...ok, eventDate: 'soon' }).error, 'eventDate');
  assert.equal(validateInquiry({ ...ok, guests: '0' }).error, 'guests');
  assert.equal(validateInquiry({ name: 'Pat', email: 'A@B.org' }).value.email, 'a@b.org');
});

test('recurring expansion: one-off, weekly, monthly, monthly weekday', () => {
  assert.deepEqual(occurrences(ev({ date: '2026-10-13' }), '2026-10-01', '2026-10-31'), ['2026-10-13']);
  assert.deepEqual(occurrences(ev({ date: '2026-10-13' }), '2026-11-01', '2026-11-30'), []);
  assert.deepEqual(occurrences(ev({ date: '2026-10-02', recurring: 'weekly' }), '2026-10-10', '2026-10-31'), ['2026-10-16', '2026-10-23', '2026-10-30']);
  assert.deepEqual(occurrences(ev({ date: '2026-10-02', recurring: 'weekly' }), '2026-09-01', '2026-10-10'), ['2026-10-02', '2026-10-09']); // never before its first date
  assert.deepEqual(occurrences(ev({ date: '2026-01-31', recurring: 'monthly' }), '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(occurrences(ev({ date: '2026-10-13', recurring: 'monthly_weekday' }), '2026-10-01', '2027-01-31'), ['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12']); // 2nd Tuesday
  assert.deepEqual(occurrences(ev({ date: '2026-10-29', recurring: 'monthly_weekday' }), '2026-10-01', '2026-12-31'), ['2026-10-29', '2026-11-26', '2026-12-31']); // 5th Thursday -> last Thursday
  assert.deepEqual(occurrences(ev({ date: '2026-12-15', recurring: 'monthly' }), '2026-12-01', '2027-02-28'), ['2026-12-15', '2027-01-15', '2027-02-15']); // across the year end
});

test('expand skips disabled events and sorts', () => {
  const list = expand([ev({ id: 'b', title: 'B', date: '2026-10-20' }), ev({ id: 'a', title: 'A', date: '2026-10-05' }), ev({ id: 'c', title: 'C', enabled: false })], '2026-10-01', '2026-10-31');
  assert.deepEqual(list.map((e) => e.title), ['A', 'B']);
});

test('calendar: 12 months, event days marked, disabled hidden, text escaped', () => {
  const html = calendarHtml([ev({ title: 'Bingo <b>', date: '2026-03-04', category: 'Bar' }), ev({ id: 'x', title: 'Hidden', date: '2026-05-05', enabled: false })], 2026, '2026-10-19');
  assert.equal((html.match(/class="vfw-month"/g) ?? []).length, 12);
  assert.equal((html.match(/vfw-has-events/g) ?? []).length, 1);
  assert.ok(html.includes('Bingo &lt;b&gt;'));
  assert.ok(!html.includes('Hidden'));
  assert.ok(html.includes('vfw-cat-bar'));
  assert.ok(html.includes('vfw-today'));
  assert.ok(!html.includes('vfw-cal-nav'));
  assert.ok(calendarHtml([], 2026, '2026-10-19', { nav: true }).includes('?year=2027'));
});

test('renderers: empty states, specials range, menu availability, news order', () => {
  assert.match(upcomingHtml([], '2026-10-19'), /vfw-empty/);
  assert.match(upcomingHtml([ev({ date: '2026-10-20', start: '19:00', end: '21:30' })], '2026-10-19'), /7 PM to 9:30 PM/);
  const sp = [{ label: 'Live', period: 'weekly', weekday: 5, enabled: true, start: '', end: '' }, { label: 'Old', period: 'daily', enabled: true, start: '', end: '2026-01-01' }, { label: 'Off', period: 'daily', enabled: false }];
  const h = specialsHtml(sp, '2026-10-19');
  assert.ok(h.includes('Live') && h.includes('Every Friday') && !h.includes('Old') && !h.includes('Off'));
  assert.match(specialsHtml([], '2026-10-19', { empty: 'Call the post' }), /Call the post/);
  assert.match(menuHtml({ hours: '', sections: [] }), /vfw-empty/);
  const m = menuHtml({ hours: 'Fri 5-8', sections: [{ name: 'Apps', items: [{ name: 'Wings', price: '$9', available: true }, { name: 'Gone', available: false }] }, { name: 'Empty', items: [] }] });
  assert.ok(m.includes('Wings') && m.includes('Kitchen hours') && !m.includes('Gone') && !m.includes('Empty'));
  const n = newsHtml([{ title: 'Old', date: '2026-01-01', body: 'a', enabled: true }, { title: 'New', date: '2026-02-01', body: 'p1\n\np2', enabled: true }, { title: 'Off', date: '2026-03-01', body: 'x', enabled: false }]);
  assert.ok(n.indexOf('New') < n.indexOf('Old') && !n.includes('Off') && n.includes('<p>p1</p><p>p2</p>'));
  assert.ok(!newsHtml([{ title: 'T', date: '2026-02-01', body: 'p1\n\np2', enabled: true }], { teaser: true }).includes('p2'));
});

test('injectMarkers: fills markers, replaces baked seed regions, leaves unknown ones, escapes the data script', () => {
  const state = { events: [ev({ date: '2026-10-20' })], news: [{ title: 'N</script>', date: '2026-10-01', body: 'b', enabled: true }] };
  const page = '<!--vfw:events-upcoming-->seed<!--/vfw:events-upcoming--><!--vfw:news-latest--><!--vfw:other--><!--vfw:data--><!--vfw:calendar-->';
  const out = injectMarkers(page, state, '2026-10-19', '2027');
  assert.ok(!out.includes('seed') && out.includes('Meeting') && out.includes('<!--vfw:other-->') && out.includes('data-year="2027"'));
  const data = out.match(/<script type="application\/json" id="vfw-data">(.*?)<\/script>/s)[1];
  assert.ok(JSON.parse(data).news[0].title.includes('</script>') && !data.includes('</script>'));
});

test('calendar month lists show one-off events only; repeating nights stay marked on the grid with one pointer line', () => {
  const html = calendarHtml([ev({ title: 'Trivia', date: '2026-03-04', recurring: 'weekly' }), ev({ id: 'two', title: 'Fish Fry', date: '2026-03-20' })], 2026, '2026-10-19');
  const march = html.slice(html.indexOf('id="month-3"'), html.indexOf('id="month-4"'));
  assert.equal((march.match(/vfw-has-events/g) ?? []).length, 4 + 1); // 4 Wednesdays in March 2026 from the 4th + the fish fry day
  assert.equal((march.match(/Trivia/g) ?? []).length, 4); // grid only, none in the list
  const list = march.slice(march.indexOf('vfw-month-list'));
  assert.ok(list.includes('Fish Fry') && !list.includes('Trivia'));
  assert.ok(march.includes('href="#regular"'));
  assert.equal((html.match(/href="#regular"/g) ?? []).length, 10); // March to December: the weekly night starts March 4
});

test('news photo validation: real file ok, unknown file refused, paths and traversal refused', () => {
  const photos = new Set(['hero-check.webp', 'hero-check-800.webp', 'hall-05.webp']);
  const n = (photo) => validateNews({ title: 't', date: '2026-10-01', body: 'b', photo, alt: 'A <b>pic</b>' }, { photos });
  assert.equal(n('hero-check.webp').value.photo, 'hero-check.webp');
  assert.equal(n('hero-check.webp').value.alt, 'A pic');
  assert.equal(n('').value.photo, '');
  assert.equal(n(undefined).value.photo, '');
  assert.equal(n('nope.webp').error, 'photo');
  for (const bad of ['../server.js', '../../etc/passwd', 'photos/hall-05.webp', '/media/photos/hall-05.webp', 'hall-05.webp/../x.webp', '..%2fx.webp', 'hall-05.webp.exe', 'hall-05.svg', 'a\b.webp', 5, {}, 'x'.repeat(90) + '.webp']) assert.equal(n(bad).error, 'photo', String(bad));
  assert.equal(validateNews({ title: 't', date: '2026-10-01', body: 'b', photo: 'whatever.webp' }).value.photo, 'whatever.webp'); // shape only when no file list is given
  assert.equal(validateNews({ title: 't', date: '2026-10-01', body: 'b', photo: '../x.webp' }).error, 'photo');
});

test('news photo renders as a figure with the -800 copy when it exists, alt falls back to the title', () => {
  const photos = new Set(['a.webp', 'a-800.webp', 'b.webp']);
  const news = [{ title: 'With small', date: '2026-02-01', body: 'x', photo: 'a.webp', alt: '', enabled: true }, { title: 'Only big', date: '2026-01-01', body: 'x', photo: 'b.webp', alt: 'Own "alt"', enabled: true },
    { title: 'Gone', date: '2025-01-01', body: 'x', photo: 'deleted.webp', enabled: true }, { title: 'None', date: '2024-01-01', body: 'x', enabled: true }];
  const h = newsHtml(news, { photos });
  assert.ok(h.includes('<figure class="vfw-news-photo"><img src="/media/photos/a-800.webp" alt="With small" loading="lazy"'));
  assert.ok(h.includes('width="800" height="600"'));
  assert.ok(h.includes('src="/media/photos/b.webp" alt="Own &quot;alt&quot;"') && h.includes('width="1024" height="768"'));
  assert.equal((h.match(/<figure/g) ?? []).length, 2); // deleted file and no photo: no figure
  assert.ok(!newsHtml(news, { photos, teaser: true }).includes('<figure'));
});
