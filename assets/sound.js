/* NIKH.EXE sound. OFF by default; a visitor turns it on with the footer switch (remembered in their browser).
 * The small UI sounds are synthesised on the spot (no files, nothing to download).
 * Egg sounds are files from your media library and only play when sound is on. */
(function () {
  const KEY = 'nikh-sound';
  let on = false;
  try { on = localStorage.getItem(KEY) === 'on'; } catch { /* private mode */ }
  let ctx = null;
  const ac = () => {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // A short envelope-shaped tone.
  function tone(freq, start, dur, type = 'sine', vol = 0.12) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }

  // A short burst of filtered noise: vinyl crackle, a pin going in, a click.
  function noise(start, dur, vol = 0.08, freq = 2500, q = 0.8) {
    const c = ac(); if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + start;
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }

  let current = null;
  const api = {
    enabled: () => on,
    set(v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
      sync();
      if (on) api.chime();
      else if (current) { current.pause(); current = null; }
    },
    /** Two soft notes: the "secret found" sound. */
    chime() { if (!on) return; tone(784, 0, 0.18); tone(1175, 0.09, 0.3); },
    /** A low wooden knock for the junk drawer. */
    drawer() { if (!on) return; tone(140, 0, 0.12, 'triangle', 0.2); tone(95, 0.05, 0.16, 'triangle', 0.14); },
    /** Play a sound file from the media library. Falls back to the chime if it can't load. */
    play(url) {
      if (!on || !url) return;
      if (current) current.pause();
      current = new Audio(url);
      current.volume = 0.8;
      current.play().catch(() => api.chime());
    },
    stop() { if (current) { current.pause(); current = null; } },
    /** A soft click for buttons. */
    click() { if (!on) return; tone(1800, 0, 0.025, 'square', 0.025); },
    /** Two quick notes when a page opens, like an old menu cursor. */
    page() { if (!on) return; tone(660, 0, 0.05, 'square', 0.03); tone(990, 0.045, 0.06, 'square', 0.03); },
    /** The phone menu opening (up) or closing (down). */
    menu(open) { if (!on) return; tone(open ? 440 : 660, 0, 0.06, 'triangle', 0.08); tone(open ? 660 : 440, 0.05, 0.08, 'triangle', 0.08); },
    /** The needle landing on a record: a thump, then crackle. */
    needle() {
      if (!on) return; tone(70, 0, 0.18, 'sine', 0.25); noise(0.03, 0.12, 0.12, 900, 1.5);
      for (let i = 0; i < 7; i++) noise(0.18 + Math.random() * 1.2, 0.015, 0.06 + Math.random() * 0.05, 3000 + Math.random() * 2500, 2);
    },
    /** A pushpin going into cork. */
    pin() { if (!on) return; noise(0, 0.05, 0.25, 1400, 2); tone(220, 0.01, 0.08, 'triangle', 0.1); },
    /** Something copied or saved. */
    ok() { if (!on) return; tone(1046, 0, 0.07, 'square', 0.04); tone(1568, 0.06, 0.12, 'square', 0.04); },
    /** A notebook page turning. */
    flip() { if (!on) return; noise(0, 0.22, 0.09, 2200, 0.5); noise(0.08, 0.12, 0.05, 4000, 0.7); },
    /** An old pager going off. */
    pager() { if (!on) return; for (let i = 0; i < 3; i++) { tone(2093, i * 0.16, 0.08, 'square', 0.05); tone(2637, i * 0.16 + 0.07, 0.06, 'square', 0.05); } },
    /** A short game sound effect (arcade). */
    blip(freq, dur = 0.08, type = 'square') { if (!on) return; tone(freq, 0, dur, type, 0.06); }
  };

  function sync() {
    document.querySelectorAll('[data-snd]').forEach(b => {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? '🔊 sound on' : '🔇 sound off';
    });
  }
  // Small sounds for the whole site. Games make their own, so nothing extra inside the arcade cabinet.
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('[data-snd]')) return api.set(!on);
    if (!on || e.target.closest('.cabinet, #menu-btn, #menu-x')) return;
    const t = e.target.closest('[data-play]');
    if (t) return api.needle();
    if (e.target.closest('.zcopy, #copy88')) return api.ok();
    if (e.target.closest('button, .btn, nav a, .menu-list a')) api.click();
  });
  addEventListener('hashchange', () => api.page());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  window.NikhSound = api;
})();
