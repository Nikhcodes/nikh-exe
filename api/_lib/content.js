// Shared helper: turn media ids into what the pages need to show them.
import { q } from './db.js';
import { mediaUrl } from './media.js';

export async function mediaMap(ids) {
  if (!ids.length) return {};
  const rows = await q(`SELECT id, name, alt, mime, width, height, version FROM media WHERE id = ANY($1::uuid[])`, [ids]);
  return Object.fromEntries(rows.map(m => [m.id, { url: mediaUrl(m.id, m.version), w: m.width, h: m.height, alt: m.alt, name: m.name, mime: m.mime }]));
}
