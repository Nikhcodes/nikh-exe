// GET /api/media?id=<uuid>&v=<version>
// Streams an image from the media library.
// Visitors only get images that are used by published content (an active egg, a published
// scrapbook entry, an enabled drawer item). Everything else is admin-only.
import { q } from './_lib/db.js';
import { isAdmin } from './_lib/auth.js';
import { ACTIVE_SQL } from './_lib/eggs.js';
import { UUID } from './_lib/http.js';

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain');
  res.end('Not found');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    const url = new URL(req.url, 'http://x');
    const id = url.searchParams.get('id') || '';
    if (!UUID.test(id)) return notFound(res);

    const [meta] = await q(`
      SELECT m.mime, m.version,
        (EXISTS (SELECT 1 FROM egg_steps s JOIN eggs e ON e.id = s.egg_id WHERE s.media_id = m.id AND ${ACTIVE_SQL})
         OR EXISTS (SELECT 1 FROM scrapbook_media sm JOIN scrapbook_entries se ON se.id = sm.entry_id
                    WHERE sm.media_id = m.id AND se.published)
         OR EXISTS (SELECT 1 FROM surprise_items si WHERE si.media_id = m.id AND si.enabled)) AS is_public
      FROM media m WHERE m.id = $1`, [id]);
    if (!meta) return notFound(res);
    const admin = meta.is_public ? false : await isAdmin(req);
    if (!meta.is_public && !admin) return notFound(res);

    const [blob] = await q(`SELECT encode(data, 'base64') AS b64 FROM media_blobs WHERE media_id = $1`, [id]);
    if (!blob) return notFound(res);
    const buf = Buffer.from(blob.b64, 'base64');

    res.statusCode = 200;
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    // Public images: browsers keep them a day (the URL changes with ?v= when an image is replaced);
    // Vercel's CDN keeps them 10 minutes, which saves database traffic. So after you switch off an
    // egg, its images can stay reachable for up to ~10 minutes. Admin-only images are never cached.
    res.setHeader('Cache-Control', meta.is_public ? 'public, max-age=86400, s-maxage=600' : 'private, no-store');
    res.end(req.method === 'HEAD' ? undefined : buf);
  } catch (e) {
    console.error('media error', e);
    res.statusCode = e && e.code === 'NO_DB' ? 503 : 500;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  }
}
