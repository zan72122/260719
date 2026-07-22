'use strict';

/*
 * ちょきちょきのき — Prune 風の木そだてゲーム（4歳向け）
 * ・タップで種をうえると、木がひとりでにのびていく
 * ・えだを指でなぞると「ちょきん」と切れて、のこりが太陽へむかう
 * ・太陽のひかりのなかで花がさく。決められた数さいたらクリア
 * ・まけ・失敗なし。切りすぎても切り株から新しい芽が出る
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- DOM ----------
  const ui = document.getElementById('ui');
  const goalbar = document.getElementById('goalbar');
  const btnHome = document.getElementById('btnHome');
  const btnReplant = document.getElementById('btnReplant');
  const btnSound = document.getElementById('btnSound');
  const hintEl = document.getElementById('hint');
  const hintText = document.getElementById('hintText');
  const titleScreen = document.getElementById('titleScreen');
  const btnStart = document.getElementById('btnStart');
  const levelDots = document.getElementById('levelDots');
  const clearScreen = document.getElementById('clearScreen');
  const clearFlower = document.getElementById('clearFlower');
  const clearText = document.getElementById('clearText');
  const btnNext = document.getElementById('btnNext');

  // ---------- 保存 ----------
  const LS_KEY = 'chokichoki-tree-v1';
  let saved = { unlocked: 0, muted: false };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) saved = Object.assign(saved, JSON.parse(raw));
  } catch (e) { /* プライベートモードなどでは保存なしで動く */ }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch (e) {}
  }
  Sound.setMuted(saved.muted);

  // ---------- 状態 ----------
  let W = 0, H = 0, S = 0;
  let state = 'title'; // title | preplant | grow | clear
  let levelIdx = 0, level = null, pal = null;
  let sun = { x: 0, y: 0, r: 0 };
  let clouds = [];
  let stars = [];
  let seed = { x: 0, y: 0 };
  let groundY = 0;
  let tree = null;
  let bloomCount = 0;
  let falling = [];
  let particles = [];
  const trails = new Map();   // pointerId -> [{x,y,t}]
  const prevPt = new Map();   // pointerId -> {x,y}
  let timeNow = 0;
  let lastInteract = 0;
  let hintMode = '';

  // ---------- レイアウト ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function computeLayout() {
    groundY = H - Math.max(H * 0.08, S * 0.09);
    seed = { x: W * 0.5, y: groundY };
    if (!level) return;
    sun = { x: level.sun.x * W, y: level.sun.y * H, r: level.sun.r * S };
    clouds = level.clouds.map((c) => ({
      x: c.x * W, y: c.y * H, r: c.r * S, phase: c.x * 7 + c.y * 3,
    }));
    stars = [];
    if (pal && pal.stars) {
      const rnd = mulberry32(levelIdx * 999 + 7);
      for (let i = 0; i < 70; i++) {
        stars.push({ rx: rnd(), ry: rnd() * 0.72, sz: 0.6 + rnd(), phase: rnd() * 6.28 });
      }
    }
  }

  function resize() {
    const pw = W, ph = H;
    W = window.innerWidth;
    H = window.innerHeight;
    S = Math.min(W, H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeLayout();
    if (tree && pw > 0 && ph > 0) {
      const fx = W / pw, fy = H / ph;
      tree.scaleWorld(fx, fy);
      for (const f of falling) { f.x *= fx; f.y *= fy; }
      for (const p of particles) { p.x *= fx; p.y *= fy; }
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ---------- ゴール表示 ----------
  function buildGoalbar() {
    goalbar.innerHTML = '';
    for (let i = 0; i < level.goal; i++) {
      const sp = document.createElement('span');
      sp.className = 'slot';
      sp.textContent = '🌸';
      goalbar.appendChild(sp);
    }
    updateGoalbar();
  }
  function updateGoalbar() {
    [...goalbar.children].forEach((sp, i) => {
      sp.classList.toggle('filled', i < bloomCount);
    });
  }

  // ---------- ヒント ----------
  function showHint(mode, x, y, text) {
    hintMode = mode;
    hintEl.classList.remove('hidden', 'tap', 'swipe');
    hintEl.classList.add(mode);
    hintEl.style.left = x + 'px';
    hintEl.style.top = y + 'px';
    hintText.textContent = text;
  }
  function hideHint() {
    hintMode = '';
    hintEl.classList.add('hidden');
  }

  function updateHint() {
    if (state === 'preplant') {
      showHint('tap', seed.x, Math.max(70, seed.y - S * 0.1), 'たっぷ してね');
      return;
    }
    if (state === 'grow' && timeNow - lastInteract > 8 && !tree.anyGrowing() && bloomCount < level.goal) {
      const c = tree.tipCenter();
      if (c) {
        showHint('swipe', c.x, c.y, 'えだを なぞって ちょきちょき！');
        return;
      }
    }
    if (hintMode) hideHint();
  }

  // ---------- パーティクル ----------
  function petalBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = S * (0.05 + Math.random() * 0.12);
      particles.push({
        type: 'petal', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - S * 0.06,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6,
        size: S * (0.008 + Math.random() * 0.008),
        color: pal.petals[Math.floor(Math.random() * pal.petals.length)],
        age: 0, life: 1.2 + Math.random() * 0.8,
        wob: Math.random() * 6.28,
      });
    }
  }
  function sparkBurst(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = S * (0.1 + Math.random() * 0.2);
      particles.push({
        type: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: 0, vr: 0,
        size: S * (0.003 + Math.random() * 0.003),
        color: '#fffbe8',
        age: 0, life: 0.25 + Math.random() * 0.15, wob: 0,
      });
    }
  }
  function puffBurst(x, y) {
    for (let i = 0; i < 4; i++) {
      particles.push({
        type: 'puff', x: x + (Math.random() - 0.5) * S * 0.02, y,
        vx: (Math.random() - 0.5) * S * 0.02, vy: -S * 0.02,
        rot: 0, vr: 0,
        size: S * (0.006 + Math.random() * 0.006),
        color: '#9aa3ab',
        age: 0, life: 0.8, wob: 0,
      });
    }
  }

  // ---------- レベル進行 ----------
  function setScreen(which) {
    titleScreen.classList.toggle('hidden', which !== 'title');
    clearScreen.classList.toggle('hidden', which !== 'clear');
    ui.classList.toggle('hidden', which === 'title');
  }

  function buildLevelDots() {
    levelDots.innerHTML = '';
    LEVELS.forEach((_, i) => {
      const b = document.createElement('button');
      b.textContent = i + 1;
      const locked = i > saved.unlocked;
      if (locked) b.classList.add('locked');
      b.addEventListener('click', () => {
        if (locked) return;
        Sound.unlock(); Sound.click();
        startLevel(i);
      });
      levelDots.appendChild(b);
    });
  }

  function showTitle() {
    state = 'title';
    tree = null;
    hideHint();
    buildLevelDots();
    setScreen('title');
  }

  function startLevel(i) {
    levelIdx = i;
    level = LEVELS[i];
    pal = PALETTES[level.pal];
    computeLayout();
    bloomCount = 0;
    falling = [];
    particles = [];
    trails.clear();
    prevPt.clear();
    tree = createTree({
      s: () => S,
      W: () => W,
      H: () => H,
      sun: () => sun,
      clouds: () => clouds,
      groundY: () => groundY,
      seed: () => seed,
      onSplit: () => Sound.split(),
      onBloom: (b) => {
        bloomCount++;
        updateGoalbar();
        Sound.bloom(bloomCount);
        petalBurst(b.flower.x, b.flower.y, 10);
        if (bloomCount >= level.goal && state === 'grow') winLevel();
      },
      onWilt: (b) => {
        Sound.wilt();
        const tip = b.pts[b.pts.length - 1];
        puffBurst(tip.x, tip.y);
      },
    });
    state = 'preplant';
    lastInteract = timeNow;
    buildGoalbar();
    setScreen('game');
  }

  function plant() {
    tree.plant();
    state = 'grow';
    lastInteract = timeNow;
    Sound.plant();
    hideHint();
  }

  function winLevel() {
    state = 'clear';
    hideHint();
    saved.unlocked = Math.max(saved.unlocked, Math.min(levelIdx + 1, LEVELS.length - 1));
    const isLast = levelIdx === LEVELS.length - 1;
    if (isLast) saved.unlocked = LEVELS.length - 1;
    save();
    if (isLast) {
      Sound.allclear();
      clearFlower.textContent = '🌈';
      clearText.textContent = 'ぜんぶ さいた！';
      btnNext.textContent = 'さいしょから ▶';
    } else {
      Sound.fanfare();
      clearFlower.textContent = '🌸';
      clearText.textContent = 'できた！';
      btnNext.textContent = 'つぎへ ▶';
    }
    setTimeout(() => {
      if (state === 'clear') setScreen('clear');
    }, 1000);
  }

  function nextLevel() {
    if (levelIdx + 1 < LEVELS.length) startLevel(levelIdx + 1);
    else showTitle();
  }

  // ---------- 入力 ----------
  function doCutsAlong(ax, ay, bx, by) {
    const hitR = Math.max(18, S * 0.03);
    for (let n = 0; n < 4; n++) {
      const hit = tree.findCut(ax, ay, bx, by, hitR);
      if (!hit) break;
      const res = tree.cutAt(hit.branch, hit.index, timeNow);
      Sound.snip();
      sparkBurst(res.cutPt.x, res.cutPt.y);
      if (res.bloomsLost > 0) {
        bloomCount = Math.max(0, bloomCount - res.bloomsLost);
        updateGoalbar();
        Sound.unbloom();
      }
      falling.push({
        x: res.cutPt.x, y: res.cutPt.y,
        vx: (Math.random() - 0.5) * S * 0.06,
        vy: -S * 0.03,
        rot: 0, vr: (Math.random() - 0.5) * 2.4,
        polys: res.polys, flowers: res.flowers, age: 0,
      });
      lastInteract = timeNow;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    lastInteract = timeNow;
    if (state === 'preplant') {
      plant();
      return;
    }
    if (state === 'grow') {
      const p = { x: e.clientX, y: e.clientY };
      prevPt.set(e.pointerId, p);
      trails.set(e.pointerId, [{ x: p.x, y: p.y, t: timeNow }]);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'grow') return;
    const prev = prevPt.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    doCutsAlong(prev.x, prev.y, cur.x, cur.y);
    const tr = trails.get(e.pointerId);
    if (tr) {
      tr.push({ x: cur.x, y: cur.y, t: timeNow });
      if (tr.length > 40) tr.shift();
    }
    prevPt.set(e.pointerId, cur);
  });

  function endPointer(e) {
    prevPt.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  ['gesturestart', 'dblclick'].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // ---------- ボタン ----------
  btnStart.addEventListener('click', () => {
    Sound.unlock(); Sound.click();
    startLevel(Math.min(saved.unlocked, LEVELS.length - 1));
  });
  btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    Sound.unlock(); Sound.click();
    if (levelIdx === LEVELS.length - 1 && clearText.textContent === 'ぜんぶ さいた！') {
      showTitle();
    } else {
      nextLevel();
    }
  });
  clearScreen.addEventListener('click', () => {
    Sound.unlock();
    if (levelIdx === LEVELS.length - 1) showTitle();
    else nextLevel();
  });
  btnReplant.addEventListener('click', () => {
    Sound.unlock(); Sound.click();
    startLevel(levelIdx);
  });
  btnHome.addEventListener('click', () => {
    Sound.unlock(); Sound.click();
    showTitle();
  });
  btnSound.addEventListener('click', () => {
    saved.muted = !saved.muted;
    Sound.setMuted(saved.muted);
    btnSound.textContent = saved.muted ? '🔇' : '🔊';
    save();
    Sound.unlock(); Sound.click();
  });
  btnSound.textContent = saved.muted ? '🔇' : '🔊';

  // ---------- 更新 ----------
  function update(dt) {
    if ((state === 'grow' || state === 'clear') && tree) {
      tree.update(dt, timeNow);
    }

    // 切りおとした枝の落下
    for (const f of falling) {
      f.age += dt;
      f.vy += S * 2.0 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    falling = falling.filter((f) => f.age < 1.6);

    // パーティクル
    for (const p of particles) {
      p.age += dt;
      if (p.type === 'petal') {
        p.vy += S * 0.25 * dt;
        p.vx *= 0.985;
        p.wob += dt * 5;
        p.x += p.vx * dt + Math.sin(p.wob) * S * 0.015 * dt * 10;
      } else {
        p.x += p.vx * dt;
      }
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    particles = particles.filter((p) => p.age < p.life);

    // クリア中は花びらの雨
    if (state === 'clear' && particles.length < 160 && Math.random() < dt * 14) {
      particles.push({
        type: 'petal', x: Math.random() * W, y: -20,
        vx: (Math.random() - 0.5) * S * 0.03, vy: S * (0.08 + Math.random() * 0.08),
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 4,
        size: S * (0.008 + Math.random() * 0.01),
        color: pal.petals[Math.floor(Math.random() * pal.petals.length)],
        age: 0, life: 4, wob: Math.random() * 6.28,
      });
    }

    // 古いスワイプ軌跡を消す
    for (const [id, tr] of trails) {
      while (tr.length && timeNow - tr[0].t > 0.35) tr.shift();
      if (!tr.length && !prevPt.has(id)) trails.delete(id);
    }

    if (state === 'preplant' || state === 'grow') updateHint();
  }

  // ---------- 描画 ----------
  function sway(p) {
    return Math.sin(timeNow * 0.9 + p.y * 0.004) * S * 0.004 * ((groundY - p.y) / H);
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (stars.length) {
      ctx.fillStyle = '#fff';
      for (const st of stars) {
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(timeNow * 1.8 + st.phase);
        const r = st.sz * S * 0.0035;
        ctx.beginPath();
        ctx.arc(st.rx * W, st.ry * H, r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSun() {
    // ひかりのエリア（ここに入ると花がさく）
    const g = ctx.createRadialGradient(sun.x, sun.y, sun.r * 0.1, sun.x, sun.y, sun.r * 1.45);
    g.addColorStop(0, pal.sunGlow + 'cc');
    g.addColorStop(0.6, pal.sunGlow + '55');
    g.addColorStop(1, pal.sunGlow + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.r * 1.45, 0, 6.283);
    ctx.fill();

    // ねらいの輪（くるくるまわる点線）
    ctx.strokeStyle = pal.sunGlow;
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(timeNow * 2);
    ctx.lineWidth = Math.max(2, S * 0.005);
    ctx.setLineDash([S * 0.025, S * 0.02]);
    ctx.lineDashOffset = -timeNow * S * 0.03;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.r, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 太陽（よるはお月さま）
    const cr = sun.r * 0.34;
    ctx.fillStyle = pal.sunCore;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, cr, 0, 6.283);
    ctx.fill();
    if (!pal.stars) {
      ctx.strokeStyle = pal.sunCore;
      ctx.lineWidth = Math.max(2, S * 0.006);
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = timeNow * 0.25 + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(sun.x + Math.cos(a) * cr * 1.35, sun.y + Math.sin(a) * cr * 1.35);
        ctx.lineTo(sun.x + Math.cos(a) * cr * 1.75, sun.y + Math.sin(a) * cr * 1.75);
        ctx.stroke();
      }
    } else {
      // お月さまのクレーター
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.arc(sun.x - cr * 0.3, sun.y - cr * 0.2, cr * 0.22, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(sun.x + cr * 0.25, sun.y + cr * 0.3, cr * 0.16, 0, 6.283); ctx.fill();
    }
  }

  function drawCloud(c) {
    const bob = Math.sin(timeNow * 0.7 + c.phase) * S * 0.006;
    const y = c.y + bob;
    ctx.fillStyle = pal.cloud;
    ctx.globalAlpha = 0.92;
    const r = c.r;
    ctx.beginPath();
    ctx.arc(c.x, y, r * 0.62, 0, 6.283);
    ctx.arc(c.x - r * 0.55, y + r * 0.12, r * 0.45, 0, 6.283);
    ctx.arc(c.x + r * 0.55, y + r * 0.12, r * 0.45, 0, 6.283);
    ctx.arc(c.x + r * 0.1, y - r * 0.32, r * 0.42, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    ctx.fillStyle = pal.ground;
    ctx.beginPath();
    ctx.moveTo(0, groundY + S * 0.01);
    ctx.quadraticCurveTo(seed.x, groundY - S * 0.025, W, groundY + S * 0.01);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawSeed() {
    // たね
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.ellipse(seed.x, seed.y - S * 0.012, S * 0.014, S * 0.019, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#9be26f';
    ctx.beginPath();
    ctx.ellipse(seed.x - S * 0.012, seed.y - S * 0.04, S * 0.012, S * 0.006, -0.6, 0, 6.283);
    ctx.ellipse(seed.x + S * 0.012, seed.y - S * 0.04, S * 0.012, S * 0.006, 0.6, 0, 6.283);
    ctx.fill();
    // よんでいる輪
    const rr = S * 0.05 + Math.sin(timeNow * 3) * S * 0.012;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, S * 0.005);
    ctx.beginPath();
    ctx.arc(seed.x, seed.y - S * 0.02, rr, 0, 6.283);
    ctx.stroke();
  }

  function drawFlower(x, y, size, colorIdx, rot, t) {
    if (t <= 0) return;
    const e = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.35 : 1; // ぽんっとふくらむ
    const r = size * e * Math.min(1, t * 1.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (pal.stars) { // よるは花がほんのりひかる
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.1, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = pal.petals[colorIdx % pal.petals.length];
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(r * 0.85, 0, r * 0.8, r * 0.45, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = pal.center;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function drawTree() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of tree.branches) {
      if (b.pts.length < 2) continue;
      const wilt = b.state === 'wilted' ? b.wiltT : 0;
      ctx.strokeStyle = wilt > 0 ? '#8a9096' : pal.tree;
      ctx.lineWidth = tree.widthOf(b);
      ctx.beginPath();
      const p0 = b.pts[0];
      ctx.moveTo(p0.x + sway(p0), p0.y);
      for (let i = 1; i < b.pts.length; i++) {
        const p = b.pts[i];
        ctx.lineTo(p.x + sway(p), p.y);
      }
      ctx.stroke();
      if (wilt > 0) { // しょんぼりマーク
        const tip = b.pts[b.pts.length - 1];
        ctx.fillStyle = 'rgba(138,144,150,' + (0.5 * wilt) + ')';
        ctx.beginPath();
        ctx.arc(tip.x + sway(tip), tip.y + S * 0.008, S * 0.006, 0, 6.283);
        ctx.fill();
      }
    }
    // 花はえだの上にかさねる
    for (const b of tree.branches) {
      if (b.flower) {
        drawFlower(b.flower.x + sway(b.flower), b.flower.y,
          b.flower.size, b.flower.colorIdx, b.flower.rot, b.flower.t);
      }
    }
  }

  function drawFalling() {
    for (const f of falling) {
      const alpha = f.age < 0.9 ? 1 : Math.max(0, 1 - (f.age - 0.9) / 0.7);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.tree;
      for (const poly of f.polys) {
        ctx.lineWidth = poly.w;
        ctx.beginPath();
        ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
        for (let i = 1; i < poly.pts.length; i++) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
        ctx.stroke();
      }
      for (const fl of f.flowers) {
        drawFlower(fl.x, fl.y, fl.size, fl.colorIdx, fl.rot, 1);
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.type === 'petal') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.283);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.type === 'puff' ? 1 + p.age : 1), 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTrails() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of trails.values()) {
      if (tr.length < 2) continue;
      const fade = Math.max(0, 1 - (timeNow - tr[0].t) / 0.35);
      for (const pass of [[S * 0.014, 0.12], [S * 0.006, 0.45]]) {
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = pass[1] * (0.4 + 0.6 * fade);
        ctx.lineWidth = pass[0];
        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (state === 'title' || !level) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    drawSky();
    drawSun();
    for (const c of clouds) drawCloud(c);
    drawGround();
    if (state === 'preplant') drawSeed();
    drawFalling();
    if (tree && tree.planted) drawTree();
    drawParticles();
    drawTrails();
  }

  // ---------- メインループ ----------
  let lastT = 0;
  function frame(tms) {
    requestAnimationFrame(frame);
    const t = tms / 1000;
    let dt = t - lastT;
    lastT = t;
    if (dt <= 0 || dt > 0.1) dt = 0.016;
    timeNow = t;
    update(dt);
    draw();
  }

  resize();
  showTitle();
  requestAnimationFrame(frame);
})();
