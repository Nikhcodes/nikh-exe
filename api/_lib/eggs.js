// Easter egg rules shared by the public and admin APIs.
import { createHash } from 'node:crypto';

/** Elements on the public site that click/sequence eggs can listen to (data-egg-target="..."). */
export const TARGETS = {
  logo: 'NIKH.EXE logo (top left)',
  avatar: 'The big "N" avatar on the home page',
  'welcome-tape': '"WELCOME, STRANGER" tape on the home page',
  button88: 'The 88x31 button on the Links page',
  footer: 'The footer line at the bottom of every page'
};

/** Lowercase, Unicode-normalise, collapse spaces, trim. "  CuTiE " -> "cutie" */
export const normPhrase = s =>
  String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

/** The public site only ever sees this hash, never the phrase itself. */
export const phraseHash = p => createHash('sha256').update('nikh-egg:' + normPhrase(p)).digest('hex');

export const ACTIVE_SQL = `e.enabled AND (e.starts_at IS NULL OR e.starts_at <= now()) AND (e.ends_at IS NULL OR e.ends_at > now())`;

/** Winner order when two eggs fire at once: higher priority, then the older egg. */
export const ORDER_SQL = `e.priority DESC, e.created_at ASC`;

/** Find triggers of `egg` that clash with other enabled eggs. Returns human-readable strings. */
export function findConflicts(egg, others) {
  const out = [];
  for (const o of others) {
    if (o.id === egg.id || !o.enabled) continue;
    if (egg.trigger_type === 'keyword' && o.trigger_type === 'keyword') {
      for (const a of egg.phrases) for (const b of o.phrases) {
        if (a === b) out.push(`"${a}" is also the trigger of "${o.name}".`);
        else if (a.endsWith(b)) out.push(`Typing "${a}" also types "${b}", the trigger of "${o.name}".`);
        else if (b.endsWith(a)) out.push(`Typing "${b}" (trigger of "${o.name}") also types "${a}".`);
      }
    }
    if (egg.trigger_type === 'click' && o.trigger_type === 'click' && egg.target === o.target)
      out.push(`"${o.name}" also listens to clicks on ${egg.target} (${o.click_count}x).`);
    if (egg.trigger_type === 'sequence' && o.trigger_type === 'sequence' &&
        egg.sequence.join('>') === o.sequence.join('>'))
      out.push(`"${o.name}" uses the exact same click sequence.`);
  }
  return [...new Set(out)];
}
