// Local development server: serves the static site and runs /api/*.js the way Vercel does.
//   npm run dev          (reads .env.local if present)
// Not used in production; Vercel runs the /api files itself.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env.local loader (KEY=value per line, # comments)
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const headers = vercel.headers?.[0]?.headers || [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const BLOCKED = /^\/(api|scripts|node_modules|\.git|\.env)/;

const server = http.createServer(async (req, res) => {
  for (const h of headers) res.setHeader(h.key, h.value);
  const url = new URL(req.url, 'http://localhost');
  try {
    const m = url.pathname.match(/^\/api\/([a-z-]+)$/);
    if (m) {
      const file = path.join(root, 'api', m[1] + '.js');
      if (!existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
      // Vercel-style helpers
      res.status = c => { res.statusCode = c; return res; };
      res.json = d => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); return res; };
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    if (BLOCKED.test(p) || p.includes('..')) { res.statusCode = 404; return res.end('Not found'); }
    const file = path.join(root, p);
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Server error');
  }
});

const port = +(process.env.PORT || 3000);
server.listen(port, () => console.log(`NIKH.EXE dev server on http://localhost:${port}`));
