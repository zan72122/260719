'use strict';
/*
 * ひかりのたび — メインループと入力
 * ・指で道を描くと、近くのひかりのこどもが道に沿って飛んでいく（マルチタッチ対応）
 * ・タップすると星くずが生まれて、みんなが遊びに集まってくる
 * ・同じ色の惑星にとどけると吸い込まれて、惑星がどんどん笑顔になる
 * ・ぜんぶとどけたら大よろこびのおまつり → つぎのゆめへ
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const titleEl = document.getElementById('title');
  const hudEl = document.getElementById('hud');
  const starBarEl = document.getElementById('starBar');
  const muteBtn = document.getElementById('muteBtn');
  const resetBtn = document.getElementById('resetBtn');

  let W = 0, H = 0, DPR = 1;

  /* ---- ゲーム状態 ---- */
  let mode = 'title';           // title | play | celebrate | fade
  let level = 1;
  let spec = null;
  let spirits = [];
  let planets = [];
  const paths = new Map();      // pointerId -> path
  let lures = [];
  let stars = 0;
  let idleT = 0;
  let hint = null;
  let intro = null;             // 新しいなかまのお披露目
  let bannerT = 0;              // レベル名の表示
  let celebrateT = 0;
  let fwTimer = 0;
  let emojiTimer = 0;
  let fadeT = 0;
  let fadeDir = 0;              // 1=暗く 2=明るく
  let lastNow = performance.now();
  let elapsed = 0;
  const assist = new Set();

  const PATH_FADE = 3.0;
  const SAVE_LEVEL = 'hikariTabi.level';
  const SAVE_STARS = 'hikariTabi.stars';
  const SAVE_FORMS = 'hikariTabi.forms';

  /* ---- 保存 ---- */
  function save(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) { /* プライベートモード */ }
  }
  function load(key, def) {
    try { return localStorage.getItem(key) || def; } catch (e) { return def; }
  }

  /* ---- リサイズ ---- */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const p of planets) p.layout(W, H);
    if (spec) Background.init(spec.theme, W, H);
    else Background.init(THEMES[0], W, H);
    // 画面外に出たスピリットをやさしく戻す
    for (const s of spirits) {
      s.x = clamp(s.x, 4, W - 4);
      s.y = clamp(s.y, 4, H - 4);
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));

  /* ---- レベル生成 ---- */
  function makeSpirits(sp) {
    const list = [];
    const k = sp.colors.length;
    for (let gi = 0; gi < k; gi++) {
      const key = sp.colors[gi];
      const color = PALETTE[key];
      // 群れの発生地点：その色の惑星の反対側あたり
      const pl = planets[gi];
      let cx = W * (1 - pl.nx) + rand(-W * 0.08, W * 0.08);
      let cy = H * (1 - pl.ny) + rand(-H * 0.08, H * 0.08);
      cx = clamp(cx, W * 0.15, W * 0.85);
      cy = clamp(cy, H * 0.15, H * 0.85);
      for (let i = 0; i < sp.per; i++) {
        const a = rand(TAU), r = rand(10, Math.min(W, H) * 0.12);
        list.push(new Spirit(
          cx + Math.cos(a) * r, cy + Math.sin(a) * r,
          gi, key, color, sp.form
        ));
      }
    }
    return list;
  }

  function startLevel(n) {
    level = n;
    save(SAVE_LEVEL, n);
    spec = levelSpec(n);
    Background.init(spec.theme, W, H);
    Particles.clear();
    paths.clear();
    lures = [];
    hint = null;
    idleT = 0;
    bannerT = 0;
    assist.clear();

    // 惑星をだ円状に配置（縦横どちらでもきれいに並ぶ）
    planets = [];
    const k = spec.colors.length;
    const a0 = rand(TAU);
    for (let i = 0; i < k; i++) {
      const a = a0 + i * TAU / k;
      const nx = clamp(0.5 + 0.36 * Math.cos(a), 0.12, 0.88);
      const ny = clamp(0.5 + 0.36 * Math.sin(a), 0.14, 0.86);
      const key = spec.colors[i];
      const pl = new Planet(nx, ny, key, PALETTE[key], spec.per, i * 2 + (n % 3));
      pl.layout(W, H);
      pl.onBloom = onPlanetBloom;
      planets.push(pl);
    }
    spirits = makeSpirits(spec);

    // はじめて出会う姿なら、お披露目
    const seen = load(SAVE_FORMS, '').split(',').filter(Boolean);
    if (!seen.includes(spec.form)) {
      seen.push(spec.form);
      save(SAVE_FORMS, seen.join(','));
      intro = {
        form: spec.form,
        color: PALETTE[spec.colors[0]],
        name: FORM_NAMES[spec.form] || '',
        t: 0,
        dummy: new Spirit(0, 0, 0, spec.colors[0], PALETTE[spec.colors[0]], spec.form)
      };
      AudioSys.fanfare();
    }
    mode = 'play';
  }

  function onPlanetBloom(pl) {
    Particles.emoji(pl.x, pl.y - pl.r * 1.4, pick(['🌸', '🌟', '💮', '✨']));
  }

  function themeColors() {
    return spec ? spec.colors.map(c => PALETTE[c]) : ['#ff8fb4', '#7db8ff', '#ffd76e'];
  }

  /* ---- タイトル画面のデモ用スピリット ---- */
  function makeTitleDemo() {
    spirits = [];
    const keys = ['pink', 'teal', 'yellow', 'purple'];
    const forms = ['spirit', 'butterfly', 'fish', 'star'];
    for (let gi = 0; gi < 4; gi++) {
      for (let i = 0; i < 9; i++) {
        spirits.push(new Spirit(
          rand(W * 0.2, W * 0.8), rand(H * 0.2, H * 0.8),
          gi, keys[gi], PALETTE[keys[gi]], forms[gi]
        ));
      }
    }
    planets = [];
    lures = [];
  }

  /* ---- 入力 ---- */
  function xyFromEvent(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function onDown(id, x, y) {
    AudioSys.unlock();
    idleT = 0;
    hint = null;

    if (mode === 'title') {
      startGame();
      return;
    }
    if (mode === 'celebrate' || mode === 'fade') {
      // おまつり中はどこを触っても花火！
      Particles.firework(x, y, pick(themeColors()));
      Particles.emoji(x, y, pick(['🎉', '⭐', '💖', '🌈', '🌟']));
      AudioSys.chime(randInt(4, 10), { gain: 0.14 });
      return;
    }
    const p = {
      pts: [{ x, y }],
      drawing: true, done: false, alive: true,
      fade: 0, t0: performance.now(),
      moved: 0, lastX: x, lastY: y
    };
    paths.set(id, p);
    assignFollowers(p, x, y, 95);
    Particles.ring(x, y, '#ffffff', 6);
  }

  function onMove(id, x, y) {
    const p = paths.get(id);
    if (!p || !p.drawing) return;
    const dx = x - p.lastX, dy = y - p.lastY;
    const d = Math.hypot(dx, dy);
    p.moved += d;
    if (d >= 12 && p.pts.length < 320) {
      p.pts.push({ x, y });
      p.lastX = x;
      p.lastY = y;
      assignFollowers(p, x, y, 65);
      if (Math.random() < 0.45) {
        Particles.spawn({
          x: x + rand(-6, 6), y: y + rand(-6, 6),
          vx: rand(-25, 25), vy: rand(-25, 25),
          life: rand(0.4, 0.8), color: '#ffffff',
          size: rand(1.8, 3.2), type: 'spark', drag: 0.94
        });
      }
      AudioSys.sparkleTick(y / H);
    }
  }

  function onUp(id, x, y) {
    const p = paths.get(id);
    if (!p) return;
    p.drawing = false;
    p.done = true;
    const dt = performance.now() - p.t0;
    if (p.moved < 18 && dt < 350) {
      // タップだった → 星くずを生む
      paths.delete(id);
      releaseFollowers(p);
      handleTap(x, y);
    }
  }

  function assignFollowers(p, x, y, R) {
    const R2 = R * R;
    for (const s of spirits) {
      if (s.dead || s.absorbing || s.path) continue;
      if (dist2(s.x, s.y, x, y) < R2) {
        s.path = p;
        s.pathIdx = Math.max(0, p.pts.length - 1);
      }
    }
  }

  function releaseFollowers(p) {
    for (const s of spirits) {
      if (s.path === p) s.path = null;
    }
  }

  function handleTap(x, y) {
    // 惑星タップ？
    for (const pl of planets) {
      if (dist2(x, y, pl.x, pl.y) < (pl.r + 16) * (pl.r + 16)) {
        pl.poke();
        return;
      }
    }
    // 星くず（みんなが集まってくる）
    lures.push({ x, y, t: 0, life: 1.7 });
    Particles.burst(x, y, '#ffffff', 8, 110, 3);
    Particles.ring(x, y, '#fff2a8', 8);
    Particles.starPop(x, y);
    AudioSys.twinkle();
  }

  /* Pointer Events（iOS 13+）、なければタッチにフォールバック */
  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      const p = xyFromEvent(e);
      onDown(e.pointerId, p.x, p.y);
    });
    canvas.addEventListener('pointermove', e => {
      e.preventDefault();
      const p = xyFromEvent(e);
      onMove(e.pointerId, p.x, p.y);
    });
    const up = e => {
      e.preventDefault();
      const p = xyFromEvent(e);
      onUp(e.pointerId, p.x, p.y);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  } else {
    const each = (e, fn) => {
      e.preventDefault();
      for (const t of e.changedTouches) fn(t.identifier, t.clientX, t.clientY);
    };
    canvas.addEventListener('touchstart', e => each(e, onDown), { passive: false });
    canvas.addEventListener('touchmove', e => each(e, onMove), { passive: false });
    canvas.addEventListener('touchend', e => each(e, onUp), { passive: false });
    canvas.addEventListener('touchcancel', e => each(e, onUp), { passive: false });
  }
  // iOSのピンチズーム・ダブルタップズームを止める
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* ---- HUD ---- */
  muteBtn.addEventListener('click', () => {
    const m = !AudioSys.isMuted();
    AudioSys.setMuted(m);
    muteBtn.textContent = m ? '🔇' : '🔊';
  });
  resetBtn.addEventListener('click', () => {
    stars = 0;
    save(SAVE_STARS, 0);
    save(SAVE_LEVEL, 1);
    updateStarBar();
    if (mode !== 'title') startLevel(1);
  });

  function updateStarBar() {
    if (stars <= 0) { starBarEl.textContent = ''; return; }
    starBarEl.textContent = stars <= 8 ? '⭐'.repeat(stars) : '⭐×' + stars;
  }

  /* ---- ゲーム開始 ---- */
  function startGame() {
    titleEl.classList.add('hidden');
    hudEl.classList.add('visible');
    stars = parseInt(load(SAVE_STARS, '0'), 10) || 0;
    updateStarBar();
    const saved = parseInt(load(SAVE_LEVEL, '1'), 10) || 1;
    startLevel(saved);
  }

  /* ---- 毎フレームの更新 ---- */
  function update(dt, t) {
    Background.update(dt, t, W, H);
    Particles.update(dt);

    if (mode === 'title') {
      // デモ：中心のまわりを回る見えない星くずに群がる
      const cx = W / 2 + Math.cos(t * 0.5) * W * 0.22;
      const cy = H * 0.62 + Math.sin(t * 0.8) * H * 0.1;
      lures = [{ x: cx, y: cy, t: 0, life: 1 }];
      Flock.update(spirits, { W, H, planets: [], lures, assist }, dt, t);
      return;
    }

    /* パスの寿命 */
    for (const [id, p] of paths) {
      if (!p.drawing) {
        p.fade += dt;
        if (p.fade >= PATH_FADE) {
          p.alive = false;
          releaseFollowers(p);
          paths.delete(id);
        }
      }
    }
    /* 星くずの寿命 */
    for (let i = lures.length - 1; i >= 0; i--) {
      const l = lures[i];
      l.t += dt;
      if (l.t >= l.life) lures.splice(i, 1);
      else if (Math.random() < dt * 14) {
        Particles.spawn({
          x: l.x + rand(-10, 10), y: l.y + rand(-10, 10),
          vx: rand(-20, 20), vy: rand(-40, -10),
          life: 0.5, color: '#fff2a8', size: rand(1.5, 3), type: 'spark'
        });
      }
    }

    /* おたすけ判定：のこりが少ない群れは惑星が強く引き寄せる */
    if (mode === 'play') {
      assist.clear();
      const remain = new Map();
      for (const s of spirits) {
        if (!s.dead) remain.set(s.group, (remain.get(s.group) || 0) + 1);
      }
      for (const [g, c] of remain) {
        if (c <= 4) assist.add(g);
      }
    }

    Flock.update(spirits, { W, H, planets, lures, assist }, dt, t);
    for (const pl of planets) pl.update(dt, t);

    if (intro) {
      intro.t += dt;
      intro.dummy.phase += dt * 9;
      if (intro.t > 2.8) intro = null;
    }
    bannerT += dt;

    if (mode === 'play') {
      /* ヒント（しばらく触っていないとき、光る指が道を教えてくれる） */
      const anyDrawing = [...paths.values()].some(p => p.drawing);
      if (!anyDrawing) idleT += dt; else idleT = 0;
      if (idleT > 10 && !hint) {
        const target = planets.find(p => !p.done);
        if (target) {
          let sx = 0, sy = 0, c = 0;
          for (const s of spirits) {
            if (!s.dead && !s.absorbing && s.colorKey === target.colorKey) {
              sx += s.x; sy += s.y; c++;
            }
          }
          if (c > 0) {
            sx /= c; sy /= c;
            const mx = (sx + target.x) / 2, my = (sy + target.y) / 2;
            const dx = target.x - sx, dy = target.y - sy;
            const dl = Math.hypot(dx, dy) || 1;
            hint = {
              sx, sy, tx: target.x, ty: target.y,
              cx: mx - dy / dl * 90, cy: my + dx / dl * 90,
              t: 0
            };
          }
        }
      }
      if (hint) {
        hint.t += dt / 2.4;
        if (hint.t > 1.25) hint.t = 0;
      }

      /* クリア判定 */
      if (planets.length && planets.every(p => p.done)) {
        mode = 'celebrate';
        celebrateT = 0;
        fwTimer = 0;
        emojiTimer = 0;
        stars++;
        save(SAVE_STARS, stars);
        updateStarBar();
        AudioSys.fanfare();
        hint = null;
      }
    } else if (mode === 'celebrate') {
      celebrateT += dt;
      fwTimer -= dt;
      if (fwTimer <= 0) {
        fwTimer = rand(0.35, 0.6);
        Particles.firework(rand(W * 0.15, W * 0.85), rand(H * 0.12, H * 0.55), pick(themeColors()));
        if (Math.random() < 0.5) AudioSys.chime(randInt(4, 11), { gain: 0.07 });
      }
      emojiTimer -= dt;
      if (emojiTimer <= 0) {
        emojiTimer = rand(0.25, 0.5);
        Particles.emoji(rand(W * 0.1, W * 0.9), H + 20, pick(['🎉', '⭐', '🌟', '💖', '🌈', '✨']));
      }
      if (celebrateT > 4.6) {
        mode = 'fade';
        fadeDir = 1;
        fadeT = 0;
      }
    } else if (mode === 'fade') {
      fadeT += dt / 0.7;
      if (fadeDir === 1 && fadeT >= 1) {
        startLevel(level + 1);
        mode = 'fade';
        fadeDir = 2;
        fadeT = 0;
      } else if (fadeDir === 2 && fadeT >= 1) {
        mode = 'play';
      }
    }
  }

  /* ---- 描画 ---- */
  function bez(p0x, p0y, cx, cy, p1x, p1y, t) {
    const u = 1 - t;
    return {
      x: u * u * p0x + 2 * u * t * cx + t * t * p1x,
      y: u * u * p0y + 2 * u * t * cy + t * t * p1y
    };
  }

  function drawPaths(g, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of paths.values()) {
      if (p.pts.length < 2) continue;
      const alpha = p.drawing ? 1 : Math.max(0, 1 - p.fade / PATH_FADE);
      // 太いほのかな光
      g.globalAlpha = alpha * 0.25;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y);
      g.stroke();
      // 細い明るい芯
      g.globalAlpha = alpha * 0.8;
      g.lineWidth = 3;
      g.stroke();
      // 流れるきらめき
      const off = (t * 6) % 1;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < p.pts.length; i += 4) {
        const j = Math.floor(i + off * 4) % p.pts.length;
        const pt = p.pts[j];
        g.globalAlpha = alpha * 0.7;
        g.beginPath();
        g.arc(pt.x, pt.y, 1.8, 0, TAU);
        g.fill();
      }
      // 指の下の光
      if (p.drawing) {
        const e = p.pts[p.pts.length - 1];
        g.globalAlpha = 0.8;
        g.drawImage(Glow.get('#ffffff'), e.x - 24, e.y - 24, 48, 48);
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  function drawHint(g, t) {
    if (!hint) return;
    const k = Math.min(1, hint.t);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 点線の道すじ
    g.setLineDash([4, 10]);
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(hint.sx, hint.sy);
    const steps = Math.max(2, Math.floor(24 * k));
    for (let i = 1; i <= steps; i++) {
      const pt = bez(hint.sx, hint.sy, hint.cx, hint.cy, hint.tx, hint.ty, (i / 24));
      g.lineTo(pt.x, pt.y);
    }
    g.stroke();
    g.setLineDash([]);
    // スタート地点のリング
    const pr = 16 + Math.sin(t * 5) * 4;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hint.sx, hint.sy, pr, 0, TAU);
    g.stroke();
    // 光る指
    const fp = bez(hint.sx, hint.sy, hint.cx, hint.cy, hint.tx, hint.ty, k);
    g.drawImage(Glow.get('#ffffff'), fp.x - 26, fp.y - 26, 52, 52);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(fp.x, fp.y, 7, 0, TAU);
    g.fill();
    g.restore();
  }

  function drawIntro(g, t) {
    if (!intro) return;
    const k = intro.t < 0.4 ? intro.t / 0.4
            : intro.t > 2.3 ? Math.max(0, 1 - (intro.t - 2.3) / 0.5)
            : 1;
    const cx = W / 2, cy = H * 0.42;
    g.save();
    g.globalAlpha = k;
    // うしろの光
    g.globalCompositeOperation = 'lighter';
    const gs = 260 + Math.sin(t * 3) * 20;
    g.drawImage(Glow.get(intro.color), cx - gs / 2, cy - gs / 2, gs, gs);
    g.globalCompositeOperation = 'source-over';
    // おおきくなったなかま
    const d = intro.dummy;
    d.x = 0; d.y = 0;
    const wob = Math.sin(intro.t * 2.5) * 0.35;
    d.vx = Math.cos(wob);
    d.vy = Math.sin(wob);
    g.save();
    g.translate(cx, cy + Math.sin(t * 2.2) * 8);
    g.scale(4.4, 4.4);
    Flock.drawForm(g, d, t);
    g.restore();
    // なまえ
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = '700 ' + Math.round(clamp(W * 0.055, 18, 30)) + 'px -apple-system, "Hiragino Maru Gothic ProN", sans-serif';
    g.shadowColor = 'rgba(255,150,220,0.9)';
    g.shadowBlur = 12;
    g.fillText('あたらしい なかま！', cx, cy + 95);
    g.font = '800 ' + Math.round(clamp(W * 0.075, 24, 42)) + 'px -apple-system, "Hiragino Maru Gothic ProN", sans-serif';
    g.fillText(intro.name, cx, cy + 145);
    g.restore();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  function drawBanner(g) {
    if (!spec || bannerT > 3 || intro) return;
    const k = bannerT < 0.5 ? bannerT / 0.5
            : bannerT > 2.4 ? Math.max(0, 1 - (bannerT - 2.4) / 0.6)
            : 1;
    g.save();
    g.globalAlpha = k * 0.95;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.shadowColor = 'rgba(120,80,200,0.8)';
    g.shadowBlur = 14;
    g.font = '800 ' + Math.round(clamp(W * 0.07, 22, 40)) + 'px -apple-system, "Hiragino Maru Gothic ProN", sans-serif';
    g.fillText(spec.theme.name, W / 2, H * 0.16);
    g.font = '600 ' + Math.round(clamp(W * 0.035, 13, 20)) + 'px -apple-system, sans-serif';
    g.fillText('ゆめ ' + level, W / 2, H * 0.16 + 30);
    g.restore();
    g.shadowBlur = 0;
  }

  function drawCelebrate(g, t) {
    if (mode !== 'celebrate') return;
    const k = Math.min(1, celebrateT / 0.8);
    // にじ
    g.save();
    g.globalCompositeOperation = 'lighter';
    const rainbow = ['#ff6b8a', '#ffab70', '#ffd76e', '#a5e878', '#7db8ff', '#c9a2ff'];
    const cx = W / 2, cy = H * 1.05;
    const baseR = Math.min(W, H) * 0.75;
    for (let i = 0; i < rainbow.length; i++) {
      g.globalAlpha = 0.22 * k;
      g.strokeStyle = rainbow[i];
      g.lineWidth = Math.min(W, H) * 0.035;
      g.beginPath();
      g.arc(cx, cy, baseR + i * g.lineWidth, Math.PI, 0);
      g.stroke();
    }
    g.restore();
    // メッセージ
    g.save();
    g.globalAlpha = k;
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(255,180,80,0.9)';
    g.shadowBlur = 16;
    const bounce = 1 + Math.sin(t * 6) * 0.06;
    g.font = '900 ' + Math.round(clamp(W * 0.11, 34, 64) * bounce) + 'px -apple-system, "Hiragino Maru Gothic ProN", sans-serif';
    g.fillText('やったね！', W / 2, H * 0.38);
    g.restore();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  function draw(t) {
    Background.draw(ctx, t, W, H);
    drawPaths(ctx, t);

    // 星くずの光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lures) {
      const k = 1 - l.t / l.life;
      const gs = 70 * k + 20;
      ctx.globalAlpha = k * 0.9;
      ctx.drawImage(Glow.get('#fff2a8'), l.x - gs / 2, l.y - gs / 2, gs, gs);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    for (const pl of planets) pl.draw(ctx, t);
    Flock.draw(ctx, spirits, t);
    Particles.draw(ctx);
    drawHint(ctx, t);
    drawBanner(ctx);
    drawCelebrate(ctx, t);
    drawIntro(ctx, t);

    // フェード
    if (mode === 'fade') {
      const a = fadeDir === 1 ? Math.min(1, fadeT) : Math.max(0, 1 - fadeT);
      ctx.fillStyle = 'rgba(8,4,24,' + a + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---- メインループ ---- */
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - lastNow) / 1000;
    lastNow = now;
    if (dt > 0.05) dt = 0.05;   // タブ復帰時などの暴走防止
    elapsed += dt;
    update(dt, elapsed);
    draw(elapsed);
  }

  /* ---- 起動 ---- */
  resize();
  makeTitleDemo();
  requestAnimationFrame(now => {
    lastNow = now;
    requestAnimationFrame(loop);
  });
})();
