'use strict';
/* ================= 泡の分子動力学風エンジン =================
   Verlet積分 + 位置ベース拘束(PBD)で、押し合い・くっつき（表面張力）・
   浮力・水の粘性抵抗を再現する。泡は円だが、描画時に接触面で
   パワー図クリップして本物の泡クラスターのように変形する。 */

const Physics = (() => {
  let nextId = 1;

  class Bubble {
    constructor(x, y, r, comp, opts = {}) {
      this.id = nextId++;
      this.x = x; this.y = y;
      this.px = x; this.py = y;           // Verlet 前位置
      this.r = r;
      this.comp = Colors.normalize(comp); // 三原色の混合比
      this.wild = !!opts.wild;
      this.key = this.wild ? 'W' : Colors.classify(this.comp);
      this.critters = opts.critter ? [opts.critter] : [];
      this.age = 0;
      this.phase = Math.random() * TAU;   // ぷるぷる位相
      this.popping = false;               // 破裂予約中
      this.popAt = 0;
      this.popIndex = 0;
      this.flash = 0;                     // 色変化フラッシュ
      this.spawnT = 0;                    // 出現アニメ
      this.contacts = [];                 // {id, d} 隣接（描画・マッチ用）
      this.inflating = 0;                 // 膨らまし中エフェクト
    }
    get vol() { return this.r * this.r; }
    get invMass() { return 1 / (this.r * this.r); }
    reclassify() {
      if (this.wild) { this.key = 'W'; return false; }
      const k = Colors.classify(this.comp);
      if (k !== this.key) { this.key = k; this.flash = 1; return true; }
      return false;
    }
  }

  class World {
    constructor() {
      this.bubbles = [];
      this.pairs = [];        // 接触ペア {a, b, d, nx, ny}
      this.bounds = { x: 0, y: 0, w: 400, h: 600 };
      this.R0 = 36;           // 基準半径（画面サイズで決まる）
      this.time = 0;
      this.buoyancy = 1.0;    // 浮力係数（モードで調整）
      this.currentAmp = 1.0;  // 水流の強さ
      this.obstacles = [];    // {x, y, r} 剛体円（ウニ本体など）
      this._grid = new Map();
    }

    addBubble(x, y, r, compOrKey, opts = {}) {
      const comp = typeof compOrKey === 'string' ? Colors.compOf(compOrKey) : compOrKey;
      const b = new Bubble(x, y, r, comp, opts);
      if (typeof compOrKey === 'string' && compOrKey === 'W') b.wild = true;
      b.key = b.wild ? 'W' : Colors.classify(b.comp);
      this.bubbles.push(b);
      return b;
    }

    removeBubble(b) {
      const i = this.bubbles.indexOf(b);
      if (i >= 0) this.bubbles.splice(i, 1);
    }

    clear() { this.bubbles.length = 0; this.pairs.length = 0; this.obstacles.length = 0; }

    bubbleAt(x, y, slack = 1.05) {
      let best = null, bestD = Infinity;
      for (const b of this.bubbles) {
        if (b.popping) continue;
        const d = Util.dist(x, y, b.x, b.y);
        if (d < b.r * slack && d < bestD) { best = b; bestD = d; }
      }
      return best;
    }

    /* ---- 空間ハッシュ ---- */
    _hashKey(ix, iy) { return ((ix + 1024) << 12) | (iy + 1024); }
    _buildGrid(cell) {
      const g = this._grid; g.clear();
      for (let i = 0; i < this.bubbles.length; i++) {
        const b = this.bubbles[i];
        const ix = Math.floor(b.x / cell), iy = Math.floor(b.y / cell);
        const k = this._hashKey(ix, iy);
        let arr = g.get(k);
        if (!arr) { arr = []; g.set(k, arr); }
        arr.push(i);
      }
      return g;
    }
    _neighborIdx(b, cell, out) {
      out.length = 0;
      const ix = Math.floor(b.x / cell), iy = Math.floor(b.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = this._grid.get(this._hashKey(ix + dx, iy + dy));
        if (arr) for (const i of arr) out.push(i);
      }
      return out;
    }

    /* 配置直後のなじませ：重なりを運動量ゼロで解消する */
    settle(iters = 60) {
      this._relax(iters);
      for (const b of this.bubbles) { b.px = b.x; b.py = b.y; }
      this._buildContacts();
    }

    step(dt) {
      this.time += dt;
      const SUB = 2, h = dt / SUB;
      for (let s = 0; s < SUB; s++) this._substep(h);
      this._buildContacts();
      for (const b of this.bubbles) {
        b.age += dt;
        b.spawnT = Math.min(1, b.spawnT + dt * 3.2);
        b.flash = Math.max(0, b.flash - dt * 2.2);
        b.inflating = Math.max(0, b.inflating - dt * 4);
      }
    }

    _substep(h) {
      const { bubbles, bounds, R0 } = this;
      const t = this.time;
      // 積分：粘性減衰つき Verlet ＋ 浮力・水流
      for (const b of bubbles) {
        const visc = 0.965; // 水の抵抗
        let vx = (b.x - b.px) * visc;
        let vy = (b.y - b.py) * visc;
        // 速度上限（爆発防止）
        const vmax = R0 * 0.26;
        const sp = Math.hypot(vx, vy);
        if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; }
        b.px = b.x; b.py = b.y;
        // 浮力：大きい泡ほどわずかに強く。ゆらぎ水流も加える
        const buoy = -R0 * 1.35 * this.buoyancy * (0.85 + 0.3 * (b.r / R0));
        const cur = this.currentAmp * R0 * 0.22;
        const ax = Math.sin(t * 0.45 + b.y * 0.008 + b.phase) * cur;
        const ay = buoy + Math.cos(t * 0.33 + b.x * 0.006) * cur * 0.4;
        b.x += vx + ax * h * h;
        b.y += vy + ay * h * h;
      }

      // 拘束反復
      this._relax(3);
    }

    /* 拘束のみの反復（速度を与えずに配置をなじませる用途にも使う） */
    _relax(iters) {
      const { bubbles, bounds, R0 } = this;
      const cell = R0 * 4.6;
      this._buildGrid(cell);
      const near = [];
      for (let iter = 0; iter < iters; iter++) {
        for (let i = 0; i < bubbles.length; i++) {
          const a = bubbles[i];
          this._neighborIdx(a, cell, near);
          for (const j of near) {
            if (j <= i) continue;
            const c = bubbles[j];
            let dx = c.x - a.x, dy = c.y - a.y;
            let d = Math.hypot(dx, dy);
            if (d < 0.0001) { dx = 0.01 * (Math.random() - .5); dy = 0.01; d = Math.hypot(dx, dy); }
            const minD = a.r + c.r;
            if (d < minD) {
              // 押し合い（泡のふにふに感：完全剛体でなく柔らかく解消）
              const overlap = (minD - d) * 0.42;
              const wa = a.invMass / (a.invMass + c.invMass);
              const nx = dx / d, ny = dy / d;
              a.x -= nx * overlap * wa; a.y -= ny * overlap * wa;
              c.x += nx * overlap * (1 - wa); c.y += ny * overlap * (1 - wa);
            } else if (d < minD * 1.14) {
              // 表面張力：近くの泡はそっと引き合いクラスターを作る
              const pull = (d - minD) * 0.03;
              const nx = dx / d, ny = dy / d;
              a.x += nx * pull * 0.5; a.y += ny * pull * 0.5;
              c.x -= nx * pull * 0.5; c.y -= ny * pull * 0.5;
            }
          }
        }
        // 壁（やわらかく押し戻す）
        const m = 2;
        for (const b of bubbles) {
          if (b.x - b.r < bounds.x + m) b.x += (bounds.x + m + b.r - b.x) * 0.5;
          if (b.x + b.r > bounds.x + bounds.w - m) b.x -= (b.x + b.r - (bounds.x + bounds.w - m)) * 0.5;
          if (b.y - b.r < bounds.y + m) b.y += (bounds.y + m + b.r - b.y) * 0.5;
          if (b.y + b.r > bounds.y + bounds.h - m) b.y -= (b.y + b.r - (bounds.y + bounds.h - m)) * 0.5;
        }
        // 剛体障害物
        for (const o of this.obstacles) {
          for (const b of bubbles) {
            const dx = b.x - o.x, dy = b.y - o.y;
            const d = Math.hypot(dx, dy), minD = b.r + o.r;
            if (d < minD && d > 0.0001) {
              const push = (minD - d) * 0.8;
              b.x += dx / d * push; b.y += dy / d * push;
            }
          }
        }
      }
    }

    /* 接触リスト（描画の変形とマッチ判定に使う） */
    _buildContacts() {
      this.pairs.length = 0;
      for (const b of this.bubbles) b.contacts.length = 0;
      const cell = this.R0 * 4.6;
      this._buildGrid(cell);
      const near = [];
      const bs = this.bubbles;
      for (let i = 0; i < bs.length; i++) {
        const a = bs[i];
        this._neighborIdx(a, cell, near);
        for (const j of near) {
          if (j <= i) continue;
          const c = bs[j];
          const dx = c.x - a.x, dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < (a.r + c.r) * 1.06 && d > 0.0001) {
            const p = { a, b: c, d, nx: dx / d, ny: dy / d };
            this.pairs.push(p);
            a.contacts.push({ o: c, d });
            c.contacts.push({ o: a, d });
          }
        }
      }
    }

    /* 破裂の衝撃波：周囲の泡を押す */
    shock(x, y, r, power = 1) {
      const R = r * 3.4;
      for (const b of this.bubbles) {
        const dx = b.x - x, dy = b.y - y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 0.001) {
          const f = (1 - d / R) * this.R0 * 0.45 * power;
          b.px -= dx / d * f;
          b.py -= dy / d * f;
        }
      }
    }

    /* 膨らませる：体積を増やす。戻り値は新半径 */
    inflate(b, dVol) {
      b.r = Math.sqrt(b.r * b.r + dVol);
      b.inflating = 1;
      return b.r;
    }

    /* 色付き空気の注入：体積増加＋混色 */
    inject(b, key, dVol) {
      if (b.wild) { this.inflate(b, dVol); return false; }
      const before = b.key;
      b.comp = Colors.mix(b.comp, b.vol, Colors.compOf(key), dVol);
      this.inflate(b, dVol);
      return b.reclassify() ? { from: before, to: b.key } : false;
    }

    /* 壁破壊マージ：a を b に吸収。破裂の勢いで空気の38%が逃げるため
       体積が近づき、混色がきちんと中間色になる */
    merge(a, b) {
      const volA = a.vol * 0.62;
      const vol = volA + b.vol;
      const t = volA / vol;
      b.x = b.x * (1 - t) + a.x * t;
      b.y = b.y * (1 - t) + a.y * t;
      b.px = b.x; b.py = b.y;
      if (a.wild && b.wild) { /* ワイルド同士はワイルドのまま */ }
      else if (a.wild) { /* ワイルドは溶けて相手の色のまま */ }
      else if (b.wild) { b.wild = false; b.comp = { ...a.comp }; }
      else b.comp = Colors.mix(a.comp, volA, b.comp, b.vol);
      b.r = Math.sqrt(vol);
      b.critters.push(...a.critters);
      const changed = b.reclassify();
      b.flash = 1;
      this.removeBubble(a);
      return changed;
    }

    totalArea() {
      let s = 0;
      for (const b of this.bubbles) s += b.r * b.r * Math.PI;
      return s;
    }
  }

  return { World, Bubble };
})();
