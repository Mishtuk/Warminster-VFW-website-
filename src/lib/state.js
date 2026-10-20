// Admin-edited content: validation, recurring-event expansion, and the HTML renderers.
// Plain JS with no Node-only imports, so the SAME functions run in Astro (static preview, seed content) and in server.js (live data).
// Dates are "YYYY-MM-DD" strings, times "HH:MM" (24h). "Today" is always America/New_York.

import { POST } from './post.js';
const CALL = `Call the post at ${POST.phone}.`;

export const TZ = 'America/New_York';
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const CATEGORIES = ['Bar', 'Post', 'Auxiliary', 'Community', 'Holiday'];
export const RECURRING = ['none', 'weekly', 'monthly', 'monthly_weekday']; // monthly = same date; monthly_weekday = e.g. 2nd Tuesday
export const PERIODS = ['daily', 'weekly', 'monthly', 'seasonal'];
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Today's date in Eastern time. */
export const etDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

// ---------- cleaning and validation ----------
const TAG = /<[^>]*>/g;
/** One line of plain text: tags and control characters removed, trimmed, cut to max. */
export const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(TAG, '').replace(/\s+/g, ' ').trim() : '').slice(0, max);
/** Plain text that keeps line breaks (paragraphs separated by a blank line). */
export const para = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(TAG, '').replace(/\n{3,}/g, '\n\n').trim() : '').slice(0, max);

const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const fmtDay = (d) => d.toISOString().slice(0, 10);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(+parseDay(s)) && fmtDay(parseDay(s)) === s;
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const id = (v) => (typeof v === 'string' && /^[a-z0-9]{4,24}$/.test(v) ? v : globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10));
const flag = (v, dflt = true) => (v === undefined ? dflt : v === true || v === 'true' || v === 1 || v === 'on');
const optDate = (v) => (v === undefined || v === null || v === '' ? '' : isDate(v) ? v : null);
const optTime = (v) => (v === undefined || v === null || v === '' ? '' : isTime(v) ? v : null);

export function validateEvent(b) {
  b = b ?? {};
  const title = text(b.title, 100);
  if (!title) return { error: 'title' };
  if (!isDate(b.date)) return { error: 'date' };
  const start = optTime(b.start), end = optTime(b.end);
  if (start === null) return { error: 'start' };
  if (end === null) return { error: 'end' };
  const recurring = b.recurring ?? 'none';
  if (!RECURRING.includes(recurring)) return { error: 'recurring' };
  if (!CATEGORIES.includes(b.category)) return { error: 'category' };
  return { value: { id: id(b.id), title, date: b.date, start, end, description: para(b.description, 1000), recurring, category: b.category, enabled: flag(b.enabled) } };
}

export function validateSpecial(b) {
  b = b ?? {};
  const label = text(b.label, 80);
  if (!label) return { error: 'label' };
  if (!PERIODS.includes(b.period)) return { error: 'period' };
  let weekday = null;
  if (b.period === 'weekly') {
    weekday = Number(b.weekday);
    if (b.weekday === '' || b.weekday === null || b.weekday === undefined || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'weekday' };
  }
  const start = optDate(b.start), end = optDate(b.end);
  if (start === null) return { error: 'start' };
  if (end === null) return { error: 'end' };
  if (start && end && end < start) return { error: 'range' };
  return { value: { id: id(b.id), label, price: text(b.price, 40), description: para(b.description, 300), period: b.period, weekday, start, end, enabled: flag(b.enabled) } };
}

const PHOTO_EXT = ['webp', 'jpg', 'jpeg', 'png'];
/** A news photo is a bare file name in media/photos (never a path). '' = none, null = not acceptable.
 *  known = Set of the file names that really exist; without it only the shape is checked. */
export function photoName(v, known) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > 80 || v.includes('..')) return null;
  const parts = v.split('.');
  if (parts.length !== 2 || !parts[0] || !PHOTO_EXT.includes(parts[1].toLowerCase())) return null;
  if (![...parts[0]].every((c) => /[A-Za-z0-9_-]/.test(c))) return null;
  return known && !known.has(v) ? null : v;
}

