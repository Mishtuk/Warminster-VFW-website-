// Nav and base-aware links. Post facts live in post.js (re-exported as POST).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware internal URL: href('/bar') -> '/Warminster-VFW-website-/bar' on Pages, '/bar' on the server. */
export const href = (path = '/') => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** Hall photo from public/media/photos: 1024px file + -800 small file (both 4:3). name: "hall-07". */
export const photo = (name: string) => {
  const n = name.split('/').pop()!.replace(/\.(webp|jpg)$/, '');
  return {
    src: href(`/media/photos/${n}.webp`),
    srcset: `${href(`/media/photos/${n}-800.webp`)} 800w, ${href(`/media/photos/${n}.webp`)} 1024w`,
    width: 1024, height: 768,
  };
};

export { POST } from './post.js';

export const NAV = [
  { label: 'Home', path: '/', match: ['/'] },
  { label: 'The Bar', path: '/bar', match: ['/bar'] },
  { label: 'Events', path: '/events', match: ['/events'] },
  { label: 'Hall Rental', path: '/hall', match: ['/hall'] },
  { label: 'Programs & Resources', path: '/programs', match: ['/programs', '/resources'] },
  { label: 'News', path: '/news', match: ['/news'] },
  { label: 'About', path: '/about', match: ['/about', '/history', '/contact'] },
] as const;

export const EXTRA = [
  { label: 'History', path: '/history' },
  { label: 'Contact', path: '/contact' },
] as const;
