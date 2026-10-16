// Admin-only content API. Every request passes requireAdmin() first (session cookie,
// plus CSRF header + same-origin check for anything that changes data).
//
//   ?r=stats                         GET
//   ?r=media[&id][&q][&tag]          GET list/detail · POST upload · PUT replace bytes · PATCH details · DELETE
//   ?r=eggs[&id]                     GET list · POST create · PUT update · PATCH enable/disable · DELETE
//   ?r=egg-test                      POST {phrase}  which egg would fire?
//   ?r=guestbook[&status]            GET · POST {id, action}
//   ?r=scrapbook[&id]                GET · POST · PUT · DELETE
//   ?r=scrapbook-order               POST {ids:[...]}
//   ?r=surprise[&id]                 GET · POST · PUT · DELETE
//   ?r=settings                      GET · PUT
import { createHash } from 'node:crypto';
import { q } from './_lib/db.js';
import { route, send, readJson, readBody, HttpError, UUID, clean, cleanMultiline } from './_lib/http.js';
import { requireAdmin } from './_lib/auth.js';
import { sniffImage, sniffAudio, isAudio, MAX_UPLOAD_BYTES, MAX_SIDE, mediaUrl } from './_lib/media.js';
import { mediaMap } from './_lib/content.js';
import { TARGETS, normPhrase, findConflicts, ACTIVE_SQL, ORDER_SQL } from './_lib/eggs.js';

const bool = v => v === true || v === 'true' || v === 1;
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const needId = id => { if (!UUID.test(id || '')) throw new HttpError(400, 'Missing or bad id.'); return id; };
const tagsOf = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map(t => clean(t, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
const dateOrNull = v => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'One of the dates is not valid.');
  return d.toISOString();
};

// ------------------------------------------------------------------ stats
async function stats() {
  const [s] = await q(`SELECT
    (SELECT count(*)::int FROM media) AS media,
    (SELECT count(*)::int FROM eggs e WHERE ${ACTIVE_SQL}) AS eggs_active,
    (SELECT count(*)::int FROM eggs e WHERE NOT (${ACTIVE_SQL})) AS eggs_inactive,
    (SELECT count(*)::int FROM egg_steps s JOIN eggs e ON e.id = s.egg_id WHERE s.media_id IS NULL) AS empty_slots,
    (SELECT count(*)::int FROM guestbook_entries WHERE NOT approved AND NOT rejected) AS guestbook_pending,
    (SELECT count(*)::int FROM scrapbook_entries) AS scrapbook,
    (SELECT count(*)::int FROM scrapbook_entries WHERE published) AS scrapbook_published,
    (SELECT count(*)::int FROM surprise_items WHERE enabled) AS surprise_enabled,
    (SELECT COALESCE(sum(bytes), 0)::bigint FROM media) AS media_bytes,
    (SELECT count(*)::int FROM site_content) AS pages_edited,
    (SELECT COALESCE(max(n), 0)::bigint FROM site_counters WHERE key = 'visits') AS visits`);
  return { ...s, media_bytes: Number(s.media_bytes), visits: Number(s.visits) };
}

// ------------------------------------------------------------------ media
const USAGE_SQL = `
  SELECT 'egg' AS kind, e.id, e.name AS label, s.position + 1 AS pos, s.label AS slot
    FROM egg_steps s JOIN eggs e ON e.id = s.egg_id WHERE s.media_id = $1
  UNION ALL
  SELECT 'scrapbook', se.id, COALESCE(NULLIF(se.title, ''), '(untitled entry)'), sm.position + 1, ''
    FROM scrapbook_media sm JOIN scrapbook_entries se ON se.id = sm.entry_id WHERE sm.media_id = $1
  UNION ALL
  SELECT 'surprise', si.id, COALESCE(NULLIF(si.caption, ''), '(drawer item)'), 0, ''
    FROM surprise_items si WHERE si.media_id = $1
  UNION ALL
  SELECT 'egg', e.id, e.name, 0, 'sound'
    FROM eggs e WHERE e.sound_id = $1
  UNION ALL
  SELECT 'page', NULL::uuid, cm.key, 0, ''
    FROM content_media cm WHERE cm.media_id = $1`;

