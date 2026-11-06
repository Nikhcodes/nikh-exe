// Arcade rules shared by the public arcade API and the admin.

/**
 * Score sanity limits per game. A browser game can always be cheated by someone determined;
 * these checks make it impossible to post absurd scores and slow down casual tampering:
 *  - cap:       the highest score the game can realistically produce
 *  - perSec:    the most points a human can earn per second of play (checked against server time)
 *  - minMs:     the shortest real run that can post any score
 *  - timeScore: for score-by-speed games, the score must fit the time the server saw
 */
export const GAMES = {
  nightshift: { name: 'Night Shift', cap: 6000, perSec: 10, minMs: 3000 },
  snake: { name: 'Packet Snake', cap: 397, perSec: 8, minMs: 1500 },
  match: { name: 'Crate Match', cap: 5000, minMs: 2500, timeScore: { base: 5000, perSec: 40, slack: 300 } }
};

// Three-letter combinations that are not allowed as initials (English, Dutch and common slurs),
// checked after undoing leetspeak (0→O, 1→I, 3→E, 4→A, 5→S, 7→T...).
const BLOCKED = new Set(`
ASS ARS AZZ FUK FUC FCK FKU FKN FAK FUQ FUX CUM CUN CNT KNT KKK NIG NGR NGA NGG NIK FAG FGT FAQ DIK DIC DCK DIX
COK COC KOK TIT TTS TTY SEX SXY XXX PUS PSY VAG CLT SHT SHI PIS JIZ JIS GAY GEY HOE HOR HUR SLT SLU WHR WHO RPE
RAP NAZ SSS HTL KYS KMS SUK SUC BCH BTC BIH TWT DMN DAM GOD JEW POO PEE PNS PEN BOB BOO
KUT LUL PIK KNK KKR KNR TER TYF HOR NEK
`.trim().split(/\s+/).filter(w => !['WHO', 'BOB', 'BOO', 'DAM', 'GOD', 'TER', 'NEK', 'PEN', 'PEE', 'POO', 'TTY', 'DMN'].includes(w)));

const LEET = { 0: 'O', 1: 'I', 2: 'Z', 3: 'E', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B', 9: 'G' };

/** Returns the cleaned initials, or null if they're not allowed. */
export function cleanInitials(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (s.length !== 3) return null;
  const plain = [...s].map(c => LEET[c] || c).join('');
  const variants = new Set([plain, plain.replace(/I/g, 'L'), plain.replace(/L/g, 'I'), plain.replace(/C/g, 'K'), plain.replace(/K/g, 'C'), plain.replace(/Q/g, 'K'), plain.replace(/X/g, 'K')]);
  for (const v of variants) if (BLOCKED.has(v)) return null;
  return s;
}

/** Checks a submitted score against what the server saw. Returns an error string or null. */
export function checkScore(game, score, elapsedMs) {
  const g = GAMES[game];
  if (!g) return 'Unknown game.';
  if (!Number.isInteger(score) || score < 0) return 'That score looks broken.';
  if (score > g.cap) return 'That score is beyond what this game allows.';
  if (score > 0 && elapsedMs < g.minMs) return 'That was too fast to be real.';
  if (g.perSec && score > g.perSec * (elapsedMs / 1000) + 5) return 'That score came in faster than humanly possible.';
  if (g.timeScore) {
    const t = g.timeScore;
    if (score > t.base - Math.floor(elapsedMs / 1000) * t.perSec + t.slack) return 'That score does not match the time you played.';
  }
  return null;
}
