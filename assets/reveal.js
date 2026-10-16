/* NIKH.EXE reveal component — shared by the public site and the admin preview.
 * NikhReveal.show({title, message, style:'card'|'toast', stepMs, sound, steps:[{url,w,h,alt,caption} | {empty:true,label}]}, {preview})
 * - Steps play in order (meme first, then the payoff). Images are preloaded; one that fails is skipped.
 * - Empty slots are skipped for visitors. In admin preview they show a labelled placeholder.
 * - Nothing opens if there is nothing to show.
 */
(function () {
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  function load(step) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.alt = step.alt || '';
      if (step.w && step.h) { img.width = step.w; img.height = step.h; }
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = step.url;
    });
  }

  let toastTimer;
  function toast(data) {
    let t = document.getElementById('rv-toast');
    if (!t) { t = el('div', 'rv-toast'); t.id = 'rv-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.append(t); }
    t.textContent = [data.title, data.message].filter(Boolean).join(' ');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
    return true;
  }

  /* Sound: visitors only hear it when they switched sound on (footer). The admin preview always plays the egg's own sound. */
  function sound(data, preview, dlg) {
    const S = window.NikhSound;
    if (preview) {
      if (!data.sound) return;
      const a = new Audio(data.sound); a.play().catch(() => {});
      if (dlg) dlg.addEventListener('close', () => a.pause());
      return;
    }
    if (!S || !S.enabled()) return;
    if (data.sound) { S.play(data.sound); if (dlg) dlg.addEventListener('close', () => S.stop()); }
    else S.chime();
  }

  let open = null;
  async function show(data, opts = {}) {
    const preview = !!opts.preview;
    if (open) open.close();
    const raw = (data.steps || []).filter(s => s && (s.url || (preview && s.empty)));
    if (data.style === 'toast' && !raw.length) {
      if (!(data.title || data.message)) return false;
      sound(data, preview, null);
      return toast(data);
    }

    // Load the first showable step before opening anything; later steps load in the background.
    const steps = raw.map(s => ({ ...s, img: null, ready: s.empty ? Promise.resolve('empty') : load(s) }));
    let first = -1;
    for (let i = 0; i < steps.length; i++) {
      const r = await steps[i].ready;
      if (r) { first = i; break; }
    }
    if (first < 0 && !data.title && !data.message) return false;

    const dlg = el('dialog', 'rv');
    dlg.setAttribute('aria-label', data.title || 'Secret found');
    const card = el('div', 'rv-card');
    const tape = el('span', 'rv-tape', preview ? 'ADMIN PREVIEW' : 'SECRET FOUND');
    const close = el('button', 'rv-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close');
    const stage = el('div', 'rv-stage');
    const cap = el('p', 'rv-cap');
    const foot = el('div', 'rv-foot');
    const dots = el('span', 'rv-dots');
    const next = el('button', 'rv-next', 'Next →'); next.type = 'button'; next.hidden = true;
    foot.append(dots, next);
    card.append(tape, close);
    if (data.title) card.append(el('h2', 'rv-title', data.title));
    card.append(stage, cap);
    if (data.message) card.append(el('p', 'rv-msg', data.message));
    card.append(foot);
    dlg.append(card);
    document.body.append(dlg);

    const shown = steps.map((_, i) => i).filter(i => i >= first && first >= 0);
    let idx = 0, timer = null;

    async function render(i) {
      const s = steps[shown[i]];
      let node;
      if (s.empty) {
        node = el('div', 'rv-empty');
        node.append(el('b', '', 'Empty slot' + (s.label ? ': ' + s.label : '')),
          el('span', '', 'Not set yet. Visitors skip this step and never see this box.'));
      } else {
        const img = await s.ready;
        if (!img) { // failed later image: drop it quietly and carry on
          shown.splice(i, 1);
          if (i < shown.length) return render(i);
          idx = shown.length - 1; next.hidden = true;
          dots.textContent = shown.length > 1 ? shown.map((_, k) => (k === idx ? '●' : '○')).join(' ') : '';
          return;
        }
        node = img;
      }
      stage.replaceChildren(node);
      if (!reduce()) { node.classList.add('rv-in'); }
      cap.textContent = s.caption || '';
      cap.hidden = !s.caption;
      dots.textContent = shown.length > 1 ? shown.map((_, k) => (k === i ? '●' : '○')).join(' ') : '';
      const more = i < shown.length - 1;
      next.hidden = !more;
      clearTimeout(timer);
      // Auto-advance unless the visitor prefers reduced motion (they get the Next button).
      if (more && !reduce()) timer = setTimeout(advance, Math.max(500, data.stepMs || 1600));
    }
    function advance() {
      if (idx < shown.length - 1) { idx++; render(idx); }
    }
    next.onclick = () => { clearTimeout(timer); advance(); next.hidden || next.focus(); };
    close.onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { clearTimeout(timer); dlg.remove(); if (open === dlg) open = null; });

    open = dlg;
    dlg.showModal();
    sound(data, preview, dlg);
    close.focus();
    if (shown.length) render(0); else { stage.remove(); cap.remove(); }
    return true;
  }

  window.NikhReveal = { show };
})();
