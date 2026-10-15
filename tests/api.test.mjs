// End-to-end API tests. Run against a dev server with a THROWAWAY database:
//   npm run dev            (in one terminal, with .env.local pointing at a test database)
//   TEST_ADMIN_PASSWORD=... npm test
// The tests create and delete their own content (names start with "test-").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;
let cookie = '';

async function call(path, { method = 'GET', json, body, headers = {}, auth = true, csrf = true } = {}) {
  const h = { ...headers };
  if (auth && cookie) h.cookie = cookie;
  if (csrf && method !== 'GET') h['x-nikh-csrf'] = '1';
  if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
  const r = await fetch(BASE + path, { method, headers: h, body });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && process.env.ALLOW_REMOTE_TESTS !== '1')
  throw new Error('Refusing to run against ' + BASE + '. Use a local dev server with a throwaway database.');
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// Every upload gets unique bytes (trailing data after the image end), so duplicate
// detection never hands a test one of your real library images.
const unique = buf => Buffer.concat([buf, Buffer.from('test-' + Math.random())]);
const webp = () => unique(readFileSync(new URL('../seed/neuron-activation.webp', import.meta.url)));
const upload = (buf, name) => call('/api/cms?r=media&name=' + encodeURIComponent(name), { method: 'POST', body: buf, headers: { 'content-type': 'application/octet-stream' } });

