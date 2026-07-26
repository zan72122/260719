/* =========================================================
 * main.js — 起動・タイトル・モード切替・入力・メインループ
 * iPhone / iPad 縦横対応の全画面キャンバス
 * ========================================================= */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let mode = null; // null = タイトル
  let lastT = performance.now();

  /* ---------- キャンバス ---------- */

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode && mode.onResize) mode.onResize();
  }
  window.addEventListener('resize', () => setTimeout(resize, 60));
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  /* ---------- タイトル / モード切替 ---------- */

  function showTitle() {
    if (mode) { mode.exit(); mode = null; }
    FX.clear();
    document.getElementById('hud').innerHTML = '';
    document.getElementById('btn-home').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
  }

  function startMode(m) {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('btn-home').classList.remove('hidden');
    if (mode) mode.exit();
    FX.clear();
    mode = m;
    Sound.fx.chime();
    m.enter();
  }

  function buildTitle() {
    const wrap = document.getElementById('title-letters');
    'ABC'.split('').forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.color = Tracks.letters[ch].color;
      s.style.animationDelay = `${i * 0.18}s`;
      wrap.appendChild(s);
    });
    document.getElementById('play-coaster').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Coaster);
    });
    document.getElementById('play-balloon').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Balloon);
    });
    document.getElementById('play-circus').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Circus);
    });
    document.getElementById('play-cookie').addEventListener('pointerdown', () => {
      Sound.unlock(); startMode(Cookie);
    });
    document.getElementById('btn-home').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      Sound.fx.click();
      showTitle();
    });
  }

  /* ---------- 入力 ---------- */

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    canvas.setPointerCapture(e.pointerId);
    if (mode) mode.onDown(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode) mode.onMove(e.clientX, e.clientY);
  });
  const up = (e) => { if (mode) mode.onUp(e.clientX, e.clientY); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  /* ---------- タイトル画面の背景 (小さなデモコース) ---------- */

  let demoT = 0;
  function drawTitleBg(W, H, dt) {
    demoT += dt / 1000;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#8ed8f8');
    grad.addColorStop(1, '#dff3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(0, H * 0.86, W, H);

    // S字レールをカートがぐるぐる走るデモ
    const s = Math.min(W, H) * 0.5;
    const cx = W / 2, cy = H * 0.62;
    const path = Tracks.letters.S.ride.map(([x, y]) => ({
      x: cx + (x - 50) / 100 * s, y: cy + (y - 50) / 100 * s * 0.8,
    }));
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (const p of path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,200,0.5)';
    ctx.lineWidth = 5;
    ctx.stroke();
    // カート
    const k = (((demoT * 0.25) % 1) + 1) % 1;
    const idx = Math.max(0, Math.min(path.length - 2, Math.floor(k * (path.length - 1))));
    const f = k * (path.length - 1) - idx;
    const px = path[idx].x + (path[idx + 1].x - path[idx].x) * f;
    const py = path[idx].y + (path[idx + 1].y - path[idx].y) * f;
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐰', px, py - 14);
  }

  /* ---------- メインループ ---------- */

  function loop(now) {
    // 初回の rAF タイムスタンプは lastT より過去のことがある → 負の dt を防ぐ
    const dt = Math.max(0, Math.min(50, now - lastT));
    lastT = now;
    if (mode) {
      mode.tick(dt);
      mode.draw(ctx, innerWidth, innerHeight);
    } else {
      drawTitleBg(innerWidth, innerHeight, dt);
      FX.update();
      FX.draw(ctx);
    }
    requestAnimationFrame(loop);
  }

  buildTitle();
  resize();
  showTitle();
  requestAnimationFrame(loop);
})();
