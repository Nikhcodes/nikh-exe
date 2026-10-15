import { sql } from './_lib/db.js';
import { readJson } from './_lib/http.js';
import { createHash } from 'node:crypto';

const MAX_PER_HOUR = 3;

const clean = (s, max) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      // ?before=<ISO date> pages backwards through older notes. Pinned notes come once, on the first page.
      const PAGE = 24;
      const raw = new URL(req.url, 'http://x').searchParams.get('before');
      const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
      const rows = before
        ? await sql`SELECT left(id::text, 8) AS k, name, message, created_at FROM guestbook_entries
            WHERE approved AND NOT rejected AND NOT featured AND created_at < ${before}
            ORDER BY created_at DESC LIMIT ${PAGE + 1}`
        : await sql`SELECT left(id::text, 8) AS k, name, message, created_at FROM guestbook_entries
            WHERE approved AND NOT rejected AND NOT featured
            ORDER BY created_at DESC LIMIT ${PAGE + 1}`;
      const featured = before ? [] : await sql`SELECT left(id::text, 8) AS k, name, message, created_at
        FROM guestbook_entries WHERE approved AND NOT rejected AND featured ORDER BY created_at DESC LIMIT 6`;
      const more = rows.length > PAGE;
      return res.status(200).json({ featured, entries: rows.slice(0, PAGE), more });
    }

    if (req.method === 'POST') {
      // Same-origin only
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host)
        return res.status(403).json({ error: 'Not allowed.' });

      const body = await readJson(req);
      if (body.website) return res.status(200).json({ ok: true }); // honeypot: pretend success

      const name = clean(body.nm ?? body.name, 40);
      const message = clean(body.msg ?? body.message, 500);
      if (!name || !message) return res.status(400).json({ error: 'Name and message are required.' });

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const ipHash = createHash('sha256').update(ip + (process.env.IP_SALT || '')).digest('hex');

      const [{ n }] = await sql`
        SELECT count(*)::int AS n FROM guestbook_entries
        WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`;
      if (n >= MAX_PER_HOUR) return res.status(429).json({ error: 'Slow down a bit. Try again later.' });

      await sql`INSERT INTO guestbook_entries (name, message, ip_hash) VALUES (${name}, ${message}, ${ipHash})`;
      return res.status(201).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('guestbook error', e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
