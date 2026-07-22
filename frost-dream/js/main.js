'use strict';
/*
 * ひかりのたび v2 — メイン統合
 * 数万の光の粒でできた夢の世界。指で光の川を描いて群れを導き、
 * 押さえて渦を巻き、タップで波紋を起こし、長押しで形を咲かせる。
 */

(() => {
  const glCanvas = document.getElementById('gl');
  const fxCanvas = document.getElementById('fx');
  const fx = fxCanvas.getContext('2d');
  const titleEl = document.getElementById('title');
  const hudEl = document.getElementById('hud');
  const starBarEl = document.getElementById('starBar');
  const muteBtn = document.getElementById('muteBtn');
  const resetBtn = document.getElementById('resetBtn');
  const nameBtn = document.getElementById('nameBtn');
  const nameModal = document.getElementById('nameModal');
  const nameInput = document.getElementById('nameInput');
  const nameSave = document.getElementById('nameSave');
  const nameSkip = document.getElementById('nameSkip');

  const SAVE_THEME = 'hikariTabi.theme';
  const SAVE_STARS = 'hikariTabi.stars';
  const SAVE_NAME = 'hikariTabi.name';

  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function load(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }

  /* ---- レンダラ（WebGL → だめなら2D） ---- */
  let renderer = new GLRenderer(glCanvas);
  let isGL = !!renderer.ok;
  if (!isGL) renderer = new Canvas2DRenderer(glCanvas);

  const MAXN = 24000;
  let N = isGL ? 9000 : 2200;
  const sim = new Sim(MAXN);

  let W = 0, H = 0, DPR = 1;
  let state = 'title';                // title | play | celebrate | transition
  let themeIdx = 0;
  let theme = THEMES[0];
  let stars = 0;
  let childName = load(SAVE_NAME, '');

  let planets = [];
  let rivers = [];
  let pulses = [];
  const touches = new Map();
  let auroras = [];
  let auroraDefs = [];

  let elapsed = 0;
  let lastNow = performance.now();
  let bannerT = 99;
  let idleT = 0;
  let hint = null;
  let animalT = rand(30, 50);
  let titleFormT = 2.5;
  let fullPlanets = 0;
  let ct = 0;                          // celebrate timer
  let celebrateStep = 0;
  let fireworkT = 0;
  let fadeA = 0;                       // transition fade
  let fadeDir = 0;
  let frozenQuality = false;
  let frameAcc = 0, frameCnt = 0;

  /* ---- テーマ・惑星のセットアップ ---- */
  function setupAuroras() {
    auroraDefs = [];
    for (let i = 0; i < 3; i++) {
      auroraDefs.push({
        nx: rand(0.12, 0.88), ny: rand(0.08, 0.7),
        rf: rand(0.34, 0.6),
        colorF: theme.glowF[i % theme.glowF.length],
        ph: rand(TAU), spx: rand(0.05, 0.13), spy: rand(0.04, 0.1),
        ax: rand(0.05, 0.1), ay: rand(0.04, 0.08)
      });
    }
    auroras = auroraDefs.map(() => ({ x: 0, y: 0, r: 1, intensity: 0, colorF: [0, 0, 0] }));
  }

  function layoutPlanets() {
    for (const pl of planets) {
      pl.x = pl.nx * W;
      pl.y = pl.ny * H;
      pl.r = clamp(Math.min(W, H) * 0.072, 26, 56);
    }
  }

  function setupTheme(idx, reseed) {
    themeIdx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    theme = THEMES[themeIdx];
    save(SAVE_THEME, themeIdx);
    Formations.releaseAll(sim);
    rivers = [];
    pulses = [];
    hint = null;
    idleT = 0;
    bannerT = 0;
    fullPlanets = 0;
    animalT = rand(25, 45);
    setupAuroras();

    planets = [];
    const k = theme.species.length;
    const swarmPer = Math.floor((N - Math.floor(N * 0.3)) / k);
    const quota = clamp(Math.round(swarmPer * 0.42), 120, 850);
    const a0 = rand(TAU);
    for (let i = 0; i < k; i++) {
      const a = a0 + i * TAU / k;
      const sp = theme.species[i];
      planets.push({
        nx: clamp(0.5 + 0.37 * Math.cos(a), 0.13, 0.87),
        ny: clamp(0.5 + 0.36 * Math.sin(a), 0.15, 0.85),
        x: 0, y: 0, r: 40,
        specIdx: i, color: sp.color, colorF: sp.colorF,
        quota, captured: 0, full: false,
        pulse: 0, blink: 0, blinkT: rand(1.5, 4), noteIdx: i * 2 + (themeIdx % 3)
      });
    }
    layoutPlanets();
    if (reseed) sim.init(theme, W, H, N, planets);
  }

  /* ---- リサイズ ---- */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(W, H, DPR);
    fxCanvas.width = Math.round(W * DPR);
    fxCanvas.height = Math.round(H * DPR);
    fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sim.resize(W, H);
    layoutPlanets();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));

  /* ---- フォーメーションのヘルパー ---- */
  function fitScale(pts, maxWpx, maxHpx) {
    let aspect = 1;
    for (let i = 0; i < pts.length; i += 2) {
      const ax = Math.abs(pts[i]);
      if (ax > aspect) aspect = ax;
    }
    return Math.min(maxHpx / 2, maxWpx / (2 * aspect));
  }

  function spawnText(text, cx, cy, maxWr, maxHr, hold, maxPts) {
    const pts = Formations.sampleText(text, maxPts || 1600);
    if (!pts) return null;
    const sc = fitScale(pts, W * maxWr, H * maxHr);
    const f = Formations.start(sim, {
      pts,
      cx: clamp(cx, sc * 2, W - sc * 2),
      cy: clamp(cy, sc * 1.2, H - sc * 1.2),
      scale: sc, hold
    });
    if (f) AudioSys.formationChord();
    return f;
  }

  function spawnShape(name, cx, cy, scale, hold, drift) {
    const pts = Formations.sampleShape(name, 1400);
    if (!pts) return null;
    const f = Formations.start(sim, {
      pts, cx, cy, scale, hold,
      driftX: drift ? drift.x : 0,
      driftY: drift ? drift.y : 0,
      flipX: drift ? drift.x < 0 : false
    });
    if (f) AudioSys.formationChord();
    return f;
  }

  const TAP_SYMBOLS = ['heart', 'star', 'flower', 'rainbow'];
  const ANIMALS = ['whale', 'butterfly', 'bird', 'dragon'];

  /* ---- 入力 ---- */
  function onDown(id, x, y) {
    AudioSys.unlock();
    idleT = 0;
    hint = null;
    if (state === 'title') {
      if (!nameModal.classList.contains('hidden')) return;
      startGame();
      return;
    }
    touches.set(id, { x, y, sx: x, sy: y, age: 0, moved: 0, river: null, longFired: false });
  }

  function onMove(id, x, y) {
    const tc = touches.get(id);
    if (!tc) return;
    tc.moved += Math.hypot(x - tc.x, y - tc.y);
    tc.x = x; tc.y = y;
    if (!tc.river && tc.moved > 16) {
      // 光の川をつくる（3本まで・古いものから溶ける）
      while (rivers.filter(r => !r.evicted).length >= 3) {
        const old = rivers.find(r => !r.evicted);
        if (!old) break;
        old.evicted = true;
      }
      tc.river = { pts: [], age: 0, alpha: 1, evicted: false, lastX: tc.sx, lastY: tc.sy };
      addRiverPt(tc.river, tc.sx, tc.sy);
      rivers.push(tc.river);
    }
    if (tc.river) {
      const rv = tc.river;
      const d = Math.hypot(x - rv.lastX, y - rv.lastY);
      if (d >= 14 && rv.pts.length < 240) {
        addRiverPt(rv, x, y);
        AudioSys.sparkleTick(y / H);
      }
    }
  }

  function addRiverPt(rv, x, y) {
    let dx = x - rv.lastX, dy = y - rv.lastY;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
    rv.pts.push({ x, y, dx, dy });
    if (rv.pts.length === 2) { rv.pts[0].dx = dx; rv.pts[0].dy = dy; }
    rv.lastX = x; rv.lastY = y;
  }

  function onUp(id, x, y) {
    const tc = touches.get(id);
    touches.delete(id);
    if (!tc || state === 'title') return;
    if (!tc.river && !tc.longFired && tc.age < 0.35 && tc.moved < 16) {
      // タップ
      for (const pl of planets) {
        if (dist2(x, y, pl.x, pl.y) < (pl.r + 20) * (pl.r + 20)) {
          pl.pulse = 1;
          AudioSys.planetVoice(pl.noteIdx);
          return;
        }
      }
      pulses.push({ x, y, age: 0 });
      AudioSys.twinkle();
    }
  }

  if (window.PointerEvent) {
    glCanvas.addEventListener('pointerdown', e => { e.preventDefault(); onDown(e.pointerId, e.clientX, e.clientY); });
    glCanvas.addEventListener('pointermove', e => { e.preventDefault(); onMove(e.pointerId, e.clientX, e.clientY); });
    const up = e => { e.preventDefault(); onUp(e.pointerId, e.clientX, e.clientY); };
    glCanvas.addEventListener('pointerup', up);
    glCanvas.addEventListener('pointercancel', up);
  } else {
    const each = (e, fn) => {
      e.preventDefault();
      for (const t of e.changedTouches) fn(t.identifier, t.clientX, t.clientY);
    };
    glCanvas.addEventListener('touchstart', e => each(e, onDown), { passive: false });
    glCanvas.addEventListener('touchmove', e => each(e, onMove), { passive: false });
    glCanvas.addEventListener('touchend', e => each(e, onUp), { passive: false });
    glCanvas.addEventListener('touchcancel', e => each(e, onUp), { passive: false });
  }
  document.addEventListener('touchmove', e => { if (e.target === glCanvas) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  glCanvas.addEventListener('contextmenu', e => e.preventDefault());

  /* ---- HUD・なまえ ---- */
  muteBtn.addEventListener('click', () => {
    const m = !AudioSys.isMuted();
    AudioSys.setMuted(m);
    muteBtn.textContent = m ? '🔇' : '🔊';
  });
  resetBtn.addEventListener('click', () => {
    stars = 0;
    save(SAVE_STARS, 0);
    save(SAVE_THEME, 0);
    updateStarBar();
    if (state !== 'title') { state = 'play'; setupTheme(0, true); }
  });
  nameBtn.addEventListener('click', e => {
    e.stopPropagation();
    nameInput.value = childName;
    nameModal.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 50);
  });
  nameSave.addEventListener('click', () => {
    childName = nameInput.value.trim().slice(0, 6);
    save(SAVE_NAME, childName);
    nameModal.classList.add('hidden');
    nameInput.blur();
  });
  nameSkip.addEventListener('click', () => {
    nameModal.classList.add('hidden');
    nameInput.blur();
  });

  function updateStarBar() {
    starBarEl.textContent = stars <= 0 ? '' : (stars <= 8 ? '⭐'.repeat(stars) : '⭐×' + stars);
  }

  function startGame() {
    titleEl.classList.add('hidden');
    hudEl.classList.add('visible');
    frozenQuality = true;
    stars = parseInt(load(SAVE_STARS, '0'), 10) || 0;
    updateStarBar();
    state = 'play';
    setupTheme(parseInt(load(SAVE_THEME, '0'), 10) || 0, true);
  }

  /* ---- 更新 ---- */
  function update(dt, t) {
    // タッチの経過（長押しで形が咲く）
    for (const tc of touches.values()) {
      tc.age += dt;
      if (!tc.river && !tc.longFired && tc.age > 1.5 && tc.moved < 16 &&
          (state === 'play' || state === 'celebrate')) {
        tc.longFired = true;
        spawnShape(pick(TAP_SYMBOLS), tc.x, tc.y, Math.min(W, H) * rand(0.13, 0.18), 2.2);
      }
    }
    // 川の寿命
    for (let i = rivers.length - 1; i >= 0; i--) {
      const rv = rivers[i];
      rv.age += dt;
      if (rv.evicted) rv.alpha = Math.max(0, rv.alpha - dt / 1.3);
      else rv.alpha = rv.age < 22 ? 1 : Math.max(0, 1 - (rv.age - 22) / 18);
      if (rv.alpha <= 0) rivers.splice(i, 1);
    }
    // 波紋
    for (let i = pulses.length - 1; i >= 0; i--) {
      pulses[i].age += dt;
      if (pulses[i].age > 0.95) pulses.splice(i, 1);
    }
    // オーロラ
    for (let i = 0; i < 3; i++) {
      const d = auroraDefs[i], a = auroras[i];
      a.x = (d.nx + Math.sin(t * d.spx + d.ph) * d.ax) * W;
      a.y = (d.ny + Math.cos(t * d.spy + d.ph) * d.ay) * H;
      a.r = d.rf * Math.min(W, H) * (1 + Math.sin(t * 0.2 + d.ph) * 0.12);
      a.intensity = 0.16 + Math.sin(t * 0.3 + d.ph) * 0.05;
      a.colorF = d.colorF;
    }

    /* 状態ごとの演出 */
    if (state === 'title') {
      titleFormT -= dt;
      if (titleFormT <= 0) {
        titleFormT = 8;
        spawnShape(pick(['heart', 'star', 'flower']), W / 2, H * 0.62, Math.min(W, H) * 0.15, 2.4);
      }
    } else if (state === 'play') {
      bannerT += dt;
      // ときどき、群れが大きな生き物になって泳いでいく
      animalT -= dt;
      if (animalT <= 0) {
        animalT = rand(45, 80);
        const fromLeft = Math.random() < 0.5;
        const sc = Math.min(W, H) * rand(0.18, 0.24);
        spawnShape(pick(ANIMALS),
          fromLeft ? -sc * 2 : W + sc * 2,
          H * rand(0.22, 0.5), sc, 999,
          { x: fromLeft ? rand(42, 66) : -rand(42, 66), y: 0 });
      }
      // ヒント
      if (touches.size === 0) idleT += dt; else idleT = 0;
      if (idleT > 12 && !hint) makeHint();
      if (hint) { hint.t += dt / 2.4; if (hint.t > 1.3) hint.t = 0; }
      // ぜんぶ満ちた？
      if (planets.length && planets.every(p => p.full)) {
        state = 'celebrate';
        ct = 0; celebrateStep = 0; fireworkT = 0;
        stars++;
        save(SAVE_STARS, stars);
        updateStarBar();
        AudioSys.fanfare();
        hint = null;
      }
    } else if (state === 'celebrate') {
      ct += dt;
      fireworkT -= dt;
      if (fireworkT <= 0) {
        fireworkT = rand(0.4, 0.7);
        pulses.push({ x: rand(W * 0.15, W * 0.85), y: rand(H * 0.15, H * 0.6), age: 0 });
        AudioSys.chime(randInt(4, 11), { gain: 0.08 });
      }
      if (celebrateStep === 0 && ct > 0.8) {
        celebrateStep = 1;
        spawnText('やったね', W / 2, H * 0.42, 0.92, 0.3, 2.6, 2000);
      }
      if (celebrateStep === 1 && childName && ct > 4.6) {
        celebrateStep = 2;
        spawnText(childName, W / 2, H * 0.42, 0.92, 0.3, 2.6, 2000);
      }
      const endT = childName ? 8.6 : 5.4;
      if (ct > endT) { state = 'transition'; fadeDir = 1; }
    } else if (state === 'transition') {
      fadeA += fadeDir * dt / 0.8;
      if (fadeDir === 1 && fadeA >= 1) {
        fadeA = 1; fadeDir = -1;
        setupTheme(themeIdx + 1, true);
      } else if (fadeDir === -1 && fadeA <= 0) {
        fadeA = 0;
        state = 'play';
      }
    }

    /* 惑星の顔まわり */
    for (const pl of planets) {
      pl.pulse = Math.max(0, pl.pulse - dt * 2.2);
      pl.blinkT -= dt;
      if (pl.blinkT <= 0) { pl.blink = 0.16; pl.blinkT = rand(1.8, 4.5); }
      if (pl.blink > 0) pl.blink -= dt;
    }

    /* シミュレーション本体 */
    const env = {
      species: theme.species,
      touches: [...touches.values()],
      rivers, pulses, planets,
      events: sim.events
    };
    sim.step(dt, t, env);
    Formations.update(sim, dt, t, W, H);

    /* イベント処理 */
    if (sim.events.length) {
      for (const ev of sim.events) {
        if (ev.type === 'capture') {
          const pl = planets[ev.planet];
          if (!pl) continue;
          pl.pulse = Math.max(pl.pulse, 0.6);
          AudioSys.absorb(pl.captured / pl.quota);
          if (!pl.full && pl.captured >= pl.quota) {
            pl.full = true;
            fullPlanets++;
            AudioSys.bloom(pl.noteIdx);
            // 数字のフォーメーション（1, 2, 3…）
            const dx = W / 2 - pl.x, dy = H / 2 - pl.y;
            const dl = Math.hypot(dx, dy) || 1;
            const off = Math.min(W, H) * 0.24;
            spawnText(String(fullPlanets),
              pl.x + dx / dl * off, pl.y + dy / dl * off,
              0.4, 0.3, 2.0, 900);
          }
        }
      }
      sim.events.length = 0;
    }

    // 群れの活発さに応じたきらめき音
    AudioSys.shimmer(Math.min(0.5, rivers.length * 0.14 + touches.size * 0.18));
  }

  function makeHint() {
    const target = planets.find(p => !p.full);
    if (!target) return;
    let sx = 0, sy = 0, c = 0;
    for (let i = sim.dustN; i < sim.n; i++) {
      if (sim.mode[i] === 0 && sim.spec[i] === target.specIdx) {
        sx += sim.px[i]; sy += sim.py[i]; c++;
      }
    }
    if (c < 20) return;
    sx /= c; sy /= c;
    const mx = (sx + target.x) / 2, my = (sy + target.y) / 2;
    const dx = target.x - sx, dy = target.y - sy;
    const dl = Math.hypot(dx, dy) || 1;
    hint = { sx, sy, tx: target.x, ty: target.y, cx: mx - dy / dl * 90, cy: my + dx / dl * 90, t: 0 };
  }

  /* ---- 描画 ---- */
  function pushExtras(t) {
    // 惑星の光の核（本体も光でできている）
    for (const pl of planets) {
      const [r, g, b] = pl.colorF;
      const breathe = 1 + Math.sin(t * 1.5 + pl.noteIdx) * 0.04 + pl.pulse * 0.2;
      const rr = pl.r * breathe;
      sim.appendExtra(pl.x, pl.y, rr * 3.6, r * 0.16, g * 0.16, b * 0.16);
      sim.appendExtra(pl.x, pl.y, rr * 1.9, r * 0.5, g * 0.5, b * 0.5);
      sim.appendExtra(pl.x, pl.y, rr * 1.05, Math.min(1, r * 0.75 + 0.4), Math.min(1, g * 0.75 + 0.4), Math.min(1, b * 0.75 + 0.4));
      if (pl.full) {
        sim.appendExtra(pl.x, pl.y, rr * (4.6 + Math.sin(t * 2.2) * 0.5), r * 0.12, g * 0.12, b * 0.12);
      }
    }
    // 指の下の光
    for (const tc of touches.values()) {
      sim.appendExtra(tc.x, tc.y, 60, 0.5, 0.48, 0.55);
    }
    // 川の先端のきらめき
    for (const rv of rivers) {
      if (rv.alpha > 0.5 && rv.pts.length) {
        const p = rv.pts[rv.pts.length - 1];
        sim.appendExtra(p.x, p.y, 34, 0.4 * rv.alpha, 0.4 * rv.alpha, 0.45 * rv.alpha);
      }
    }
    // 波紋のリング光
    for (const pu of pulses) {
      const k = 1 - pu.age / 0.95;
      sim.appendExtra(pu.x, pu.y, 30 + pu.age * 300, 0.3 * k, 0.28 * k, 0.34 * k);
    }
  }

  function bez(p0x, p0y, cx, cy, p1x, p1y, tt) {
    const u = 1 - tt;
    return { x: u * u * p0x + 2 * u * tt * cx + tt * tt * p1x, y: u * u * p0y + 2 * u * tt * cy + tt * tt * p1y };
  }

  function drawOverlay(t) {
    fx.clearRect(0, 0, W, H);

    /* 惑星の顔と進みぐあい */
    for (const pl of planets) {
      const r = pl.r * (1 + pl.pulse * 0.1);
      const prog = Math.min(1, pl.captured / pl.quota);
      // 進みぐあいの細いリング
      fx.lineCap = 'round';
      fx.strokeStyle = 'rgba(255,255,255,0.22)';
      fx.lineWidth = 3;
      fx.beginPath();
      fx.arc(pl.x, pl.y, r + 9, 0, TAU);
      fx.stroke();
      if (prog > 0) {
        fx.strokeStyle = 'rgba(255,255,255,' + (0.7 + pl.pulse * 0.3) + ')';
        fx.lineWidth = 3.5;
        fx.beginPath();
        fx.arc(pl.x, pl.y, r + 9, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
        fx.stroke();
      }
      // かお
      const ex = r * 0.3, ey = -r * 0.1, er = r * 0.09;
      fx.strokeStyle = 'rgba(40,30,55,0.75)';
      fx.fillStyle = 'rgba(40,30,55,0.75)';
      fx.lineWidth = Math.max(2, r * 0.055);
      if (pl.full || pl.blink > 0) {
        for (const sd of [-1, 1]) {
          fx.beginPath();
          fx.arc(pl.x + sd * ex, pl.y + ey + er * 0.5, er * 1.1, Math.PI * 1.15, Math.PI * 1.85);
          fx.stroke();
        }
      } else {
        for (const sd of [-1, 1]) {
          fx.beginPath();
          fx.arc(pl.x + sd * ex, pl.y + ey, er, 0, TAU);
          fx.fill();
        }
      }
      const smile = 0.3 + prog * 0.7;
      fx.beginPath();
      fx.arc(pl.x, pl.y + r * 0.13, r * 0.38 * smile + r * 0.06,
             Math.PI * (0.5 - 0.34 * smile), Math.PI * (0.5 + 0.34 * smile));
      fx.stroke();
      if (prog > 0.35) {
        fx.fillStyle = 'rgba(255,120,150,' + (0.2 + pl.pulse * 0.2) + ')';
        for (const sd of [-1, 1]) {
          fx.beginPath();
          fx.arc(pl.x + sd * r * 0.52, pl.y + r * 0.17, r * 0.12, 0, TAU);
          fx.fill();
        }
      }
    }

    /* ヒント（光る指のお手本） */
    if (hint) {
      const k = Math.min(1, hint.t);
      fx.save();
      fx.setLineDash([4, 11]);
      fx.strokeStyle = 'rgba(255,255,255,0.4)';
      fx.lineWidth = 3;
      fx.beginPath();
      fx.moveTo(hint.sx, hint.sy);
      const steps = Math.max(2, Math.floor(24 * k));
      for (let i = 1; i <= steps; i++) {
        const p = bez(hint.sx, hint.sy, hint.cx, hint.cy, hint.tx, hint.ty, i / 24);
        fx.lineTo(p.x, p.y);
      }
      fx.stroke();
      fx.setLineDash([]);
      const fp = bez(hint.sx, hint.sy, hint.cx, hint.cy, hint.tx, hint.ty, k);
      const rg = fx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 26);
      rg.addColorStop(0, 'rgba(255,255,255,0.9)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      fx.fillStyle = rg;
      fx.beginPath(); fx.arc(fp.x, fp.y, 26, 0, TAU); fx.fill();
      fx.restore();
    }

    /* テーマ名バナー */
    if (state === 'play' && bannerT < 3.2) {
      const k = bannerT < 0.5 ? bannerT / 0.5 : bannerT > 2.5 ? Math.max(0, 1 - (bannerT - 2.5) / 0.7) : 1;
      fx.save();
      fx.globalAlpha = k * 0.9;
      fx.fillStyle = '#ffffff';
      fx.textAlign = 'center';
      fx.shadowColor = 'rgba(140,90,220,0.9)';
      fx.shadowBlur = 12;
      fx.font = '800 ' + Math.round(clamp(W * 0.055, 18, 34)) + 'px -apple-system, "Hiragino Maru Gothic ProN", sans-serif';
      fx.fillText(theme.name, W / 2, H * 0.12);
      fx.restore();
    }

    /* 場面転換のフェード */
    if (state === 'transition' && fadeA > 0) {
      fx.fillStyle = 'rgba(6,3,20,' + Math.min(1, fadeA) + ')';
      fx.fillRect(0, 0, W, H);
    }
  }

  /* ---- 画質の自動調整（タイトル画面のあいだに計測） ---- */
  function adaptQuality(dtMs) {
    if (frozenQuality || !isGL) return;
    frameAcc += dtMs;
    frameCnt++;
    if (frameCnt >= 45) {
      const avg = frameAcc / frameCnt;
      frameAcc = 0; frameCnt = 0;
      let newN = N;
      if (avg > 20) newN = Math.max(3500, Math.round(N * 0.72));
      else if (avg < 11.5) newN = Math.min(MAXN, Math.round(N * 1.18));
      if (newN !== N) {
        N = newN;
        setupTheme(themeIdx, true);
      }
    }
  }

  /* ---- メインループ ---- */
  function loop(now) {
    requestAnimationFrame(loop);
    const rawDt = now - lastNow;
    lastNow = now;
    let dt = rawDt / 1000;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;
    elapsed += dt;

    update(dt, elapsed);

    sim.fillVerts(elapsed);
    pushExtras(elapsed);
    renderer.render({
      verts: sim.verts,
      count: sim.vertCount,
      theme, auroras, t: elapsed,
      decay: 0.90
    });
    drawOverlay(elapsed);
    adaptQuality(rawDt);
  }

  /* 動作確認用の小さなフック（ゲームには影響しない） */
  window.__hikari = {
    sim,
    get state() { return state; },
    get N() { return N; },
    get isGL() { return isGL; },
    get planets() { return planets; },
    get rivers() { return rivers; },
    formationCount: () => Formations.count(),
    testText: (s) => spawnText(s, W / 2, H * 0.42, 0.92, 0.3, 3.0, 1800),
    testShape: (n) => spawnShape(n, W / 2, H * 0.45, Math.min(W, H) * 0.2, 3.0)
  };

  /* ---- 起動 ---- */
  resize();
  setupTheme(parseInt(load(SAVE_THEME, '0'), 10) || 0, true);
  state = 'title';
  requestAnimationFrame(now => { lastNow = now; requestAnimationFrame(loop); });
})();
