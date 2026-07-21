/* =========================================================
 * letters.js — アルファベット26文字の「物理的な個性」データ
 * supertype の問い:
 *   「p はどう落ちる?」「r はどれくらい重い?」「i の点はどんな音?」
 * に、この表が答える。
 * ========================================================= */

// 虹の順に色を割り当てる (A=赤 → Z=紫)
function rainbowColor(index) {
  const hue = (index / 26) * 330;
  return `hsl(${hue}, 82%, 58%)`;
}

/*
 * shape:
 *   'circle'   … まんまる。転がる (C G O Q)
 *   'tri'      … 三角形 (A)
 *   'vtri'     … 逆三角形。不安定でコロンと倒れる (V)
 *   'T' 'L' 'U' … 長方形の組み合わせ (U はコップ型で物を受け止める!)
 *   'box'      … 文字幅に合わせた四角 (その他)
 *
 * ink: インクの量 = 重さの係数 (I=軽い, W=重い)。衝突音の高さもこれで決まる
 * bounce: 反発係数 (S は超はずむ)
 * special: 'floaty'(ふわふわ落ちる) 'zigzag'(ジグザグ落下) 'dot'(点が分離する)
 */
const LETTERS = {
  A: { shape: 'tri',    ink: 1.0,  bounce: 0.35, word: 'Apple',      emoji: '🍎', phonic: 'ah' },
  B: { shape: 'box',    ink: 1.1,  bounce: 0.75, word: 'Ball',       emoji: '⚽', phonic: 'buh' },
  C: { shape: 'circle', ink: 0.8,  bounce: 0.4,  word: 'Cat',        emoji: '🐱', phonic: 'kuh' },
  D: { shape: 'box',    ink: 1.0,  bounce: 0.45, word: 'Dog',        emoji: '🐶', phonic: 'duh' },
  E: { shape: 'box',    ink: 0.95, bounce: 0.3,  word: 'Egg',        emoji: '🥚', phonic: 'eh' },
  F: { shape: 'box',    ink: 0.7,  bounce: 0.3,  word: 'Feather',    emoji: '🪶', phonic: 'fuh', special: 'floaty' },
  G: { shape: 'circle', ink: 1.0,  bounce: 0.4,  word: 'Grapes',     emoji: '🍇', phonic: 'guh' },
  H: { shape: 'box',    ink: 1.0,  bounce: 0.3,  word: 'Hat',        emoji: '🎩', phonic: 'huh' },
  I: { shape: 'box',    ink: 0.45, bounce: 0.5,  word: 'Ice cream',  emoji: '🍦', phonic: 'ih',  special: 'dot', narrow: true },
  J: { shape: 'box',    ink: 0.6,  bounce: 0.55, word: 'Juice',      emoji: '🧃', phonic: 'juh', special: 'dot', narrow: true },
  K: { shape: 'box',    ink: 1.0,  bounce: 0.4,  word: 'Key',        emoji: '🔑', phonic: 'kuh' },
  L: { shape: 'L',      ink: 0.6,  bounce: 0.3,  word: 'Lion',       emoji: '🦁', phonic: 'luh' },
  M: { shape: 'box',    ink: 1.5,  bounce: 0.3,  word: 'Moon',       emoji: '🌙', phonic: 'mmm' },
  N: { shape: 'box',    ink: 1.15, bounce: 0.3,  word: 'Nose',       emoji: '👃', phonic: 'nnn' },
  O: { shape: 'circle', ink: 0.9,  bounce: 0.45, word: 'Orange',     emoji: '🍊', phonic: 'oh' },
  P: { shape: 'box',    ink: 0.85, bounce: 0.4,  word: 'Pig',        emoji: '🐷', phonic: 'puh' },
  Q: { shape: 'circle', ink: 1.0,  bounce: 0.45, word: 'Queen',      emoji: '👑', phonic: 'kwuh' },
  R: { shape: 'box',    ink: 0.95, bounce: 0.4,  word: 'Rainbow',    emoji: '🌈', phonic: 'ruh' },
  S: { shape: 'box',    ink: 0.85, bounce: 0.95, word: 'Sun',        emoji: '☀️', phonic: 'sss' },
  T: { shape: 'T',      ink: 0.7,  bounce: 0.35, word: 'Train',      emoji: '🚂', phonic: 'tuh' },
  U: { shape: 'U',      ink: 0.8,  bounce: 0.35, word: 'Umbrella',   emoji: '☂️', phonic: 'uh' },
  V: { shape: 'vtri',   ink: 0.8,  bounce: 0.4,  word: 'Violin',     emoji: '🎻', phonic: 'vuh' },
  W: { shape: 'box',    ink: 1.65, bounce: 0.25, word: 'Watermelon', emoji: '🍉', phonic: 'wuh' },
  X: { shape: 'box',    ink: 0.9,  bounce: 0.5,  word: 'Fox',        emoji: '🦊', phonic: 'ks' },
  Y: { shape: 'box',    ink: 0.8,  bounce: 0.45, word: 'Yo-yo',      emoji: '🪀', phonic: 'yuh' },
  Z: { shape: 'box',    ink: 0.85, bounce: 0.4,  word: 'Zebra',      emoji: '🦓', phonic: 'zzz', special: 'zigzag' },
};

const ALPHABET = Object.keys(LETTERS);

ALPHABET.forEach((ch, i) => { LETTERS[ch].color = rainbowColor(i); });

// ことばパズル用の単語 (絵文字は答えのヒント兼ごほうび)
const WORDS = [
  { word: 'CAT',  emoji: '🐱' },
  { word: 'DOG',  emoji: '🐶' },
  { word: 'SUN',  emoji: '☀️' },
  { word: 'BUS',  emoji: '🚌' },
  { word: 'EGG',  emoji: '🥚' },
  { word: 'PIG',  emoji: '🐷' },
  { word: 'COW',  emoji: '🐮' },
  { word: 'BEE',  emoji: '🐝' },
  { word: 'FOX',  emoji: '🦊' },
  { word: 'HAT',  emoji: '🎩' },
  { word: 'CUP',  emoji: '🥤' },
  { word: 'BED',  emoji: '🛏️' },
  { word: 'CAR',  emoji: '🚗' },
  { word: 'ANT',  emoji: '🐜' },
  { word: 'OWL',  emoji: '🦉' },
  { word: 'STAR', emoji: '⭐' },
  { word: 'FISH', emoji: '🐟' },
  { word: 'DUCK', emoji: '🦆' },
  { word: 'FROG', emoji: '🐸' },
  { word: 'LION', emoji: '🦁' },
  { word: 'CAKE', emoji: '🍰' },
  { word: 'MOON', emoji: '🌙' },
  { word: 'BEAR', emoji: '🐻' },
  { word: 'SHIP', emoji: '🚢' },
];

window.GameData = { LETTERS, ALPHABET, WORDS };
