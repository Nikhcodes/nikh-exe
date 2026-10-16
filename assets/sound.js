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
    stop() { if (current) { current.pause(); current = null; } }
  };

  function sync() {
    const b = document.getElementById('snd');
    if (!b) return;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '🔊 sound on' : '🔇 sound off';
  }
  document.addEventListener('click', e => {
    if (e.target instanceof Element && e.target.closest('#snd')) api.set(!on);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  window.NikhSound = api;
})();
