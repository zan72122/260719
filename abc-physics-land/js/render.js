/* =========================================================
 * render.js — 描画。文字は「顔つきのキャラクター」として描く
 *  - まばたきする目、タッチの方を見る瞳
 *  - 衝突すると縦につぶれる (squash & stretch)
 *  - 背景: 昼の空 / 月モードの星空
 * ========================================================= */

const Render2D = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", "Comic Sans MS", system-ui, sans-serif';
  let clouds = [];
  let bgStars = [];
  let lookAt = null; // 瞳が見る場所 (最後のタッチ)

  function initSky(w, h) {
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * w,
        y: h * 0.08 + Math.random() * h * 0.35,
        r: 30 + Math.random() * 45,
        v: 0.1 + Math.random() * 0.2,
      });
    }
    bgStars = [];
    for (let i = 0; i < 40; i++) {
      bgStars.push({
        x: Math.random(), y: Math.random() * 0.85,
        r: 1 + Math.random() * 2,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function setLookAt(p) { lookAt = p; }

  function drawSky(ctx, w, h, moonMode, t) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (moonMode) {
      grad.addColorStop(0, '#0b1445');
      grad.addColorStop(1, '#31356e');
    } else {
      grad.addColorStop(0, '#8ed8f8');
      grad.addColorStop(1, '#dff3ff');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (moonMode) {
      // 星と月
      for (const s of bgStars) {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + s.tw));
        ctx.fillStyle = `rgba(255,255,230,${a})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff7c9';
      ctx.beginPath();
      ctx.arc(w * 0.82, h * 0.14, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,210,160,0.5)';
      [[w * 0.8, h * 0.12, 8], [w * 0.85, h * 0.17, 6], [w * 0.79, h * 0.17, 4]].forEach(([x, y, r]) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      // 太陽と雲
      ctx.fillStyle = 'rgba(255, 216, 77, 0.95)';
      ctx.beginPath();
      ctx.arc(w * 0.85, h * 0.12, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 216, 77, 0.6)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t / 4000;
        ctx.beginPath();
        ctx.moveTo(w * 0.85 + Math.cos(a) * 48, h * 0.12 + Math.sin(a) * 48);
        ctx.lineTo(w * 0.85 + Math.cos(a) * 60, h * 0.12 + Math.sin(a) * 60);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const c of clouds) {
        c.x += c.v;
        if (c.x - c.r * 2 > w) c.x = -c.r * 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.arc(c.x + c.r * 0.8, c.y + c.r * 0.15, c.r * 0.75, 0, Math.PI * 2);
        ctx.arc(c.x - c.r * 0.8, c.y + c.r * 0.2, c.r * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGround(ctx, w, h, floorY, moonMode) {
    ctx.fillStyle = moonMode ? '#4b4e86' : '#7ed957';
    ctx.beginPath();
    ctx.moveTo(0, floorY + 14);
    ctx.lineTo(0, floorY - 4);
    // ゆるやかな丘
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, floorY - 4 - Math.sin(x / 90) * 5);
    }
    ctx.lineTo(w, floorY + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = moonMode ? '#3c3f70' : '#65c247';
    ctx.fillRect(0, floorY + 6, w, Math.max(0, h - floorY - 6) + 2);
  }

  /* ---------- 顔つき文字 ---------- */

  function shade(color, amt) {
    // hsl(h, s%, l%) の明度をずらす
    const m = /hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/.exec(color);
    if (!m) return color;
    return `hsl(${m[1]}, ${m[2]}%, ${Math.max(0, Math.min(100, parseFloat(m[3]) + amt))}%)`;
  }

  function drawLetter(ctx, body) {
    const g = body.game;
    const s = g.size;
    // 合成ボディの重心と字面中心のズレを回転込みで補正
    const cos = Math.cos(body.angle), sin = Math.sin(body.angle);
    const cx = body.position.x + g.offsetX * cos - g.offsetY * sin;
    const cy = body.position.y + g.offsetX * sin + g.offsetY * cos;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(body.angle);
    const squash = Math.max(0.55, Math.min(1.4, g.squash));
    ctx.scale(2 - squash, squash);

    // 生まれた直後はポンと大きくなる
    const age = (performance.now() - g.born) / 250;
    if (age < 1) {
      const k = 0.4 + 0.6 * (1 - Math.pow(1 - age, 3));
      ctx.scale(k, k);
    }

    // 文字本体 (影付き・縁取り)
    ctx.font = `900 ${s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = s * 0.16;
    ctx.strokeText(g.glyph, 0, 0);

    ctx.fillStyle = shade(g.color, -16);
    ctx.fillText(g.glyph, 0, s * 0.035);
    ctx.fillStyle = g.color;
    ctx.fillText(g.glyph, 0, 0);

    // 顔: 目 (まばたき + 視線) と ほっぺ
    const eyeY = -s * 0.08;
    const eyeGap = s * 0.13;
    const eyeR = s * 0.075;
    let px = 0, py = 0;
    if (lookAt) {
      const dx = lookAt.x - cx, dy = lookAt.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      // 体の回転に合わせて視線ベクトルも回す
      const lx = (dx * cos + dy * sin) / d;
      const ly = (-dx * sin + dy * cos) / d;
      px = lx * eyeR * 0.45;
      py = ly * eyeR * 0.45;
    }
    const blink = g.blinking > 0 && g.blinking < 0.7 ? 0.12 : 1;

    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(side * eyeGap, eyeY, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      if (blink === 1) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(side * eyeGap + px, eyeY + py, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 口 (にっこり)
    ctx.strokeStyle = 'rgba(60,40,40,0.85)';
    ctx.lineWidth = s * 0.028;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, eyeY + s * 0.12, s * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // ほっぺ
    ctx.fillStyle = 'rgba(255,120,140,0.35)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeGap * 1.9, eyeY + s * 0.1, eyeR * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDot(ctx, body) {
    const g = body.game;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, g.size + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(0, 0, g.size, 0, Math.PI * 2);
    ctx.fill();
    // 点にも小さな目
    ctx.fillStyle = '#fff';
    [[-0.35, -0.1], [0.35, -0.1]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(ex * g.size, ey * g.size, g.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#333';
    [[-0.35, -0.1], [0.35, -0.1]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(ex * g.size, ey * g.size, g.size * 0.14, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawWorld(ctx, w, h, opts = {}) {
    const t = performance.now();
    drawSky(ctx, w, h, opts.moonMode, t);
    if (opts.beforeBodies) opts.beforeBodies(ctx);
    if (opts.drawGround !== false) drawGround(ctx, w, h, Phys.floorY, opts.moonMode);
    for (const d of Phys.dots) drawDot(ctx, d);
    for (const b of Phys.letters) drawLetter(ctx, b);
    if (opts.afterBodies) opts.afterBodies(ctx);
    FX.update();
    FX.draw(ctx);
  }

  return { initSky, drawWorld, drawLetter, setLookAt, FONT, shade };
})();

window.Render2D = Render2D;
