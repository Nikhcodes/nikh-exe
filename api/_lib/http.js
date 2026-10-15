// Small helpers shared by every API route.
import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

/** Read the raw request body (up to `limit` bytes) as a Buffer. */
export async function readBody(req, limit) {
  // Vercel buffers the body and exposes it as req.body (Buffer for
  // application/octet-stream, object for JSON). A plain Node server does not.
  const pre = req.body;
  if (pre !== undefined && pre !== null) {
    const buf = Buffer.isBuffer(pre) ? pre : Buffer.from(typeof pre === 'string' ? pre : JSON.stringify(pre));
    if (buf.length > limit) throw new HttpError(413, `Too large. The limit is ${Math.round(limit / 1024 / 1024 * 10) / 10} MB.`);
    return buf;
  }
  if (req.readableEnded) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, `Too large. The limit is ${Math.round(limit / 1024 / 1024 * 10) / 10} MB.`);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit = 64 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(ip + (process.env.IP_SALT || '')).digest('hex');
}

/** Same-origin check for state-changing requests. */
export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

/** Collapse control chars + whitespace, trim, cap length. */
export const clean = (s, max) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Like clean() but keeps line breaks (for longer text such as notes). */
export const cleanMultiline = (s, max) =>
  String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wrap a handler with uniform error handling. */
export function route(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
      if (e && e.code === 'NO_DB') return send(res, 503, { error: 'The database is not configured on this deployment.' });
      if (e && e.code === '23514') return send(res, 400, { error: 'One of the values is too long or not allowed.' });
      if (e && e.code === '23505') return send(res, 409, { error: 'That name is already taken.' });
      console.error('api error', e);
      send(res, 500, { error: 'Server error.' });
    }
  };
}
