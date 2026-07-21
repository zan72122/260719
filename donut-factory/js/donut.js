'use strict';
/* ============================================================
 * donut.js — ドーナツのエンティティとお絵かき
 *  形: ring / star / heart / flower
 *  デコ: フロスティング色・グレーズ・スプリンクル・クリーム・トッパー
 * ============================================================ */

const DONUT_R = 34;           // ワールド座標での半径

// ---------- 形状パス（単位半径 R=1 で Path2D をキャッシュ） ----------
const DonutShapes = (() => {
  const cache = {};

  function polarRadius(shape, a) {
    switch (shape) {
      case 'flower': return 0.82 + 0.18 * Math.cos(6 * a);
      case 'star':   return 0.78 + 0.22 * Math.cos(5 * (a + Math.PI / 2));
      default:       return 1;
    }
  }

  function addPolarPath(path, shape, scale, wave) {
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      let r = polarRadius(shape, a) * scale;
      if (wave) r += wave * Math.sin(a * 10);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
  }

  function addHeartPath(path, s, yOff = 0) {
    path.moveTo(0, -0.30 * s + yOff);
    path.bezierCurveTo(-0.35 * s, -0.78 * s + yOff, -1.02 * s, -0.55 * s + yOff, -0.95 * s, -0.05 * s + yOff);
    path.bezierCurveTo(-0.88 * s, 0.42 * s + yOff, -0.42 * s, 0.62 * s + yOff, 0, 0.92 * s + yOff);
    path.bezierCurveTo(0.42 * s, 0.62 * s + yOff, 0.88 * s, 0.42 * s + yOff, 0.95 * s, -0.05 * s + yOff);
    path.bezierCurveTo(1.02 * s, -0.55 * s + yOff, 0.35 * s, -0.78 * s + yOff, 0, -0.30 * s + yOff);
    path.closePath();
  }

  function addHole(path, r, yOff = 0) {
    path.moveTo(r, yOff);
    path.arc(0, yOff, r, 0, TAU);
    path.closePath();
  }

  function build(shape) {
    const holeR = shape === 'ring' ? 0.40 : 0.22;
    const holeY = shape === 'heart' ? 0.12 : 0;
    const dough = new Path2D();
    const frost = new Path2D();
    const silhouette = new Path2D();

    if (shape === 'heart') {
      addHeartPath(dough, 1);
      addHeartPath(silhouette, 1);
      addHeartPath(frost, 0.86, 0.02);
    } else {
      addPolarPath(dough, shape, 1, 0);
      addPolarPath(silhouette, shape, 1, 0);
      addPolarPath(frost, shape, 0.88, 0.035);
    }
    addHole(dough, holeR, holeY);
    addHole(frost, holeR + 0.05, holeY);
    return { dough, frost, silhouette, holeR, holeY };
  }

  function get(shape) {
    if (!cache[shape]) cache[shape] = build(shape);
    return cache[shape];
  }

  return { get, polarRadius };
})();

// スプリンクル・シード配置用のオフスクリーン ctx
const _hitCanvas = document.createElement('canvas');
_hitCanvas.width = 8; _hitCanvas.height = 8;
const _hitCtx = _hitCanvas.getContext('2d');

let _donutIdCounter = 1;

class Donut {
  constructor(tx, ty, exitDir) {
    this.id = _donutIdCounter++;
    this.seed = randInt(1, 1e9);
    // グリッド上の位置
    this.tx = tx; this.ty = ty;
    this.t = 0.5;
    this.entryDir = exitDir;
    this.exitDir = exitDir;
    this.centerFired = true;
    this.state = 'belt';        // belt | jump | fall | carried | collect | teleOut | teleIn
    this.stopped = false;
    // ワールド座標（render 時に更新）
    this.x = (tx + 0.5) * CELL;
    this.y = (ty + 0.5) * CELL;
    this.z = 0;                 // 浮き（ジャンプ・持ち上げ）
    // 見た目
    this.sx = 0.2; this.sy = 0.2;   // スケール（ぽんっと出現）
    this.targetS = 1;
    this.wobble = rand(0, TAU);
    this.spin = 0;
    this.stateTime = 0;
    this.alpha = 1;
    // デコレーション
    this.decor = { shape: 'ring', frost: null, glaze: false, sprinkles: null, cream: false, topper: null };
    this.sprinklePts = null;
    // 各種ステート用データ
    this.aux = {};
  }

