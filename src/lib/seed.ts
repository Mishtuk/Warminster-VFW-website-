// Baked seed content for the static build, rendered by the same functions the server uses (state.js).
import events from '../content/events.json';
import specials from '../content/specials.json';
import menu from '../content/menu.json';
import news from '../content/news.json';
import { etDay, featuredHtml, regularHtml, upcomingHtml, calendarHtml, specialsHtml, menuHtml, newsHtml, dataScript } from './state.js';
import { POST } from './post.js';

export const today = etDay();
export const year = +today.slice(0, 4);
const empty = POST.callText;
const wrap = (name: string, html: string) => `<!--vfw:${name}-->${html}<!--/vfw:${name}-->`;

export const seed = {
  upcoming: wrap('events-upcoming', upcomingHtml(events, today, { empty })),
  featured: wrap('events-featured', featuredHtml(events, today, { empty })),
  regular: wrap('events-regular', regularHtml(events)),
  calendar: wrap('calendar', calendarHtml(events, year, today)),
  specials: wrap('specials', specialsHtml(specials, today, { empty })),
  menu: wrap('menu', menuHtml(menu, { empty })),
  news: wrap('news', newsHtml(news, { empty: 'No post news yet. Check back soon.' })),
  newsLatest: wrap('news-latest', newsHtml(news, { limit: 3, teaser: true, empty: 'No post news yet.' })),
  data: wrap('data', dataScript({ events, specials, menu, news }, today)),
};
