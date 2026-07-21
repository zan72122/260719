'use strict';
/*
 * 光のスプライト・パーティクル・背景（空、星、オーロラ、雪や泡など）
 * iOSのshadowBlurは重いので、事前に描いたグロースプライトをdrawImageする。
 */

/* ---- グロースプライトのキャッシュ ---- */
const Glow = (() => {
  const cache = new Map();
  function get(color) {
    let c = cache.get(color);
    if (c) return c;
    const s = 96;
    c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.22, rgba(color, 0.7));
    grad.addColorStop(0.6, rgba(color, 0.18));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    cache.set(color, c);
    return c;
  }
  return { get };
})();

/* ---- パーティクル ---- */
const Particles = (() => {
  let list = [];

  function spawn(p) {
    if (list.length > 700) return;
    list.push(Object.assign({
      t: 0, life: 1, vx: 0, vy: 0, grav: 0, drag: 1,
      size: 4, type: 'spark', color: '#ffffff', rot: 0, rotV: 0, char: ''
    }, p));
  }

  function burst(x, y, color, n, speed, size) {
    n = n || 14; speed = speed || 150; size = size || 4;
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(0.25, 1) * speed;
      spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.5, 1.05), color, size: rand(size * 0.5, size * 1.5),
        grav: 26, drag: 0.93, type: 'spark'
      });
    }
  }

  function ring(x, y, color, r0) {
    spawn({ x, y, type: 'ring', color, life: 0.7, size: r0 || 10 });
  }

  function firework(x, y, color) {
    burst(x, y, color, 34, 250, 5);
    burst(x, y, '#ffffff', 10, 130, 3);
    ring(x, y, color, 14);
    spawn({ x, y, type: 'flash', color: '#ffffff', life: 0.25, size: 90 });
  }

  function puff(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = rand(TAU);
      spawn({
        x, y, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45 - 15,
        life: 0.55, color, size: rand(7, 12), type: 'puff', drag: 0.9
      });
    }
  }

  function starPop(x, y) {
    spawn({
      x, y, type: 'star', color: '#fff2a8', life: 0.9,
      size: rand(9, 15), vy: -45, rotV: rand(-4, 4)
    });
  }

  function emoji(x, y, ch, size) {
    spawn({
      x, y, type: 'emoji', char: ch, life: rand(2.2, 3.4),
      size: size || rand(24, 44), vy: rand(-120, -60), vx: rand(-30, 30),
      drag: 0.995, rotV: rand(-1.5, 1.5)
    });
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.life) { list.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }
  }

  function drawStarPath(g, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2;
      const rr = (i % 2 === 0) ? r : r * 0.45;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }

  function draw(g) {
    g.save();
    for (const p of list) {
      const k = 1 - p.t / p.life;
      if (p.type === 'spark') {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k;
        const s = p.size * 4;
        g.drawImage(Glow.get(p.color), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'ring') {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k * 0.85;
        g.strokeStyle = p.color;
        g.lineWidth = 1.5 + 3 * k;
        g.beginPath();
        g.arc(p.x, p.y, p.size + (p.t / p.life) * 90, 0, TAU);
        g.stroke();
      } else if (p.type === 'flash') {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k * 0.5;
        const s = p.size * 2;
        g.drawImage(Glow.get(p.color), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'puff') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = k * 0.3;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + p.t * 1.5), 0, TAU);
        g.fill();
      } else if (p.type === 'star') {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = k;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        drawStarPath(g, p.size);
        g.fill();
        g.restore();
      } else if (p.type === 'emoji') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = Math.min(1, k * 2);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(Math.sin(p.rot) * 0.4);
        g.font = Math.round(p.size) + 'px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.char, 0, 0);
        g.restore();
      }
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function clear() { list = []; }
  function count() { return list.length; }

  return { spawn, burst, ring, firework, puff, starPop, emoji, update, draw, clear, count, drawStarPath };
})();

