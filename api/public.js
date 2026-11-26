// Read-only content for the public site.
//   GET  ?r=config            egg triggers (hashed), hints, small site texts, counts
//   POST ?r=reveal {id,phrase} the content of one egg, only after its trigger matched
//   GET  ?r=surprise&x=a,b    one random drawer item, avoiding recently seen ids
//   GET  ?r=scrapbook         published scrapbook entries
//   GET  ?r=page&p=/about     the site shell with that page's title and link-preview tags (pages are rewritten here)
//   GET  ?r=robots / sitemap  robots.txt and sitemap.xml
//   GET  ?r=status            live numbers for the Under the hood page (counts, database timing, build)
import { q } from './_lib/db.js';
import { route, send, readJson, HttpError, UUID, sameOrigin } from './_lib/http.js';
import { ACTIVE_SQL, ORDER_SQL, normPhrase, phraseHash } from './_lib/eggs.js';
import { mediaUrl } from './_lib/media.js';
import { mediaMap } from './_lib/content.js';
import { servePage, metaFor, slugify } from './_lib/page.js';

const HAS_CONTENT = `(e.title <> '' OR e.message <> '' OR EXISTS (SELECT 1 FROM egg_steps s WHERE s.egg_id = e.id AND s.media_id IS NOT NULL))`;

async function config() {
  const eggs = await q(`SELECT e.id, e.trigger_type, e.phrases, e.target, e.click_count, e.sequence,
      e.repeat_mode, e.cooldown_s, e.hint, e.hint_public
    FROM eggs e WHERE ${ACTIVE_SQL} AND ${HAS_CONTENT} ORDER BY ${ORDER_SQL}`);
  const settings = await q(`SELECT key, value FROM site_settings`);
  const [counts] = await q(`SELECT
      (SELECT count(*)::int FROM surprise_items WHERE enabled) AS surprise,
      (SELECT count(*)::int FROM scrapbook_entries WHERE published) AS scrapbook`);
  const content = await q(`SELECT key, data FROM site_content`);
  const ids = await q(`SELECT DISTINCT media_id FROM content_media`);
  const media = await mediaMap(ids.map(r => r.media_id));
  for (const m of Object.values(media)) delete m.name;
  return {
    content: Object.fromEntries(content.map(r => [r.key, r.data])),
    media,
    eggs: eggs.map(e => {
      const base = { id: e.id, type: e.trigger_type, repeat: e.repeat_mode, cooldown: e.cooldown_s };
      if (e.trigger_type === 'keyword')
        return { ...base, keys: e.phrases.map(p => ({ h: phraseHash(p), n: [...normPhrase(p)].length })) };
      if (e.trigger_type === 'click') return { ...base, target: e.target, count: e.click_count };
      return { ...base, sequence: e.sequence };
    }),
    hints: eggs.filter(e => e.hint_public && e.hint).map(e => e.hint),
    settings: Object.fromEntries(settings.map(s => [s.key, s.value])),
    counts
  };
}

async function reveal(req) {
  if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
  const body = await readJson(req, 2048);
  if (!UUID.test(body.id || '')) throw new HttpError(400, 'Bad id.');
  const [egg] = await q(`SELECT e.id, e.trigger_type, e.phrases, e.title, e.message, e.style, e.step_ms,
      snd.id AS sound_id, snd.version AS sound_v
    FROM eggs e LEFT JOIN media snd ON snd.id = e.sound_id AND snd.mime LIKE 'audio/%'
    WHERE e.id = $1 AND ${ACTIVE_SQL}`, [body.id]);
  if (!egg) throw new HttpError(404, 'Nothing here.');
  if (egg.trigger_type === 'keyword' && !egg.phrases.includes(normPhrase(body.phrase)))
    throw new HttpError(404, 'Nothing here.');
  // Only steps that actually have an image. Empty slots are skipped silently.
  const steps = await q(`SELECT s.caption, m.id AS media_id, m.version, m.width, m.height, m.alt, m.mime
    FROM egg_steps s JOIN media m ON m.id = s.media_id WHERE s.egg_id = $1 ORDER BY s.position`, [egg.id]);
  return {
    id: egg.id, title: egg.title, message: egg.message, style: egg.style, stepMs: egg.step_ms,
    sound: egg.sound_id ? mediaUrl(egg.sound_id, egg.sound_v) : null,
    steps: steps.map(s => ({ url: mediaUrl(s.media_id, s.version), w: s.width, h: s.height, alt: s.alt, caption: s.caption, mime: s.mime }))
  };
}

