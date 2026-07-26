/* =========================================================
 * musicbox.js — ミニゲーム「もじオルゴール」
 *
 * 文字の一筆書きの「高さの起伏」が、そのままメロディになる。
 *  - E は横棒3本 → 高・中・低の3音「ポロロン」
 *  - F は2本 → 2音 (E より1音足りない! が耳で分かる)
 *  - M は山4つ → 速い連打 / O はまるいグリッサンド
 * 音が鳴っている間、光る玉が文字の線の上を走るので
 * 「メロディ = 形」が目で見える。並べて自分の曲を作ろう。
 * 音階はペンタトニックなので、どう並べても心地よい。
 * ========================================================= */

const MusicBox = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  // ペンタトニック (C D E G A × 2オクターブ) — 何を並べても不協和音にならない
  const SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];
  const LETTER_DUR = 1.15; // 1文字の演奏時間 (秒)
  const SLOTS = 6;

  let slots = [];        // 並べた文字
  let playing = false;
  let looping = false;
  let playSlot = -1;     // いま鳴っているスロット
  let playT = 0;         // その文字の再生位置 (秒)
  let display = null;    // 大きく表示中の文字 {ch, events, path, cum, total}
  let playTimer = null;
  let crank = 0;

  /* ---------------- 形 → メロディ ---------------- */

  // 一筆書きを等間隔にサンプルし、y (高さ) を音階に量子化。
  // 同じ音が続く区間は1つの長い音にまとめる。
  // → 横棒 = のばす音 / 縦・斜め = 駆け上がり / 円 = ころころ音階
  const jingleCache = {};

  function pathOf(ch) {
    const ride = Tracks.letters[ch].ride;
    const pts = ride.map(([x, y]) => ({ x, y }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }

  function pointAt(path, s) {
    s = Math.max(0, Math.min(path.total, s));
    let i = 0;
    while (i < path.cum.length - 2 && path.cum[i + 1] < s) i++;
    const seg = path.cum[i + 1] - path.cum[i] || 1;
    const t = (s - path.cum[i]) / seg;
    return {
      x: path.pts[i].x + (path.pts[i + 1].x - path.pts[i].x) * t,
      y: path.pts[i].y + (path.pts[i + 1].y - path.pts[i].y) * t,
    };
  }

  function pitchOf(y) {
    const pi = Math.round((1 - y / 100) * (SCALE.length - 1));
    return Math.max(0, Math.min(SCALE.length - 1, pi));
  }

  function jingleOf(ch) {
    if (jingleCache[ch]) return jingleCache[ch];
    const path = pathOf(ch);
    // 一筆書きの線分を「水平 = のばす音」「上り/下り = グリッサンド」に分類し、
    // 同じ向きが続く区間は1つにまとめる。
    // → E は「音・すべり・音」の3つ、F は2つ、I は1つ、M は4つ!
    const events = [];
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.5) continue;
      const dy = b.y - a.y;
      // 傾きで分類 (短い弧の線分でも正しく判定できるよう絶対値でなく勾配)
      const type = Math.abs(dy) / len < 0.3 ? 'note' : (dy > 0 ? 'down' : 'up');
      const last = events[events.length - 1];
      if (last && last.type === type &&
          (type !== 'note' || pitchOf(a.y) === last.toPitch)) {
        last.len += len;
        last.y1 = b.y;
        last.toPitch = pitchOf(b.y);
      } else {
        events.push({ type, y0: a.y, y1: b.y, len, toPitch: pitchOf(b.y) });
      }
    }
    // 演奏時間を線の長さで配分
    let acc = 0;
    for (const ev of events) {
      ev.kind = ev.type === 'note' ? 'note' : 'slide';
      ev.from = pitchOf(ev.y0);
      ev.to = pitchOf(ev.y1);
      ev.t = acc / path.total * LETTER_DUR;
      ev.dur = Math.max(0.14, ev.len / path.total * LETTER_DUR);
      acc += ev.len;
    }
    jingleCache[ch] = { events, path };
    return jingleCache[ch];
  }

  function playJingle(ch) {
    const { events } = jingleOf(ch);
    for (const ev of events) {
      if (ev.kind === 'note') Sound.fx.note(SCALE[ev.from], ev.dur, ev.t);
      else Sound.fx.slide(SCALE[ev.from], SCALE[ev.to], ev.dur, ev.t);
    }
  }

  /* ---------------- UI ---------------- */

  function enter() {
    slots = [];
    playing = false;
    looping = false;
    playSlot = -1;
    display = null;
    document.getElementById('hud').innerHTML = `
      <div id="mb-slots"></div>
      <div id="mb-controls">
        <button class="mb-btn" id="mb-play">▶</button>
        <button class="mb-btn" id="mb-loop">🔁</button>
        <button class="mb-btn" id="mb-dice">🎲</button>
        <button class="mb-btn" id="mb-clear">🧹</button>
      </div>
      <div id="mb-tray"></div>`;
    const tray = document.getElementById('mb-tray');
    for (const ch of Tracks.ALPHABET) {
      const b = document.createElement('button');
      b.className = 'letter-btn';
      b.textContent = ch;
      b.style.setProperty('--c', Tracks.letters[ch].color);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        tapLetter(ch);
      });
      tray.appendChild(b);
    }
    document.getElementById('mb-play').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      playing ? stop() : play();
    });
    document.getElementById('mb-loop').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      looping = !looping;
      document.getElementById('mb-loop').classList.toggle('on', looping);
      Sound.fx.click();
    });
    document.getElementById('mb-dice').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      stop();
      slots = [];
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        slots.push(Tracks.ALPHABET[Math.floor(Math.random() * 26)]);
      }
      renderSlots();
      Sound.fx.chime();
      setTimeout(() => play(), 400);
    });
    document.getElementById('mb-clear').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      stop();
      slots = [];
      renderSlots();
      Sound.fx.whoosh();
    });
    renderSlots();
    setTimeout(() => Sound.speak('Tap a letter... and hear its shape!'), 800);
  }

  function exit() { stop(); }
  function onResize() {}

  function tapLetter(ch) {
    stop();
    if (slots.length < SLOTS) {
      slots.push(ch);
      renderSlots();
    }
    showAndPlay(ch, -1);
  }

  function showAndPlay(ch, slotIdx) {
    display = { ch, ...jingleOf(ch), t0: performance.now() };
    playSlot = slotIdx;
    playT = 0;
    playJingle(ch);
    Sound.speak(ch, { rate: 1.0, interrupt: true });
  }

  function renderSlots() {
    const box = document.getElementById('mb-slots');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 0; i < SLOTS; i++) {
      const d = document.createElement('button');
      d.className = 'mb-slot' + (slots[i] ? ' filled' : '') + (i === playSlot ? ' now' : '');
      d.textContent = slots[i] || '';
      if (slots[i]) {
        d.style.setProperty('--c', Tracks.letters[slots[i]].color);
        const idx = i;
        d.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (playing) return;
          slots.splice(idx, 1); // タップで取り出す
          Sound.fx.pop();
          renderSlots();
        });
      }
      box.appendChild(d);
    }
  }

  /* ---------------- 再生 ---------------- */

  function play() {
    if (!slots.length) { Sound.fx.wrong(); return; }
    playing = true;
    document.getElementById('mb-play').textContent = '⏸';
    let i = 0;
    const step = () => {
      if (!playing) return;
      if (i >= slots.length) {
        if (looping) { i = 0; }
        else { stop(); Sound.fx.chime(); return; }
      }
      showAndPlay(slots[i], i);
      renderSlots();
      i++;
      playTimer = setTimeout(step, LETTER_DUR * 1000 + 130);
    };
    step();
  }

  function stop() {
    playing = false;
    playSlot = -1;
    clearTimeout(playTimer);
    const btn = document.getElementById('mb-play');
    if (btn) btn.textContent = '▶';
    renderSlots();
  }

  /* ---------------- 描画 ---------------- */

  function tick(dt) {
    crank += (playing || display) ? dt / 1000 * 3 : 0;
    if (display && performance.now() - display.t0 > LETTER_DUR * 1000 + 600 && !playing) {
      display = null;
    }
  }

  function draw(ctx, W, H) {
    const t = performance.now();
    // あたたかい部屋
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#4a3a5e');
    grad.addColorStop(1, '#6e5a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 星あかり
    for (let i = 0; i < 20; i++) {
      const sx = ((i * 89) % 100) / 100 * W, sy = ((i * 47) % 35) / 100 * H;
      ctx.fillStyle = `rgba(255,240,200,${0.3 + Math.abs(Math.sin(t / 800 + i)) * 0.4})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + (i % 3), 0, 7);
      ctx.fill();
    }

    // オルゴールの箱 + クランク
    const boxW = Math.min(W * 0.6, 340);
    const bx = W / 2, by = H * 0.42;
    const dispR = Math.min(W, H) * 0.19;
    ctx.fillStyle = '#8a5a2b';
    rr(ctx, bx - boxW / 2, by + dispR * 1.1, boxW, 26, 10);
    ctx.fill();
    ctx.fillStyle = '#a8743e';
    rr(ctx, bx - boxW / 2 + 8, by + dispR * 1.1 + 5, boxW - 16, 10, 5);
    ctx.fill();
    // クランク (回る取っ手)
    ctx.save();
    ctx.translate(bx + boxW / 2 + 18, by + dispR * 1.1 + 13);
    ctx.strokeStyle = '#d9b380';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(crank) * 22, Math.sin(crank) * 22);
    ctx.stroke();
    ctx.fillStyle = '#e5533d';
    ctx.beginPath();
    ctx.arc(Math.cos(crank) * 22, Math.sin(crank) * 22, 7, 0, 7);
    ctx.fill();
    ctx.restore();

    // おどるうさぎ
    const hop = (playing || display) ? Math.abs(Math.sin(t / 180)) * 14 : 0;
    ctx.font = `${dispR * 0.36}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🐰', bx - boxW / 2 - 40, by + dispR * 1.1 + 6 - hop);

    // 表示中の文字と、線の上を走る光る玉
    if (display) {
      const s = dispR * 2;
      const elapsed = (performance.now() - display.t0) / 1000;
      ctx.save();
      ctx.translate(bx, by);
      // 文字 (うすく)
      ctx.font = `900 ${s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = s * 0.13;
      ctx.strokeText(display.ch, 0, 0);
      ctx.fillStyle = Tracks.letters[display.ch].color;
      ctx.globalAlpha = 0.9;
      ctx.fillText(display.ch, 0, 0);
      ctx.globalAlpha = 1;

      // 一筆書きの線 (これがメロディの正体)
      const path = display.path;
      const k = s / 100;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      path.pts.forEach((p, i) => {
        const px = (p.x - 50) * k, py = (p.y - 50) * k;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();

      // 光る玉が演奏に合わせて線上を走る
      const frac = Math.max(0, Math.min(1, elapsed / LETTER_DUR));
      const dp = pointAt(path, path.total * frac);
      const gx = (dp.x - 50) * k, gy = (dp.y - 50) * k;
      const glow = ctx.createRadialGradient(gx, gy, 2, gx, gy, 22);
      glow.addColorStop(0, 'rgba(255,255,180,1)');
      glow.addColorStop(1, 'rgba(255,255,180,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(gx, gy, 22, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx, gy, 7, 0, 7);
      ctx.fill();
      ctx.restore();

      // 音符が飛ぶ
      if (elapsed < LETTER_DUR && Math.random() < 0.15) {
        FX.emojiPop(bx + gx, by + gy - 20, ['🎵', '🎶'][Math.floor(Math.random() * 2)], 1);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `900 ${Math.min(W, H) * 0.04}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('もじを タップしてみて!', bx, by);
    }

    FX.update();
    FX.draw(ctx);
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function onDown(x, y) { FX.sparkle(x, y); }

  return {
    enter, exit, tick, draw, onResize, onDown,
    onMove() {}, onUp() {},
    get state() { return { slots: [...slots], playing, playSlot, display: display && display.ch }; },
    _jingleOf: jingleOf,
    _tap: tapLetter,
    _play: play,
  };
})();

window.MusicBox = MusicBox;
