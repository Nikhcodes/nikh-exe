# NIKH.EXE (personal website)

A multi-page personal site: Home, About, Projects, Journal, Scrapbook, Links, Guestbook, Music, Contact.
The public site is still plain HTML, CSS and JavaScript in `index.html` with hash routes (`#/music`). There is no build step.

Since v2 it also has a private **admin panel** (`/admin.html`) where you manage images, Easter eggs,
the guestbook, the scrapbook, the "Surprise me" junk drawer and a few lines of home-page text, without touching code.

---

## What's in the box

| Part | Where | What it does |
|---|---|---|
| Public site | `index.html` | Same design as before, plus: bulletin-board guestbook, scrapbook page, junk drawer on the home page, hero photos on Links, footer prompt `C:\NIKH>` |
| Easter egg engine | `assets/eggs.js` | Listens for secret words, clicks and click sequences. Content comes from the database. |
| Reveal card | `assets/reveal.js` + `.css` | The pop-up that shows an egg. The admin preview uses the exact same code. |
| Admin panel | `admin.html` + `assets/admin.js` | Login, dashboard, media library, egg manager, guestbook moderation, scrapbook, drawer, site text |
| API | `api/*.js` (Vercel functions) | `auth`, `cms` (admin only), `public` (read-only), `media` (serves images), `guestbook` |
| Shared server code | `api/_lib/` | Database, auth, validation. Vercel does not expose files in folders starting with `_`. |
| Database | `schema.sql` | Postgres tables. Safe to run again; it never drops anything. |
| Starter pack | `seed/` | The images you sent, plus the starting eggs and drawer items. Imported from the admin dashboard. |
| Old admin pages | `archive/admin-guestbook-token*.html` | The previous token moderation pages. They still work while `ADMIN_TOKEN` is set. |

### How it fits together
- **Hosting:** Vercel (the static files + the `api/` functions). GitHub Pages can't run the backend.
- **Database:** Neon Postgres, the same one the guestbook already used.
- **Images are stored in the database** (`media` + `media_blobs` tables) and served by `/api/media`.
  So no extra storage service or account is needed. Uploads persist across deploys and go live the moment you save.
  No rebuild and no redeploy.
- Before uploading, the admin page shrinks photos to max 1600 px and re-encodes them (WebP).
  This keeps them small and **strips hidden metadata such as GPS location** from phone photos. The server then checks
  the real file bytes (JPEG, PNG, WebP or GIF only; SVG is refused), the size (max 4 MB) and the dimensions.

---

## Setup (one time)

You need: the Neon project you already have, a Vercel account, and Node.js 18+ on your computer (only to create
the password hash; you can also use any computer with Node).

### 1. Update the database
1. Open https://console.neon.tech, then your project, then **SQL Editor**.
2. Open `schema.sql` from this folder, copy everything, paste it in the editor, press **Run**.
3. You should see "success". Your existing guestbook entries are kept (two columns are added to that table).

### 2. Create your admin password hash
The password itself is never stored anywhere. Only a one-way hash goes into Vercel.