export function validateNews(b, { photos } = {}) {
  b = b ?? {};
  const title = text(b.title, 120);
  if (!title) return { error: 'title' };
  if (!isDate(b.date)) return { error: 'date' };
  const body = para(b.body, 5000);
  if (!body) return { error: 'body' };
  const photo = photoName(b.photo, photos);
  if (photo === null) return { error: 'photo' };
  return { value: { id: id(b.id), title, date: b.date, body, photo, alt: text(b.alt, 150), enabled: flag(b.enabled) } };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** A beer tap on the home page (admin): name up to 40 characters, badge colour bg and text colour fg as strict #rrggbb. */
export function validateTap(b) {
  b = b ?? {};
  const name = text(b.name, 40);
  if (!name) return { error: 'name' };
  for (const k of ['bg', 'fg']) if (typeof b[k] !== 'string' || !HEX.test(b[k])) return { error: k };
  return { value: { id: id(b.id), name, bg: b.bg.toLowerCase(), fg: b.fg.toLowerCase(), enabled: flag(b.enabled) } };
}
/** The beer taps (marker: taps): the ul.tap-row inside div.taps[data-pour]. Hidden taps are skipped; none enabled gives '' so the tower hides. */
export function tapsHtml(taps = []) {
  const list = taps.filter((t) => t.enabled !== false && HEX.test(t.bg) && HEX.test(t.fg));
  return list.length ? `<ul class="tap-row">${list.map((t) => `<li class="tap" style="--tap-bg:${t.bg};--tap-fg:${t.fg}"><button type="button" class="tap-handle" aria-label="Pour a ${esc(t.name)}"><span class="tap-badge"><span class="tap-name">${esc(t.name)}</span></span></button><span class="tap-nozzle" aria-hidden="true"></span></li>`).join('')}</ul>` : '';
}

/** A shop product (admin). options = choices like sizes, an array or one per line. checkoutUrl = optional https payment link. */
export function validateProduct(b, { photos } = {}) {
  b = b ?? {};
  const name = text(b.name, 80);
  if (!name) return { error: 'name' };
  const raw = Array.isArray(b.options) ? b.options : typeof b.options === 'string' ? b.options.split('\n') : [];
  if (raw.length > 40 || raw.some((x) => typeof x !== 'string' || x.trim().length > 30)) return { error: 'options' };
  const options = [...new Set(raw.map((x) => text(x, 30)).filter(Boolean))];
  if (options.length > 12) return { error: 'options' };
  const photo = photoName(b.photo, photos);
  if (photo === null) return { error: 'photo' };
  const checkoutUrl = httpsUrl(b.checkoutUrl);
  if (checkoutUrl === null) return { error: 'checkoutUrl' };
  return { value: { id: id(b.id), name, price: text(b.price, 30), description: para(b.description, 300), options, photo, alt: text(b.alt, 150), checkoutUrl, enabled: flag(b.enabled) } };
}

/** A pickup order from the public shop form. item = "productId/N" (N = choice number from 1, or 0 when the product has no choices). Only products that are on the website and have no checkout link can be ordered. */
export function validateOrder(b, products = []) {
  b = b ?? {};
  const m = /^([a-z0-9]{4,24})\/(\d{1,2})$/.exec(typeof b.item === 'string' ? b.item : '');
  const p = m && products.find((x) => x.id === m[1] && x.enabled !== false && !x.checkoutUrl);
  const n = m ? Number(m[2]) : -1;
  if (!p || (p.options.length ? n < 1 || n > p.options.length : n !== 0)) return { error: 'item' };
  const qty = typeof b.qty === 'string' && b.qty.trim() ? Number(b.qty) : b.qty;
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { error: 'qty' };
  const name = text(b.name, 80);
  if (!name) return { error: 'name' };
  const c = contact(b);
  if (c.error) return c;
  return { value: { productId: p.id, product: p.name, option: n ? p.options[n - 1] : '', price: p.price, qty, name, ...c, note: para(b.note, 500) } };
}

/** The whole food menu is one document: { hours, sections: [{ id, name, items: [{ id, name, price, description, available }] }] }. */
export function validateMenu(b) {
  b = b ?? {};
  if (b.sections !== undefined && !Array.isArray(b.sections)) return { error: 'sections' };
  const sections = [];
  for (const s of (b.sections ?? []).slice(0, 20)) {
    const name = text(s?.name, 60);
    if (!name) return { error: 'section_name' };
    const items = [];
    for (const i of (Array.isArray(s.items) ? s.items : []).slice(0, 60)) {
      const n = text(i?.name, 80);
      if (!n) return { error: 'item_name' };
      items.push({ id: id(i.id), name: n, price: text(i.price, 30), description: text(i.description, 200), available: flag(i.available) });
    }
    sections.push({ id: id(s.id), name, items });
  }
  return { value: { hours: text(b.hours, 200), sections } };
}

/** Phone and email from a public form: { phone, email } (at least one), or { error: 'phone' | 'email' | 'contact' }. */
export function contact(b) {
  const phone = text(b.phone, 30);
  if (phone && (phone.replace(/\D/g, '').length < 7 || !/^[\d\s()+.-]+(x\d+)?$/i.test(phone))) return { error: 'phone' };
  const email = text(b.email, 200).toLowerCase();
  if (email && !EMAIL.test(email)) return { error: 'email' };
  return !phone && !email ? { error: 'contact' } : { phone, email };
}

/** Hall inquiry from the public form. Needs a name and a way to reach them (phone or email). Honeypot is checked by the caller. */
export function validateInquiry(b) {
  b = b ?? {};
  const name = text(b.name, 100);
  if (!name) return { error: 'name' };
  const c = contact(b);
  if (c.error) return c;
  const { phone, email } = c;
  const eventDate = optDate(b.eventDate ?? b.event_date);
  if (eventDate === null) return { error: 'eventDate' };
  const raw = b.guests === undefined || b.guests === null ? '' : String(b.guests).trim();
  const guests = raw === '' ? null : Number(raw);
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 2000)) return { error: 'guests' };
  return { value: { name, phone, email, eventDate, eventType: text(b.eventType ?? b.event_type, 80), guests, message: para(b.message, 2000) } };
}

/** Volunteer shift (admin). today = ET day; taken = people already signed up (slots can't drop below it). A body with an id is an edit: past dates stay allowed. */
export function validateShift(b, today, taken = 0) {
  b = b ?? {};
  const title = text(b.title, 80);
  if (!title) return { error: 'title' };
  if (!isDate(b.date)) return { error: 'date' };
  if (!b.id && b.date < today) return { error: 'past' };
  const start = optTime(b.start), end = optTime(b.end);
  if (start === null) return { error: 'start' };
  if (end === null) return { error: 'end' };
  const slots = typeof b.slots === 'string' && b.slots.trim() ? Number(b.slots) : b.slots;
  if (!Number.isInteger(slots) || slots < 1 || slots > 100) return { error: 'slots' };
  if (slots < taken) return { error: 'slots_taken' };
  return { value: { id: id(b.id), title, date: b.date, start, end, slots, notes: para(b.notes, 300), enabled: flag(b.enabled) } };
}

/** Public volunteer sign-up: shift id, name, and a phone or an email. */
export function validateSignup(b) {
  b = b ?? {};
  if (typeof b.shift !== 'string' || !/^[a-z0-9]{4,24}$/.test(b.shift)) return { error: 'shift' };
  const name = text(b.name, 80);
  if (!name) return { error: 'name' };
  const c = contact(b);
  return c.error ? c : { value: { shift: b.shift, name, ...c } };
}