test('admin endpoints refuse anonymous visitors', async () => {
  for (const r of ['stats', 'media', 'eggs', 'guestbook', 'scrapbook', 'surprise', 'settings']) {
    const res = await call('/api/cms?r=' + r, { auth: false });
    assert.equal(res.status, 401, r);
  }
  const up = await call('/api/cms?r=media', { method: 'POST', body: png1x1, auth: false, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(up.status, 401);
});

test('login: wrong password rejected, right one sets an HttpOnly cookie', async () => {
  assert.ok(PASSWORD, 'set TEST_ADMIN_PASSWORD');
  const noCsrf = await call('/api/auth', { method: 'POST', json: { action: 'login', password: PASSWORD }, csrf: false });
  assert.equal(noCsrf.status, 403);
  const bad = await call('/api/auth', { method: 'POST', json: { action: 'login', password: 'nope-nope-nope' } });
  assert.equal(bad.status, 401);
  const ok = await call('/api/auth', { method: 'POST', json: { action: 'login', password: PASSWORD } });
  assert.equal(ok.status, 200);
  const sc = ok.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
  assert.equal((await call('/api/auth')).data.authenticated, true);
  // Remove leftovers from an interrupted earlier run.
  for (const e of (await call('/api/cms?r=eggs')).data.eggs) if (e.name.startsWith('test-')) await call('/api/cms?r=eggs&id=' + e.id, { method: 'DELETE' });
  for (const m of (await call('/api/cms?r=media&q=test-')).data.media) if (m.name.startsWith('test-')) await call('/api/cms?r=media&force=1&id=' + m.id, { method: 'DELETE' });
});

test('mutations without the CSRF header or from another origin are blocked', async () => {
  const r1 = await call('/api/cms?r=settings', { method: 'PUT', json: { status: 'x' }, csrf: false });
  assert.equal(r1.status, 403);
  const r2 = await call('/api/cms?r=settings', { method: 'PUT', json: { status: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(r2.status, 403);
});

test('upload validation: rejects non-images, fakes and SVG; accepts real images', async () => {
  const txt = await upload(Buffer.from('hello, I am not an image at all, promise'), 'test-txt');
  assert.equal(txt.status, 415);
  const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'test-svg');
  assert.equal(svg.status, 415);
  const fake = await upload(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40)]), 'test-fake');
  assert.equal(fake.status, 415);
  const wrongType = await call('/api/cms?r=media&name=x', { method: 'POST', body: png1x1, headers: { 'content-type': 'image/png' } });
  assert.equal(wrongType.status, 415);
  const px = unique(png1x1);
  const ok = await upload(px, 'test-pixel');
  assert.equal(ok.status, 201);
  assert.equal(ok.data.media.width, 1);
  assert.equal(ok.data.media.mime, 'image/png');
  const dupe = await upload(px, 'test-pixel-again');
  assert.equal(dupe.data.duplicate, true);
  assert.equal(dupe.data.media.id, ok.data.media.id);
  await call('/api/cms?r=media&id=' + ok.data.media.id, { method: 'DELETE' });
});

test('cutie flow: optional empty slot, photo added later, media privacy follows usage', async () => {
  // A fresh keyword egg like "cutie": step 1 meme, step 2 empty slot.
  const meme = (await upload(webp(), 'test-meme')).data.media;
  const created = await call('/api/cms?r=eggs', { method: 'POST', json: {
    name: 'test-cutie', trigger_type: 'keyword', phrases: ['  TestCutie  '], enabled: true, style: 'card', force: true,
    steps: [{ label: 'meme', media_id: meme.id }, { label: 'Girlfriend photo', media_id: null }] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const egg = created.data.egg;
  assert.deepEqual(egg.phrases, ['testcutie']);
  assert.equal(egg.steps.length, 2);
  assert.equal(egg.steps[1].media_id, null);

  // Public config carries only a hash, never the word.
  const cfg = await call('/api/public?r=config', { auth: false });
  assert.ok(!JSON.stringify(cfg.data).includes('testcutie'));
  const pub = cfg.data.eggs.find(e => e.id === egg.id);
  assert.ok(pub && pub.keys[0].h.length === 64);

  // Reveal needs the right word; the empty slot is skipped.
  assert.equal((await call('/api/public?r=reveal', { method: 'POST', json: { id: egg.id, phrase: 'nope' }, auth: false })).status, 404);
  const rev = await call('/api/public?r=reveal', { method: 'POST', json: { id: egg.id, phrase: ' TESTCUTIE ' }, auth: false });
  assert.equal(rev.status, 200);
  assert.equal(rev.data.steps.length, 1);

  // Later: upload the photo. Before it's used anywhere, visitors can't load it.
  const photo = (await upload(unique(png1x1), 'test-photo')).data.media;
  assert.equal((await call(photo.url, { auth: false })).status, 404);
  assert.equal((await call(photo.url)).status, 200); // admin preview works

  // Select it as step 2 and save: the reveal now has meme then photo, no code change.
  const steps = egg.steps.map(s => ({ id: s.id, label: s.label, caption: s.caption, media_id: s.media_id }));
  steps[1].media_id = photo.id;
  const saved = await call('/api/cms?r=eggs&id=' + egg.id, { method: 'PUT', json: { ...egg, steps, force: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const rev2 = await call('/api/public?r=reveal', { method: 'POST', json: { id: egg.id, phrase: 'testcutie' }, auth: false });
  assert.equal(rev2.data.steps.length, 2);
  assert.ok(rev2.data.steps[1].url.includes(photo.id));
  const img = await call(photo.url, { auth: false });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');

  // Disabled eggs don't reveal and their images go private again.
  await call('/api/cms?r=eggs&id=' + egg.id, { method: 'PATCH', json: { enabled: false } });
  assert.equal((await call('/api/public?r=reveal', { method: 'POST', json: { id: egg.id, phrase: 'testcutie' }, auth: false })).status, 404);
  assert.equal((await call(photo.url, { auth: false })).status, 404);
  await call('/api/cms?r=eggs&id=' + egg.id, { method: 'PATCH', json: { enabled: true, force: true } });

  // Deleting an image in use needs confirmation, then leaves an empty slot (egg still works).
  const del = await call('/api/cms?r=media&id=' + photo.id, { method: 'DELETE' });
  assert.equal(del.status, 409);
  assert.equal(del.data.usage[0].label, 'test-cutie');
  assert.equal((await call('/api/cms?r=media&id=' + photo.id + '&force=1', { method: 'DELETE' })).status, 200);
  const rev3 = await call('/api/public?r=reveal', { method: 'POST', json: { id: egg.id, phrase: 'testcutie' }, auth: false });
  assert.equal(rev3.data.steps.length, 1);
  const after = (await call('/api/cms?r=eggs')).data.eggs.find(e => e.id === egg.id);
  assert.equal(after.steps.length, 2);
  assert.equal(after.steps[1].media_id, null);

  // Replacing an image keeps references and bumps the cache-busting version.
  const rep = await call('/api/cms?r=media&id=' + meme.id, { method: 'PUT', body: unique(png1x1), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(rep.data.media.version, 2);
  assert.equal(rep.data.usage.length, 1);

  await call('/api/cms?r=eggs&id=' + egg.id, { method: 'DELETE' });
  await call('/api/cms?r=media&id=' + meme.id, { method: 'DELETE' });
});

test('trigger conflicts are reported and resolved by priority then age', async () => {
  const a = await call('/api/cms?r=eggs', { method: 'POST', json: { name: 'test-a', trigger_type: 'keyword', phrases: ['zzbruh'], enabled: true, message: 'a', force: true } });
  const b = await call('/api/cms?r=eggs', { method: 'POST', json: { name: 'test-b', trigger_type: 'keyword', phrases: ['zzbruh'], enabled: true, message: 'b' } });
  assert.equal(b.status, 409);
  assert.ok(b.data.conflicts[0].includes('test-a'));
  const b2 = await call('/api/cms?r=eggs', { method: 'POST', json: { name: 'test-b', trigger_type: 'keyword', phrases: ['zzbruh'], enabled: true, message: 'b', priority: 5, force: true } });
  assert.equal(b2.status, 201);
  const t = await call('/api/cms?r=egg-test', { method: 'POST', json: { phrase: 'ZZBRUH' } });
  assert.equal(t.data.winner.name, 'test-b');
  const short = await call('/api/cms?r=eggs', { method: 'POST', json: { name: 'test-c', trigger_type: 'keyword', phrases: ['ab'], message: 'x' } });
  assert.equal(short.status, 400);
  await call('/api/cms?r=eggs&id=' + a.data.egg.id, { method: 'DELETE' });
  await call('/api/cms?r=eggs&id=' + b2.data.egg.id, { method: 'DELETE' });
});

test('guestbook: pending hidden, approve/reject/feature work, HTML stays text', async () => {
  const msg = '<img src=x onerror=alert(1)> test-note ' + Date.now();
  const sub = await call('/api/guestbook', { method: 'POST', json: { nm: 'test-<b>bot</b>', msg }, auth: false, headers: { 'x-forwarded-for': '10.9.' + Math.floor(Math.random() * 250) + '.1' } });
  assert.equal(sub.status, 201);
  const visible = () => call('/api/guestbook', { auth: false }).then(r => [...r.data.featured, ...r.data.entries].find(e => e.message === msg));
  assert.equal(await visible(), undefined);
  const pending = (await call('/api/cms?r=guestbook&status=pending')).data.entries.find(e => e.message === msg);
  assert.ok(pending);
  await call('/api/cms?r=guestbook', { method: 'POST', json: { id: pending.id, action: 'approve' } });
  const v = await visible();
  assert.equal(v.message, msg); // stored as plain text; the page renders it with textContent
  await call('/api/cms?r=guestbook', { method: 'POST', json: { id: pending.id, action: 'feature' } });
  assert.ok((await call('/api/guestbook', { auth: false })).data.featured.some(e => e.message === msg));
  await call('/api/cms?r=guestbook', { method: 'POST', json: { id: pending.id, action: 'reject' } });
  assert.equal(await visible(), undefined);
  await call('/api/cms?r=guestbook', { method: 'POST', json: { id: pending.id, action: 'delete' } });
  const honeypot = await call('/api/guestbook', { method: 'POST', json: { nm: 'bot', msg: 'spam', website: 'http://spam' }, auth: false });
  assert.equal(honeypot.status, 200);
});

test('scrapbook and drawer: drafts stay private, published items appear', async () => {
  const m = (await upload(webp(), 'test-scrap')).data.media;
  const e = await call('/api/cms?r=scrapbook', { method: 'POST', json: { title: 'test-entry', body: 'hi', media_ids: [m.id], published: false } });
  assert.equal(e.status, 201);
  const pubList = () => call('/api/public?r=scrapbook', { auth: false }).then(r => r.data.entries.find(x => x.title === 'test-entry'));
  assert.equal(await pubList(), undefined);
  assert.equal((await call(`/api/media?id=${m.id}&v=1`, { auth: false })).status, 404);
  await call('/api/cms?r=scrapbook&id=' + e.data.id, { method: 'PUT', json: { title: 'test-entry', body: 'hi', media_ids: [m.id], published: true } });
  assert.equal((await pubList()).images.length, 1);
  assert.equal((await call(`/api/media?id=${m.id}&v=1`, { auth: false })).status, 200);
  await call('/api/cms?r=scrapbook&id=' + e.data.id, { method: 'DELETE' });

  const s = await call('/api/cms?r=surprise', { method: 'POST', json: { kind: 'text', body: 'test-surprise', enabled: false } });
  const draws = await Promise.all(Array.from({ length: 15 }, () => call('/api/public?r=surprise', { auth: false })));
  assert.ok(!draws.some(d => d.data.item && d.data.item.body === 'test-surprise'));
  await call('/api/cms?r=surprise&id=' + s.data.id, { method: 'DELETE' });
  await call('/api/cms?r=media&id=' + m.id + '&force=1', { method: 'DELETE' });
});

test('logout ends the session on the server', async () => {
  const saved = cookie;
  assert.equal((await call('/api/auth', { method: 'POST', json: { action: 'logout' } })).status, 200);
  cookie = saved; // reuse the old cookie: must no longer work
  assert.equal((await call('/api/cms?r=stats')).status, 401);
});
