/* =========================================================
 * balloon.js — ミニゲーム「ふうせんもじ」
 *
 * 問い:「この文字、ふくらませたら 飛ぶ? もれる?」
 *  - 輪が閉じた文字 (A B D O P Q R) → 穴が風船になって空へ!
 *  - 開いた文字 (C E F ...) → すきまから「プスー!」と漏れて
 *    部屋中を飛び回ってペチャンコに (すきまの場所に注目が集まる)
 *
 * 遊びの流れ: よそう (とぶ?もれる?) → ポンプを4回押す → 結果!
 * ========================================================= */

const Balloon = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  let queue = [];        // 出題順 (閉/開が交互に近くなるようシャッフル)
  let cur = null;        // 今の文字
  let phase = 'guess';   // guess → pump → result
  let guess = null;      // 'fly' | 'leak'
  let pumpN = 0;         // ポンプ回数 (4で判定)
  let inflate = 0;       // ふくらみ 0..1
  let anim = null;       // 結果アニメ状態
  let starCount = 0;
  let pumpPress = 0;     // ポンプの絵のへこみ
  let autoNext = null;   // 押し忘れ対策の自動送りタイマー

  function makeQueue() {
    const closed = Tracks.ALPHABET.filter(c => Tracks.letters[c].closed).sort(() => Math.random() - 0.5);
    const open = Tracks.ALPHABET.filter(c => !Tracks.letters[c].closed).sort(() => Math.random() - 0.5);
    // 閉1:開1で交互に混ぜる (開いた文字が多いので余りは後ろへ)
    const q = [];
    const n = Math.max(closed.length, open.length);
    for (let i = 0; i < n; i++) {
      if (i < closed.length) q.push(closed[i]);
      if (i < open.length) q.push(open[i]);
    }
    return q;
  }

  function enter() {
    queue = makeQueue();
    starCount = 0;
    document.getElementById('hud').innerHTML = `
      <div id="star-count">⭐ 0</div>
      <div id="bl-question" class="bl-banner">とぶかな? もれるかな?</div>
      <div id="bl-guess">
        <button class="guess-btn" id="guess-fly">🎈<span>とぶ!</span></button>
        <button class="guess-btn" id="guess-leak">💨<span>もれる!</span></button>
      </div>
      <button id="bl-pump" class="hidden">ポンプ!</button>
      <button id="bl-next" class="big-next hidden">▶</button>`;
    document.getElementById('guess-fly').addEventListener('pointerdown', (e) => { e.stopPropagation(); setGuess('fly'); });
    document.getElementById('guess-leak').addEventListener('pointerdown', (e) => { e.stopPropagation(); setGuess('leak'); });
    document.getElementById('bl-pump').addEventListener('pointerdown', (e) => { e.stopPropagation(); pump(); });
    document.getElementById('bl-next').addEventListener('pointerdown', (e) => { e.stopPropagation(); nextLetter(); });
    nextLetter(true);
    Sound.speak("Will it fly? Or will it leak?");
  }

  function exit() { clearTimeout(autoNext); }
  function onResize() {}

  function nextLetter(first = false) {
    clearTimeout(autoNext);
    if (!queue.length) queue = makeQueue();
    cur = queue.shift();
    phase = 'guess';
    guess = null;
    pumpN = 0;
    inflate = 0;
    anim = null;
    show('bl-question', true);
    show('bl-guess', true);
    show('bl-pump', false);
    show('bl-next', false);
    if (!first) Sound.speak(cur + '! Will it fly?');
    else setTimeout(() => Sound.speak(cur + '!', { interrupt: false }), 1800);
  }

  function setGuess(g) {
    if (phase !== 'guess') return;
    guess = g;
    phase = 'pump';
    Sound.fx.click();
    show('bl-guess', false);
    show('bl-question', false);
    show('bl-pump', true);
    Sound.speak("Pump it up!");
  }

  function pump() {
    if (phase !== 'pump') return;
    pumpN++;
    pumpPress = 1;
    inflate = Math.min(1, pumpN / 4);
    Sound.fx.pump();
    if (pumpN < 4) Sound.fx.inflate();
    if (pumpN >= 4) resolve();
  }

  function resolve() {
    phase = 'result';
    show('bl-pump', false);
    const info = Tracks.letters[cur];
    const correct = (info.closed && guess === 'fly') || (!info.closed && guess === 'leak');

    if (info.closed) {
      anim = { kind: 'fly', t: 0, x: 0, y: 0, sway: Math.random() * 6 };
      Sound.fx.floatUp();
      Sound.speak(cur + "! No gaps! It's closed! Up, up, up!");
    } else {
      anim = { kind: 'leak', t: 0, x: 0, y: 0, vx: (Math.random() - 0.5) * 900, vy: -500 - Math.random() * 300, rot: 0 };
      Sound.fx.leak();
      Sound.speak("Pffft! " + cur + " has a gap! It's open!");
    }

    setTimeout(() => {
      if (correct) {
        starCount++;
        Sound.fx.tada();
        FX.confetti(innerWidth / 2, innerHeight * 0.35, 36);
        const sc = document.getElementById('star-count');
        if (sc) sc.textContent = '⭐ ' + starCount;
      } else {
        Sound.fx.boing();
      }
      show('bl-next', true);
    }, 2100);
    // 押し忘れ対策: 自動で次へ
    autoNext = setTimeout(() => nextLetter(), 7000);
  }

  function show(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !on);
  }

  /* ---------------- 毎フレーム ---------------- */

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    pumpPress = Math.max(0, pumpPress - dts * 4);
    if (anim) {
      anim.t += dts;
      if (anim.kind === 'fly') {
        anim.y -= dts * (60 + anim.t * 120);          // だんだん速く上昇
        anim.x = Math.sin(anim.t * 2 + anim.sway) * 30;
      } else if (anim.kind === 'leak') {
        // 手を離した風船みたいに暴れまわる
        if (anim.t < 1.6) {
          anim.vx += (Math.random() - 0.5) * 2600 * dts;
          anim.vy += (Math.random() - 0.5) * 2600 * dts + 300 * dts;
          anim.x += anim.vx * dts;
          anim.y += anim.vy * dts;
          anim.rot += dts * 14;
          anim.x = Math.max(-innerWidth * 0.4, Math.min(innerWidth * 0.4, anim.x));
          anim.y = Math.max(-innerHeight * 0.45, Math.min(60, anim.y));
          if (Math.random() < 0.6) {
            FX.sparkle(cx() + anim.x + (Math.random() - 0.5) * 60, cy() + anim.y + (Math.random() - 0.5) * 60);
          }
        } else {
          // ペチャンコになって落ちる
          anim.y = Math.min(anim.y + 500 * dts, innerHeight * 0.22);
          anim.rot = anim.rot * 0.9 + (Math.PI / 2) * 0.1;
        }
      }
    }
  }

  function cx() { return innerWidth / 2; }
  function cy() { return innerHeight * 0.42; }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // 空
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#8ed8f8');
    grad.addColorStop(1, '#e7f6ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 雲と太陽
    ctx.fillStyle = 'rgba(255,216,77,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.1, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [fx_, fy, r] of [[0.15, 0.12, 34], [0.6, 0.07, 26], [0.35, 0.2, 22]]) {
      ctx.beginPath();
      ctx.arc(W * fx_, H * fy, r, 0, Math.PI * 2);
      ctx.arc(W * fx_ + r * 0.8, H * fy + 5, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // ゴールの虹 (上まで飛ぶとここに届く)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ['#ff6b6b', '#ffd45c', '#7ed957'].forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, -H * 0.1, H * 0.22 + i * 12, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    });
    ctx.restore();
    // 地面
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(0, H * 0.78, W, H);

    // ポンプ (絵)
    drawPump(ctx, W, H);

    // 文字本体
    if (cur) drawLetter(ctx, W, H, t);

    FX.update();
    FX.draw(ctx);
  }

  function drawPump(ctx, W, H) {
    const px = W / 2 - Math.min(W, H) * 0.3, py = H * 0.72;
    ctx.fillStyle = '#e5533d';
    ctx.fillRect(px - 18, py - 40 + pumpPress * 22, 36, 46 - pumpPress * 22); // シリンダー
    ctx.fillStyle = '#b53f2e';
    ctx.fillRect(px - 30, py + 4, 60, 14); // 台
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(px - 26, py - 52 + pumpPress * 22, 52, 10); // ハンドル
    // ホース (文字が飛び立った後は足元でとぐろを巻く)
    ctx.strokeStyle = '#b53f2e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px + 18, py + 8);
    if (anim) {
      ctx.quadraticCurveTo(px + 90, py + 30, px + 130, py + 12);
    } else {
      ctx.quadraticCurveTo(W / 2 - 40, H * 0.8, cx(), cy() + letterSize() * 0.55);
    }
    ctx.stroke();
  }

  function letterSize() { return Math.min(innerWidth, innerHeight) * 0.42; }

  function drawLetter(ctx, W, H, t) {
    const info = Tracks.letters[cur];
    const s = letterSize();
    const scale = 1 + inflate * 0.22 + Math.sin(t / 300) * 0.01;
    let x = cx(), y = cy(), rot = 0, alpha = 1, squashX = 1, squashY = 1;

    if (anim) {
      x += anim.x; y += anim.y;
      if (anim.kind === 'leak') {
        rot = anim.rot;
        if (anim.t >= 1.6) { squashY = 0.35; squashX = 1.25; } // ペチャンコ
      }
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale * squashX, scale * squashY);

    // ふくらんだ「穴」= 風船 (文字の後ろに膨らむピンクのゴム)
    if (info.closed && inflate > 0.05) {
      for (const [ccx, ccy, rx, ry] of info.topo.counters) {
        const k = 0.7 + inflate * 0.75;
        const gx = (ccx - 50) / 100 * s, gy = (ccy - 50) / 100 * s;
        const grad2 = ctx.createRadialGradient(gx - rx * 0.2, gy - ry * 0.3, 2, gx, gy, rx / 100 * s * k * 1.6);
        grad2.addColorStop(0, '#ffd9e8');
        grad2.addColorStop(1, '#ff7eb3');
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.ellipse(gx, gy, rx / 100 * s * k * 1.45, ry / 100 * s * k * 1.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // ハイライト
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(gx - rx / 100 * s * 0.4, gy - ry / 100 * s * 0.5, s * 0.02, s * 0.03, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 文字 (縁取り + 色)
    ctx.font = `900 ${s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = s * 0.14;
    ctx.strokeText(cur, 0, 0);
    ctx.fillStyle = info.color;
    ctx.fillText(cur, 0, 0);

    // 飛行中: かご + うさぎをぶら下げる
    if (anim && anim.kind === 'fly') {
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.5); ctx.lineTo(-s * 0.12, s * 0.72);
      ctx.moveTo(s * 0.2, s * 0.5); ctx.lineTo(s * 0.12, s * 0.72);
      ctx.stroke();
      ctx.fillStyle = '#c9995c';
      ctx.fillRect(-s * 0.16, s * 0.72, s * 0.32, s * 0.14);
      ctx.font = `${s * 0.16}px sans-serif`;
      ctx.fillText('🐰', 0, s * 0.7);
    }

    // 漏れ中: すきまの場所を赤丸で見せる + 空気の噴き出し
    if (anim && anim.kind === 'leak' && info.topo && info.topo.leak) {
      const [lx, ly, ang] = info.topo.leak;
      const gx = (lx - 50) / 100 * s, gy = (ly - 50) / 100 * s;
      ctx.strokeStyle = '#e5533d';
      ctx.lineWidth = s * 0.02;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(gx, gy, s * 0.13 + Math.sin(t / 120) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 噴き出す空気
      const a = ang * Math.PI / 180;
      for (let i = 0; i < 3; i++) {
        const d = s * (0.16 + i * 0.07) + (t / 4 % 40);
        ctx.fillStyle = `rgba(255,255,255,${0.7 - i * 0.2})`;
        ctx.beginPath();
        ctx.arc(gx + Math.cos(a) * d, gy + Math.sin(a) * d, s * 0.03 * (1 + i * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function onDown(x, y) { FX.sparkle(x, y); }

  return {
    enter, exit, tick, draw, onResize, onDown,
    onMove() {}, onUp() {},
    get state() { return { cur, phase, guess, pumpN, starCount, animKind: anim && anim.kind }; },
    _setGuess: setGuess, _pump: pump, _next: nextLetter,
  };
})();

window.Balloon = Balloon;
