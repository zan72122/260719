'use strict';
/* ================= 実績（35種） & セーブデータ ================= */

const Save = (() => {
  const KEY = 'awa-bubbles.save.v1';
  let data = null;

  function load() {
    try {
      data = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) { data = {}; }
    data.levels = data.levels || {};        // {idx: {stars, bestPumps}}
    data.ach = data.ach || {};              // {id: true}
    data.stats = Object.assign({
      pops: 0, maxChain: 0, maxGroup: 0,
      mixO: 0, mixG: 0, mixP: 0, mudMade: 0, mudCleaned: 0,
      merges: 0, wildsGot: 0, wildsPopped: 0, rescued: 0,
      arcadeBest: 0, playSec: 0, zenSec: 0, parClears: 0, noWasteClears: 0,
    }, data.stats || {});
    data.settings = Object.assign({ music: true, sfx: true, haptics: true, quality: 2 }, data.settings || {});
    return data;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function get() { return data || load(); }

  return { load, save, get };
})();

const Achievements = (() => {
  const LIST = [
    { id: 'pop1',      name: 'はじけた！',            desc: 'はじめて泡を割った',            c: s => s.pops >= 1 },
    { id: 'pop100',    name: 'ぷちぷちビギナー',      desc: '泡を100こ割った',               c: s => s.pops >= 100 },
    { id: 'pop500',    name: 'ぷちぷちのたつじん',    desc: '泡を500こ割った',               c: s => s.pops >= 500 },
    { id: 'pop2000',   name: 'ぷちぷちのかみさま',    desc: '泡を2000こ割った',              c: s => s.pops >= 2000 },
    { id: 'chain2',    name: 'はじめてのチェイン',    desc: '2チェインをきめた',             c: s => s.maxChain >= 2 },
    { id: 'chain3',    name: 'チェインずき',          desc: '3チェインをきめた',             c: s => s.maxChain >= 3 },
    { id: 'chain5',    name: 'チェインマスター',      desc: '5チェインをきめた',             c: s => s.maxChain >= 5 },
    { id: 'chain8',    name: 'でんせつのれんさ',      desc: '8チェインをきめた',             c: s => s.maxChain >= 8 },
    { id: 'group6',    name: 'まとめてぽん',          desc: '6こ同時に割った',               c: s => s.maxGroup >= 6 },
    { id: 'group10',   name: 'だいばくはつ',          desc: '10こ同時に割った',              c: s => s.maxGroup >= 10 },
    { id: 'group15',   name: 'ちょうしんせい',        desc: '15こ同時に割った',              c: s => s.maxGroup >= 15 },
    { id: 'mix1',      name: 'いろのけんきゅうか',    desc: 'はじめて色をまぜた',            c: s => s.mixO + s.mixG + s.mixP >= 1 },
    { id: 'mixAll',    name: 'にじのアーティスト',    desc: 'オレンジ・みどり・むらさきをぜんぶ作った', c: s => s.mixO >= 1 && s.mixG >= 1 && s.mixP >= 1 },
    { id: 'mix50',     name: 'まぜまぜはかせ',        desc: '50回色をまぜた',                c: s => s.mixO + s.mixG + s.mixP >= 50 },
    { id: 'mud1',      name: 'あちゃー',              desc: 'にごり泡を作ってしまった',      c: s => s.mudMade >= 1 },
    { id: 'mudClean5', name: 'おそうじやさん',        desc: 'にごり泡を5こきれいにした',     c: s => s.mudCleaned >= 5 },
    { id: 'merge1',    name: 'かべやぶり',            desc: 'はじめて泡のかべをやぶった',    c: s => s.merges >= 1 },
    { id: 'merge50',   name: 'がったいのたつじん',    desc: '50回泡を合体させた',            c: s => s.merges >= 50 },
    { id: 'wild1',     name: 'にじいろのたから',      desc: 'ワイルド泡を手に入れた',        c: s => s.wildsGot >= 1 },
    { id: 'wildPop5',  name: 'ワイルドつかい',        desc: 'ワイルド泡を5こ使った',         c: s => s.wildsPopped >= 5 },
    { id: 'rescue1',   name: 'はじめてのきゅうしゅつ', desc: 'いきものを1ぴき助けた',        c: s => s.rescued >= 1 },
    { id: 'rescue10',  name: 'うみのヒーロー',        desc: 'いきものを10ぴき助けた',        c: s => s.rescued >= 10 },
    { id: 'rescue50',  name: 'うみのしゅごしん',      desc: 'いきものを50ぴき助けた',        c: s => s.rescued >= 50 },
    { id: 'w1',        name: 'いずみのたんけんか',    desc: 'ワールド1をクリア',             c: (s, d) => worldClear(d, 0) },
    { id: 'w2',        name: 'うみのたんけんか',      desc: 'ワールド2をクリア',             c: (s, d) => worldClear(d, 1) },
    { id: 'w3',        name: 'もりのたんけんか',      desc: 'ワールド3をクリア',             c: (s, d) => worldClear(d, 2) },
    { id: 'w4',        name: 'ふかみのせいふくしゃ',  desc: 'ワールド4をクリア',             c: (s, d) => worldClear(d, 3) },
    { id: 'star30',    name: 'ほしあつめ',            desc: 'ほしを30こあつめた',            c: (s, d) => totalStars(d) >= 30 },
    { id: 'star80',    name: 'ほしのコレクター',      desc: 'ほしを80こあつめた',            c: (s, d) => totalStars(d) >= 80 },
    { id: 'star120',   name: 'パーフェクトスター',    desc: '全レベルで3つぼし！',           c: (s, d) => totalStars(d) >= 120 },
    { id: 'par1',      name: 'スマートプレイ',        desc: 'パー以内でクリアした',          c: s => s.parClears >= 1 },
    { id: 'noWaste',   name: 'せつやくじょうず',      desc: '空気を半分いじょう残してクリア', c: s => s.noWasteClears >= 1 },
    { id: 'arc3k',     name: 'アーケードルーキー',    desc: 'アーケードで3000点',            c: s => s.arcadeBest >= 3000 },
    { id: 'arc10k',    name: 'アーケードスター',      desc: 'アーケードで10000点',           c: s => s.arcadeBest >= 10000 },
    { id: 'zen10',     name: 'ぶくぶくめいそう',      desc: 'むげんモードで10分すごした',    c: s => s.zenSec >= 600 },
  ];

  function worldClear(d, w) {
    const [a, b] = Levels.WORLDS[w].range;
    for (let i = a; i <= b; i++) if (!d.levels[i] || !d.levels[i].stars) return false;
    return true;
  }
  function totalStars(d) {
    let t = 0;
    for (const k in d.levels) t += d.levels[k].stars || 0;
    return t;
  }

  let onUnlock = null;
  function setUnlockHandler(fn) { onUnlock = fn; }

  /* 統計が変わるたびに呼ぶ。新規解除があれば通知 */
  function check() {
    const d = Save.get();
    for (const a of LIST) {
      if (d.ach[a.id]) continue;
      let ok = false;
      try { ok = a.c(d.stats, d); } catch (e) {}
      if (ok) {
        d.ach[a.id] = true;
        Save.save();
        if (onUnlock) onUnlock(a);
      }
    }
  }

  function unlockedCount() {
    const d = Save.get();
    return LIST.filter(a => d.ach[a.id]).length;
  }

  return { LIST, check, setUnlockHandler, unlockedCount, totalStars };
})();
