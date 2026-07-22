/* =========================================================
 * circus.js — ミニゲーム「さかさまサーカス」
 *
 * 問い:「くるっと1回転したら、だれになる?」
 *  - N S Z O H I X は回っても同じ「さかさまチャンピオン」
 *  - M↔W、b↔q、d↔p、u↔n は回ると別人に変身!
 * 予想して → ドラムロールで宙返り → 正解発表。
 * そのあと指でぐるぐる自由に回して確かめられる。
 * ========================================================= */

const Circus = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  let round = null;      // {glyph, result, distractor}
  let phase = 'swing';   // swing(出題) → flip(宙返り) → reveal(結果) → free(自由回転)
  let rotation = 0;      // 文字の回転角
  let flipT = 0;
  let guess = null;
  let starCount = 0;
  let deck = [];
  let spinV = 0;         // 自由回転の角速度
  let dragging = false;
  let lastX = 0;
  let revealTimer = null;

  function enter() {
    deck = [...Tracks.circus].sort(() => Math.random() - 0.5);
    starCount = 0;
    document.getElementById('hud').innerHTML = `
      <div id="star-count">⭐ 0</div>
      <div id="ci-question" class="bl-banner">くるっとまわったら だれになる?</div>
      <div id="ci-options"></div>
      <div id="ci-freehint" class="bl-banner hidden">ゆびで まわしてみよう!</div>
      <button id="ci-next" class="big-next hidden">▶</button>`;
    document.getElementById('ci-next').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      nextRound();
    });
    nextRound(true);
    Sound.speak('Flip! Flip! Who will it be?');
  }

  function exit() { clearTimeout(revealTimer); }
  function onResize() {}

  function nextRound(first = false) {
    clearTimeout(revealTimer);
    if (!deck.length) deck = [...Tracks.circus].sort(() => Math.random() - 0.5);
    round = deck.shift();
    phase = 'swing';
    rotation = 0;
    flipT = 0;
    guess = null;
    spinV = 0;
    show('ci-question', true);
    show('ci-freehint', false);
    show('ci-next', false);
    buildOptions();
    if (!first) Sound.speak(round.glyph.toUpperCase() + '! Upside down... who will it be?');
  }

  function buildOptions() {
    const box = document.getElementById('ci-options');
    box.innerHTML = '';
    box.classList.remove('hidden');
    const opts = [round.result, round.distractor].sort(() => Math.random() - 0.5);
    for (const g of opts) {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = g;
      b.dataset.g = g;
      const up = g.toUpperCase();
      b.style.setProperty('--c', Tracks.letters[up] ? Tracks.letters[up].color : '#888');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        pickGuess(g, b);
      });
      box.appendChild(b);
    }
  }

  function pickGuess(g) {
    if (phase !== 'swing') return;
    guess = g;
    phase = 'flip';
    flipT = 0;
    Sound.fx.drumroll();
    Sound.fx.spin();
    show('ci-question', false);
  }

  function reveal() {
    phase = 'reveal';
    rotation = Math.PI; // ピッタリ180°で着地
    Sound.fx.cymbal();
    const correct = guess === round.result;
    // 正解カードを光らせる
    document.querySelectorAll('#ci-options .choice-btn').forEach(b => {
      b.classList.toggle('correct', b.dataset.g === round.result);
      b.classList.toggle('dim', b.dataset.g !== round.result);
    });
    const same = round.glyph === round.result;
    if (correct) {
      starCount++;
      const sc = document.getElementById('star-count');
      if (sc) sc.textContent = '⭐ ' + starCount;
      Sound.fx.tada();
      FX.confetti(innerWidth / 2, innerHeight * 0.3, 40);
      Sound.speak(same
        ? round.result.toUpperCase() + '! Still ' + round.result.toUpperCase() + '! Amazing!'
        : "It's " + round.result.toUpperCase() + ' now! Magic!');
    } else {
      Sound.fx.boing();
      Sound.speak('Look! It became ' + round.result.toUpperCase() + '!');
    }
    revealTimer = setTimeout(() => {
      phase = 'free';
      show('ci-options', false);
      show('ci-freehint', true);
      show('ci-next', true);
    }, 2200);
  }

  function show(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !on);
  }

  /* ---------------- 毎フレーム ---------------- */

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    if (phase === 'flip') {
      flipT += dts;
      const T = 1.4;
      const k = Math.min(1, flipT / T);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      rotation = ease * Math.PI * 3; // 1回転半 + 着地で180°
      if (flipT >= T) reveal();
    } else if (phase === 'free' && !dragging) {
      rotation += spinV * dts;
      spinV *= 0.97;
      if (Math.abs(spinV) < 0.35) {
        // 最寄りの180°にスナップ → 「いま何に見える?」が定まる
        const target = Math.round(rotation / Math.PI) * Math.PI;
        rotation += (target - rotation) * 0.12;
      }
    }
  }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // テント内 (放射ストライプ)
    ctx.fillStyle = '#8c2f39';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, -H * 0.2);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? '#a83a45' : '#8c2f39';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, H * 1.6, (i / 14) * Math.PI, ((i + 1) / 14) * Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // ステージ
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(0, H * 0.82, W, H);
    ctx.fillStyle = '#6e4835';
    ctx.fillRect(0, H * 0.82, W, 12);

    // スポットライト
    const cx = W / 2, cy = H * 0.44;
    const lg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(W, H) * 0.5);
    lg.addColorStop(0, 'rgba(255,245,200,0.5)');
    lg.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);

    // ブランコ (ゆらゆら)
    const sway = phase === 'swing' ? Math.sin(t / 700) * 0.12 : Math.sin(t / 900) * 0.04;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.rotate(sway);
    ctx.strokeStyle = '#d9b380';
    ctx.lineWidth = 5;
    const barY = H * 0.3;
    ctx.beginPath();
    ctx.moveTo(-70, 0); ctx.lineTo(-60, barY);
    ctx.moveTo(70, 0); ctx.lineTo(60, barY);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-64, barY); ctx.lineTo(64, barY); ctx.stroke();

    // 文字 (ブランコの下で回転)
    const s = Math.min(W, H) * 0.34;
    ctx.translate(0, barY + s * 0.62);
    ctx.rotate(rotation);
    ctx.font = `900 ${s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const up = round ? round.glyph.toUpperCase() : 'N';
    const color = Tracks.letters[up] ? Tracks.letters[up].color : '#fff';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = s * 0.14;
    if (round) ctx.strokeText(round.glyph, 0, 0);
    ctx.fillStyle = color;
    if (round) ctx.fillText(round.glyph, 0, 0);
    ctx.restore();

    // 宙返り中のキラキラ
    if (phase === 'flip' && Math.random() < 0.5) {
      FX.sparkle(cx + (Math.random() - 0.5) * s, H * 0.45 + (Math.random() - 0.5) * s);
    }

    FX.update();
    FX.draw(ctx);
  }

  /* ---------------- 入力 (自由回転) ---------------- */

  function onDown(x, y) {
    if (phase !== 'free') { FX.sparkle(x, y); return; }
    dragging = true;
    lastX = x;
  }
  function onMove(x) {
    if (!dragging) return;
    const dx = x - lastX;
    lastX = x;
    rotation += dx * 0.012;
    spinV = dx * 0.7;
  }
  function onUp() {
    if (dragging && Math.abs(spinV) > 2) Sound.fx.spin();
    dragging = false;
  }

  return {
    enter, exit, tick, draw, onResize, onDown, onMove, onUp,
    get state() { return { round, phase, guess, starCount, rotation }; },
    _pick: pickGuess, _next: nextRound,
  };
})();

window.Circus = Circus;
