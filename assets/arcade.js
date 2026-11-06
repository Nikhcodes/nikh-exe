/* NIKH.EXE Arcade: three small original games with server-checked leaderboards.
 *   Night Shift  - on-call simulator: acknowledge alerts before they turn into outages
 *   Packet Snake - snake, but you're a network cable eating packets
 *   Crate Match  - memory game with photos from the junk drawer
 * NikhArcade.mount(element) builds the arcade inside element and returns a stop() function.
 * Games run on game time (requestAnimationFrame), so they pause by themselves when the tab is hidden.
 */
(function () {
  const API = 'api/arcade';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = (f, d, t) => { const S = window.NikhSound; if (S && S.blip) S.blip(f, d, t); };
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  };
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

  const GAMES = [
    { id: 'nightshift', name: 'Night Shift', tag: 'ON-CALL SIMULATOR', blurb: "It's 3 a.m. Servers start throwing alerts. Acknowledge WARNINGs, firefight CRITICALs, don't touch the healthy ones. Three outages and you're fired.",
      controls: 'Click or tap a server · keyboard: Q W E / A S D / Z X C' },
    { id: 'snake', name: 'Packet Snake', tag: 'CABLE MANAGEMENT', blurb: "You're a network cable. Eat packets, grow longer, don't trip over yourself or the rack.",
      controls: 'Arrow keys or WASD · swipe or use the pad on phones' },
    { id: 'match', name: 'Crate Match', tag: 'MEMORY', blurb: 'Flip two at a time and find the pairs from the junk drawer. Faster and fewer misses means more points.',
      controls: 'Click or tap cards · keyboard: Tab + Enter' }
  ];

  async function post(r, body) {
    const res = await fetch(`${API}?r=${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'The arcade server did not answer.');
    return d;
  }

  // ------------------------------------------------------------------ game loop helper
  function loop(step) {
    let raf = 0, last = 0, stopped = false;
    const frame = t => {
      if (stopped) return;
      const dt = last ? Math.min(100, t - last) : 16; // clamp: a hidden tab never jumps ahead
      last = t;
      step(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => { last = 0; };
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }

  // ------------------------------------------------------------------ Night Shift
  function nightshift(stage, g) {
    const KEYS = 'qweasdzxc';
    const grid = el('div', { class: 'ns-grid', role: 'group', 'aria-label': 'Servers' });
    const flash = el('p', { class: 'ns-flash', 'aria-live': 'polite' });
    const servers = [...Array(9)].map((_, i) => {
      const b = el('button', { class: 'srv ok', type: 'button', 'aria-label': `Server ${i + 1}: healthy` },
        el('span', { class: 'srv-name' }, `SRV-0${i + 1}`), el('span', { class: 'srv-state' }, 'OK'), el('kbd', {}, KEYS[i].toUpperCase()));
      const s = { b, state: 'ok', until: 0 };
      b.addEventListener('click', () => hit(s));
      grid.append(b);
      return s;
    });
    stage.replaceChildren(grid, flash);
    let time = 0, nextSpawn = 800, score = 0, lives = 3, streak = 0, over = false;
    g.setLives(lives); g.setScore(0);
    const set = (s, state, until) => {
      s.state = state; s.until = until;
      s.b.className = 'srv ' + state;
      s.b.querySelector('.srv-state').textContent = { ok: 'OK', warn: 'WARNING', crit: 'CRITICAL', down: 'OUTAGE', ack: 'ACK' }[state];
      s.b.setAttribute('aria-label', `Server ${servers.indexOf(s) + 1}: ${state === 'ok' || state === 'ack' ? 'healthy' : state === 'warn' ? 'warning' : state === 'crit' ? 'critical' : 'outage'}`);
    };
    const say = t => { flash.textContent = t; };
    function hit(s) {
      if (over) return;
      if (s.state === 'warn' || s.state === 'crit') {
        const pts = s.state === 'crit' ? 3 : 1;
        streak++;
        score += pts + (streak % 10 === 0 ? 5 : 0);
        if (streak % 10 === 0) { say(`${streak} in a row! +5 bonus`); sfx(1046, 0.18); }
        sfx(s.state === 'crit' ? 784 : 587, 0.07, 'square');
        set(s, 'ack', time + 250);
      } else if (s.state === 'ok') {
        score = Math.max(0, score - 1); streak = 0; say('False alarm. -1'); sfx(180, 0.1, 'sawtooth');
      }
      g.setScore(score);
    }
    function onKey(e) {
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); hit(servers[i]); }
    }
    document.addEventListener('keydown', onKey);
    const stop = loop(dt => {
      if (over) return;
      time += dt;
      const sec = time / 1000;
      const spawnEvery = Math.max(380, 1150 - sec * 9);
      const warnT = Math.max(1300, 2400 - sec * 10);
      const critT = Math.max(1000, 1900 - sec * 8);
      g.setInfo(`shift ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
      for (const s of servers) {
        if (s.until && time >= s.until) {
          if (s.state === 'warn') set(s, 'crit', time + critT);
          else if (s.state === 'crit') {
            lives--; streak = 0; g.setLives(lives); say('OUTAGE! Customers are tweeting.'); sfx(110, 0.35, 'sawtooth');
            set(s, 'down', time + 1500);
            if (lives <= 0) { over = true; g.over(score); return; }
          } else set(s, 'ok', 0);
        }
      }
      if (time >= nextSpawn) {
        const idle = servers.filter(s => s.state === 'ok');
        if (idle.length) set(idle[Math.floor(Math.random() * idle.length)], 'warn', time + warnT);
        nextSpawn = time + spawnEvery * (0.7 + Math.random() * 0.6);
      }
    });
    return () => { over = true; stop(); document.removeEventListener('keydown', onKey); };
  }

  // ------------------------------------------------------------------ Packet Snake
  function snake(stage, g) {
    const N = 20;
    const canvas = el('canvas', { class: 'sn-canvas', width: 400, height: 400, role: 'img', 'aria-label': 'Packet Snake playing field' });
    const pad = el('div', { class: 'sn-pad', 'aria-label': 'Direction pad' },
      ...[['↑', 0, -1, 'up'], ['←', -1, 0, 'left'], ['↓', 0, 1, 'down'], ['→', 1, 0, 'right']].map(([t, x, y, n]) =>
        el('button', { type: 'button', class: 'sn-' + n, 'aria-label': n, onpointerdown: e => { e.preventDefault(); turn(x, y); } }, t)));
    stage.replaceChildren(canvas, pad);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 400 * dpr; canvas.height = 400 * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const C = 400 / N;
    let body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }], dir = { x: 1, y: 0 }, queue = [], food = null, score = 0, acc = 0, over = false;
    g.setScore(0); g.setLives(null);
    const place = () => {
      const free = [];
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!body.some(p => p.x === x && p.y === y)) free.push({ x, y });
      food = free[Math.floor(Math.random() * free.length)];
    };
    place();
    function turn(x, y) {
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (last.x === -x && last.y === -y) return; // no reversing into yourself
      if (last.x === x && last.y === y) return;
      if (queue.length < 2) queue.push({ x, y });
    }
    const KEYMAP = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    function onKey(e) {
      const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (k) { e.preventDefault(); turn(k[0], k[1]); }
    }
    document.addEventListener('keydown', onKey);
    let sx = 0, sy = 0;
    canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    canvas.addEventListener('pointerup', e => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
    });
    canvas.style.touchAction = 'none';
    function draw() {
      ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, 400, 400);
      ctx.strokeStyle = 'rgba(126,224,163,.06)'; ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) { ctx.beginPath(); ctx.moveTo(i * C, 0); ctx.lineTo(i * C, 400); ctx.moveTo(0, i * C); ctx.lineTo(400, i * C); ctx.stroke(); }
      ctx.fillStyle = '#e0a458'; ctx.fillRect(food.x * C + 4, food.y * C + 4, C - 8, C - 8);
      ctx.fillStyle = '#0d1018'; ctx.fillRect(food.x * C + 8, food.y * C + 8, 4, 4);
      body.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#b6f5cc' : i % 2 ? '#7ee0a3' : '#5fc489';
        ctx.fillRect(p.x * C + 1, p.y * C + 1, C - 2, C - 2);
      });
      const h = body[0];
      ctx.fillStyle = '#0d1018'; ctx.fillRect(h.x * C + C / 2 - 3 + dir.x * 4, h.y * C + C / 2 - 3 + dir.y * 4, 6, 6);
    }
    draw();
    const stop = loop(dt => {
      if (over) return;
      acc += dt;
      const stepMs = Math.max(70, 150 - score * 3);
      if (acc < stepMs) return;
      acc -= stepMs;
      if (queue.length) dir = queue.shift();
      const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      const ate = head.x === food.x && head.y === food.y;
      const hitsBody = body.slice(0, ate ? body.length : body.length - 1).some(p => p.x === head.x && p.y === head.y);
      if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || hitsBody) {
        over = true; sfx(110, 0.4, 'sawtooth'); draw(); g.over(score); return;
      }
      body.unshift(head);
      if (ate) { score++; g.setScore(score); sfx(660 + Math.min(score, 30) * 10, 0.06, 'square'); if (body.length >= N * N) { over = true; g.over(score); return; } place(); }
      else body.pop();
      g.setInfo(`length ${body.length}`);
      draw();
    });
    return () => { over = true; stop(); document.removeEventListener('keydown', onKey); };
  }

  // ------------------------------------------------------------------ Crate Match
  function match(stage, g) {
    const GLYPHS = ['♪', '★', '☾', '⚡', '☕', '✿'];
    const grid = el('div', { class: 'cm-grid', role: 'group', 'aria-label': 'Cards' });
    stage.replaceChildren(el('p', { class: 'ns-flash' }, 'Shuffling the crate...'));
    let cards = [], open = [], found = 0, misses = 0, startT = 0, time = 0, over = false, lock = false, started = false, stop = () => {};
    (async () => {
      let faces = [];
      try { const r = await fetch(`${API}?r=pool`); if (r.ok) faces = (await r.json()).images.slice(0, 6); } catch { /* fall back to glyphs */ }
      const useImg = faces.length >= 6;
      const deck = [...Array(6)].flatMap((_, i) => [i, i]).sort(() => Math.random() - 0.5);
      cards = deck.map((k, i) => {
        const face = useImg ? el('img', { src: faces[k].url, alt: faces[k].alt || `Picture ${k + 1}`, draggable: 'false' }) : el('span', { class: 'cm-glyph' }, GLYPHS[k]);
        const b = el('button', { class: 'cm-card', type: 'button', 'aria-label': `Card ${i + 1}, face down` }, el('span', { class: 'cm-back' }, 'N'), el('span', { class: 'cm-face' }, face));
        const c = { k, b, done: false };
        b.addEventListener('click', () => flip(c, i));
        return c;
      });
      grid.replaceChildren(...cards.map(c => c.b));
      stage.replaceChildren(grid);
      g.setScore(5000); g.setLives(null); g.setInfo('find 6 pairs');
    })();
    const scoreNow = () => Math.max(0, 5000 - Math.floor(time / 1000) * 40 - misses * 25);
    function flip(c, i) {
      if (over || lock || c.done || open.includes(c)) return;
      if (!started) {
        started = true; g.begin();
        stop = loop(dt => { if (!over) { time += dt; g.setScore(scoreNow()); g.setInfo(`${Math.floor(time / 1000)}s · ${misses} misses`); } });
      }
      c.b.classList.add('up'); c.b.setAttribute('aria-label', `Card ${i + 1}, face up`);
      sfx(520, 0.05, 'triangle');
      open.push(c);
      if (open.length < 2) return;
      const [a, b] = open;
      if (a.k === b.k) {
        a.done = b.done = true; a.b.classList.add('done'); b.b.classList.add('done'); open = []; found++;
        sfx(880, 0.12);
        if (found === 6) { over = true; stop(); g.over(scoreNow()); }
      } else {
        misses++; lock = true;
        setTimeout(() => { for (const x of [a, b]) { x.b.classList.remove('up'); x.b.setAttribute('aria-label', `Card ${cards.indexOf(x) + 1}, face down`); } open = []; lock = false; }, reduce() ? 500 : 750);
      }
    }
    return () => { over = true; stop(); };
  }

  const IMPL = { nightshift, snake, match };

  // ------------------------------------------------------------------ the cabinet
  function mount(root) {
    let boards = {}, stopGame = null, destroyed = false;
    const board = (id, mine) => {
      const rows = boards[id] || [];
      return el('ol', { class: 'hs' }, rows.length ? rows.map((r, i) => el('li', { class: mine && mine.initials === r.initials && mine.score === r.score && mine.rank === i + 1 ? 'me' : null },
        el('span', { class: 'hs-r' }, String(i + 1).padStart(2, '0')), el('span', { class: 'hs-i' }, r.initials), el('span', { class: 'hs-s' }, String(r.score)))) :
        el('li', { class: 'hs-empty' }, 'No scores yet. Be the first.'));
    };
    async function loadBoards() {
      try { const r = await fetch(`${API}?r=boards`); if (r.ok) boards = await r.json(); } catch { /* offline */ }
    }
    function lobby() {
      if (stopGame) { stopGame(); stopGame = null; }
      document.body.removeAttribute('data-playing');
      root.replaceChildren(el('div', { class: 'carts' }, GAMES.map(gm => {
        const top = (boards[gm.id] || [])[0];
        return el('article', { class: 'cart' },
          el('span', { class: 'cart-tag' }, gm.tag),
          el('h2', {}, gm.name),
          el('p', {}, gm.blurb),
          el('p', { class: 'cart-top' }, top ? `HI-SCORE ${top.initials} ${top.score}` : 'HI-SCORE ---'),
          el('button', { class: 'btn', type: 'button', onclick: () => play(gm.id) }, '▶ Play'));
      })));
    }
    function play(id) {
      const gm = GAMES.find(x => x.id === id);
      const score = el('b', {}, '0'), lives = el('span', { class: 'hud-lives' }), info = el('span', { class: 'hud-info' });
      const stage = el('div', { class: 'stage', tabindex: '-1' });
      const overlay = el('div', { class: 'overlay' });
      const side = el('aside', { class: 'side-board' }, el('h3', {}, 'HIGH SCORES'), board(id));
      const back = el('button', { class: 'btn ghost', type: 'button', onclick: () => { lobby(); } }, '← All games');
      root.replaceChildren(el('div', { class: 'cabinet' },
        el('div', { class: 'cab-head' }, back, el('h2', {}, gm.name), el('span', { class: 'cab-tag' }, gm.tag)),
        el('div', { class: 'cab-body' },
          el('div', { class: 'screen-wrap' },
            el('div', { class: 'hud' }, el('span', {}, 'SCORE ', score), lives, info),
            el('div', { class: 'screen' }, stage, overlay),
            el('p', { class: 'controls' }, gm.controls)),
          side)));
      let run = null, runP = null, t0 = 0;
      const api = {
        setScore: n => { score.textContent = String(n); },
        setLives: n => { lives.textContent = n == null ? '' : '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, 3 - n)); },
        setInfo: t => { info.textContent = t; },
        begin: () => { t0 = performance.now(); runP = post('start', { game: id }).then(d => (run = d.run)).catch(() => null); },
        over: async final => {
          document.body.removeAttribute('data-playing');
          const duration = Math.round(performance.now() - t0);
          await runP;
          showOver(final, duration);
        }
      };
      function showStart() {
        overlay.hidden = false;
        overlay.replaceChildren(el('p', { class: 'ov-big' }, gm.name.toUpperCase()), el('p', {}, gm.controls),
          el('button', { class: 'btn', type: 'button', onclick: begin }, 'PRESS START'));
        overlay.querySelector('button').focus();
      }
      function begin() {
        overlay.hidden = true;
        run = null; runP = null;
        document.body.setAttribute('data-playing', '1');
        if (stopGame) stopGame();
        stopGame = IMPL[id](stage, api);
        if (id !== 'match') api.begin(); // Crate Match starts its clock on the first flip
        stage.focus({ preventScroll: true });
      }
      function showOver(final, duration) {
        overlay.hidden = false;
        const msg = el('p', { class: 'ov-msg', role: 'status' });
        const again = el('button', { class: 'btn ghost', type: 'button', onclick: begin }, 'Play again');
        if (final > 0 && run) {
          const input = el('input', { class: 'initials', maxlength: '3', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Your initials (3 letters)', value: store.get('nikh-initials') || '' });
          input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); });
          const send = el('button', { class: 'btn', type: 'submit' }, 'Save score');
          const form = el('form', { class: 'ov-form' }, el('label', {}, 'ENTER YOUR INITIALS', input), send);
          form.addEventListener('submit', async e => {
            e.preventDefault();
            if (input.value.length !== 3) { msg.textContent = 'Three letters or numbers, please.'; return; }
            send.disabled = true; msg.textContent = 'Saving...';
            try {
              const d = await post('score', { run, initials: input.value, score: final, duration });
              store.set('nikh-initials', d.initials);
              boards[id] = d.board;
              side.replaceChildren(el('h3', {}, 'HIGH SCORES'), board(id, { initials: d.initials, score: final, rank: d.rank }));
              msg.textContent = d.rank <= 10 ? `You're #${d.rank} on the board!` : `Saved. You're #${d.rank}. Top 10 next time?`;
              if (d.rank <= 10) { sfx(784, 0.15); setTimeout(() => sfx(1175, 0.3), 120); }
              form.remove();
            } catch (err) { msg.textContent = err.message; send.disabled = false; }
          });
          overlay.replaceChildren(el('p', { class: 'ov-big' }, 'GAME OVER'), el('p', { class: 'ov-score' }, `SCORE ${final}`), form, msg, again);
          input.focus();
        } else {
          overlay.replaceChildren(el('p', { class: 'ov-big' }, 'GAME OVER'), el('p', { class: 'ov-score' }, `SCORE ${final}`),
            el('p', {}, run || final === 0 ? 'No score to save this time.' : 'Scores could not be saved (the arcade server is offline).'), again);
          again.focus();
        }
      }
      showStart();
    }
    loadBoards().then(() => { if (!destroyed && !stopGame && root.querySelector('.carts')) lobby(); });
    lobby();
    return () => { destroyed = true; if (stopGame) stopGame(); document.body.removeAttribute('data-playing'); };
  }

  window.NikhArcade = { mount };
})();
