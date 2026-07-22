'use strict';
/* ============================================================
 * donut.js — ドーナツのエンティティ（状態のみ）
 *  3D描画は donut3d.js が decorRev を見て組み立てる。
 *  DonutShapes はスプリンクル配置サンプリングと
 *  3D形状（star/heart/flower）の輪郭定義に使う。
 * ============================================================ */

const DONUT_R = 34;           // ワールド座標での半径

// ---------- 形状パス（単位半径 R=1、スプリンクル配置判定用） ----------
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

  // ハート輪郭のベジェ制御点（3D側でも同じ点列を使う）
  const HEART_BEZIERS = [
    // [cp1x, cp1y, cp2x, cp2y, x, y] — 始点は (0, -0.30)
    [-0.35, -0.78, -1.02, -0.55, -0.95, -0.05],
    [-0.88, 0.42, -0.42, 0.62, 0, 0.92],
    [0.42, 0.62, 0.88, 0.42, 0.95, -0.05],
    [1.02, -0.55, 0.35, -0.78, 0, -0.30],
  ];

  function addHeartPath(path, s, yOff = 0) {
    path.moveTo(0, -0.30 * s + yOff);
    for (const b of HEART_BEZIERS) {
      path.bezierCurveTo(b[0] * s, b[1] * s + yOff, b[2] * s, b[3] * s + yOff, b[4] * s, b[5] * s + yOff);
    }
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
    const frost = new Path2D();
    if (shape === 'heart') addHeartPath(frost, 0.86, 0.02);
    else addPolarPath(frost, shape, 0.88, 0.035);
    addHole(frost, holeR + 0.05, holeY);
    return { frost, holeR, holeY };
  }

  function get(shape) {
    if (!cache[shape]) cache[shape] = build(shape);
    return cache[shape];
  }

  return { get, polarRadius, HEART_BEZIERS };
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
    // ワールド座標（シミュレーションが更新、x/y はボード平面、z は高さ）
    this.x = (tx + 0.5) * CELL;
    this.y = (ty + 0.5) * CELL;
    this.z = 0;
    // 見た目（sx=水平スケール, sy=たてスケール）
    this.sx = 0.2; this.sy = 0.2;
    this.targetS = 1;
    this.wobble = rand(0, TAU);
    this.spin = 0;
    this.stateTime = 0;
    this.alpha = 1;
    // デコレーション
    this.decor = { shape: 'ring', frost: null, glaze: false, sprinkles: null, cream: false, topper: null };
    this.decorRev = 0;
    this.sprinklePts = null;
    this.isVeggie = false;   // やさいスイッチで変身中
    this.hidden = false;     // 大砲のなかなど
    this.aux = {};
  }

  // ---------- デコ操作 ----------
  setFrost(color)  { this.decor.frost = color; this._regenSprinkles(); this.decorRev++; }
  setGlaze(v)      { this.decor.glaze = v; this.decorRev++; }
  setCream(v)      { this.decor.cream = v; this.decorRev++; }
  setTopper(t)     { this.decor.topper = t; this.decorRev++; }
  setShape(shape)  { this.decor.shape = shape; this._regenSprinkles(); this.decorRev++; }
  setSprinkles(style) { this.decor.sprinkles = style; this._regenSprinkles(); this.decorRev++; }

  randomize() {
    this.decor.frost = pick(FROST_CYCLE);
    this.decor.sprinkles = Math.random() < 0.6 ? pick(SPRINKLE_CYCLE) : this.decor.sprinkles;
    if (Math.random() < 0.3) this.decor.glaze = true;
    if (Math.random() < 0.25) this.decor.cream = true;
    if (Math.random() < 0.3) this.decor.topper = pick(TOPPER_CYCLE);
    if (Math.random() < 0.18) this.decor.shape = pick(SHAPE_CYCLE);
    this._regenSprinkles();
    this.decorRev++;
  }

  copyDecorFrom(other) {
    this.decor = JSON.parse(JSON.stringify(other.decor));
    this._regenSprinkles();
    this.decorRev++;
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
}
