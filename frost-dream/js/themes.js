'use strict';
/*
 * ゆめのテーマ定義。
 * species = 群れの「種」。それぞれ色と性格を持つ:
 *   follow  … 描いた光の川に流れる
 *   leader  … 指定した種のあとを追いかける（ひつじかい遊び）
 *   shy     … 指から逃げる（うしろから押して導く）
 *   vortex  … 自分たちで渦を巻く
 * すべての種に「おうちの惑星」がある。
 */

const PALETTE = {
  pink:   '#ff8fb4', yellow: '#ffd76e', teal: '#5fe3c0', blue: '#7db8ff',
  purple: '#c9a2ff', orange: '#ffab70', green: '#a5e878', coral: '#ff9a8c',
  white:  '#f3f0ff'
};

function SP(key, opts) {
  return Object.assign({ key, color: PALETTE[key], follow: true, leader: -1, shy: false, vortex: false }, opts || {});
}

const THEMES = [
  { name: 'ゆめのはじまり', sky: ['#1c1240', '#5b2a7e', '#c95f9b'], glow: ['#ff9bd0', '#8f6bff', '#ffd76e'],
    species: [SP('pink')] },
  { name: 'うみのゆめ', sky: ['#0b2a4a', '#136a8a', '#57c7b8'], glow: ['#4dd6c2', '#6ea8ff', '#bff7ff'],
    species: [SP('white'), SP('blue', { leader: 0, follow: false })] },
  { name: 'そらのゆめ', sky: ['#2a3f8f', '#6f78d8', '#ffd1a1'], glow: ['#ffd76e', '#ff9bb0', '#aecbff'],
    species: [SP('yellow'), SP('blue', { shy: true, follow: false })] },
  { name: 'はなばたけ', sky: ['#173a2c', '#3f8f5f', '#c8e88f'], glow: ['#a5e878', '#ffd76e', '#ff9bd0'],
    species: [SP('pink'), SP('yellow', { leader: 0, follow: false }), SP('purple', { vortex: true })] },
  { name: 'ふかいうみ', sky: ['#04121f', '#0a3550', '#12688c'], glow: ['#57c7ff', '#c9a2ff', '#4dd6c2'],
    species: [SP('purple'), SP('teal', { vortex: true })] },
  { name: 'よぞらのゆめ', sky: ['#050514', '#141b3c', '#3c2a5e'], glow: ['#8f9bff', '#ffd76e', '#ff9bd0'],
    species: [SP('yellow'), SP('blue', { leader: 0, follow: false }), SP('pink', { shy: true, follow: false })] },
  { name: 'ゆうやけのくに', sky: ['#3b1030', '#7e2a58', '#ff8f70'], glow: ['#ff9a8c', '#ffd76e', '#ff6bb0'],
    species: [SP('orange'), SP('coral', { leader: 0, follow: false })] },
  { name: 'こおりのもり', sky: ['#0e1e38', '#1e4e5f', '#7ec8a8'], glow: ['#7bffd0', '#8f6bff', '#ffffff'],
    species: [SP('green'), SP('purple', { shy: true, follow: false }), SP('teal', { vortex: true })] },
  { name: 'ゆきのよる', sky: ['#101c3c', '#33346e', '#8f5fa8'], glow: ['#c9a2ff', '#57c7ff', '#ffffff'],
    species: [SP('blue'), SP('purple', { leader: 0, follow: false }), SP('pink', { shy: true, follow: false }), SP('yellow', { vortex: true })] },
  { name: 'あさやけのそら', sky: ['#26123e', '#89285f', '#ffb070'], glow: ['#ffd76e', '#ff9bd0', '#ffab70'],
    species: [SP('pink'), SP('orange', { vortex: true }), SP('yellow', { leader: 0, follow: false })] },
  { name: 'さんごのうみ', sky: ['#02202a', '#045c6e', '#4fae9e'], glow: ['#4dd6c2', '#ffd76e', '#7db8ff'],
    species: [SP('teal'), SP('yellow', { leader: 0, follow: false }), SP('blue', { shy: true, follow: false }), SP('green', { vortex: true })] },
  { name: 'にじのむこう', sky: ['#0a0a24', '#2a1a5e', '#7e3b9e'], glow: ['#ffffff', '#c9a2ff', '#ff9bd0'],
    species: [SP('pink'), SP('teal', { leader: 0, follow: false }), SP('yellow', { vortex: true }), SP('purple', { shy: true, follow: false })] }
];

/* 各テーマに float 色を事前計算 */
for (const th of THEMES) {
  th.skyF = th.sky.map(h => hexToRgb(h).map(v => v / 255));
  th.glowF = th.glow.map(h => hexToRgb(h).map(v => v / 255));
  for (const sp of th.species) {
    sp.colorF = hexToRgb(sp.color).map(v => v / 255);
  }
}

function themeAt(n) { return THEMES[((n % THEMES.length) + THEMES.length) % THEMES.length]; }
