// schema.org JSON-LD for search engines. Facts come from POST only; `site` is the absolute site root including BASE
// (e.g. "https://host/Warminster-VFW-website-/"), so every URL here honours the BASE switch.
import { POST } from './post.js';
import { parseWeek } from './bar-hours.js';
import { eventPhotos } from './event-photos.js';
import { eventHref } from './state.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const abs = (site, path) => `${String(site).replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
const hhmm = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const address = () => ({
  '@type': 'PostalAddress', streetAddress: POST.street, addressLocality: POST.city, addressRegion: POST.region, postalCode: POST.zip, addressCountry: 'US',
});

/** Opening hours of the bar from POST.hours. A close at midnight is written "23:59" (the form Google's docs use for end of day;
 *  "24:00" is not valid ISO 8601 time and "00:00" reads as the start of the same day). */
function hours() {
  return parseWeek().flatMap((d, i) => {
    if (!d) return [];
    const closes = d.to === 1440 ? '23:59' : hhmm(d.to);
    return [{ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[i], opens: hhmm(d.from), closes }];
  });
}

/** The post as a place and an organization. LocalBusiness (an Organization and a Place) is the closest fit for a post with a members'
 *  bar and a rentable hall: it is what lets search show the address, phone and openingHoursSpecification. */
export function orgLd(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: POST.name,
    url: abs(site, '/'),
    logo: abs(site, '/brand/icon-512.png'),
    image: abs(site, '/brand/og.jpg'),
    telephone: POST.phone,
    email: POST.email,
    address: address(),
    description: `${POST.motto}. Hours listed are for the bar.`,
    openingHoursSpecification: hours(),
    sameAs: [POST.facebook],
  };
}

// Eastern UTC offset ("-04:00" / "-05:00") on a date, read at noon UTC so a changeover at 2 AM local is already done.
function offset(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).find((p) => p.type === 'timeZoneName').value;
  const o = part.replace('GMT', '').replace('−', '-');
  return o.length > 3 ? o : `${o}:00`;
}
const stamp = (ymd, t) => (t ? `${ymd}T${t}:00${offset(ymd)}` : ymd);
const nextDay = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };
const firstSentence = (s = '') => (/^.*?[.!?](?=\s|$)/.exec(String(s).trim()) || [String(s).trim()])[0];

/** Event objects for the next ~10 one-off dated events within `days` of `today` (YYYY-MM-DD). Repeating nights are left out. */
export function eventsLd(events = [], today, site, { limit = 10, days = 120 } = {}) {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  const place = { '@type': 'Place', name: POST.name, address: address() };
  return events
    .filter((e) => e.enabled !== false && (e.recurring ?? 'none') === 'none' && e.date >= today && e.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((e) => {
      const o = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: e.title,
        startDate: stamp(e.date, e.start),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: place,
        organizer: { '@type': 'Organization', name: POST.name, url: abs(site, '/') },
        url: abs(site, eventHref('/events', e, today)),
      };
      if (e.end && e.start) o.endDate = stamp(e.end <= e.start ? nextDay(e.date) : e.date, e.end);
      const text = firstSentence(e.description);
      if (text) o.description = text;
      o.image = [abs(site, `/media/photos/${eventPhotos(e)[0].name}.webp`)];
      return o;
    });
}
