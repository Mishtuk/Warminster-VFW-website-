// Picks real post photos for an event from its title, else its category. Alt text describes the picture, never the event.
// Names are files in public/media/photos (NAME.webp and NAME-800.webp). Plain JS: used by state.js in Astro and in server.js.
// A rule lists one photo, or a bundle of three or four that the home page cycles through (the first is shown when motion is off).
const p = (name, alt) => ({ name, alt });
const BY_TITLE = [
  [/line danc/i, [
    p('hero-linedance', 'Line dancers on the hall floor under party lights'),
    p('hero-linedance-2', 'Dancers on the hall floor under red and blue lights'),
    p('hero-linedance-3', 'Line dancers circling the hall floor'),
  ]],
  [/live band/i, [
    p('hero-band-1', 'A live band playing on the stage at the post'),
    p('hero-linedance-2', 'Dancers on the hall floor under red and blue lights'),
    p('hall-02', 'The stage with a blue curtain and a US flag'),
  ]],
  [/dance party|\bDJ\b/i, [
    p('hall-02', 'The stage with a blue curtain, speakers and a sound system'),
    p('hero-linedance-3', 'Dancers circling the hall floor'),
    p('hero-linedance-2', 'Dancers on the hall floor under red and blue lights'),
  ]],
  [/halloween|costume/i, [
    p('hero-halloween-10', 'A group of members in Halloween costumes in the hall'),
    p('hero-halloween-bar', 'Two members in costume at the bar'),
    p('hero-halloween-1', 'Two members in matching costumes dancing in the hall'),
    p('hero-halloween-12', 'Two members dressed as a king and a queen of cards'),
  ]],
  [/memorial day/i, [
    p('hero-memorial-guard', 'Honor guard standing with rifles at the Memorial Day ceremony'),
    p('hero-memorial-camel', 'A camel wearing bunting in the Memorial Day parade'),
    p('hero-memorial-bugle', 'Honor guard lined up in the parking lot at the ceremony'),
    p('hero-memorial-pair', 'Two veterans in uniform at the Memorial Day ceremony'),
  ]],
  [/flags on|graves/i, [
    p('hero-outdoor-3', 'Members in blue shirts on a sunny lawn'),
    p('hero-outdoor-1', 'Members in blue shirts on the grass looking over a map'),
    p('hero-memorial-flag', 'A veteran raising the flag on the pole'),
  ]],
  [/marine corps/i, [
    p('hero-sept-2', 'A row of veterans in jackets and blazers standing together'),
    p('hero-60th-dessert', 'Cake and a dessert table under a red, white and blue balloon arch'),
    p('hero-gather-1', 'A large group of veterans posing together in the hall'),
  ]],
  [/veterans day/i, [
    p('hero-vets-4', 'A woman holding a welcome and thank you sign for veterans'),
    p('hero-vets-3', 'Veterans in wheelchairs on an outing, with helpers beside them'),
    p('hero-memorial-pair', 'Two veterans in uniform at a ceremony'),
  ]],
  [/independence|fourth of july|july 4/i, [
    p('hero-usa250-six', 'Six members in red, white and blue at the photo backdrop'),
    p('hero-usa250-hall', 'Members eating at decorated tables in the hall'),
    p('hero-usa250-trio', 'Three men in patriotic shirts at the photo backdrop'),
    p('hero-usa250-four', 'Four members with photo props in front of a USA 250 backdrop'),
  ]],
  [/meeting/i, [
    p('hero-gather-2', 'Members in matching blue shirts gathered in front of a stage curtain'),
    p('hero-gather-1', 'A large group of veterans posing together in the hall'),
    p('hero-60th-table', 'The VFW information table with the motto banner'),
  ]],
  [/eagles/i, [
    p('hero-eagles-6', 'Four members in Eagles green at a stadium photo backdrop'),
    p('hero-buffet', 'Members gathered around a long buffet table in the hall'),
    p('hero-superbowl-3', 'The bar full of fans in Eagles green'),
    p('hero-eagles-4', 'Three women in Eagles shirts at a stadium photo backdrop'),
  ]],
  [/banquet/i, [
    p('hero-dinner-5', 'Members seated at round tables for a dinner in the hall'),
    p('hero-dinner-3', 'Guests mingling at tables with blue and red cloths'),
    p('hero-dinner-8', 'A buffet line of trays and sides at a hall dinner'),
  ]],
  [/brunch|dinner/i, [p('hero-buffet', 'Members gathered around a long buffet table in the hall')]],
  [/cash bash/i, [
    p('hero-tables-3', 'Gift baskets and numbered bags on a prize table in the hall'),
    p('hero-tables-2', 'Prize items and numbered bags on a blue-covered table'),
    p('hero-dinner-6', 'A crowd seated at tables across the hall'),
  ]],
  [/craft fair/i, [
    p('hero-cookie24-1', 'Neighbors browsing tables of baked goods in the hall'),
    p('hero-easter-3', 'Visitors looking over tables of baskets in the hall'),
    p('hero-cookie24-2', 'Tables of goods and shoppers in the hall'),
  ]],
  [/cornhole/i, [
    p('hero-cornhole-2', 'Two cornhole players cheering behind a board'),
    p('hero-cornhole-4', 'Two cornhole players holding up their prizes behind a board'),
    p('hero-cornhole-5', 'Two cornhole players with their winnings behind a board'),
    p('hero-cornhole-8', 'Two cornhole players smiling behind a board'),
  ]],
  [/christmas|sweater/i, [
    p('hero-sweater-group', 'Members in ugly Christmas sweaters'),
    p('hero-xmas-3', 'A holiday party in full swing in the hall'),
    p('hero-sweater-trio', 'Three members in holiday sweaters'),
  ]],
  [/bingo/i, [p('hero-june-auxiliary', 'Six women standing in front of a flag and balloon backdrop')]],
  [/blizzard|bash/i, [p('hero-decbar-2', 'Members cheering around a long table at the bar under string lights')]],
  [/valentine/i, [p('hero-feb-1', 'Three women smiling together at the bar')]],
  [/cinco/i, [p('hero-novbar-3', 'Staff and regulars at the bar under warm lights')]],
  [/iron pigs/i, [p('hero-redfriday-1', 'A group of members in matching red shirts')]],
];
const BY_CATEGORY = {
  Auxiliary: [p('hero-june-auxiliary', 'Six women standing in front of a flag and balloon backdrop')],
  Bar: [p('hero-novbar-3', 'Staff and regulars at the bar under warm lights')],
  Holiday: [p('hero-memorial-flag', 'A veteran raising the flag on the pole')],
  Community: [p('hero-june-group', 'A group of members lined up in front of a flag backdrop')],
};
const FALLBACK = [p('hall-01', 'The outside of the post building')];

/** Every photo for an event (needs title and category). Returns [{ name, alt }, ...], at least one; three or more means a bundle to cycle. */
export function eventPhotos(o) {
  const title = String(o?.title ?? '');
  for (const [re, list] of BY_TITLE) if (re.test(title)) return list.map((x) => ({ ...x }));
  return (Object.hasOwn(BY_CATEGORY, o?.category) ? BY_CATEGORY[o.category] : FALLBACK).map((x) => ({ ...x }));
}

/** The first photo for an event. Returns { name, alt }. */
export function eventPhoto(o) {
  return eventPhotos(o)[0];
}
