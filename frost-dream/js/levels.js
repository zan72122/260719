'use strict';
/*
 * レベル（ゆめの場面）の定義。
 * 12テーマを1周として、周回するごとにひかりのこどもが少しずつ増える。
 */

const PALETTE = {
  pink:   '#ff8fb4',
  yellow: '#ffd76e',
  teal:   '#5fe3c0',
  blue:   '#7db8ff',
  purple: '#c9a2ff',
  orange: '#ffab70',
  green:  '#a5e878',
  coral:  '#ff9a8c'
};

const FORM_NAMES = {
  spirit:    'ひかりのこ',
  fish:      'おさかな',
  bird:      'ことり',
  butterfly: 'ちょうちょ',
  jelly:     'くらげ',
  star:      'おほしさま',
  firefly:   'ほたる'
};

const THEMES = [
  { name: 'ゆめのはじまり', sky: ['#1c1240', '#5b2a7e', '#c95f9b'],
    glow: ['#ff9bd0', '#8f6bff'], colors: ['pink'], form: 'spirit', feature: null, per: 12 },
  { name: 'うみのゆめ', sky: ['#0b2a4a', '#136a8a', '#57c7b8'],
    glow: ['#4dd6c2', '#6ea8ff'], colors: ['teal', 'blue'], form: 'fish', feature: 'bubbles', per: 12 },
  { name: 'そらのゆめ', sky: ['#2a3f8f', '#6f78d8', '#ffd1a1'],
    glow: ['#ffd76e', '#ff9bb0'], colors: ['yellow', 'blue'], form: 'bird', feature: null, per: 13 },
  { name: 'はなばたけ', sky: ['#173a2c', '#3f8f5f', '#c8e88f'],
    glow: ['#a5e878', '#ffd76e'], colors: ['pink', 'yellow', 'purple'], form: 'butterfly', feature: 'petals', per: 10 },
  { name: 'ふかいうみ', sky: ['#04121f', '#0a3550', '#12688c'],
    glow: ['#57c7ff', '#c9a2ff'], colors: ['purple', 'teal'], form: 'jelly', feature: 'bubbles', per: 12 },
  { name: 'よぞらのゆめ', sky: ['#050514', '#141b3c', '#3c2a5e'],
    glow: ['#8f9bff', '#ffd76e'], colors: ['yellow', 'blue', 'pink'], form: 'star', feature: 'shooting', per: 10 },
  { name: 'ゆうやけのくに', sky: ['#3b1030', '#7e2a58', '#ff8f70'],
    glow: ['#ff9a8c', '#ffd76e'], colors: ['orange', 'coral'], form: 'firefly', feature: null, per: 13 },
  { name: 'こおりのもり', sky: ['#0e1e38', '#1e4e5f', '#7ec8a8'],
    glow: ['#7bffd0', '#8f6bff'], colors: ['green', 'purple', 'teal'], form: 'fish', feature: 'snow', per: 10 },
  { name: 'ゆきのよる', sky: ['#101c3c', '#33346e', '#8f5fa8'],
    glow: ['#c9a2ff', '#57c7ff'], colors: ['blue', 'purple', 'pink', 'yellow'], form: 'butterfly', feature: 'snow', per: 8 },
  { name: 'あさやけのそら', sky: ['#26123e', '#89285f', '#ffb070'],
    glow: ['#ffd76e', '#ff9bd0'], colors: ['pink', 'orange', 'yellow'], form: 'bird', feature: 'petals', per: 10 },
  { name: 'さんごのうみ', sky: ['#02202a', '#045c6e', '#4fae9e'],
    glow: ['#4dd6c2', '#ffd76e'], colors: ['teal', 'yellow', 'blue', 'green'], form: 'jelly', feature: 'bubbles', per: 8 },
  { name: 'にじのむこう', sky: ['#0a0a24', '#2a1a5e', '#7e3b9e'],
    glow: ['#ffffff', '#c9a2ff'], colors: ['pink', 'teal', 'yellow', 'purple'], form: 'star', feature: 'shooting', per: 8 }
];

/* レベル番号（1始まり）→ 仕様 */
function levelSpec(n) {
  const theme = THEMES[(n - 1) % THEMES.length];
  const cycle = Math.floor((n - 1) / THEMES.length);
  const per = Math.min(theme.per + cycle * 2, 20);
  return { index: n, theme, per, colors: theme.colors, form: theme.form };
}