```bash
cd nikh-site
npm install
npm run hash-password
```
Type a password of at least 12 characters (it isn't shown while you type), then type it again.
Copy the whole line that starts with `scrypt:`.

### 3. Set the environment variables on Vercel
Vercel → your project → **Settings → Environment Variables**. Add these for **Production** (and Preview if you use it):

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string (you already have this one) |
| `ADMIN_PASSWORD_HASH` | The `scrypt:...` line from step 2 |
| `IP_SALT` | Any long random text (you already have this one) |
| `ADMIN_TOKEN` | *Optional.* Only keeps the old archived moderation pages working. You can delete it. |

Never paste these values into a chat, a commit or a screenshot.

### 4. Deploy
Push this folder to the GitHub repo that Vercel is connected to:
```bash
git add -A
git commit -m "NIKH.EXE v2: admin panel + Easter eggs"
git push
```
Vercel redeploys on its own. (Changing environment variables also needs a redeploy:
Vercel → Deployments → ⋯ on the latest one → **Redeploy**.)

### 5. First login and the starter pack
1. Open `https://<your-site>/admin.html`.
2. Log in with your password.
3. On the Dashboard, press **Import starter pack**. It uploads the images that came with the site through the normal upload
   pipeline and creates:
   - **cutie**: secret word → neuron-activation meme → *empty, optional photo slot* (see below)
   - **jam**: the original "Secret level unlocked" note
   - **delulu**: click the big "N" avatar 5 times → delulu cat
   - **halloween**: secret word, only active in October 2026 (a seasonal example; change or delete it)
   - 12 junk-drawer items (the cats, Snoopy, pixel art and the extra hero pictures)
4. Visit the site, click somewhere on the page that isn't a text box, and type `cutie`.

---

## Adding the photograph to `cutie` later

The `cutie` egg already works without it. Visitors see the meme, and the empty slot is skipped silently
(no broken image, no placeholder, no error). When you're ready:

1. Open `/admin.html` and log in.
2. Click **Easter eggs** (or, on the Dashboard under "Optional slots not filled yet", **Open media settings**).
3. Click **Edit** on **cutie**.
4. Scroll to **3 · What appears (media settings)**. Step 2, "Girlfriend photo", shows **NOT SET YET**.
5. Click **Choose or upload image**, then **↑ Upload new image**, and pick the photo. It's resized, cleaned and
   saved to the media library, then selected automatically. (Already uploaded it? Click it in the grid, then **Use this image**.)
6. Optional: add a caption for under the photo.
7. Click **▶ Preview** to watch the whole thing: meme first, then the photo.
8. Make sure **Live on the site** is ticked, then click **Save changes**.

That's it. The next visitor who types `cutie` gets the meme followed by the photo. No code change, no redeploy.

To swap the meme for a different image, use **Change image** on step 1.

### An honest note on privacy
A secret word is a surprise, not a lock. An image used by a live egg can be loaded by anyone who triggers the egg,
and by anyone they send the image link to. What the site does do:
- Images that aren't used by anything live are **admin-only** (`/api/media` returns 404 to visitors).
- Images appear in no public list or gallery. The photo is fetched only *after* someone types the word.
- The secret words aren't in the page source; the browser only gets a SHA-256 hash of each word.
  Short words can still be guessed by trying a dictionary, so this hides them from casual snooping only.
- After you switch an egg off, its images stop loading for new visitors within about 10 minutes (CDN cache).
  Anyone who already saw the image may still have it in their browser cache.

If something must stay truly private, don't put it on a public website.

---

## Using the admin panel

**Logging in/out.** `/admin.html`. Sessions last 8 hours. **Log out** ends the session on the server.
After 5 wrong passwords from the same network, login pauses for 15 minutes.

**Upload an image.** Media → drop files on the box or **choose files**. New images are private until used somewhere live.

**Edit details.** Media → click an image → change name, tags, alt text (describe the image for screen readers) or caption → **Save details**.
The panel also lists everywhere the image is used.

**Replace an image.** Media → click it → **Replace image…**. Everything that used it now shows the new picture.

**Delete safely.** Media → click it → **Delete**. If it's in use, you get a list of what will change first:
egg steps become empty slots (the egg keeps working), scrapbook entries lose that photo, and drawer items using it are removed.
"Unused · private" in the grid means nothing references it.

**Create an Easter egg.** Easter eggs → **+ New egg**:
1. Name (only you see it).
2. Trigger: **Secret word** (one or more words, comma separated, min 3 characters, capitals and spaces ignored),
   **Clicks** (an element clicked N times quickly), or **Click sequence** (elements clicked in order within 8 seconds).
   Clickable elements: the logo, the "N" avatar, the WELCOME tape, the 88x31 button, the footer line.
3. What appears: pop-up card with image steps, or a small note in the corner. Add a title, a message and steps.
4. **▶ Preview**, tick **Live on the site**, **Create egg**.

Advanced settings: pause between steps, "once per visit", cooldown, start/end dates (seasonal eggs), priority,
and a clue. Visitors see public clues when they type `help` in the footer prompt.

**Test a trigger.** Easter eggs → "Test a trigger word". It tells you which egg would fire and why others wouldn't.

**Conflicts.** If two live eggs share a trigger (or one word ends with another, like "cutie" and "tie"), saving warns you.
When both fire at the same moment, the higher **priority** wins; on a tie the older egg wins. You can save anyway.

**Turn an egg on or off.** Easter eggs → **Switch on / Switch off**.

**Guestbook.** New notes wait under **Waiting** until you **Approve** them. **Approve + pin** puts a note at the top of the board.
**Reject** hides a note but keeps it; **Delete** removes it for good.

**Scrapbook.** Scrapbook → **+ New entry**: title, optional date, text, photos (the first one is shown big), **Published**.
Drafts never appear on the site. Use ↑ ↓ to change the order. The "Scrapbook" menu link appears once something is published.

**Junk drawer (Surprise me).** Add images from the library or short text notes, then enable or disable each one.
The home-page box hides itself while the drawer is empty. It avoids repeating the last few picks.

**Pages (edit any page).** Admin → **Pages** → pick a page → **Edit**. Every page has a form: Home, Music, Links & heroes,
Projects, Journal, About, Contact and the footer. Change text, swap photos, add, remove or reorder list items (↑ ↓ ×), then
**Save page**. It's live right away. **View page ↗** opens it in a new tab. **Reset to default** throws away your saved version and
brings back the built-in text from `assets/content.js`. The editor warns you if you try to leave with unsaved changes.
- *Home:* profile photo (replaces the "N"), an optional second photo that shows on hover or tap, status, "Now listening" with
  a link and cover, a note on the fridge, stickers, updates, Tonight's pick list, the visitor counter switch,
  the tab-away title and the late-night message.
- *Music:* crates (genre tabs) with their color, and records with a note, an optional cover and an optional link.
  Spotify and YouTube links get **▶ Play here**, which opens the player on the page. The player only loads when someone clicks it.
- *Journal:* write plain text. Leave an empty line between paragraphs and start a line with `- ` for a bullet.
- *Projects:* pick one of the built-in drawings, or upload a screenshot instead.

**Sounds.** Upload MP3, OGG, WAV or M4A files (up to 4 MB) in Media, then pick one under "Sound (optional)" in an egg.
Visitors only hear sounds if they turn on the 🔇/🔊 switch in the footer. It's off by default and remembered in their browser.
With sound on, eggs without their own sound play a short chime, and the junk drawer makes a little knock.

---

### Easter eggs in the starter pack
`cutie` (meme, then your photo slot), `jam`, `delulu` (click the N avatar 5×), `halloween` (October only),
the Konami code `↑↑↓↓←→←→BA` (with a sound), `sudo`, `doom`, `maldini`, `bebop`, `hire me`, and clicking the logo 7×.
Built into the site: a 404 page for links that don't exist, a late-night message between 00:00 and 04:00,
and a tab title that changes while a visitor looks at another tab.
After updating the site, press **Re-run import** on the dashboard to add new starter eggs. Your existing ones are left alone.

## Where visitors find secrets
- **Typing anywhere** on a page (outside text boxes). Typing inside the guestbook form, the prompt or any
  input is never captured, and nothing listens while a password field has focus.
- **The footer prompt `C:\NIKH>`**: type a word and press Enter. This is how phones (no physical keyboard) find keyword eggs.
  `help` shows public clues and `cls` clears.
- **Clicking** designated elements.
- Found secrets are counted in the footer ("secrets found: 2/4"). This is stored only in that visitor's browser. No tracking.

---

## Local development

Requires Node 18+ and a Postgres database for testing (a free Neon *branch* works, or a local Postgres).
**Don't point local development at your production database.** The tests create and delete content.

1. Create `.env.local` in the project folder (it's in `.gitignore`):
   ```
   DATABASE_URL=postgres://...your test database...
   ADMIN_PASSWORD_HASH=scrypt:...
   IP_SALT=dev-salt
   ```
2. Run `schema.sql` on that database (Neon SQL editor, or `psql "$DATABASE_URL" -f schema.sql`).
3. `npm install`, then `npm run dev`, then open http://localhost:3000 and http://localhost:3000/admin.html.
4. Tests (with the dev server running): `TEST_ADMIN_PASSWORD=yourpassword npm test`
   (Windows PowerShell: `$env:TEST_ADMIN_PASSWORD="yourpassword"; npm test`).

`scripts/dev-server.mjs` imitates Vercel locally: it serves the files and runs `api/*.js`.
A `localhost` database URL uses the `pg` driver; anything else uses Neon's driver, same as production.

Opening `index.html` straight from disk still works for the static parts. Eggs, guestbook, scrapbook and drawer
need the backend, so they quietly stay hidden (the original `jam` toast still works offline).

---

## Backups and maintenance

Everything, images included, lives in your Neon database, so backing up the database backs up the whole site's content.

- **Neon history:** the free plan keeps about 6 hours of history you can restore to (in the Neon console, look for Restore or branch from a point in time).
  That's good for "oops, I just deleted that" and not much more.
- **Real backups** (do this every so often, and before big changes). Install the Postgres client tools, then:
  ```bash
  pg_dump "YOUR_DATABASE_URL" -Fc -f nikh-backup-$(date +%F).dump
  ```
  Restore into an empty database with `pg_restore -d "TARGET_DATABASE_URL" --no-owner nikh-backup-YYYY-MM-DD.dump`.
  Keep the backup file somewhere that isn't your laptop alone.
- **Deploys never touch uploaded images.** They aren't files in the repo, so redeploying, rolling back or
  changing hosts on Vercel can't lose them.
- **Schema updates:** future versions add to `schema.sql`; re-running it is always safe.

### Costs
- **Vercel Hobby:** free for personal, non-commercial sites. Uploads go through a function, which accepts bodies up to about 4.5 MB.
  That's why the admin shrinks photos first.
- **Neon Free:** 1 GB of storage per project and 5 GB of network transfer per month (at the time of writing; check neon.tech/pricing).
  A resized photo is usually 100 to 400 KB, so that's thousands of images. Each image view that isn't already cached
  reads from the database, so a viral moment could use up the transfer. If it runs out, Neon pauses the database until the next month
  (nothing is deleted) and the site's backend features go offline until then. The Dashboard shows the library's total size.
- No other paid services are used.

---

## Default content (in code)
The built-in text for every page lives in `assets/content.js`. The site uses it for any page you haven't saved in
Admin → Pages, and "Reset to default" goes back to it. Once you save a page in the admin, the saved version wins,
so you normally never need to edit this file.

## Updating an existing deployment
1. Run `schema.sql` again in the Neon SQL editor (it only adds what's new).
2. Copy the new files into your repo folder, then `git add -A`, `git commit`, `git push`.
3. In the admin, press **Re-run import** on the dashboard to get new starter eggs.

## Visitor counter
The home page shows a retro counter. It adds one per browser session and stores only the number: no IPs, no cookies, no tracking.
Turn it off in Pages → Home.

## Not included yet
- Guestbook reactions or "likes". They'd need extra spam protection; easy to add later.
- Only Spotify and YouTube can be played on the page. Other links (Apple Music, SoundCloud...) open in a new tab.
  To add another player, add its domain to `frame-src` in `vercel.json` and to `embedOf()` in `index.html`.

`archive/old-portfolio.html` is the earlier single-page "After Hours" portfolio, kept just in case.