async function surprise(url) {
  const exclude = (url.searchParams.get('x') || '').split(',').filter(x => UUID.test(x)).slice(0, 20);
  const kind = url.searchParams.get('kind') === 'image' ? 'image' : '';
  const pick = ex => q(`SELECT si.id, si.kind, si.body, si.caption, m.id AS media_id, m.version, m.width, m.height, m.alt
    FROM surprise_items si LEFT JOIN media m ON m.id = si.media_id
    WHERE si.enabled AND NOT (si.id = ANY($1::uuid[])) AND ($2 = '' OR si.kind = $2) ORDER BY random() LIMIT 1`, [ex, kind]);
  let [it] = await pick(exclude);
  if (!it && exclude.length) [it] = await pick([]);
  if (!it) return { item: null };
  return { item: {
    id: it.id, kind: it.kind, body: it.body, caption: it.caption,
    ...(it.media_id ? { url: mediaUrl(it.media_id, it.version), w: it.width, h: it.height, alt: it.alt } : {})
  } };
}

/** Retro visitor counter. POST adds one (the page does that once per browser session). */
async function hit(req) {
  if (req.method === 'POST') {
    if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
    const [r] = await q(`INSERT INTO site_counters (key, n) VALUES ('visits', 1)
      ON CONFLICT (key) DO UPDATE SET n = site_counters.n + 1 RETURNING n`);
    return { n: Number(r.n) };
  }
  const [r] = await q(`SELECT n FROM site_counters WHERE key = 'visits'`);
  return { n: r ? Number(r.n) : 0 };
}

async function status() {
  const t0 = process.hrtime.bigint();
  await q('SELECT 1');
  const dbMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint();
  const [c] = await q(`SELECT
      (SELECT count(*)::int FROM guestbook_entries WHERE approved AND NOT rejected) AS notes,
      (SELECT count(*)::int FROM scrapbook_entries WHERE published) AS memories,
      (SELECT count(*)::int FROM arcade_scores WHERE NOT hidden) AS scores,
      (SELECT count(*)::int FROM arcade_runs WHERE started_at > now() - interval '1 day') AS runs_today,
      (SELECT COALESCE(max(n), 0)::bigint FROM site_counters WHERE key = 'visits') AS visits,
      (SELECT count(*)::int FROM media) AS files`);
  const countMs = Number(process.hrtime.bigint() - t1) / 1e6;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  return {
    db_ms: Math.round(dbMs * 10) / 10, count_ms: Math.round(countMs * 10) / 10,
    counts: { notes: c.notes, memories: c.memories, scores: c.scores, runs_today: c.runs_today, visits: Number(c.visits), files: c.files },
    build: { commit: sha.slice(0, 7), region: process.env.VERCEL_REGION || 'local', env: process.env.VERCEL_ENV || 'development' },
    node: process.version
  };
}

async function scrapbook() {
  const rows = await q(`SELECT se.id, se.title, se.body, to_char(se.entry_date, 'YYYY-MM-DD') AS date,
      COALESCE((SELECT json_agg(json_build_object('id', m.id, 'v', m.version, 'w', m.width, 'h', m.height, 'alt', m.alt, 'caption', m.caption)
                ORDER BY sm.position)
         FROM scrapbook_media sm JOIN media m ON m.id = sm.media_id WHERE sm.entry_id = se.id), '[]') AS media
    FROM scrapbook_entries se WHERE se.published
    ORDER BY se.position ASC, se.entry_date DESC NULLS LAST, se.created_at DESC LIMIT 200`);
  return { entries: rows.map(r => ({
    id: r.id, title: r.title, body: r.body, date: r.date,
    images: r.media.map(m => ({ url: mediaUrl(m.id, m.v), w: m.w, h: m.h, alt: m.alt, caption: m.caption }))
  })) };
}

async function sitemap(req, res, robots) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = `https://${host}`;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  if (robots) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end(`User-agent: *\nDisallow: /admin.html\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`); }
  let paths = ['/', '/about', '/projects', '/journal', '/scrapbook', '/links', '/guestbook', '/music', '/arcade', '/contact', '/hire', '/status'];
  try {
    const rows = await q(`SELECT data FROM site_content WHERE key = 'projects'`);
    const list = rows[0]?.data?.projects;
    if (Array.isArray(list)) paths = paths.concat(list.filter(p => p.csProblem).map(p => '/projects/' + slugify(p.name)));
  } catch { /* defaults are fine */ }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`);
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x'), r = u.searchParams.get('r');
  // Pages, robots and sitemap are plain responses (not JSON) and are cached at the edge.
  if (req.method === 'GET' && r === 'page') return servePage(req, res, (u.searchParams.get('p') || '/').slice(0, 300));
  if (req.method === 'GET' && (r === 'robots' || r === 'sitemap')) return sitemap(req, res, r === 'robots');
  return api(req, res);
}

const api = route(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const r = url.searchParams.get('r');
  if (req.method === 'GET' && r === 'config') return send(res, 200, await config());
  if (req.method === 'POST' && r === 'reveal') return send(res, 200, await reveal(req));
  if (req.method === 'GET' && r === 'surprise') return send(res, 200, await surprise(url));
  if (req.method === 'GET' && r === 'scrapbook') return send(res, 200, await scrapbook());
  if (req.method === 'GET' && r === 'status') return send(res, 200, await status());
  if ((req.method === 'GET' || req.method === 'POST') && r === 'hit') return send(res, 200, await hit(req));
  throw new HttpError(404, 'Unknown request.');
});
