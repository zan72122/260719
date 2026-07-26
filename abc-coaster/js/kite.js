/* =========================================================
 * kite.js — ミニゲーム「もじたこあげ」
 *
 * 左右対称の文字 (A H I M O T U V W X Y) はまっすぐ空へ。
 * 非対称の文字は重い側へ傾いてクルクル錯乱飛行!
 * → 🎀 リボンを軽い側に貼ってバランスを直すと飛べる。
 * 「どちら側が出っぱっているか」を見極める行為が
 * そのまま鏡映対称 (左右) の分析になる。
 * (さかさまサーカスの点対称と対をなすモード)
 * ========================================================= */

const Kite = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  /* imbalance: 左右の偏り (-1=左が重い, +1=右が重い, 0=対称)
   * wobble: 点対称組 (N S Z) は左右交互にゆらゆら */
  const AERO = {
    A: 0, H: 0, I: 0, M: 0, O: 0, T: 0, U: 0, V: 0, W: 0, X: 0, Y: 0,
    B: 0.5, D: 0.45, E: 0.5, F: 0.55, K: 0.45, L: 0.5, P: 0.5, R: 0.5,
    C: -0.5, G: -0.45, J: -0.5, Q: 0.35,
    N: 'wobble', S: 'wobble', Z: 'wobble',
  };

  let choice = [];       // 選択肢の3文字
  let ch = null;         // 飛ばしている文字
  let phase = 'pick';    // pick → fly → win
  let alt = 0;           // 高度 0..1
  let kx = 0;            // 横位置 (中央からのオフセット)
  let angle = 0, angV = 0;
  let bows = [];         // 貼ったリボン {ox,oy} (グリフ100-box座標, 50=中心)
  let dragBow = null;    // {x,y, fromTray|fromKite index}
  let stars = [];        // 空の星 {alt, fx, taken}
  let starCount = 0;
  let wobT = 0;
  let spinning = 0;      // 錯乱中の見た目回転
  let timers = [];
  let saidHint = false;
  let winT = 0;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function kiteSize() { return Math.min(innerWidth, innerHeight) * 0.3; }
  function kitePos() {
    return {
      x: innerWidth / 2 + kx,
      y: innerHeight * (0.62 - alt * 0.34) + Math.sin(performance.now() / 700) * 6,
    };
  }

  function effImbalance() {
    const a = AERO[ch];
    let imb = a === 'wobble' ? Math.sin(wobT * 2.2) * 0.42 : a;
    for (const b of bows) imb += (b.ox - 50) / 50 * 0.55;
    return imb;
  }

  /* ---------------- ラウンド ---------------- */

  function enter() {
    starCount = 0;
    document.getElementById('hud').innerHTML = `
      <div id="star-count">⭐ 0</div>
      <div id="kt-cards"></div>`;
    newChoice(true);
  }

  function exit() { timers.forEach(clearTimeout); timers = []; }
  function onResize() {}

  function newChoice(first = false) {
    timers.forEach(clearTimeout);
    timers = [];
    phase = 'pick';
    ch = null;
    const all = Object.keys(AERO);
    const sym = all.filter(c => AERO[c] === 0).sort(() => Math.random() - 0.5);
    const asym = all.filter(c => AERO[c] !== 0).sort(() => Math.random() - 0.5);
    choice = [sym[0], asym[0], asym[1]].sort(() => Math.random() - 0.5);
    const box = document.getElementById('kt-cards');
    box.classList.remove('hidden');
    box.innerHTML = '';
    for (const c of choice) {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = c;
      b.style.setProperty('--c', Tracks.letters[c].color);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); pick(c); });
      box.appendChild(b);
    }
    later(() => Sound.speak('Which kite will fly straight?'), first ? 900 : 500);
  }

  function pick(c) {
    if (phase !== 'pick') return;
    ch = c;
    phase = 'fly';
    alt = 0.05;
    kx = 0;
    angle = 0; angV = 0;
    bows = [];
    wobT = 0;
    spinning = 0;
    saidHint = false;
    winT = 0;
    stars = [0.3, 0.5, 0.7, 0.88].map(a => ({
      alt: a, fx: 0.2 + Math.random() * 0.6, taken: false,
    }));
    document.getElementById('kt-cards').classList.add('hidden');
    Sound.fx.whoosh();
    Sound.speak(c + '! Fly!');
  }

  /* ---------------- 毎フレーム ---------------- */

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    if (phase !== 'fly' && phase !== 'win') return;
    wobT += dts;

    if (phase === 'win') {
      winT += dts;
      alt = Math.min(1.15, alt + dts * 0.25);
      return;
    }

    const eff = effImbalance();
    const stable = Math.abs(eff) < 0.18;

    if (stable) {
      // 安定 → ぐんぐん上昇
      angV += (-angle * 6 - angV * 4) * dts;
      angle += angV * dts;
      spinning = Math.max(0, spinning - dts * 3);
      alt = Math.min(1, alt + dts * 0.075);
      if (alt >= 1) win();
    } else {
      // 不安定 → 重い側へ傾き、ひどいとクルクル
      const target = eff * 1.1;
      angle += (target - angle) * 2.2 * dts;
      if (Math.abs(eff) > 0.35) {
        spinning += eff * 5.5 * dts; // 錯乱飛行!
        alt = Math.max(0.08, alt - dts * 0.05);
        if (Math.random() < dts * 2) {
          const p = kitePos();
          FX.sparkle(p.x + (Math.random() - 0.5) * 80, p.y + (Math.random() - 0.5) * 80);
        }
        if (!saidHint && wobT > 2.5 && AERO[ch] !== 'wobble' && AERO[ch] !== 0) {
          saidHint = true;
          const side = AERO[ch] > 0 ? 'left' : 'right';
          Sound.speak('Wobbly! Put a ribbon on the ' + side + ' side!');
        }
      } else {
        spinning *= (1 - dts * 2);
        alt = Math.min(alt, Math.max(0.08, alt - dts * 0.01));
      }
    }

    // 星あつめ (横位置と高度が合ったら)
    const p = kitePos();
    for (const st of stars) {
      if (st.taken) continue;
      const sx = innerWidth * st.fx;
      const sy = innerHeight * (0.62 - st.alt * 0.34);
      if (Math.hypot(p.x - sx, p.y - sy) < kiteSize() * 0.55) {
        st.taken = true;
        starCount++;
        Sound.fx.star();
        FX.stars(sx, sy, 8);
        const sc = document.getElementById('star-count');
        if (sc) sc.textContent = '⭐ ' + starCount;
      }
    }
    kx *= (1 - dts * 0.4); // 手を離すと中央へ
  }

  function win() {
    phase = 'win';
    Sound.fx.tada();
    Sound.fx.floatUp();
    FX.confetti(innerWidth / 2, innerHeight * 0.2, 44);
    const sym = AERO[ch] === 0;
    later(() => Sound.speak(sym
      ? ch + '! Perfectly balanced! So high!'
      : ch + '! The ribbons fixed it! So high!'), 600);
    later(() => newChoice(), 3400);
  }

  /* ---------------- 入力 (リボンのドラッグ / 横スライド) ---------------- */

  function trayBows() {
    // トレイの残りリボン位置 (画面下)
    const n = 3 - bows.length - (dragBow ? 1 : 0);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: innerWidth / 2 + (i - (n - 1) / 2) * 74,
        y: innerHeight - 66 - (innerWidth > innerHeight ? 0 : 20),
      });
    }
    return out;
  }

  function onDown(x, y) {
    if (phase !== 'fly') { FX.sparkle(x, y); return; }
    // トレイのリボンをつかむ
    for (const tb of trayBows()) {
      if (Math.hypot(tb.x - x, tb.y - y) < 46) {
        dragBow = { x, y, from: 'tray' };
        Sound.fx.click();
        return;
      }
    }
    // 貼ったリボンをつかみ直す
    const p = kitePos(), s = kiteSize();
    for (let i = bows.length - 1; i >= 0; i--) {
      const bx = p.x + (bows[i].ox - 50) / 100 * s;
      const by = p.y + (bows[i].oy - 50) / 100 * s;
      if (Math.hypot(bx - x, by - y) < 40) {
        dragBow = { x, y, from: 'kite' };
        bows.splice(i, 1);
        Sound.fx.click();
        return;
      }
    }
    dragBow = null;
    kxTarget(x);
  }

  function onMove(x, y) {
    if (dragBow) {
      dragBow.x = x;
      dragBow.y = y;
    } else if (phase === 'fly') {
      kxTarget(x);
    }
  }

  function kxTarget(x) {
    kx = Math.max(-innerWidth * 0.35, Math.min(innerWidth * 0.35, (x - innerWidth / 2) * 0.9));
  }

  function onUp(x, y) {
    if (!dragBow) return;
    const p = kitePos(), s = kiteSize();
    const ox = (x - p.x) / s * 100 + 50;
    const oy = (y - p.y) / s * 100 + 50;
    if (ox > -20 && ox < 120 && oy > -20 && oy < 120 && bows.length < 3) {
      bows.push({ ox: Math.max(0, Math.min(100, ox)), oy: Math.max(0, Math.min(100, oy)) });
      Sound.fx.chime();
      FX.stars(x, y, 5);
      // 直った瞬間のごほうびボイス
      if (Math.abs(effImbalance()) < 0.18) {
        later(() => Sound.speak('Balanced!', { pitch: 1.3 }), 300);
      }
    } else {
      Sound.fx.pop(); // トレイへ戻る
    }
    dragBow = null;
  }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // 空 (高度で色が変わる)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const k = Math.min(1, alt);
    grad.addColorStop(0, `hsl(${205 + k * 25}, ${70 - k * 25}%, ${72 - k * 38}%)`);
    grad.addColorStop(1, '#bfe8f8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 雲 (高度が上がると下へ流れる)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      const cy = ((i * 0.23 + 0.1 + alt * 0.55) % 1.1) * H;
      const cx = W * ((i * 0.37 + t / 60000) % 1);
      const r = 24 + (i % 3) * 14;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 7);
      ctx.arc(cx + r * 0.8, cy + 4, r * 0.7, 0, 7);
      ctx.arc(cx - r * 0.8, cy + 5, r * 0.6, 0, 7);
      ctx.fill();
    }
    // ゴールの虹と太陽 (高高度で見えてくる)
    if (alt > 0.55 || phase === 'win') {
      const gy = H * (0.62 - 1.06 * 0.34) - (alt - 1) * H * 0.2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (alt - 0.55) * 3);
      ['#ff6b6b', '#ffd45c', '#7ed957', '#5cc9ff'].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(W / 2, gy - 40, 90 + i * 13, Math.PI * 0.1, Math.PI * 0.9, false);
        ctx.stroke();
      });
      ctx.font = '44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☀️', W * 0.82, gy - 60);
      ctx.restore();
    }
    // 地面と うさぎ (低高度のみ)
    if (alt < 0.5) {
      const gy = H * (0.88 + alt * 0.5);
      ctx.fillStyle = '#7ed957';
      ctx.fillRect(0, gy, W, H);
      ctx.font = '40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🐰', W / 2 - kx * 0.4, gy + 4);
    }

    if (phase === 'pick') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `900 ${Math.min(W, H) * 0.045}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('どのたこが まっすぐとぶ?', W / 2, H * 0.3);
    }

    if (ch) drawKite(ctx, t, W, H);

    // 空の星
    if (phase === 'fly') {
      for (const st of stars) {
        if (st.taken) continue;
        const sx = W * st.fx, sy = H * (0.62 - st.alt * 0.34);
        drawStar(ctx, sx, sy, 13 + Math.sin(t / 220 + st.alt * 9) * 2);
      }
      // リボントレイ
      for (const tb of trayBows()) {
        ctx.font = '44px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎀', tb.x, tb.y + Math.sin(t / 300 + tb.x) * 3);
      }
    }
    // ドラッグ中のリボン
    if (dragBow) {
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎀', dragBow.x, dragBow.y);
    }

    FX.update();
    FX.draw(ctx);
  }

  function drawKite(ctx, t, W, H) {
    const p = kitePos();
    const s = kiteSize();
    const rot = angle + spinning;

    // 糸 (うさぎ or 画面下から)
    ctx.strokeStyle = 'rgba(120,90,60,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const gy = alt < 0.5 ? H * (0.88 + alt * 0.5) : H + 60;
    ctx.moveTo(W / 2 - kx * 0.4, gy);
    ctx.quadraticCurveTo(p.x - 30, (p.y + gy) / 2 + 40, p.x, p.y + s * 0.45);
    ctx.stroke();

    ctx.save();
    ctx.translate(p.x, p.y);

    // 対称の軸 (うすい中心線) — 左右を見比べる手がかり
    if (phase === 'fly' && Math.abs(effImbalance()) >= 0.18) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.62);
      ctx.lineTo(0, s * 0.62);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.rotate(rot);

    // 骨組み
    ctx.strokeStyle = 'rgba(140,100,60,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.42); ctx.lineTo(s * 0.42, s * 0.42);
    ctx.moveTo(s * 0.42, -s * 0.42); ctx.lineTo(-s * 0.42, s * 0.42);
    ctx.stroke();

    // 文字の凧
    ctx.font = `900 ${s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = s * 0.14;
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = Tracks.letters[ch].color;
    ctx.fillText(ch, 0, 0);

    // 貼ったリボン
    ctx.font = `${s * 0.24}px sans-serif`;
    for (const b of bows) {
      ctx.fillText('🎀', (b.ox - 50) / 100 * s, (b.oy - 50) / 100 * s);
    }

    // しっぽリボン (下の糸)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.quadraticCurveTo(Math.sin(t / 250) * 20, s * 0.72, Math.sin(t / 200) * 30, s * 0.9);
    ctx.stroke();
    ctx.font = `${s * 0.14}px sans-serif`;
    ctx.fillText('🎀', Math.sin(t / 230) * 24, s * 0.78);

    ctx.restore();
  }

  function drawStar(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffd45c';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  return {
    enter, exit, tick, draw, onResize, onDown, onMove, onUp,
    get state() {
      return { ch, phase, alt, bows: bows.length, starCount, eff: ch ? effImbalance() : 0 };
    },
    _pick: pick,
    _addBow(ox, oy) { bows.push({ ox, oy }); },
    _aero: AERO,
  };
})();

window.Kite = Kite;
