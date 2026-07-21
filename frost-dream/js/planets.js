'use strict';
/*
 * おうちの惑星 — 顔があって、まばたきして、みちるほど笑顔になる。
 * 同じ色のひかりのこどもを吸い込むと育ち、満タンで「満開」になる。
 */

class Planet {
  constructor(nx, ny, colorKey, color, capacity, noteIdx) {
    this.nx = nx;               // 0..1 の正規化座標（回転・リサイズに強い）
    this.ny = ny;
    this.colorKey = colorKey;
    this.color = color;
    this.capacity = capacity;
    this.noteIdx = noteIdx;
    this.count = 0;
    this.done = false;
    this.x = 0;
    this.y = 0;
    this.r = 40;
    this.pulse = 0;
    this.bloomT = 0;
    this.blinkT = rand(1.5, 4);
    this.blink = 0;
    this.ph = rand(TAU);
    this.sparkT = 0;
    this.onBloom = null;        // main が設定するコールバック
  }

  layout(W, H) {
    this.x = this.nx * W;
    this.y = this.ny * H;
    this.r = clamp(Math.min(W, H) * 0.082, 30, 62);
  }

  receive(spirit) {
    if (this.done) return;
    this.count++;
    this.pulse = 1;
    const step = Math.round(this.count / this.capacity * 7);
    AudioSys.absorb(step);
    Particles.burst(this.x, this.y, this.color, 8, 130, 3.5);
    Particles.ring(this.x, this.y, '#ffffff', this.r * 0.5);
    if (this.count >= this.capacity && !this.done) {
      this.done = true;
      this.bloomT = 0;
      AudioSys.bloom(this.noteIdx);
      Particles.firework(this.x, this.y, this.color);
      Particles.starPop(this.x, this.y - this.r);
      if (this.onBloom) this.onBloom(this);
    }
  }

  poke() {
    this.pulse = 1;
    AudioSys.planetVoice(this.noteIdx);
    Particles.burst(this.x, this.y, this.color, 10, 160, 4);
    if (this.done) {
      Particles.firework(this.x, this.y - this.r * 1.5, this.color);
      Particles.emoji(this.x, this.y - this.r, pick(['💖', '⭐', '🌟']));
    }
  }

  update(dt, t) {
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    if (this.done) this.bloomT += dt;
    // まばたき
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.18;
      this.blinkT = rand(1.8, 4.5);
    }
    if (this.blink > 0) this.blink -= dt;
    // 満開の惑星はきらきらをまき散らす
    if (this.done) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = rand(0.25, 0.6);
        const a = rand(TAU);
        Particles.spawn({
          x: this.x + Math.cos(a) * this.r * 1.3,
          y: this.y + Math.sin(a) * this.r * 1.3,
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20,
          life: 0.8, color: this.color, size: rand(2, 4), type: 'spark', drag: 0.95
        });
      }
    }
  }

  draw(g, t) {
    const r = this.r * (1 + this.pulse * 0.14 + Math.sin(t * 1.4 + this.ph) * 0.025);
    const prog = this.count / this.capacity;

    // ハロー（光の輪）
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gs = r * (4.4 + this.pulse * 1.5);
    g.globalAlpha = 0.5 + this.pulse * 0.4 + (this.done ? 0.2 : 0);
    g.drawImage(Glow.get(this.color), this.x - gs / 2, this.y - gs / 2, gs, gs);
    g.restore();

    // 満開の花びら
    if (this.done) {
      const petals = 8;
      const bl = Math.min(1, this.bloomT / 0.8);
      g.save();
      g.translate(this.x, this.y);
      g.rotate(this.bloomT * 0.5);
      g.fillStyle = rgba(this.color, 0.55 * bl);
      for (let i = 0; i < petals; i++) {
        g.save();
        g.rotate(i * TAU / petals);
        g.beginPath();
        g.ellipse(r * (1.05 + 0.35 * bl) , 0, r * 0.5 * bl, r * 0.26 * bl, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      g.restore();
    }

    // 本体
    const grad = g.createRadialGradient(
      this.x - r * 0.35, this.y - r * 0.4, r * 0.1,
      this.x, this.y, r
    );
    grad.addColorStop(0, lightenHex(this.color, 0.55));
    grad.addColorStop(0.6, this.color);
    grad.addColorStop(1, darkenHex(this.color, 0.35));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(this.x, this.y, r, 0, TAU);
    g.fill();

    // もようのしましま
    g.save();
    g.beginPath();
    g.arc(this.x, this.y, r, 0, TAU);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = r * 0.16;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.arc(this.x, this.y + r * i * 0.75 + Math.sin(t * 0.5 + this.ph + i) * r * 0.1,
            r * 1.15, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
    g.restore();

    // 進みぐあいのリング
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(this.x, this.y, r + 11, 0, TAU);
    g.stroke();
    if (prog > 0) {
      g.strokeStyle = 'rgba(255,255,255,' + (0.75 + this.pulse * 0.25) + ')';
      g.lineWidth = 5 + this.pulse * 2;
      g.beginPath();
      g.arc(this.x, this.y, r + 11, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
      g.stroke();
    }
    g.restore();

    // かお
    const ex = r * 0.32, ey = -r * 0.12, er = r * 0.1;
    g.fillStyle = 'rgba(40,32,52,0.85)';
    if (this.done || this.blink > 0) {
      // にっこり閉じた目（＾＾）
      g.strokeStyle = 'rgba(40,32,52,0.85)';
      g.lineWidth = Math.max(2, r * 0.06);
      g.lineCap = 'round';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(this.x + side * ex, this.y + ey + er * 0.5, er * 1.1, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
    } else {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(this.x + side * ex, this.y + ey, er, 0, TAU);
        g.fill();
      }
      // ひとみのハイライト
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(this.x + side * ex + er * 0.3, this.y + ey - er * 0.3, er * 0.35, 0, TAU);
        g.fill();
      }
    }

    // くち（進むほど大きな笑顔に）
    g.strokeStyle = 'rgba(40,32,52,0.85)';
    g.lineWidth = Math.max(2, r * 0.06);
    g.lineCap = 'round';
    const smile = 0.25 + prog * 0.75;
    g.beginPath();
    g.arc(this.x, this.y + r * 0.12, r * 0.42 * smile + r * 0.08,
          Math.PI * (0.5 - 0.35 * smile), Math.PI * (0.5 + 0.35 * smile));
    g.stroke();

    // ほっぺ
    if (prog > 0.3 || this.pulse > 0) {
      g.fillStyle = 'rgba(255,120,150,' + (0.25 + this.pulse * 0.2) + ')';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(this.x + side * r * 0.55, this.y + r * 0.18, r * 0.14, 0, TAU);
        g.fill();
      }
    }
  }
}
