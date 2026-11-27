// Serves index.html for a page address (/about, /projects/rigsight, /journal/<entry>) with that page's
// title, description and link-preview tags filled in, so shared links show a proper card.
// Safety net: if anything here fails, the plain index.html is returned unchanged.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { q } from './db.js';
import { mediaUrl } from './media.js';

let shell = null, defaults = null;
const root = () => process.cwd();
// The files sit at the project root locally and on Vercel (included with the function in vercel.json).
const read = rel => { try { return readFileSync(path.join(root(), rel), 'utf8'); } catch { return readFileSync(new URL('../../' + rel, import.meta.url), 'utf8'); } };
function load() {
  if (!process.env.VERCEL) shell = defaults = null; // locally, always read the latest files
  if (!shell) shell = read('index.html');
  if (!defaults) {
    try {
      const sandbox = { window: {} };
      vm.runInNewContext(read('assets/content.js'), sandbox, { timeout: 200 });
      defaults = sandbox.window.NIKH_DEFAULTS || {};
    } catch { defaults = {}; }
  }
}

// Must match slugify() in index.html.
export const slugify = t => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'entry';
const attr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n = 180) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

const LABELS = { about: 'About', projects: 'Projects', journal: 'Journal', scrapbook: 'Scrapbook', links: 'Links', guestbook: 'Guestbook',
  music: 'Music', arcade: 'Arcade', contact: 'Contact', hire: 'Hire me', status: 'Under the hood' };

async function content() {
  const saved = {};
  try { for (const r of await q(`SELECT key, data FROM site_content`)) saved[r.key] = r.data; } catch { /* no database: defaults only */ }
  const S = k => Object.assign({}, defaults[k] || {}, saved[k] || {});
  return S;
}

async function imageFor(id) {
  if (!id) return null;
  try { const [m] = await q(`SELECT id, version, mime FROM media WHERE id = $1 AND mime LIKE 'image/%'`, [id]); return m ? mediaUrl(m.id, m.version) : null; }
  catch { return null; }
}

/** Slugs of projects that have a case study (saved ones, plus starter case studies matched by name). */
export async function caseStudySlugs() {
  load();
  const S = await content(), D = (defaults.projects || {}).projects || [];
  return (S('projects').projects || []).filter(p => p.csProblem || D.some(d => d.name === p.name && d.csProblem)).map(p => slugify(p.name));
}

/** Works out the meta tags for a path. Returns { title, description, image, noindex }. */
export async function metaFor(p) {
  load();
  const S = await content();
  const name = S('home').name || 'Nikhiel Lingard';
  const [first, second] = String(p || '/').replace(/^\/+|\/+$/g, '').split('/').map(x => decodeURIComponent(x || ''));
  const base = { title: `${name} | NIKH.EXE`, description: S('home').blurb || '', image: null };
  if (!first) return base;
  if (!LABELS[first]) return { title: `Not found | NIKH.EXE`, description: base.description, noindex: true };
  if (first === 'arcade' && second === 'hall') return { title: `Hall of fame | ${name}`, description: 'The podium for every game in the NIKH.EXE arcade: this week and all time.' };
  if (first === 'projects' && second) {
    const D = (defaults.projects || {}).projects || [];
    const pr0 = (S('projects').projects || []).find(x => slugify(x.name) === second);
    const d = pr0 && D.find(x => x.name === pr0.name);
    const pr = pr0 && (pr0.csProblem || !d ? pr0 : { ...pr0, csProblem: d.csProblem });
    if (pr && !pr.csProblem) return { title: 'Not found | NIKH.EXE', description: base.description, noindex: true };
    if (!pr) return { title: 'Not found | NIKH.EXE', description: base.description, noindex: true };
    return { title: `${pr.name}: case study | NIKH.EXE`, description: clip(pr.csProblem || pr.description), image: await imageFor(pr.image) };
  }
  if (first === 'journal' && second) {
    const seen = {};
    const e = (S('journal').entries || []).find(x => { let s = slugify(x.title); seen[s] = (seen[s] || 0) + 1; if (seen[s] > 1) s += '-' + seen[s]; return s === second; });
    if (e) return { title: `${e.title} | NIKH.EXE journal`, description: clip(e.body) };
  }
  const intro = { about: S('about').lede, projects: S('projects').intro, journal: S('journal').intro, music: S('music').intro, links: S('links').intro,
    contact: S('contact').intro, arcade: S('arcade').intro, hire: S('hire').headline, status: 'How this site is built: a hand-written front end, a CMS and five games on serverless functions and Postgres.',
    guestbook: 'Pin a note to the board.', scrapbook: 'Photos, small memories and other things worth keeping.' }[first];
  const title = { about: S('about').title, hire: S('hire').title }[first] || LABELS[first];
  return { title: `${title} | ${name}`, description: clip(intro || base.description) };
}

/** Writes the page. Never throws: worst case the plain shell goes out. */
export async function servePage(req, res, p) {
  let html;
  try {
    load(); html = shell;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const origin = host ? `https://${host}` : '';
    const m = await metaFor(p);
    const url = origin + (p || '/');
    const img = origin + (m.image || '/assets/og.png');
    const tags = `<title>${attr(m.title)}</title>
<meta name="description" content="${attr(m.description)}">
<link rel="canonical" href="${attr(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NIKH.EXE">
<meta property="og:title" content="${attr(m.title)}"><meta property="og:description" content="${attr(m.description)}">
<meta property="og:url" content="${attr(url)}"><meta property="og:image" content="${attr(img)}">
<meta name="twitter:card" content="summary_large_image">${m.noindex ? '\n<meta name="robots" content="noindex">' : ''}`;
    html = html.replace(/<!-- meta -->[\s\S]*?<!-- \/meta -->/, `<!-- meta -->\n${tags}\n<!-- /meta -->`);
  } catch (e) {
    console.error('page meta failed', e);
    try { load(); html = shell; } catch { html = null; }
  }
  if (!html) { res.statusCode = 500; return res.end('Server error'); }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.end(html);
}
