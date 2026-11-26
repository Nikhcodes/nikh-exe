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
  window.NikhStrip = { draw, SCENES: Object.keys(SCENES) };
})();
