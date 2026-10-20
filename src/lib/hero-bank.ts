import { photo, href } from './site';
import { HERO_BANK } from './hero-photos';

/** The hero bank in the shape the carousel and the viewer use. */
export const bank = () => HERO_BANK.map((p) => ({
  thumb: photo(p.name).src,
  small: photo(p.name).srcset.split(' ')[0],
  full: href(`/media/photos/${p.name}-full.webp`),
  alt: p.alt, cap: p.cap,
}));
