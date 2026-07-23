'use strict';
/* ================= エフェクト（パーティクル・浮遊テキスト） ================= */

const Fx = (() => {
  const parts = [];   // {x,y,vx,vy,r,life,maxLife,color,type,rot,vr}
  const texts = [];   // {x,y,str,life,maxLife,size,color,vy,stroke}
  const rings = [];   // {x,y,r,maxR,life,maxLife,color,width}

  function pop(x, y, r, colorKey) {
    const def = Colors.defs[colorKey] || Colors.defs.B;
    const n = Math.round(Util.clamp(r * 0.5, 8, 22));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = Util.rand(0.4, 1.6) * r * 0.12;
      parts.push({
        x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - r * 0.02,
        r: Util.rand(1.5, 4.5), life: 0, maxLife: Util.rand(0.5, 1.1),
        color: Math.random() < 0.55 ? def.main : def.hi, type: 'drop',
      });
    }
    // 細かい霧しぶき
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = Util.rand(1.2, 2.6) * r * 0.1;
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: Util.rand(0.6, 1.6), life: 0, maxLife: Util.rand(0.25, 0.5),
        color: '#ffffff', type: 'mist',
      });
    }
    rings.push({ x, y, r: r * 0.6, maxR: r * 2.1, life: 0, maxLife: 0.38, color: def.hi, width: Util.clamp(r * 0.12, 2, 5) });
  }

  function sparkle(x, y, r, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      parts.push({
        x: x + Math.cos(a) * r * Math.random(), y: y + Math.sin(a) * r * Math.random(),
        vx: Math.cos(a) * 12, vy: Math.sin(a) * 12 - 18,
        r: Util.rand(1.4, 3.2), life: 0, maxLife: Util.rand(0.6, 1.2),
        color: Util.pick(['#fff6c9', '#c8f4ff', '#ffd7f2', '#ffffff']), type: 'star',
        rot: Math.random() * TAU, vr: Util.rand(-4, 4),
      });
    }
  }

  function confetti(w, h) {
    for (let i = 0; i < 70; i++) {
      parts.push({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.3,
        vx: Util.rand(-30, 30), vy: Util.rand(40, 110),
        r: Util.rand(3, 6), life: 0, maxLife: Util.rand(2.2, 3.6),
        color: Util.pick(['#ff5d70', '#ffd23f', '#3fb6ff', '#4ede7f', '#a86bf5', '#ff9440']),
        type: 'confetti', rot: Math.random() * TAU, vr: Util.rand(-6, 6),
      });
    }
  }

  function bubbleTrail(x, y) { // 生き物が泳ぐ跡の小泡
    parts.push({
      x, y, vx: Util.rand(-6, 6), vy: Util.rand(-26, -14),
      r: Util.rand(1.2, 3), life: 0, maxLife: Util.rand(0.8, 1.6),
      color: 'rgba(255,255,255,0.7)', type: 'air',
    });
  }

  function text(x, y, str, opts = {}) {
    texts.push({
      x, y, str, life: 0, maxLife: opts.maxLife || 1.1,
      size: opts.size || 18, color: opts.color || '#ffffff',
      vy: opts.vy != null ? opts.vy : -34, stroke: opts.stroke !== false,
    });
  }

  function praise(x, y, level) {
    const words = ['いいね！', 'すごい！', 'さすが！', 'ばっちり！', 'かんぺき！', 'きせき！！'];
    const w = words[Util.clamp(level, 0, words.length - 1)];
    text(x, y, w, { size: 22 + level * 3, color: '#fff6c9', maxLife: 1.4 });
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.maxLife) { parts.splice(i, 1); continue; }
      if (p.type === 'drop' || p.type === 'mist') {
        p.vy += 26 * dt;           // 水中でゆっくり沈む
        p.vx *= (1 - 1.6 * dt); p.vy *= (1 - 1.6 * dt);
      } else if (p.type === 'air') {
        p.vy -= 12 * dt;           // 空気は浮く
        p.vx += Math.sin(p.life * 6) * 8 * dt;
      } else if (p.type === 'confetti') {
        p.vy += 8 * dt; p.vx *= (1 - 0.6 * dt);
        p.rot += p.vr * dt;
      } else if (p.type === 'star') {
        p.vy += 6 * dt; p.rot += p.vr * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life += dt;
      t.y += t.vy * dt;
      t.vy *= (1 - 1.8 * dt);
      if (t.life >= t.maxLife) texts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life += dt;
      if (r.life >= r.maxLife) rings.splice(i, 1);
    }
  }

  function draw(ctx) {
    for (const r of rings) {
      const t = r.life / r.maxLife;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Util.lerp(r.r, r.maxR, Util.easeOut(t)), 0, TAU);
      ctx.stroke();
    }
    for (const p of parts) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = (1 - t) * (p.type === 'mist' ? 0.5 : 0.9);
      ctx.fillStyle = p.color;
      if (p.type === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        ctx.restore();
      } else if (p.type === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          ctx.lineTo(Math.cos(a) * p.r * 1.8, Math.sin(a) * p.r * 1.8);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * p.r * 0.6, Math.sin(a + Math.PI / 4) * p.r * 0.6);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.type === 'air') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - t * 0.4), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of texts) {
      const k = t.life / t.maxLife;
      const a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      const scale = k < 0.2 ? 0.6 + 2.2 * k : 1.04 - k * 0.04;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Util.clamp(a, 0, 1);
      ctx.font = `bold ${t.size}px 'Hiragino Maru Gothic ProN','BIZ UDGothic',system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (t.stroke) { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,40,70,0.75)'; ctx.strokeText(t.str, 0, 0); }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function clear() { parts.length = 0; texts.length = 0; rings.length = 0; }

  return { pop, sparkle, confetti, bubbleTrail, text, praise, update, draw, clear };
})();
