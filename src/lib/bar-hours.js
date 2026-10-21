// Live bar status from POST.hours (the one source of truth), in Eastern time. Pure: barStatus(date) -> { open, label }.
import { POST } from './post.js';

const TZ = 'America/New_York';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "5 PM" or "5:30 PM" -> minutes after midnight (12 AM = 0). */
const clock = (s) => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(s.trim());
  return m ? ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +(m[2] || 0) : NaN;
};

/** Weekly schedule, Sunday first: [{ from, to }] in minutes, or null when closed. A close at or before the open runs past midnight (to > 1440). */
export function parseWeek(hours = POST.hours) {
  const week = Array(7).fill(null);
  for (const [days, span] of hours) {
    const [a, b = a] = days.split(' to ');
    const [f, t] = span.split(' to ').map(clock);
    let i = DAYS.indexOf(a);
    const j = DAYS.indexOf(b);
    if (i < 0 || j < 0 || Number.isNaN(f) || Number.isNaN(t)) continue;
    for (;;) { week[i] = { from: f, to: t <= f ? t + 1440 : t }; if (i === j) break; i = (i + 1) % 7; }
  }
  return week;
}

const WEEK = parseWeek();

/** 1020 -> "5 PM", 1050 -> "5:30 PM". */
const fmt = (min) => {
  const m = min % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const until = (min) => (min % 1440 === 0 ? 'midnight' : fmt(min));

/** Eastern weekday (0 = Sunday) and minutes after midnight for an instant. */
function etParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { day: SHORT.indexOf(p.weekday), min: (+p.hour % 24) * 60 + +p.minute };
}

/** Is the bar open at this instant, and what to say about it. */
export function barStatus(date = new Date(), week = WEEK) {
  const { day, min } = etParts(date);
  const today = week[day];
  const prev = week[(day + 6) % 7];
  // A late close belongs to the night before: Friday 4 PM to 12 AM is Friday's hours only.
  if (prev && prev.to > 1440 && min < prev.to - 1440) return { open: true, label: `Open now, until ${until(prev.to)}` };
  if (today && min >= today.from && min < today.to) return { open: true, label: `Open now, until ${until(today.to)}` };
  if (today && min < today.from) return { open: false, label: `Opens at ${fmt(today.from)} today` };
  for (let k = 1; k <= 7; k++) {
    const d = week[(day + k) % 7];
    if (!d) continue;
    const name = k === 1 ? 'tomorrow' : DAYS[(day + k) % 7];
    return { open: false, label: `${k === 1 ? 'Closed now' : 'Closed today'}, opens ${name} ${fmt(d.from)}` };
  }
  return { open: false, label: 'Closed now' };
}
