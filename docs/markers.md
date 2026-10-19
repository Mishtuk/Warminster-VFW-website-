# markers.md (owner: the server)

## Markers (server fills them in every HTML page except /admin)
Write `<!--vfw:NAME-->` alone, or wrap baked seed content: `<!--vfw:NAME-->seed html<!--/vfw:NAME-->` (server replaces the whole region; static GitHub Pages build shows the seed).
| NAME | Where | Output |
|---|---|---|
| events-upcoming | home | next 5 enabled events in 120 days (recurring expanded) |
| calendar | events page | 12 month grids, event days marked + month lists; `?year=N` nav on live server |
| specials | bar page, home teaser | specials enabled and in date range today |
| menu | bar page | sections, available items, kitchen hours |
| news | news page | all enabled post news, newest first |
| news-latest | home | 3 newest, first paragraph only |
| data | anywhere (once) | `<script type="application/json" id="vfw-data">` {today, events, specials, menu, news} enabled only |

## Shared render module (src/lib/state.js, plain JS, works in Astro and server)
`upcomingHtml(events, today, {limit,days,empty})`, `calendarHtml(events, year, today, {nav})`, `specialsHtml(specials, today, {empty})`, `menuHtml(menu, {empty})`, `newsHtml(news, {limit,teaser,empty})`, `dataScript(state, today)`, `etDay()`, `injectMarkers(html, state, today, year)`.
Astro seed: import src/content/*.json, call these with `etDay()` and put the result inside the marker pair with `set:html`. Pass `empty` text (e.g. "Call the post 215-773-0693" built from post.js).

## Seed files (optional, first server run only, only if the db has no such key)
src/content/events.json, specials.json, news.json = arrays; menu.json = {hours, sections:[{name, items:[{name, price, description, available}]}]}. Shapes below; invalid entries are skipped. Nothing is seeded if the files do not exist.
- event: {title, date YYYY-MM-DD, start "HH:MM", end, description, recurring none|weekly|monthly|monthly_weekday, category Bar|Post|Auxiliary|Community|Holiday, enabled}
- special: {label, price, description, period daily|weekly|monthly|seasonal, weekday 0-6 (Sunday=0, only weekly), start, end, enabled}
- news: {title, date, body (plain text, blank line = paragraph), enabled}

## Class names (unstyled semantic HTML; styled in global.css)
Events: ul.vfw-events > li.vfw-event.vfw-cat-{bar|post|auxiliary|community|holiday} > time.vfw-event-date, span.vfw-event-time, strong.vfw-event-title, span.vfw-event-cat, p.vfw-event-desc
Calendar: div.vfw-calendar[data-year] > nav.vfw-cal-nav (live only), section.vfw-month#month-1..12 > h3.vfw-month-title, table.vfw-grid (caption.vfw-sr, th, td.vfw-day[.vfw-day-empty|.vfw-has-events|.vfw-today] > span.vfw-daynum + ul.vfw-day-events > li.vfw-cat-*), ul.vfw-month-list.vfw-events or p.vfw-month-none. Needs a `.vfw-sr` visually-hidden rule.
Specials: ul.vfw-specials > li.vfw-special > strong.vfw-special-label, span.vfw-special-price, span.vfw-special-period, p.vfw-special-desc
Menu: div.vfw-menu > p.vfw-menu-hours, section.vfw-menu-section > h3.vfw-menu-heading, ul.vfw-menu-items > li.vfw-menu-item > span.vfw-menu-name, span.vfw-menu-price, p.vfw-menu-desc
News: article.vfw-news-item > h3.vfw-news-title, time.vfw-news-date, div.vfw-news-body > p
Empty states: p.vfw-empty

## Hall form (the site builds markup)
`<form method="post" action="/api/hall-inquiry">` fields: name (req), phone, email (phone or email required), eventDate (date), eventType, guests (number), message, honeypot `website` (hidden from people: off-screen, tabindex=-1, autocomplete=off, aria-hidden), optional hidden `_page` = page path to return to (default `/hall-rental`; set it to `/hall` if that is the route). No JS: server answers 303 to `PAGE?sent=1` or `PAGE?error=CODE#inquiry`; page should show a message for those query values (CODE: name, phone, email, contact, eventDate, guests, rate). With JS: fetch with Content-Type application/json, reply `{ok:true}` or `{error:CODE}` (400/429). The static GitHub Pages build cannot post (no server): show "Call the post" there.

## API
Public: POST /api/hall-inquiry. Auth: POST /api/login {username,password}, POST /api/logout (Origin header must match the site).
Admin (cookie vfw_admin, HttpOnly, SameSite=Strict, Secure in production; non-GET needs matching Origin): GET state; PUT /events|specials|news/<id|new>; DELETE same; PUT menu; GET inquiries; PUT inquiries/<id> {handled}; DELETE inquiries/<id>; GET stats?range=7d|30d|90d|365d; POST password {current,password}.
Page: /admin (src/pages/admin.astro, standalone, noindex meta and X-Robots-Tag). robots.txt (the site) must Disallow /admin.

## Env (.env.example)
PORT, PUBLIC_URL, SESSION_SECRET (required when NODE_ENV=production), POST_EMAIL (inquiry recipient), SMTP_URL + MAIL_FROM, DATA_DIR (default .data; production /home/data), ALLOW_DEFAULT_ADMIN=1 (admin/admin on first run), ADMIN_PASSWORD (else random, printed once), DIST_DIR (tests).

## Needs from the site (owner of package.json / astro.config.mjs)
None. Scaffolding there is the Riverside copy (astro + nodemailer); `npm run build` works with only admin.astro present. shell.astro was not created: the server makes no HTML pages of its own.
