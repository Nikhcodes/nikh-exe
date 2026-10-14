import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);
const MAX_PER_HOUR = 3;

const clean = (s, max) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT name, message, created_at FROM guestbook_entries
        WHERE approved = true ORDER BY created_at DESC LIMIT 50`;
      return res.status(200).json({ entries: rows });
    }

    if (req.method === 'POST') {
      // Same-origin only
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host)
        return res.status(403).json({ error: 'Not allowed.' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
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
