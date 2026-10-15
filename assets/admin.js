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
  async function uploadFile(file, extra = {}) {
    const blob = await prepareImage(file);
    const name = (extra.name || file.name.replace(/\.[^.]+$/, '') || 'Untitled image').slice(0, 120);
    const qs = new URLSearchParams({ r: 'media', name, tags: (extra.tags || []).join(',') });
    const d = await api('cms?' + qs, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
    if (d.duplicate) toast(`"${d.media.name}" is already in the library, so it was reused.`);
    return d.media;
  }
  async function replaceFile(id, file) {
    const blob = await prepareImage(file);
    return api('cms?r=media&id=' + id, { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
  }
  function filePicker(multiple) {
    return new Promise(resolve => {
      const i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,image/heic', multiple: multiple || null, hidden: true });
      i.onchange = () => { resolve([...i.files]); i.remove(); };
      document.body.append(i); i.click();
    });
  }

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
  function pickMedia({ multiple = false, title = 'Choose an image' } = {}) {
    return new Promise(resolve => {
      const chosen = new Map();
      let resolved = false;
      const grid = h('div', { class: 'mgrid' });
      const search = h('input', { type: 'search', placeholder: 'Search by name, caption or tag', 'aria-label': 'Search images' });
      const status = h('p', { class: 'mono small muted' });
      const useBtn = h('button', { class: 'btn', type: 'button', disabled: true }, multiple ? 'Use selected' : 'Use this image');
      const upBtn = h('button', { class: 'btn ghost', type: 'button' }, '↑ Upload new image');
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
        const d = await guard(null, () => cms('r=media&q=' + encodeURIComponent(search.value)));
        if (!d) return;
        status.textContent = d.media.length ? '' : 'No images yet. Upload one.';
        grid.replaceChildren(...d.media.map(m => {
          const b = h('button', { class: 'mcard', type: 'button', 'aria-pressed': chosen.has(m.id) ? 'true' : 'false' },
            h('img', { src: m.url, alt: '', loading: 'lazy' }), h('span', { class: 'nm' }, m.name),
            h('span', { class: 'muted' }, `${m.width}×${m.height} · ${m.uses ? 'used ' + m.uses + '×' : 'unused'}`));
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
        const files = await filePicker(multiple);
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
    ['scrapbook', 'Scrapbook'], ['drawer', 'Junk drawer'], ['text', 'Site text']];
  let stats = null;
  function renderTabs(cur) {
    $('#tabs').replaceChildren(...SECTIONS.map(([k, label]) => h('a', { href: '#' + k, 'aria-current': k === cur ? 'page' : null },
      label, k === 'guestbook' && stats && stats.guestbook_pending ? h('span', { class: 'badge' }, stats.guestbook_pending) : null)));
  }
  async function refreshStats() { stats = await cms('r=stats').catch(() => stats); return stats; }
  async function router() {
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
        ? 'The starter pack (memes, the cutie, jam, delulu and halloween eggs, drawer items) can be re-imported. Anything already there is skipped.'
        : 'Your library is empty. Import the starter pack: the images that came with the site, the "cutie" egg (with the neuron meme and an empty photo slot), the original "jam" egg, a few extra eggs and the junk drawer items.'),
      h('button', { class: s.media ? 'btn ghost' : 'btn', type: 'button', onclick: e => importStarter(e.currentTarget) }, s.media ? 'Re-run import' : 'Import starter pack'),
      h('p', { class: 'mono small', id: 'starter-out' }));
    page('BACK OFFICE', 'Dashboard', null,
      h('div', { class: 'stats', style: 'margin-top:18px' },
        stat(s.eggs_active, 'live Easter eggs', '#eggs'), stat(s.eggs_inactive, 'eggs switched off', '#eggs'),
        stat(s.guestbook_pending, 'notes waiting for you', '#guestbook'), stat(s.media, `images (${fmtBytes(s.media_bytes || 1)})`, '#media'),
        stat(`${s.scrapbook_published}/${s.scrapbook}`, 'scrapbook entries live', '#scrapbook'), stat(s.surprise_enabled, 'junk drawer items', '#drawer')),
      empty.length ? h('div', { class: 'panel' }, h('h2', {}, 'Optional slots not filled yet'),
        h('p', { style: 'margin-top:0' }, 'These reveal steps have no image. Visitors simply skip them, so nothing looks broken. Fill them whenever you are ready.'),
        h('div', { class: 'items' }, empty.map(({ egg, step }) => h('div', { class: 'item' },
          h('div', { class: 'th empty' }, 'EMPTY'),
          h('div', { class: 'meta' }, h('b', {}, egg.name), h('div', { class: 'mono small' }, `Step ${egg.steps.indexOf(step) + 1}: ${step.label || 'unnamed slot'}`)),
          h('div', { class: 'acts' }, h('a', { class: 'btn sm', href: '#eggs/' + egg.id }, 'Open media settings')))))) : null,
      h('div', { class: 'panel' }, h('h2', {}, 'Quick actions'), h('div', { class: 'row' },
        h('a', { class: 'btn', href: '#media' }, 'Upload images'), h('a', { class: 'btn ghost', href: '#eggs/new' }, 'New Easter egg'),
        h('a', { class: 'btn ghost', href: '#guestbook' }, 'Moderate guestbook'), h('a', { class: 'btn ghost', href: '#scrapbook/new' }, 'New scrapbook entry'))),
      starter);
  };

  async function importStarter(btn) {
    const out = $('#starter-out');
    await guard(btn, async () => {
      const man = await fetch('seed/manifest.json').then(r => { if (!r.ok) throw new Error('seed/manifest.json is missing.'); return r.json(); });
      const ids = {};
      for (const [i, m] of man.media.entries()) {
        out.textContent = `Uploading images ${i + 1}/${man.media.length}…`;
        const blob = await fetch('seed/' + m.file).then(r => r.blob());
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
        await cms('r=eggs', { method: 'POST', json: { ...e, steps, force: true } });
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
      setTimeout(router, 900);
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
      title: e.title, message: e.message, style: e.style, stepMs: +e.step_ms || 1600,
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
        const label = h('input', { type: 'text', value: s.label, placeholder: 'e.g. Girlfriend photo', maxlength: 80 });
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
        stepsBox),
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
      h('img', { src: m.url, alt: '', loading: 'lazy' }), h('span', { class: 'nm' }, m.name),
      h('span', { class: 'muted' }, `${m.width}×${m.height} · ${fmtBytes(m.bytes)}`),
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
      status.textContent = ok ? `${ok} image(s) uploaded.` : '';
      reload();
    }
    const drop = h('div', { class: 'drop' }, 'Drop images here or ', h('button', { class: 'btn sm', type: 'button', onclick: async () => upload(await filePicker(true)) }, 'choose files'),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, 'JPEG, PNG, WebP or GIF. Photos are resized to 1600 px and location data is removed before upload.'));
    drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = ev => { ev.preventDefault(); drop.classList.remove('over'); upload([...ev.dataTransfer.files]); };
    draw();
    page('THE LIBRARY', 'Media', null,
      h('div', { class: 'note', style: 'margin-top:14px' }, 'Uploaded images are private by default. An image becomes viewable to visitors only while it is used by something live: a live egg, a published scrapbook entry or an enabled drawer item. Anyone who gets that image\'s link can then open it, so a secret word is a surprise, not a lock.'),
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
    const replBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Replace image…');
    const delBtn = h('button', { class: 'btn danger', type: 'button' }, 'Delete');
    const usage = d.usage.length
      ? h('ul', {}, d.usage.map(u => h('li', {}, u.kind === 'egg' ? h('a', { href: '#eggs/' + u.id }, `Egg "${u.label}", step ${u.pos}${u.slot ? ' (' + u.slot + ')' : ''}`)
        : u.kind === 'scrapbook' ? h('a', { href: '#scrapbook/' + u.id }, `Scrapbook: ${u.label}`) : h('a', { href: '#drawer' }, `Junk drawer: ${u.label}`))))
      : h('p', { class: 'muted' }, 'Not used anywhere. Visitors cannot load it.');
    const img = h('img', { src: m.url, alt: m.alt, style: 'max-width:100%;max-height:50vh;display:block;margin:0 auto;background:#000' });
    const dlg = modal(m.name, [img,
      h('p', { class: 'mono small muted', style: 'text-align:center' }, `${m.width}×${m.height} · ${m.mime.replace('image/', '').toUpperCase()} · ${fmtBytes(m.bytes)} · added ${fmtDate(m.created_at)}`),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Name', name), h('label', { class: 'f' }, 'Tags', tags, h('span', { class: 'help' }, 'Comma separated'))),
      h('label', { class: 'f', style: 'margin-top:10px' }, 'Alt text', alt), h('label', { class: 'f', style: 'margin-top:10px' }, 'Caption / notes', caption),
      h('h3', { style: 'margin-top:16px' }, 'Where it is used'), usage,
      h('div', { class: 'row', style: 'margin-top:14px' }, saveBtn, replBtn, delBtn)]);
    saveBtn.onclick = () => guard(saveBtn, async () => {
      await cms('r=media&id=' + id, { method: 'PATCH', json: { name: name.value, alt: alt.value, caption: caption.value, tags: tags.value } });
      toast('Saved.'); dlg.close(); router();
    });
    replBtn.onclick = async () => {
      const [f] = await filePicker(false); if (!f) return;
      await guard(replBtn, async () => { await replaceFile(id, f); toast('Image replaced everywhere it is used.'); dlg.close(); router(); });
    };
    delBtn.onclick = async () => {
      let force = false;
      if (d.usage.length) {
        force = await confirmBox('This image is in use', h('div', {}, h('p', {}, 'Deleting it will:'), h('ul', {},
          d.usage.map(u => h('li', {}, u.kind === 'egg' ? `empty step ${u.pos} of egg "${u.label}" (the egg keeps working, visitors skip that step)`
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

  // ---------------------------------------------------------------- Site text
  VIEWS.text = async () => {
    const d = await cms('r=settings');
    const st = h('input', { type: 'text', value: d.settings.status || '', maxlength: 200, placeholder: 'Up late. Probably debugging something.' });
    const nl = h('input', { type: 'text', value: d.settings.now_listening || '', maxlength: 200, placeholder: 'Artist - Track' });
    const save = h('button', { class: 'btn', type: 'button' }, 'Save');
    save.onclick = () => guard(save, async () => { await cms('r=settings', { method: 'PUT', json: { status: st.value, now_listening: nl.value } }); toast('Saved. The home page shows it now.'); });
    page('THE SIGNS', 'Site text', 'Small bits of the home page that change often. Leave a field empty to fall back to the text written in index.html.',
      h('div', { class: 'panel' }, h('h2', {}, 'Home page sidebar'),
        h('label', { class: 'f' }, 'Status line', st), h('label', { class: 'f', style: 'margin-top:12px' }, 'Now listening', nl),
        h('div', { class: 'row', style: 'margin-top:14px' }, save)));
  };

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
