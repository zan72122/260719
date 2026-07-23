'use strict';

/*
 * レベル定義。
 * 位置はぜんぶ相対座標:
 *   x → 画面幅に対する割合 (0..1)
 *   y → 画面高さに対する割合 (0..1)
 *   r → min(幅, 高さ) に対する割合
 * なので縦画面でも横画面でもそのまま成立する。
 */

const PALETTES = [
  { // 0 あさ
    skyTop: '#aee3f5', skyBot: '#eaf7df', ground: '#5b4635', tree: '#3d2f26',
    sunCore: '#ffd94d', sunGlow: '#ffe9a3', cloud: '#8fa3ad',
    petals: ['#ff9ec4', '#ffc7dd'], center: '#ffe066', stars: false,
  },
  { // 1 ゆうやけ
    skyTop: '#f7b267', skyBot: '#f4845f', ground: '#4a2c2a', tree: '#33201d',
    sunCore: '#fff1b8', sunGlow: '#ffd97a', cloud: '#a8766b',
    petals: ['#fff3f0', '#ffd6cc'], center: '#f9c74f', stars: false,
  },
  { // 2 あけぼの
    skyTop: '#f9c5d1', skyBot: '#fdeff2', ground: '#6b4a52', tree: '#4a3038',
    sunCore: '#fff6c9', sunGlow: '#ffe1ec', cloud: '#c39ba8',
    petals: ['#e75480', '#ff8fb1'], center: '#fff1a8', stars: false,
  },
  { // 3 まひる
    skyTop: '#7ec8f2', skyBot: '#d8f1ff', ground: '#4f6b3a', tree: '#37432b',
    sunCore: '#ffdf3d', sunGlow: '#fff2a1', cloud: '#9fb4c4',
    petals: ['#ffffff', '#ffe9f2'], center: '#ffb703', stars: false,
  },
  { // 4 たそがれ
    skyTop: '#6d5b95', skyBot: '#c98ba8', ground: '#3a2c46', tree: '#241a30',
    sunCore: '#ffe8b8', sunGlow: '#e8b0d8', cloud: '#8878a5',
    petals: ['#ffd166', '#ffe8b0'], center: '#ef476f', stars: false,
  },
  { // 5 よる（つきのひかり）
    skyTop: '#17233f', skyBot: '#3a4a6b', ground: '#141b2b', tree: '#0d1420',
    sunCore: '#f5f3ce', sunGlow: '#c9d8ff', cloud: '#4a5878',
    petals: ['#bde0fe', '#e2eafc'], center: '#fdf0d5', stars: true,
  },
  { // 6 しんりょく
    skyTop: '#b5d99c', skyBot: '#eef7dc', ground: '#43593b', tree: '#2e4028',
    sunCore: '#fff3a0', sunGlow: '#f4ffb8', cloud: '#93a893',
    petals: ['#ff7096', '#ffb3c6'], center: '#fff085', stars: false,
  },
  { // 7 ゆうぐれのあか
    skyTop: '#d64550', skyBot: '#f6bd60', ground: '#432c33', tree: '#2c1c22',
    sunCore: '#fff0c2', sunGlow: '#ffcf99', cloud: '#a05f66',
    petals: ['#f8edeb', '#fcd5ce'], center: '#e9c46a', stars: false,
  },
  { // 8 ゆき
    skyTop: '#cfe4f5', skyBot: '#f4f9fc', ground: '#8fa8bd', tree: '#4c5c6b',
    sunCore: '#ffe9a8', sunGlow: '#fff6d8', cloud: '#a9bfd1',
    petals: ['#f28fb8', '#f7c1d9'], center: '#fff1a8', stars: false,
  },
  { // 9 ほしぞら
    skyTop: '#0d1b2a', skyBot: '#41506b', ground: '#101826', tree: '#080f18',
    sunCore: '#ffe066', sunGlow: '#ffd166', cloud: '#3f4f6b',
    petals: ['#ffd166', '#ffecb3'], center: '#ff70a6', stars: true,
  },
];

const LEVELS = [
  { // 1: たいようはまうえ。うえるだけでさく
    sun: { x: 0.50, y: 0.26, r: 0.17 }, goal: 1, clouds: [], pal: 0,
  },
  { // 2: すこしみぎうえ
    sun: { x: 0.72, y: 0.28, r: 0.16 }, goal: 2, clouds: [], pal: 1,
  },
  { // 3: ひだりうえ + くもがひとつ
    sun: { x: 0.28, y: 0.24, r: 0.15 }, goal: 2, pal: 2,
    clouds: [{ x: 0.70, y: 0.42, r: 0.13 }],
  },
  { // 4: まうえだがりょうわきにくも
    sun: { x: 0.50, y: 0.18, r: 0.15 }, goal: 3, pal: 3,
    clouds: [{ x: 0.24, y: 0.46, r: 0.12 }, { x: 0.76, y: 0.46, r: 0.12 }],
  },
  { // 5: たいようがよこにひくい
    sun: { x: 0.80, y: 0.48, r: 0.15 }, goal: 3, pal: 4,
    clouds: [{ x: 0.50, y: 0.24, r: 0.13 }],
  },
  { // 6: よる。つきはひだりのひくいところ
    sun: { x: 0.20, y: 0.42, r: 0.14 }, goal: 3, pal: 5,
    clouds: [{ x: 0.52, y: 0.58, r: 0.11 }, { x: 0.62, y: 0.24, r: 0.12 }],
  },
  { // 7: みぎうえ、くもふたつ
    sun: { x: 0.68, y: 0.22, r: 0.14 }, goal: 4, pal: 6,
    clouds: [{ x: 0.34, y: 0.34, r: 0.12 }, { x: 0.78, y: 0.54, r: 0.11 }],
  },
  { // 8: ひだりうえ、くものすきまをぬう
    sun: { x: 0.28, y: 0.20, r: 0.14 }, goal: 4, pal: 7,
    clouds: [{ x: 0.56, y: 0.38, r: 0.13 }, { x: 0.22, y: 0.52, r: 0.10 }],
  },
  { // 9: たかいそら、りょうわきにくも
    sun: { x: 0.50, y: 0.15, r: 0.13 }, goal: 5, pal: 8,
    clouds: [{ x: 0.28, y: 0.40, r: 0.12 }, { x: 0.72, y: 0.40, r: 0.12 }],
  },
  { // 10: ほしぞらのなか、くもみっつ
    sun: { x: 0.74, y: 0.24, r: 0.14 }, goal: 5, pal: 9,
    clouds: [
      { x: 0.44, y: 0.30, r: 0.11 },
      { x: 0.72, y: 0.54, r: 0.11 },
      { x: 0.24, y: 0.48, r: 0.10 },
    ],
  },
];