  // ---------- デコ操作 ----------
  setFrost(color)  { this.decor.frost = color; this._regenSprinkles(); }
  setGlaze(v)      { this.decor.glaze = v; }
  setCream(v)      { this.decor.cream = v; }
  setTopper(t)     { this.decor.topper = t; }
  setShape(shape)  { this.decor.shape = shape; this._regenSprinkles(); }
  setSprinkles(style) { this.decor.sprinkles = style; this._regenSprinkles(); }

  randomize() {
    this.decor.frost = pick(FROST_CYCLE);
    this.decor.sprinkles = Math.random() < 0.6 ? pick(SPRINKLE_CYCLE) : this.decor.sprinkles;
    if (Math.random() < 0.3) this.decor.glaze = true;
    if (Math.random() < 0.25) this.decor.cream = true;
    if (Math.random() < 0.3) this.decor.topper = pick(TOPPER_CYCLE);
    if (Math.random() < 0.18) this.decor.shape = pick(SHAPE_CYCLE);
    this._regenSprinkles();
  }

  copyDecorFrom(other) {
    this.decor = JSON.parse(JSON.stringify(other.decor));
    this._regenSprinkles();
  }

  _regenSprinkles() {
    if (!this.decor.sprinkles) { this.sprinklePts = null; return; }
    const shp = DonutShapes.get(this.decor.shape);
    const rng = mulberry32(this.seed);
    const pts = [];
    let guard = 0;
    while (pts.length < 14 && guard++ < 200) {
      const x = (rng() * 2 - 1) * 0.95;
      const y = (rng() * 2 - 1) * 0.95;
      const dHole = Math.hypot(x, y - shp.holeY);
      if (dHole < shp.holeR + 0.14) continue;
      if (!_hitCtx.isPointInPath(shp.frost, x, y, 'evenodd')) continue;
      pts.push({ x, y, a: rng() * TAU, c: Math.floor(rng() * 6) });
    }
    this.sprinklePts = pts;
  }

