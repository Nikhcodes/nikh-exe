# NIKH.EXE (personal website)

A multi-page personal site: Home, About, Projects, Journal, Links, Music, Contact.
It is plain HTML, CSS and JavaScript in one file (`index.html`). No build step, no installs.
Pages use hash routes (`#/music`), so it works on any static host.

## Run it locally
1. Unzip the folder.
2. Double-click `index.html` to open it in your browser.
   (Fonts load from Google Fonts, so you need internet for the full look.)

## Edit your content
Open `index.html` in any editor (VS Code is fine) and find the block between
`/* ===== EDIT YOUR CONTENT HERE ===== */` and `/* ===== END CONTENT ===== */`.

- `ME`: status line, "now listening", blurb, "currently into" stickers, updates, picks for the shuffle button, contact links. Put a real résumé URL in `ME.resume` to show a résumé link.
- `CRATES`: music genres and artists. Replace the "Add your favorite album..." notes with your own.
- `PROJECTS`: project text, stacks and links.
- `JOURNAL`: blog entries (newest first). Each is `{d, t, tags, body}`. New tags become filter buttons automatically.
- `LINKS` and `HEROES`: the Links page.

The About page text is in the `about()` function further down. The four journal entries and the link notes were drafted for you, so rewrite anything that doesn't sound like you.

## Put it online (static site only, no guestbook)
**GitHub Pages (you already use it for nikhcodes.github.io)**
1. Open your `NikhCodes.github.io` repository.
2. Replace its `index.html` with this one (keep a copy of the old one in a branch if you want a backup).
3. Commit and push. Your site updates within a minute or two at https://nikhcodes.github.io.

**Vercel or Netlify**
1. Put `index.html` in a new GitHub repo.
2. Import the repo into Vercel or Netlify and deploy. No build command is needed; the output folder is the repo root.

## Guestbook (real backend)
The Guestbook page talks to `/api/guestbook`, which stores messages in Postgres (Neon).
Messages are hidden until you approve them. This needs Vercel (GitHub Pages can't run server code).

Security built in: input length limits and control-character stripping, a hidden honeypot field,
a limit of 3 messages per hour per visitor (IP is stored only as a salted hash), same-origin POST check,
all text rendered with `textContent` (no HTML injection), security headers and a CSP in `vercel.json`,
and a token-protected moderation page.

### Setup
1. **Database:** create a free project at neon.tech. Open its SQL editor, paste `schema.sql`, run it. Copy the connection string.
2. **Repo:** push this whole folder to a GitHub repo (for example `nikh-exe`).
3. **Vercel:** import the repo at vercel.com. No build command needed. Before deploying, add Environment Variables:
   - `DATABASE_URL` = the Neon connection string
   - `ADMIN_TOKEN` = a long random secret (run `openssl rand -hex 32`)
   - `IP_SALT` = another random string
4. Deploy. Visit `/#/guestbook` and sign it. Then open `/admin.html`, paste your `ADMIN_TOKEN`, and approve the entry.
5. Optional: point a custom domain at the Vercel project. If you keep nikhcodes.github.io, make it link to the Vercel URL.

Until it is deployed with these variables, the Guestbook page shows an "offline" notice instead of a fake form.
Keep `ADMIN_TOKEN` private; anyone with it can approve or delete entries.

## Not included yet
- No audio is embedded. If you add Spotify or YouTube embeds later, keep them click-to-play.
- Plain HTML/CSS/JS on purpose; there is no build step.

`archive/old-portfolio.html` is the earlier single-page "After Hours" portfolio, kept just in case.