const MEDIA_COLS = `m.id, m.name, m.caption, m.alt, m.tags, m.mime, m.width, m.height, m.bytes, m.version, m.created_at, m.updated_at`;
const withUrl = m => ({ ...m, url: mediaUrl(m.id, m.version) });

async function mediaList(url) {
  const term = clean(url.searchParams.get('q'), 60);
  const tag = clean(url.searchParams.get('tag'), 30).toLowerCase();
  const rows = await q(`SELECT ${MEDIA_COLS},
      ((SELECT count(*) FROM egg_steps WHERE media_id = m.id) +
       (SELECT count(*) FROM scrapbook_media WHERE media_id = m.id) +
       (SELECT count(*) FROM surprise_items WHERE media_id = m.id) +
       (SELECT count(*) FROM eggs WHERE sound_id = m.id) +
       (SELECT count(*) FROM content_media WHERE media_id = m.id))::int AS uses
    FROM media m
    WHERE ($1 = '' OR m.name ILIKE '%' || $1 || '%' OR m.caption ILIKE '%' || $1 || '%' OR $1 = ANY(m.tags))
      AND ($2 = '' OR $2 = ANY(m.tags))
      AND ($3 = '' OR m.mime LIKE $3 || '/%')
    ORDER BY m.created_at DESC LIMIT 500`, [term, tag, ['image', 'audio'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : '']);
  const tags = await q(`SELECT DISTINCT unnest(tags) AS t FROM media ORDER BY 1`);
  return { media: rows.map(withUrl), tags: tags.map(t => t.t) };
}

async function mediaDetail(id) {
  const [m] = await q(`SELECT ${MEDIA_COLS} FROM media m WHERE m.id = $1`, [id]);
  if (!m) throw new HttpError(404, 'That file no longer exists.');
  return { media: withUrl(m), usage: await q(USAGE_SQL, [id]) };
}

async function readImage(req) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.startsWith('application/octet-stream')) throw new HttpError(415, 'Send the file bytes as application/octet-stream.');
  const buf = await readBody(req, MAX_UPLOAD_BYTES);
  if (!buf.length) throw new HttpError(400, 'The file is empty.');
  const audio = sniffAudio(buf);
  if (audio) return { buf, info: audio, sha: createHash('sha256').update(buf).digest('hex') };
  const info = sniffImage(buf);
  if (!info) throw new HttpError(415, 'That file is not a JPEG, PNG, WebP or GIF image, or an MP3, OGG, WAV or M4A sound. (SVG and other formats are not accepted.)');
  if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE)
    throw new HttpError(400, `The image must be at most ${MAX_SIDE} pixels on each side.`);
  return { buf, info, sha: createHash('sha256').update(buf).digest('hex') };
}

