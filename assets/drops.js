/* NIKH.EXE photo drops: now and then a random photo from the junk drawer slides into the corner.
 * How often is set in Admin → Pages → Home → "Photo drops" (off / rare / once per visit / a few per visit).
 * Never while a pop-up is open or someone is typing; respects reduced motion; easy to dismiss.
 */
(function () {
  const PLAN = { off: [], rare: Math.random() < 0.35 ? [45] : [], sometimes: [35], often: [25, 140, 300] }; // seconds after arrival
  const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } };
  let started = false, shown = +(store('nikh-drops') || 0);

  function busy() {
    const a = document.activeElement;
    return document.hidden || document.querySelector('dialog[open]') ||
      (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  async function drop() {
    if (busy()) { setTimeout(drop, 8000); return; }
    let item;
    try {
      const r = await fetch('api/public?r=surprise&kind=image');
      if (!r.ok) return;
      item = (await r.json()).item;
    } catch { return; }
    if (!item || !item.url) return;
    store('nikh-drops', String(++shown));
    const card = document.createElement('figure');
    card.className = 'drop-card';
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', 'A photo from the junk drawer');
    const img = new Image();
    img.alt = item.alt || ''; img.decoding = 'async';
    if (item.w && item.h) { img.width = item.w; img.height = item.h; }
    const cap = document.createElement('figcaption');
    cap.textContent = item.caption || 'found this in the drawer';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'drop-x'; x.setAttribute('aria-label', 'Dismiss photo'); x.textContent = '×';
    card.append(x, img, cap);
    let timer;
    const close = () => { clearTimeout(timer); card.classList.remove('in'); setTimeout(() => card.remove(), 350); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, 14000); };
    x.onclick = close;
    img.onclick = () => card.classList.toggle('big');
    card.addEventListener('mouseenter', () => clearTimeout(timer));
    card.addEventListener('mouseleave', arm);
    card.addEventListener('focusin', () => clearTimeout(timer));
    img.onload = () => {
      document.body.append(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
      window.NikhSound && NikhSound.drawer();
      arm();
    };
    img.onerror = () => {};
    img.src = item.url;
  }

  function start(mode) {
    if (started) return;
    started = true;
    (PLAN[mode] || []).slice(shown).forEach(sec => setTimeout(drop, (sec + Math.random() * 15) * 1000));
  }

  document.addEventListener('nikh:config', ev => {
    const c = ev.detail;
    if (!c || !c.counts || !c.counts.surprise) return;
    const home = (c.content && c.content.home) || {};
    const mode = home.photoDrop || (window.NIKH_DEFAULTS && NIKH_DEFAULTS.home.photoDrop) || 'off';
    start(mode);
  });
})();
