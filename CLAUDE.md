# CLAUDE.md: working on NIKH.EXE

Nikh's personal website. Hand-built, no framework, no build step. Read this before changing anything.

## Stack and layout
- **Frontend:** `index.html` (all pages, hash routes `#/music`), plus `assets/*.js`. Plain ES2020, no bundler.
  - `assets/content.js` holds the default content for every page. The admin's saved JSON (`site_content` table) overrides it.
  - `assets/eggs.js` is the Easter egg engine (public side). `assets/reveal.js` + `.css` is the reveal card (also used by the admin preview).
  - `assets/sound.js` is sound, **off by default**. `assets/drops.js` does photo drops. `assets/arcade.js` holds the three games.
  - `assets/admin.js` + `admin.html` is the admin panel. Page editors are generated from the `PAGES` schema in admin.js.
- **Backend:** Vercel Node functions in `api/` (`public`, `guestbook`, `media`, `auth`, `cms`, `arcade`, plus the legacy `admin`).
  Shared code is in `api/_lib/` (underscore = not a route). The Vercel Hobby plan allows max 12 functions, so prefer adding a `?r=` route to an existing function.
- **Database:** Neon Postgres. `schema.sql` is **append-only and idempotent** (`IF NOT EXISTS`, drop-then-add for constraints).
  Never write destructive migrations. New sections go at the bottom under a `-- ===== vN` header.
- **Media** (images, GIFs, short MP4/WebM, sounds) is stored in Postgres (`media` + `media_blobs`) and served by `/api/media`.
  A file is public only while something published uses it. Upload limit is about 4 MB (the Vercel request body limit).

## Rules
- Keep the design language: ink/cream/amber/burgundy palette, tape labels, Bowlby/Courier/Newsreader, slight tilts.
  Personality comes from content and small details, not constant animation. Respect `prefers-reduced-motion`.
- **Escape everything** rendered from data (`esc()` in index.html, `textContent` / the `h()` helper in admin.js). Admin text is data too.
- Every admin endpoint goes through `requireAdmin()` (session cookie + `X-NIKH-CSRF` header + same-origin check).
- Public write endpoints need `sameOrigin()` checks and a rate limit by `ipHash()`. Never store raw IPs.
- Validate uploads by magic bytes (`api/_lib/media.js`). SVG is never accepted.
- **No egg spoilers in public files.** The README, comments and commit messages must not list trigger words.
  (`seed/manifest.json` has to list the starter eggs; that's accepted.) Private notes go in `.private/` (git-ignored).
- Keyboard eggs must never fire inside inputs, dialogs, or while an arcade game runs (`body[data-playing]`).
- The arcade trusts nothing from the browser: tickets come from `api/arcade?r=start` and scores are checked in `api/_lib/arcade.js`.
  Initials are 3 characters, checked against a blocklist (leetspeak + Dutch included).

## Run and test locally
```bash
npm install
# .env.local: DATABASE_URL (a throwaway Postgres), ADMIN_PASSWORD_HASH (npm run hash-password), IP_SALT
psql "$DATABASE_URL" -f schema.sql
npm run dev                                  # http://localhost:3000, admin at /admin.html
TEST_ADMIN_PASSWORD=... npm test             # API integration tests; they refuse to run against a non-localhost URL
```
The tests create and delete their own `test-*` content. Never point them at production.

## Shipping
1. If `schema.sql` changed: Nikh runs it in the Neon SQL editor **before** the deploy.
2. Push a branch and open a PR. Merging to `main` deploys to production on Vercel (same domain).
3. If `seed/manifest.json` gained eggs: Admin → Dashboard → **Re-run import**.

## Owner
Nikh (Nikhiel Lingard). Uses Fedora + fish shell + VS Code. Works with Claude through claude.ai, often from a phone.
Prefers step-by-step instructions for anything he has to do himself, and real implementations over plans.
