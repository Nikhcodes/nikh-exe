// The Arcade: game runs, scores and leaderboards. No accounts: players leave 3-letter initials.
//   POST ?r=start  {game}                              -> {run}      a ticket for one game run
//   POST ?r=score  {run, initials, score, duration}    -> {rank, board}
//   GET  ?r=boards                                     -> top 10 per game
//   GET  ?r=pool                                       -> pictures for Crate Match (junk drawer images)
import { q } from './_lib/db.js';
import { route, send, readJson, HttpError, UUID, sameOrigin, ipHash } from './_lib/http.js';
import { GAMES, cleanInitials, checkScore } from './_lib/arcade.js';
import { mediaUrl } from './_lib/media.js';

const BOARD = 10;
const RUN_TTL_MIN = 120;

async function boards() {
  const rows = await q(`SELECT game, initials, score, created_at FROM (
      SELECT game, initials, score, created_at,
        row_number() OVER (PARTITION BY game ORDER BY score DESC, created_at ASC) AS rn
      FROM arcade_scores WHERE NOT hidden) t
    WHERE rn <= $1 ORDER BY game, rn`, [BOARD]);
  const out = Object.fromEntries(Object.keys(GAMES).map(g => [g, []]));
  for (const r of rows) if (out[r.game]) out[r.game].push({ initials: r.initials, score: r.score, at: r.created_at });
  return out;
}

async function start(req) {
  if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
  const b = await readJson(req, 1024);
  if (!GAMES[b.game]) throw new HttpError(400, 'Unknown game.');
  const ip = ipHash(req);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM arcade_runs WHERE ip_hash = $1 AND started_at > now() - interval '1 hour'`, [ip]);
  if (n >= 150) throw new HttpError(429, 'Take a break! Too many games from your network this hour.');
  if (Math.random() < 0.05) await q(`DELETE FROM arcade_runs WHERE started_at < now() - interval '1 day'`);
  const [run] = await q(`INSERT INTO arcade_runs (game, ip_hash) VALUES ($1, $2) RETURNING id`, [b.game, ip]);
  return { run: run.id };
}

async function score(req) {
  if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
  const b = await readJson(req, 2048);
  if (!UUID.test(b.run || '')) throw new HttpError(400, 'Missing game ticket. Refresh and play again.');
  const initials = cleanInitials(b.initials);
  if (!initials) throw new HttpError(400, 'Those initials are not allowed. Pick three different letters.');
  const ip = ipHash(req);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM arcade_scores WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`, [ip]);
  if (n >= 40) throw new HttpError(429, 'That is a lot of high scores. Try again in a bit.');
  // Claim the ticket atomically: it must exist, be unused, be recent and belong to this network.
  const [run] = await q(`UPDATE arcade_runs SET used = true
      WHERE id = $1 AND NOT used AND ip_hash = $2 AND started_at > now() - make_interval(mins => $3)
      RETURNING game, (extract(epoch FROM (now() - started_at)) * 1000)::bigint AS elapsed`, [b.run, ip, RUN_TTL_MIN]);
  if (!run) throw new HttpError(400, 'That game ticket is used up or expired. Play another round!');
  const points = Number(b.score);
  const problem = checkScore(run.game, points, Number(run.elapsed));
  if (problem) throw new HttpError(400, problem);
  const duration = Math.min(Number(run.elapsed), Math.max(0, Math.round(Number(b.duration) || 0)));
  await q(`INSERT INTO arcade_scores (game, initials, score, duration_ms, ip_hash) VALUES ($1, $2, $3, $4, $5)`,
    [run.game, initials, points, duration, ip]);
  const [{ rank }] = await q(`SELECT count(*)::int + 1 AS rank FROM arcade_scores
    WHERE game = $1 AND NOT hidden AND score > $2`, [run.game, points]);
  return { rank, initials, board: (await boards())[run.game] };
}

async function pool() {
  const rows = await q(`SELECT m.id, m.version, m.alt FROM surprise_items si JOIN media m ON m.id = si.media_id
    WHERE si.enabled AND si.kind = 'image' AND m.mime LIKE 'image/%' ORDER BY random() LIMIT 12`);
  return { images: rows.map(r => ({ url: mediaUrl(r.id, r.version), alt: r.alt })) };
}

export default route(async (req, res) => {
  const r = new URL(req.url, 'http://x').searchParams.get('r');
  if (req.method === 'GET' && r === 'boards') return send(res, 200, await boards());
  if (req.method === 'GET' && r === 'pool') return send(res, 200, await pool());
  if (req.method === 'POST' && r === 'start') return send(res, 200, await start(req));
  if (req.method === 'POST' && r === 'score') return send(res, 200, await score(req));
  throw new HttpError(404, 'Unknown request.');
});