export const HELP_KINDS = { ride: 'A ride to a VA appointment', visit: 'A visit or a phone call', benefits: 'Help with VA benefits or a claim', other: 'Something else' };
export const BEST_TIMES = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };
/** Veteran help request from the public form. */
export function validateHelp(b) {
  b = b ?? {};
  const name = text(b.name, 80);
  if (!name) return { error: 'name' };
  const c = contact(b);
  if (c.error) return c;
  if (!Object.hasOwn(HELP_KINDS, b.kind)) return { error: 'kind' };
  const bestTime = b.bestTime ?? '';
  if (bestTime !== '' && !Object.hasOwn(BEST_TIMES, bestTime)) return { error: 'bestTime' };
  return { value: { name, ...c, kind: b.kind, bestTime, message: para(b.message, 1000) } };
}

/** A plain https web address (no login in it, 300 characters at most): '' for none, the cleaned address, or null when it is not acceptable. */
export function httpsUrl(v) {
  const raw = typeof v === 'string' ? v.trim() : '';
  if (!raw) return '';
  try { const u = new URL(raw); return u.protocol !== 'https:' || u.username || u.password || raw.length > 300 || /[\s<>"']/.test(raw) ? null : u.href; } catch { return null; }
}

export const DEFAULT_SETTINGS = { helpEnabled: false, responderName: '', responderRole: '', responderEmail: '', donateUrl: '', donateLabel: '' };
/** Site settings (admin). The help form can only be on when someone is named to answer. The donation link must be a plain https address. */
export function validateSettings(b) {
  b = b ?? {};
  const helpEnabled = flag(b.helpEnabled, false), responderName = text(b.responderName, 80);
  if (helpEnabled && !responderName) return { error: 'responder' };
  const responderEmail = text(b.responderEmail, 200).toLowerCase();
  if (responderEmail && !EMAIL.test(responderEmail)) return { error: 'responderEmail' };
  const donateUrl = httpsUrl(b.donateUrl);
  if (donateUrl === null) return { error: 'donateUrl' };
  return { value: { helpEnabled, responderName, responderRole: text(b.responderRole, 60), responderEmail, donateUrl, donateLabel: text(b.donateLabel, 40) } };
}

// ---------- recurring events ----------
const addDays = (ymd, n) => { const d = parseDay(ymd); d.setUTCDate(d.getUTCDate() + n); return fmtDay(d); };
const dowOf = (ymd) => parseDay(ymd).getUTCDay();
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Dates (YYYY-MM-DD) an event happens on within [from, to]. One-off: its date. Weekly: every 7 days. Monthly: the same date each
 *  month (a 31st lands on the last day of shorter months). monthly_weekday: the same Nth weekday (a 5th lands on the last one). */
export function occurrences(e, from, to) {
  const out = [];
  const start = e.date;
  if (e.recurring === 'weekly') {
    let d = start;
    if (from > d) d = addDays(d, Math.ceil((parseDay(from) - parseDay(d)) / 864e5 / 7) * 7);
    for (; d <= to; d = addDays(d, 7)) out.push(d);
    return out;
  }
  if (e.recurring === 'monthly' || e.recurring === 'monthly_weekday') {
    const s = parseDay(start);
    const dom = s.getUTCDate(), dow = s.getUTCDay(), nth = Math.ceil(dom / 7);
    let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    for (; `${y}-${String(m + 1).padStart(2, '0')}` <= to.slice(0, 7); m === 11 ? (y++, m = 0) : m++) {
      let day;
      if (e.recurring === 'monthly') day = Math.min(dom, daysIn(y, m));
      else {
        const first = (dow - new Date(Date.UTC(y, m, 1)).getUTCDay() + 7) % 7 + 1; // first such weekday of the month
        day = first + (nth - 1) * 7;
        if (day > daysIn(y, m)) day -= 7;
      }
      const d = fmtDay(new Date(Date.UTC(y, m, day)));
      if (d >= start && d >= from && d <= to) out.push(d);
    }
    return out;
  }
  return start >= from && start <= to ? [start] : [];
}

/** Every dated occurrence of the enabled events in [from, to], earliest first. */
export function expand(events = [], from, to) {
  return events.filter((e) => e.enabled !== false)
    .flatMap((e) => occurrences(e, from, to).map((date) => ({ ...e, date, eventId: e.id })))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title));
}

