/* NIKH.EXE Easter egg engine (public side).
 * Triggers come from /api/public?r=config. Keyword triggers arrive only as SHA-256 hashes,
 * so the words themselves are not in the page source. The content of an egg is fetched
 * only after its trigger matched.
 *
 * Where triggers are listened for:
 *  - typing anywhere on the page, EXCEPT inside inputs, textareas, selects, editable areas
 *    and dialogs (so the guestbook, the prompt and passwords are never captured)
 *  - the footer prompt "C:\NIKH>" (works on phones, which have no keyboard to type on the page)
 *  - clicks on elements marked data-egg-target="..."
 */
(function () {
  const API = 'api/public';
  const FOUND_KEY = 'nikh-found';
  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const store = (k, fallback, area = localStorage) => { try { return JSON.parse(area.getItem(k)) ?? fallback; } catch { return fallback; } };
  const save = (k, v, area = localStorage) => { try { area.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nikh-egg:' + text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  let cfg = null;
  const ready = fetch(API + '?r=config', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(c => { cfg = c; document.dispatchEvent(new CustomEvent('nikh:config', { detail: c })); updateFound(); return c; });
  window.NikhSite = { ready };

  // ---------------------------------------------------------------- firing
  async function fire(egg, phrase) {
    const last = store('nikh-egg-last', {}, sessionStorage);
    const now = Date.now();
    if (egg.repeat === 'once_per_session' && last[egg.id]) return false;
    if (egg.cooldown && last[egg.id] && now - last[egg.id] < egg.cooldown * 1000) return false;
    last[egg.id] = now; save('nikh-egg-last', last, sessionStorage);
    try {
      const r = await fetch(API + '?r=reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: egg.id, phrase }) });
      if (!r.ok) return false;
      const data = await r.json();
      const shown = await window.NikhReveal.show(data);
      if (shown) markFound(egg.id);
      return shown;
    } catch { return false; }
  }

  function markFound(id) {
    const f = store(FOUND_KEY, []);
    if (!f.includes(id)) { f.push(id); save(FOUND_KEY, f.slice(-100)); }
    updateFound();
  }
  function updateFound() {
    const out = document.getElementById('found');
    if (!out || !cfg) return;
    const ids = new Set(cfg.eggs.map(e => e.id));
    const n = store(FOUND_KEY, []).filter(id => ids.has(id)).length;
    out.textContent = n ? `secrets found: ${n}/${ids.size}` : '';
  }

  // Built-in fallback for static hosting without the backend: the original "jam" toast.
  function fallback(text) {
    if (cfg || text.slice(-3) !== 'jam') return false;
    window.NikhReveal.show({ style: 'toast', message: 'Secret level unlocked. No prize, just vibes.', steps: [] });
    return true;
  }

  // ---------------------------------------------------------------- keywords
  async function matchKeyword(text, exact) {
    if (!cfg || !window.crypto?.subtle) return null;
    const chars = [...text];
    const cache = {};
    for (const egg of cfg.eggs) {           // already ordered: priority, then oldest
      if (egg.type !== 'keyword') continue;
      for (const k of egg.keys) {
        if (exact ? k.n !== chars.length : k.n > chars.length) continue;
        const part = chars.slice(chars.length - k.n).join('');
        if (exact && part !== text) continue;
        cache[part] = cache[part] || await sha(part);
        if (cache[part] === k.h) return { egg, phrase: part };
      }
    }
    return null;
  }

  const SKIP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog';
  let buf = [];
  addEventListener('keydown', async e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target instanceof Element && e.target.closest(SKIP)) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Backspace') { buf.pop(); return; }
    // Arrow keys count as characters, so a trigger like ↑↑↓↓←→←→ba (the Konami code) works.
    const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    const key = ARROWS[e.key] || e.key;
    if ([...key].length !== 1) return;
    const ch = key.toLowerCase();
    if (ch === ' ' && buf[buf.length - 1] === ' ') return;
    buf.push(ch); buf = buf.slice(-64);
    const text = buf.join('');
    if (fallback(text)) { buf = []; return; }
    const hit = await matchKeyword(text.normalize('NFKC'), false);
    if (hit && buf.join('') === text) { buf = []; fire(hit.egg, hit.phrase); }
  });

  // ---------------------------------------------------------------- footer prompt
  document.addEventListener('submit', async e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'prompt') return;
    e.preventDefault();
    const input = form.elements.cmd, out = document.getElementById('cmd-out');
    const text = norm(input.value);
    input.value = '';
    if (!text) { out.textContent = ''; return; }
    if (text === 'cls' || text === 'clear') { out.textContent = ''; return; }
    if (text === 'help' || text === '?' || text === 'hint' || text === 'hints') {
      await ready;
      const hints = cfg?.hints || [];
      out.textContent = hints.length ? 'Clues: ' + hints.map((h, i) => `(${i + 1}) ${h}`).join('  ') : 'No clues today. Keep looking.';
      return;
    }
    await ready;
    const hit = await matchKeyword(text, true);
    if (hit) { out.textContent = ''; if (!(await fire(hit.egg, hit.phrase))) out.textContent = 'Already found. Try again in a bit.'; return; }
    if (!cfg && text === 'jam') { fallback('jam'); out.textContent = ''; return; }
    out.textContent = `'${text.slice(0, 24)}' is not recognized as a command. Try: help`;
  });

  // ---------------------------------------------------------------- clicks and sequences
  const counts = {};
  let history = [];
  document.addEventListener('click', e => {
    if (!cfg || !(e.target instanceof Element)) return;
    const t = e.target.closest('[data-egg-target]');
    if (!t) return;
    const name = t.dataset.eggTarget, now = Date.now();
    const c = counts[name] = (counts[name] && now - counts[name].last < 1200) ? { n: counts[name].n + 1, last: now } : { n: 1, last: now };
    history = history.filter(h => now - h.at < 8000).concat({ name, at: now }).slice(-6);
    for (const egg of cfg.eggs) {
      if (egg.type === 'click' && egg.target === name && egg.count === c.n) {
        counts[name] = null; fire(egg); return;
      }
      if (egg.type === 'sequence') {
        const seq = egg.sequence, tail = history.slice(-seq.length).map(h => h.name);
        if (tail.length === seq.length && tail.every((x, i) => x === seq[i])) { history = []; fire(egg); return; }
      }
    }
  });
})();
