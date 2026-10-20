# Warminster VFW Post 6493 website: handoff

A new website for **VFW Post 6493 & Auxiliary** in Warminster, PA. The post has no website today; its online presence is a Facebook group and a hall-rental listing.

- **Repo:** https://github.com/Mishtuk/Warminster-VFW-website-. The local copy is `V:\WarminsterVFW`.
- **Preview (live):** https://mishtuk.github.io/Warminster-VFW-website-/. Redeploys on every push to `main`.
- **Commits:** authored as `Mish <113945444+Mishtuk@users.noreply.github.com>` (set in the repo's git config). No AI attribution in commits.
- **Research and sources:** `docs/research.md`. It covers the reference site, other VFW sites, emblem rules, post history, programs, resources, veteran discounts and news feeds.
- **Raw source media:** `source/` (local only, git-ignored).
  - `source/hall/` holds the hall-rental listing photos.
  - `source/fb/` holds the Facebook group photos, videos and flyers.

## Working together (two workstations: Desktop and Laptop)
Two machines work on this repo at the same time. Live coordination happens on the pinned issue "Coordination board: Desktop and Laptop" (https://github.com/Mishtuk/Warminster-VFW-website-/issues/5). To avoid stepping on each other:
- **Before starting a task:** `git pull --rebase`, then add a line under "Now working on" below with your machine, the task and the files or areas you will touch, and push that line on its own first. Don't start on files the other machine has claimed; ask it there or on the coordination issue instead.
- **Small, focused commits.** Always `git pull --rebase` right before `git push`. Never force-push `main`, and never rewrite pushed history.
- **Shared files** (`src/styles/global.css`, `src/lib/state.js`, `server.js`, `src/pages/admin.astro`, `HANDOFF.md`): append rather than reorder, keep edits local to your feature, and pull right before editing them.
- **When done:** remove your "Now working on" line, update the relevant HANDOFF.md section, and make sure `npm test` passes before pushing.
- **Commits** are authored as Mish (see the top of this file).
- **Usage limits: hand off before you run out.** When a machine is near its usage limit, it stops its helpers, commits finished work, and stashes half-done work (never pushing broken code). It files what's left as task issues labeled for the other machine, with full briefs. Then it posts a "Handoff" comment on the coordination board (what's done, what's open and which issues), removes its claims below, and stops. The other machine takes those issues next. When the first machine is back, it reads the board and picks up whatever is labeled for it.
- **Task issues:** work is handed out as GitHub issues labeled `laptop` or `desktop`, each a full brief with a "Done when" checklist. Check `gh issue list -l <your machine> --state open` at the start of a session and about every 15 minutes while idle. Take the lowest number, comment "Started", claim it below, and close it with the commit hash when done.

### Now working on
- **Laptop:** social share cards: Open Graph and Twitter tags per page (the head of src/layouts/Base.astro, PageHead props, a default share image in public/media/).
- **Laptop:** #10 What's going on photos (src/lib/event-photos.js, featuredHtml in src/lib/state.js, the whats-on style block in src/pages/index.astro, maybe a small src/scripts/ script for the cycling bundles).

## Status (handoff, 2026-10-20)
**The site is feature-complete on the preview. The next steps are the owner's choices.**

### What's live
- **Pages:** 11 pages in the cozy "Canteen" look, plus a light/dark theme.
  - The theme switch is a small moon/sun button at the bottom right (`ThemeFab.astro`). It follows the system setting and is remembered per visitor.
- **Home:**
  - The hero has a background video and a polaroid stack showing a random 9 from a 150-photo bank (`HeroCarousel.astro`, `src/lib/hero-photos.ts`). The page carries 9 spread-out bank photos; the full bank is `/media/hero-bank.json` (`src/pages/media/hero-bank.json.ts`, built by `src/lib/hero-bank.ts`), fetched after load to reshuffle slides 2 to 9. `BeerTaps.astro` loads `pour-loader.ts`, which imports `pour.ts` on the first touch of a tap. On phones the stack is a strip below the hero.
  - Then "What's going on at the post": the next special event within 30 days, else the next event, plus 4 compact cards (`featuredHtml` in `state.js`, marker `events-featured`). Each event gets a real post photo by title, else by category (`src/lib/event-photos.js`); add a title rule there when a new kind of event gets its own photo. Details and card titles link to `/events#ev-...` (`anchorOf` in `state.js`): one-off events anchor in the calendar month list, repeating nights on their weekly card.
  - Then New here?, food snapshots with the specials menu card, the hall band (2 photos that open a 14-photo gallery, `src/lib/hall-photos.ts`), the namesakes plaque and post news.
- **Info pages:**
  - Join the post `/join` (under the About tabs, `ABOUT_TABS` in `site.ts`): who can join, three paths (VFW, Auxiliary, Home Association) with official links or Call the post, how to join, renewing and meetings. Facts are from vfw.org and vfwauxiliary.org (sources in a code comment). The Home Association price shows Call the post until `homePrice` in `join.astro` is set to `POST.joinPrice` (the $35 in post.js has no source in research.md).
  - Wall of Honor `/honor` (About tabs and footer): shows Coming soon until `src/content/honor.json` has entries. Staff edit that file by hand for now (no admin view). Entry shape: `{ id, name, branch, era, served, photo, note, consent: true }`. Only `consent: true` with a known branch renders (`src/lib/honor.js`, tested). Never add a name without the family's permission.
  - All of them use one layout (`src/components/info/`: InfoSection, OnThisPage, KeyFacts), with multi-column layouts on desktop.
  - Resources are grouped by need, with the crisis line first.
  - Programs shows the 3 pillars side by side.
  - Events: the weekly nights appear as a row of cards, the year calendar lists dated events per month, and there is an `.ics` "Add to my calendar" feed. `/events/flyer` is a one-page Letter flyer for the bulletin board (`?month=YYYY-MM`, this or next month): special events, weekly nights, bar hours and contact. It renders from seed data at build and re-renders from `#vfw-data` in the browser (`src/scripts/flyer.ts`), so admin edits show; no marker needed.
  - News: post news has photos (an optional `photo` field, chosen in the admin), and VA/DVIDS stories have self-hosted thumbnails.
- **Photo viewer:** a native `<dialog>` (`Lightbox.astro`) on every photo group, with Previous/Next, swipe, a count and Close/Esc. `-full.webp` copies are used for the large view.
- **Admin (`/admin`, UI in `src/pages/admin.astro`, API in `server.js`):** written for volunteers. It has the site's look with the logo top-left, plain wording (no brackets, codes or file names), and a phone menu.
  - Dashboard: visitors, page views and inquiries with the change against the previous period, a bar chart, friendly page and referrer names, and a security summary.
  - Events, drink specials and news: Coming up / Already happened lists, repeating events shown as "Every Thursday", and errors shown under the field.
  - Food menu: sections and items with Move up/down, Remove with Undo, an unsaved-changes bar, and a leave warning.
  - News pictures: pick an existing photo or upload one. The browser crops it to 4:3 WebP (1024 and 800 wide). The server checks the file bytes, re-encodes it with sharp when sharp is present, names it itself, and stores it in `DATA_DIR/photos` (served at `/media/photos/`). Uploads are capped and rate-limited, and a photo in use can't be deleted.
  - Hall inquiries inbox (deleted after 12 months), and a Security log view grouped by day with a filter and "Show older entries".
  - Local testing: `ALLOW_DEFAULT_ADMIN=1` gives admin / admin on a fresh data folder. Change it before launch.
- **Security:**
  - server-side scrypt login with backoff
  - signed HttpOnly SameSite=Strict sessions
  - a strict CSP with per-page script hashes
  - CSRF origin checks
  - crash-proofing
  - Hardened from an audit, a community checklist and a red-team test, which failed to get into /admin.
  - CI runs tests, npm audit and CodeQL. Secret scanning, push protection and Dependabot are on.
- **Tests:** `npm test` passes 55/55. Home mobile Lighthouse performance is about 92; accessibility is 100.

### Hero video (v2, 2026-10-20)
- The hero is now cut mostly from the group's 1080p videos (flags on the graves, the post bar on Memorial Day, the hall at a watch party) plus the 2 best SD shots. It replaces the soft all-SD first cut.
  - Landscape is 21.4 s and portrait is 16.1 s. Both loop by crossfading back into the first shot.
  - The files keep the same names and targets: `hero.av1.mp4`, `hero.mp4`, `hero-720.mp4`, `hero-portrait.mp4` and the 4 posters. Every file is the same size or smaller than before; the posters are within +10%.
  - Not used: a child close-up, a third-party production, and a shaky bar close-up. The editing scripts are local only.

### Waiting on the owner
- Hosting and domain (see the launch security checklist below).
- SMTP for inquiry email.
- A short HD video of the post if possible: the best fix for the hero.

### Built in round 3 (2026-10-20)
- **Food menu:** the full Loaded Belly menu from the caterer's July 2026 flyer, with the flyer's own descriptions (it replaced a one-day brunch flyer).
- **Bar TV `/tv`:** rotating full-screen slides (tonight, specials, kitchen, coming up, volunteers) read from the admin data and refreshed every 5 minutes.
- **First-timer guide `/events/first-visit`:** bingo, line dancing and watch parties; the matching event cards link to it.
- **Support the Post `/support`:** drives and Auxiliary fundraisers from the Facebook group, VFW national giving links, and a Donate button only when the admin sets an https donation link. No payment data touches the server.
- **Volunteer board `/volunteer`:** the admin posts shifts with slots; people sign up with a name plus phone or email. Sign-ups never appear publicly and are deleted a week after the shift.
- **Veteran help request `/help`:** off until the admin turns it on and names who answers (Site settings). The crisis line comes first; requests are kept 90 days, and the email to the post leaves out the message.
- **Youth contests `/youth`:** Voice of Democracy and Patriot's Pen 2026-27 (theme, deadline countdown, prizes) and VFW scholarships, linked to vfw.org.
- **Admin:** Volunteers, Help requests and Site settings views. Public forms have rate limits, origin checks, a honeypot and size caps.

### Beer taps on the home page (2026-10-20)
- A tap tower sits above the food snapshots (`src/components/BeerTaps.astro`, styles in the `.taps` block of global.css). Each handle has a name badge evoking the brand (colours, type style, shape: oval, circle, shield, banner or crest; an accent ring and a sub-label), on a back-bar backdrop of wood, smoky mirror, bottle shelf and amber glow. No logo artwork is copied.
- Tap logos: an optional `logo` slug per tap (`LOGOS` in `state.js`, files in `public/brand/taps/`: Yuengling, Coors Light, Budweiser, Blue Moon, Guinness, Miller Lite, Modelo; the owner approved real logos). Admin > Beers on tap has a Brand logo select. Bud Light and Michelob Ultra have no file and keep drawn badges. Existing databases keep their old taps: set each logo in the admin after deploying (and Miller Lite's shape to shield).
- Pressing a handle pours beer (`src/scripts/pour.ts`, a canvas overlay drawn as merging liquid through an SVG blur-and-threshold filter, with a tapered stream and foam). Each beer has its own colour from the tap name (light, amber, wheat, stout; a tap can override with a `data-liquid` hex), and the stream is drawn on a second, unfiltered canvas. Boxes are oriented colliders (size, centre and the rotation summed over ancestors), so beer runs down tilted snapshots and off their low end (`SLIDE` scales the downhill pull). Foam, bubbles and after-drips sit on the pooled beer. Boxes are measured once per pour and shifted with the scroll. It only runs on desktop with a mouse (900px or wider) and is off with reduced motion; phones don't get the tower at all.
- The taps are placeholders (9 common drafts). Staff edit them in Admin > Beers on tap: name, badge and text colours, accent, shape, sub-label, Show on website, order. Saved taps from before these fields default to an oval. Marker `taps`.

### Post shop `/shop` (2026-10-20)
- Products are added in Admin > Shop: name, price, description, sizes, picture (same upload as news), Show on website, Move up/down. With no products it shows "Coming soon".
- Each product either has a Buy online link (an https payment link from Square or PayPal; nothing about payments touches our server) or takes an order to pay at pickup. Orders go to Admin > Shop > Orders and to `POST_EMAIL`, are never shown publicly, and are deleted after 12 months.
- Before selling: VFW name and emblem items need written consent from VFW National, or must come from the VFW Store or a licensed vendor. PA sales tax on merch: ask the post's accountant.

### Owner questions from round 3
- Tax status/EIN and a donation link (who receives gifts).
- Who answers help requests, and their email (set it in Site settings before turning the form on). Production also needs `POST_EMAIL`.
- Is the post taking Voice of Democracy / Patriot's Pen entries this year, and who is the contact?
- The guest rule for non-members, parking, age rules, and who coordinates volunteers.

### Ideas still open (the owner decides)
1. Online hall booking calendar. 2. Event RSVPs. 3. Merch store (check VFW licensing). 4. Email or text reminder list. 5. Photo uploads beyond news. 6. Wall of Honor (family consent). 7. Membership renewal links. 8. Live "Bar open now" badge on more pages. 9. Printable monthly flyer. 10. Spanish or large-print toggle.
(3. Merch store: built as `/shop`; it is waiting on products, a payment link and VFW licensing.)

### Rules for editing code
- Keep every asset self-hosted (the CSP blocks other origins).
- Use no inline `on*=` handlers.
- Styles for elements created by script must be global (`is:global`), because scoped styles don't reach them.
- After editing regex code, grep for raw control bytes: an editor slip once turned a backslash escape into a raw control byte.
- Never mention AI tools or internal notes in repo files.

### Media
- `source/` is local only.
  - 45+ photos and 23+ videos from the Facebook group.
  - The 13 hall-rental listing photos.
- There are no drink photos (the post posts drink specials as text).

## Launch security checklist (do these when hosting is chosen)
- **Put proven login in front of `/admin` and `/api/admin/*`.** Use Cloudflare Access (Zero Trust, free for small teams) or Azure App Service Authentication, in addition to the site's own sign-in. The app's login then becomes a second layer, not the only one.
- **Required production settings:**
  - `NODE_ENV=production`
  - `SESSION_SECRET` of 32 or more random characters
  - `ADMIN_PASSWORD` of 12 or more characters
  - no `ALLOW_DEFAULT_ADMIN`
  - `TRUST_PROXY=1` only when the site sits behind a real proxy or CDN
  - `POST_EMAIL` and `SMTP_URL` (an SMTP account limited to sending)
- **HTTPS everywhere:** Cloudflare "Always Use HTTPS" (or the host's HTTPS-only switch). HSTS is sent automatically over HTTPS.
- **Bots and abuse:** Cloudflare Bot Fight Mode and a rate-limit rule on `/api/` (the app also rate-limits by itself).
- **Least privilege:**
  - run node as a non-root user
  - only that user can read `DATA_DIR`
  - keep `DATA_DIR` and `.env` outside the web root (the server refuses to start otherwise)
- **Watch:**
  - the admin dashboard's Security log (sign-ins, lockouts, changes)
  - GitHub's Security tab (secret scanning, Dependabot and CodeQL alerts)
  - the Checks workflow, which runs tests, a dependency audit and CodeQL on every push and weekly
- **Privacy:**
  - hall inquiries are kept for `INQUIRY_RETENTION_DAYS` (365) and can be deleted in the admin
  - don't store anything more sensitive on the server than that
- **Repo:** public on purpose (GitHub Pages). It must never hold secrets; GitHub push protection blocks most of them.


## The post (facts; never invent others)
- **Name:**
  - VFW Post 6493 & Auxiliary, Warminster.
  - Full name per a MapQuest listing: "Douglas A. Post – Harry C. Wilson II Memorial Post". Who they were is not yet sourced.
- **Address:** 645 Louis Dr, Warminster, PA 18974.
- **Phone:** 215-773-0693.
- **Hall inquiry email:** set `POST_EMAIL` on the host (the owner has the address; it is in the local `.env`, never committed).
- **Motto they use:** "No One Does More for Veterans".
- **Membership:** open to veterans and non-veterans. "Ask for details."
- **Meetings:** 2nd Monday, 7 pm (see `docs/research.md` for the source).
- **Facebook group:** https://www.facebook.com/groups/845409237204566/ (public, created September 2023).
- **Hall rental listing:** https://www.hallrentalreviews.com/venue/vfw-post-6493.
  - "Our Hall is always available for rent. You can supply your own food and entertainment. We have free wifi; tables and chairs are furnished and we have complete bar facilities."
  - Food is renter-supplied (no staff included), there is a full-service bar, and setup and cleaning are venue assisted.
- **Bar hours** (from the post's 2026 flyer):
  - Monday to Thursday: 5 PM to 10 PM
  - Friday: 4 PM to 12 AM
  - Saturday: 6 PM to 12 AM
  - Sunday: 1 PM to 7 PM
  - The bar is for members and guests, and membership cards are checked.
- **Emails:**
  - post: vfwpost6493@gmail.com
  - hall rental: VFW6493HallRental@gmail.com
- **Leaders:** Commander Bill Zuk and Auxiliary President Nichole Zuk (from June 2026). Past commanders are listed in `src/lib/post.js`.
- **Namesakes:** Harry C. Wilson II and Douglas A. Post. The VFW post's 60th and the Auxiliary's 50th anniversaries were in September 2025.
- **Kitchen:** run by an outside caterer (The Loaded Belly as of October 2026). See `src/content/menu.json`.
- **All facts live in `src/lib/post.js`** (with the seed content in `src/content/*.json`). The sources are the Facebook group and `docs/research.md`.
- **Unknown, so the site says "Call the post":** charter date, building history, hall prices and capacity.
- **Do not publish** members' personal phone numbers or emails found in press articles.

## What the site must cover
- **Bar:** drink specials (weekly, monthly, etc.) and the food menu.
- **Events:** the event list and a full-year calendar.
- **Hall rental:** the facts, the photos and our own inquiry form. The form is stored in the admin panel and emailed to the post.
- **Programs:**
  - community service
  - veteran outreach
  - youth and education
- **Resources:**
  - veteran benefits and assistance
  - veteran discounts at real businesses near Warminster, each with a cited source
- **News:**
  - post news from the admin panel
  - veteran-world news and new resources from public feeds (VA News, DVIDS and others) read at build time
- **About**, **History** (national VFW and Post 6493) and **Contact**.
- **Admin panel:** reached from the "Admin login" link at the very bottom of the footer, as on the Riverside site. It shows site statistics and lets staff:
  - add, edit and disable events
  - edit drink specials
  - edit the food menu
  - post news
  - read the hall inquiries inbox

## Look and feel
- **Audience:** older visitors and veterans. Large type (body text 19–20px), high contrast, simple navigation with at most 8 tabs (7 plus Post shop, the owner's call), large tap targets, and no hover-only menus.
- **Look ("Canteen"):** a cozy neighbourhood bar and kitchen at a VFW post, not a corporate site. It is deliberately unlike the Riverside and Madison sites.
  - **Light theme:** menu paper with brown ink.
  - **Dark theme:** candle-lit brown-black. Both pass AA.
  - **The toggle:** in the header (an icon on phones). It follows the system setting, and an inline head script sets the theme before paint.
  - **Food:** real food photos as tilted paper snapshots.
  - **Specials:** on a printed menu card with a gold double rule.
  - **Bar hours:** on a chalkboard.
  - **Drinks:** typographic only (no drink photos exist).
  - **Home:**
    - a big hall-rental band; "Rent the Hall" goes to `/hall#inquiry`
    - event categories as ribbon stripes
    - a namesakes plaque with the six branches and POW/MIA
  - The official red and gold are accents only.
- **Fonts:** Literata for sign-style headings and Archivo for body text, both self-hosted OFL. Photo captions are rubber stamps: Archivo condensed (font-stretch 62%, weight 800) capitals in a ruled box, speckled by an SVG-noise mask, in rotating inks (red, navy, green, brass), all AA on the photo paper.
- **Logo:** the post's official VFW design, rebuilt as outlined vectors in `public/brand/`:
  - red "VFW" with gold bars, "NO ONE DOES MORE FOR VETERANS." and "Post 6493"
  - `logo.svg`: full colour
  - `logo-reverse.svg`: for dark backgrounds (used in the footer)
  - `logo-mark(-reverse).svg`: small sizes (the header)
  - `logo-1c.svg` and `logo-mono.svg`: one colour, for merch
  - Red is `#952f32` and gold is `#a58c52`. The VFW marks are VFW National trademarks, so check their licensing rules before selling merch.
- **Hero:** a muted, looping, AI-enhanced background video made from the post's own Facebook clips, with a pause button, posters and reduced-motion handling.
- **Photos:** real photos only, from the post's Facebook group and the hall-rental listing. No stock or AI images.
- **Quality bar:** the user's Riverside site (`V:\RiversideWebsite`, https://mishtuk.github.io/Riverside-Website/), with the same stack and patterns.

## Stack (mirrors the Riverside site)
- **Astro 7**, static output. Plain CSS (`src/styles/global.css`), self-hosted fonts and no client framework.
- **`server.js`:** one small Node server (no framework; nodemailer is the only extra dependency). It handles:
  - serving `dist/`
  - `/api/*` and `/admin`
  - the hall inquiry form
  - cookieless stats
  - filling admin-edited content into the pages at `<!--vfw:…-->` markers
- **Storage:** node:sqlite (`src/db.js`). Data lives in `.data/`, which is git-ignored.
- **Preview builds:** the static GitHub Pages build shows the seed content from `src/content/`. Admin features only work when `server.js` runs.
- **Hosting:** not decided yet. Ask the owner (see Riverside's Azure notes for a ready pattern).

## Pages
| Tab | Page(s) |
|---|---|
| Home | `/` |
| The Bar | `/bar` |
| Events | `/events` (full-year calendar and list), `/events/first-visit` (first-timer guide) |
| Hall Rental | `/hall` |
| Programs & Resources | `/programs`, `/resources`, `/youth` (contests and scholarships), `/support`, `/volunteer`, `/help` (veteran help request) |
| News | `/news` |
| Post shop | `/shop` (added as an 8th tab at the owner's request) |
| About | `/about`, `/history`, `/contact` |

Staff only: `/admin` (noindex, blocked in robots.txt). Bar TV: `/tv` (linked nowhere, noindex, not in the sitemap, not counted in stats; open it full screen on the bar's TV).

## Open questions for the post
- The charter year, and who Harry C. Wilson II and Douglas A. Post were.
- Hall rental prices and capacity.
- Hosting and domain.
