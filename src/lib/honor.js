// Wall of Honor: pick the entries that may be shown. Plain JS so `node --test` can import it.
// Staff edit src/content/honor.json by hand for now (there is no admin editing).
// Entry shape: { id, name, branch, era, served, photo, note, consent: true }
//   branch is one of BRANCHES; era is free text such as "Vietnam War"; photo is a bare file name in
//   public/media/photos (optional). An entry shows only when consent === true (the boolean, nothing else).
import { photoName } from './state.js';

export const BRANCHES = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force', 'Merchant Marine'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Returns the consented, well-formed entries sorted by name. Unknown branches are dropped; a bad photo is dropped. */
export function honorList(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object' || e.consent !== true) continue;
    const name = str(e.name, 120);
    if (!name || !BRANCHES.includes(e.branch)) continue;
    const photo = photoName(e.photo);
    out.push({
      id: str(e.id, 80) || name,
      name,
      branch: e.branch,
      era: str(e.era, 80),
      served: str(e.served, 80),
      photo: photo || '',
      note: str(e.note, 400),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
