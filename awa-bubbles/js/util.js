'use strict';
/* ================= ユーティリティ & 色システム ================= */
const TAU = Math.PI * 2;

const Util = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(this.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  // 乱数（シード付き mulberry32）
  rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  easeIn(t) { return t * t * t; },
  easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
};

/* 色システム：三原色(R/Y/B)の混合比 comp から表示色クラスを分類する。
   R=あか Y=きいろ B=あお / O=オレンジ G=みどり P=むらさき / X=にごり(どろ) / W=ワイルド */
const Colors = {
  KEYS: ['R', 'Y', 'B', 'O', 'G', 'P'],
  defs: {
    R: { name: 'あか',     main: '#ff5d70', deep: '#d92b47', hi: '#ffb8c2', glow: '#ff8598' },
    Y: { name: 'きいろ',   main: '#ffd23f', deep: '#e0a812', hi: '#fff0ae', glow: '#ffe37a' },
    B: { name: 'あお',     main: '#3fb6ff', deep: '#1a7fd4', hi: '#b8e6ff', glow: '#7fd0ff' },
    O: { name: 'オレンジ', main: '#ff9440', deep: '#e06a12', hi: '#ffd4a8', glow: '#ffb374' },
    G: { name: 'みどり',   main: '#4ede7f', deep: '#1fae52', hi: '#baf5cf', glow: '#83eba7' },
    P: { name: 'むらさき', main: '#a86bf5', deep: '#7d3fd4', hi: '#dcc2ff', glow: '#c294ff' },
    X: { name: 'にごり',   main: '#8d7a63', deep: '#665744', hi: '#c2b39c', glow: '#a5937a' },
    W: { name: 'ワイルド', main: '#ffffff', deep: '#9adcff', hi: '#ffffff', glow: '#c8f4ff' },
  },
  compOf(key) {
    switch (key) {
      case 'R': return { R: 1, Y: 0, B: 0 };
      case 'Y': return { R: 0, Y: 1, B: 0 };
      case 'B': return { R: 0, Y: 0, B: 1 };
      case 'O': return { R: .5, Y: .5, B: 0 };
      case 'G': return { R: 0, Y: .5, B: .5 };
      case 'P': return { R: .5, Y: 0, B: .5 };
      default:  return { R: 1 / 3, Y: 1 / 3, B: 1 / 3 };
    }
  },
  normalize(comp) {
    const s = comp.R + comp.Y + comp.B;
    if (s <= 0) return { R: 1 / 3, Y: 1 / 3, B: 1 / 3 };
    return { R: comp.R / s, Y: comp.Y / s, B: comp.B / s };
  },
  // comp（正規化済み）→ 色クラス
  classify(comp) {
    const e = [['R', comp.R], ['Y', comp.Y], ['B', comp.B]].sort((a, b) => b[1] - a[1]);
    if (e[0][1] >= 0.72) return e[0][0];
    if (e[2][1] <= 0.18) {
      const pair = e[0][0] + e[1][0];
      return { RY: 'O', YR: 'O', YB: 'G', BY: 'G', RB: 'P', BR: 'P' }[pair];
    }
    return 'X';
  },
  // 体積つき混合：戻り値は正規化済み comp
  mix(compA, volA, compB, volB) {
    const t = volA + volB;
    return this.normalize({
      R: compA.R * volA + compB.R * volB,
      Y: compA.Y * volA + compB.Y * volB,
      B: compA.B * volA + compB.B * volB,
    });
  },
};
