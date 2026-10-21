# NIKH.EXE

My personal corner of the internet: a hand-built website with music, projects, a journal, a guestbook and a few
things you have to find yourself. It looks like a static site from the early web; under the hood it runs on a small
custom CMS I wrote, so every page, photo and secret can be changed from a private admin panel without touching code.

> No framework, no build step. Plain HTML, CSS and JavaScript on the front, Node.js serverless functions and
> PostgreSQL on the back.

---

## Features

**For visitors**
- Pages: Home, About, Projects, Journal, Scrapbook, Links, Guestbook, Music, Contact.
- **Guestbook as a bulletin board**: visitors pin notes; nothing appears until it's approved.
- **Music crates** with click-to-play Spotify/YouTube players. Nothing third-party loads until you press play.
- **Scrapbook** of photos and small memories, and a **"Surprise me"** junk drawer on the home page.
- **Hidden Easter eggs.** Some are typed, some are clicked. There's a prompt in the footer if you get stuck.
- Optional sound effects (off by default), a retro visitor counter, and a proper 404 page.
- Works on phones, with the keyboard and with reduced motion. No tracking, no analytics, no cookies for visitors.

**Behind the scenes (admin panel)**
- Edit every page through generated forms: text, lists, photos, links. Changes go live on save, with no redeploy.
- Media library for images and sounds: upload, replace, tag, and see where each file is used before deleting it.
- A data-driven **Easter egg engine**: keyword, click and click-sequence triggers; multi-step reveals; sounds;
  start/end dates; cooldowns; conflict detection; a live preview and a trigger tester.
- Guestbook moderation (approve, pin, reject, delete) and scrapbook drafts and publishing.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, hash routing, no build step |
| Backend | Node.js serverless functions on Vercel (`/api`) |
| Database | PostgreSQL on Neon (`@neondatabase/serverless`; `pg` for local development) |
| Media storage | PostgreSQL (`bytea`), served through an API route with byte-range support |
| Auth | Single admin, scrypt password hash, server-side sessions |
| Tests | `node:test` integration tests that run against a real database |

## Architecture

```
Browser ──► index.html + assets/*.js          (static, served by Vercel's CDN)
   │
   ├──► /api/public     read-only: page content, egg triggers (hashed), drawer, scrapbook, visitor count
   ├──► /api/guestbook  submit notes (rate-limited), read approved notes
   ├──► /api/media      images & sounds, only if used by something published
   ├──► /api/auth       login / logout
   └──► /api/cms        everything the admin panel does (session + CSRF checks)
                              │
                              ▼
                        PostgreSQL (Neon)
```

Some decisions worth explaining:

- **Content lives in the database, defaults live in code.** `assets/content.js` holds the built-in text for every page.
  Saving a page in the admin stores your version as JSON; "reset" deletes it and the default returns.
  The admin forms are generated from one schema per page, so adding a field is a one-line change.
- **Images are stored in Postgres.** For a personal site this keeps everything in one place: one service, one backup,
  nothing lost between deploys. Photos are resized and re-encoded in the browser before upload (which also strips
  GPS metadata), then validated on the server by their actual bytes.
- **Media is private by default.** `/api/media` only serves a file if something published references it.
  Unpublished drafts and unused uploads return 404 to visitors.
- **Easter egg triggers never appear in the page source.** The browser receives SHA-256 hashes of the trigger words
  and asks the server for an egg's content only after a match.

## Security

- Admin password stored only as an **scrypt** hash in an environment variable.
- Random session tokens in **HttpOnly, Secure, SameSite=Strict** cookies; sessions are stored hashed server-side,
  so logout really ends them.
- **CSRF protection**: state-changing requests need a custom header and a same-origin check.
- **Login rate limiting** (5 failures per 15 minutes per IP) and guestbook rate limiting (3 notes per hour).
  IPs are only stored as salted hashes.
- Uploads are checked by **magic bytes** (JPEG, PNG, WebP, GIF, MP3, OGG, WAV, M4A); SVG is refused; size and dimensions are capped.
- All user and admin text is escaped on render; page JSON is sanitised and size-limited on save.
- A strict **Content-Security-Policy** and security headers in `vercel.json`; media is served with `nosniff` and a sandbox CSP.

## Project structure

```
index.html            the public site (pages are rendered by the script at the bottom)
admin.html            the admin panel shell
assets/
  content.js          default content for every page
  eggs.js             Easter egg engine (public side)
  reveal.js/.css      the reveal card, shared with the admin preview
  sound.js            optional sound (off by default)
  admin.js            the admin panel
  heroes/             static images
api/
  public.js  guestbook.js  media.js  auth.js  cms.js   Vercel functions
  _lib/                shared server code (not exposed as routes)
schema.sql            database schema (idempotent: safe to run again)
seed/                 starter images and the starter set of eggs, imported from the admin dashboard
scripts/              local dev server and the password-hash helper
tests/                API integration tests
```

## Running it locally

Requirements: Node.js 18+ and a PostgreSQL database you don't mind wiping (local Postgres or a Neon branch).

```bash
npm install
npm run hash-password          # prints an scrypt hash for the admin password you type
```

Create `.env.local` (git-ignored):

```
DATABASE_URL=postgres://user:pass@localhost:5432/nikh
ADMIN_PASSWORD_HASH=scrypt:...
IP_SALT=any-random-string
```

Then:

```bash
psql "$DATABASE_URL" -f schema.sql
npm run dev                    # http://localhost:3000  and  /admin.html
TEST_ADMIN_PASSWORD=yourpassword npm test   # with the dev server running
```

`scripts/dev-server.mjs` mimics Vercel locally (static files plus `/api/*`). Opening `index.html` straight from disk
also works for the static parts; anything that needs the backend hides itself.

## Deploying your own copy

1. Create a Postgres database (Neon's free tier is enough) and run `schema.sql` in it.
2. Import the repo into Vercel. No build command is needed.
3. Set the environment variables `DATABASE_URL`, `ADMIN_PASSWORD_HASH` and `IP_SALT`, then deploy.
4. Open `/admin.html`, log in, and use **Import starter pack** on the dashboard, or start from an empty library.

## Credits

Code and writing by [Nikhiel Lingard](https://www.linkedin.com/in/nikhiel-lingard/).
Some pictures on the site (memes, fan art, characters and photos of people I look up to) belong to their
respective owners and are used here for personal, non-commercial fun. If you own one and want it removed, open an issue.

`archive/` keeps earlier versions of the site and admin pages for reference.
