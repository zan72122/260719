'use strict';
/* 汎用ヘルパー */
const TAU = Math.PI * 2;

function rand(a, b) {
  if (a === undefined) return Math.random();
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

const _rgbCache = new Map();
function hexToRgb(hex) {
  let c = _rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgbCache.set(hex, c);
  }
  return c;
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function lightenHex(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  return 'rgb(' + Math.round(lerp(r, 255, t)) + ',' + Math.round(lerp(g, 255, t)) + ',' + Math.round(lerp(b, 255, t)) + ')';
}
function darkenHex(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  return 'rgb(' + Math.round(r * (1 - t)) + ',' + Math.round(g * (1 - t)) + ',' + Math.round(b * (1 - t)) + ')';
}
