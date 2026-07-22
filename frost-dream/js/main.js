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
  let waves = [];                      // お祝いの色の洪水
  let whale = null;                    // 主役のくじら
  let whaleT = rand(7, 14);
  let whaleSongT = -9;
  let whaleWakeT = 0;
  let flashA = 0;                      // 爆発の白いフラッシュ
  let hitstopT = 0;                    // 一瞬の世界静止（打撃感）
  let slowmoT = 0;                     // スローモーション（因果を見せる）
  let shakeAmp = 0;                    // 画面のゆれ
  const power = { t: 0, k: 0 };        // ひかりのちから（山場のごほうびで突入）
  let comboN = 0;                      // 連打コンボ
  let lastTapT = -9;
  let myStars = [];                    // タップで生まれて残りつづける「私の星」
  let rainK = 0;                       // 3本指の虹の雨
  let rainWaveT = 0;
  let rainIdx = 0;
  let curBridges = null;
  const RAINBOWF = ['#ff6b8a', '#ffab70', '#ffd76e', '#a5e878', '#7db8ff', '#c9a2ff']
    .map(h => hexToRgb(h).map(v => v / 255));
  const touches = new Map();

  function hitstop(d) { hitstopT = Math.max(hitstopT, d); }
  function slowmo(d) { slowmoT = Math.max(slowmoT, d); }
  function shake(a) { shakeAmp = Math.max(shakeAmp, a); }
  function powerOn() {
    const was = power.t > 0;
    power.t = 9;
    if (!was) AudioSys.powerUp();
  }
  /* ゆめのディレクター：世界が静かになったらドラマを注入する */
  const director = {
    last: 0, quietT: 0, noTouchT: 0,
    wind: null, comets: [], surge: null
  };
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
    waves = [];
    whale = null;
    whaleT = rand(6, 12);
    hint = null;
    idleT = 0;
    bannerT = 0;
    fullPlanets = 0;
    animalT = rand(50, 80);
    director.wind = null;
    director.comets = [];
    director.surge = null;
    director.quietT = 0;
    director.last = elapsed;
    comboN = 0;
    power.t = 0;
    rainK = 0;
    curBridges = null;
    setupAuroras();

    planets = [];
    const k = theme.species.length;
    const swarmPer = Math.floor((N - Math.floor(N * 0.3)) / k);
    const quota = clamp(Math.round(swarmPer * 0.5), 150, 1400);
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
        pulse: 0, blink: 0, blinkT: rand(1.5, 4), noteIdx: i * 2 + (themeIdx % 3),
        eruptT: rand(2, 4), leakT: rand(5, 8), bounce: 0, giggleT: 0
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
  const ANIMALS = ['butterfly', 'bird', 'dragon'];   // くじらは主役として常駐

  function pushWave(x, y, colorF, str) {
    waves.push({ x, y, age: 0, colorF, str: str || 1, life: (Math.hypot(W, H) + 300) / 850 });
  }

  /* ---- 主役のくじら ---- */
  function updateWhale(dt, t) {
    if (whale && !Formations.isActive(whale)) {
      whale = null;
      whaleT = rand(22, 45);
    }
    if (!whale) {
      if (state !== 'play') return;
      whaleT -= dt;
      if (whaleT > 0) return;
      const fromLeft = Math.random() < 0.5;
      const sc = Math.min(W * 0.28, H * 0.38);
      const swarmN = sim.n - sim.dustN;
      const pts = Formations.sampleShape('whale', clamp(Math.round(swarmN * 0.35), 800, 2600));
      const speed = (W + sc * 4.5) / rand(26, 36);
      whale = Formations.start(sim, {
        pts,
        cx: fromLeft ? -sc * 2 : W + sc * 2,
        cy: H * rand(0.28, 0.55),
        scale: sc, hold: 9999,
        driftX: fromLeft ? speed : -speed,
        flipX: !fromLeft,
        type: 'whale'
      });
      if (whale) {
        AudioSys.whaleSong();
        whaleSongT = t;
        director.last = t;      // くじら登場もひとつのドラマ
      } else {
        whaleT = 12;
      }
      return;
    }
    // ブリーチ（大ジャンプ）：放物線で跳び上がり、着水で全画面スプラッシュ
    if (whale.breach) {
      whale.breach.t += dt;
      const k = whale.breach.t / 2.4;
      const amp = Math.max(70, Math.min(H * 0.45, whale.baseCy - whale.scale * 0.9));
      whale.excite = 1;
      if (k >= 1) {
        whale.cy = whale.baseCy;
        whale.breach = null;
        pulses.push({ x: whale.cx, y: whale.baseCy, age: 0, sp: 720, str: 2.0, life: 1.4 });
        pushWave(whale.cx, whale.baseCy, [0.75, 0.9, 1], 0.9);
        AudioSys.splash();
        shake(12);
        slowmo(0.55);
        flashA = Math.max(flashA, 0.5);
        powerOn();
        director.last = t;
      } else {
        whale.cy = whale.baseCy - Math.sin(Math.PI * k) * amp;
      }
    }
    // なでると身をよじって歌う
    for (const tc of touches.values()) {
      if (Math.abs(tc.x - whale.cx) < whale.scale * 2.0 &&
          Math.abs(tc.y - whale.cy) < whale.scale * 1.2) {
        whale.excite = 1;
        if (t - whaleSongT > 3.2) {
          whaleSongT = t;
          AudioSys.whaleSong();
        }
      }
    }
    // 尾びれの一振りが群れをかき乱す（航跡の波）
    whaleWakeT -= dt;
    if (whaleWakeT <= 0) {
      whaleWakeT = 0.55;
      const tailX = whale.cx - 1.55 * whale.scale * whale.flipX;
      pulses.push({ x: tailX, y: whale.cy, age: 0, sp: 260, str: 0.32, life: 0.8 });
    }
  }

  /* ---- ゆめのディレクター：静けさを検知してドラマを注入 ---- */
  function updateDirector(dt, t) {
    // 進行中イベントの更新（どの状態でも動かして自然に終わらせる）
    if (director.wind) {
      director.wind.tLeft -= dt;
      director.wind.k = 215 * Math.sin(Math.PI * clamp(1 - director.wind.tLeft / director.wind.dur, 0, 1));
      if (director.wind.tLeft <= 0) director.wind = null;
    }
    for (let i = director.comets.length - 1; i >= 0; i--) {
      const cm = director.comets[i];
      cm.t += dt;
      if (cm.t < 0) continue;
      cm.x += cm.vx * dt;
      cm.y += cm.vy * dt;
      if (cm.t > cm.life) {
        pulses.push({ x: cm.x, y: cm.y, age: 0, sp: 480, str: 0.8, life: 0.9 });
        director.comets.splice(i, 1);
      }
    }
    if (director.surge) {
      director.surge.tLeft -= dt;
      director.surge.k = Math.sin(Math.PI * clamp(1 - director.surge.tLeft / director.surge.dur, 0, 1));
      if (director.surge.tLeft <= 0) director.surge = null;
    }
    if (state !== 'play') { director.quietT = 0; return; }
    director.noTouchT = touches.size ? 0 : director.noTouchT + dt;
    director.quietT = sim.avgSpeed < 62 ? director.quietT + dt : 0;
    if (director.noTouchT < 2.5) return;
    const since = t - director.last;
    if (since > 16 || (director.quietT > 4 && since > 8)) fireDirector(t);
  }

  function fireDirector(t) {
    director.last = t;
    // 置き去りにされた密な玉があれば、まずそれを花火にする
    if (sim.clumpCount > 150) {
      sim.burstAt(sim.clumpX, sim.clumpY, 240);
      pulses.push({ x: sim.clumpX, y: sim.clumpY, age: 0, sp: 780, str: 1.8, life: 1.3 });
      pushWave(sim.clumpX, sim.clumpY, pick(theme.species).colorF, 0.7);
      AudioSys.bigBoom();
      flashA = 0.55;
      return;
    }
    const ev = pick(['gust', 'comet', 'meteors', 'surge']);
    if (ev === 'gust') {
      const a = rand(TAU);
      director.wind = { vx: Math.cos(a), vy: Math.sin(a) * 0.6, k: 0, dur: 2.4, tLeft: 2.4 };
      AudioSys.gust();
    } else if (ev === 'comet' || ev === 'meteors') {
      const nC = ev === 'comet' ? 1 : 3;
      for (let i = 0; i < nC; i++) {
        const fromLeft = Math.random() < 0.5;
        const spd = (W + H) * (ev === 'comet' ? 0.32 : 0.55);
        director.comets.push({
          x: fromLeft ? -50 : W + 50,
          y: rand(H * 0.08, H * 0.55),
          vx: (fromLeft ? 1 : -1) * spd * rand(0.85, 1.1),
          vy: spd * rand(0.12, 0.35),
          t: -i * 0.45,
          life: ev === 'comet' ? 3.4 : 1.9,
          pull: ev === 'comet' ? 330 : 150
        });
      }
      AudioSys.comet();
    } else {
      const a = rand(TAU);
      director.surge = {
        spec: randInt(0, theme.species.length - 1),
        vx: Math.cos(a) * 290, vy: Math.sin(a) * 290,
        k: 0, dur: 2.4, tLeft: 2.4
      };
      AudioSys.gust();
    }
  }

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
    touches.set(id, {
      x, y, sx: x, sy: y, age: 0, moved: 0, river: null, longFired: false,
      tvx: 0, tvy: 0, mT: performance.now(),
      charge: 0, chargeCool: 0, chargeLvl: 0, beatT: 0, pulse: 0
    });
  }

  function onMove(id, x, y) {
    const tc = touches.get(id);
    if (!tc) return;
    // 指の速度（彗星の尾の向きに使う）
    const nowMs = performance.now();
    const mdt = Math.max(8, nowMs - tc.mT) / 1000;
    tc.mT = nowMs;
    tc.tvx = lerp(tc.tvx, (x - tc.x) / mdt, 0.45);
    tc.tvy = lerp(tc.tvy, (y - tc.y) / mdt, 0.45);
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
      // ---- タップ ----
      // くじらタップ：3回で大ジャンプ（ブリーチ）
      if (whale && Math.abs(x - whale.cx) < whale.scale * 1.9 &&
          Math.abs(y - whale.cy) < whale.scale * 1.15) {
        whaleTapped();
        return;
      }
      // 惑星タップ：跳ねて、リングの粒子が一斉にジャンプ
      for (let pi = 0; pi < planets.length; pi++) {
        const pl = planets[pi];
        if (dist2(x, y, pl.x, pl.y) < (pl.r + 20) * (pl.r + 20)) {
          pl.pulse = 1;
          pl.bounce = 1;
          sim.ringJump(pi);
          AudioSys.planetVoice(pl.noteIdx);
          hitstop(0.045);
          shake(3);
          return;
        }
      }
      // 私の星が生まれて残る
      myStars.push({ x, y, s: rand(2.2, 4.2), ph: rand(TAU) });
      if (myStars.length > 60) myStars.shift();
      // 連打コンボ：波紋 → 大波 → 花火 → ひかりのちから
      comboN = (elapsed - lastTapT < 1.4) ? comboN + 1 : 1;
      lastTapT = elapsed;
      if (comboN === 1) {
        pulses.push({ x, y, age: 0, sp: 480, str: 1, life: 0.95 });
        AudioSys.twinkle();
      } else if (comboN === 2) {
        pulses.push({ x, y, age: 0, sp: 580, str: 1.4, life: 1.1 });
        AudioSys.chime(7, { gain: 0.12 });
        hitstop(0.03);
      } else if (comboN === 3) {
        sim.burstAt(x, y, 150);
        pulses.push({ x, y, age: 0, sp: 700, str: 1.6, life: 1.2 });
        pushWave(x, y, pick(theme.species).colorF, 0.55);
        AudioSys.chime(9, { gain: 0.13 });
        AudioSys.chime(11, { delay: 0.08, gain: 0.11 });
        hitstop(0.05);
        shake(4);
      } else {
        sim.burstAt(x, y, 210);
        pulses.push({ x, y, age: 0, sp: 800, str: 2.0, life: 1.4 });
        pushWave(x, y, [1, 0.97, 0.88], 0.75);
        AudioSys.bigBoom();
        shake(7);
        slowmo(0.4);
        flashA = Math.max(flashA, 0.6);
        powerOn();
        comboN = 0;
      }
      // ひかりのちから中は、どのタップも小爆発
      if (power.k > 0.5 && comboN <= 2) {
        sim.burstAt(x, y, 140);
        shake(3);
      }
    } else if (tc.age > 0.45) {
      // 集まっていた群れを離す「大きな息」
      pulses.push({ x, y, age: 0, sp: 640, str: 1.6, life: 1.35 });
      AudioSys.exhale();
    }
  }

  /* くじらタップ → 3回でブリーチ（大ジャンプ→着水スプラッシュ） */
  function whaleTapped() {
    if (!whale) return;
    whale.excite = 1;
    whale.tapN = (elapsed - (whale.lastTapT || -9) < 6) ? (whale.tapN || 0) + 1 : 1;
    whale.lastTapT = elapsed;
    AudioSys.whaleChirp();
    hitstop(0.05);
    shake(4);
    if (whale.tapN >= 3 && !whale.breach) {
      whale.breach = { t: 0 };
      whale.baseCy = whale.cy;
      whale.tapN = 0;
      AudioSys.whaleSong();
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
    // タッチの経過（長押しで形が咲く・心拍・ためて爆発）
    for (const tc of touches.values()) {
      tc.age += dt;
      const dec = Math.exp(-6 * dt);       // 動きが止まったら指の速度を減衰
      tc.tvx *= dec; tc.tvy *= dec;
      tc.pulse = Math.max(0, tc.pulse - dt * 3);
      tc.chargeCool = Math.max(0, tc.chargeCool - dt);
      if (!tc.river && !tc.longFired && tc.age > 1.5 && tc.moved < 16 &&
          (state === 'play' || state === 'celebrate')) {
        tc.longFired = true;
        spawnShape(pick(TAP_SYMBOLS), tc.x, tc.y, Math.min(W, H) * rand(0.13, 0.18), 2.2);
      }
      if (state !== 'play' && state !== 'celebrate') continue;
      const still = Math.hypot(tc.tvx, tc.tvy) < 55;
      // 心拍：静かに押さえていると、玉が脈打って小さな波を放つ
      if (still && tc.age > 0.6) {
        tc.beatT += dt;
        if (tc.beatT >= 1.15) {
          tc.beatT = 0;
          tc.pulse = 1;
          pulses.push({ x: tc.x, y: tc.y, age: 0, sp: 340, str: 0.5, life: 0.8 });
          AudioSys.heartBeat();
        }
      } else {
        tc.beatT = 0;
      }
      // ため：集まった密度が上がるほど震え、音が上がり、満タンで大爆発
      // （どんなに密でも2.5秒はかけて溜まる＝ワクワクの時間を保証）
      if (tc.age > 0.5 && tc.chargeCool <= 0) {
        const cnt = sim.countNear(tc.x, tc.y, 120);
        const need = Math.max(350, sim.freeCount * 0.38);
        tc.charge = Math.min(clamp(cnt / need, 0, 1), (tc.age - 0.5) / 2.5);
        const lvl = Math.floor(tc.charge * 6);
        if (lvl > tc.chargeLvl && tc.charge > 0.4) {
          tc.chargeLvl = lvl;
          AudioSys.chargeTick(lvl);
        }
        if (tc.charge >= 1) {
          tc.charge = 0;
          tc.chargeLvl = 0;
          tc.chargeCool = 2.2;
          sim.burstAt(tc.x, tc.y, 240);
          pulses.push({ x: tc.x, y: tc.y, age: 0, sp: 840, str: 2.2, life: 1.5 });
          pushWave(tc.x, tc.y, [1, 0.97, 0.88], 0.85);
          AudioSys.bigBoom();
          flashA = 0.9;
          shake(9);
          slowmo(0.5);
          powerOn();
          director.last = elapsed;
        }
      } else {
        tc.charge = 0;
        tc.chargeLvl = 0;
      }
    }
    flashA = Math.max(0, flashA - dt * 2.4);
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
      if (pulses[i].age > pulses[i].life) pulses.splice(i, 1);
    }
    // 色の洪水波
    for (let i = waves.length - 1; i >= 0; i--) {
      waves[i].age += dt;
      if (waves[i].age > waves[i].life) waves.splice(i, 1);
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
      // ときどき、くじら以外の生き物も泳いでいく
      animalT -= dt;
      if (animalT <= 0) {
        animalT = rand(60, 100);
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
        powerOn();
        hint = null;
      }
    } else if (state === 'celebrate') {
      ct += dt;
      fireworkT -= dt;
      if (fireworkT <= 0) {
        fireworkT = rand(0.4, 0.7);
        const fxp = rand(W * 0.15, W * 0.85), fyp = rand(H * 0.15, H * 0.6);
        pulses.push({ x: fxp, y: fyp, age: 0, sp: 480, str: 1, life: 0.95 });
        AudioSys.chime(randInt(4, 11), { gain: 0.08 });
        // 色の洪水を交互に走らせる
        if (waves.length < 3) {
          const sp = theme.species[randInt(0, theme.species.length - 1)];
          pushWave(fxp, fyp, sp.colorF, 0.9);
        }
      }
      if (celebrateStep === 0 && ct > 0.8) {
        celebrateStep = 1;
        spawnText('やったね', W / 2, H * 0.44, 0.96, 0.52, 2.8, 2400);
      }
      if (celebrateStep === 1 && childName && ct > 4.8) {
        celebrateStep = 2;
        spawnText(childName, W / 2, H * 0.44, 0.96, 0.52, 2.8, 2400);
      }
      const endT = childName ? 8.8 : 5.6;
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

    /* ひかりのちからの残り時間 */
    const powerWas = power.k;
    power.t = Math.max(0, power.t - dt);
    power.k += ((power.t > 0 ? 1 : 0) - power.k) * Math.min(1, dt * 5);
    if (powerWas > 0.4 && power.k <= 0.4 && power.t <= 0) AudioSys.powerDown();

    /* 惑星の顔まわり・噴水・しずくの補充・くすぐり */
    for (let pi = 0; pi < planets.length; pi++) {
      const pl = planets[pi];
      pl.pulse = Math.max(0, pl.pulse - dt * 2.2);
      pl.bounce = Math.max(0, pl.bounce - dt * 2.6);
      pl.blinkT -= dt;
      if (pl.blinkT <= 0) { pl.blink = 0.16; pl.blinkT = rand(1.8, 4.5); }
      if (pl.blink > 0) pl.blink -= dt;
      if (state !== 'play' && state !== 'celebrate') continue;
      // 長押しでくすぐったがる
      let tickled = false;
      for (const tc of touches.values()) {
        if (!tc.river && tc.age > 0.6 && Math.hypot(tc.tvx, tc.tvy) < 55 &&
            dist2(tc.x, tc.y, pl.x, pl.y) < (pl.r + 34) * (pl.r + 34)) {
          tickled = true;
          break;
        }
      }
      if (tickled) {
        pl.giggleT += dt;
        if (pl.giggleT > 0.55) {
          pl.giggleT = -0.35;
          pl.pulse = 1;
          pl.bounce = Math.max(pl.bounce, 0.8);
          sim.ringJump(pi);
          AudioSys.giggle();
        }
      } else {
        pl.giggleT = 0;
      }
      if (pl.full) {
        // 満ちた惑星は間欠泉：吸い込んだ光を吹き上げて世界に返す
        pl.eruptT -= dt;
        if (pl.eruptT <= 0) {
          pl.eruptT = rand(3.5, 6);
          const k = sim.eruptPlanet(pi, 0.45, 260, true);
          if (k > 8) {
            AudioSys.geyser();
            pl.pulse = Math.max(pl.pulse, 0.8);
            if (Math.random() < 0.3) pushWave(pl.x, pl.y, pl.colorF, 0.35);
          }
        }
      } else if (pl.captured > 40) {
        // まだ満ちていない惑星も、ときどきしずくをこぼして世界を賑やかに保つ
        pl.leakT -= dt;
        if (pl.leakT <= 0) {
          pl.leakT = rand(6, 9);
          sim.eruptPlanet(pi, 0.1, 10, false);
        }
      }
    }

    /* 2本指のひかりのはし・3本指のにじのあめ */
    const tlist = [...touches.values()];
    curBridges = null;
    if (state !== 'title' && tlist.length === 2 &&
        tlist[0].age > 0.15 && tlist[1].age > 0.15) {
      curBridges = [{ x1: tlist[0].x, y1: tlist[0].y, x2: tlist[1].x, y2: tlist[1].y }];
    }
    const rainOn = state !== 'title' && tlist.length >= 3;
    rainK += ((rainOn ? 1 : 0) - rainK) * Math.min(1, dt * 4);
    if (rainOn) {
      rainWaveT -= dt;
      if (rainWaveT <= 0) {
        rainWaveT = 0.5;
        rainIdx = (rainIdx + 1) % RAINBOWF.length;
        pushWave(rand(W * 0.2, W * 0.8), -60, RAINBOWF[rainIdx], 0.55);
        AudioSys.chime(4 + rainIdx, { gain: 0.08 });
      }
    }

    /* シミュレーション本体 */
    updateDirector(dt, t);
    const activeComets = director.comets.filter(c => c.t >= 0);
    const env = {
      species: theme.species,
      touches: tlist,
      rivers, pulses, planets,
      wind: director.wind,
      comets: activeComets,
      surge: director.surge,
      breath: Math.sin(t * TAU / 8),   // 世界の呼吸
      power: power.k,                  // ひかりのちから
      bridges: curBridges,
      rain: rainK > 0.02 ? rainK : 0,
      events: sim.events
    };
    sim.step(dt, t, env);
    updateWhale(dt, t);
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
            // 惑星の色が波になって画面全体を染める＋ひかりのちから突入
            pushWave(pl.x, pl.y, pl.colorF, 1.1);
            pulses.push({ x: pl.x, y: pl.y, age: 0, sp: 560, str: 1.2, life: 1.1 });
            slowmo(0.45);
            shake(6);
            powerOn();
            // 数字のフォーメーション（1, 2, 3…）
            const dx = W / 2 - pl.x, dy = H / 2 - pl.y;
            const dl = Math.hypot(dx, dy) || 1;
            const off = Math.min(W, H) * 0.26;
            spawnText(String(fullPlanets),
              pl.x + dx / dl * off, pl.y + dy / dl * off,
              0.52, 0.42, 2.2, 1300);
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
      const breathe = 1 + Math.sin(t * 1.5 + pl.noteIdx) * 0.04 + pl.pulse * 0.2 + pl.bounce * 0.25;
      const rr = pl.r * breathe;
      sim.appendExtra(pl.x, pl.y, rr * 3.6, r * 0.16, g * 0.16, b * 0.16);
      sim.appendExtra(pl.x, pl.y, rr * 1.9, r * 0.5, g * 0.5, b * 0.5);
      sim.appendExtra(pl.x, pl.y, rr * 1.05, Math.min(1, r * 0.75 + 0.4), Math.min(1, g * 0.75 + 0.4), Math.min(1, b * 0.75 + 0.4));
      if (pl.full) {
        sim.appendExtra(pl.x, pl.y, rr * (4.6 + Math.sin(t * 2.2) * 0.5), r * 0.12, g * 0.12, b * 0.12);
      }
    }
    // 私の星（タップで生まれて残りつづける星座）
    for (const st of myStars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + st.ph);
      sim.appendExtra(st.x, st.y, st.s * 4.5, 0.55 * tw, 0.5 * tw, 0.34 * tw);
    }
    // 指の下の光（ためるほど大きく白く、心拍で脈打つ。ひかりのちから中は虹色）
    for (const tc of touches.values()) {
      const gs = 60 + tc.charge * 100 + tc.pulse * 45 + power.k * 40;
      let b = 0.5 + tc.charge * 0.45;
      let cr = b, cg = b * 0.96, cb = b;
      if (power.k > 0.05) {
        const rc = RAINBOWF[Math.floor(t * 5) % RAINBOWF.length];
        cr = b * (0.4 + rc[0] * 0.9);
        cg = b * (0.4 + rc[1] * 0.9);
        cb = b * (0.4 + rc[2] * 0.9);
      }
      sim.appendExtra(tc.x, tc.y, gs, cr, cg, cb);
    }
    // 2本指のひかりのはし
    if (curBridges) {
      for (const b of curBridges) {
        for (let i = 0; i <= 10; i++) {
          const tt = i / 10;
          const wob = Math.sin(t * 7 + i * 1.3) * 6;
          sim.appendExtra(
            lerp(b.x1, b.x2, tt) + wob,
            lerp(b.y1, b.y2, tt) - wob * 0.5,
            30 + Math.sin(t * 9 + i) * 8,
            0.45, 0.5, 0.62
          );
        }
      }
    }
    // 彗星の頭と尾
    for (const cm of director.comets) {
      if (cm.t < 0) continue;
      sim.appendExtra(cm.x, cm.y, 110, 0.9, 0.9, 1.0);
      sim.appendExtra(cm.x - cm.vx * 0.06, cm.y - cm.vy * 0.06, 62, 0.5, 0.5, 0.72);
      sim.appendExtra(cm.x - cm.vx * 0.13, cm.y - cm.vy * 0.13, 36, 0.28, 0.28, 0.5);
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
      const k = (1 - pu.age / pu.life) * Math.min(1, pu.str);
      sim.appendExtra(pu.x, pu.y, 30 + pu.age * pu.sp * 0.65, 0.3 * k, 0.28 * k, 0.34 * k);
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
      const r = pl.r * (1 + pl.pulse * 0.1 + pl.bounce * 0.22);
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

    /* ひかりのちから：画面の縁が虹色に輝く */
    if (power.k > 0.02) {
      const kk = power.k * (0.5 + 0.25 * Math.sin(t * 6));
      const grad = fx.createLinearGradient(0, 0, W, H);
      const cols = ['#ff6b8a', '#ffab70', '#ffd76e', '#a5e878', '#7db8ff', '#c9a2ff'];
      for (let i = 0; i < cols.length; i++) grad.addColorStop(i / (cols.length - 1), cols[i]);
      fx.save();
      fx.strokeStyle = grad;
      fx.globalAlpha = kk * 0.35;
      fx.lineWidth = 24;
      fx.strokeRect(2, 2, W - 4, H - 4);
      fx.globalAlpha = kk;
      fx.lineWidth = 7;
      fx.strokeRect(4, 4, W - 8, H - 8);
      fx.restore();
    }

    /* 爆発の白いフラッシュ */
    if (flashA > 0) {
      fx.fillStyle = 'rgba(255,252,240,' + (flashA * 0.3) + ')';
      fx.fillRect(0, 0, W, H);
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
    const rawMs = now - lastNow;
    lastNow = now;
    let rawSec = rawMs / 1000;
    if (rawSec > 0.05) rawSec = 0.05;
    if (rawSec <= 0) return;
    // ヒットストップ（打撃の一瞬）とスローモーション（因果を見せる）
    let tScale = 1;
    if (hitstopT > 0) { tScale = 0.12; hitstopT -= rawSec; }
    else if (slowmoT > 0) { tScale = 0.3; slowmoT -= rawSec; }
    const dt = rawSec * tScale;
    elapsed += dt;

    update(dt, elapsed);

    sim.fillVerts(elapsed, waves);
    pushExtras(elapsed);
    renderer.render({
      verts: sim.verts,
      count: sim.vertCount,
      theme, auroras, t: elapsed,
      breath: Math.sin(elapsed * TAU / 8),
      powerK: power.k,
      decay: 0.90
    });
    drawOverlay(elapsed);

    // 画面のゆれ
    if (shakeAmp > 0.3) {
      const sx = (Math.random() - 0.5) * 2 * shakeAmp;
      const sy = (Math.random() - 0.5) * 2 * shakeAmp;
      glCanvas.style.transform = 'translate(' + sx + 'px,' + sy + 'px)';
      fxCanvas.style.transform = glCanvas.style.transform;
      shakeAmp *= Math.exp(-5 * rawSec);
    } else if (shakeAmp !== 0) {
      shakeAmp = 0;
      glCanvas.style.transform = '';
      fxCanvas.style.transform = '';
    }
    adaptQuality(rawMs);
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
    get whale() { return whale; },
    get director() { return director; },
    get power() { return power; },
    get myStars() { return myStars; },
    get combo() { return comboN; },
    get touchList() { return [...touches.values()]; },
    forceWhale: () => { whale = null; whaleT = 0; },
    fireNow: () => fireDirector(elapsed),
    erupt: (i) => sim.eruptPlanet(i, 0.6, 400, true),
    testWave: () => pushWave(W / 2, H / 2, [1, 0.5, 0.7], 1.1),
    testText: (s) => spawnText(s, W / 2, H * 0.42, 0.92, 0.5, 3.0, 2200),
    testShape: (n) => spawnShape(n, W / 2, H * 0.45, Math.min(W, H) * 0.2, 3.0)
  };

  /* ---- 起動 ---- */
  resize();
  setupTheme(parseInt(load(SAVE_THEME, '0'), 10) || 0, true);
  state = 'title';
  requestAnimationFrame(now => { lastNow = now; requestAnimationFrame(loop); });
})();
