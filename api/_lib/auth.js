// Admin authentication: one password (stored only as a scrypt hash in an env var),
// exchanged for a random session token in an HttpOnly cookie. Sessions live in the DB
// so logging out really ends them.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { sql } from './db.js';
import { HttpError, sameOrigin } from './http.js';

const COOKIE = 'nikh_admin';
const SESSION_HOURS = 8;
const MAX_FAILS = 5;            // per IP
const FAIL_WINDOW_MIN = 15;

const sha = s => createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString('base64')}:${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const got = scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length,
    { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function cookieHeader(req, value, maxAge) {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local ? '' : '; Secure'}`;
}

export async function tooManyFailures(ipHash) {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM login_attempts
    WHERE ip_hash = ${ipHash} AND created_at > now() - make_interval(mins => ${FAIL_WINDOW_MIN})`;
  return n >= MAX_FAILS;
}
export async function recordFailure(ipHash) {
  await sql`INSERT INTO login_attempts (ip_hash) VALUES (${ipHash})`;
  await sql`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`;
}

export async function startSession(req, res) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO admin_sessions (token_hash, expires_at)
    VALUES (${sha(token)}, now() + make_interval(hours => ${SESSION_HOURS}))`;
  await sql`DELETE FROM admin_sessions WHERE expires_at < now()`;
  res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_HOURS * 3600));
}

export async function endSession(req, res) {
  const token = readCookie(req);
  if (token) await sql`DELETE FROM admin_sessions WHERE token_hash = ${sha(token)}`;
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

/** True when the request carries a valid, unexpired admin session cookie. */
export async function isAdmin(req) {
  const token = readCookie(req);
  if (!token || token.length > 100) return false;
  const rows = await sql`SELECT 1 FROM admin_sessions WHERE token_hash = ${sha(token)} AND expires_at > now()`;
  return rows.length > 0;
}

/**
 * Gate for every admin API call. Mutations also need the custom CSRF header,
 * which a foreign site cannot send without a CORS preflight we never approve.
 */
export async function requireAdmin(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['x-nikh-csrf'] !== '1' || !sameOrigin(req)) throw new HttpError(403, 'Blocked: cross-site request.');
  }
  if (!(await isAdmin(req))) throw new HttpError(401, 'Please log in again.');
}

export function passwordConfigured() {
  return String(process.env.ADMIN_PASSWORD_HASH || '').startsWith('scrypt:');
}