async function mediaUpload(req, url) {
  const { buf, info, sha } = await readImage(req);
  const [dupe] = await q(`SELECT ${MEDIA_COLS} FROM media m WHERE m.sha256 = $1 LIMIT 1`, [sha]);
  if (dupe) return { media: withUrl(dupe), duplicate: true };
  const name = clean(url.searchParams.get('name'), 120) || 'Untitled image';
  const tags = tagsOf(url.searchParams.get('tags'));
  const [m] = await q(`INSERT INTO media (name, tags, mime, width, height, bytes, sha256, alt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [name, tags, info.mime, info.width, info.height, buf.length, sha, clean(url.searchParams.get('alt'), 300)]);
  try {
    await q(`INSERT INTO media_blobs (media_id, data) VALUES ($1, decode($2, 'base64'))`, [m.id, buf.toString('base64')]);
  } catch (e) {
    await q(`DELETE FROM media WHERE id = $1`, [m.id]); // keep metadata and bytes in sync
    throw e;
  }
  return mediaDetail(m.id);
}

async function mediaReplace(req, id) {
  const { buf, info, sha } = await readImage(req);
  const [m] = await q(`SELECT id, mime FROM media WHERE id = $1`, [id]);
  if (!m) throw new HttpError(404, 'That file no longer exists.');
  if (isAudio(m.mime) !== isAudio(info.mime)) throw new HttpError(400, isAudio(m.mime) ? 'Replace a sound with another sound file.' : 'Replace an image with another image.');
  await q(`UPDATE media_blobs SET data = decode($2, 'base64') WHERE media_id = $1`, [id, buf.toString('base64')]);
  await q(`UPDATE media SET mime = $2, width = $3, height = $4, bytes = $5, sha256 = $6,
      version = version + 1, updated_at = now() WHERE id = $1`, [id, info.mime, info.width, info.height, buf.length, sha]);
  return mediaDetail(id);
}

async function mediaPatch(req, id) {
  const b = await readJson(req);
  const [m] = await q(`UPDATE media SET
      name = COALESCE($2, name), caption = COALESCE($3, caption), alt = COALESCE($4, alt),
      tags = COALESCE($5, tags), updated_at = now()
    WHERE id = $1 RETURNING id`, [id,
    b.name !== undefined ? (clean(b.name, 120) || 'Untitled image') : null,
    b.caption !== undefined ? cleanMultiline(b.caption, 500) : null,
    b.alt !== undefined ? clean(b.alt, 300) : null,
    b.tags !== undefined ? tagsOf(b.tags) : null]);
  if (!m) throw new HttpError(404, 'That image no longer exists.');
  return mediaDetail(id);
}

async function mediaDelete(id, url) {
  const usage = await q(USAGE_SQL, [id]);
  if (usage.length && url.searchParams.get('force') !== '1')
    throw new HttpError(409, 'This image is still in use.', { usage });
  await q(`DELETE FROM media WHERE id = $1`, [id]); // egg slots become empty; scrapbook links + drawer items go
  return { ok: true, detached: usage };
}

// ------------------------------------------------------------------ eggs
async function eggRows(where = 'TRUE', params = []) {
  const eggs = await q(`SELECT e.*, (${ACTIVE_SQL}) AS live FROM eggs e WHERE ${where} ORDER BY ${ORDER_SQL}`, params);
  if (!eggs.length) return [];
  const steps = await q(`SELECT s.id, s.egg_id, s.position, s.label, s.caption, s.media_id,
      m.name AS media_name, m.version, m.width, m.height, m.alt
    FROM egg_steps s LEFT JOIN media m ON m.id = s.media_id
    WHERE s.egg_id = ANY($1::uuid[]) ORDER BY s.position`, [eggs.map(e => e.id)]);
  const sounds = await q(`SELECT id, name, version FROM media WHERE id = ANY($1::uuid[])`, [eggs.map(e => e.sound_id).filter(Boolean)]);
  return eggs.map(e => ({
    ...e,
    sound: (s => s ? { name: s.name, url: mediaUrl(s.id, s.version) } : null)(sounds.find(x => x.id === e.sound_id)),
    steps: steps.filter(s => s.egg_id === e.id).map(s => ({
      id: s.id, label: s.label, caption: s.caption, media_id: s.media_id,
      media: s.media_id ? { name: s.media_name, url: mediaUrl(s.media_id, s.version), w: s.width, h: s.height, alt: s.alt } : null
    }))
  }));
}

async function eggList() {
  const eggs = await eggRows();
  const all = await q(`SELECT e.id, e.name, e.trigger_type, e.phrases, e.target, e.click_count, e.sequence,
    (${ACTIVE_SQL}) AS enabled FROM eggs e`);
  return { eggs: eggs.map(e => ({ ...e, conflicts: e.live ? findConflicts(e, all) : [] })), targets: TARGETS };
}

function validateEgg(b) {
  const type = ['keyword', 'click', 'sequence'].includes(b.trigger_type) ? b.trigger_type : null;
  if (!type) throw new HttpError(400, 'Choose a trigger type.');
  const egg = {
    name: clean(b.name, 60),
    trigger_type: type,
    phrases: [], target: null, click_count: 1, sequence: [],
    title: clean(b.title, 120),
    message: cleanMultiline(b.message, 600),
    style: b.style === 'toast' ? 'toast' : 'card',
    step_ms: int(b.step_ms, 500, 10000, 1600),
    enabled: bool(b.enabled),
    priority: int(b.priority, -100, 100, 0),
    repeat_mode: b.repeat_mode === 'once_per_session' ? 'once_per_session' : 'always',
    cooldown_s: int(b.cooldown_s, 0, 86400, 0),
    starts_at: dateOrNull(b.starts_at),
    ends_at: dateOrNull(b.ends_at),
    hint: clean(b.hint, 200),
    hint_public: bool(b.hint_public),
    sound_id: UUID.test(b.sound_id || '') ? b.sound_id : null
  };
  if (!egg.name) throw new HttpError(400, 'Give the egg a name (only you see it).');
  if (egg.starts_at && egg.ends_at && egg.ends_at <= egg.starts_at) throw new HttpError(400, 'The end date must be after the start date.');
  if (type === 'keyword') {
    egg.phrases = [...new Set((Array.isArray(b.phrases) ? b.phrases : String(b.phrases || '').split(','))
      .map(normPhrase).filter(Boolean))].slice(0, 5);
    if (!egg.phrases.length) throw new HttpError(400, 'Add at least one trigger word.');
    if (egg.phrases.some(p => [...p].length < 3)) throw new HttpError(400, 'Trigger words need at least 3 characters, so normal typing does not set them off.');
  }
  if (type === 'click') {
    if (!TARGETS[b.target]) throw new HttpError(400, 'Pick which element should be clicked.');
    egg.target = b.target; egg.click_count = int(b.click_count, 1, 20, 1);
  }
  if (type === 'sequence') {
    egg.sequence = (Array.isArray(b.sequence) ? b.sequence : []).filter(t => TARGETS[t]).slice(0, 6);
    if (egg.sequence.length < 2) throw new HttpError(400, 'A sequence needs at least 2 clicks.');
  }
  const steps = (Array.isArray(b.steps) ? b.steps : []).slice(0, 6).map((s, i) => ({
    id: UUID.test(s.id || '') ? s.id : null,
    position: i,
    label: clean(s.label, 80),
    caption: clean(s.caption, 300),
    media_id: UUID.test(s.media_id || '') ? s.media_id : null
  }));
  if (!egg.title && !egg.message && !steps.length) throw new HttpError(400, 'Add at least a message or an image step, otherwise nothing would show.');
  return { egg, steps };
}

async function eggSave(req, id) {
  const body = await readJson(req, 32 * 1024);
  const { egg, steps } = validateEgg(body);
  const mediaIds = steps.map(s => s.media_id).filter(Boolean);
  if (mediaIds.length) {
    const found = await q(`SELECT id FROM media WHERE id = ANY($1::uuid[])`, [mediaIds]);
    if (found.length !== new Set(mediaIds).size) throw new HttpError(400, 'One of the chosen images was deleted. Pick it again.');
  }
  if (egg.sound_id) {
    const [snd] = await q(`SELECT mime FROM media WHERE id = $1`, [egg.sound_id]);
    if (!snd || !isAudio(snd.mime)) throw new HttpError(400, 'The chosen sound is missing or is not an audio file.');
  }
  // Conflicts only matter if this egg is going to be live.
  if (egg.enabled && !bool(body.force)) {
    const all = await q(`SELECT e.id, e.name, e.trigger_type, e.phrases, e.target, e.click_count, e.sequence,
      (${ACTIVE_SQL}) AS enabled FROM eggs e`);
    const conflicts = findConflicts({ ...egg, id }, all);
    if (conflicts.length) throw new HttpError(409, 'Trigger conflict.', { conflicts });
  }
  const cols = Object.keys(egg);
  const vals = cols.map(c => egg[c]);
  let eggId = id;
  if (id) {
    const [row] = await q(`UPDATE eggs SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now()
      WHERE id = $1 RETURNING id`, [id, ...vals]);
    if (!row) throw new HttpError(404, 'That egg no longer exists.');
  } else {
    const [row] = await q(`INSERT INTO eggs (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
    eggId = row.id;
  }
  // Upsert steps, then remove the ones that were taken out.
  const kept = steps.length ? await q(`
    INSERT INTO egg_steps (id, egg_id, position, label, caption, media_id)
    SELECT COALESCE(x.id, gen_random_uuid()), $1, x.position, x.label, x.caption, x.media_id
      FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, position int, label text, caption text, media_id uuid)
    ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, label = EXCLUDED.label,
      caption = EXCLUDED.caption, media_id = EXCLUDED.media_id
      WHERE egg_steps.egg_id = EXCLUDED.egg_id
    RETURNING id`, [eggId, JSON.stringify(steps)]) : [];
  await q(`DELETE FROM egg_steps WHERE egg_id = $1 AND NOT (id = ANY($2::uuid[]))`, [eggId, kept.map(k => k.id)]);
  const [saved] = await eggRows('e.id = $1', [eggId]);
  return { egg: saved };
}

async function eggToggle(req, id) {
  const b = await readJson(req);
  const enabled = bool(b.enabled);
  if (enabled && !bool(b.force)) {
    const [egg] = await q(`SELECT * FROM eggs WHERE id = $1`, [id]);
    if (!egg) throw new HttpError(404, 'That egg no longer exists.');
    const all = await q(`SELECT e.id, e.name, e.trigger_type, e.phrases, e.target, e.click_count, e.sequence,
      (${ACTIVE_SQL}) AS enabled FROM eggs e`);
    const conflicts = findConflicts(egg, all);
    if (conflicts.length) throw new HttpError(409, 'Trigger conflict.', { conflicts });
  }
  const [row] = await q(`UPDATE eggs SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING id`, [id, enabled]);
  if (!row) throw new HttpError(404, 'That egg no longer exists.');
  const [saved] = await eggRows('e.id = $1', [id]);
  return { egg: saved };
}

/** Runs the same matching the public site uses and explains the result. */
async function eggTest(req) {
  const b = await readJson(req);
  const phrase = normPhrase(b.phrase);
  if (!phrase) throw new HttpError(400, 'Type something to test.');
  const eggs = await q(`SELECT e.id, e.name, e.phrases, (${ACTIVE_SQL}) AS live, e.enabled, e.starts_at, e.ends_at
    FROM eggs e WHERE e.trigger_type = 'keyword' ORDER BY ${ORDER_SQL}`);
  // Global typing matches when what you typed ends with a trigger; the footer prompt needs the exact word.
  const hits = eggs.filter(e => e.phrases.some(p => phrase === p || phrase.endsWith(p)));
  const live = hits.filter(e => e.live);
  return {
    phrase,
    winner: live[0] ? { id: live[0].id, name: live[0].name } : null,
    matches: hits.map(e => ({ id: e.id, name: e.name, live: e.live,
      why: e.live ? 'active' : !e.enabled ? 'disabled' : 'outside its start/end dates' }))
  };
}

// ------------------------------------------------------------------ guestbook
async function guestbookList(url) {
  const status = url.searchParams.get('status') || 'pending';
  const where = status === 'approved' ? 'approved AND NOT rejected'
    : status === 'rejected' ? 'rejected' : 'NOT approved AND NOT rejected';
  const rows = await q(`SELECT id, name, message, approved, rejected, featured, created_at
    FROM guestbook_entries WHERE ${where} ORDER BY featured DESC, created_at DESC LIMIT 200`);
  return { entries: rows };
}

async function guestbookAction(req) {
  const b = await readJson(req);
  const id = needId(b.id);
  const actions = {
    approve: `UPDATE guestbook_entries SET approved = true, rejected = false WHERE id = $1`,
    reject: `UPDATE guestbook_entries SET approved = false, rejected = true, featured = false WHERE id = $1`,
    feature: `UPDATE guestbook_entries SET featured = true, approved = true, rejected = false WHERE id = $1`,
    unfeature: `UPDATE guestbook_entries SET featured = false WHERE id = $1`,
    delete: `DELETE FROM guestbook_entries WHERE id = $1`
  };
  if (!actions[b.action]) throw new HttpError(400, 'Bad action.');
  await q(actions[b.action], [id]);
  return { ok: true };
}

// ------------------------------------------------------------------ scrapbook
async function scrapbookList() {
  const rows = await q(`SELECT se.id, se.title, se.body, to_char(se.entry_date, 'YYYY-MM-DD') AS entry_date,
      se.published, se.position, se.created_at, se.updated_at,
      COALESCE((SELECT json_agg(json_build_object('id', m.id, 'name', m.name, 'v', m.version) ORDER BY sm.position)
        FROM scrapbook_media sm JOIN media m ON m.id = sm.media_id WHERE sm.entry_id = se.id), '[]') AS media
    FROM scrapbook_entries se ORDER BY se.position ASC, se.entry_date DESC NULLS LAST, se.created_at DESC`);
  return { entries: rows.map(r => ({ ...r, media: r.media.map(m => ({ id: m.id, name: m.name, url: mediaUrl(m.id, m.v) })) })) };
}

async function scrapbookSave(req, id) {
  const b = await readJson(req, 16 * 1024);
  const title = clean(b.title, 120), body = cleanMultiline(b.body, 2000);
  if (!title && !body && !(b.media_ids || []).length) throw new HttpError(400, 'Add a title, some text or a photo.');
  const date = b.entry_date ? String(b.entry_date).slice(0, 10) : null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'The date is not valid.');
  const mediaIds = [...new Set((b.media_ids || []).filter(x => UUID.test(x)))].slice(0, 8);
  let entryId = id;
  if (id) {
    const [row] = await q(`UPDATE scrapbook_entries SET title = $2, body = $3, entry_date = $4, published = $5, updated_at = now()
      WHERE id = $1 RETURNING id`, [id, title, body, date, bool(b.published)]);
    if (!row) throw new HttpError(404, 'That entry no longer exists.');
  } else {
    const [row] = await q(`INSERT INTO scrapbook_entries (title, body, entry_date, published, position)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT min(position) - 1 FROM scrapbook_entries), 0)) RETURNING id`,
      [title, body, date, bool(b.published)]);
    entryId = row.id;
  }
  await q(`DELETE FROM scrapbook_media WHERE entry_id = $1`, [entryId]);
  if (mediaIds.length)
    await q(`INSERT INTO scrapbook_media (entry_id, media_id, position)
      SELECT $1, m.id, array_position($2::uuid[], m.id) FROM media m WHERE m.id = ANY($2::uuid[])`, [entryId, mediaIds]);
  return { ok: true, id: entryId };
}

