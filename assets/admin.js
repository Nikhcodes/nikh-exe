/* NIKH.EXE admin panel. Talks only to /api/auth and /api/cms (both enforce auth on the server).
 * Nothing here is secret: hiding this file would not protect anything, the server checks do. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const main = $('#main');

  // ---------------------------------------------------------------- tiny DOM helper
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }
  const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const fmtDate = d => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const toLocalInput = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 7000 : 3000);
  }

  // ---------------------------------------------------------------- API
  class ApiError extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }
  async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
    const hd = { ...headers };
    if (method !== 'GET') hd['X-NIKH-CSRF'] = '1';
    if (json !== undefined) { hd['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    let r;
    try { r = await fetch('/api/' + path, { method, headers: hd, body, credentials: 'same-origin' }); }
    catch { throw new ApiError('Could not reach the server. Check your connection.', 0, {}); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('auth')) { showLogin('Your session ended. Please log in again.'); throw new ApiError('Logged out', 401, d); }
    if (!r.ok) throw new ApiError(d.error || `Something went wrong (${r.status}).`, r.status, d);
    return d;
  }
  const cms = (q, opts) => api('cms?' + q, opts);
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { if (e.status !== 401) toast(e.message, true); return undefined; }
    finally { if (btn) btn.disabled = false; }
  }

  // ---------------------------------------------------------------- images: resize in the browser, then upload
  const MAX_EDGE = 1600, MAX_BYTES = 3.9 * 1024 * 1024;
  async function prepareImage(file) {
    if (!/^image\//.test(file.type)) throw new Error(`"${file.name}" is not an image.`);
    if (file.type === 'image/svg+xml') throw new Error('SVG files are not accepted (they can contain scripts). Export it as PNG first.');
    if (file.type === 'image/gif') {
      if (file.size > MAX_BYTES) throw new Error('GIFs must be under 4 MB (animated GIFs are uploaded as they are).');
      return file;
    }
    if (file.size > 40 * 1024 * 1024) throw new Error('That file is over 40 MB. Pick a smaller photo.');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      throw new Error(/heic|heif/i.test(file.type + file.name)
        ? 'This browser cannot read HEIC photos. On iPhone: Settings > Camera > Formats > Most Compatible, or share the photo as JPEG.'
        : `Could not read "${file.name}". Try saving it as JPEG or PNG.`);
    }
    // Re-encoding also strips metadata such as GPS location from phone photos.
    let edge = MAX_EDGE, quality = 0.86, blob;
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/webp', quality));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_BYTES) break;
      edge = Math.round(edge * 0.8); quality -= 0.08;
    }
    bmp.close && bmp.close();
    if (!blob || blob.size > MAX_BYTES) throw new Error('Could not make that image small enough. Try a smaller photo.');
    return blob;
  }
  const isAudioFile = f => /^audio\//.test(f.type) || /\.(mp3|ogg|oga|wav|m4a)$/i.test(f.name);
  const isAudioMedia = m => String(m && m.mime).startsWith('audio/');
  async function prepareFile(file) {
    if (isAudioFile(file)) {
      if (file.size > MAX_BYTES) throw new Error('Sounds must be under 4 MB. A short clip (a few seconds) is best.');
      return file;
    }
    return prepareImage(file);
  }
  async function uploadFile(file, extra = {}) {
    const blob = await prepareFile(file);
    const name = (extra.name || file.name.replace(/\.[^.]+$/, '') || 'Untitled image').slice(0, 120);
    const qs = new URLSearchParams({ r: 'media', name, tags: (extra.tags || []).join(',') });
    const d = await api('cms?' + qs, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
    if (d.duplicate) toast(`"${d.media.name}" is already in the library, so it was reused.`);
    return d.media;
  }
  async function replaceFile(id, file) {
    const blob = await prepareFile(file);
    return api('cms?r=media&id=' + id, { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
  }
  const ACCEPT = {
    image: 'image/jpeg,image/png,image/webp,image/gif,image/heic',
    audio: 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a'
  };
  function filePicker(multiple, kind = 'image') {
    return new Promise(resolve => {
      const i = h('input', { type: 'file', accept: kind === 'any' ? ACCEPT.image + ',' + ACCEPT.audio : ACCEPT[kind], multiple: multiple || null, hidden: true });
      i.onchange = () => { resolve([...i.files]); i.remove(); };
      document.body.append(i); i.click();
    });
  }

  /** Small preview for a library item: the image, or a note icon for sounds. */
  const thumb = m => isAudioMedia(m) ? h('span', { class: 'aud', 'aria-hidden': 'true' }, '♪') : h('img', { src: m.url, alt: '', loading: 'lazy' });
  const dims = m => isAudioMedia(m) ? `sound · ${fmtBytes(m.bytes)}` : `${m.width}×${m.height}`;

  // ---------------------------------------------------------------- modal helper
  function modal(title, body, { wide = true } = {}) {
    const close = h('button', { class: 'btn ghost sm', type: 'button' }, 'Close');
    const dlg = h('dialog', { class: 'modal', 'aria-label': title, style: wide ? null : 'width:min(96vw,520px)' },
      h('div', { class: 'mh' }, h('span', { class: 'grow' }, title), close), h('div', { class: 'mb' }, body));
    close.onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
    return dlg;
  }
  function confirmBox(title, text, okLabel = 'Yes, do it', danger = true) {
    return new Promise(resolve => {
      let done = false;
      const ok = h('button', { class: danger ? 'btn danger' : 'btn', type: 'button' }, okLabel);
      const no = h('button', { class: 'btn ghost', type: 'button' }, 'Cancel');
      const dlg = modal(title, [typeof text === 'string' ? h('p', {}, text) : text, h('div', { class: 'row' }, ok, no)], { wide: false });
      ok.onclick = () => { done = true; dlg.close(); resolve(true); };
      no.onclick = () => dlg.close();
      dlg.addEventListener('close', () => { if (!done) resolve(false); });
      no.focus();
    });
  }

  /** Media library picker. Resolves with an array of chosen media (or [] if cancelled). */
  function pickMedia({ multiple = false, title = 'Choose an image', kind = 'image' } = {}) {
    const word = kind === 'audio' ? 'sound' : 'image';
    return new Promise(resolve => {
      const chosen = new Map();
      let resolved = false;
      const grid = h('div', { class: 'mgrid' });
      const search = h('input', { type: 'search', placeholder: 'Search by name, caption or tag', 'aria-label': 'Search images' });
      const status = h('p', { class: 'mono small muted' });
      const useBtn = h('button', { class: 'btn', type: 'button', disabled: true }, multiple ? 'Use selected' : 'Use this ' + word);
      const upBtn = h('button', { class: 'btn ghost', type: 'button' }, '↑ Upload new ' + word);
      const body = [
        h('div', { class: 'row', style: 'margin-bottom:12px' }, upBtn, h('div', { style: 'flex:1;min-width:180px' }, search)),
        h('p', { class: 'mono small muted' }, 'New uploads stay private until you use them in something that is live.'),
        status, grid, h('div', { class: 'row', style: 'margin-top:14px;position:sticky;bottom:-16px;background:var(--char);padding:10px 0' }, useBtn)
      ];
      const dlg = modal(title, body);
      const finish = list => { resolved = true; dlg.close(); resolve(list); };
      dlg.addEventListener('close', () => { if (!resolved) resolve([]); });
      async function load() {
        status.textContent = 'Loading…';
        const d = await guard(null, () => cms(`r=media&kind=${kind}&q=` + encodeURIComponent(search.value)));
        if (!d) return;
        status.textContent = d.media.length ? '' : `No ${word}s yet. Upload one.`;
        grid.replaceChildren(...d.media.map(m => {
          const b = h('button', { class: 'mcard', type: 'button', 'aria-pressed': chosen.has(m.id) ? 'true' : 'false' },
            thumb(m), h('span', { class: 'nm' }, m.name),
            h('span', { class: 'muted' }, `${dims(m)} · ${m.uses ? 'used ' + m.uses + '×' : 'unused'}`));
          b.onclick = () => {
            if (!multiple) { chosen.clear(); grid.querySelectorAll('.mcard').forEach(x => x.setAttribute('aria-pressed', 'false')); }
            if (chosen.has(m.id)) { chosen.delete(m.id); b.setAttribute('aria-pressed', 'false'); }
            else { chosen.set(m.id, m); b.setAttribute('aria-pressed', 'true'); }
            useBtn.disabled = !chosen.size;
          };
          b.ondblclick = () => { if (!multiple) finish([m]); };
          return b;
        }));
      }
      let t; search.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
      useBtn.onclick = () => finish([...chosen.values()]);
      upBtn.onclick = async () => {
        const files = await filePicker(multiple, kind);
        if (!files.length) return;
        const done = [];
        await guard(upBtn, async () => {
          for (const f of files) { status.textContent = `Uploading ${f.name}…`; done.push(await uploadFile(f)); }
        });
        status.textContent = '';
        if (done.length) { toast(done.length > 1 ? `${done.length} images uploaded.` : 'Image uploaded.'); finish(done); }
      };
      load();
    });
  }

  // ---------------------------------------------------------------- auth screens
  function showLogin(msg) {
    $('#tabs').hidden = true; $('#logout').hidden = true;
    const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
    const out = h('p', { class: 'mono small', role: 'alert' }, msg || '');
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Log in');
    const form = h('form', { class: 'panel' },
      h('h2', {}, 'Log in'),
      h('label', { class: 'f', for: 'pw' }, 'Admin password', pw),
      h('div', { class: 'row', style: 'margin-top:12px' }, btn), out);
    form.onsubmit = async e => {
      e.preventDefault(); out.textContent = '';
      await guard(btn, async () => {
        try { await api('auth', { method: 'POST', json: { action: 'login', password: pw.value } }); }
        catch (err) { out.textContent = err.message; pw.select(); return; }
        boot();
      });
    };
    main.replaceChildren(h('div', { class: 'login' }, h('span', { class: 'tape' }, 'STAFF ONLY'), h('h1', { style: 'margin:12px 0 0' }, 'Back office'), form));
    pw.focus();
  }
  $('#logout').onclick = async () => {
    await guard($('#logout'), () => api('auth', { method: 'POST', json: { action: 'logout' } }));
    location.hash = ''; showLogin('Logged out.');
  };

  // ---------------------------------------------------------------- routing
  const SECTIONS = [['dashboard', 'Dashboard'], ['eggs', 'Easter eggs'], ['media', 'Media'], ['guestbook', 'Guestbook'],
    ['pages', 'Pages'], ['scrapbook', 'Scrapbook'], ['drawer', 'Junk drawer']];
  let stats = null;
  function renderTabs(cur) {
    $('#tabs').replaceChildren(...SECTIONS.map(([k, label]) => h('a', { href: '#' + k, 'aria-current': k === cur ? 'page' : null },
      label, k === 'guestbook' && stats && stats.guestbook_pending ? h('span', { class: 'badge' }, stats.guestbook_pending) : null)));
  }
  async function refreshStats() { stats = await cms('r=stats').catch(() => stats); return stats; }
  let lastHash = location.hash;
  async function router() {
    if (pagesDirty && location.hash !== lastHash) {
      if (!confirm('You have unsaved changes on this page. Leave without saving?')) { history.replaceState(null, '', lastHash || '#pages'); return; }
      pagesDirty = false;
    }
    lastHash = location.hash;
    const [sec, arg] = (location.hash.slice(1) || 'dashboard').split('/');
    const view = VIEWS[sec] ? sec : 'dashboard';
    renderTabs(view);
    main.replaceChildren(h('p', { class: 'mono' }, 'Loading…'));
    try { await VIEWS[view](arg); } catch (e) { if (e.status !== 401) main.replaceChildren(h('div', { class: 'note warn' }, e.message)); }
    window.scrollTo(0, 0);
  }
  addEventListener('hashchange', router);
  const page = (tape, title, intro, ...rest) => main.replaceChildren(...[h('span', { class: 'tape' }, tape), h('h1', { style: 'margin:10px 0 6px' }, title),
    intro ? h('p', { class: 'muted', style: 'max-width:70ch;margin:0' }, intro) : null, ...rest].filter(Boolean));

  // ---------------------------------------------------------------- views
  const VIEWS = {};

  VIEWS.dashboard = async () => {
    const s = await refreshStats(); renderTabs('dashboard');
    const eggs = (await cms('r=eggs')).eggs;
    const empty = eggs.flatMap(e => e.steps.filter(st => !st.media_id).map(st => ({ egg: e, step: st })));
    const stat = (n, label, href) => h('a', { class: 'stat', href }, h('b', {}, n), h('span', {}, label));
    const starter = h('div', { class: 'panel' }, h('h2', {}, 'Starter pack'),
      h('p', { style: 'margin-top:0' }, s.media
        ? 'Re-run the starter pack import to add anything new (new versions of the site can bring new eggs). Anything you already have is skipped, and your changes are kept.'
        : 'Your library is empty. Import the starter pack: the images that came with the site, the "cutie" egg (with the neuron meme and an empty photo slot), the original "jam" egg, a few extra eggs and the junk drawer items.'),
      h('button', { class: s.media ? 'btn ghost' : 'btn', type: 'button', onclick: e => importStarter(e.currentTarget) }, s.media ? 'Re-run import' : 'Import starter pack'),
      h('p', { class: 'mono small', id: 'starter-out' }));
    page('BACK OFFICE', 'Dashboard', null,
      h('div', { class: 'stats', style: 'margin-top:18px' },
        stat(s.eggs_active, 'live Easter eggs', '#eggs'), stat(s.eggs_inactive, 'eggs switched off', '#eggs'),
        stat(s.guestbook_pending, 'notes waiting for you', '#guestbook'), stat(s.media, `images (${fmtBytes(s.media_bytes || 1)})`, '#media'),
        stat(`${s.scrapbook_published}/${s.scrapbook}`, 'scrapbook entries live', '#scrapbook'), stat(s.surprise_enabled, 'junk drawer items', '#drawer'), stat(s.visits, 'visits counted', '#pages/home')),
      empty.length ? h('div', { class: 'panel' }, h('h2', {}, 'Optional slots not filled yet'),
        h('p', { style: 'margin-top:0' }, 'These reveal steps have no image. Visitors simply skip them, so nothing looks broken. Fill them whenever you are ready.'),
        h('div', { class: 'items' }, empty.map(({ egg, step }) => h('div', { class: 'item' },
          h('div', { class: 'th empty' }, 'EMPTY'),
          h('div', { class: 'meta' }, h('b', {}, egg.name), h('div', { class: 'mono small' }, `Step ${egg.steps.indexOf(step) + 1}: ${step.label || 'unnamed slot'}`)),
          h('div', { class: 'acts' }, h('a', { class: 'btn sm', href: '#eggs/' + egg.id }, 'Open media settings')))))) : null,
      h('div', { class: 'panel' }, h('h2', {}, 'Quick actions'), h('div', { class: 'row' },
        h('a', { class: 'btn', href: '#media' }, 'Upload images'), h('a', { class: 'btn ghost', href: '#eggs/new' }, 'New Easter egg'),
        h('a', { class: 'btn ghost', href: '#guestbook' }, 'Moderate guestbook'), h('a', { class: 'btn ghost', href: '#scrapbook/new' }, 'New scrapbook entry'), h('a', { class: 'btn ghost', href: '#pages/home' }, 'Edit the home page'))),
      starter);
  };

  async function importStarter(btn) {
    const out = $('#starter-out');
    await guard(btn, async () => {
      const man = await fetch('seed/manifest.json').then(r => { if (!r.ok) throw new Error('seed/manifest.json is missing.'); return r.json(); });
      const ids = {};
      for (const [i, m] of man.media.entries()) {
        out.textContent = `Uploading images ${i + 1}/${man.media.length}…`;
        const blob = await fetch('seed/' + m.file).then(r => { if (!r.ok) throw new Error('Missing starter file: ' + m.file); return r.blob(); });
        const qs = new URLSearchParams({ r: 'media', name: m.name, tags: m.tags.join(','), alt: m.alt || '' });
        const d = await api('cms?' + qs, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
        ids[m.key] = d.media.id;
      }
      const existing = (await cms('r=eggs')).eggs.map(e => e.name);
      let made = 0;
      for (const e of man.eggs) {
        if (existing.includes(e.name)) continue;
        out.textContent = `Creating egg "${e.name}"…`;
        const steps = e.steps.map(s => ({ label: s.label, caption: s.caption, media_id: s.media ? ids[s.media] : null }));
        await cms('r=eggs', { method: 'POST', json: { ...e, steps, sound_id: e.sound ? ids[e.sound] : null, force: true } });
        made++;
      }
      const inDrawer = new Set((await cms('r=surprise')).items.map(i => i.media_id));
      let drawer = 0;
      for (const s of man.surprise) {
        if (inDrawer.has(ids[s.media])) continue;
        await cms('r=surprise', { method: 'POST', json: { kind: 'image', media_id: ids[s.media], caption: s.caption, enabled: true } });
        drawer++;
      }
      out.textContent = `Done: ${man.media.length} images checked, ${made} eggs and ${drawer} drawer items added.`;
      toast('Starter pack imported.');
      setTimeout(() => { if (!location.hash || location.hash === '#dashboard') router(); }, 900); // only if you're still on the dashboard
    });
  }

  // ---------------------------------------------------------------- Easter eggs
  let TARGETS = {};
  function eggStatus(e) {
    const now = Date.now();
    if (!e.enabled) return h('span', { class: 'badge b-off' }, 'OFF');
    if (e.starts_at && new Date(e.starts_at) > now) return h('span', { class: 'badge b-warn' }, 'SCHEDULED');
    if (e.ends_at && new Date(e.ends_at) <= now) return h('span', { class: 'badge b-off' }, 'ENDED');
    return h('span', { class: 'badge b-live' }, 'LIVE');
  }
  function triggerText(e) {
    if (e.trigger_type === 'keyword') return 'Type: ' + e.phrases.map(p => `"${p}"`).join(', ');
    if (e.trigger_type === 'click') return `Click ${TARGETS[e.target] || e.target} × ${e.click_count}`;
    return 'Click in order: ' + e.sequence.map(t => t).join(' → ');
  }
  const stepThumb = st => st.media ? h('img', { class: 'th', src: st.media.url, alt: st.media.name, title: st.media.name, loading: 'lazy' })
    : h('div', { class: 'th empty', title: 'Empty slot: visitors skip it' }, 'EMPTY', h('br'), 'slot');
  function previewEgg(e) {
    window.NikhReveal.show({
      title: e.title, message: e.message, style: e.style, stepMs: +e.step_ms || 1600, sound: e.sound ? e.sound.url : null,
      steps: e.steps.map(s => s.media ? { url: s.media.url, w: s.media.w, h: s.media.h, alt: s.media.alt, caption: s.caption } : { empty: true, label: s.label })
    }, { preview: true }) || toast('This egg has nothing to show yet.', true);
  }

  VIEWS.eggs = async arg => {
    const d = await cms('r=eggs'); TARGETS = d.targets;
    if (arg) return eggEditor(arg === 'new' ? null : d.eggs.find(e => e.id === arg), d.eggs);
    const testIn = h('input', { type: 'search', placeholder: 'Type a word, e.g. cutie', 'aria-label': 'Word to test' });
    const testOut = h('div', { class: 'mono small', style: 'margin-top:8px' });
    const testForm = h('form', { class: 'row' }, h('div', { style: 'flex:1;min-width:200px' }, testIn), h('button', { class: 'btn ghost', type: 'submit' }, 'Test trigger'));
    testForm.onsubmit = async ev => {
      ev.preventDefault();
      const r = await guard(testForm.querySelector('button'), () => cms('r=egg-test', { method: 'POST', json: { phrase: testIn.value } }));
      if (!r) return;
      testOut.replaceChildren(
        r.winner ? h('p', {}, `✔ Typing "${r.phrase}" fires `, h('a', { href: '#eggs/' + r.winner.id }, r.winner.name), '.') : h('p', {}, `✘ Nothing would fire for "${r.phrase}".`),
        ...r.matches.filter(m => !r.winner || m.id !== r.winner.id).map(m => h('p', { class: 'muted' }, `· "${m.name}" also matches but ${m.live ? 'loses to the winner (priority, then age)' : 'is ' + m.why}.`)));
    };
    const filter = h('input', { type: 'search', placeholder: 'Filter eggs', 'aria-label': 'Filter eggs' });
    const list = h('div', { class: 'items' });
    const draw = () => {
      const f = filter.value.toLowerCase();
      const rows = d.eggs.filter(e => !f || (e.name + ' ' + triggerText(e)).toLowerCase().includes(f));
      list.replaceChildren(...(rows.length ? rows.map(e => {
        const tog = h('button', { class: 'btn ghost sm', type: 'button' }, e.enabled ? 'Switch off' : 'Switch on');
        tog.onclick = () => toggleEgg(e, tog);
        return h('div', { class: 'item' },
          h('div', { class: 'thumbs' }, e.steps.length ? e.steps.map(stepThumb) : h('div', { class: 'th empty' }, 'TEXT', h('br'), 'only')),
          h('div', { class: 'meta' }, h('div', { class: 'row' }, h('b', {}, e.name), eggStatus(e)),
            h('div', { class: 'mono small' }, triggerText(e)),
            e.steps.some(s => !s.media_id) ? h('div', { class: 'mono small', style: 'color:var(--amber)' }, `${e.steps.filter(s => !s.media_id).length} optional slot(s) empty`) : null,
            ...e.conflicts.map(c => h('div', { class: 'mono small', style: 'color:#f0a1a8' }, '⚠ ' + c))),
          h('div', { class: 'acts' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => previewEgg(e) }, 'Preview'), tog,
            h('a', { class: 'btn sm', href: '#eggs/' + e.id }, 'Edit')));
      }) : [h('p', { class: 'muted' }, d.eggs.length ? 'No eggs match.' : 'No eggs yet. Create one, or import the starter pack from the dashboard.')]));
    };
    filter.oninput = draw; draw();
    page('THE SECRETS', 'Easter eggs', 'Words, clicks and click sequences that reveal something. Keyword eggs fire when someone types the word anywhere on the page (outside text boxes) or enters it in the C:\\NIKH> prompt in the footer.',
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'grow' }, 'All eggs'), h('a', { class: 'btn sm', href: '#eggs/new', style: 'text-transform:none' }, '+ New egg')),
        h('div', { style: 'margin-bottom:12px' }, filter), list),
      h('div', { class: 'panel' }, h('h2', {}, 'Test a trigger word'), testForm, testOut));
  };

  async function toggleEgg(e, btn, force) {
    await guard(btn, async () => {
      try { await cms('r=eggs&id=' + e.id, { method: 'PATCH', json: { enabled: !e.enabled, force: !!force } }); }
      catch (err) {
        if (err.status === 409) {
          const ok = await confirmBox('Trigger conflict', conflictNote(err.data.conflicts), 'Switch on anyway', false);
          if (ok) return toggleEgg(e, btn, true);
          return;
        }
        throw err;
      }
      toast(e.enabled ? `"${e.name}" switched off.` : `"${e.name}" is live.`);
      router();
    });
  }
  const conflictNote = list => h('div', {}, h('ul', {}, list.map(c => h('li', {}, c))),
    h('p', { class: 'note' }, 'If both fire at the same moment, the egg with the higher priority wins (Advanced settings). On a tie, the older egg wins. Only one reveal shows at a time.'));

  function eggEditor(egg, all) {
    const isNew = !egg;
    const e = egg ? JSON.parse(JSON.stringify(egg)) : {
      name: '', trigger_type: 'keyword', phrases: [], target: 'avatar', click_count: 3, sequence: ['logo', 'footer'], title: '', message: '',
      style: 'card', step_ms: 1600, enabled: false, priority: 0, repeat_mode: 'always', cooldown_s: 0, starts_at: null, ends_at: null,
      hint: '', hint_public: false, steps: [{ label: '', caption: '', media_id: null, media: null }]
    };
    const inp = (key, attrs = {}) => { const i = h('input', { type: 'text', value: e[key] ?? '', ...attrs }); i.oninput = () => (e[key] = i.value); return i; };
    const field = (label, ctl, help) => h('label', { class: 'f' }, label, ctl, help ? h('span', { class: 'help' }, help) : null);

    // trigger
    const phrases = h('input', { type: 'text', value: (e.phrases || []).join(', '), placeholder: 'cutie' });
    phrases.oninput = () => (e.phrases = phrases.value.split(',').map(s => s.trim()).filter(Boolean));
    const targetSel = (val, onch) => { const s = h('select', {}, Object.entries(TARGETS).map(([k, v]) => h('option', { value: k, selected: k === val || null }, v))); s.onchange = () => onch(s.value); return s; };
    const count = h('input', { type: 'number', min: 1, max: 20, value: e.click_count });
    count.oninput = () => (e.click_count = +count.value);
    const seqBox = h('div', { class: 'items' });
    const drawSeq = () => seqBox.replaceChildren(...e.sequence.map((t, i) => h('div', { class: 'row' }, h('span', { class: 'mono' }, i + 1 + '.'),
      h('div', { style: 'flex:1;min-width:180px' }, targetSel(t, v => (e.sequence[i] = v))),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { e.sequence.splice(i, 1); drawSeq(); } }, 'Remove'))),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { if (e.sequence.length < 6) { e.sequence.push('logo'); drawSeq(); } } }, '+ Add click'));
    drawSeq();
    const trigPanels = {
      keyword: field('Trigger word(s)', phrases, 'Separate several with commas. Capital letters and extra spaces are ignored. At least 3 characters.'),
      click: h('div', { class: 'grid2' }, field('Element to click', targetSel(e.target, v => (e.target = v))), field('Clicks in a row', count, 'Quick clicks, under about a second apart.')),
      sequence: field('Click these, in this order (within 8 seconds)', seqBox)
    };
    const trigBox = h('div', { style: 'margin-top:12px' });
    const typeSel = h('div', { class: 'seg', role: 'group', 'aria-label': 'Trigger type' });
    const drawType = () => {
      typeSel.replaceChildren(...[['keyword', 'Secret word'], ['click', 'Clicks'], ['sequence', 'Click sequence']].map(([k, l]) =>
        h('button', { type: 'button', 'aria-pressed': e.trigger_type === k ? 'true' : 'false', onclick: () => { e.trigger_type = k; drawType(); } }, l)));
      trigBox.replaceChildren(trigPanels[e.trigger_type]);
    };
    drawType();

    // steps
    const stepsBox = h('div', { class: 'steps' });
    function drawSteps() {
      stepsBox.replaceChildren(...e.steps.map((s, i) => {
        const pic = s.media
          ? h('img', { class: 'pic', src: s.media.url, alt: s.media.alt || s.media.name })
          : h('div', { class: 'slot-empty' }, h('b', {}, 'NOT SET YET'), h('span', {}, 'Optional. Visitors skip this step.'));
        const label = h('input', { type: 'text', value: s.label, placeholder: 'e.g. Reaction meme', maxlength: 80 });
        label.oninput = () => (s.label = label.value);
        const cap = h('input', { type: 'text', value: s.caption, placeholder: 'Optional line under the image', maxlength: 300 });
        cap.oninput = () => (s.caption = cap.value);
        const choose = h('button', { class: 'btn sm', type: 'button' }, s.media ? 'Change image' : 'Choose or upload image');
        choose.onclick = async () => {
          const [m] = await pickMedia({ title: `Image for step ${i + 1}${s.label ? ': ' + s.label : ''}` });
          if (m) { s.media_id = m.id; s.media = { name: m.name, url: m.url, w: m.width, h: m.height, alt: m.alt }; drawSteps(); toast('Image selected. Remember to save.'); }
        };
        return h('div', { class: 'step' }, pic, h('div', { style: 'display:grid;gap:8px;min-width:0' },
          s.media ? h('div', { class: 'mono small' }, s.media.name) : h('div', { class: 'mono small', style: 'color:var(--amber)' }, 'This slot is empty.'),
          field('Slot name (only you see it)', label), field('Caption', cap),
          h('div', { class: 'row' }, choose,
            s.media ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { s.media_id = null; s.media = null; drawSteps(); } }, 'Clear image (keep slot)') : null,
            i > 0 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move step up', onclick: () => { e.steps.splice(i - 1, 0, e.steps.splice(i, 1)[0]); drawSteps(); } }, '↑') : null,
            i < e.steps.length - 1 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move step down', onclick: () => { e.steps.splice(i + 1, 0, e.steps.splice(i, 1)[0]); drawSteps(); } }, '↓') : null,
            h('button', { class: 'btn danger sm', type: 'button', onclick: () => { e.steps.splice(i, 1); drawSteps(); } }, 'Remove step'))));
      }), h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { if (e.steps.length < 6) { e.steps.push({ label: '', caption: '', media_id: null, media: null }); drawSteps(); } } }, '+ Add step')));
    }
    drawSteps();

    // optional sound
    const soundBox = h('div', {});
    const drawSound = () => soundBox.replaceChildren(
      e.sound ? h('div', { class: 'row' }, h('span', { class: 'mono small' }, '♪ ' + e.sound.name), h('audio', { src: e.sound.url, controls: true, preload: 'none' })) : h('p', { class: 'mono small muted', style: 'margin:0' }, 'No sound. Visitors with sound switched on hear the default chime.'),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { const [m] = await pickMedia({ kind: 'audio', title: 'Sound for this egg' }); if (m) { e.sound_id = m.id; e.sound = { name: m.name, url: m.url }; drawSound(); } } }, e.sound ? 'Change sound' : 'Choose or upload sound'),
        e.sound ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { e.sound_id = null; e.sound = null; drawSound(); } }, 'Remove sound') : null));
    drawSound();
    const styleSel = h('select', {}, h('option', { value: 'card', selected: e.style === 'card' || null }, 'Card with images (pop-up)'),
      h('option', { value: 'toast', selected: e.style === 'toast' || null }, 'Small note in the corner (text only)'));
    styleSel.onchange = () => (e.style = styleSel.value);
    const msg = h('textarea', { maxlength: 600 }, e.message || ''); msg.oninput = () => (e.message = msg.value);
    const enabled = h('input', { type: 'checkbox', checked: e.enabled }); enabled.onchange = () => (e.enabled = enabled.checked);
    const repeat = h('select', {}, h('option', { value: 'always', selected: e.repeat_mode === 'always' || null }, 'Every time'),
      h('option', { value: 'once_per_session', selected: e.repeat_mode === 'once_per_session' || null }, 'Once per visit'));
    repeat.onchange = () => (e.repeat_mode = repeat.value);
    const starts = h('input', { type: 'datetime-local', value: toLocalInput(e.starts_at) }); starts.onchange = () => (e.starts_at = starts.value ? new Date(starts.value).toISOString() : null);
    const ends = h('input', { type: 'datetime-local', value: toLocalInput(e.ends_at) }); ends.onchange = () => (e.ends_at = ends.value ? new Date(ends.value).toISOString() : null);
    const hintPublic = h('input', { type: 'checkbox', checked: e.hint_public }); hintPublic.onchange = () => (e.hint_public = hintPublic.checked);

    const out = h('div', { role: 'alert' });
    const saveBtn = h('button', { class: 'btn', type: 'button' }, isNew ? 'Create egg' : 'Save changes');
    async function save(force) {
      out.replaceChildren();
      const payload = { ...e, steps: e.steps.map(s => ({ id: s.id, label: s.label, caption: s.caption, media_id: s.media_id })), force: !!force };
      await guard(saveBtn, async () => {
        let r;
        try { r = await cms(isNew ? 'r=eggs' : 'r=eggs&id=' + e.id, { method: isNew ? 'POST' : 'PUT', json: payload }); }
        catch (err) {
          if (err.status === 409 && err.data.conflicts) {
            out.replaceChildren(h('div', { class: 'note warn' }, h('b', {}, 'Trigger conflict. '), conflictNote(err.data.conflicts),
              h('button', { class: 'btn sm', type: 'button', onclick: () => save(true) }, 'Save anyway')));
            return;
          }
          throw err;
        }
        toast(r.egg.enabled ? `Saved. "${r.egg.name}" is live.` : `Saved. "${r.egg.name}" is switched off.`);
        location.hash = 'eggs/' + r.egg.id;
        if (!isNew) router();
      });
    }
    saveBtn.onclick = () => save(false);
    const del = isNew ? null : h('button', { class: 'btn danger', type: 'button' }, 'Delete egg');
    if (del) del.onclick = async () => {
      if (!(await confirmBox('Delete egg', `Delete "${e.name}"? Its images stay in the media library.`, 'Delete'))) return;
      await guard(del, async () => { await cms('r=eggs&id=' + e.id, { method: 'DELETE' }); toast('Egg deleted.'); location.hash = 'eggs'; });
    };

    page('THE SECRETS', isNew ? 'New Easter egg' : `Egg: ${e.name}`, null,
      h('p', {}, h('a', { href: '#eggs' }, '← All eggs')),
      h('div', { class: 'panel' }, h('h2', {}, '1 · Basics'), h('div', { class: 'grid2' },
        field('Name', inp('name', { maxlength: 60, placeholder: 'e.g. cutie' }), 'Only you see this.'),
        h('div', { style: 'display:grid;gap:6px;align-content:end;justify-items:start' }, h('label', { class: 'check' }, enabled, 'Live on the site'), egg ? eggStatus(egg) : null))),
      h('div', { class: 'panel' }, h('h2', {}, '2 · Trigger'), typeSel, trigBox),
      h('div', { class: 'panel' }, h('h2', {}, '3 · What appears (media settings)'),
        h('div', { class: 'grid2' }, field('Presentation', styleSel), field('Title (optional)', inp('title', { maxlength: 120 }))),
        h('div', { style: 'margin:12px 0' }, field('Message (optional)', msg)),
        h('p', { class: 'mono small muted' }, 'Steps play in order: step 1 first, then the next one after a short pause. Empty slots are skipped for visitors.'),
        stepsBox,
        h('div', { class: 'f', style: 'margin-top:16px' }, h('span', {}, 'Sound (optional)'), soundBox,
          h('span', { class: 'help' }, 'Plays only for visitors who switched sound on in the footer. Sound is off by default.'))),
      h('details', { class: 'adv' }, h('summary', {}, 'Advanced settings'), h('div', { class: 'grid2', style: 'margin-top:12px' },
        field('Pause between steps (ms)', inp('step_ms', { type: 'number', min: 500, max: 10000, step: 100 })),
        field('Can be triggered', repeat),
        field('Cooldown (seconds)', inp('cooldown_s', { type: 'number', min: 0, max: 86400 }), '0 = no cooldown'),
        field('Priority', inp('priority', { type: 'number', min: -100, max: 100 }), 'Higher wins when two eggs fire together.'),
        field('Active from (optional)', starts, 'For seasonal eggs.'), field('Active until (optional)', ends),
        field('Clue', inp('hint', { maxlength: 200 }), 'Shown when visitors type "help" in the footer prompt, if allowed below.'),
        h('label', { class: 'check', style: 'align-self:end' }, hintPublic, 'Show this clue to visitors'))),
      h('div', { class: 'panel' }, h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => previewEgg(e) }, '▶ Preview'), saveBtn, del), out));
  }

  // ---------------------------------------------------------------- Media
  VIEWS.media = async () => {
    const d = await cms('r=media');
    const search = h('input', { type: 'search', placeholder: 'Search name, caption or tag', 'aria-label': 'Search images' });
    const tagSel = h('select', { 'aria-label': 'Filter by tag' }, h('option', { value: '' }, 'All tags'), d.tags.map(t => h('option', { value: t }, t)));
    const grid = h('div', { class: 'mgrid' });
    const status = h('p', { class: 'mono small' });
    let items = d.media;
    const draw = () => grid.replaceChildren(...(items.length ? items.map(m => h('button', { class: 'mcard', type: 'button', onclick: () => mediaDetail(m.id) },
      thumb(m), h('span', { class: 'nm' }, m.name),
      h('span', { class: 'muted' }, isAudioMedia(m) ? dims(m) : `${m.width}×${m.height} · ${fmtBytes(m.bytes)}`),
      m.uses ? h('span', { class: 'badge b-live' }, `used ${m.uses}×`) : h('span', { class: 'badge b-off' }, 'unused · private'))) : [h('p', { class: 'muted' }, 'No images found.')]));
    const reload = async () => {
      const r = await guard(null, () => cms(`r=media&q=${encodeURIComponent(search.value)}&tag=${encodeURIComponent(tagSel.value)}`));
      if (r) { items = r.media; draw(); }
    };
    let t; search.oninput = () => { clearTimeout(t); t = setTimeout(reload, 250); };
    tagSel.onchange = reload;
    async function upload(files) {
      let ok = 0;
      for (const f of files) {
        status.textContent = `Uploading ${f.name}…`;
        try { await uploadFile(f); ok++; } catch (e) { if (e.status !== 401) toast(`${f.name}: ${e.message}`, true); }
      }
      status.textContent = ok ? `${ok} file(s) uploaded.` : '';
      reload();
    }
    const drop = h('div', { class: 'drop' }, 'Drop images or sounds here or ', h('button', { class: 'btn sm', type: 'button', onclick: async () => upload(await filePicker(true, 'any')) }, 'choose files'),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, 'Images: JPEG, PNG, WebP or GIF. Photos are resized to 1600 px and location data is removed before upload.'),
      h('div', { class: 'muted small' }, 'Sounds: MP3, OGG, WAV or M4A, up to 4 MB. Short clips work best for Easter eggs.'));
    drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = ev => { ev.preventDefault(); drop.classList.remove('over'); upload([...ev.dataTransfer.files]); };
    draw();
    page('THE LIBRARY', 'Media', null,
      h('div', { class: 'note', style: 'margin-top:14px' }, 'Uploads are private by default. A file becomes viewable to visitors only while something live uses it: a page, a live egg, a published scrapbook entry or an enabled drawer item. Anyone who gets that file\'s link can then open it, so a secret word is a surprise, not a lock.'),
      h('div', { class: 'panel' }, h('h2', {}, 'Upload'), drop, status),
      h('div', { class: 'panel' }, h('h2', {}, `Library (${d.media.length})`), h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { style: 'flex:1;min-width:200px' }, search), tagSel), grid));
  };

  async function mediaDetail(id) {
    const d = await guard(null, () => cms('r=media&id=' + id));
    if (!d) return;
    const m = d.media;
    const name = h('input', { type: 'text', value: m.name, maxlength: 120 });
    const alt = h('input', { type: 'text', value: m.alt, maxlength: 300, placeholder: 'Describe the image for screen readers' });
    const caption = h('textarea', { maxlength: 500 }, m.caption);
    const tags = h('input', { type: 'text', value: m.tags.join(', '), placeholder: 'meme, cat, egg' });
    const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Save details');
    const aud = isAudioMedia(m);
    const replBtn = h('button', { class: 'btn ghost', type: 'button' }, aud ? 'Replace sound…' : 'Replace image…');
    const delBtn = h('button', { class: 'btn danger', type: 'button' }, 'Delete');
    const usage = d.usage.length
      ? h('ul', {}, d.usage.map(u => h('li', {}, u.kind === 'egg' ? h('a', { href: '#eggs/' + u.id }, u.slot === 'sound' && !u.pos ? `Egg "${u.label}" (its sound)` : `Egg "${u.label}", step ${u.pos}${u.slot ? ' (' + u.slot + ')' : ''}`)
        : u.kind === 'page' ? h('a', { href: '#pages/' + u.label }, `Page: ${PAGES[u.label] ? PAGES[u.label].label : u.label}`)
        : u.kind === 'scrapbook' ? h('a', { href: '#scrapbook/' + u.id }, `Scrapbook: ${u.label}`) : h('a', { href: '#drawer' }, `Junk drawer: ${u.label}`))))
      : h('p', { class: 'muted' }, 'Not used anywhere. Visitors cannot load it.');
    const img = aud ? h('audio', { src: m.url, controls: true, preload: 'none', style: 'display:block;width:100%;margin:10px 0' })
      : h('img', { src: m.url, alt: m.alt, style: 'max-width:100%;max-height:50vh;display:block;margin:0 auto;background:#000' });
    const dlg = modal(m.name, [img,
      h('p', { class: 'mono small muted', style: 'text-align:center' }, `${aud ? 'Sound' : m.width + '×' + m.height} · ${m.mime.split('/')[1].toUpperCase()} · ${fmtBytes(m.bytes)} · added ${fmtDate(m.created_at)}`),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Name', name), h('label', { class: 'f' }, 'Tags', tags, h('span', { class: 'help' }, 'Comma separated'))),
      h('label', { class: 'f', style: 'margin-top:10px' }, 'Alt text', alt), h('label', { class: 'f', style: 'margin-top:10px' }, 'Caption / notes', caption),
      h('h3', { style: 'margin-top:16px' }, 'Where it is used'), usage,
      h('div', { class: 'row', style: 'margin-top:14px' }, saveBtn, replBtn, delBtn)]);
    saveBtn.onclick = () => guard(saveBtn, async () => {
      await cms('r=media&id=' + id, { method: 'PATCH', json: { name: name.value, alt: alt.value, caption: caption.value, tags: tags.value } });
      toast('Saved.'); dlg.close(); router();
    });
    replBtn.onclick = async () => {
      const [f] = await filePicker(false, aud ? 'audio' : 'image'); if (!f) return;
      await guard(replBtn, async () => { await replaceFile(id, f); toast((aud ? 'Sound' : 'Image') + ' replaced everywhere it is used.'); dlg.close(); router(); });
    };
    delBtn.onclick = async () => {
      let force = false;
      if (d.usage.length) {
        force = await confirmBox('This image is in use', h('div', {}, h('p', {}, 'Deleting it will:'), h('ul', {},
          d.usage.map(u => h('li', {}, u.kind === 'egg' && u.slot === 'sound' && !u.pos ? `remove the sound from egg "${u.label}"`
            : u.kind === 'page' ? `remove it from the ${PAGES[u.label] ? PAGES[u.label].label : u.label} page (that spot goes back to its default)`
            : u.kind === 'egg' ? `empty step ${u.pos} of egg "${u.label}" (the egg keeps working, visitors skip that step)`
            : u.kind === 'scrapbook' ? `remove it from scrapbook entry "${u.label}"` : `remove the junk drawer item "${u.label}"`))),
          h('p', {}, 'Tip: use "Replace image" instead if you only want a different picture.')), 'Delete anyway');
        if (!force) return;
      } else if (!(await confirmBox('Delete image', `Delete "${m.name}" permanently?`, 'Delete'))) return;
      await guard(delBtn, async () => { await cms(`r=media&id=${id}${force ? '&force=1' : ''}`, { method: 'DELETE' }); toast('Image deleted.'); dlg.close(); router(); });
    };
  }

  // ---------------------------------------------------------------- Guestbook
  VIEWS.guestbook = async arg => {
    const status = ['pending', 'approved', 'rejected'].includes(arg) ? arg : 'pending';
    const d = await cms('r=guestbook&status=' + status);
    await refreshStats(); renderTabs('guestbook');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Which notes' }, [['pending', `Waiting (${stats.guestbook_pending})`], ['approved', 'On the board'], ['rejected', 'Rejected']]
      .map(([k, l]) => h('button', { type: 'button', 'aria-pressed': k === status ? 'true' : 'false', onclick: () => (location.hash = 'guestbook/' + k) }, l)));
    const act = (en, action, btn) => guard(btn, async () => {
      if (action === 'delete' && !(await confirmBox('Delete note', `Delete the note from "${en.name}" for good?`, 'Delete'))) return;
      await cms('r=guestbook', { method: 'POST', json: { id: en.id, action } });
      toast({ approve: 'Approved. It is on the board.', reject: 'Rejected. Hidden from the board.', feature: 'Pinned to the top.', unfeature: 'Unpinned.', delete: 'Deleted.' }[action]);
      router();
    });
    const B = (en, label, action, cls = 'btn sm') => { const b = h('button', { class: cls, type: 'button' }, label); b.onclick = () => act(en, action, b); return b; };
    page('THE BOARD', 'Guestbook', 'New notes wait here until you approve them. Rejected notes stay hidden but are kept, in case you change your mind.',
      h('div', { class: 'panel' }, seg, h('div', { class: 'items', style: 'margin-top:16px' },
        d.entries.length ? d.entries.map(en => h('article', { class: 'gbe' },
          h('div', { class: 'row between' }, h('b', {}, en.name), h('span', {}, en.featured ? h('span', { class: 'badge', style: 'color:#6b1f2e' }, 'PINNED') : null, ' ', h('time', {}, fmtDate(en.created_at)))),
          h('p', {}, en.message),
          h('div', { class: 'row' },
            status !== 'approved' ? B(en, 'Approve', 'approve') : null,
            !en.featured ? B(en, 'Approve + pin', 'feature', 'btn ghost sm') : B(en, 'Unpin', 'unfeature', 'btn ghost sm'),
            status !== 'rejected' ? B(en, status === 'approved' ? 'Hide' : 'Reject', 'reject', 'btn ghost sm') : null,
            B(en, 'Delete', 'delete', 'btn danger sm'))))
          : h('p', { class: 'muted' }, status === 'pending' ? 'Nothing waiting. Inbox zero.' : 'Nothing here.'))));
  };

  // ---------------------------------------------------------------- Scrapbook
  VIEWS.scrapbook = async arg => {
    const d = await cms('r=scrapbook');
    if (arg) return scrapEditor(arg === 'new' ? null : d.entries.find(x => x.id === arg));
    const order = d.entries.map(x => x.id);
    const move = (i, dir) => guard(null, async () => {
      const j = i + dir; if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      await cms('r=scrapbook-order', { method: 'POST', json: { ids: order } }); router();
    });
    page('THE SHOEBOX', 'Scrapbook', 'Photos and small memories. Entries stay drafts until you tick "Published". The Scrapbook link appears in the site menu once at least one entry is published.',
      h('div', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'grow' }, 'Entries (top = first on the page)'), h('a', { class: 'btn sm', href: '#scrapbook/new', style: 'text-transform:none' }, '+ New entry')),
        h('div', { class: 'items' }, d.entries.length ? d.entries.map((en, i) => h('div', { class: 'item' },
          h('div', { class: 'thumbs' }, en.media.length ? en.media.slice(0, 3).map(m => h('img', { class: 'th', src: m.url, alt: '' })) : h('div', { class: 'th empty' }, 'TEXT')),
          h('div', { class: 'meta' }, h('div', { class: 'row' }, h('b', {}, en.title || '(untitled)'), h('span', { class: 'badge ' + (en.published ? 'b-live' : 'b-off') }, en.published ? 'PUBLISHED' : 'DRAFT')),
            h('div', { class: 'mono small muted' }, en.entry_date || 'no date')),
          h('div', { class: 'acts' },
            h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move up', disabled: i === 0 || null, onclick: () => move(i, -1) }, '↑'),
            h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move down', disabled: i === d.entries.length - 1 || null, onclick: () => move(i, 1) }, '↓'),
            h('a', { class: 'btn sm', href: '#scrapbook/' + en.id }, 'Edit'))))
          : h('p', { class: 'muted' }, 'No entries yet.'))));
  };

  function scrapEditor(en) {
    const isNew = !en;
    const s = en ? { ...en, media: [...en.media] } : { title: '', body: '', entry_date: '', published: false, media: [] };
    const title = h('input', { type: 'text', value: s.title, maxlength: 120 });
    const date = h('input', { type: 'date', value: s.entry_date || '' });
    const body = h('textarea', { maxlength: 2000, style: 'min-height:140px' }, s.body);
    const pub = h('input', { type: 'checkbox', checked: s.published });
    const pics = h('div', { class: 'thumbs' });
    const drawPics = () => pics.replaceChildren(...s.media.map((m, i) => h('div', { style: 'display:grid;gap:4px' },
      h('img', { class: 'th', src: m.url, alt: m.name, style: 'width:96px;height:96px' }),
      h('div', { class: 'row', style: 'gap:2px' },
        i > 0 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move left', onclick: () => { s.media.splice(i - 1, 0, s.media.splice(i, 1)[0]); drawPics(); } }, '←') : null,
        h('button', { class: 'btn danger sm', type: 'button', 'aria-label': 'Remove photo', onclick: () => { s.media.splice(i, 1); drawPics(); } }, '×')))),
      h('button', { class: 'btn ghost sm', type: 'button', style: 'height:96px', onclick: async () => {
        const got = await pickMedia({ multiple: true, title: 'Photos for this entry' });
        for (const m of got) if (!s.media.some(x => x.id === m.id)) s.media.push({ id: m.id, name: m.name, url: m.url });
        drawPics();
      } }, '+ Photos'));
    drawPics();
    const collect = () => ({ title: title.value, body: body.value, entry_date: date.value || null, published: pub.checked, media_ids: s.media.map(m => m.id) });
    const saveBtn = h('button', { class: 'btn', type: 'button' }, isNew ? 'Create entry' : 'Save');
    saveBtn.onclick = () => guard(saveBtn, async () => {
      const r = await cms(isNew ? 'r=scrapbook' : 'r=scrapbook&id=' + s.id, { method: isNew ? 'POST' : 'PUT', json: collect() });
      toast(pub.checked ? 'Saved and published.' : 'Saved as a draft.');
      location.hash = 'scrapbook/' + r.id; if (!isNew) router();
    });
    const preview = h('button', { class: 'btn ghost', type: 'button' }, '▶ Preview');
    preview.onclick = () => modal('Preview', h('div', { class: 'preview-sb' },
      s.media[0] ? h('img', { src: s.media[0].url, alt: '' }) : null,
      date.value ? h('p', { class: 'mono small', style: 'color:#6b1f2e;font-weight:700;margin:10px 0 0' }, new Date(date.value + 'T12:00').toLocaleDateString(undefined, { dateStyle: 'long' })) : null,
      title.value ? h('h2', { style: 'margin:4px 0' }, title.value) : null, body.value ? h('p', {}, body.value) : null,
      s.media.length > 1 ? h('p', { class: 'mono small' }, `+ ${s.media.length - 1} more photo(s)`) : null), { wide: false });
    const del = isNew ? null : h('button', { class: 'btn danger', type: 'button' }, 'Delete entry');
    if (del) del.onclick = async () => {
      if (!(await confirmBox('Delete entry', 'Delete this scrapbook entry? The photos stay in the media library.', 'Delete'))) return;
      await guard(del, async () => { await cms('r=scrapbook&id=' + s.id, { method: 'DELETE' }); toast('Entry deleted.'); location.hash = 'scrapbook'; });
    };
    page('THE SHOEBOX', isNew ? 'New scrapbook entry' : 'Edit entry', null, h('p', {}, h('a', { href: '#scrapbook' }, '← All entries')),
      h('div', { class: 'panel' }, h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Title', title), h('label', { class: 'f' }, 'Date (optional)', date)),
        h('label', { class: 'f', style: 'margin-top:12px' }, 'The memory / note', body),
        h('div', { class: 'f', style: 'margin-top:12px' }, h('span', { class: 'mono', style: 'font-weight:700;color:var(--amber);font-size:.82rem' }, 'Photos (first one is the big one)'), pics),
        h('label', { class: 'check', style: 'margin-top:14px' }, pub, 'Published (visible on the site)'),
        h('div', { class: 'row', style: 'margin-top:14px' }, preview, saveBtn, del)));
  }

  // ---------------------------------------------------------------- Junk drawer (Surprise me)
  VIEWS.drawer = async () => {
    const d = await cms('r=surprise');
    const addImg = h('button', { class: 'btn', type: 'button' }, '+ Add images');
    addImg.onclick = async () => {
      const got = await pickMedia({ multiple: true, title: 'Images for the junk drawer' });
      if (!got.length) return;
      await guard(addImg, async () => { for (const m of got) await cms('r=surprise', { method: 'POST', json: { kind: 'image', media_id: m.id, caption: '' } }); toast(`${got.length} added.`); router(); });
    };
    const addText = h('button', { class: 'btn ghost', type: 'button' }, '+ Add a text note');
    addText.onclick = () => surpriseEditor(null);
    page('THE JUNK DRAWER', 'Surprise me', 'Visitors press "Surprise me" on the home page and get one random enabled item. The box is hidden while the drawer is empty.',
      h('div', { class: 'panel' }, h('div', { class: 'row', style: 'margin-bottom:14px' }, addImg, addText),
        h('div', { class: 'items' }, d.items.length ? d.items.map(it => {
          const tog = h('button', { class: 'btn ghost sm', type: 'button' }, it.enabled ? 'Disable' : 'Enable');
          tog.onclick = () => guard(tog, async () => { await cms('r=surprise&id=' + it.id, { method: 'PUT', json: { ...it, enabled: !it.enabled } }); router(); });
          const del = h('button', { class: 'btn danger sm', type: 'button' }, 'Remove');
          del.onclick = async () => { if (await confirmBox('Remove item', 'Remove this item from the drawer? (The image stays in the library.)', 'Remove')) guard(del, async () => { await cms('r=surprise&id=' + it.id, { method: 'DELETE' }); router(); }); };
          return h('div', { class: 'item' },
            it.url ? h('img', { class: 'th', src: it.url, alt: '' }) : h('div', { class: 'th empty' }, 'NOTE'),
            h('div', { class: 'meta' }, h('div', { class: 'row' }, h('b', {}, it.kind === 'image' ? it.media_name : it.body.slice(0, 60)), h('span', { class: 'badge ' + (it.enabled ? 'b-live' : 'b-off') }, it.enabled ? 'ON' : 'OFF')),
              h('div', { class: 'mono small muted' }, it.caption || 'no caption')),
            h('div', { class: 'acts' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => previewSurprise(it) }, 'Preview'), tog,
              h('button', { class: 'btn sm', type: 'button', onclick: () => surpriseEditor(it) }, 'Edit'), del));
        }) : h('p', { class: 'muted' }, 'The drawer is empty.'))));
  };
  function previewSurprise(it) {
    modal('Preview', h('div', { class: 'preview-sb' }, it.url ? h('img', { src: it.url, alt: '' }) : h('p', { style: 'font-style:italic' }, it.body),
      it.caption ? h('p', { class: 'mono', style: 'text-align:center;font-weight:700' }, it.caption) : null), { wide: false });
  }
  function surpriseEditor(it) {
    const isNew = !it;
    const s = it ? { ...it } : { kind: 'text', body: '', caption: '', enabled: true };
    const body = h('textarea', { maxlength: 500 }, s.body);
    const cap = h('input', { type: 'text', value: s.caption, maxlength: 300 });
    const save = h('button', { class: 'btn', type: 'button' }, 'Save');
    let mediaId = s.media_id;
    const imgBox = h('div', {});
    const drawImg = (url) => imgBox.replaceChildren(h('img', { src: url, alt: '', style: 'max-width:100%;max-height:240px;display:block;margin-bottom:8px' }),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => { const [m] = await pickMedia(); if (m) { mediaId = m.id; drawImg(m.url); } } }, 'Change image'));
    if (s.kind === 'image') drawImg(s.url);
    const dlg = modal(isNew ? 'New drawer note' : 'Edit drawer item', [s.kind === 'image' ? imgBox : h('label', { class: 'f' }, 'Message', body),
      h('label', { class: 'f', style: 'margin-top:10px' }, 'Caption (optional)', cap), h('div', { class: 'row', style: 'margin-top:12px' }, save)], { wide: false });
    save.onclick = () => guard(save, async () => {
      await cms(isNew ? 'r=surprise' : 'r=surprise&id=' + s.id, { method: isNew ? 'POST' : 'PUT', json: { kind: s.kind, media_id: mediaId, body: body.value, caption: cap.value, enabled: s.enabled } });
      toast('Saved.'); dlg.close(); router();
    });
  }

  // ---------------------------------------------------------------- Pages (edit every page of the site)
  // Each page is described once; the form below is built from that description.
  // Field types: text, url, textarea, bool, color, select, image, strings, texts, list.
  const F = (k, t, label, extra = {}) => ({ k, t, label, ...extra });
  const PAGES = {
    home: { label: 'Home', route: '', fields: [
      F('avatar', 'image', 'Profile photo', { help: 'Replaces the big letter. Square photos look best.' }),
      F('avatarHover', 'image', 'Second photo (optional)', { help: 'Shows when someone hovers over or taps your photo.' }),
      F('avatarLetter', 'text', 'Letter shown when there is no photo'),
      F('name', 'text', 'Name (title of the first box)'),
      F('status', 'text', 'Status line'),
      F('nowListening', 'text', 'Now listening'),
      F('nowListeningLink', 'url', 'Now listening link', { help: 'Spotify or YouTube links get a ▶ Play here button. Any other link shows "Listen ↗".' }),
      F('nowListeningCover', 'image', 'Now listening cover (optional)'),
      F('note', 'textarea', 'Note on the fridge (optional)', { help: 'A sticky note in the sidebar. Leave empty to hide it.' }),
      F('tape', 'text', 'Tape label above the headline'),
      F('headline', 'text', 'Headline'),
      F('blurb', 'textarea', 'Intro'),
      F('into', 'strings', 'Currently into (stickers)'),
      F('updates', 'list', 'Updates', { sum: 'text', of: [F('date', 'text', 'Date'), F('text', 'text', 'Text')] }),
      F('picks', 'strings', "Tonight's pick (the shuffle list)"),
      F('showCounter', 'bool', 'Show the visitor counter'),
      F('awayTitle', 'text', 'Tab title while a visitor looks at another tab', { help: 'Leave empty to turn it off.' }),
      F('lateNight', 'text', 'Late-night message (shown 00:00 to 04:00, visitor time)', { help: 'Leave empty to turn it off.' })
    ] },
    music: { label: 'Music', route: 'music', fields: [
      F('title', 'text', 'Title'),
      F('intro', 'textarea', 'Intro'),
      F('crates', 'list', 'Crates (genre tabs)', { sum: 'name', of: [
        F('name', 'text', 'Crate name'), F('color', 'color', 'Card color'),
        F('items', 'list', 'Records in this crate', { sum: 'title', of: [
          F('title', 'text', 'Artist / album / track'), F('label', 'text', 'Small label (genre, year...)'),
          F('note', 'textarea', 'Your note'), F('cover', 'image', 'Cover art (optional)'),
          F('link', 'url', 'Link (optional)', { help: 'Spotify or YouTube links can be played right on the page.' })] })] })
    ] },
    links: { label: 'Links & heroes', route: 'links', fields: [
      F('intro', 'textarea', 'Intro'),
      F('links', 'list', 'Tabs that are always open', { sum: 'name', of: [F('name', 'text', 'Name'), F('url', 'url', 'Address'), F('note', 'text', 'Note')] }),
      F('heroes', 'list', 'Heroes', { sum: 'name', of: [F('name', 'text', 'Name'), F('category', 'text', 'Category'), F('note', 'text', 'Note'),
        F('image', 'image', 'Photo', { help: 'Leave empty to keep the built-in photo (if there is one).' })] })
    ] },
    projects: { label: 'Projects', route: 'projects', fields: [
      F('intro', 'textarea', 'Intro'),
      F('projects', 'list', 'Projects', { sum: 'name', of: [
        F('name', 'text', 'Name'), F('tagline', 'text', 'Tagline (tape label)'), F('description', 'textarea', 'Description'), F('stack', 'text', 'Stack'),
        F('art', 'select', 'Drawing', { options: [['rig', 'Monitoring states'], ['mj', 'Pinned job notes'], ['led', 'Ledger lines'], ['os', 'Phone app'], ['cam', 'Camera frame'], ['none', 'Plain']] }),
        F('image', 'image', 'Screenshot (optional)', { help: 'Replaces the drawing.' }),
        F('links', 'list', 'Links', { sum: 'label', of: [F('label', 'text', 'Label'), F('url', 'url', 'Address')] })] })
    ] },
    journal: { label: 'Journal', route: 'journal', fields: [
      F('intro', 'textarea', 'Intro'),
      F('entries', 'list', 'Entries (top = newest)', { sum: 'title', of: [
        F('date', 'text', 'Date'), F('title', 'text', 'Title'), F('tags', 'strings', 'Tags'),
        F('body', 'textarea', 'Text', { help: 'Leave an empty line between paragraphs. Start a line with "- " for a bullet point.', rows: 8 })] })
    ] },
    about: { label: 'About', route: 'about', fields: [
      F('tape', 'text', 'Tape label'), F('title', 'text', 'Title'), F('lede', 'textarea', 'Opening line'),
      F('paragraphs', 'texts', 'Paragraphs'),
      F('factsTitle', 'text', 'Fact card title'),
      F('facts', 'list', 'Fact card', { sum: 'label', of: [F('label', 'text', 'Label'), F('value', 'text', 'Value')] }),
      F('faq', 'list', 'Questions at the bottom', { sum: 'q', of: [F('q', 'text', 'Question'), F('a', 'textarea', 'Answer')] })
    ] },
    contact: { label: 'Contact', route: 'contact', fields: [
      F('title', 'text', 'Title'), F('intro', 'textarea', 'Intro'), F('line2', 'textarea', 'Second paragraph'),
      F('stamp', 'text', 'Stamp text'), F('email', 'text', 'Email address'), F('note', 'text', 'Note under the email'),
      F('github', 'url', 'GitHub'), F('linkedin', 'url', 'LinkedIn'), F('site', 'url', 'Website'),
      F('resume', 'url', 'Résumé link (optional)', { help: 'A link to a PDF or page. Adds a Résumé button.' }),
      F('sign', 'text', 'Sign-off line')
    ] },
    footer: { label: 'Footer', route: '', fields: [F('text', 'text', 'Footer text')] }
  };

  const blank = fields => Object.fromEntries(fields.map(f => [f.k, ({ bool: false, image: null, strings: [], texts: [], list: [], color: '#2b3a5c', select: f.options ? f.options[f.options.length - 1][0] : '' })[f.t] ?? '']));
  let pagesDirty = false;
  const markDirty = () => { pagesDirty = true; const d = $('#dirty'); if (d) d.hidden = false; };
  addEventListener('beforeunload', ev => { if (pagesDirty) { ev.preventDefault(); ev.returnValue = ''; } });

  function moveBtns(arr, i, redraw) {
    return [
      i > 0 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move up', onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); markDirty(); redraw(); } }, '↑') : null,
      i < arr.length - 1 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Move down', onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); markDirty(); redraw(); } }, '↓') : null,
      h('button', { class: 'btn danger sm', type: 'button', 'aria-label': 'Remove', onclick: () => { arr.splice(i, 1); markDirty(); redraw(); } }, '×')
    ];
  }

  function formField(obj, f, media) {
    const help = f.help ? h('span', { class: 'help' }, f.help) : null;
    const wrap = (...kids) => h('div', { class: 'f' }, h('span', {}, f.label), ...kids, help);
    const bind = (el, get = () => el.value) => { el.addEventListener('input', () => { obj[f.k] = get(); markDirty(); }); el.addEventListener('change', () => { obj[f.k] = get(); markDirty(); }); return el; };
    switch (f.t) {
      case 'text': case 'url':
        return wrap(bind(h('input', { type: 'text', value: obj[f.k] ?? '', placeholder: f.t === 'url' ? 'https://...' : null, 'aria-label': f.label })));
      case 'textarea':
        return wrap(bind(h('textarea', { 'aria-label': f.label, rows: f.rows || null }, obj[f.k] ?? '')));
      case 'bool': {
        const i = h('input', { type: 'checkbox', checked: !!obj[f.k] });
        i.onchange = () => { obj[f.k] = i.checked; markDirty(); };
        return h('label', { class: 'check' }, i, f.label);
      }
      case 'color':
        return wrap(bind(h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[f.k] || '') ? obj[f.k] : '#2b3a5c', 'aria-label': f.label, style: 'width:80px;height:40px;padding:2px' })));
      case 'select':
        return wrap(bind(h('select', { 'aria-label': f.label }, f.options.map(([v, l]) => h('option', { value: v, selected: obj[f.k] === v || null }, l)))));
      case 'image': {
        const box = h('div', { class: 'imgfield' });
        const draw = () => {
          const m = obj[f.k] && media[obj[f.k]];
          const fallback = !m && obj.img ? { url: obj.img } : null;
          box.replaceChildren(
            m || fallback ? h('img', { src: (m || fallback).url, alt: '' }) : h('div', { class: 'th empty' }, 'NONE'),
            h('div', { style: 'display:grid;gap:6px;align-content:start' },
              h('span', { class: 'mono small' }, m ? m.name || 'Chosen image' : fallback ? 'Built-in image' : 'No image'),
              h('div', { class: 'row' },
                h('button', { class: 'btn sm', type: 'button', onclick: async () => {
                  const [x] = await pickMedia({ title: f.label });
                  if (x) { media[x.id] = { url: x.url, name: x.name, w: x.width, h: x.height, alt: x.alt }; obj[f.k] = x.id; markDirty(); draw(); }
                } }, m ? 'Change' : 'Choose or upload'),
                m ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { obj[f.k] = null; markDirty(); draw(); } }, 'Remove') : null)));
        };
        draw();
        return wrap(box);
      }
      case 'strings': case 'texts': {
        if (!Array.isArray(obj[f.k])) obj[f.k] = [];
        const arr = obj[f.k], box = h('div', { class: 'items' });
        const draw = () => box.replaceChildren(...arr.map((v, i) => {
          const el = f.t === 'texts' ? h('textarea', { 'aria-label': `${f.label} ${i + 1}`, rows: 4 }, v) : h('input', { type: 'text', value: v, 'aria-label': `${f.label} ${i + 1}` });
          el.oninput = () => { arr[i] = el.value; markDirty(); };
          return h('div', { class: 'srow' }, el, h('div', { class: 'row', style: 'gap:4px' }, moveBtns(arr, i, draw)));
        }), h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { arr.push(''); markDirty(); draw(); const last = box.querySelectorAll('input,textarea'); last[last.length - 1].focus(); } }, '+ Add')));
        draw();
        return wrap(box);
      }
      case 'list': {
        if (!Array.isArray(obj[f.k])) obj[f.k] = [];
        const arr = obj[f.k], box = h('div', { class: 'items' });
        const openSet = new Set();
        const draw = () => box.replaceChildren(...arr.map((item, i) => {
          const sum = h('summary', {}, h('span', { class: 'grow' }, String(item[f.sum] || '').slice(0, 70) || `(new ${f.label.toLowerCase().replace(/s? \(.*$/, '').replace(/s$/, '')})`));
          const det = h('details', { class: 'li', open: openSet.has(item) || null }, sum,
            h('div', { class: 'li-body' }, f.of.map(sf => formField(item, sf, media)), h('div', { class: 'row' }, moveBtns(arr, i, draw))));
          det.addEventListener('toggle', () => { if (det.open) openSet.add(item); else openSet.delete(item); });
          det.addEventListener('input', () => { sum.firstChild.textContent = String(item[f.sum] || '').slice(0, 70) || '(untitled)'; });
          return det;
        }), h('div', {}, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { const it = blank(f.of); arr.push(it); openSet.add(it); markDirty(); draw(); } }, '+ Add')));
        draw();
        return wrap(box);
      }
    }
    return null;
  }

  VIEWS.text = async () => { location.hash = 'pages/home'; };
  VIEWS.pages = async arg => {
    const d = await cms('r=content');
    if (arg && PAGES[arg]) return pageEditor(arg, d);
    page('THE PAGES', 'Pages', 'Edit the text, photos and lists on every page of the site. Changes go live as soon as you save. No code, no redeploy.',
      h('div', { class: 'panel' }, h('h2', {}, 'Pages'), h('div', { class: 'items' }, Object.entries(PAGES).map(([k, pg]) =>
        h('div', { class: 'item' }, h('div', { class: 'th empty' }, pg.label.slice(0, 5).toUpperCase()),
          h('div', { class: 'meta' }, h('div', { class: 'row' }, h('b', {}, pg.label), d.content[k] ? h('span', { class: 'badge b-live' }, 'EDITED') : h('span', { class: 'badge b-off' }, 'DEFAULT')),
            h('div', { class: 'mono small muted' }, d.updated[k] ? 'Saved ' + fmtDate(d.updated[k]) : 'Showing the built-in text')),
          h('div', { class: 'acts' }, h('a', { class: 'btn ghost sm', href: '/#/' + pg.route, target: '_blank', rel: 'noopener' }, 'View ↗'), h('a', { class: 'btn sm', href: '#pages/' + k }, 'Edit')))))));
  };

  function pageEditor(key, d) {
    const pg = PAGES[key];
    const defaults = (window.NIKH_DEFAULTS || {})[key] || {};
    const data = JSON.parse(JSON.stringify(Object.assign({}, defaults, d.content[key] || {})));
    if (key === 'home' && !d.content.home) { // carry over the old "Site text" values
      if (d.settings.status) data.status = d.settings.status;
      if (d.settings.now_listening) data.nowListening = d.settings.now_listening;
    }
    const media = { ...d.media };
    pagesDirty = false;
    const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Save page');
    saveBtn.onclick = () => guard(saveBtn, async () => {
      await cms('r=content&key=' + key, { method: 'PUT', json: { data } });
      pagesDirty = false; $('#dirty').hidden = true;
      toast(`${pg.label} saved. It's live now.`);
    });
    const resetBtn = d.content[key] ? h('button', { class: 'btn danger', type: 'button' }, 'Reset to default') : null;
    if (resetBtn) resetBtn.onclick = async () => {
      if (!(await confirmBox('Reset page', `Throw away your saved version of ${pg.label} and go back to the built-in text? Your images stay in the media library.`, 'Reset'))) return;
      await guard(resetBtn, async () => { await cms('r=content&key=' + key, { method: 'DELETE' }); pagesDirty = false; toast('Back to the default.'); router(); });
    };
    page('THE PAGES', 'Edit: ' + pg.label, d.content[key] ? 'Last saved ' + fmtDate(d.updated[key]) + '.' : 'This page shows the built-in text right now. Saving creates your own version.',
      h('p', {}, h('a', { href: '#pages' }, '← All pages')),
      h('div', { class: 'panel pageform' }, pg.fields.map(f => formField(data, f, media))),
      h('div', { class: 'savebar' }, saveBtn, h('a', { class: 'btn ghost', href: '/#/' + pg.route, target: '_blank', rel: 'noopener' }, 'View page ↗'), resetBtn,
        h('span', { id: 'dirty', class: 'mono small', style: 'color:var(--amber)', hidden: true }, '● unsaved changes')));
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    let a;
    try { a = await api('auth'); } catch (e) { main.replaceChildren(h('div', { class: 'note warn' }, e.message)); return; }
    if (!a.configured) {
      main.replaceChildren(h('div', { class: 'login' }, h('span', { class: 'tape' }, 'SETUP NEEDED'), h('h1', {}, 'Almost there'),
        h('div', { class: 'panel' }, h('p', {}, 'The server has no admin password yet. Run "npm run hash-password", put the result in the ADMIN_PASSWORD_HASH environment variable on Vercel, then redeploy. The README walks through it.'))));
      return;
    }
    if (!a.authenticated) return showLogin();
    $('#tabs').hidden = false; $('#logout').hidden = false;
    await refreshStats();
    router();
  }
  boot();
})();
