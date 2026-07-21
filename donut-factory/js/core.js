'use strict';
/* ============================================================
 * core.js — 共通定数・ユーティリティ
 * ============================================================ */

const CELL = 100;              // 論理タイルサイズ（ワールド座標単位）
const TAU = Math.PI * 2;

// 方向: 0=東(→) 1=南(↓) 2=西(←) 3=北(↑)
const DIR_E = 0, DIR_S = 1, DIR_W = 2, DIR_N = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const DIR_FROM_CHAR = { E: 0, S: 1, W: 2, N: 3 };
const DIR_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function oppositeDir(d) { return (d + 2) % 4; }
function rotateCW(d)    { return (d + 1) % 4; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t)  { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

function rand(a, b)   { return a + Math.random() * (b - a); }
function randInt(a, b){ return Math.floor(rand(a, b + 1)); }
function pick(arr)    { return arr[Math.floor(Math.random() * arr.length)]; }

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t)  { return t * t * t; }
function easeOutBack(t)  {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// 決定的な乱数（ドーナツごとのスプリンクル配置などに使用）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// フロスティング色パレット
const FROST_COLORS = {
  pink:   { fill: '#ff9ec7', edge: '#f077aa', name: 'いちご' },
  choco:  { fill: '#8a5a3b', edge: '#6b4227', name: 'チョコ' },
  white:  { fill: '#fff6e8', edge: '#e8d5b8', name: 'バニラ' },
  blue:   { fill: '#9edcff', edge: '#6cbfef', name: 'そら' },
  matcha: { fill: '#a8d878', edge: '#84bc55', name: 'まっちゃ' },
  purple: { fill: '#c9a0f0', edge: '#a97cd8', name: 'ぶどう' },
  lemon:  { fill: '#ffe08a', edge: '#eec25a', name: 'レモン' },
};
const FROST_CYCLE = ['pink', 'choco', 'white', 'blue', 'matcha', 'purple', 'lemon'];

const SPRINKLE_STYLES = {
  rainbow: { colors: ['#ff6f9c', '#ffb84d', '#ffe95c', '#7ce27c', '#5cc8ff', '#c99cff'] },
  choco:   { colors: ['#7a4a2b', '#94613c', '#5c3820'] },
  star:    { colors: ['#ffd94d', '#ffee88'], star: true },
  heart:   { colors: ['#ff7ba9', '#ff9ec7'], heart: true },
};
const SPRINKLE_CYCLE = ['rainbow', 'choco', 'star', 'heart'];

const TOPPER_CYCLE = ['cherry', 'strawberry', 'candy'];
const SHAPE_CYCLE = ['star', 'heart', 'flower', 'ring'];