async function scrapbookOrder(req) {
  const b = await readJson(req, 32 * 1024);
  const ids = (b.ids || []).filter(x => UUID.test(x));
  await q(`UPDATE scrapbook_entries se SET position = array_position($1::uuid[], se.id) WHERE se.id = ANY($1::uuid[])`, [ids]);
  return { ok: true };
}

// ------------------------------------------------------------------ surprise drawer
async function surpriseList() {
  const rows = await q(`SELECT si.id, si.kind, si.body, si.caption, si.enabled, si.created_at, si.media_id,
      m.name AS media_name, m.version FROM surprise_items si LEFT JOIN media m ON m.id = si.media_id
    ORDER BY si.created_at DESC`);
  return { items: rows.map(r => ({ ...r, url: r.media_id ? mediaUrl(r.media_id, r.version) : null })) };
}

async function surpriseSave(req, id) {
  const b = await readJson(req);
  const kind = b.kind === 'text' ? 'text' : 'image';
  const media_id = kind === 'image' ? (UUID.test(b.media_id || '') ? b.media_id : null) : null;
  const body = kind === 'text' ? cleanMultiline(b.body, 500) : '';
  if (kind === 'image' && !media_id) throw new HttpError(400, 'Choose an image.');
  if (kind === 'text' && !body) throw new HttpError(400, 'Write the message.');
  const args = [kind, media_id, body, clean(b.caption, 300), b.enabled === undefined ? true : bool(b.enabled)];
  if (id) {
    const [row] = await q(`UPDATE surprise_items SET kind = $2, media_id = $3, body = $4, caption = $5, enabled = $6
      WHERE id = $1 RETURNING id`, [id, ...args]);
    if (!row) throw new HttpError(404, 'That item no longer exists.');
    return { ok: true, id };
  }
  const [row] = await q(`INSERT INTO surprise_items (kind, media_id, body, caption, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING id`, args);
  return { ok: true, id: row.id };
}

