'use strict';
/* ================= パズルレベル定義（全40面） =================
   pattern の文字 = 泡の色 (R,Y,B,O,G,P,W,X)。小文字 = 生き物入り。
   スペース/ドット = 空き。座標は正規化(0..1) + R0単位の相対配置。 */

const Levels = (() => {
  function pat(cx, cy, rr, rows) { return { cx, cy, rr, rows }; }

  /* シード付きランダム散布（後半レベルの有機的な配置用） */
  function scatter(seed, n, colors, area = { x0: .15, y0: .12, x1: .85, y1: .6 }, rr = [0.8, 1.15], critters = 0) {
    const rnd = Util.rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        cx: area.x0 + rnd() * (area.x1 - area.x0),
        cy: area.y0 + rnd() * (area.y1 - area.y0),
        rr: rr[0] + rnd() * (rr[1] - rr[0]),
        key: colors[Math.floor(rnd() * colors.length)],
        critter: i < critters,
      });
    }
    return out;
  }

  const WORLDS = [
    { name: 'はじまりのいずみ', color: '#3fb6ff', range: [0, 9] },
    { name: 'いろまざりのうみ', color: '#a86bf5', range: [10, 19] },
    { name: 'とげとげのもり',   color: '#4ede7f', range: [20, 29] },
    { name: 'ふかみのあらし',   color: '#ff9440', range: [30, 39] },
  ];

  const LEVELS = [
    /* ---------- W1: はじまりのいずみ（基本操作） ---------- */
    {
      name: 'はじめての泡',
      patterns: [pat(.5, .3, 1.0, ['RR', 'R'])],
      tanks: { R: 6 },
      goals: [{ type: 'popColor', color: 'R', n: 4 }],
      par: 2,
      tip: 'あいた場所を ながおしすると あたらしい泡がうまれるよ。おなじ色を4こ くっつけよう！',
      hint: '赤の泡たちのすぐ近くの水を長押しして、4こ目の赤い泡を作ろう。',
    },
    {
      name: 'ふたつのなかま',
      patterns: [pat(.3, .3, 0.95, ['YY', 'Y']), pat(.7, .3, 0.95, ['BB', 'B'])],
      tanks: { Y: 5, B: 5 },
      goals: [{ type: 'popColor', color: 'Y', n: 4 }, { type: 'popColor', color: 'B', n: 4 }],
      par: 2,
      tip: 'したのタンクをタップして 吹き込む色をえらぼう',
      hint: '黄色を選んで黄色の群れに1こ、青を選んで青の群れに1こ追加しよう。',
    },
    {
      name: 'ふくらむちから',
      patterns: [pat(.28, .3, 0.9, ['RR']), pat(.72, .3, 0.9, ['RR'])],
      tanks: { R: 8 },
      goals: [{ type: 'popColor', color: 'R', n: 4 }],
      par: 3,
      tip: '泡をながおしすると ふくらんで まわりを押すよ。はなれた泡を つなげてみよう',
      hint: 'あいだに新しい赤泡を作るか、端の泡を膨らませて4こをつなげよう。',
    },
    {
      name: 'いろのまほう',
      patterns: [pat(.5, .28, 0.95, ['PP', 'P']), pat(.5, .52, 1.0, ['R'])],
      tanks: { B: 6, R: 2 },
      goals: [{ type: 'popColor', color: 'P', n: 4 }],
      par: 3,
      tip: 'あかの泡に あおを ふきこむと… むらさきに へんしん！',
      hint: '下の赤い泡に青をたっぷり吹き込むと紫になる。紫4こで ぽん！',
    },
    {
      name: 'かべやぶり',
      patterns: [pat(.5, .26, 0.95, ['GG', 'G']), pat(.42, .52, 1.0, ['Y']), pat(.58, .52, 1.0, ['B'])],
      tanks: { Y: 7, B: 7 },
      goals: [{ type: 'merge', n: 1 }, { type: 'popColor', color: 'G', n: 4 }],
      par: 4,
      tip: '泡を おおきくふくらませつづけると… となりの泡のかべを やぶって がったい！色もまざるよ',
      hint: '黄と青の泡をどちらか膨らませ続けて合体させると緑になるよ。',
    },
    {
      name: 'とじこめられたともだち',
      patterns: [pat(.35, .3, 0.95, ['Bb', 'B']), pat(.68, .45, 0.95, ['Yy', 'Y'])],
      tanks: { B: 5, Y: 5 },
      goals: [{ type: 'rescue', n: 2 }],
      par: 2,
      tip: '泡にとじこめられた いきものは 泡を割ると たすけられるよ！',
      hint: 'それぞれの群れに同じ色を1こ追加して割ってあげよう。',
    },
    {
      name: 'れんさのよかん',
      patterns: [pat(.5, .3, 0.92, ['RRR', 'YYY', ' Y '])],
      tanks: { R: 4, Y: 4 },
      goals: [{ type: 'chain', n: 2 }],
      par: 3,
      tip: 'つづけて割れると チェイン！ ボーナスがもらえるよ',
      hint: '赤を1こたして割ると、泡が動いて黄色もそろうかも。だめなら黄色もたそう。',
    },
    {
      name: 'おおきなはくしゅ',
      patterns: [pat(.5, .32, 0.95, ['BBB', 'BB'])],
      tanks: { B: 4 },
      goals: [{ type: 'big', n: 6 }],
      par: 1,
      tip: 'たくさん同時に割ると 大きなボーナス！',
      hint: '青をもう1こたして、6こいっぺんに割ろう。',
    },
    {
      name: 'にごりのなおしかた',
      patterns: [pat(.5, .5, 1.15, ['X']), pat(.5, .27, 0.92, ['RR', 'R'])],
      tanks: { R: 9 },
      goals: [{ type: 'clean', n: 1 }, { type: 'popColor', color: 'R', n: 4 }],
      par: 5,
      tip: 'まざりすぎて にごった泡は、ひとつの色を たっぷりたすと きれいになるよ',
      hint: 'にごり泡に赤を吹き込みつづけると赤にもどる。そのまま群れとつなげよう。',
    },
    {
      name: 'いずみのそつぎょう',
      patterns: [
        pat(.3, .25, 0.9, ['YY', 'y']),
        pat(.7, .25, 0.9, ['BB', 'b']),
        pat(.5, .52, 0.95, ['PP', 'p']),
      ],
      tanks: { Y: 5, B: 5, R: 4 },
      goals: [{ type: 'rescue', n: 3 }],
      par: 5,
      tip: 'むらさきは あお＋あか でつくれるよ',
      hint: '黄と青は1こずつ追加。紫は青の泡に赤をまぜて作ろう。',
    },

    /* ---------- W2: いろまざりのうみ（混色マスター） ---------- */
    {
      name: 'オレンジのゆうやけ',
      patterns: [pat(.5, .3, 0.95, ['OO', 'O']), pat(.35, .55, 1.0, ['R']), pat(.65, .55, 1.0, ['Y'])],
      tanks: { R: 5, Y: 5 },
      goals: [{ type: 'popColor', color: 'O', n: 4 }],
      par: 4,
      hint: '赤の泡に黄色を（または黄色に赤を）まぜてオレンジを1こ作ろう。',
    },
    {
      name: 'みどりのしずく',
      patterns: [pat(.5, .26, 0.9, ['GGG']), pat(.3, .5, 1.0, ['Y', 'B']), pat(.7, .5, 1.0, ['B'])],
      tanks: { Y: 6, B: 6 },
      goals: [{ type: 'popColor', color: 'G', n: 5 }],
      par: 5,
      hint: '黄に青をまぜて緑に。ぜんぶで5こ割るには合体も使おう。',
    },
    {
      name: 'ふたいろどうじ',
      patterns: [
        pat(.32, .28, 0.88, ['RRR', 'Y']),
        pat(.68, .28, 0.88, ['YY', 'YR']),
      ],
      tanks: { R: 4, Y: 4 },
      goals: [{ type: 'popColor', color: 'R', n: 4 }, { type: 'popColor', color: 'Y', n: 4 }],
      par: 4,
      hint: '左は赤を1こ追加。右は黄色が3こ…赤い泡を黄色にぬりかえる手もある。',
    },
    {
      name: 'むらさきのくもり',
      patterns: [pat(.5, .35, 0.92, ['PBP', 'RPR', ' P '])],
      tanks: { B: 6, R: 6 },
      goals: [{ type: 'popColor', color: 'P', n: 6 }],
      par: 6,
      hint: 'まん中の赤と青を紫にぬりかえると、大きなひとつの群れに！',
    },
    {
      name: 'チェインのたつじん',
      patterns: [
        pat(.5, .24, 0.88, ['RRR']),
        pat(.5, .42, 0.88, ['YYY']),
        pat(.5, .6, 0.88, ['BBB']),
      ],
      tanks: { R: 3, Y: 3, B: 3 },
      goals: [{ type: 'chain', n: 3 }],
      par: 3,
      tip: '3チェインすると ワイルド泡（なんの色にもなれる泡）があらわれる！',
      hint: '下から順に1こずつ足すと、割れた反動で上の群れがくっついて連鎖！',
    },
    {
      name: 'ワイルドをつかまえて',
      patterns: [pat(.5, .3, 0.9, ['W']), pat(.35, .45, 0.9, ['GG', 'G'])],
      tanks: { G: 3, Y: 3, B: 3 },
      goals: [{ type: 'popColor', color: 'G', n: 4 }],
      par: 1,
      tip: 'ワイルド泡は どんな色ともなかまになれるよ',
      hint: '緑の群れを膨らませてワイルドにくっつければ4こそろう！',
    },
    {
      name: 'にじいろこうじょう',
      patterns: [
        pat(.3, .28, 0.9, ['RR']), pat(.7, .28, 0.9, ['YY']),
        pat(.3, .55, 0.9, ['BB']), pat(.7, .55, 0.9, ['RY']),
      ],
      tanks: { R: 6, Y: 6, B: 6 },
      goals: [{ type: 'mix', color: 'O', n: 2 }, { type: 'popColor', color: 'O', n: 4 }],
      par: 7,
      hint: '赤い泡に黄色を吹き込んでオレンジを2こ作ろう。近くで作れば群れになる。',
    },
    {
      name: 'ふかみのともだち',
      patterns: [
        pat(.5, .3, 0.95, ['GgG', 'pPp']),
      ],
      tanks: { G: 5, B: 4, R: 4 },
      goals: [{ type: 'rescue', n: 3 }],
      par: 6,
      hint: '緑は1こ追加。紫は青＋赤で作ってつなげよう。',
    },
    {
      name: 'おおきくそだてて',
      patterns: [pat(.5, .34, 0.8, ['PPP', 'PP', 'P'])],
      tanks: { P: 5, R: 3, B: 3 },
      goals: [{ type: 'big', n: 7 }],
      par: 2,
      hint: '紫をもう1こたして、7こ同時のばくはつを見よう！',
    },
    {
      name: 'うみのそつぎょうしけん',
      extra: scatter(20260721, 12, ['R', 'Y', 'B', 'G'], { x0: .18, y0: .12, x1: .82, y1: .55 }, [0.75, 1.1], 2),
      tanks: { R: 6, Y: 6, B: 6 },
      goals: [{ type: 'rescue', n: 2 }, { type: 'popAny', n: 12 }],
      par: 9,
      hint: '同じ色が3こ近くにあるところを探して、1こたして連鎖のきっかけを作ろう。',
    },

    /* ---------- W3: とげとげのもり（ウニ登場） ---------- */
    {
      name: 'とげとげにごようじん',
      patterns: [pat(.3, .3, 0.95, ['RR', 'R'])],
      hazards: [{ type: 'urchin', cx: .7, cy: .35, rr: 1.1 }],
      tanks: { R: 6 },
      goals: [{ type: 'popColor', color: 'R', n: 4 }],
      par: 2,
      tip: 'ウニにさわった泡は 割れてしまう！ちかづけないように',
      hint: 'ウニから離れた左側で4こ目を作ろう。',
    },
    {
      name: 'ウニのあいだで',
      patterns: [pat(.5, .3, 0.9, ['YY', 'Y'])],
      hazards: [
        { type: 'urchin', cx: .18, cy: .35, rr: 1.0 },
        { type: 'urchin', cx: .82, cy: .35, rr: 1.0 },
      ],
      tanks: { Y: 7 },
      goals: [{ type: 'popColor', color: 'Y', n: 5 }],
      par: 3,
      hint: 'まん中のせまい安全地帯で、そっと泡を育てよう。',
    },
    {
      name: 'とげのしたのともだち',
      patterns: [pat(.5, .55, 0.95, ['BbB'])],
      hazards: [{ type: 'urchin', cx: .5, cy: .25, rr: 1.15 }],
      tanks: { B: 6 },
      goals: [{ type: 'rescue', n: 1 }],
      par: 2,
      hint: '泡は浮かんでウニに近づいてしまう。早めに青を1こたして割ろう！',
    },
    {
      name: 'もりのいろづくり',
      patterns: [
        pat(.28, .5, 0.9, ['YY']),
        pat(.72, .5, 0.9, ['BB']),
        pat(.5, .68, 0.9, ['GG']),
      ],
      hazards: [{ type: 'urchin', cx: .5, cy: .28, rr: 1.2 }],
      tanks: { Y: 6, B: 6 },
      goals: [{ type: 'popColor', color: 'G', n: 5 }],
      par: 6,
      hint: '黄や青を緑にぬりかえて、下の緑とつなげよう。上には浮かせないで！',
    },
    {
      name: 'ウニのわ',
      patterns: [pat(.5, .42, 0.85, ['PP', 'PP'])],
      hazards: [
        { type: 'urchin', cx: .25, cy: .2, rr: 0.9 },
        { type: 'urchin', cx: .75, cy: .2, rr: 0.9 },
        { type: 'urchin', cx: .5, cy: .12, rr: 0.9 },
      ],
      tanks: { P: 4, R: 3, B: 3 },
      goals: [{ type: 'big', n: 5 }],
      par: 2,
      hint: '5こ目の紫をたして一気に割ろう。浮き上がる前がしょうぶ！',
    },
    {
      name: 'ジェリーカニがきた！',
      patterns: [pat(.5, .3, 0.92, ['GG', 'G'])],
      hazards: [{ type: 'crab', edge: 'bottom' }],
      tanks: { G: 7 },
      goals: [{ type: 'popColor', color: 'G', n: 5 }],
      par: 3,
      tip: 'ジェリーカニは ふちを歩いて ちかくの泡を パチン！とわってしまう',
      hint: 'カニは下のふちを巡回中。上のほうで泡を育てよう。',
    },
    {
      name: 'はさみととげ',
      patterns: [pat(.35, .35, 0.9, ['RRY', 'YR'])],
      hazards: [
        { type: 'urchin', cx: .78, cy: .3, rr: 1.0 },
        { type: 'crab', edge: 'bottom' },
      ],
      tanks: { R: 5, Y: 5 },
      goals: [{ type: 'popColor', color: 'R', n: 4 }, { type: 'popColor', color: 'Y', n: 4 }],
      par: 5,
      hint: '黄色い泡を赤にぬりかえる手もあるよ。数をかぞえて計画的に！',
    },
    {
      name: 'もりのおおそうじ',
      extra: scatter(37, 14, ['B', 'G', 'P'], { x0: .15, y0: .15, x1: .85, y1: .55 }, [0.7, 1.05], 0),
      hazards: [{ type: 'urchin', cx: .5, cy: .78, rr: 1.05 }],
      tanks: { B: 7, G: 7, P: 7 },
      goals: [{ type: 'clear' }],
      par: 12,
      tip: 'ぜんぶの泡を割ると クリア！',
      hint: '多い色から順にそろえよう。合体で数をへらすのもコツ。',
    },
    {
      name: 'とげとげのめいろ',
      patterns: [pat(.22, .55, 0.85, ['Oo']), pat(.78, .55, 0.85, ['oO'])],
      hazards: [
        { type: 'urchin', cx: .5, cy: .38, rr: 1.15 },
        { type: 'urchin', cx: .3, cy: .16, rr: 0.95 },
        { type: 'urchin', cx: .7, cy: .16, rr: 0.95 },
      ],
      tanks: { O: 5, R: 4, Y: 4 },
      goals: [{ type: 'rescue', n: 2 }],
      par: 5,
      hint: '左右の群れをオレンジ2こずつに育てて、それぞれ4こにして割ろう。',
    },
    {
      name: 'もりのぬし',
      patterns: [pat(.5, .55, 0.8, ['XXX', 'XX'])],
      hazards: [{ type: 'urchin', cx: .5, cy: .22, rr: 1.3 }],
      tanks: { R: 8, Y: 8, B: 8 },
      goals: [{ type: 'clean', n: 3 }, { type: 'popAny', n: 5 }],
      par: 12,
      hint: 'にごり泡に同じ原色をたっぷり注いで、同じ色を3こ以上つくろう。',
    },

    /* ---------- W4: ふかみのあらし（総合） ---------- */
    {
      name: 'あらしのいりぐち',
      patterns: [
        pat(.3, .25, 0.85, ['RYR', 'BR']),
        pat(.7, .45, 0.85, ['YBY', 'RY']),
      ],
      tanks: { R: 5, Y: 5, B: 5 },
      goals: [{ type: 'chain', n: 2 }, { type: 'popAny', n: 8 }],
      par: 7,
      hint: 'まず数がそろっている色から。割れた勢いでとなりの群れがくっつくよ。',
    },
    {
      name: 'ワイルドストーム',
      patterns: [
        pat(.5, .3, 0.85, ['GPG', 'PGP', 'GPG']),
      ],
      tanks: { G: 4, P: 4, B: 3 },
      goals: [{ type: 'chain', n: 3 }, { type: 'popAny', n: 9 }],
      par: 6,
      hint: '市松もようは1こたすだけで大連鎖のチャンス！',
    },
    {
      name: 'ふかみのすいぞくかん',
      patterns: [
        pat(.25, .3, 0.85, ['ry', 'Yr']),
        pat(.75, .3, 0.85, ['by', 'Bb']),
      ],
      hazards: [{ type: 'crab', edge: 'top' }],
      tanks: { R: 5, Y: 5, B: 5 },
      goals: [{ type: 'rescue', n: 5 }],
      par: 8,
      hint: '上のカニに近づく前に助けたい。左は赤と黄、右は青をそろえて。',
    },
    {
      name: 'まぜまぜたいかい',
      patterns: [
        pat(.5, .35, 0.9, ['RYB', 'BRY', 'YBR']),
      ],
      tanks: { R: 6, Y: 6, B: 6 },
      goals: [{ type: 'mix', color: 'O', n: 1 }, { type: 'mix', color: 'G', n: 1 }, { type: 'mix', color: 'P', n: 1 }],
      par: 8,
      hint: 'となり合う原色ペアを合体させると、はやく確実に混ざるよ。',
    },
    {
      name: 'おおあらし',
      extra: scatter(4242, 16, ['R', 'Y', 'B', 'O', 'G', 'P'], { x0: .12, y0: .12, x1: .88, y1: .6 }, [0.65, 1.05], 3),
      hazards: [{ type: 'urchin', cx: .5, cy: .8, rr: 1.0 }],
      tanks: { R: 6, Y: 6, B: 6 },
      goals: [{ type: 'rescue', n: 3 }, { type: 'chain', n: 2 }],
      par: 10,
      hint: '生き物の泡と同じ色がどこにあるか、まず観察してから吹こう。',
    },
    {
      name: 'とげのらんぶ',
      patterns: [pat(.5, .5, 0.85, ['OOG', 'GOO'])],
      hazards: [
        { type: 'urchin', cx: .2, cy: .25, rr: 1.0 },
        { type: 'urchin', cx: .8, cy: .25, rr: 1.0 },
        { type: 'crab', edge: 'bottom' },
      ],
      tanks: { O: 5, G: 5, Y: 4 },
      goals: [{ type: 'popColor', color: 'O', n: 4 }, { type: 'popColor', color: 'G', n: 4 }],
      par: 6,
      hint: '緑を1こ、オレンジは膨らませてつなぐ。浮き上がりに注意！',
    },
    {
      name: 'しんかいのちょうせん',
      patterns: [pat(.5, .32, 0.78, ['PPPP', 'PPP', 'PP'])],
      tanks: { P: 4, R: 2, B: 2 },
      goals: [{ type: 'big', n: 10 }],
      par: 2,
      hint: '9こある…あと1こたして10こ同時！れきしにのこる ばくはつだ！',
    },
    {
      name: 'にごりのうみをすくえ',
      patterns: [pat(.5, .4, 0.82, ['XbX', 'xXx'])],
      tanks: { R: 9, Y: 9, B: 9 },
      goals: [{ type: 'rescue', n: 3 }, { type: 'clean', n: 4 }],
      par: 14,
      hint: 'にごり泡を同じ色にそろえてから割ると、生き物もいっしょに助かるよ。',
    },
    {
      name: 'あらしのまえのしずけさ',
      extra: scatter(777, 18, ['R', 'Y', 'B', 'G', 'P', 'O'], { x0: .12, y0: .1, x1: .88, y1: .62 }, [0.6, 1.0], 2),
      hazards: [
        { type: 'urchin', cx: .3, cy: .8, rr: 0.95 },
        { type: 'urchin', cx: .7, cy: .8, rr: 0.95 },
        { type: 'crab', edge: 'top' },
      ],
      tanks: { R: 7, Y: 7, B: 7 },
      goals: [{ type: 'rescue', n: 2 }, { type: 'popAny', n: 14 }],
      par: 12,
      hint: 'カニとウニのすきまが戦場。連鎖をつかって手数を節約しよう。',
    },
    {
      name: 'あわのおうさま',
      patterns: [
        pat(.5, .2, 0.8, ['WoW']),
        pat(.25, .45, 0.85, ['RyR', 'BR']),
        pat(.75, .45, 0.85, ['ByB', 'YB']),
      ],
      hazards: [{ type: 'crab', edge: 'bottom' }],
      tanks: { R: 6, Y: 6, B: 6 },
      goals: [{ type: 'rescue', n: 3 }, { type: 'chain', n: 3 }, { type: 'popAny', n: 12 }],
      par: 12,
      tip: 'さいごのしれん！すべてのわざを つかいこなそう！',
      hint: 'ワイルドは左右どちらの群れの完成にも使える。連鎖の起点にしよう。',
    },
  ];

  /* レベルを実座標のスポーンリストに変換 */
  function build(level, bounds, R0) {
    const bubbles = [];
    const hazards = [];
    const critterTypes = ['fish', 'star', 'tako'];
    let critterIdx = 0;

    function addFromChar(ch, x, y, rr) {
      if (ch === ' ' || ch === '.') return;
      const upper = ch.toUpperCase();
      if (!'RYBOGPWX'.includes(upper)) return;
      const isCritter = ch !== upper;
      bubbles.push({
        x, y, r: rr * R0, key: upper,
        critter: isCritter ? { type: critterTypes[critterIdx++ % critterTypes.length] } : null,
      });
    }

    for (const p of (level.patterns || [])) {
      const rows = p.rows;
      const cx = bounds.x + p.cx * bounds.w;
      const cy = bounds.y + p.cy * bounds.h;
      const maxLen = Math.max(...rows.map(r => r.length));
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        for (let j = 0; j < row.length; j++) {
          const x = cx + (j - (maxLen - 1) / 2) * p.rr * R0 * 1.92 + ((i % 2) ? p.rr * R0 * 0.95 : 0);
          const y = cy + (i - (rows.length - 1) / 2) * p.rr * R0 * 1.7;
          addFromChar(row[j], x, y, p.rr);
        }
      }
    }
    for (const e of (level.extra || [])) {
      bubbles.push({
        x: bounds.x + e.cx * bounds.w,
        y: bounds.y + e.cy * bounds.h,
        r: e.rr * R0, key: e.key,
        critter: e.critter ? { type: critterTypes[critterIdx++ % critterTypes.length] } : null,
      });
    }
    for (const hz of (level.hazards || [])) {
      if (hz.type === 'urchin') {
        hazards.push({ type: 'urchin', x: bounds.x + hz.cx * bounds.w, y: bounds.y + hz.cy * bounds.h, r: hz.rr * R0 });
      } else {
        hazards.push({ type: 'crab', edge: hz.edge });
      }
    }
    return { bubbles, hazards };
  }

  function worldOf(idx) {
    for (let w = 0; w < WORLDS.length; w++) {
      if (idx >= WORLDS[w].range[0] && idx <= WORLDS[w].range[1]) return w;
    }
    return 0;
  }

  return { LEVELS, WORLDS, build, worldOf };
})();
