/* =========================================================
 * main.js — 起動・タイトル画面・入力・メインループ
 * iPhone / iPad の縦横どちらでも遊べるよう全画面キャンバス
 * ========================================================= */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let mode = null;          // null = タイトル画面
  let lastT = performance.now();
  let titleSpawnTimer = 0;

  /* ---------- キャンバスとリサイズ ---------- */

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render2D.initSky(innerWidth, innerHeight);
    if (mode && mode.onResize) mode.onResize();
    else if (mode) Phys.setBounds(innerWidth, innerHeight, { floorOffset: 10 });
    else Phys.setBounds(innerWidth, innerHeight, { floorOffset: 0 });
  }
  window.addEventListener('resize', () => setTimeout(resize, 60));
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  /* ---------- タイトル画面 ---------- */

  function showTitle() {
    if (mode) { mode.exit(); mode = null; }
    Phys.clearLetters(false);
    FX.clear();
    document.getElementById('hud').innerHTML = '';
    document.getElementById('btn-home').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    Phys.setBounds(innerWidth, innerHeight, { floorOffset: 0 });
  }

  function startMode(m) {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('btn-home').classList.remove('hidden');
    Phys.clearLetters(false);
    FX.clear();
    if (mode) mode.exit();
    mode = m;
    Sound.fx.chime();
    m.enter();
  }

  function buildTitle() {
    const wrap = document.getElementById('title-letters');
    'ABC'.split('').forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.color = window.GameData.LETTERS[ch].color;
      s.style.animationDelay = `${i * 0.18}s`;
      wrap.appendChild(s);
    });
    document.getElementById('play-playground').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Modes.playground);
    });
    document.getElementById('play-words').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Modes.words);
    });
    document.getElementById('play-catch').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Modes.catcher);
    });
    document.getElementById('btn-home').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      Sound.fx.click();
      showTitle();
    });
  }

  /* ---------- 入力 (マルチタッチ対応) ---------- */

  const pointers = new Map(); // pointerId -> { x, y, t, moved, body }

  function toLocal(e) {
    return { x: e.clientX, y: e.clientY };
  }

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const p = toLocal(e);
    canvas.setPointerCapture(e.pointerId);
    Render2D.setLookAt(p);
    const body = mode || true ? Phys.pointerDown(e.pointerId, p.x, p.y) : null;
    pointers.set(e.pointerId, { x: p.x, y: p.y, t: performance.now(), moved: false, body });
    if (!body && !mode) {
      // タイトル画面: 空タップでも文字が降る
      spawnTitleLetter(p.x);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rec = pointers.get(e.pointerId);
    const p = toLocal(e);
    Render2D.setLookAt(p);
    if (!rec) return;
    if (Math.hypot(p.x - rec.x, p.y - rec.y) > 14) rec.moved = true;
    Phys.pointerMove(e.pointerId, p.x, p.y);
  });

  function endPointer(e) {
    const rec = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    const link = Phys.pointerUp(e.pointerId);
    if (!rec) return;
    const dur = performance.now() - rec.t;
    const isTap = !rec.moved && (!link || !link.moved) && dur < 500;

    if (mode) {
      if (link && link.body && isTap) {
        mode.onTapBody(link.body);
      } else if (link && mode.onDragEnd) {
        mode.onDragEnd(link);
      } else if (!link && isTap && mode.onTapEmpty) {
        mode.onTapEmpty(rec.x, rec.y);
      }
    } else if (link && link.body && isTap && link.body.game && !link.body.game.isDot) {
      // タイトル画面でも文字はおしゃべりする
      Sound.speakLetter(link.body.game.char);
      FX.stars(link.body.position.x, link.body.position.y, 6);
      Sound.fx.pop();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // iOS のダブルタップズーム等を抑止 (文字トレイの横スクロールだけは許可)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (!(e.target.closest && e.target.closest('#tray-letters'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  /* ---------- タイトル画面の飾り文字 ---------- */

  function spawnTitleLetter(x) {
    const ch = window.GameData.ALPHABET[Math.floor(Math.random() * 26)];
    const s = Math.max(64, Math.min(110, Math.min(innerWidth, innerHeight) * 0.14));
    Phys.spawnLetter(ch, x !== undefined ? x : s + Math.random() * (innerWidth - s * 2), -s, {
      size: s, maxCount: 10, lower: Math.random() < 0.3,
    });
  }

  /* ---------- メインループ ---------- */

  function loop(now) {
    const dt = Math.min(50, now - lastT);
    lastT = now;

    if (!mode) {
      titleSpawnTimer -= dt;
      if (titleSpawnTimer <= 0 && Phys.letters.length < 7) {
        titleSpawnTimer = 2200;
        spawnTitleLetter();
      }
    }

    Phys.tick(dt);
    if (mode) mode.tick(dt);

    const opts = mode ? mode.drawOpts() : {};
    Render2D.drawWorld(ctx, innerWidth, innerHeight, opts);

    requestAnimationFrame(loop);
  }

  /* ---------- 起動 ---------- */

  Phys.init();
  buildTitle();
  resize();
  showTitle();
  requestAnimationFrame(loop);
})();