// ------------------------------------------------------------------ pages (site content)
export const PAGE_KEYS = ['home', 'music', 'links', 'projects', 'journal', 'about', 'contact', 'footer'];
const UUID_G = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep page JSON to plain, bounded data: text, numbers, true/false, lists and objects. */
function cleanContent(v, depth = 0) {
  if (depth > 6) throw new HttpError(400, 'That page is nested too deeply.');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, 5000);
  if (Array.isArray(v)) {
    if (v.length > 300) throw new HttpError(400, 'One of the lists is too long (max 300 items).');
    return v.map(x => cleanContent(x, depth + 1));
  }
  if (typeof v === 'object') {
    const out = {};
    const keys = Object.keys(v);
    if (keys.length > 60) throw new HttpError(400, 'Too many fields.');
    for (const k of keys) if (/^[A-Za-z0-9_]{1,40}$/.test(k)) out[k] = cleanContent(v[k], depth + 1);
    return out;
  }
  return null;
}
function collectIds(v, set = new Set()) {
  if (typeof v === 'string' && UUID_G.test(v)) set.add(v.toLowerCase());
  else if (Array.isArray(v)) v.forEach(x => collectIds(x, set));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => collectIds(x, set));
  return set;
}
function dropIds(v, keep) {
  if (typeof v === 'string' && UUID_G.test(v)) return keep.has(v.toLowerCase()) ? v.toLowerCase() : null;
  if (Array.isArray(v)) return v.map(x => dropIds(x, keep));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropIds(x, keep)]));
  return v;
}
async function contentGet() {
  const rows = await q(`SELECT key, data, updated_at FROM site_content`);
  const ids = await q(`SELECT DISTINCT media_id FROM content_media`);
  const settings = await q(`SELECT key, value FROM site_settings`);
  return {
    content: Object.fromEntries(rows.map(r => [r.key, r.data])),
    updated: Object.fromEntries(rows.map(r => [r.key, r.updated_at])),
    media: await mediaMap(ids.map(r => r.media_id)),
    settings: Object.fromEntries(settings.map(r => [r.key, r.value]))
  };
}

