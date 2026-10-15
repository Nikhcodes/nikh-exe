// Read-only content for the public site.
//   GET  ?r=config            egg triggers (hashed), hints, small site texts, counts
//   POST ?r=reveal {id,phrase} the content of one egg, only after its trigger matched
//   GET  ?r=surprise&x=a,b    one random drawer item, avoiding recently seen ids
//   GET  ?r=scrapbook         published scrapbook entries
import { q } from './_lib/db.js';
import { route, send, readJson, HttpError, UUID, sameOrigin } from './_lib/http.js';
import { ACTIVE_SQL, ORDER_SQL, normPhrase, phraseHash } from './_lib/eggs.js';
import { mediaUrl } from './_lib/media.js';

const HAS_CONTENT = `(e.title <> '' OR e.message <> '' OR EXISTS (SELECT 1 FROM egg_steps s WHERE s.egg_id = e.id AND s.media_id IS NOT NULL))`;

async function config() {
  const eggs = await q(`SELECT e.id, e.trigger_type, e.phrases, e.target, e.click_count, e.sequence,
      e.repeat_mode, e.cooldown_s, e.hint, e.hint_public
    FROM eggs e WHERE ${ACTIVE_SQL} AND ${HAS_CONTENT} ORDER BY ${ORDER_SQL}`);
  const settings = await q(`SELECT key, value FROM site_settings`);
  const [counts] = await q(`SELECT
      (SELECT count(*)::int FROM surprise_items WHERE enabled) AS surprise,
      (SELECT count(*)::int FROM scrapbook_entries WHERE published) AS scrapbook`);
  return {
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
  const [egg] = await q(`SELECT e.id, e.trigger_type, e.phrases, e.title, e.message, e.style, e.step_ms
    FROM eggs e WHERE e.id = $1 AND ${ACTIVE_SQL}`, [body.id]);
  if (!egg) throw new HttpError(404, 'Nothing here.');
  if (egg.trigger_type === 'keyword' && !egg.phrases.includes(normPhrase(body.phrase)))
    throw new HttpError(404, 'Nothing here.');
  // Only steps that actually have an image. Empty slots are skipped silently.
  const steps = await q(`SELECT s.caption, m.id AS media_id, m.version, m.width, m.height, m.alt
    FROM egg_steps s JOIN media m ON m.id = s.media_id WHERE s.egg_id = $1 ORDER BY s.position`, [egg.id]);
  return {
    id: egg.id, title: egg.title, message: egg.message, style: egg.style, stepMs: egg.step_ms,
    steps: steps.map(s => ({ url: mediaUrl(s.media_id, s.version), w: s.width, h: s.height, alt: s.alt, caption: s.caption }))
  };
}

async function surprise(url) {
  const exclude = (url.searchParams.get('x') || '').split(',').filter(x => UUID.test(x)).slice(0, 20);
  const pick = ex => q(`SELECT si.id, si.kind, si.body, si.caption, m.id AS media_id, m.version, m.width, m.height, m.alt
    FROM surprise_items si LEFT JOIN media m ON m.id = si.media_id
    WHERE si.enabled AND NOT (si.id = ANY($1::uuid[])) ORDER BY random() LIMIT 1`, [ex]);
  let [it] = await pick(exclude);
  if (!it && exclude.length) [it] = await pick([]);
  if (!it) return { item: null };
  return { item: {
    id: it.id, kind: it.kind, body: it.body, caption: it.caption,
    ...(it.media_id ? { url: mediaUrl(it.media_id, it.version), w: it.width, h: it.height, alt: it.alt } : {})
  } };
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

export default route(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const r = url.searchParams.get('r');
  if (req.method === 'GET' && r === 'config') return send(res, 200, await config());
  if (req.method === 'POST' && r === 'reveal') return send(res, 200, await reveal(req));
  if (req.method === 'GET' && r === 'surprise') return send(res, 200, await surprise(url));
  if (req.method === 'GET' && r === 'scrapbook') return send(res, 200, await scrapbook());
  throw new HttpError(404, 'Unknown request.');
});
