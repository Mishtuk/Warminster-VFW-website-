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

## For the site
Privacy line to show under the hall inquiry form (exact sentence, in hall.astro):

> We use what you send only to answer your hall rental question. Inquiries are kept for up to 12 months and then deleted; call the post any time to have yours removed.

The server deletes inquiries older than INQUIRY_RETENTION_DAYS (default 365, so "12 months" matches the default; if the env var is changed, change this sentence too).

## Round 3 markers (volunteers, help, donate, bar TV)
`injectMarkers(html, state, today, year, { photos, photoBase, shifts, settings })`. The server passes `shifts` as the public shape only (`{id, title, date, start, end, notes, slots, left}`, enabled and dated today or later) and `settings` as only `{helpEnabled, responderName, responderRole, donateUrl, donateLabel}`. Sign-ups, help requests and `responderEmail` never reach a renderer. The `data` script never carries shifts or settings. Injected markup has no `<script>`.
| NAME | Where | Output | Static seed |
|---|---|---|---|
| tv-slides | /tv | `tvHtml`: `div.tv-slide[data-secs]` (12, kitchen 20) > `p.tv-label`, `h2.tv-title`, `ul.tv-rows > li.tv-row > span.tv-when, strong.tv-name, span.tv-price, p.tv-note`. Kitchen adds `p.tv-hours` and `ul.tv-rows.tv-cols`. Coming up adds `div.tv-next > time.vfw-datebox.tv-big`. Help wanted adds a closing `p.tv-note`. Lists over 5 rows split as "(1 of 2)". With nothing to show, one welcome slide. | src/content |
| volunteer-board | /volunteer | `form#vol-form.vfw-vol` (fields shift radios, name, phone, email, honeypot website, `_page=/volunteer`), or `p.vfw-empty` when no open shifts | empty text |
| help-form | /help | enabled: `div.info-two.vfw-help[data-responder]` with `form#help-form` and the "What happens next" panel; off: `div.panel.vfw-help-off` | off panel |
| donate-link | /support | `p.btn-row > a.btn` plus `p.hint`, or nothing while no https link is set | nothing |

Form post fields, errors and redirects: `POST /api/volunteer` takes `shift, name, phone, email, website, _page`, answers `{ok:true, shift:{title,date}}` or `{error}` (shift, closed, full, name, phone, email, contact, rate; 400 or 429). `POST /api/help-request` takes `name, phone, email, kind, bestTime, message, website, _page`, answers `{ok:true, responder}` or `{error}` (off 403, name, phone, email, contact, kind, bestTime, rate). Plain posts get a 303 to `/volunteer/?sent=1#signup` or `?error=CODE#signup`, and `/help/?sent=1#request` or `?error=CODE#request`.

Admin API (signed in, Origin checked on writes): `GET shifts`, `PUT shifts/<id|new>`, `DELETE shifts/<id>`, `DELETE signups/<n>`, `GET help`, `PUT help/<n> {handled}`, `DELETE help/<n>`, `GET|PUT settings`; `GET state` also returns `newHelp`.
Retention: shifts and their sign-ups are deleted when the shift date is more than 7 days past; help requests after 90 days. The server marks `/tv` noindex and no-store and does not count it in stats.

## Post shop (marker: shop)
| NAME | Where | Output | Static seed |
|---|---|---|---|
| shop | /shop | `shopHtml(state.products, { photos, photoBase })`: `ul.vfw-shop > li.vfw-prod.panel` cards (`figure.vfw-prod-photo` or `div.vfw-prod-ph`, `h3.vfw-prod-name`, price, options, description, then `a.btn` Buy online to the https checkout link, or `a.btn-outline[data-item]` Order and pay at pickup), two `p.hint` lines, and `div.vfw-order#order` with `form#order-form.vfw-orderform` (fields item, qty, name, phone, email, note, honeypot website, `_page=/shop`) only when an enabled product has no checkout link. No enabled products: `div.panel.vfw-shop-soon` | Coming soon panel |

Only enabled products are rendered. Orders (names, phones, emails, notes) never reach a renderer, the `data` script or the log; they live in the `shop_orders` table and the admin Orders view.
`POST /api/shop-order` takes `item` (`productId/N`, N the choice number from 1, or 0 when the product has no choices), `qty` (1 to 20), `name`, `phone`, `email`, `note`, `website`, `_page`. It answers `{ok:true, item:{name, option, qty}}` or `{error}` (item, qty, name, phone, email, contact 400; rate 429; origin 403). Plain posts get a 303 to `/shop/?sent=1#order` or `?error=CODE#order`. Five orders an hour per address, 60 an hour in all; each order is emailed to POST_EMAIL.
Admin API: `PUT products/<id|new>` and `DELETE products/<id>` (array order is the display order; edits keep their place, new products go last), `PUT products-order {ids}`, `GET orders`, `PUT orders/<n> {handled}`, `DELETE orders/<n>`; `GET state` also returns `products` and `newOrders`.
Retention: orders are deleted after SHOP_RETENTION_DAYS (default 365), logged as `orders_purged`.

## Beer taps (marker: taps)
`tapsHtml(state.taps)`: `ul.tap-row > li.tap` (style `--tap-bg`/`--tap-fg`, only `#rrggbb`) with `button.tap-handle` and `span.tap-nozzle`, inside `div.taps[data-pour]` on the home page. Hidden taps are skipped; none shown renders an empty string. Seed: `src/content/taps.json`; admin: Beers on tap.
