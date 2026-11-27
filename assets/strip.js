/* The after-hours strip: a small black-and-white comic starring the pixel guy from the home photo.
 * Every scene is drawn here in code, on a 64 x 48 pixel grid (no image files, nothing copied).
 * NikhStrip.draw(canvas, scene) paints one panel. NikhStrip.SCENES lists the scene names for the admin.
 */
(function () {
  const W = 64, H = 48;
  const C = {
    bg: '#d3d2cf', line: '#c7c6c2', floor: '#b3b2ae', k: '#151515', skin: '#ece8e1', skinD: '#bcb7ae',
    shirt: '#8d8d8d', shirtD: '#6f6f6f', pants: '#4b4b4b', pantsD: '#343434', wood: '#7b7b7b', woodD: '#5f5f5f',
    dark: '#2a2a2a', white: '#f6f6f4', amber: '#e0a458', red: '#b8343f', chair: '#5a5a5a'
  };
  let ctx;
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const bits = (x, y, rows, c) => rows.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') r(x + i, y + j, 1, 1, c); }));

  function room(floorY = 42) {
    r(0, 0, W, H, C.bg);
    for (let y = 1; y < floorY; y += 3) r(0, y, W, 1, C.line);
    r(0, floorY, W, H - floorY, C.floor);
    r(0, floorY, W, 1, C.k);
  }
  function head(x, y) { // y = top of the hair
    r(x + 2, y, 7, 3, C.k); r(x + 1, y + 1, 2, 6, C.k);
    r(x + 3, y + 3, 6, 6, C.skin); r(x + 3, y + 3, 4, 1, C.k);
    r(x + 7, y + 5, 1, 1, C.k); r(x + 3, y + 5, 1, 2, C.skinD);
    r(x + 4, y + 9, 3, 1, C.skinD);
  }
  function torso(x, y) { r(x + 1, y, 9, 10, C.shirt); r(x + 1, y, 2, 10, C.shirtD); }
  function standingLegs(x, y) { // y = feet line
    r(x + 2, y - 11, 3, 10, C.pants); r(x + 2, y - 11, 1, 10, C.pantsD); r(x + 6, y - 11, 3, 10, C.pants);
    r(x + 1, y - 1, 4, 1, C.k); r(x + 6, y - 1, 5, 1, C.k);
  }
  function guy(x, y, pose) { // standing, facing right, feet on y
    head(x, y - 31); torso(x, y - 21); standingLegs(x, y);
    if (pose === 'up') {
      r(x - 1, y - 31, 2, 10, C.shirtD); r(x - 1, y - 33, 2, 2, C.skin);
      r(x + 10, y - 31, 2, 10, C.shirt); r(x + 10, y - 33, 2, 2, C.skin);
    } else if (pose === 'shock') {
      r(x - 1, y - 26, 2, 6, C.shirtD); r(x - 1, y - 28, 2, 2, C.skin);
      r(x + 10, y - 26, 2, 6, C.shirt); r(x + 10, y - 28, 2, 2, C.skin);
    } else if (pose === 'mug') {
      r(x, y - 20, 2, 9, C.shirtD); r(x, y - 11, 2, 2, C.skin);
      r(x + 9, y - 20, 2, 5, C.shirt); r(x + 9, y - 16, 5, 2, C.shirt); r(x + 13, y - 17, 2, 2, C.skin);
      r(x + 14, y - 20, 4, 5, C.white); r(x + 14, y - 20, 4, 1, C.dark); r(x + 18, y - 19, 1, 3, C.white);
    } else {
      r(x, y - 20, 2, 9, C.shirtD); r(x, y - 11, 2, 2, C.skin);
      r(x + 9, y - 20, 2, 9, C.shirt); r(x + 9, y - 11, 2, 2, C.skin);
    }
  }
  function desk(x, y, w = 24) { // y = floor; desk top at y - 13
    r(x, y - 13, w, 2, C.wood); r(x, y - 11, w, 1, C.woodD);
    r(x + 1, y - 10, 2, 10, C.woodD); r(x + w - 3, y - 10, 2, 10, C.woodD);
  }
  function chair(x, y) { r(x, y - 22, 2, 22, C.chair); r(x, y - 10, 11, 2, C.chair); r(x + 5, y - 8, 2, 8, C.chair); }
  function laptop(x, y, glow = C.amber) { // y = desk top
    r(x, y - 1, 12, 1, C.dark); r(x + 10, y - 11, 2, 10, C.dark); r(x + 9, y - 10, 1, 8, glow);
  }
  function seated(x, y, typing = true) { // y = floor
    chair(x - 1, y);
    head(x, y - 31); torso(x, y - 21);
    r(x + 2, y - 11, 8, 3, C.pants); r(x + 8, y - 8, 3, 7, C.pants); r(x + 8, y - 1, 5, 1, C.k);
    if (typing) { r(x + 9, y - 19, 2, 5, C.shirt); r(x + 9, y - 15, 6, 2, C.shirt); r(x + 15, y - 15, 2, 2, C.skin); }
  }
  const note = (x, y) => { r(x, y + 3, 2, 2, C.amber); r(x + 1, y, 1, 4, C.amber); r(x + 2, y, 2, 1, C.amber); };
  const Z = (x, y, c = C.k) => bits(x, y, ['1111', '0010', '0100', '1111'], c);
  const bang = (x, y) => { r(x, y, 2, 5, C.red); r(x, y + 6, 2, 2, C.red); };
  const spark = (x, y) => bits(x, y, ['010', '111', '010'], C.amber);

  const SCENES = {
    desk() { room(); desk(26, 42); seated(14, 42); laptop(31, 29); },
    bug() {
      room(); desk(26, 42); seated(14, 42, false); laptop(31, 29, C.white);
      bits(39, 21, ['0101', '1111', '0110', '1001'], C.red); // a bug on the screen
      r(12, 20, 2, 7, C.shirtD); r(23, 19, 2, 2, C.skin); r(23, 21, 2, 6, C.shirt); bang(19, 2);
    },
    coffee() {
      room(); guy(20, 42, 'mug');
      r(36, 18, 1, 1, C.white); r(37, 16, 1, 1, C.white); r(36, 14, 1, 1, C.white);
      r(44, 30, 10, 12, C.dark); r(45, 31, 8, 4, C.white); r(46, 32, 2, 2, C.amber); // the coffee machine
    },
    ship() { room(); guy(26, 42, 'up'); spark(14, 8); spark(46, 6); spark(50, 20); spark(10, 22); },
    phones() {
      room(); guy(26, 42, 'stand');
      r(27, 10, 9, 1, C.k); r(26, 13, 2, 4, C.amber); r(35, 13, 2, 3, C.amber); // headphones
      note(14, 10); note(44, 6); note(48, 20);
    },
    sleep() {
      room(); desk(26, 42); chair(13, 42);
      r(15, 21, 9, 10, C.shirt); r(15, 21, 2, 10, C.shirtD); r(22, 22, 6, 4, C.shirt); // leaning in
      r(26, 23, 7, 2, C.k); r(27, 25, 5, 4, C.skin); r(24, 27, 10, 2, C.shirt); // head on the desk
      r(16, 31, 8, 3, C.pants); r(22, 34, 3, 7, C.pants); r(22, 41, 5, 1, C.k);
      laptop(37, 29, C.dark); Z(36, 12); Z(42, 6); Z(47, 1);
    }
  };

  // Seasonal extras: a Santa hat in December, a pumpkin in October. The hat sits on wherever the head was drawn.
  const HEAD = { desk: [14, 11], bug: [14, 11], coffee: [20, 11], ship: [26, 11], phones: [26, 11], sleep: [26, 21] };
  function hat(x, y) { r(x + 2, y - 3, 7, 3, C.red); r(x + 4, y - 5, 4, 2, C.red); r(x + 7, y - 6, 2, 2, C.red); r(x + 9, y - 6, 2, 2, C.white); r(x + 1, y - 1, 9, 2, C.white); }
  function pumpkin(x, y) { r(x, y - 5, 7, 5, '#c96a1b'); r(x + 1, y - 6, 5, 1, '#c96a1b'); r(x + 3, y - 8, 1, 2, C.k); r(x + 1, y - 4, 1, 1, C.k); r(x + 4, y - 4, 1, 1, C.k); r(x + 2, y - 2, 3, 1, C.k); }
  function draw(canvas, scene) {
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    const key = SCENES[scene] ? scene : 'desk';
    SCENES[key]();
    const season = document.body.dataset.season;
    if (season === 'december' && HEAD[key]) hat(...HEAD[key]);
    if (season === 'october') pumpkin(key === 'desk' || key === 'bug' || key === 'sleep' ? 44 : 50, key === 'desk' || key === 'bug' || key === 'sleep' ? 29 : 42);
  }

  /* The Home hero: the pixel guy's room at 96 x 64. The window follows the time in Paramaribo,
   * the record spins while music plays, and the lamp can be switched off. Call it again to animate. */
  const RW = 96, RH = 64;
  const STARS = [[11, 11], [16, 15], [22, 10], [27, 18], [13, 22], [30, 12], [19, 25], [25, 23]];
  function heroRoom(canvas, o) {
    if (canvas.width !== RW) { canvas.width = RW; canvas.height = RH; }
    ctx = canvas.getContext('2d');
    const h = o.hour, night = h < 6 || h >= 19, dusk = h >= 17 && h < 19, lamp = o.lamp !== false, t = o.t || 0;
    // wall, skirting, floor
    r(0, 0, RW, RH, night ? '#23262e' : '#3a3d47');
    for (let x = 3; x < RW; x += 8) r(x, 0, 1, 52, night ? '#26292f' : '#3e414b');
    r(0, 52, RW, 2, '#15171c'); r(0, 54, RW, RH - 54, '#1b1c21');
    for (let x = 0; x < RW; x += 12) r(x, 54, 1, 10, '#202128');
    // window with the sky outside
    r(7, 7, 30, 26, '#15171c');
    const sky = night ? '#101a2e' : dusk ? '#d9824e' : '#7fb0d8';
    r(9, 9, 26, 22, sky);
    if (dusk) { r(9, 22, 26, 9, '#e9a25a'); r(9, 27, 26, 4, '#f2c272'); }
    if (night) { STARS.forEach(([x, y], i) => r(x, y, 1, 1, (Math.floor(t / 900) + i) % 5 ? '#e8e3d6' : '#5a6580')); r(28, 11, 4, 4, '#f1e7d3'); r(30, 11, 2, 2, sky); }
    else if (!dusk) { r(26, 12, 5, 5, '#f6d36b'); r(12, 15, 8, 2, '#eef3f7'); r(14, 13, 4, 2, '#eef3f7'); }
    else { r(19, 22, 6, 3, '#ffd98a'); }
    r(21, 9, 2, 22, '#15171c'); r(9, 19, 26, 2, '#15171c');
    r(6, 33, 32, 2, '#55575f');
    if (o.season === 'december') [10, 14, 18, 22, 26, 30, 34].forEach((x, i) => r(x, 8 + (i % 2), 1, 1, ['#ff5a4f', '#7ee0a3', '#e0a458', '#7fb0ff'][(i + Math.floor(t / 600)) % 4]));
    // poster
    r(67, 4, 13, 15, '#6b1f2e'); r(69, 6, 9, 7, '#e0a458'); r(72, 8, 3, 3, '#6b1f2e'); r(69, 15, 9, 1, '#f1e7d3'); r(69, 17, 5, 1, '#f1e7d3');
    // side table with a little turntable
    r(4, 44, 18, 2, '#5f5f5f'); r(5, 46, 2, 8, '#4a4a4a'); r(19, 46, 2, 8, '#4a4a4a');
    r(5, 38, 16, 6, '#2c2015'); r(5, 38, 16, 1, '#4a3626');
    r(7, 39, 7, 4, '#0b0b0b'); r(10, 40, 1, 2, '#e0a458');
    if (o.playing) { const a = Math.floor(t / 120) % 4; r([8, 10, 12, 10][a], [41, 39, 41, 42][a] === 42 ? 42 : 40 + (a % 2), 1, 1, '#6a6a6a'); }
    r(16, 39, 1, 3, '#c9c9c9'); r(14 + (o.playing ? 0 : 1), 39, 2, 1, '#c9c9c9');
    if (o.playing && !o.still) { const n = Math.floor(t / 400) % 3; r(9 + n * 3, 34 - n, 1, 2, '#e0a458'); r(10 + n * 3, 33 - n, 1, 1, '#e0a458'); }
    // desk, monitor, lamp
    r(44, 41, 50, 2, '#6a6a6a'); r(44, 43, 50, 1, '#4a4a4a'); r(46, 44, 2, 10, '#4a4a4a'); r(90, 44, 2, 10, '#4a4a4a');
    r(62, 22, 24, 16, '#111'); r(63, 23, 22, 13, '#0a0f0c'); r(72, 38, 4, 3, '#222'); r(68, 40, 12, 1, '#222');
    const lines = [[65, 25, 9, '#7ee0a3'], [65, 27, 14, '#4f9d69'], [67, 29, 10, '#e0a458'], [67, 31, 12, '#4f9d69'], [65, 33, 6, '#7ee0a3']];
    const shown = o.still ? 5 : 1 + Math.floor(t / 700) % 6;
    lines.slice(0, shown).forEach(([x, y, w, c]) => r(x, y, w, 1, c));
    if (shown <= 5 && Math.floor(t / 450) % 2 === 0) { const l = lines[Math.min(shown, 5) - 1]; r(l[0] + l[2] + 1, l[1], 1, 1, '#f1e7d3'); }
    r(87, 30, 1, 11, '#3a3a3a'); r(85, 28, 6, 3, lamp ? '#e0a458' : '#555'); r(86, 41, 4, 1, '#3a3a3a');
    if (o.season === 'october') { r(54, 36, 6, 5, '#c96a1b'); r(56, 34, 1, 2, '#151515'); r(55, 38, 1, 1, '#ffcf6b'); r(58, 38, 1, 1, '#ffcf6b'); }
    // the guy at the desk (typing arms move a little)
    seated(46, 54, true);
    if (!o.still && Math.floor(t / 250) % 2) r(61, 39, 2, 2, C.skin);
    if (o.season === 'december') hat(46, 23);
    // lamp light, or the screen glow when the lamp is off
    ctx.globalCompositeOperation = 'source-over';
    if (lamp) { const g = ctx.createRadialGradient(88, 31, 1, 88, 31, 40); g.addColorStop(0, 'rgba(255,214,140,.35)'); g.addColorStop(1, 'rgba(255,214,140,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, RW, RH); }
    else { ctx.fillStyle = 'rgba(5,7,12,.45)'; ctx.fillRect(0, 0, RW, RH); const g = ctx.createRadialGradient(74, 30, 1, 74, 30, 26); g.addColorStop(0, 'rgba(126,224,163,.18)'); g.addColorStop(1, 'rgba(126,224,163,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, RW, RH); }
  }
  // Where the lamp is on the 96 x 64 grid, for click testing.
  const LAMP = { x: 83, y: 26, w: 10, h: 16 };
  window.NikhStrip = { draw, room: heroRoom, LAMP, SCENES: Object.keys(SCENES) };
})();