/* ---- 背景（空・星・オーロラ・テーマ別アンビエント） ---- */
const Background = (() => {
  let theme = null;
  let stars = [];
  let auroras = [];
  let ambient = [];       // 雪・泡・花びら
  let shootTimer = 3;
  let shots = [];
  let skyGrad = null;
  let gradH = 0;

  function init(th, W, H) {
    theme = th;
    skyGrad = null;
    stars = [];
    const n = clamp(Math.round(W * H / 9000), 40, 130);
    for (let i = 0; i < n; i++) {
      stars.push({
        nx: rand(), ny: rand(), r: rand(0.5, 1.7),
        ph: rand(TAU), sp: rand(0.6, 1.8)
      });
    }
    auroras = [];
    for (let i = 0; i < 4; i++) {
      auroras.push({
        nx: rand(0.1, 0.9), ny: rand(0.05, 0.75),
        rf: rand(0.3, 0.55), color: th.glow[i % th.glow.length],
        ph: rand(TAU), spx: rand(0.05, 0.14), spy: rand(0.03, 0.1),
        ax: rand(0.04, 0.1), ay: rand(0.03, 0.08)
      });
    }
    ambient = [];
    shots = [];
    shootTimer = rand(2, 5);
  }

  function spawnAmbient(W, H) {
    const f = theme.feature;
    if (!f || ambient.length > 55) return;
    if (f === 'snow') {
      ambient.push({
        x: rand(W), y: -10, vy: rand(18, 42), ph: rand(TAU),
        sway: rand(15, 40), r: rand(1.5, 3.5), type: 'snow', t: 0
      });
    } else if (f === 'bubbles') {
      ambient.push({
        x: rand(W), y: H + 12, vy: -rand(22, 55), ph: rand(TAU),
        sway: rand(8, 25), r: rand(3, 9), type: 'bubble', t: 0
      });
    } else if (f === 'petals') {
      ambient.push({
        x: rand(-20, W), y: -10, vy: rand(25, 50), ph: rand(TAU),
        sway: rand(25, 60), r: rand(4, 7), type: 'petal', t: 0,
        rot: rand(TAU), rotV: rand(-2, 2),
        color: pick(['#ffb3cf', '#ffd1e0', '#ffe3ac'])
      });
    }
  }

  function update(dt, t, W, H) {
    if (theme.feature && Math.random() < dt * 8) spawnAmbient(W, H);
    for (let i = ambient.length - 1; i >= 0; i--) {
      const a = ambient[i];
      a.t += dt;
      a.y += a.vy * dt;
      a.x += Math.sin(t * 0.8 + a.ph) * a.sway * dt;
      if (a.rotV) a.rot += a.rotV * dt;
      if (a.y > H + 20 || a.y < -30) ambient.splice(i, 1);
    }
    if (theme.feature === 'shooting') {
      shootTimer -= dt;
      if (shootTimer <= 0) {
        shootTimer = rand(3.5, 8);
        shots.push({
          x: rand(W * 0.25, W * 1.05), y: rand(-10, H * 0.3),
          vx: -rand(320, 520), vy: rand(140, 240), t: 0, life: rand(0.8, 1.2)
        });
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.t >= s.life) shots.splice(i, 1);
      }
    }
  }

  function draw(g, t, W, H) {
    // 空のグラデーション
    if (!skyGrad || gradH !== H) {
      gradH = H;
      skyGrad = g.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, theme.sky[0]);
      skyGrad.addColorStop(0.55, theme.sky[1]);
      skyGrad.addColorStop(1, theme.sky[2]);
    }
    g.fillStyle = skyGrad;
    g.fillRect(0, 0, W, H);

    // オーロラのようにただよう光
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const a of auroras) {
      const x = (a.nx + Math.sin(t * a.spx + a.ph) * a.ax) * W;
      const y = (a.ny + Math.cos(t * a.spy + a.ph) * a.ay) * H;
      const r = a.rf * Math.min(W, H) * (1 + Math.sin(t * 0.2 + a.ph) * 0.12);
      g.globalAlpha = 0.16 + Math.sin(t * 0.3 + a.ph) * 0.05;
      g.drawImage(Glow.get(a.color), x - r, y - r, r * 2, r * 2);
    }
    // またたく星
    g.fillStyle = '#ffffff';
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      g.globalAlpha = tw * 0.8;
      g.beginPath();
      g.arc(s.nx * W, s.ny * H, s.r, 0, TAU);
      g.fill();
    }
    // 流れ星
    for (const s of shots) {
      const k = 1 - s.t / s.life;
      const grad = g.createLinearGradient(s.x, s.y, s.x - s.vx * 0.25, s.y - s.vy * 0.25);
      grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * k) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.25, s.y - s.vy * 0.25);
      g.stroke();
      g.globalAlpha = k;
      g.drawImage(Glow.get('#aecbff'), s.x - 12, s.y - 12, 24, 24);
    }
    g.restore();

    // テーマ別アンビエント（雪・泡・花びら）
    g.save();
    for (const a of ambient) {
      if (a.type === 'snow') {
        g.globalAlpha = 0.85;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(a.x, a.y, a.r, 0, TAU);
        g.fill();
      } else if (a.type === 'bubble') {
        g.globalAlpha = 0.5;
        g.strokeStyle = 'rgba(220,245,255,0.9)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(a.x, a.y, a.r, 0, TAU);
        g.stroke();
        g.globalAlpha = 0.7;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath();
        g.arc(a.x - a.r * 0.35, a.y - a.r * 0.35, a.r * 0.22, 0, TAU);
        g.fill();
      } else if (a.type === 'petal') {
        g.globalAlpha = 0.85;
        g.save();
        g.translate(a.x, a.y);
        g.rotate(a.rot);
        g.fillStyle = a.color;
        g.beginPath();
        g.ellipse(0, 0, a.r, a.r * 0.55, 0, 0, TAU);
        g.fill();
        g.restore();
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  return { init, update, draw };
})();
