// Every fact about the post lives here (sources: docs/research.md). Pages import from this file, never hard-code.
// Unknown = null: pages then say "Call the post". Staff can change any of these in Admin > Post details: the saved values come
// in through content('post') at build time, and the server calls setPost() after a save so live markers agree straight away.
import { content } from './content.js';

const DEFAULTS = {
  name: 'VFW Post 6493 & Auxiliary',
  short: 'VFW Post 6493',
  city: 'Warminster',
  region: 'PA',
  street: '645 Louis Dr',
  zip: '18974',
  phone: '215-773-0693',
  motto: 'No One Does More for Veterans',
  facebook: 'https://www.facebook.com/groups/845409237204566/',
  membership: 'Membership is open to veterans and non-veterans. Ask for details.',
  // Bar (canteen) hours from the post's flyer, 2026
  hours: [['Monday to Thursday', '5 PM to 10 PM'], ['Friday', '4 PM to 12 AM'], ['Saturday', '6 PM to 12 AM'], ['Sunday', '1 PM to 7 PM']],
  email: 'vfwpost6493@gmail.com',
  hallEmail: 'VFW6493HallRental@gmail.com',
  barRule: 'The bar is for members and guests. Membership cards are checked at the door.',
  joinPrice: 'Home Association social membership at the post is $35 a year, due December 31.',
  officeHours: 'Thursday and Friday, 8 AM to 12 PM',
  // Kitchen hours from the Aug 2026 flyer: call to confirm
  kitchen: [['Monday', '6:30 PM to 8 PM'], ['Tuesday to Thursday', '5 PM to 8 PM'], ['Friday', '5:30 PM to 8:30 PM']],
  meetings: 'The 2nd Monday of each month: Home Association 6 PM, Auxiliary 6:45 PM, VFW 7 PM.',
  publicNights: ['Thursday bingo', 'Monday line dancing', 'Friday band dances', 'Cornhole'],
  commander: 'Bill Zuk',
  auxPresident: 'Nichole Zuk',
  pastCommanders: [['Harry DeLorenzo', 'Commander for three years to July 2024, and again from October 2024'], ['John Otte', 'July to October 2024']],
  pastAuxPresident: 'Evelyn “Evy” Dobson Brennan',
  // Hall rental (hallrentalreviews.com/venue/vfw-post-6493)
  hallBlurb: 'Our Hall is always available for rent. You can supply your own food and entertainment. We have free wifi; tables and chairs are furnished and we have complete bar facilities.',
  hallSource: 'https://hallrentalreviews.com/venue/vfw-post-6493',
  hallFacts: [
    ['Free wifi', 'Included with every rental.'],
    ['Tables and chairs', 'Furnished by the post.'],
    ['Complete bar facilities', 'Full-service alcohol.'],
    ['Your food and entertainment', 'Renter supplied; staff not included.'],
    ['Setup and cleaning', 'Venue assisted.'],
  ],
  // Business listing name
  officialName: 'Veterans of Foreign Wars Warminster Memorial Post 6493',
  // Getting here: parking is sourced (Mar 2022 grant for parking-lot resurfacing). null = unknown, shown as "Call the post to ask".
  parking: 'The post has its own parking lot.',
  entrance: null,
  stepFree: null,
};

