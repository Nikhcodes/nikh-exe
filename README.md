<div align="center">

```
 ███╗   ██╗██╗██╗  ██╗██╗  ██╗   ███████╗██╗  ██╗███████╗
 ████╗  ██║██║██║ ██╔╝██║  ██║   ██╔════╝╚██╗██╔╝██╔════╝
 ██╔██╗ ██║██║█████╔╝ ███████║   █████╗   ╚███╔╝ █████╗
 ██║╚██╗██║██║██╔═██╗ ██╔══██║   ██╔══╝   ██╔██╗ ██╔══╝
 ██║ ╚████║██║██║  ██╗██║  ██║██╗███████╗██╔╝ ██╗███████╗
 ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
```

**under construction forever** · built after hours in suriname 🇸🇷

![no framework](https://img.shields.io/badge/framework-none-e0a458?style=flat-square&labelColor=0d1018)
![no build step](https://img.shields.io/badge/build_step-nope-e0a458?style=flat-square&labelColor=0d1018)
![postgres](https://img.shields.io/badge/postgres-neon-6b1f2e?style=flat-square&labelColor=0d1018)
![vercel](https://img.shields.io/badge/hosted_on-vercel-6b1f2e?style=flat-square&labelColor=0d1018)
![easter eggs](https://img.shields.io/badge/easter_eggs-classified-f1e7d3?style=flat-square&labelColor=0d1018)

</div>

---

### `WELCOME, STRANGER`

I had a normal portfolio. It was fine. It also sounded like every other developer on the internet.
So I tore it up and built the kind of website people used to make: **weird, personal and slightly too long.**

It looks like a homemade page from the early web. Under the hood it runs on a small CMS I wrote from scratch,
so every page, photo and secret can be changed from a private admin panel without touching a line of code.

```
C:\NIKH> dir
  HOME        ABOUT       PROJECTS    JOURNAL     SCRAPBOOK
  LINKS       GUESTBOOK   MUSIC       CONTACT     ??????
```

---

### `THE TOUR`

| | |
|---|---|
| 📌 **Guestbook as a bulletin board** | Visitors pin sticky notes. Nothing goes up until I approve it. Spam bots get a honeypot. |
| 💿 **The crate** | My music, sorted into crates. Spotify and YouTube links play right on the page, and nothing third-party loads until you press play. |
| 📦 **The shoebox** | A scrapbook of photos and small memories. |
| 🗄️ **The junk drawer** | A "Surprise me" button on the home page. You never know what's in there. |
| 🔢 **Hit counter** | A retro odometer. It counts visits and nothing else: no IPs, no cookies, no tracking. |
| 🔊 **Sound** | Off by default, because I respect you. Turn it on in the footer if you're brave. |
| 🥚 **Secrets** | Yes. Some you type, some you click. If you get stuck, the footer has a prompt that takes commands. Try `help`. |

---

### `THE BACK OFFICE`

The admin panel at `/admin.html` is where the site actually gets run:

- **Every page is editable.** Forms are generated from one schema per page: text, lists, photos, links.
  Hit save and it's live. No redeploy.
- **Media library** for images and sounds. Upload, replace, tag, and see everywhere a file is used before you delete it.
- **An Easter egg engine.** Keyword, click and click-sequence triggers, multi-step reveals, sounds, seasonal dates,
  cooldowns, conflict warnings, a live preview and a "would this trigger fire?" tester.
- **Moderation** for the guestbook, plus drafts and publishing for the scrapbook.

---

### `THE STACK`

```
Browser ──► index.html + assets/*.js            plain HTML/CSS/JS, hash routes, zero build
   │
   ├──► /api/public     page content, hashed egg triggers, drawer, scrapbook, hit counter
   ├──► /api/guestbook  pin a note (rate-limited) / read approved notes
   ├──► /api/media      images & sounds, only if something published uses them
   ├──► /api/auth       log in / log out
   └──► /api/cms        everything the admin panel does
                              │
                              ▼
                     PostgreSQL on Neon  ◄── yes, the images live here too
```

<details>
<summary><b>Why it's built like this</b> (click)</summary>

<br>

- **Content lives in the database, defaults live in code.** `assets/content.js` holds the built-in text for every page.
  Saving a page stores my version as JSON; "reset" deletes it and the default comes back.
- **Images are stored in Postgres.** It's a personal site: one service, one backup, nothing lost between deploys.
  Photos get resized and re-encoded in the browser before upload (which also strips GPS data), then the server
  checks the actual bytes.
- **Media is private until it's published.** `/api/media` only serves a file if something live uses it.
  Drafts and unused uploads return 404.
- **The secrets aren't in the source.** The browser only gets SHA-256 hashes of trigger words, and asks for an egg's
  content after a match. View-source won't save you.

</details>

<details>
<summary><b>Security, because I work in banking and can't help myself</b> (click)</summary>

<br>

- The admin password exists only as an **scrypt** hash in an environment variable.
- Random session tokens in **HttpOnly · Secure · SameSite=Strict** cookies, stored hashed server-side, so logout actually logs you out.
- **CSRF**: state-changing requests need a custom header and a same-origin check.
- **Rate limits** on login (5 tries per 15 minutes) and the guestbook (3 notes per hour). IPs are only ever stored as salted hashes.
- Uploads are checked by **magic bytes**, not file names. SVGs are refused. Size and dimensions are capped.
- All text is escaped on render, and page JSON is sanitised and size-limited on save.
- Strict **Content-Security-Policy** plus security headers; media is served with `nosniff` and a sandbox CSP.

</details>

---

### `THE WORKBENCH` (run it yourself)

You need Node.js 18+ and a PostgreSQL database you don't mind wiping.

```bash
npm install
npm run hash-password        # type a password, get an scrypt hash
```

Make a `.env.local` (it's git-ignored):

```
DATABASE_URL=postgres://user:pass@localhost:5432/nikh
ADMIN_PASSWORD_HASH=scrypt:...
IP_SALT=any-random-string
```

```bash
psql "$DATABASE_URL" -f schema.sql   # safe to run again, it never drops anything
npm run dev                          # http://localhost:3000  ·  /admin.html
TEST_ADMIN_PASSWORD=yourpassword npm test
```

**Deploying your own:** create a Postgres database (Neon's free tier is plenty) and run `schema.sql` in it.
Import the repo into Vercel (no build command), set `DATABASE_URL`, `ADMIN_PASSWORD_HASH` and `IP_SALT`, and deploy.
Then log into `/admin.html` and hit **Import starter pack**.

<details>
<summary><b>What's where</b></summary>

```
index.html            the public site
admin.html            the back office
assets/
  content.js          default content for every page
  eggs.js             the Easter egg engine
  reveal.js / .css    the "secret found" card
  sound.js            optional sound (off by default)
  admin.js            the admin panel
api/
  public · guestbook · media · auth · cms     Vercel functions
  _lib/               shared server code (not exposed as routes)
schema.sql            the database (idempotent)
seed/                 starter images and eggs
scripts/              local dev server and password-hash helper
tests/                API integration tests
archive/              older versions, kept for nostalgia
```

</details>

---

### `OPEN CHANNEL`

Found a bug? Found a secret? Have a strong opinion about a movie?
→ **nikhiel.lingard.dev@gmail.com** · [LinkedIn](https://www.linkedin.com/in/nikhiel-lingard/) · or sign the guestbook.

<sub>Code and writing by Nikhiel Lingard. Some pictures on the site (memes, fan art, characters, and photos of people I look up to)
belong to their respective owners and are used here for personal, non-commercial fun. If one is yours and you want it gone, open an issue.</sub>

<div align="center"><sub>NO CORPORATE SMALL TALK REQUIRED.</sub></div>
