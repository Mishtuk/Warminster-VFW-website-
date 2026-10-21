// Wall of Honor: pick the entries that may be shown. Plain JS so `node --test` can import it.
// Staff add entries in the admin (Wall of Honor); src/content/honor.json is only the first-run seed.
// Entry shape: { id, name, branch, era, served, photo, note, consent: true }
//   branch is one of BRANCHES; era is free text such as "Vietnam War"; photo is a bare file name in
//   public/media/photos (optional). An entry shows only when consent === true (the boolean, nothing else).
import { esc, photoName } from './state.js';
import { POST } from './post.js';

export const BRANCHES = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force', 'Merchant Marine'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Returns the consented, well-formed entries sorted by name (or in the given order). Unknown branches are dropped; a bad photo is dropped. */
export function honorList(entries, keepOrder = false) {
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
  return keepOrder ? out : out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The wall (marker: honor): consented cards in the staff's order, or the Coming soon panel. Nothing else about the stored entries is read. */
export function honorHtml(entries, { photos, photoBase = '/media/photos/' } = {}) {
  const list = honorList(Array.isArray(entries) ? entries.filter((e) => e?.enabled !== false) : [], true);
  if (!list.length) return `<div class="panel info-body honor-soon"><h3>Coming soon</h3><p>The post is gathering names with families' permission. We will not show anyone until we have it.</p><p>To add a veteran, call the post.</p><p><a class="btn" href="${POST.tel}">Call the post ${POST.phone}</a></p></div>`;
  const img = (v) => {
    if (!v.photo || (photos && !photos.has(v.photo))) return '';
    const dot = v.photo.lastIndexOf('.'), small = `${v.photo.slice(0, dot)}-800${v.photo.slice(dot)}`, sm = !photos || photos.has(small);
    return `<img src="${esc(photoBase + (sm ? small : v.photo))}" alt="Photo of ${esc(v.name)}" width="${sm ? 800 : 1024}" height="${sm ? 600 : 768}" loading="lazy" decoding="async">`;
  };
  return `<ul class="honor-grid">${list.map((v) => `<li class="honor-card">${img(v)}<h3>${esc(v.name)}</h3><p class="honor-branch"><span class="star" aria-hidden="true"></span><span class="honor-pill">${esc(v.branch)}</span></p>`
    + `${v.era ? `<p class="honor-era">${esc(v.era)}</p>` : ''}${v.served ? `<p class="honor-served">${esc(v.served)}</p>` : ''}${v.note ? `<p class="honor-note">${esc(v.note)}</p>` : ''}</li>`).join('')}</ul>`
    + `<p class="honor-add">To add a veteran, call the post. <a class="btn" href="${POST.tel}">Call the post ${POST.phone}</a></p>`;
}
