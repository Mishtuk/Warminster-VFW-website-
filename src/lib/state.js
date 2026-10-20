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
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDay(parseDay(s)) === s;
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

export function validateNews(b) {
  b = b ?? {};
  const title = text(b.title, 120);
  if (!title) return { error: 'title' };
  if (!isDate(b.date)) return { error: 'date' };
  const body = para(b.body, 5000);
  if (!body) return { error: 'body' };
  return { value: { id: id(b.id), title, date: b.date, body, enabled: flag(b.enabled) } };
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

/** Hall inquiry from the public form. Needs a name and a way to reach them (phone or email). Honeypot is checked by the caller. */
export function validateInquiry(b) {
  b = b ?? {};
  const name = text(b.name, 100);
  if (!name) return { error: 'name' };
  const phone = text(b.phone, 30);
  if (phone && (phone.replace(/\D/g, '').length < 7 || !/^[\d\s()+.-]+(x\d+)?$/i.test(phone))) return { error: 'phone' };
  const email = text(b.email, 200).toLowerCase();
  if (email && !EMAIL.test(email)) return { error: 'email' };
  if (!phone && !email) return { error: 'contact' };
  const eventDate = optDate(b.eventDate ?? b.event_date);
  if (eventDate === null) return { error: 'eventDate' };
  const raw = b.guests === undefined || b.guests === null ? '' : String(b.guests).trim();
  const guests = raw === '' ? null : Number(raw);
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 2000)) return { error: 'guests' };
  return { value: { name, phone, email, eventDate, eventType: text(b.eventType ?? b.event_type, 80), guests, message: para(b.message, 2000) } };
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
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ':00'} ${h < 12 ? 'AM' : 'PM'}`; };
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
/** Regular nights (anything that repeats), each described once: <ul class="vfw-events vfw-regular">. Same title, time and text merge into one row. */
export function regularHtml(events = [], { empty: none = 'No regular nights are listed right now.' } = {}) {
  const rows = new Map();
  for (const e of events.filter((x) => x.enabled !== false && x.recurring !== 'none')) {
    const key = [e.title, e.start, e.end, e.description].join('|');
    const row = rows.get(key) ?? { e, labels: [] };
    row.labels.push(scheduleLabel(e));
    rows.set(key, row);
  }
  if (!rows.size) return empty(none);
  return `<ul class="vfw-events vfw-regular">${[...rows.values()].map(({ e, labels }) => `<li class="vfw-event vfw-cat-${slug(e.category)}"><strong class="vfw-event-date">${esc(labels.join(', '))}</strong>`
    + `${e.start ? ` <span class="vfw-event-time">${esc(timeLabel(e.start, e.end))}</span>` : ''} <strong class="vfw-event-title">${esc(e.title)}</strong>`
    + ` <span class="vfw-event-cat">${esc(e.category)}</span>${e.description ? `<p class="vfw-event-desc">${esc(e.description)}</p>` : ''}</li>`).join('')}</ul>`;
}

const PERIOD_LABEL = (s) => (s.period === 'weekly' ? `Every ${DAYS[s.weekday]}` : { daily: 'Daily', monthly: 'This month', seasonal: 'Seasonal' }[s.period]);
/** Specials that are enabled and in their date range today: <ul class="vfw-specials">. */
export function specialsHtml(specials = [], today, { empty: none = `No specials are posted right now. ${CALL}` } = {}) {
  const live = specials.filter((s) => s.enabled !== false && (!s.start || s.start <= today) && (!s.end || today <= s.end));
  return live.length ? `<ul class="vfw-specials">${live.map((s) => `<li class="vfw-special"><strong class="vfw-special-label">${esc(s.label)}</strong>`
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
export function newsHtml(news = [], { limit = 50, teaser = false, empty: none = 'No post news yet.' } = {}) {
  const list = news.filter((n) => n.enabled !== false).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  if (!list.length) return empty(none);
  return list.map((n) => {
    const first = n.body.split(/\n\s*\n/)[0];
    const body = teaser ? `<p>${esc(first.length > 200 ? `${first.slice(0, 200).trimEnd()}...` : first)}</p>` : paragraphs(n.body);
    return `<article class="vfw-news-item"><h3 class="vfw-news-title">${esc(n.title)}</h3><time class="vfw-news-date" datetime="${n.date}">${esc(longDay(n.date))}</time><div class="vfw-news-body">${body}</div></article>`;
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
export function injectMarkers(html, state, today, year) {
  const y = Number.isInteger(+year) && year >= 2000 && year <= 2100 ? +year : +today.slice(0, 4);
  const parts = {
    'events-upcoming': () => upcomingHtml(state.events, today),
    'events-regular': () => regularHtml(state.events),
    calendar: () => calendarHtml(state.events, y, today, { nav: true }),
    specials: () => specialsHtml(state.specials, today),
    menu: () => menuHtml(state.menu),
    news: () => newsHtml(state.news),
    'news-latest': () => newsHtml(state.news, { limit: 3, teaser: true }),
    data: () => dataScript(state, today),
  };
  return html.replace(MARKER, (m, name) => parts[name]?.() ?? m);
}
