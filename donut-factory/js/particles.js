'use strict';
/* ============================================================
 * particles.js — 紙吹雪・星・ハート・しぶきなどのパーティクル
 * ============================================================ */

const Particles = (() => {
  const MAX = 420;
  const pool = [];
  let active = 0;

  for (let i = 0; i < MAX; i++) {
    pool.push({ alive: false });
  }

  function spawn(opts) {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.alive) {
        p.alive = true;
        p.kind = opts.kind || 'confetti';
        p.x = opts.x; p.y = opts.y;
        p.vx = opts.vx || 0; p.vy = opts.vy || 0;
        p.g = opts.g !== undefined ? opts.g : 900;
        p.life = 0;
        p.maxLife = opts.maxLife || 1;
        p.size = opts.size || 8;
        p.color = opts.color || '#ff9ec7';
        p.rot = rand(0, TAU);
        p.rotV = rand(-8, 8);
        p.drag = opts.drag !== undefined ? opts.drag : 0.99;
        active++;
        return p;
      }
    }
    return null;
  }

  const CONFETTI_COLORS = ['#ff6f9c', '#ffb84d', '#ffe95c', '#7ce27c', '#5cc8ff', '#c99cff', '#ff9ec7'];

  function burst(x, y, kind, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(opts.minSpeed || 120, opts.maxSpeed || 420);
      spawn({
        kind,
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up || 160),
        g: opts.g !== undefined ? opts.g : 900,
        maxLife: rand(0.5, opts.life || 1.1),
        size: rand(5, opts.size || 11),
        color: opts.color || pick(CONFETTI_COLORS),
      });
    }
  }

  function sparkle(x, y, count = 8, color = '#fff') {
    burst(x, y, 'sparkle', count, { minSpeed: 40, maxSpeed: 180, up: 40, g: 60, life: 0.6, size: 9, color });
  }
  function confetti(x, y, count = 24) {
    burst(x, y, 'confetti', count, { up: 260, life: 1.4 });
  }
  function hearts(x, y, count = 6) {
    burst(x, y, 'heart', count, { minSpeed: 50, maxSpeed: 190, up: 200, g: 260, life: 1.0, size: 13, color: '#ff7ba9' });
  }
  function stars(x, y, count = 10) {
    burst(x, y, 'star', count, { minSpeed: 60, maxSpeed: 260, up: 180, g: 420, life: 1.0, size: 12, color: '#ffd94d' });
  }
  function splash(x, y, color, count = 10) {
    burst(x, y, 'drop', count, { minSpeed: 60, maxSpeed: 250, up: 200, g: 800, life: 0.8, size: 8, color });
  }
  function crumbs(x, y, count = 8) {
    burst(x, y, 'drop', count, { minSpeed: 60, maxSpeed: 220, up: 160, g: 900, life: 0.7, size: 6, color: '#e8b06a' });
  }
  function puff(x, y, count = 7, color = '#ffffff') {
    burst(x, y, 'puff', count, { minSpeed: 20, maxSpeed: 90, up: 30, g: -40, life: 0.8, size: 16, color });
  }

  function update(dt) {
    if (active <= 0) return;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; active--; continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }
  }

  function draw(ctx) {
    if (active <= 0) return;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      const k = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.fillStyle = p.color;
      const s = p.size;
      switch (p.kind) {
        case 'confetti':
          ctx.fillRect(-s / 2, -s / 4, s, s / 2);
          break;
        case 'sparkle': {
          ctx.beginPath();
          for (let j = 0; j < 4; j++) {
            const a = j * Math.PI / 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a - 0.35) * s * 0.3, Math.sin(a - 0.35) * s * 0.3);
            ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
            ctx.lineTo(Math.cos(a + 0.35) * s * 0.3, Math.sin(a + 0.35) * s * 0.3);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'star': {
          ctx.beginPath();
          for (let j = 0; j < 10; j++) {
            const a = -Math.PI / 2 + j * Math.PI / 5;
            const r = (j % 2 === 0 ? 1 : 0.45) * s;
            if (j === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'heart': {
          const h = s;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.35);
          ctx.bezierCurveTo(-h * 0.9, -h * 0.35, -h * 0.35, -h * 0.9, 0, -h * 0.25);
          ctx.bezierCurveTo(h * 0.35, -h * 0.9, h * 0.9, -h * 0.35, 0, h * 0.35);
          ctx.fill();
          break;
        }
        case 'drop':
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.5, 0, TAU);
          ctx.fill();
          break;
        case 'puff':
          ctx.globalAlpha = Math.min(1, k) * 0.7;
          ctx.beginPath();
          ctx.arc(0, 0, s * (1.4 - k * 0.6), 0, TAU);
          ctx.fill();
          break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    for (let i = 0; i < MAX; i++) pool[i].alive = false;
    active = 0;
  }

  return { spawn, burst, sparkle, confetti, hearts, stars, splash, crumbs, puff, update, draw, clear };
})();
