'use strict';
/*
 * ひかりのこども（スピリット）— ボイド（群れ）シミュレーション
 * FROSTと同じく、分離・整列・結合の3ルール＋描いた道への追従で動く。
 * レベルごとに姿が変わる: spirit / fish / bird / butterfly / jelly / star / firefly
 */

class Spirit {
  constructor(x, y, group, colorKey, color, form) {
    this.x = x;
    this.y = y;
    const a = rand(TAU);
    this.vx = Math.cos(a) * 45;
    this.vy = Math.sin(a) * 45;
    this.group = group;
    this.colorKey = colorKey;
    this.color = color;
    this.form = form;
    this.size = rand(5, 7.2);
    this.phase = rand(TAU);
    this.phaseSpeed = rand(6, 10);
    this.wanderA = rand(TAU);
    this.trail = [];
    this.trailTick = 0;
    this.path = null;
    this.pathIdx = 0;
    this.dead = false;
    this.absorbing = null;
    this.absT = 0;
    this.absR = 0;
    this.absA = 0;
  }
}

const Flock = (() => {

  /* 全スピリットの更新。env = {W,H,planets,lures,assist(Set of group)} */
  function update(spirits, env, dt, t) {
    const n = spirits.length;
    const W = env.W, H = env.H;

    for (let i = 0; i < n; i++) {
      const s = spirits[i];
      if (s.dead) continue;
      s.phase += s.phaseSpeed * dt;

      /* 惑星に吸い込まれ中：らせんを描いて中心へ */
      if (s.absorbing) {
        const p = s.absorbing;
        s.absT += dt;
        const k = Math.min(1, s.absT / 0.5);
        const r = s.absR * (1 - k * k);
        s.absA += dt * (7 + 10 * k);
        s.x = p.x + Math.cos(s.absA) * r;
        s.y = p.y + Math.sin(s.absA) * r;
        if (k >= 1) {
          s.dead = true;
          p.receive(s);
        }
        continue;
      }

      let fx = 0, fy = 0;

      /* --- 群れの3ルール --- */
      let sepX = 0, sepY = 0;
      let cohX = 0, cohY = 0, cohN = 0;
      let aliX = 0, aliY = 0, aliN = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = spirits[j];
        if (o.dead || o.absorbing) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        const d2v = dx * dx + dy * dy;
        if (d2v < 676) { // 26px以内 → 分離（色がちがっても）
          const d = Math.sqrt(d2v) || 1;
          const w = 1 - d / 26;
          sepX -= dx / d * w;
          sepY -= dy / d * w;
        }
        if (o.group === s.group) {
          if (d2v < 5625) { cohX += o.x; cohY += o.y; cohN++; } // 75px
          if (d2v < 2704) { aliX += o.vx; aliY += o.vy; aliN++; } // 52px
        }
      }
      fx += sepX * 150;
      fy += sepY * 150;
      const onPath = !!s.path;
      if (cohN) {
        const w = onPath ? 0.25 : 0.7;
        fx += (cohX / cohN - s.x) * w;
        fy += (cohY / cohN - s.y) * w;
      }
      if (aliN) {
        fx += (aliX / aliN - s.vx) * 0.9;
        fy += (aliY / aliN - s.vy) * 0.9;
      }

      /* --- ふらふらとした夢のような揺らぎ --- */
      s.wanderA += (Math.sin(t * 0.9 + s.phase) * 1.6 + (Math.random() - 0.5) * 3) * dt;
      fx += Math.cos(s.wanderA) * 26;
      fy += Math.sin(s.wanderA) * 26;

      /* --- 描かれた道に沿って進む --- */
      if (s.path) {
        const p = s.path;
        if (!p.alive) {
          s.path = null;
        } else {
          while (s.pathIdx < p.pts.length &&
                 dist2(s.x, s.y, p.pts[s.pathIdx].x, p.pts[s.pathIdx].y) < 625) {
            s.pathIdx++;
          }
          if (s.pathIdx < p.pts.length) {
            const tp = p.pts[s.pathIdx];
            const dx = tp.x - s.x, dy = tp.y - s.y;
            const d = Math.hypot(dx, dy) || 1;
            fx += dx / d * 420;
            fy += dy / d * 420;
          } else if (p.done) {
            const e = p.pts[p.pts.length - 1];
            fx += (e.x - s.x) * 1.4;
            fy += (e.y - s.y) * 1.4;
          }
        }
      }

      /* --- 星くず（タップ）に集まる --- */
      for (const l of env.lures) {
        const dx = l.x - s.x, dy = l.y - s.y;
        const d2v = dx * dx + dy * dy;
        if (d2v < 36100) { // 190px
          const d = Math.sqrt(d2v) || 1;
          const k = 1 - l.t / l.life;
          fx += dx / d * 160 * k;
          fy += dy / d * 160 * k;
        }
      }

      /* --- 惑星との関係 --- */
      for (const pl of env.planets) {
        const dx = pl.x - s.x, dy = pl.y - s.y;
        const d2v = dx * dx + dy * dy;
        if (!pl.done && pl.colorKey === s.colorKey) {
          const assist = env.assist.has(s.group);
          const pull = pl.r + 130 + (assist ? 320 : 0);
          if (d2v < pull * pull) {
            const d = Math.sqrt(d2v) || 1;
            const w = 55 + 280 * (1 - d / pull);
            fx += dx / d * w;
            fy += dy / d * w;
            if (d < pl.r * 0.85) {
              s.absorbing = pl;
              s.absT = 0;
              s.absR = d;
              s.absA = Math.atan2(s.y - pl.y, s.x - pl.x);
              s.path = null;
              break;
            }
          } else if (assist) {
            const d = Math.sqrt(d2v) || 1;
            fx += dx / d * 34;
            fy += dy / d * 34;
          }
        } else {
          const rr = pl.r + 26;
          if (d2v < rr * rr) {
            const d = Math.sqrt(d2v) || 1;
            const w = 320 * (1.2 - d / rr);
            fx -= dx / d * w;
            fy -= dy / d * w;
            if (d < pl.r + 10) {
              AudioSys.boing();
              if (Math.random() < dt * 5) Particles.puff(s.x, s.y, s.color);
            }
          }
        }
      }
      if (s.absorbing) continue;

      /* --- 画面の端からやさしく押し返す --- */
      const m = 34;
      if (s.x < m) fx += (m - s.x) * 7;
      if (s.x > W - m) fx -= (s.x - (W - m)) * 7;
      if (s.y < m) fy += (m - s.y) * 7;
      if (s.y > H - m) fy -= (s.y - (H - m)) * 7;

      /* --- 速度の積分とクランプ --- */
      s.vx += fx * dt;
      s.vy += fy * dt;
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const maxSp = s.path ? 250 : 150;
      const minSp = 28;
      if (sp > maxSp) { s.vx = s.vx / sp * maxSp; s.vy = s.vy / sp * maxSp; }
      else if (sp < minSp) { s.vx = s.vx / sp * minSp; s.vy = s.vy / sp * minSp; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.x < 2) { s.x = 2; s.vx = Math.abs(s.vx) * 0.6; }
      if (s.x > W - 2) { s.x = W - 2; s.vx = -Math.abs(s.vx) * 0.6; }
      if (s.y < 2) { s.y = 2; s.vy = Math.abs(s.vy) * 0.6; }
      if (s.y > H - 2) { s.y = H - 2; s.vy = -Math.abs(s.vy) * 0.6; }

      /* --- 尾（トレイル） --- */
      s.trailTick += dt;
      if (s.trailTick > 0.045) {
        s.trailTick = 0;
        s.trail.unshift({ x: s.x, y: s.y });
        if (s.trail.length > 7) s.trail.pop();
      }
    }
  }

  /* ---- 描画 ---- */
  function draw(g, spirits, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 尾
    for (const s of spirits) {
      if (s.dead || s.trail.length < 2) continue;
      for (let i = 0; i < s.trail.length - 1; i++) {
        const a = (1 - i / s.trail.length) * 0.3;
        g.strokeStyle = rgba(s.color, a);
        g.lineWidth = Math.max(0.8, s.size * 0.55 * (1 - i / s.trail.length));
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(s.trail[i].x, s.trail[i].y);
        g.lineTo(s.trail[i + 1].x, s.trail[i + 1].y);
        g.stroke();
      }
    }
    // 光のオーラ
    for (const s of spirits) {
      if (s.dead) continue;
      const pulse = s.form === 'firefly' ? (0.5 + 0.5 * Math.sin(s.phase)) : 1;
      const gs = s.size * 4.6 * pulse;
      g.globalAlpha = 0.85 * (0.6 + 0.4 * pulse);
      g.drawImage(Glow.get(s.color), s.x - gs / 2, s.y - gs / 2, gs, gs);
    }
    g.restore();
    g.globalAlpha = 1;

    // からだ
    for (const s of spirits) {
      if (s.dead) continue;
      drawForm(g, s, t);
    }
  }

  function drawForm(g, s, t) {
    const ang = Math.atan2(s.vy, s.vx);
    const sz = s.size;
    const flap = Math.sin(s.phase);
    g.save();
    g.translate(s.x, s.y);

    switch (s.form) {
      case 'fish': {
        g.rotate(ang);
        g.fillStyle = lightenHex(s.color, 0.25);
        g.beginPath();
        g.ellipse(0, 0, sz * 1.4, sz * 0.85, 0, 0, TAU);
        g.fill();
        // しっぽ
        g.save();
        g.translate(-sz * 1.2, 0);
        g.rotate(flap * 0.6);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-sz * 1.1, -sz * 0.7);
        g.lineTo(-sz * 1.1, sz * 0.7);
        g.closePath();
        g.fill();
        g.restore();
        // め
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(sz * 0.65, -sz * 0.22, sz * 0.3, 0, TAU);
        g.fill();
        g.fillStyle = '#223';
        g.beginPath();
        g.arc(sz * 0.75, -sz * 0.22, sz * 0.15, 0, TAU);
        g.fill();
        break;
      }
      case 'bird': {
        g.rotate(ang);
        const w = flap * 0.9;
        g.fillStyle = lightenHex(s.color, 0.3);
        // つばさ x2
        for (const side of [-1, 1]) {
          g.save();
          g.rotate(side * (0.5 + w * 0.7));
          g.beginPath();
          g.ellipse(-sz * 0.3, side * sz * 0.9, sz * 1.15, sz * 0.5, side * 0.4, 0, TAU);
          g.fill();
          g.restore();
        }
        // からだ
        g.fillStyle = lightenHex(s.color, 0.5);
        g.beginPath();
        g.ellipse(0, 0, sz * 1.05, sz * 0.7, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#223';
        g.beginPath();
        g.arc(sz * 0.55, -sz * 0.15, sz * 0.14, 0, TAU);
        g.fill();
        break;
      }
      case 'butterfly': {
        g.rotate(ang + Math.PI / 2);
        const fl = 0.35 + 0.65 * Math.abs(Math.sin(s.phase * 1.4));
        g.fillStyle = lightenHex(s.color, 0.2);
        for (const side of [-1, 1]) {
          g.beginPath();
          g.ellipse(side * sz * 0.95 * fl, -sz * 0.45, sz * 0.95 * fl, sz * 0.62, side * 0.5, 0, TAU);
          g.fill();
          g.beginPath();
          g.ellipse(side * sz * 0.75 * fl, sz * 0.5, sz * 0.7 * fl, sz * 0.48, side * -0.4, 0, TAU);
          g.fill();
        }
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(0, 0, sz * 0.22, sz * 0.85, 0, 0, TAU);
        g.fill();
        break;
      }
      case 'jelly': {
        g.rotate(ang + Math.PI / 2);
        // かさ
        g.fillStyle = rgba(s.color, 0.85);
        g.beginPath();
        g.arc(0, 0, sz * 1.15, Math.PI, 0);
        const squish = 1 + Math.sin(s.phase) * 0.18;
        g.quadraticCurveTo(sz * 1.15, sz * 0.5 * squish, 0, sz * 0.42 * squish);
        g.quadraticCurveTo(-sz * 1.15, sz * 0.5 * squish, -sz * 1.15, 0);
        g.fill();
        // あし
        g.strokeStyle = rgba(s.color, 0.6);
        g.lineWidth = 1.2;
        for (let k = -1; k <= 1; k++) {
          g.beginPath();
          g.moveTo(k * sz * 0.5, sz * 0.4);
          g.quadraticCurveTo(
            k * sz * 0.5 + Math.sin(s.phase + k) * sz * 0.6, sz * 1.2,
            k * sz * 0.5 + Math.sin(s.phase * 1.3 + k) * sz * 0.8, sz * 2.0
          );
          g.stroke();
        }
        // め
        g.fillStyle = '#ffffff';
        for (const side of [-1, 1]) {
          g.beginPath();
          g.arc(side * sz * 0.35, -sz * 0.2, sz * 0.18, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'star': {
        g.rotate(t * 1.2 + s.phase);
        const tw = 0.8 + 0.2 * Math.sin(s.phase * 2);
        g.fillStyle = lightenHex(s.color, 0.4);
        Particles.drawStarPath(g, sz * 1.35 * tw);
        g.fill();
        break;
      }
      case 'firefly': {
        const pulse = 0.5 + 0.5 * Math.sin(s.phase);
        g.fillStyle = 'rgba(255,255,255,' + (0.55 + pulse * 0.45) + ')';
        g.beginPath();
        g.arc(0, 0, sz * 0.55, 0, TAU);
        g.fill();
        break;
      }
      default: { // spirit — ひかりの子
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.beginPath();
        g.arc(0, 0, sz * 0.62, 0, TAU);
        g.fill();
        g.fillStyle = rgba(s.color, 0.55);
        g.beginPath();
        g.arc(0, 0, sz * 0.95, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }

  return { update, draw, drawForm };
})();
