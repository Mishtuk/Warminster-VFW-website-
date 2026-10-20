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
  { label: 'Programs & Resources', path: '/programs', match: ['/programs', '/resources', '/youth', '/support', '/volunteer', '/help'] },
  { label: 'News', path: '/news', match: ['/news'] },
  { label: 'Post shop', path: '/shop', match: ['/shop'] },
  { label: 'About', path: '/about', match: ['/about', '/join', '/history', '/contact'] },
] as const;

/** Subnav shared by About, Join the post, History and Contact. */
export const ABOUT_TABS = [{ label: 'About', path: '/about' }, { label: 'Join the post', path: '/join' }, { label: 'History', path: '/history' }, { label: 'Wall of Honor', path: '/honor' }, { label: 'Contact', path: '/contact' }];

export const EXTRA = [
  { label: 'Join the post', path: '/join' },
  { label: 'History', path: '/history' },
  { label: 'Wall of Honor', path: '/honor' },
  { label: 'Contact', path: '/contact' },
  { label: 'Your first visit', path: '/events/first-visit' },
  { label: 'Volunteer', path: '/volunteer' },
  { label: 'Support the Post', path: '/support' },
  { label: 'Ask for help', path: '/help' },
] as const;

/** Subnav shared by Programs, Youth contests, Volunteer, Support, Resources and Ask for help. */
export const PROGRAM_TABS = [
  { label: 'Programs', path: '/programs' }, { label: 'Youth contests', path: '/youth' }, { label: 'Volunteer', path: '/volunteer' },
  { label: 'Support the Post', path: '/support' }, { label: 'Resources', path: '/resources' }, { label: 'Ask for help', path: '/help' },
];
export const EVENT_TABS = [{ label: 'Calendar', path: '/events' }, { label: 'Your first visit', path: '/events/first-visit' }];
