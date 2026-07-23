'use strict';
/* ================= 起動・メインループ・入力 ================= */

(() => {
  const canvas = document.getElementById('game');
  let W = 0, H = 0, dpr = 1;
  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 60;
  // 自動画質調整
  let frameCost = 16, autoLow = false;

  function computeBounds() {
    const hud = document.getElementById('hud');
    const bounds = { x: 6, y: 6, w: W - 12, h: H - 12 };
    if (!hud.classList.contains('hidden')) {
      const top = document.getElementById('hud-top').getBoundingClientRect();
      const bottom = document.getElementById('hud-bottom').getBoundingClientRect();
      const landscape = W > H * 1.15;
      bounds.y = top.bottom + 4;
      if (landscape) {
        // 横画面：タンクは右側に寄る
        bounds.w = bottom.left - 10 - bounds.x;
        bounds.h = H - 8 - bounds.y;
      } else {
        bounds.w = W - 12;
        bounds.h = bottom.top - 6 - bounds.y;
      }
    }
    bounds.w = Math.max(120, bounds.w);
    bounds.h = Math.max(120, bounds.h);
    return bounds;
  }

  function resize() {
    const oldBounds = { ...Game.world.bounds };
    const oldR0 = Game.world.R0;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Renderer.resize(W, H);

    const nb = computeBounds();
    Game.world.bounds = nb;
    const newR0 = Util.clamp(Math.min(W, H) * 0.048, 20, 46);
    Game.world.R0 = newR0;
    if (oldBounds.w > 50 && Game.world.bubbles.length) {
      Game.onResize(oldBounds, nb, oldR0, newR0);
    }
  }

  /* ---- 入力 ---- */
  function canvasPos(e) { return { x: e.clientX, y: e.clientY }; }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    AudioMan.unlock();
    const p = canvasPos(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    Game.pointerDown(e.pointerId, p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => {
    const p = canvasPos(e);
    Game.pointerMove(e.pointerId, p.x, p.y);
  });
  const up = e => { Game.pointerUp(e.pointerId); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', up);

  // iOSのダブルタップズーム・ピンチを抑制
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  document.body.addEventListener('layoutchange', () => setTimeout(resize, 0));

  // バックグラウンドでは一時停止
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.G.state === 'playing' && !Game.G.won && !Game.G.lost) {
      UI.showPause();
    }
    last = performance.now();
  });

  function frame(now) {
    const rawDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += rawDt;
    let steps = 0;
    while (acc >= FIXED && steps < 4) {
      Game.update(FIXED);
      acc -= FIXED;
      steps++;
    }
    if (steps === 4) acc = 0; // 追いつけない時は捨てる

    const t0 = performance.now();
    Renderer.draw(Game.world.time, { danger: Game.G.mode === 'arcade' ? Game.G.danger / 0.58 : 0 });
    frameCost = frameCost * 0.95 + (performance.now() - t0) * 0.05;
    // 描画が重い端末は自動で画質を下げる
    if (!autoLow && frameCost > 14 && Save.get().settings.quality >= 2) {
      autoLow = true;
      Renderer.setQuality(1);
    }
    requestAnimationFrame(frame);
  }

  /* ---- 起動 ---- */
  function boot() {
    Save.load();
    Renderer.init(canvas, Game.world);
    Creatures.init(Game.world);
    Renderer.setQuality(Save.get().settings.quality);
    UI.init();
    resize();
    Game.toTitle();
    resize(); // HUD表示状態確定後にもう一度
    requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
