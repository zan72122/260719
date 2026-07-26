/* =========================================================
 * cookie.js — ミニゲーム「もじクッキーやさん」
 *
 * お客のモンスターが英語で注文:「C, please!」
 * 棚にあるのは O のクッキーだけ。
 *  - 多すぎる → 🦷 かじって減らす (O をひとくち → C になる!)
 *  - 足りない → 🍫 チョコペンで描き足す (P に1本 → R になる!)
 * 文字どうしの「差分」= 識別ポイントだけを遊びにした、
 * まちがい探しの逆再生。注文は音声なのでリスニングにもなる。
 * ========================================================= */

const Cookie = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  /* 差分ペアのデータ (座標は 100x100 のグリフ箱, y は下向き)
   * zone   : かじる場所 [x, y, 半径]
   * stroke : チョコペンで描く線 (点列) */
  // zone は [x, y, rx, ry(省略時=rx)] の楕円
  const ROUNDS = [
    { kind: 'bite', from: 'O', to: 'C', zone: [80, 52, 18, 20] },
    { kind: 'bite', from: 'R', to: 'P', zone: [63, 75, 22, 25] },
    { kind: 'bite', from: 'Q', to: 'O', zone: [72, 88, 17] },
    { kind: 'bite', from: 'E', to: 'F', zone: [58, 87, 24, 12] },
    { kind: 'bite', from: 'B', to: 'P', zone: [58, 74, 23, 24] },
    { kind: 'bite', from: 'P', to: 'I', zone: [61, 29, 22, 21] },
    { kind: 'pen', from: 'C', to: 'G', stroke: [[76, 58], [48, 58]] },
    { kind: 'pen', from: 'P', to: 'R', stroke: [[40, 55], [76, 94]] },
    { kind: 'pen', from: 'F', to: 'E', stroke: [[36, 89], [78, 89]] },
    { kind: 'pen', from: 'O', to: 'Q', stroke: [[62, 68], [84, 96]] },
    { kind: 'pen', from: 'I', to: 'T', stroke: [[24, 11], [76, 11]] },
    { kind: 'pen', from: 'C', to: 'O', stroke: [[74, 22], [88, 50], [74, 78]] },
  ];

  const MONSTER_HUES = [265, 12, 155, 205, 330, 45, 105];

  // クッキーのオフスクリーンキャンバス (かじり跡・チョコを保持)
  const CC = 340;               // キャンバスサイズ
  const GX = 44, GW = 252;      // 100-box → キャンバスのマッピング
  let cookieCv = null, cookieCtx = null;

  let deck = [];
  let round = null;
  let phase = 'enter';   // enter → tool → work → deliver → happy
  let monster = { hue: 265, mouth: 0, x: 0, y: 0, bounce: 0 };
  let starCount = 0;
  let wrongTaps = 0;
  let hintT = 0;
  let penSamples = [];   // {x,y,hit} ガイドのサンプル点 (グリフ座標)
  let penDone = false;
  let drawing = false;
  let fly = null;        // 配達アニメ {t}
  let chomps = 0;
  let timers = [];
  let enterT = 0;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  /* ---------------- レイアウト ---------------- */

  function platePos() {
    const W = innerWidth, H = innerHeight;
    return W > H ? { x: W * 0.36, y: H * 0.56 } : { x: W * 0.5, y: H * 0.5 };
  }
  function monsterPos() {
    const W = innerWidth, H = innerHeight;
    return W > H ? { x: W * 0.78, y: H * 0.52 } : { x: W * 0.74, y: H * 0.2 };
  }
  function cookieScale() {
    return Math.min(innerWidth, innerHeight) * 0.52 / CC;
  }

  // 画面座標 → グリフ100-box座標
  function toGlyph(sx, sy) {
    const p = platePos(), k = cookieScale();
    const cx = (sx - (p.x - CC * k / 2)) / k;
    const cy = (sy - (p.y - CC * k / 2)) / k;
    return { x: (cx - GX) / GW * 100, y: (cy - GX) / GW * 100 };
  }
  function glyphToScreen(gx, gy) {
    const p = platePos(), k = cookieScale();
    return {
      x: p.x - CC * k / 2 + (GX + gx / 100 * GW) * k,
      y: p.y - CC * k / 2 + (GX + gy / 100 * GW) * k,
    };
  }

  /* ---------------- クッキー描画 (オフスクリーン) ---------------- */

  function bakeCookie(ch) {
    if (!cookieCv) {
      cookieCv = document.createElement('canvas');
      cookieCv.width = cookieCv.height = CC;
      cookieCtx = cookieCv.getContext('2d');
    }
    const g = cookieCtx;
    g.clearRect(0, 0, CC, CC);
    g.font = `900 ${GW * 1.06}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    // こんがり生地
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = 26;
    g.strokeText(ch, CC / 2, CC / 2 + 8);
    g.fillStyle = '#8a5a2b';
    g.fillText(ch, CC / 2, CC / 2 + 12);
    g.fillStyle = '#d99a54';
    g.fillText(ch, CC / 2, CC / 2 + 4);
    // チョコチップ (生地の上だけに)
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#5a3a20';
    let seed = ch.charCodeAt(0) * 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.arc(rnd() * CC, rnd() * CC, 5 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // かじる: ギザギザの歯型で消す (楕円対応)
  function biteAt(gx, gy, rx, ry = rx) {
    const g = cookieCtx;
    const cx = GX + gx / 100 * GW, cy = GX + gy / 100 * GW;
    const crx = rx / 100 * GW, cry = ry / 100 * GW;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(cx, cy, crx, cry, 0, 0, Math.PI * 2);
    g.fill();
    // まわりに小さな歯あと
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * crx, cy + Math.sin(a) * cry, Math.min(crx, cry) * 0.34, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // チョコペン: なぞった所にチョコを乗せる
  function chocoDot(gx, gy, r = 7) {
    const g = cookieCtx;
    g.fillStyle = '#4a2c14';
    g.beginPath();
    g.arc(GX + gx / 100 * GW, GX + gy / 100 * GW, r / 100 * GW, 0, Math.PI * 2);
    g.fill();
  }

  function chocoStroke(pts) {
    const g = cookieCtx;
    g.strokeStyle = '#4a2c14';
    g.lineWidth = 15 / 100 * GW;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(GX + pts[0][0] / 100 * GW, GX + pts[0][1] / 100 * GW);
    for (const [x, y] of pts) g.lineTo(GX + x / 100 * GW, GX + y / 100 * GW);
    g.stroke();
    // つや
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 5 / 100 * GW;
    g.beginPath();
    g.moveTo(GX + pts[0][0] / 100 * GW, GX + (pts[0][1] - 2) / 100 * GW);
    for (const [x, y] of pts) g.lineTo(GX + x / 100 * GW, GX + (y - 2) / 100 * GW);
    g.stroke();
  }

  /* ---------------- ラウンド進行 ---------------- */

  function enter() {
    deck = [...ROUNDS].sort(() => Math.random() - 0.5);
    starCount = 0;
    document.getElementById('hud').innerHTML = `
      <div id="star-count">⭐ 0</div>
      <div id="ck-tools" class="hidden">
        <button class="tool-big" id="ck-bite">🦷<span>かじる</span></button>
        <button class="tool-big" id="ck-pen">🍫<span>ペンでかく</span></button>
      </div>`;
    document.getElementById('ck-bite').addEventListener('pointerdown', (e) => { e.stopPropagation(); pickTool('bite'); });
    document.getElementById('ck-pen').addEventListener('pointerdown', (e) => { e.stopPropagation(); pickTool('pen'); });
    nextRound(true);
  }

  function exit() {
    timers.forEach(clearTimeout);
    timers = [];
  }
  function onResize() {}

  function nextRound(first = false) {
    timers.forEach(clearTimeout);
    timers = [];
    if (!deck.length) deck = [...ROUNDS].sort(() => Math.random() - 0.5);
    round = deck.shift();
    phase = 'enter';
    enterT = 0;
    wrongTaps = 0;
    hintT = 0;
    penDone = false;
    drawing = false;
    fly = null;
    chomps = 0;
    monster = {
      hue: MONSTER_HUES[Math.floor(Math.random() * MONSTER_HUES.length)],
      mouth: 0, bounce: 0,
    };
    bakeCookie(round.from);
    if (round.kind === 'pen') {
      penSamples = samplePath(round.stroke, 12).map(p => ({ x: p[0], y: p[1], hit: false }));
    }
    show('ck-tools', false);
    later(() => speakOrder(), first ? 1200 : 700);
    later(() => {
      phase = 'tool';
      show('ck-tools', true);
    }, first ? 2800 : 2300);
  }

  function samplePath(pts, per) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(2, Math.round(d / per * 2));
      for (let j = 0; j <= n; j++) {
        out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
      }
    }
    return out;
  }

  function speakOrder() {
    if (!round) return;
    Sound.speakSequence([
      { text: 'Hello!', wait: 900 },
      { text: round.to + ', please!', rate: 0.8, wait: 0 },
    ]);
    monster.bounce = 1;
  }

  function pickTool(tool) {
    if (phase !== 'tool') return;
    if (tool === round.kind) {
      Sound.fx.click();
      phase = 'work';
      show('ck-tools', false);
      if (round.kind === 'bite') {
        Sound.speak('Take a bite!');
      } else {
        Sound.speak('Draw the chocolate line!');
      }
    } else {
      // 道具をまちがえた → 差分の「向き」を英語でヒント
      Sound.fx.wrong();
      if (round.kind === 'bite') {
        Sound.speak("It's too big! Bite it!");
        wiggle('ck-bite');
      } else {
        Sound.speak("Something is missing! Draw it!");
        wiggle('ck-pen');
      }
    }
  }

  function wiggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('attention');
    void el.offsetWidth;
    el.classList.add('attention');
  }

  function finishWork() {
    phase = 'done';
    hintT = 0;
    const sp = glyphToScreen(
      round.kind === 'bite' ? round.zone[0] : round.stroke[0][0],
      round.kind === 'bite' ? round.zone[1] : round.stroke[0][1]);
    FX.stars(sp.x, sp.y, 10);
    Sound.fx.chime();
    later(() => Sound.speak(round.from + '... became ' + round.to + '!'), 300);
    later(() => {
      phase = 'deliver';
      fly = { t: 0 };
      Sound.fx.whoosh();
    }, 2200);
  }

  /* ---------------- 入力 ---------------- */

  function onDown(x, y) {
    // モンスターをタップ → 注文をもう一回言う (リスニング)
    const mp = monsterPos();
    const mr = Math.min(innerWidth, innerHeight) * 0.17;
    if (Math.hypot(x - mp.x, y - mp.y) < mr * 1.3) {
      speakOrder();
      FX.sparkle(x, y);
      return;
    }

    if (phase === 'work' && round.kind === 'bite') {
      const g = toGlyph(x, y);
      const [zx, zy, zrx, zry] = round.zone;
      const zr = Math.max(zrx, zry || zrx);
      if (Math.hypot(g.x - zx, g.y - zy) < zr * 1.6) {
        biteAt(...round.zone);
        Sound.fx.pop();
        Sound.fx.bump();
        monster.mouth = 1;
        FX.burst(x, y, '#c98a4b', 14);
        FX.burst(x, y, '#8a5a2b', 8);
        finishWork();
      } else if (g.x > -15 && g.x < 115 && g.y > -15 && g.y < 115) {
        wrongTaps++;
        Sound.fx.boing();
        Sound.speak(wrongTaps >= 2 ? 'Look! Bite here!' : 'Hmm... where?');
        if (wrongTaps >= 2) hintT = 1; // ヒントの輪を出す
        FX.sparkle(x, y);
      }
    } else if (phase === 'work' && round.kind === 'pen') {
      drawing = true;
      traceAt(x, y);
    } else {
      FX.sparkle(x, y);
    }
  }

  function onMove(x, y) {
    if (phase === 'work' && round.kind === 'pen' && drawing) traceAt(x, y);
  }
  function onUp() { drawing = false; }

  function traceAt(sx, sy) {
    if (penDone) return;
    const g = toGlyph(sx, sy);
    let newHit = false;
    for (const s of penSamples) {
      if (!s.hit && Math.hypot(g.x - s.x, g.y - s.y) < 15) {
        s.hit = true;
        newHit = true;
        chocoDot(s.x, s.y);
      }
    }
    if (newHit) {
      Sound.fx.clank();
      FX.sparkle(sx, sy);
    }
    const done = penSamples.filter(s => s.hit).length / penSamples.length;
    if (done >= 0.85) {
      penDone = true;
      chocoStroke(round.stroke); // 仕上げにきれいな一本線
      Sound.fx.inflate();
      finishWork();
    }
  }

  function show(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !on);
  }

  /* ---------------- 毎フレーム ---------------- */

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    enterT += dts;
    monster.mouth = Math.max(0, monster.mouth - dts * 2);
    monster.bounce = Math.max(0, monster.bounce - dts);

    // 何もしないで5秒 → かじる場所のヒント
    if (phase === 'work' && round.kind === 'bite') {
      hintT += dts * 0.2;
    }

    if (phase === 'deliver' && fly) {
      fly.t += dts;
      if (fly.t >= 1 && chomps < 3) {
        // モンスターがバリバリ食べる
        chomps++;
        fly.t = 0.75 + chomps * 0.001;
        monster.mouth = 1;
        Sound.fx.pop();
        const mp = monsterPos();
        FX.burst(mp.x, mp.y + 20, '#c98a4b', 10);
        if (chomps >= 3) {
          phase = 'happy';
          starCount++;
          const sc = document.getElementById('star-count');
          if (sc) sc.textContent = '⭐ ' + starCount;
          Sound.fx.tada();
          Sound.speak('Yum yum yum! ' + round.to + '! Thank you!');
          FX.confetti(mp.x, mp.y, 30);
          FX.emojiPop(mp.x, mp.y - 40, '❤️', 4);
          if (starCount % 5 === 0) {
            FX.firework(innerWidth * 0.5, innerHeight * 0.3);
            Sound.fx.firework();
          }
          later(() => nextRound(), 2600);
        }
      }
    }
  }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // パンやさんの店内
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffe8c9');
    grad.addColorStop(1, '#ffd9a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 壁の棚 + 飾りクッキー
    ctx.fillStyle = '#c9995c';
    ctx.fillRect(0, H * 0.08, W, 10);
    ctx.font = `${Math.min(W, H) * 0.05}px sans-serif`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
      ctx.fillText('🍪', W * (0.08 + i * 0.14), H * 0.08 - 6);
    }
    // カウンター
    ctx.fillStyle = '#b57a3e';
    ctx.fillRect(0, H * 0.72, W, H);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(0, H * 0.72, W, 12);

    drawMonster(ctx, t);
    drawPlateAndCookie(ctx, t);

    FX.update();
    FX.draw(ctx);
  }

  function drawPlateAndCookie(ctx, t) {
    const p = platePos();
    const k = cookieScale();
    let x = p.x, y = p.y, scale = k, rot = 0;

    if (phase === 'enter') {
      // 上からストンと登場
      const e = Math.min(1, enterT * 1.6);
      y = p.y - (1 - e * e) * innerHeight * 0.4;
    }
    if (phase === 'deliver' || phase === 'happy') {
      const mp = monsterPos();
      const ft = fly ? Math.min(1, fly.t / 0.75) : 1;
      const e = ft * ft * (3 - 2 * ft);
      x = p.x + (mp.x - p.x) * e;
      y = p.y + (mp.y + 30 - p.y) * e - Math.sin(e * Math.PI) * 80;
      rot = e * 0.6;
      scale = k * (1 - e * 0.35) * (1 - chomps * 0.25);
      if (phase === 'happy') scale = 0;
    }

    // お皿
    ctx.fillStyle = '#f4f0e8';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + CC * k * 0.38, CC * k * 0.52, CC * k * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ddd6c8';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + CC * k * 0.38, CC * k * 0.36, CC * k * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    if (scale > 0.01 && cookieCv) {
      ctx.save();
      ctx.translate(x, y + Math.sin(t / 500) * 4);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.drawImage(cookieCv, -CC / 2, -CC / 2);
      ctx.restore();
    }

    // かじる場所のヒントの輪
    if (phase === 'work' && round.kind === 'bite' && hintT > 0.9) {
      const [zx, zy, zrx, zry] = round.zone;
      const zr = Math.max(zrx, zry || zrx);
      const sp = glyphToScreen(zx, zy);
      ctx.strokeStyle = 'rgba(229,83,61,0.9)';
      ctx.lineWidth = 5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, zr / 100 * GW * k * (1.1 + Math.sin(t / 200) * 0.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ペンのガイド (点線 + 光る点)
    if (phase === 'work' && round.kind === 'pen' && !penDone) {
      for (const s of penSamples) {
        if (s.hit) continue;
        const sp = glyphToScreen(s.x, s.y);
        ctx.fillStyle = `rgba(74,44,20,${0.4 + Math.sin(t / 250 + s.x) * 0.25})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      // 始点マーカー
      const first = penSamples.find(s => !s.hit);
      if (first) {
        const sp = glyphToScreen(first.x, first.y);
        ctx.strokeStyle = '#e5533d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 16 + Math.sin(t / 200) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawMonster(ctx, t) {
    const mp = monsterPos();
    const r = Math.min(innerWidth, innerHeight) * 0.15;
    const bounce = Math.sin(t / 300) * 4 + (monster.bounce > 0 ? Math.sin(t / 60) * 6 : 0);
    const hue = monster.hue;

    ctx.save();
    ctx.translate(mp.x, mp.y + bounce);
    // からだ
    ctx.fillStyle = `hsl(${hue}, 65%, 62%)`;
    ctx.strokeStyle = `hsl(${hue}, 60%, 45%)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // つの
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.45, -r * 0.85);
      ctx.quadraticCurveTo(side * r * 0.7, -r * 1.5, side * r * 0.25, -r * 1.25);
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    // 目 (お皿の方を見る)
    const pp = platePos();
    const ang = Math.atan2(pp.y - mp.y, pp.x - mp.x);
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(side * r * 0.35, -r * 0.3, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(side * r * 0.35 + Math.cos(ang) * r * 0.08, -r * 0.3 + Math.sin(ang) * r * 0.08, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // くち (注文中・食べる時は大きくあく)
    const open = monster.mouth > 0 ? monster.mouth : (phase === 'tool' || phase === 'enter' ? 0.25 : 0.12);
    ctx.fillStyle = '#7a2833';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.42, r * 0.42 * Math.max(0.15, open), 0, 0, Math.PI);
    ctx.fill();
    if (open > 0.5) { // 歯
      ctx.fillStyle = '#fff';
      for (const tx of [-0.25, 0, 0.25]) {
        ctx.fillRect(tx * r - r * 0.05, r * 0.3, r * 0.1, r * 0.1);
      }
    }
    // おなか模様
    ctx.fillStyle = `hsl(${hue}, 65%, 72%)`;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.55, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 注文の吹き出し
    if (round && (phase === 'enter' || phase === 'tool' || phase === 'work')) {
      const bw = r * 1.5, bh = r * 1.15;
      const bx = mp.x - r * 1.9, by = mp.y - r * 1.15 + bounce * 0.4;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(140,90,40,0.4)';
      ctx.lineWidth = 3;
      roundRectPath(ctx, bx - bw / 2, by - bh / 2, bw, bh, 18);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2 - 12, by + bh * 0.28);
      ctx.lineTo(bx + bw / 2 + 26, by + bh * 0.42);
      ctx.lineTo(bx + bw / 2 - 12, by + bh * 0.05);
      ctx.closePath();
      ctx.fill();
      const target = round.to;
      const color = Tracks.letters[target] ? Tracks.letters[target].color : '#333';
      ctx.font = `900 ${bh * 0.62}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(target, bx, by - bh * 0.06);
      ctx.font = `700 ${bh * 0.16}px ${FONT}`;
      ctx.fillStyle = '#8a6a4a';
      ctx.fillText('please!', bx, by + bh * 0.32);
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    enter, exit, tick, draw, onResize, onDown, onMove, onUp,
    get state() {
      return {
        round, phase, starCount, chomps,
        penProgress: penSamples.length ? penSamples.filter(s => s.hit).length / penSamples.length : 0,
      };
    },
    _pickTool: pickTool,
    _rounds: ROUNDS,
  };
})();

window.Cookie = Cookie;
