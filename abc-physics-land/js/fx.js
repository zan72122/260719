/* =========================================================
 * fx.js — パーティクル演出 (紙吹雪・星・絵文字ポップ・花火)
 * 物理ボディとは独立した軽量パーティクル。canvas に重ね描きする
 * ========================================================= */

const FX = (() => {
  let particles = [];

  const GRAV = 0.12;

  function confetti(x, y, count = 40) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      particles.push({
        kind: 'confetti',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        color: `hsl(${Math.random() * 360}, 90%, 60%)`,
        life: 1,
        decay: 0.006 + Math.random() * 0.006,
        drag: 0.985,
      });
    }
  }

  function burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const sp = 2.5 + Math.random() * 4;
      particles.push({
        kind: 'dot',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 3 + Math.random() * 5,
        color,
        life: 1,
        decay: 0.025,
        drag: 0.96,
      });
    }
  }

  function stars(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      particles.push({
        kind: 'star',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        r: 8 + Math.random() * 10,
        color: `hsl(${45 + Math.random() * 20}, 100%, ${60 + Math.random() * 20}%)`,
        life: 1,
        decay: 0.015,
        drag: 0.97,
      });
    }
  }

  function emojiPop(x, y, emoji, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 4 + Math.random() * 6;
      particles.push({
        kind: 'emoji',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: (Math.random() - 0.5) * 0.6,
        vr: (Math.random() - 0.5) * 0.15,
        size: 26 + Math.random() * 18,
        emoji,
        life: 1,
        decay: 0.008,
        drag: 0.99,
      });
    }
  }

  function firework(x, y, hue) {
    const h = hue !== undefined ? hue : Math.random() * 360;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      particles.push({
        kind: 'trail',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 3,
        color: `hsl(${h + Math.random() * 40 - 20}, 95%, 65%)`,
        life: 1,
        decay: 0.012,
        drag: 0.97,
        trail: [],
      });
    }
  }

  // タッチした場所のさりげないキラキラ
  function sparkle(x, y) {
    for (let i = 0; i < 3; i++) {
      particles.push({
        kind: 'dot',
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random(),
        r: 2 + Math.random() * 3,
        color: 'rgba(255,255,255,0.9)',
        life: 0.7,
        decay: 0.03,
        drag: 0.98,
      });
    }
  }

  function update() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += (p.kind === 'emoji' ? GRAV * 1.6 : GRAV);
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      if (p.vr !== undefined) p.rot += p.vr;
      if (p.trail) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
    }
  }

  function drawStar(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw(ctx) {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      if (p.kind === 'confetti') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 'dot') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'star') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        drawStar(ctx, p.r * (0.5 + p.life * 0.5));
      } else if (p.kind === 'emoji') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
      } else if (p.kind === 'trail') {
        if (p.trail.length > 1) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5 * p.life;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (const t of p.trail) ctx.lineTo(t.x, t.y);
          ctx.stroke();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function clear() { particles = []; }

  return { confetti, burst, stars, emojiPop, firework, sparkle, update, draw, clear };
})();

window.FX = FX;
