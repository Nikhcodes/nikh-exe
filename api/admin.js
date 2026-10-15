import { sql } from './_lib/db.js';
import { readJson } from './_lib/http.js';
import { timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(req) {
  const token = process.env.ADMIN_TOKEN || '';
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token.length < 16) return false; // refuse to run with a weak/missing token
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, message, approved, created_at FROM guestbook_entries
        ORDER BY approved ASC, created_at DESC LIMIT 100`;
      return res.status(200).json({ entries: rows });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!UUID.test(body.id || '')) return res.status(400).json({ error: 'Bad id.' });
      if (body.action === 'approve') await sql`UPDATE guestbook_entries SET approved = true WHERE id = ${body.id}`;
      else if (body.action === 'delete') await sql`DELETE FROM guestbook_entries WHERE id = ${body.id}`;
      else return res.status(400).json({ error: 'Bad action.' });
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('admin error', e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