export const POST = {};
/** The defaults with the staff's saved changes on top. Unknown keys are ignored; call again with new values at any time. */
export function setPost(saved = {}) {
  for (const k of Object.keys(POST)) delete POST[k];
  Object.assign(POST, structuredClone(DEFAULTS));
  for (const k of Object.keys(DEFAULTS)) if (saved && saved[k] !== undefined) POST[k] = structuredClone(saved[k]);
  POST.address = `${POST.street}, ${POST.city}, ${POST.region} ${POST.zip}`;
  POST.tel = `tel:+1${POST.phone.replace(/\D/g, '')}`;
  POST.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(POST.address)}`;
  POST.callText = `Call the post ${POST.phone}`;
  POST.hoursText = POST.hours.map(([d, h]) => `${d} ${h}`).join('. ');
  POST.hallMail = `mailto:${POST.hallEmail}`;
  POST.mail = `mailto:${POST.email}`;
  // ask = what to say when the answer is unknown, shown with the tel link.
  POST.gettingHere = [
    { label: 'Parking', text: POST.parking, ask: 'Call the post to ask about space and overflow parking.' },
    { label: 'Entrance', text: POST.entrance, ask: 'Call the post to ask which door to use.' },
    { label: 'Step-free access', text: POST.stepFree, ask: 'Call the post to ask about step-free access.' },
    { label: 'At the door', text: POST.barRule, ask: 'Call the post to ask about guests.' },
  ];
  return POST;
}
setPost(content('post'));
export const POST_DEFAULTS = DEFAULTS;

// Admin > Post details, one card per group. type: text, long (a paragraph), phone, email, url, zip, state, or rows (a list; cols
// are the column labels). may: true when the field can be left empty, and the site then says "Call the post".
const DAY = '(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)', TIME = '\\d{1,2}(:[0-5]\\d)? (AM|PM)';
const SPAN = [`${DAY}( to ${DAY})?`, `${TIME} to ${TIME}`];
export const POST_FIELDS = [
  ['Contact', [
    ['phone', 'Phone number', 'phone', { hint: 'Like 215-773-0693. Used on every page and for every Call button.' }],
    ['email', 'Post email', 'email'],
    ['hallEmail', 'Hall rental email', 'email', { hint: 'Hall inquiries from the website go here.' }],
    ['street', 'Street address', 'text', { max: 80 }], ['city', 'Town', 'text', { max: 40 }], ['region', 'State', 'state'], ['zip', 'ZIP code', 'zip'],
    ['facebook', 'Facebook page or group', 'url'],
  ]],
  ['Hours', [
    ['hours', 'Bar hours', 'rows', { cols: ['Days', 'Hours'], pattern: SPAN, hint: 'Days like Friday or Monday to Thursday, hours like 5 PM to 10 PM. A day that is not listed shows as closed.' }],
    ['kitchen', 'Kitchen hours', 'rows', { cols: ['Days', 'Hours'], pattern: SPAN, hint: 'Written the same way as the bar hours.' }],
    ['officeHours', 'Office hours', 'text', { max: 120, may: true }],
  ]],
  ['Meetings and officers', [
    ['meetings', 'Meetings', 'long', { max: 300, may: true }],
    ['commander', 'Post Commander', 'text', { max: 80, may: true }],
    ['auxPresident', 'Auxiliary President', 'text', { max: 80, may: true }],
    ['pastCommanders', 'Past Commanders', 'rows', { cols: ['Name', 'When'], max: 200 }],
    ['pastAuxPresident', 'Past Auxiliary President', 'text', { max: 80, may: true }],
  ]],
  ['Membership and the bar', [
    ['membership', 'Who can join', 'long', { max: 300 }],
    ['joinPrice', 'Membership price', 'text', { max: 200, may: true, hint: 'Like: Home Association social membership at the post is $35 a year, due December 31.' }],
    ['barRule', 'Bar rule', 'long', { max: 300 }],
    ['publicNights', 'Nights open to the public', 'rows', { cols: ['Night'], max: 60 }],
  ]],
  ['Getting here', [
    ['parking', 'Parking', 'long', { max: 300, may: true }],
    ['entrance', 'Which door to use', 'long', { max: 300, may: true }],
    ['stepFree', 'Step-free access', 'long', { max: 300, may: true }],
  ]],
  ['Hall rental', [
    ['hallBlurb', 'About the hall', 'long', { max: 600 }],
    ['hallFacts', 'Hall facts', 'rows', { cols: ['Fact', 'Details'], max: 200 }],
  ]],
  ['Names', [
    ['name', 'Full name', 'text', { max: 80, hint: 'The name at the top of every page.' }],
    ['short', 'Short name', 'text', { max: 40 }],
    ['officialName', 'Official name', 'text', { max: 120, hint: 'As it appears on the business listing.' }],
    ['motto', 'Motto', 'text', { max: 80 }],
  ]],
];

const RE = { phone: /^\d{3}-\d{3}-\d{4}$/, email: /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i, url: /^https:\/\/[^\s<>"]+$/, zip: /^\d{5}$/, state: /^[A-Z]{2}$/ };
const BAD = { phone: 'Phone: 10 digits, like 215-773-0693.', email: 'Check the email address.', url: 'A web address starting with https://', zip: 'ZIP code: 5 digits.', state: 'State: two letters, like PA.' };
/** Plain words only: spaces tidied, straight quotes made curly (so a value is safe inside an HTML attribute), and no < or >. */
const tidy = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/(^|[\s(])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');

/** Admin > Post details save: { value } with every field, or { error: key, why }. */
export function validatePost(input = {}) {
  const out = {};
  for (const [, fields] of POST_FIELDS) for (const [key, label, type, o = {}] of fields) {
    const raw = input?.[key];
    if (type === 'rows') {
      if (!Array.isArray(raw) || raw.length > 14) return { error: key, why: `${label}: up to 14 lines.` };
      const rows = [];
      for (const r of raw) {
        const cells = (Array.isArray(r) ? r : [r]).slice(0, o.cols.length).map(tidy);
        while (cells.length < o.cols.length) cells.push('');
        if (cells.every((c) => !c)) continue;
        if (cells.some((c) => !c || c.length > (o.max ?? 120) || /[<>]/.test(c))) return { error: key, why: `${label}: fill in every box, in plain words.` };
        if (o.pattern && cells.some((c, i) => !new RegExp(`^${o.pattern[i]}$`).test(c))) return { error: key, why: `${label}: write it like Monday to Thursday, and 5 PM to 10 PM.` };
        rows.push(o.cols.length === 1 ? cells[0] : cells);
      }
      if (key === 'hours' && !rows.length) return { error: key, why: 'Bar hours: add at least one line.' };
      out[key] = rows;
      continue;
    }
    let v = tidy(raw);
    if (type === 'phone') { const d = v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); if (d.length === 10) v = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; }
    if (type === 'state') v = v.toUpperCase();
    if (!v) { if (o.may) { out[key] = null; continue; } return { error: key, why: `${label} is needed.` }; }
    if (RE[type] && !RE[type].test(v)) return { error: key, why: BAD[type] };
    if (v.length > (o.max ?? 120) || /[<>]/.test(v)) return { error: key, why: `${label}: up to ${o.max ?? 120} characters, in plain words.` };
    out[key] = v;
  }
  return { value: out };
}