async function contentPut(req, key) {
  if (!PAGE_KEYS.includes(key)) throw new HttpError(400, 'Unknown page.');
  const body = await readJson(req, 256 * 1024);
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new HttpError(400, 'Nothing to save.');
  let data = cleanContent(body.data);
  const ids = [...collectIds(data)];
  const found = ids.length ? (await q(`SELECT id FROM media WHERE id = ANY($1::uuid[])`, [ids])).map(r => r.id) : [];
  data = dropIds(data, new Set(found));
  const json = JSON.stringify(data);
  if (json.length > 200 * 1024) throw new HttpError(413, 'That page is too big to save (over 200 KB of text).');
  await q(`INSERT INTO site_content (key, data) VALUES ($1, $2::jsonb)
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [key, json]);
  await q(`DELETE FROM content_media WHERE key = $1`, [key]);
  if (found.length) await q(`INSERT INTO content_media (key, media_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [key, found]);
  // The old "Site text" settings are now part of the Home page.
  if (key === 'home') await q(`DELETE FROM site_settings`);
  return contentGet();
}

async function contentReset(key) {
  if (!PAGE_KEYS.includes(key)) throw new HttpError(400, 'Unknown page.');
  await q(`DELETE FROM site_content WHERE key = $1`, [key]);
  return contentGet();
}

// ------------------------------------------------------------------ settings
const SETTING_KEYS = ['status', 'now_listening'];
async function settingsGet() {
  const rows = await q(`SELECT key, value FROM site_settings`);
  return { settings: Object.fromEntries(rows.map(r => [r.key, r.value])) };
}
async function settingsPut(req) {
  const b = await readJson(req);
  for (const k of SETTING_KEYS) {
    if (b[k] === undefined) continue;
    const v = clean(b[k], 200);
    if (v) await q(`INSERT INTO site_settings (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k, v]);
    else await q(`DELETE FROM site_settings WHERE key = $1`, [k]);
  }
  return settingsGet();
}

// ------------------------------------------------------------------ router
export default route(async (req, res) => {
  await requireAdmin(req);
  const url = new URL(req.url, 'http://x');
  const r = url.searchParams.get('r');
  const id = url.searchParams.get('id');
  const M = req.method;
  const ok = data => send(res, 200, data);

  switch (r) {
    case 'stats': if (M === 'GET') return ok(await stats()); break;
    case 'media':
      if (M === 'GET') return ok(id ? await mediaDetail(needId(id)) : await mediaList(url));
      if (M === 'POST') return send(res, 201, await mediaUpload(req, url));
      if (M === 'PUT') return ok(await mediaReplace(req, needId(id)));
      if (M === 'PATCH') return ok(await mediaPatch(req, needId(id)));
      if (M === 'DELETE') return ok(await mediaDelete(needId(id), url));
      break;
    case 'eggs':
      if (M === 'GET') return ok(await eggList());
      if (M === 'POST') return send(res, 201, await eggSave(req, null));
      if (M === 'PUT') return ok(await eggSave(req, needId(id)));
      if (M === 'PATCH') return ok(await eggToggle(req, needId(id)));
      if (M === 'DELETE') { await q(`DELETE FROM eggs WHERE id = $1`, [needId(id)]); return ok({ ok: true }); }
      break;
    case 'egg-test': if (M === 'POST') return ok(await eggTest(req)); break;
    case 'guestbook':
      if (M === 'GET') return ok(await guestbookList(url));
      if (M === 'POST') return ok(await guestbookAction(req));
      break;
    case 'scrapbook':
      if (M === 'GET') return ok(await scrapbookList());
      if (M === 'POST') return send(res, 201, await scrapbookSave(req, null));
      if (M === 'PUT') return ok(await scrapbookSave(req, needId(id)));
      if (M === 'DELETE') { await q(`DELETE FROM scrapbook_entries WHERE id = $1`, [needId(id)]); return ok({ ok: true }); }
      break;
    case 'scrapbook-order': if (M === 'POST') return ok(await scrapbookOrder(req)); break;
    case 'surprise':
      if (M === 'GET') return ok(await surpriseList());
      if (M === 'POST') return send(res, 201, await surpriseSave(req, null));
      if (M === 'PUT') return ok(await surpriseSave(req, needId(id)));
      if (M === 'DELETE') { await q(`DELETE FROM surprise_items WHERE id = $1`, [needId(id)]); return ok({ ok: true }); }
      break;
    case 'content': {
      const key = url.searchParams.get('key');
      if (M === 'GET') return ok(await contentGet());
      if (M === 'PUT') return ok(await contentPut(req, key));
      if (M === 'DELETE') return ok(await contentReset(key));
      break;
    }
    case 'settings':
      if (M === 'GET') return ok(await settingsGet());
      if (M === 'PUT') return ok(await settingsPut(req));
      break;
    default: throw new HttpError(404, 'Unknown resource.');
  }
  throw new HttpError(405, 'Method not allowed.');
});