  // ---------- 描画 ----------
  draw(ctx, time) {
    const squishT = Math.sin(time * 5 + this.wobble) * 0.02;
    let sx = this.sx * (1 + squishT);
    let sy = this.sy * (1 - squishT);
    if (this.stopped) {
      const j = Math.sin(time * 16 + this.wobble) * 0.04;
      sx *= 1 + j; sy *= 1 - j;
    }

    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.globalAlpha = this.alpha;

    // 影（浮いているほど小さく・薄く）
    const shadowK = clamp(1 - this.z / 220, 0.25, 1);
    ctx.save();
    ctx.translate(0, this.z);
    ctx.scale(sx, sy);
    ctx.fillStyle = `rgba(150, 90, 60, ${0.18 * shadowK * this.alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, DONUT_R * 0.18, DONUT_R * 1.02 * shadowK, DONUT_R * 0.82 * shadowK, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.rotate(this.spin + Math.sin(time * 2.2 + this.wobble) * 0.05);
    ctx.scale(sx * DONUT_R, sy * DONUT_R);

    const shp = DonutShapes.get(this.decor.shape);
    const lw = 3 / DONUT_R;

    // 生地
    ctx.fillStyle = '#f4bd76';
    ctx.fill(shp.dough, 'evenodd');
    ctx.strokeStyle = '#c98d4b';
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.stroke(shp.silhouette);
    // 穴のふち
    ctx.beginPath();
    ctx.arc(0, shp.holeY, shp.holeR, 0, TAU);
    ctx.stroke();

    // フロスティング
    if (this.decor.frost) {
      const col = FROST_COLORS[this.decor.frost] || FROST_COLORS.pink;
      ctx.fillStyle = col.fill;
      ctx.fill(shp.frost, 'evenodd');
      ctx.strokeStyle = col.edge;
      ctx.lineWidth = lw * 0.8;
      ctx.stroke(shp.frost);
    }

    // グレーズ（つやつや）
    if (this.decor.glaze) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill(shp.frost, 'evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = lw * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, shp.holeY, (shp.holeR + 0.82) / 2, -2.4, -1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, shp.holeY, (shp.holeR + 0.82) / 2, -1.15, -0.85);
      ctx.stroke();
    }

    // スプリンクル
    if (this.sprinklePts) {
      const style = SPRINKLE_STYLES[this.decor.sprinkles] || SPRINKLE_STYLES.rainbow;
      for (const p of this.sprinklePts) {
        const c = style.colors[p.c % style.colors.length];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = c;
        if (style.star) {
          ctx.beginPath();
          for (let j = 0; j < 10; j++) {
            const a = j * Math.PI / 5;
            const r = (j % 2 === 0 ? 0.085 : 0.038);
            if (j === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
        } else if (style.heart) {
          const h = 0.085;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.4);
          ctx.bezierCurveTo(-h, -h * 0.4, -h * 0.4, -h, 0, -h * 0.3);
          ctx.bezierCurveTo(h * 0.4, -h, h, -h * 0.4, 0, h * 0.4);
          ctx.fill();
        } else {
          roundRectPath(ctx, -0.075, -0.028, 0.15, 0.056, 0.028);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // ホイップクリーム（もこもこリング）
    if (this.decor.cream) {
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = '#eadfc8';
      ctx.lineWidth = lw * 0.7;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.3;
        const rr = 0.52 * DonutShapes.polarRadius(this.decor.shape, a);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr + shp.holeY * 0.5, 0.17, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }

    // トッパー
    if (this.decor.topper) {
      const topY = this.decor.shape === 'heart' ? -0.28 : -0.5;
      ctx.save();
      ctx.translate(0, topY);
      this._drawTopper(ctx, this.decor.topper, lw);
      ctx.restore();
    }

    ctx.restore();
  }

  _drawTopper(ctx, kind, lw) {
    switch (kind) {
      case 'cherry':
        ctx.strokeStyle = '#7c9b46';
        ctx.lineWidth = lw * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -0.05);
        ctx.quadraticCurveTo(0.1, -0.22, 0.03, -0.3);
        ctx.stroke();
        ctx.fillStyle = '#e73f56';
        ctx.beginPath(); ctx.arc(0, 0.03, 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(-0.045, -0.02, 0.04, 0, TAU); ctx.fill();
        break;
      case 'strawberry':
        ctx.fillStyle = '#ee4d68';
        ctx.beginPath();
        ctx.moveTo(-0.14, -0.08);
        ctx.quadraticCurveTo(0, -0.19, 0.14, -0.08);
        ctx.quadraticCurveTo(0.13, 0.12, 0, 0.2);
        ctx.quadraticCurveTo(-0.13, 0.12, -0.14, -0.08);
        ctx.fill();
        ctx.fillStyle = '#7cbf4e';
        ctx.beginPath();
        ctx.ellipse(0, -0.11, 0.11, 0.05, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe1a8';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(-0.08 + (i % 3) * 0.08, -0.01 + Math.floor(i / 3) * 0.09, 0.016, 0, TAU);
          ctx.fill();
        }
        break;
      case 'candy':
        ctx.fillStyle = '#ffd94d';
        ctx.strokeStyle = '#e8b93a';
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = -Math.PI / 2 + j * Math.PI / 5;
          const r = (j % 2 === 0 ? 0.16 : 0.075);
          if (j === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
    }
  }
}
