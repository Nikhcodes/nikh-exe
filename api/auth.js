// POST {action:'login', password}  -> sets the session cookie
// POST {action:'logout'}           -> ends the session
// GET                              -> {authenticated, configured}
import { route, readJson, send, sameOrigin, ipHash, HttpError } from './_lib/http.js';
import { isAdmin, verifyPassword, startSession, endSession, tooManyFailures, recordFailure, passwordConfigured } from './_lib/auth.js';

export default route(async (req, res) => {
  if (req.method === 'GET') {
    return send(res, 200, { authenticated: await isAdmin(req), configured: passwordConfigured() });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Method not allowed.'); }
  if (!sameOrigin(req) || req.headers['x-nikh-csrf'] !== '1') throw new HttpError(403, 'Blocked: cross-site request.');

  const body = await readJson(req, 4096);
  if (body.action === 'logout') {
    await endSession(req, res);
    return send(res, 200, { ok: true });
  }
  if (body.action !== 'login') throw new HttpError(400, 'Bad action.');
  if (!passwordConfigured()) throw new HttpError(503, 'ADMIN_PASSWORD_HASH is not set on the server. See README, "Admin login".');

  const ip = ipHash(req);
  if (await tooManyFailures(ip)) throw new HttpError(429, 'Too many wrong passwords. Wait 15 minutes and try again.');
  const password = String(body.password || '').slice(0, 200);
  if (!password || !verifyPassword(password, process.env.ADMIN_PASSWORD_HASH)) {
    await recordFailure(ip);
    throw new HttpError(401, 'Wrong password.');
  }
  await startSession(req, res);
  send(res, 200, { ok: true });
});
