import type { APIRoute } from 'astro';
import events from '../content/events.json';
import { POST } from '../lib/post.js';

// Static calendar file built from src/content/events.json (the seed). Recurring nights use RRULE; times are America/New_York.
// ponytail: built at deploy time, so admin edits on the live server are not in it; generate it from the server if that matters.
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: string) => d.replaceAll('-', '');
const hms = (t: string) => `${t.replace(':', '')}00`;
const BS = String.fromCharCode(92);
const esc = (s: string) => s.split(BS).join(BS + BS).replace(/([,;])/g, BS + '$1').split(String.fromCharCode(10)).join(BS + 'n');
const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// US Eastern rules (since 2007), enough for any date in this calendar.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:20070311T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:20071104T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

function vevent(e: (typeof events)[number], i: number, stamp: string) {
  const [y, m, d] = e.date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nth = Math.ceil(d / 7);
  const lines = ['BEGIN:VEVENT', `UID:vfw6493-${i}-${ymd(e.date)}@warminster-vfw`, `DTSTAMP:${stamp}`];
  if (e.start) {
    lines.push(`DTSTART;TZID=America/New_York:${ymd(e.date)}T${hms(e.start)}`);
    // No end time unless the post gave one (an event without DTEND is shown as a point in time).
    if (e.end) lines.push(`DTEND;TZID=America/New_York:${ymd(e.date)}T${hms(e.end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`);
  }
  if (e.recurring === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
  else if (e.recurring === 'monthly_weekday') lines.push(`RRULE:FREQ=MONTHLY;BYDAY=${nth > 4 ? -1 : nth}${DAY[dow]}`);
  else if (e.recurring === 'monthly') lines.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${d}`);
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push(`LOCATION:${esc(POST.address)}`, 'END:VEVENT');
  return lines;
}

export const GET: APIRoute = () => {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VFW Post 6493//Events//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(POST.name)}`, 'X-WR-TIMEZONE:America/New_York',
    ...VTIMEZONE,
    ...events.filter((e) => e.enabled !== false).flatMap((e, i) => vevent(e, i, stamp)),
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
