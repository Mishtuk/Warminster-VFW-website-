// Printable monthly flyer. The render functions are pure so the static build (flyer.astro) and the browser (below) draw the same sheet.
// In the browser the flyer is redrawn from #vfw-data (so admin edits show up) for the month in ?month=YYYY-MM, default the current month.
import { DAYS, esc, expand, timeLabel } from '../lib/state.js';
import { POST } from '../lib/post.js';

const MAX_SPECIAL = 7;
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
export const EMPTY = `No special events listed yet. Call the post at ${POST.phone}.`;

type Ev = { title: string; date: string; start?: string; end?: string; recurring?: string; enabled?: boolean; [k: string]: any };

const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const two = (n: number) => String(n).padStart(2, '0');
const lastDay = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

export const monthOf = (ymd: string) => ymd.slice(0, 7);
/** shiftMonth("2026-12", 1) -> "2027-01". */
export const shiftMonth = (ym: string, by: number) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + by, 1));
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`;
};
/** A valid ?month value (YYYY-MM, month 01 to 12) within 12 months before and 24 months after the current month; anything else gives the current month. */
export const pickMonth = (param: string | null | undefined, current: string) => {
  if (!param || !/^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return current;
  return param >= shiftMonth(current, -12) && param <= shiftMonth(current, 24) ? param : current;
};
export const monthTitle = (ym: string) => `${utc(`${ym}-01`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} ${ym.slice(0, 4)}`;
export const headingText = (ym: string) => `${POST.short.replace('VFW ', '')} · ${monthTitle(ym)}`;

/** The month's one-off (special) events as a dated list, earliest first. */
export function specialsHtml(events: Ev[], ym: string): string {
  const list = (expand(events, `${ym}-01`, `${ym}-${two(lastDay(ym))}`) as Ev[]).filter((o) => o.recurring === 'none');
  if (!list.length) return `<p class="fl-empty">${esc(EMPTY)}</p>`;
  const row = (o: Ev) => {
    const day = utc(o.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `<li><time datetime="${esc(o.date)}">${esc(day)}</time> ${o.start ? `<span class="fl-t">${esc(timeLabel(o.start, o.end))}</span> ` : ''}<strong>${esc(o.title)}</strong></li>`;
  };
  const more = list.length - MAX_SPECIAL;
  return `<ul>${list.slice(0, MAX_SPECIAL).map(row).join('')}${more > 0 ? `<li class="fl-more">And ${more} more. Call the post at ${esc(POST.phone)}.</li>` : ''}</ul>`;
}

/** The nights that repeat, one line each: "Every Thursday 4:30 PM Thursday Bingo". Same title and time merge ("1st, 3rd and 4th Monday"). */
export function weeklyHtml(events: Ev[]): string {
  const rows = new Map<string, { e: Ev; days: Set<number>; ords: Map<number, string[]>; monthly: boolean }>();
  for (const e of events.filter((x) => x.enabled !== false && x.recurring && x.recurring !== 'none')) {
    const key = [e.title, e.start, e.end].join('|');
    const r = rows.get(key) ?? { e, days: new Set(), ords: new Map(), monthly: false };
    const d = utc(e.date), dow = d.getUTCDay();
    if (e.recurring === 'weekly') r.days.add(dow);
    else if (e.recurring === 'monthly_weekday') r.ords.set(dow, [...(r.ords.get(dow) ?? []), ORD[Math.ceil(d.getUTCDate() / 7)]]);
    else r.monthly = true;
    rows.set(key, r);
  }
  if (!rows.size) return `<p class="fl-empty">${esc(`Call the post at ${POST.phone}.`)}</p>`;
  const join = (a: string[]) => (a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const out = [...rows.values()].map((r) => {
    const labels = [...r.days].sort().map((d) => `Every ${DAYS[d]}`);
    for (const [d, o] of r.ords) labels.push(`${join([...o].sort())} ${DAYS[d]}`);
    if (r.monthly) labels.push('Monthly');
    const first = r.days.size ? Math.min(...r.days) : r.ords.size ? Math.min(...r.ords.keys()) : 7;
    return { first, start: r.e.start || '', html: `<li><strong>${esc(labels.join(', '))}</strong> ${r.e.start ? `<span class="fl-t">${esc(timeLabel(r.e.start, r.e.end))}</span> ` : ''}${esc(r.e.title)}</li>` };
  }).sort((a, b) => a.first - b.first || a.start.localeCompare(b.start));
  return `<ul>${out.map((o) => o.html).join('')}</ul>`;
}

// ---- browser ----
if (typeof document !== 'undefined') {
  const $ = (id: string) => document.getElementById(id);
  let data: { today?: string; events?: Ev[] } = {};
  try { data = JSON.parse($('vfw-data')?.textContent || '{}'); } catch { /* keep the page as built */ }
  const current = monthOf(data.today || '');
  if (/^\d{4}-\d{2}$/.test(current)) {
    const ym = pickMonth(new URLSearchParams(location.search).get('month'), current);
    const events = data.events ?? [];
    const title = $('fl-title'), special = $('fl-special'), weekly = $('fl-weekly');
    if (title) title.textContent = headingText(ym);
    if (special) special.innerHTML = specialsHtml(events, ym);
    if (weekly) weekly.innerHTML = weeklyHtml(events);
    document.title = `${monthTitle(ym)} flyer | ${POST.short}`;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-flyer-month]')) {
      const m = shiftMonth(current, +(a.dataset.flyerMonth || 0));
      a.href = `?month=${m}`;
      if (m === ym) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    }
  }
  $('fl-print')?.addEventListener('click', () => print());
}