// ---------- rendering (class names are listed in docs/markers.md) ----------
const longDay = (ymd) => parseDay(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDay = (ymd) => parseDay(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
export const timeLabel = (start, end) => (start ? clock(start) + (end ? ` to ${clock(end)}` : '') : '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const empty = (msg) => `<p class="vfw-empty">${esc(msg)}</p>`;

/** opts.today mutes past one-off events; opts.brief drops the description of recurring nights (shown once in regularHtml). */
const eventItem = (o, { today, brief } = {}) => `<li class="vfw-event vfw-cat-${slug(o.category)}${today && o.recurring === 'none' && o.date < today ? ' vfw-past' : ''}"><time class="vfw-event-date" datetime="${o.date}">${esc(shortDay(o.date))}</time>`
  + `${o.start ? ` <span class="vfw-event-time">${esc(timeLabel(o.start, o.end))}</span>` : ''} <strong class="vfw-event-title">${esc(o.title)}</strong>`
  + ` <span class="vfw-event-cat">${esc(o.category)}</span>${o.description && !(brief && o.recurring !== 'none') ? `<p class="vfw-event-desc">${esc(o.description)}</p>` : ''}</li>`;

/** Next events from today: <ul class="vfw-events">. opts: limit (5), days (120), empty. */
export function upcomingHtml(events, today, { limit = 5, days = 120, empty: none = `No upcoming events are listed right now. ${CALL}` } = {}) {
  const list = expand(events, today, addDays(today, days)).slice(0, limit);
  return list.length ? `<ul class="vfw-events">${list.map(eventItem).join('')}</ul>` : empty(none);
}

/** Full-year calendar, 12 month grids with event days marked, plus each month's list of one-off events and a pointer to the regular nights. Works with no JS.
 *  opts: nav (previous/next year links as ?year=N, for the live server), empty. */
export function calendarHtml(events, year, today, { nav = false } = {}) {
  const all = expand(events, `${year}-01-01`, `${year}-12-31`);
  const head = DAYS.map((d) => `<th scope="col" abbr="${d}">${d.slice(0, 3)}</th>`).join('');
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const evs = all.filter((o) => o.date.startsWith(prefix));
    const oneOff = evs.filter((o) => !o.recurring || o.recurring === 'none'); // repeating nights are marked on the grid and listed once on the page, not under every month
    const lead = new Date(Date.UTC(year, m, 1)).getUTCDay();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn(year, m) }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(`<tr>${cells.slice(i, i + 7).map((d) => {
        if (!d) return '<td class="vfw-day vfw-day-empty"></td>';
        const date = `${prefix}-${String(d).padStart(2, '0')}`;
        const here = evs.filter((o) => o.date === date);
        return `<td class="vfw-day${here.length ? ' vfw-has-events' : ''}${date === today ? ' vfw-today' : ''}"><span class="vfw-daynum">${d}</span>`
          + (here.length ? `<ul class="vfw-day-events">${here.map((o) => `<li class="vfw-cat-${slug(o.category)}">${esc(o.title)}</li>`).join('')}</ul>` : '') + '</td>';
      }).join('')}</tr>`);
    }
    const label = new Date(Date.UTC(year, m, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `<section class="vfw-month" id="month-${m + 1}"><h3 class="vfw-month-title">${label}</h3><table class="vfw-grid"><caption class="vfw-sr">${label}</caption>`
      + `<thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`
      + (oneOff.length ? `<ul class="vfw-month-list vfw-events">${oneOff.map((o) => eventItem(o, { today, brief: true })).join('')}</ul>` : '')
      + (evs.length === oneOff.length ? '' : '<p class="vfw-month-regular">Plus the regular nights: <a href="#regular">see Every week and every month</a>.</p>')
      + (evs.length ? '' : '<p class="vfw-month-none">No events listed this month.</p>') + '</section>';
  });
  const links = nav ? `<nav class="vfw-cal-nav" aria-label="Choose a year"><a href="?year=${year - 1}">${year - 1}</a> <strong>${year}</strong> <a href="?year=${year + 1}">${year + 1}</a></nav>` : '';
  return `<div class="vfw-calendar" data-year="${year}">${links}${months.join('')}</div>`;
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
const scheduleLabel = (e) => {
  const d = parseDay(e.date), day = DAYS[d.getUTCDay()], nth = Math.ceil(d.getUTCDate() / 7);
  if (e.recurring === 'weekly') return `Every ${day}`;
  if (e.recurring === 'monthly_weekday') return `${ORD[nth]} ${day} of the month`;
  return `Monthly on the ${d.getUTCDate()}${['th', 'st', 'nd', 'rd'][(d.getUTCDate() % 100 > 10 && d.getUTCDate() % 100 < 14) || d.getUTCDate() % 10 > 3 ? 0 : d.getUTCDate() % 10]}`;
};
const list = (a) => (a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
/** Regular nights (anything that repeats), each described once: <ul class="vfw-events vfw-regular">. Same title, time and text merge into one row. */
export function regularHtml(events = [], { empty: none = 'No regular nights are listed right now.', guide = '/events/first-visit' } = {}) {
  const guideLink = (t) => { const g = /bingo/i.test(t) ? 'bingo' : /line danc/i.test(t) ? 'line-dancing' : ''; return g ? `<a class="vfw-guide-link" href="${esc(guide)}#${g}">First time? What to expect</a>` : ''; };
  const rows = new Map();
  for (const e of events.filter((x) => x.enabled !== false && x.recurring !== 'none')) {
    const key = [e.title, e.start, e.end, e.description].join('|');
    const row = rows.get(key) ?? { e, labels: [], ords: new Map() };
    if (e.recurring === 'monthly_weekday') { // same weekday, several weeks: "1st, 3rd and 4th Monday of the month"
      const d = parseDay(e.date), day = DAYS[d.getUTCDay()];
      if (!row.ords.has(day)) { row.ords.set(day, []); row.labels.push({ day }); }
      row.ords.get(day).push(ORD[Math.ceil(d.getUTCDate() / 7)]);
    } else row.labels.push(scheduleLabel(e));
    rows.set(key, row);
  }
  if (!rows.size) return empty(none);
  for (const r of rows.values()) r.labels = r.labels.map((l) => (l.day ? `${list(r.ords.get(l.day).sort())} ${l.day} of the month` : l));
  return `<ul class="vfw-events vfw-regular">${[...rows.values()].map(({ e, labels }) => `<li class="vfw-event vfw-cat-${slug(e.category)}"><strong class="vfw-event-date">${esc(labels.join(', '))}</strong>`
    + `${e.start ? ` <span class="vfw-event-time">${esc(timeLabel(e.start, e.end))}</span>` : ''} <strong class="vfw-event-title">${esc(e.title)}</strong>`
    + ` <span class="vfw-event-cat">${esc(e.category)}</span>${e.description ? `<p class="vfw-event-desc">${esc(e.description)}</p>` : ''}${guideLink(e.title)}</li>`).join('')}</ul>`;
}

/** Daily first, then weekly Monday to Sunday, then monthly, then seasonal; ties by name. */
const rank = (s) => ({ daily: 0, weekly: 1, monthly: 8, seasonal: 9 })[s.period] + (s.period === 'weekly' ? ((s.weekday + 6) % 7) / 10 : 0);
export const specialOrder = (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label);
const PERIOD_LABEL = (s) => (s.period === 'weekly' ? `Every ${DAYS[s.weekday]}` : { daily: 'Daily', monthly: 'This month', seasonal: 'Seasonal' }[s.period]);
/** Specials that are enabled and in their date range today: <ul class="vfw-specials">. */
export function specialsHtml(specials = [], today, { empty: none = `No specials are posted right now. ${CALL}` } = {}) {
  const live = specials.filter((s) => s.enabled !== false && (!s.start || s.start <= today) && (!s.end || today <= s.end));
  return live.length ? `<ul class="vfw-specials">${live.sort(specialOrder).map((s) => `<li class="vfw-special"><strong class="vfw-special-label">${esc(s.label)}</strong>`
    + `${s.price ? ` <span class="vfw-special-price">${esc(s.price)}</span>` : ''} <span class="vfw-special-period">${esc(PERIOD_LABEL(s))}</span>`
    + `${s.description ? `<p class="vfw-special-desc">${esc(s.description)}</p>` : ''}</li>`).join('')}</ul>` : empty(none);
}

/** The food menu: sections of available items, plus the kitchen hours text. */
export function menuHtml(menu, { empty: none = `The menu has not been posted yet. ${CALL}` } = {}) {
  const hours = menu?.hours ? `<p class="vfw-menu-hours"><strong>Kitchen hours:</strong> ${esc(menu.hours)}</p>` : '';
  const sections = (menu?.sections ?? []).map((s) => ({ ...s, items: s.items.filter((i) => i.available !== false) })).filter((s) => s.items.length);
  if (!sections.length) return hours + empty(none);
  return `<div class="vfw-menu">${hours}${sections.map((s) => `<section class="vfw-menu-section"><h3 class="vfw-menu-heading">${esc(s.name)}</h3><ul class="vfw-menu-items">`
    + s.items.map((i) => `<li class="vfw-menu-item"><span class="vfw-menu-name">${esc(i.name)}</span>${i.price ? ` <span class="vfw-menu-price">${esc(i.price)}</span>` : ''}`
      + `${i.description ? `<p class="vfw-menu-desc">${esc(i.description)}</p>` : ''}</li>`).join('') + '</ul></section>').join('')}</div>`;
}

const paragraphs = (body) => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
/** Post news, newest first. opts: limit, teaser (first paragraph cut to 200 characters), empty. */
/** <figure> for a news item's photo, using the -800 copy when it exists. The site's photos are 4:3 (1024x768 and 800x600).
 *  photos = Set of existing files (optional); base = URL folder (default /media/photos/). */
function photoFigure(n, photos, base, cls = 'vfw-news-photo') {
  if (!n.photo || (photos && !photos.has(n.photo))) return '';
  const dot = n.photo.lastIndexOf('.');
  const small = `${n.photo.slice(0, dot)}-800${n.photo.slice(dot)}`;
  const useSmall = Boolean(photos?.has(small));
  return `<figure class="${cls}"><img src="${esc(base + (useSmall ? small : n.photo))}" alt="${esc(n.alt || n.title || n.name)}" loading="lazy" decoding="async" width="${useSmall ? 800 : 1024}" height="${useSmall ? 600 : 768}"></figure>`;
}
export function newsHtml(news = [], { limit = 50, teaser = false, photos, photoBase = '/media/photos/', empty: none = 'No post news yet.' } = {}) {
  const list = news.filter((n) => n.enabled !== false).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  if (!list.length) return empty(none);
  return list.map((n) => {
    const first = n.body.split(/\n\s*\n/)[0];
    const body = teaser ? `<p>${esc(first.length > 200 ? `${first.slice(0, 200).trimEnd()}...` : first)}</p>` : paragraphs(n.body);
    return `<article class="vfw-news-item"><h3 class="vfw-news-title">${esc(n.title)}</h3><time class="vfw-news-date" datetime="${n.date}">${esc(longDay(n.date))}</time>${teaser ? '' : photoFigure(n, photos, photoBase)}<div class="vfw-news-body">${body}</div></article>`;
  }).join('');
}

/** What visitors may see, as one object (enabled/available only). */
export const publicData = (s, today) => ({
  today,
  events: (s.events ?? []).filter((e) => e.enabled !== false),
  specials: (s.specials ?? []).filter((x) => x.enabled !== false),
  menu: { hours: s.menu?.hours ?? '', sections: (s.menu?.sections ?? []).map((x) => ({ ...x, items: x.items.filter((i) => i.available !== false) })) },
  news: (s.news ?? []).filter((n) => n.enabled !== false),
});
/** <script type="application/json" id="vfw-data"> so a script (or the static fallback) can read the same data. */
export const dataScript = (s, today) => `<script type="application/json" id="vfw-data">${JSON.stringify(publicData(s, today)).replace(/</g, '\\u003c')}</script>`;

// <!--vfw:name--> is replaced by live content. If the static page has baked seed content, wrap it as
// <!--vfw:name-->seed<!--/vfw:name--> and the whole region is replaced. The names are listed in docs/markers.md.
const MARKER = /<!--vfw:([a-z-]+)-->(?:[\s\S]*?<!--\/vfw:\1-->)?/g;
/** Fill every marker in a page. today = etDay(); year = ?year=N from the URL (calendar), default this year. */
export function injectMarkers(html, state, today, year, { photos, photoBase, shifts = [], settings = {} } = {}) {
  const y = Number.isInteger(+year) && year >= 2000 && year <= 2100 ? +year : +today.slice(0, 4);
  const parts = {
    'events-upcoming': () => upcomingHtml(state.events, today),
    'events-regular': () => regularHtml(state.events),
    'events-featured': () => featuredHtml(state.events, today),
    calendar: () => calendarHtml(state.events, y, today, { nav: true }),
    specials: () => specialsHtml(state.specials, today),
    menu: () => menuHtml(state.menu),
    news: () => newsHtml(state.news, { photos, photoBase }),
    'news-latest': () => newsHtml(state.news, { limit: 3, teaser: true }),
    'tv-slides': () => tvHtml(state, today, { shifts }),
    'volunteer-board': () => volunteerHtml(shifts),
    'help-form': () => helpFormHtml(settings),
    'donate-link': () => donateHtml(settings),
    taps: () => tapsHtml(state.taps),
    shop: () => shopHtml(state.products, { photos, photoBase }),
    data: () => dataScript(state, today),
  };
  return html.replace(MARKER, (m, name) => parts[name]?.() ?? m);
}

// ---------- home "What's going on" (marker: events-featured) ----------
const dateBox = (ymd, cls = '') => {
  const d = parseDay(ymd);
  const f = (o) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  return `<time class="vfw-datebox${cls ? ` ${cls}` : ''}" datetime="${ymd}"><span class="vfw-dn">${d.getUTCDate()}</span><span class="vfw-dm">${esc(f({ month: 'short' }))}</span><span class="vfw-dw">${esc(f({ weekday: 'short' }))}</span></time>`;
};
const whenBadge = (ymd, today) => (ymd === today ? '<span class="vfw-badge vfw-badge-now">Tonight</span>' : ymd <= addDays(today, 6) ? '<span class="vfw-badge">This week</span>' : '');
/** The next event featured big, then the next few as compact date cards. opts: compact (4), days (120), empty. */
export function featuredHtml(events, today, { compact = 4, days = 120, empty: none = 'No upcoming events are listed right now.' } = {}) {
  const list = expand(events, today, addDays(today, days));
  if (!list.length) return empty(none);
  // Feature the next special (one-off) event within 30 days, so a routine weekly night doesn't take the spotlight; else the next event.
  const special = list.find((o) => (!o.recurring || o.recurring === 'none') && o.date <= addDays(today, 30));
  const top = special ?? list[0];
  const rest = list.filter((o) => o !== top);
  const time = (o) => (o.start ? `<span class="vfw-event-time">${esc(timeLabel(o.start, o.end))}</span>` : '');
  const big = `<article class="vfw-feature vfw-cat-${slug(top.category)}">${dateBox(top.date)}<div class="vfw-feature-body">`
    + `<p class="vfw-badges">${whenBadge(top.date, today)}<span class="vfw-event-cat">${esc(top.category)}</span></p>`
    + `<h3 class="vfw-feature-title">${esc(top.title)}</h3><p class="vfw-feature-time">${time(top)}</p>`
    + `${top.description ? `<p class="vfw-feature-desc">${esc(top.description.split(/(?<=[.!?])\s/)[0])}</p>` : ''}</div></article>`;
  const small = rest.slice(0, compact).map((o) => `<li class="vfw-card vfw-cat-${slug(o.category)}">${dateBox(o.date)}<div>${whenBadge(o.date, today)}<strong class="vfw-card-title">${esc(o.title)}</strong>${time(o)}</div></li>`).join('');
  return `<div class="vfw-featured">${big}${small ? `<ul class="vfw-cards">${small}</ul>` : ''}</div>`;
}

// ---------- volunteer board, help form, donate link, bar TV (markers: volunteer-board, help-form, donate-link, tv-slides) ----------
// Private data (sign-ups, help requests, the responder's email) never reaches these: the server passes only the public shapes (see docs/markers.md).
const hp = '<div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>';
const phoneEmail = (p, who) => `<div class="field"><label for="${p}-phone">Phone <span class="opt">Optional</span></label><input id="${p}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" aria-describedby="${p}-contact"></div>`
  + `<div class="field"><label for="${p}-email">Email <span class="opt">Optional</span></label><input id="${p}-email" name="email" type="email" autocomplete="email" maxlength="200" aria-describedby="${p}-contact"></div>`
  + `<p class="hint" id="${p}-contact">A phone or an email, so ${who} can reach you.</p>`;
const spotsLeft = (s) => (s.left <= 0 ? 'Full, thank you' : s.left === 1 ? '1 spot left' : `${s.left} of ${s.slots} spots left`);

/** The sign-up form: shifts are radio cards (work with no JS). shifts = public shape [{id,title,date,start,end,notes,slots,left}], already sorted. */
export function volunteerHtml(shifts = [], { empty: none = `No volunteer shifts are posted right now. Want to help? ${CALL}` } = {}) {
  if (!shifts.length) return empty(none);
  const cards = shifts.map((s) => `<label class="vfw-shift${s.left <= 0 ? ' vfw-full' : ''}"><input type="radio" name="shift" value="${esc(s.id)}" required${s.left <= 0 ? ' disabled' : ''}>`
    + `${dateBox(s.date)}<span class="vfw-shift-body"><strong class="vfw-shift-title">${esc(s.title)}</strong>${s.start ? ` <span class="vfw-event-time">${esc(timeLabel(s.start, s.end))}</span>` : ''}`
    + `${s.notes ? `<span class="vfw-shift-notes">${esc(s.notes)}</span>` : ''}<span class="vfw-badge">${esc(spotsLeft(s))}</span></span></label>`).join('');
  return '<form class="form vfw-vol" id="vol-form" method="post" action="/api/volunteer" novalidate><input type="hidden" name="_page" value="/volunteer">'
    + `<fieldset class="vfw-shifts"><legend>1. Pick a shift</legend>${cards}</fieldset>`
    + `<fieldset class="vfw-details"><legend>2. Your details</legend><div class="field"><label for="vol-name">Your name</label><input id="vol-name" name="name" type="text" autocomplete="name" required maxlength="80"></div>${phoneEmail('vol', 'the organizer')}${hp}</fieldset>`
    + '<p class="hint">We keep your name and phone or email only to organize this shift, and delete them a week after it. Call the post to be taken off sooner.</p>'
    + '<p><button class="btn" type="submit">Sign me up</button></p></form>';
}

const tel = POST.phone.replace(/\D/g, '');
/** The help request form plus its "what happens next" column, or the call-the-post panel when the form is off. */
export function helpFormHtml(settings = {}) {
  if (!settings.helpEnabled || !settings.responderName) {
    return `<div class="panel vfw-help-off"><h3>Call the post to ask for help</h3><p>The online request form isn't open yet. Call ${POST.phone} and ask for help for a veteran. For benefits and claims help now, see the Resources page.</p>`
      + `<p class="btn-row"><a class="btn" href="tel:${tel}">Call ${POST.phone}</a><a class="btn btn-outline" href="/resources">Go to Resources</a></p></div>`;
  }
  const who = settings.responderName + (settings.responderRole ? `, ${settings.responderRole}` : '');
  const kinds = Object.entries(HELP_KINDS).map(([k, v], i) => `<label class="vfw-choice"><input type="radio" name="kind" value="${k}"${i ? '' : ' required'}><span>${esc(v)}</span></label>`).join('');
  const times = Object.entries(BEST_TIMES).map(([k, v]) => `<label class="vfw-chip"><input type="radio" name="bestTime" value="${k}"><span>${esc(v)}</span></label>`).join('');
  return `<div class="info-two vfw-help" data-responder="${esc(settings.responderName)}"><div><p class="hint vfw-help-note">This form is not watched around the clock. If it can't wait, call 988 and press 1, or 911.</p>`
    + '<form class="form vfw-helpform" id="help-form" method="post" action="/api/help-request" novalidate><input type="hidden" name="_page" value="/help">'
    + '<div class="field"><label for="help-name">Your name</label><input id="help-name" name="name" type="text" autocomplete="name" required maxlength="80"></div>'
    + phoneEmail('help', 'the post')
    + `<fieldset class="field vfw-times"><legend>Best time to reach you <span class="opt">Optional</span></legend><div class="vfw-chips">${times}</div></fieldset>`
    + `<fieldset class="field vfw-kinds"><legend>What can we help with?</legend>${kinds}</fieldset>`
    + '<div class="field"><label for="help-msg">Tell us a little more <span class="opt">Optional</span></label><textarea id="help-msg" name="message" rows="4" maxlength="1000" aria-describedby="help-msg-hint"></textarea><p class="hint" id="help-msg-hint">Who it\'s for and what\'s going on, in a few words.</p></div>'
    + `${hp}<p><button class="btn" type="submit">Send my request</button></p>`
    + '<p class="hint">Only the post\'s help volunteer and the website admin can read this. Please don\'t include medical details or Social Security or VA claim numbers. Requests are deleted after 90 days; call the post to have yours removed sooner.</p></form></div>'
    + '<div class="panel"><h3>What happens next</h3><ol class="tl">'
    + `<li><span class="when">Step 1</span><div class="what"><p>Your request goes to ${esc(who)}.</p></div></li>`
    + '<li><span class="when">Step 2</span><div class="what"><p>They will call or email you back to talk it through.</p></div></li>'
    + '<li><span class="when">Step 3</span><div class="what"><p>The post can\'t give medical or legal advice, but can point you to free help like VFW Service Officers. <a href="/resources">See the Resources page</a>.</p></div></li></ol>'
    + `<p class="btn-row"><a class="btn btn-outline" href="tel:${tel}">Rather talk now? Call ${POST.phone}</a></p></div></div>`;
}

/** The Donate button, only when the admin has set an https link. */
export const donateHtml = (settings = {}) => (settings.donateUrl
  ? `<p class="btn-row"><a class="btn" href="${esc(settings.donateUrl)}" rel="noopener noreferrer">${esc(settings.donateLabel || 'Donate online')}</a></p><p class="hint">Opens our payment service's secure page. The post never sees your card.</p>` : '');

const SOON = `<div class="panel vfw-shop-soon"><h3>Coming soon</h3><p>Post merchandise will be listed here. Want something now? Call the post at <a href="tel:${tel}">${POST.phone}</a>.</p></div>`;
/** The post shop (marker: shop): product cards, then the pickup order form when any product has no checkout link. Only enabled products; order data never comes through here. */
export function shopHtml(products = [], { photos, photoBase = '/media/photos/' } = {}) {
  const list = products.filter((p) => p.enabled !== false);
  if (!list.length) return SOON;
  const pickup = list.filter((p) => !p.checkoutUrl);
  const card = (p) => `<li class="vfw-prod panel" id="p-${esc(p.id)}">${photoFigure(p, photos, photoBase, 'vfw-prod-photo') || '<div class="vfw-prod-photo vfw-prod-ph" aria-hidden="true"></div>'}`
    + `<h3 class="vfw-prod-name">${esc(p.name)}</h3>${p.price ? `<p class="vfw-prod-price">${esc(p.price)}</p>` : ''}`
    + `${p.options?.length ? `<p class="vfw-prod-opts">Options: ${esc(p.options.join(', '))}</p>` : ''}${p.description ? `<p class="vfw-prod-desc">${esc(p.description)}</p>` : ''}`
    + `<p class="btn-row">${p.checkoutUrl ? `<a class="btn" href="${esc(p.checkoutUrl)}" rel="noopener noreferrer">Buy online</a>` : `<a class="btn btn-outline" href="#order" data-item="${esc(p.id)}">Order and pay at pickup</a>`}</p></li>`;
  const choose = pickup.map((p) => (p.options?.length
    ? `<optgroup label="${esc(p.name + (p.price ? ` · ${p.price}` : ''))}">${p.options.map((o, i) => `<option value="${esc(p.id)}/${i + 1}">${esc(o)}</option>`).join('')}</optgroup>`
    : `<option value="${esc(p.id)}/0">${esc(p.name)}</option>`)).join('');
  const form = pickup.length ? '<div class="panel vfw-order" id="order"><h3>Order and pay at pickup</h3><p>Send your order and we\'ll call or email you when it\'s ready to pick up. You pay at the post.</p>'
    + '<form class="form vfw-orderform" id="order-form" method="post" action="/api/shop-order" novalidate><input type="hidden" name="_page" value="/shop">'
    + `<div class="field"><label for="shop-item">What would you like?</label><select id="shop-item" name="item" required><option value="">Choose one</option>${choose}</select></div>`
    + '<div class="field vfw-qty"><label for="shop-qty">How many?</label><input id="shop-qty" name="qty" type="number" min="1" max="20" value="1" inputmode="numeric" required></div>'
    + '<div class="field"><label for="shop-name">Your name</label><input id="shop-name" name="name" type="text" autocomplete="name" required maxlength="80"></div>'
    + phoneEmail('shop', 'the post')
    + '<div class="field"><label for="shop-note">Pickup note <span class="opt">Optional</span></label><textarea id="shop-note" name="note" rows="3" maxlength="500" aria-describedby="shop-note-hint"></textarea><p class="hint" id="shop-note-hint">Like when you\'d like to pick it up.</p></div>'
    + `${hp}<p><button class="btn" type="submit">Send my order</button></p>`
    + '<p class="hint">We use your name and phone or email only for this order, and delete them after 12 months. Call the post to have yours removed sooner.</p></form></div>' : '';
  return `<ul class="vfw-shop">${list.map(card).join('')}</ul>${list.some((p) => p.checkoutUrl) ? '<p class="hint">Buy online opens our payment service\'s secure page. The post never sees your card.</p>' : ''}`
    + `<p class="hint">Items with the official VFW emblem are made by VFW-licensed vendors.</p>${form}`;
}

// Bar TV: slides the screen rotates through. Each is a div.tv-slide[data-secs]; a slide with nothing to show is left out; long lists are split in fives.
const firstSentence = (t = '') => t.split(/(?<=[.!?])\s/)[0];
const tvRow = ({ when, name, price, note }) => `<li class="tv-row">${when ? `<span class="tv-when">${esc(when)}</span>` : ''}<strong class="tv-name">${esc(name)}</strong>${price ? `<span class="tv-price">${esc(price)}</span>` : ''}${note ? `<p class="tv-note">${esc(note)}</p>` : ''}</li>`;
const tvSlide = (label, title, inner, secs = 12) => `<div class="tv-slide" data-secs="${secs}"><p class="tv-label">${esc(label)}</p><h2 class="tv-title">${esc(title)}</h2>${inner}</div>`;
const tvList = (label, title, rows, tail = '') => {
  const parts = [];
  for (let i = 0; i < rows.length; i += 5) parts.push(rows.slice(i, i + 5));
  return parts.map((p, i) => tvSlide(label, title + (parts.length > 1 ? ` (${i + 1} of ${parts.length})` : ''), `<ul class="tv-rows">${p.map(tvRow).join('')}</ul>${i === parts.length - 1 ? tail : ''}`)).join('');
};
/** shifts = the public shape (see volunteerHtml). Reads only enabled, public content. */
export function tvHtml(state = {}, today, { shifts = [] } = {}) {
  const out = [];
  const L = parseDay(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  out.push(tvList(L, 'Tonight at the post', expand(state.events, today, today).map((o) => ({ when: timeLabel(o.start, o.end), name: o.title, note: firstSentence(o.description) }))));
  const dow = parseDay(today).getUTCDay();
  out.push(tvList(L, "Today's drink specials", (state.specials ?? [])
    .filter((s) => s.enabled !== false && (!s.start || s.start <= today) && (!s.end || today <= s.end) && (s.period !== 'weekly' || s.weekday === dow))
    .sort(specialOrder).map((s) => ({ name: s.label, price: s.price, note: s.description }))));
  const items = (state.menu?.sections ?? []).flatMap((s) => s.items.filter((i) => i.available !== false)).slice(0, 6);
  if (items.length) out.push(tvSlide(L, 'From the kitchen', `${state.menu.hours ? `<p class="tv-hours">${esc(state.menu.hours)}</p>` : ''}<ul class="tv-rows tv-cols">${items.map((i) => tvRow({ name: i.name, price: i.price })).join('')}</ul>`, 20));
  const soon = expand(state.events, addDays(today, 1), addDays(today, 60));
  const top = soon.find((o) => !o.recurring || o.recurring === 'none');
  const more = soon.filter((o) => o !== top).slice(0, 2).map((o) => ({ when: shortDay(o.date), name: o.title, note: timeLabel(o.start, o.end) }));
  if (top || more.length) {
    const big = top ? `<div class="tv-next">${dateBox(top.date, 'tv-big')}<div><strong class="tv-name">${esc(top.title)}</strong>${top.start ? `<span class="tv-when">${esc(timeLabel(top.start, top.end))}</span>` : ''}</div></div>` : '';
    out.push(tvSlide(L, 'Coming up', big + (more.length ? `<ul class="tv-rows">${more.map(tvRow).join('')}</ul>` : '')));
  }
  out.push(tvList('Help wanted', 'The post needs volunteers', shifts.filter((s) => s.left > 0 && s.date >= today && s.date <= addDays(today, 14)).slice(0, 3)
    .map((s) => ({ when: shortDay(s.date), name: s.title, note: s.left === 1 ? '1 spot left' : `${s.left} spots left` })), "<p class=\"tv-note\">Sign up at the bar or on the post's website.</p>"));
  return out.join('') || tvSlide('Welcome', POST.name, `<p class="tv-note">${esc(POST.barRule)}</p>`); // never a blank screen
}
