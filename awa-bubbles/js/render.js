'use strict';
/* ================= レンダラー =================
   泡は円のまま計算し、描画時に隣接泡とのパワー図（加重ボロノイ）平面で
   輪郭をクリップ＋スムージングすることで、本物の泡クラスターのように
   平らな共有壁とプラトー境界ふうの膨らみを再現する。 */

const Renderer = (() => {
  let canvas, ctx, world;
  let W = 0, H = 0;
  let quality = 2;             // 1=低 2=高
  let planktons = [];          // 背景の浮遊粒子
  let shafts = [];             // 光条
  const SAMPLES_HI = 30, SAMPLES_LO = 18;
  const ptsX = new Float32Array(48), ptsY = new Float32Array(48);
  const smX = new Float32Array(48), smY = new Float32Array(48);

  function init(cv, w) {
    canvas = cv; ctx = cv.getContext('2d'); world = w;
  }

  function resize(w, h) {
    W = w; H = h;
    planktons = [];
    const n = Math.round((w * h) / 26000);
    for (let i = 0; i < n; i++) {
      planktons.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Util.rand(0.7, 2.2), sp: Util.rand(3, 10),
        ph: Math.random() * TAU, a: Util.rand(0.08, 0.28),
      });
    }
    shafts = [];
    for (let i = 0; i < 4; i++) {
      shafts.push({ x: (i + 0.5) / 4 + Util.rand(-0.08, 0.08), w: Util.rand(0.05, 0.12), ph: Math.random() * TAU, sp: Util.rand(0.05, 0.12) });
    }
  }

  function setQuality(q) { quality = q; }

  /* ---- 背景 ---- */
  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c4e7a');
    g.addColorStop(0.45, '#153a63');
    g.addColorStop(1, '#0b2545');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (quality >= 2) {
      // 光条
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of shafts) {
        const sway = Math.sin(time * s.sp + s.ph) * 0.06;
        const x0 = (s.x + sway) * W;
        const grad = ctx.createLinearGradient(x0, 0, x0 + W * 0.18, H);
        grad.addColorStop(0, 'rgba(120,200,255,0.055)');
        grad.addColorStop(0.7, 'rgba(120,200,255,0.012)');
        grad.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0 - s.w * W * 0.4, 0);
        ctx.lineTo(x0 + s.w * W * 0.4, 0);
        ctx.lineTo(x0 + s.w * W * 1.6 + W * 0.1, H);
        ctx.lineTo(x0 - s.w * W * 1.6 + W * 0.1, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // プランクトン
    ctx.fillStyle = '#bfe3ff';
    for (const p of planktons) {
      const y = (p.y - time * p.sp) % H;
      const yy = y < 0 ? y + H : y;
      const xx = p.x + Math.sin(time * 0.4 + p.ph) * 14;
      ctx.globalAlpha = p.a * (0.7 + 0.3 * Math.sin(time + p.ph));
      ctx.beginPath();
      ctx.arc(xx, yy, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---- 泡の輪郭生成：隣接泡との共有壁でクリップ ---- */
  function buildOutline(b, N) {
    const wob = 0.02 + 0.02 * Math.min(1, b.contacts.length ? 0 : 1); // 孤立泡はゆらゆら
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const wobble = 1 + Math.sin(a * 3 + world.time * 2.4 + b.phase) * wob
        + Math.sin(a * 5 - world.time * 1.8 + b.phase * 2) * wob * 0.6
        + b.inflating * Math.sin(a * 2 + world.time * 14) * 0.015;
      ptsX[i] = Math.cos(a) * b.r * wobble;
      ptsY[i] = Math.sin(a) * b.r * wobble;
    }
    // 各隣接に対しパワー図平面でクリップ
    for (const c of b.contacts) {
      const o = c.o;
      const d = c.d;
      if (d >= b.r + o.r) continue;
      // 平面までの距離（半径差を考慮した加重中点） + 壁のすき間
      let h = (d * d + b.r * b.r - o.r * o.r) / (2 * d);
      h = Util.clamp(h - b.r * 0.045, b.r * 0.3, b.r * 1.2);
      const nx = (o.x - b.x) / d, ny = (o.y - b.y) / d;
      for (let i = 0; i < N; i++) {
        const dot = ptsX[i] * nx + ptsY[i] * ny;
        if (dot > h) {
          ptsX[i] -= nx * (dot - h);
          ptsY[i] -= ny * (dot - h);
        }
      }
    }
    // スムージング（角を丸めてプラトー境界ふうに）
    for (let i = 0; i < N; i++) {
      const p = (i + N - 1) % N, n = (i + 1) % N;
      smX[i] = ptsX[i] * 0.56 + (ptsX[p] + ptsX[n]) * 0.22;
      smY[i] = ptsY[i] * 0.56 + (ptsY[p] + ptsY[n]) * 0.22;
    }
  }

  function tracePath(N) {
    ctx.beginPath();
    // 中点を通る滑らかな閉曲線
    let mx = (smX[N - 1] + smX[0]) / 2, my = (smY[N - 1] + smY[0]) / 2;
    ctx.moveTo(mx, my);
    for (let i = 0; i < N; i++) {
      const n = (i + 1) % N;
      const nmx = (smX[i] + smX[n]) / 2, nmy = (smY[i] + smY[n]) / 2;
      ctx.quadraticCurveTo(smX[i], smY[i], nmx, nmy);
    }
    ctx.closePath();
  }

  /* ---- 泡本体 ---- */
  function drawBubble(b, time) {
    const N = quality >= 2 ? SAMPLES_HI : SAMPLES_LO;
    const def = Colors.defs[b.key];
    buildOutline(b, N);

    const scale = b.spawnT < 1 ? 0.4 + 0.6 * Util.easeOut(b.spawnT) : 1;
    // 破裂予約中はキラキラ収縮
    let popScale = 1, popGlow = 0;
    if (b.popping) {
      const remain = Math.max(0, b.popAt - world.time);
      const t = 1 - Util.clamp(remain / 0.4, 0, 1);
      popScale = 1 + Math.sin(t * 22) * 0.05 * t;
      popGlow = t;
    }

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(scale * popScale, scale * popScale);

    tracePath(N);

    // 本体：中央が透けて外周が色づく（本物のシャボンの見え方）
    const grad = ctx.createRadialGradient(0, 0, b.r * 0.15, 0, 0, b.r * 1.02);
    if (b.wild) {
      const hue = (time * 80) % 360;
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(0.72, `hsla(${hue},90%,72%,0.42)`);
      grad.addColorStop(1, `hsla(${(hue + 90) % 360},95%,68%,0.85)`);
    } else {
      grad.addColorStop(0, hexA(def.hi, 0.10));
      grad.addColorStop(0.62, hexA(def.main, 0.34));
      grad.addColorStop(0.92, hexA(def.main, 0.72));
      grad.addColorStop(1, hexA(def.deep, 0.9));
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // フラッシュ（色変化・注入時）
    if (b.flash > 0) {
      ctx.globalAlpha = b.flash * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (popGlow > 0) {
      ctx.globalAlpha = popGlow * 0.55;
      ctx.fillStyle = def.glow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 輪郭
    ctx.lineWidth = Util.clamp(b.r * 0.06, 1.4, 3.4);
    ctx.strokeStyle = b.wild ? 'rgba(255,255,255,0.9)' : hexA(def.hi, 0.75);
    ctx.stroke();

    // ハイライト（左上の照り）
    if (quality >= 2 || b.r > world.R0 * 0.8) {
      ctx.save();
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.ellipse(-b.r * 0.34, -b.r * 0.38, b.r * 0.26, b.r * 0.13, -0.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.r * 0.3, b.r * 0.34, b.r * 0.06, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 生き物
    Creatures.drawInBubble(ctx, b, time);
  }

  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bb = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${bb},${a})`;
  }

  /* ---- 共有壁（プラトー境界）の描画 ---- */
  function drawWalls() {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,240,255,0.28)';
    for (const p of world.pairs) {
      if (p.d >= p.a.r + p.b.r) continue;
      const overlap = (p.a.r + p.b.r - p.d);
      // 壁の中点と長さ
      const h = (p.d * p.d + p.a.r * p.a.r - p.b.r * p.b.r) / (2 * p.d);
      const mx = p.a.x + p.nx * h, my = p.a.y + p.ny * h;
      const halfLen = Math.sqrt(Math.max(4, p.a.r * p.a.r - h * h)) * 0.86;
      ctx.lineWidth = Util.clamp(overlap * 0.16, 1, 4);
      ctx.beginPath();
      ctx.moveTo(mx - p.ny * halfLen, my + p.nx * halfLen);
      ctx.lineTo(mx + p.ny * halfLen, my - p.nx * halfLen);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacleZone() {
    // 障害物の危険範囲をうっすら示す
    for (const u of Creatures.urchins) {
      ctx.save();
      ctx.globalAlpha = 0.08 + 0.04 * Math.sin(world.time * 2);
      ctx.fillStyle = '#ff6b9a';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 1.28, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function draw(time, hudInfo) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(time);
    drawObstacleZone();

    // 泡（大きい順に描くと重なりがきれい）
    const sorted = world.bubbles.slice().sort((a, b2) => b2.r - a.r);
    for (const b of sorted) drawBubble(b, time);
    drawWalls();

    Creatures.draw(ctx, time);
    Fx.draw(ctx);

    // 危険ライン（アーケード）
    if (hudInfo && hudInfo.danger > 0.72) {
      const bl = world.bounds;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 8);
      ctx.strokeStyle = '#ff5d70';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(bl.x + 4, bl.y + 4, bl.w - 8, bl.h - 8);
      ctx.restore();
    }
  }

  return { init, resize, setQuality, draw, get ctx() { return ctx; } };
})();
