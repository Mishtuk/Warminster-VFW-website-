# Warminster VFW Post 6493 website: handoff

A new website for **VFW Post 6493 & Auxiliary** in Warminster, PA. The post has no website today; its online presence is a Facebook group and a hall-rental listing.

- **Repo:** https://github.com/Mishtuk/Warminster-VFW-website-. The local copy is `V:\WarminsterVFW`.
- **Preview (live):** https://mishtuk.github.io/Warminster-VFW-website-/. Redeploys on every push to `main`.
- **Commits:** authored as `Mish <113945444+Mishtuk@users.noreply.github.com>` (set in the repo's git config). No AI attribution in commits.
- **Research and sources:** `docs/research.md`. It covers the reference site, other VFW sites, emblem rules, post history, programs, resources, veteran discounts and news feeds.
- **Raw source media:** `source/` (local only, git-ignored).
  - `source/hall/` holds the hall-rental listing photos.
  - `source/fb/` holds the Facebook group photos, videos and flyers.

## Status
**2026-10-20:**
- **Live on the preview:**
  - the full site: 11 pages, with the admin panel in `server.js`
  - real content from the Facebook group: bar hours, specials, kitchen menu, recurring and dated events, officers, programs and post news
  - the official VFW Post 6493 logo
  - VA-first veteran news
- **Tests and audits:** `npm test` passes 30/30. Lighthouse accessibility is 100, with no horizontal scroll at 360px.
- **Next: hero video and Facebook photos.**
  - Chrome is allowed to auto-download from facebook.com, but its download folder must point at `V:\WarminsterVFW\source\fb` (nothing goes on the C: drive).
  - Then save photos and videos from the group's whole history, cut `public/media/hero*.mp4`, and add photos to pages.
  - The home hero currently uses a hall photo as its poster.
- **Later:**
  - a merch store using the logo (keep a Store tab in mind)
  - hosting and domain
  - SMTP for real inquiry email

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
- **Admin panel:** reached from the "Staff login" link at the very bottom of the footer, as on the Riverside site. It shows site statistics and lets staff:
  - add, edit and disable events
  - edit drink specials
  - edit the food menu
  - post news
  - read the hall inquiries inbox

## Look and feel
- **Audience:** older visitors and veterans. Large type (body text 19–20px), high contrast, simple navigation with at most 7 tabs, large tap targets, and no hover-only menus.
- **Colours:** dark and neutral, with nothing loud. Military homage stays tasteful: stars, a brass rule, flag-stripe accents, and a POW/MIA remembrance note.
- **Logo:** the post's official VFW design, rebuilt as outlined vectors in `public/brand/`:
  - red "VFW" with gold bars, "NO ONE DOES MORE FOR VETERANS." and "Post 6493"
  - `logo.svg`: full colour
  - `logo-reverse.svg`: for dark backgrounds (used in the footer)
  - `logo-mark(-reverse).svg`: small sizes (the header)
  - `logo-1c.svg` and `logo-mono.svg`: one colour, for merch
  - Red is `#952f32` and gold is `#a58c52`. The VFW marks are VFW National trademarks, so check their licensing rules before selling merch.
- **Hero:** a muted, looping background video made from the post's own Facebook photos and videos, with a pause button and a poster image, as on the Riverside site.
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
