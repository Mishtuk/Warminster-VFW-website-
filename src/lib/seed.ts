// Baked seed content for the static build, rendered by the same functions the server uses (state.js).
import events from '../content/events.json';
import specials from '../content/specials.json';
import menu from '../content/menu.json';
import news from '../content/news.json';
import { etDay, tvHtml, featuredHtml, regularHtml, upcomingHtml, calendarHtml, specialsHtml, menuHtml, newsHtml, dataScript } from './state.js';
import { POST } from './post.js';
import { href } from './site';

export const today = etDay();
export const year = +today.slice(0, 4);
const empty = POST.callText;
const wrap = (name: string, html: string) => `<!--vfw:${name}-->${html}<!--/vfw:${name}-->`;

export const seed = {
  upcoming: wrap('events-upcoming', upcomingHtml(events, today, { empty })),
  featured: wrap('events-featured', featuredHtml(events, today, { empty, photoBase: href('/media/photos/'), eventsHref: href('/events') })),
  regular: wrap('events-regular', regularHtml(events, { guide: href('/events/first-visit'), photoBase: href('/media/photos/') })),
  calendar: wrap('calendar', calendarHtml(events, year, today, { photoBase: href('/media/photos/') })),
  specials: wrap('specials', specialsHtml(specials, today, { empty })),
  menu: wrap('menu', menuHtml(menu, { empty })),
  news: wrap('news', newsHtml(news, { empty: 'No post news yet. Check back soon.' })),
  newsLatest: wrap('news-latest', newsHtml(news, { limit: 3, teaser: true, empty: 'No post news yet.' })),
  tv: wrap('tv-slides', tvHtml({ events, specials, menu, news }, today, { shifts: [] })),
  data: wrap('data', dataScript({ events, specials, menu, news }, today)),
};
