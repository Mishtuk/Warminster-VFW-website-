# Warminster VFW Post 6493 website: handoff

A new website for **VFW Post 6493 & Auxiliary** in Warminster, PA. The post has no website today; its online presence is a Facebook group and a hall-rental listing.

- **Repo:** https://github.com/Mishtuk/Warminster-VFW-website-. The local copy is `V:\WarminsterVFW`.
- **Preview (live):** https://mishtuk.github.io/Warminster-VFW-website-/. Redeploys on every push to `main`.
- **Commits:** authored as `Mish <113945444+Mishtuk@users.noreply.github.com>` (set in the repo's git config). No AI attribution in commits.
- **Research and sources:** `docs/research.md`. It covers the reference site, other VFW sites, emblem rules, post history, programs, resources, veteran discounts and news feeds.
- **Raw source media:** `source/` (local only, git-ignored).
  - `source/hall/` holds the hall-rental listing photos.
  - `source/fb/` holds the Facebook group photos, videos and flyers.

## Status (handoff, 2026-10-20)
**The site is feature-complete on the preview. The next steps are the owner's choices.**

### What's live
- **Pages:** 11 pages in the cozy "Canteen" look, plus a light/dark theme.
  - The theme switch is a small moon/sun button at the bottom right (`ThemeFab.astro`). It follows the system setting and is remembered per visitor.
- **Home:**
  - The hero has a background video and a polaroid stack showing a random 9 from a 22-photo bank (`HeroCarousel.astro`, `src/lib/hero-photos.ts`). On phones the stack is a strip below the hero.
  - Then the featured What's on: the next special event within 30 days, else the next event, plus 4 compact cards (`featuredHtml` in `state.js`, marker `events-featured`).
  - Then New here?, food snapshots with the specials menu card, the hall band (2 photos that open a 14-photo gallery, `src/lib/hall-photos.ts`), the namesakes plaque and post news.
- **Info pages:**
  - All of them use one layout (`src/components/info/`: InfoSection, OnThisPage, KeyFacts), with multi-column layouts on desktop.
  - Resources are grouped by need, with the crisis line first.
  - Programs shows the 3 pillars side by side.
  - Events: the weekly nights appear as a row of cards, the year calendar lists dated events per month, and there is an `.ics` "Add to my calendar" feed.
  - News: post news has photos (an optional `photo` field, chosen in the admin), and VA/DVIDS stories have self-hosted thumbnails.
- **Photo viewer:** a native `<dialog>` (`Lightbox.astro`) on every photo group, with Previous/Next, swipe, a count and Close/Esc. `-full.webp` copies are used for the large view.
- **Admin (`server.js`):**
  - stats
  - events (add, edit, disable)
  - drink specials and the food menu
  - news with photos
  - the hall inquiries inbox (deleted after 12 months)
  - the security log
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

### Ideas offered to the owner (not started; the owner decides)
1. **Online hall booking calendar:** the owner marks booked dates in the admin, and renters see open dates before they inquire.
2. **Event sign-ups / RSVPs** (bingo nights, the Cash Bash), with counts in the admin.
3. **A merch store** with the official logo (the vector files are ready). Check VFW National licensing first.
4. **An email or text list** for event reminders and closures, managed from the admin.
5. **Photo uploads in the admin,** so staff can add event photos and news pictures without a developer.
6. **A "Wall of Honor"** of member veterans (branch, era, photo), added with family consent.
7. **Online membership renewal / dues** (link to the VFW national portal, plus post-side Home Association info).
8. **A live "Bar open now" / "Kitchen open now" badge** driven by the hours.
9. **A printable monthly flyer** generated from the events, for the bar's bulletin board.
10. **A Spanish or large-print toggle,** plus a read-aloud option for accessibility.

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
- **Audience:** older visitors and veterans. Large type (body text 19–20px), high contrast, simple navigation with at most 7 tabs, large tap targets, and no hover-only menus.
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
- **Fonts:** Literata for sign-style headings and Archivo for body text, both self-hosted OFL.
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
| Events | `/events` (full-year calendar and list) |
| Hall Rental | `/hall` |
| Programs & Resources | `/programs`, `/resources` |
| News | `/news` |
| About | `/about`, `/history`, `/contact` |

Staff only: `/admin` (noindex, blocked in robots.txt).

## Open questions for the post
- The charter year, and who Harry C. Wilson II and Douglas A. Post were.
- Hall rental prices and capacity.
- Hosting and domain.
