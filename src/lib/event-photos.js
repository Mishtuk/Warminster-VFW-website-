// Picks a real post photo for an event from its title, else its category. Alt text describes the picture, never the event.
// Names are files in public/media/photos (NAME.webp and NAME-800.webp). Plain JS: used by state.js in Astro and in server.js.
const BY_TITLE = [
  [/line danc/i, 'hero-linedance', 'Line dancers on the hall floor under party lights'],
  [/dance party|\bDJ\b|live band/i, 'hall-02', 'The stage with a blue curtain and a US flag'],
  [/halloween|costume/i, 'life-halloween', 'Two members in costume at the bar'],
  [/memorial day/i, 'hero-memorial-guard', 'Honor guard standing with rifles at the Memorial Day ceremony'],
  [/flags on|graves/i, 'hero-memorial-flag', 'A veteran raising the flag on the pole'],
  [/veterans day|marine corps/i, 'hero-memorial-vets', 'Two veterans smiling and waving at the Memorial Day parade'],
  [/independence|fourth of july|july 4/i, 'hero-usa250-six', 'Six members in red, white and blue at the photo backdrop'],
  [/meeting/i, 'hero-60th-table', 'The VFW information table with the motto banner'],
  [/brunch|banquet|dinner/i, 'hero-buffet', 'Members gathered around a long buffet table in the hall'],
  [/cash bash/i, 'hero-check', 'Members of the post posing with a large check'],
  [/christmas|sweater/i, 'hero-sweater-group', 'Members in ugly Christmas sweaters'],
];
const BY_CATEGORY = {
  Auxiliary: ['hero-june-auxiliary', 'Six women standing in front of a flag and balloon backdrop'],
  Bar: ['hall-03', 'Inside the hall at the post'],
  Holiday: ['hero-memorial-flag', 'A veteran raising the flag on the pole'],
  Community: ['hero-june-group', 'A group of members lined up in front of a flag backdrop'],
};
const FALLBACK = ['hall-01', 'The outside of the post building'];

/** The photo for an event (needs title and category). Returns { name, alt }. */
export function eventPhoto(o) {
  const title = String(o?.title ?? '');
  for (const [re, name, alt] of BY_TITLE) if (re.test(title)) return { name, alt };
  const [name, alt] = Object.hasOwn(BY_CATEGORY, o?.category) ? BY_CATEGORY[o.category] : FALLBACK;
  return { name, alt };
}
