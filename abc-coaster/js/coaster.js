/* =========================================================
 * coaster.js — メインゲーム「ABCコースター」
 *
 * 文字の一筆書きの線が、そのままコースターのレールになる。
 *  - O は宙返りループ / W は二段谷 / Z は逆走ヘアピン
 *  - H は2本の塔のスイッチバック / G は行き止まりで跳ね返る
 *  - J はフックから空へ発射!
 * 駅に着くたびに子どもが次の文字を選び、
 * 「この形はどんな動きになる?」と予測しながらコースを延ばす。
 * ========================================================= */

const Coaster = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  // ワールド状態
  let pts = [];        // レール点列 {x,y,color,air}  (air: J ジャンプ区間)
  let cum = [];        // 累積距離
  let ties = [];       // 枕木 {x,y,nx,ny,color}
  let letters = [];    // 走った/設置した文字 {ch,color,bx,by,sStart,sEnd,flash,struts,ride}
  let stars = [];      // {s,x,y,taken}
  let bumps = [];      // 折り返し点 {s,x,y,hit}
  let cart = { s: 0, v: 0, spin: 0 };
  let cursorX = 0;
  let letterPx = 300, S = 3, groundY = 340;
  let choosing = false;
  let ridden = [];     // 選んだ文字の履歴
  let starCount = 0;
  let camX = 0, camY = 0;
  let prevSlope = 0;
  let sndT = { clank: 0, wheee: 0 };
  let clouds = [];
  let segIdx = 0;      // posAt 用キャッシュ

  /* ---------------- トラック構築 ---------------- */

  function totalLen() { return cum.length ? cum[cum.length - 1] : 0; }

  function pushPt(x, y, color, air) {
    const n = pts.length;
    if (n > 0) {
      const p = pts[n - 1];
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 0.9) return; // 重複点は捨てる
      cum.push(cum[n - 1] + d);
    } else {
      cum.push(0);
    }
    pts.push({ x, y, color, air: !!air });
  }

  // なめらかな接続カーブ (前の出口の向き → 次の入口の向き)
  function connector(p0, t0, p1, t1, color, air) {
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const k = Math.min(150, Math.max(45, d * 0.42));
    const c0 = { x: p0.x + t0.x * k, y: p0.y + t0.y * k };
    const c1 = { x: p1.x - t1.x * k, y: p1.y - t1.y * k };
    const n = Math.max(10, Math.floor(d / 22));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x;
      const y = u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y;
      pushPt(x, y, color, air);
    }
  }

  function dirOf(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  }

  function appendLetter(ch) {
    const info = Tracks.letters[ch];
    const bx = cursorX, by = 0;
    const world = info.ride.map(([x, y]) => ({ x: bx + x * S, y: by + y * S }));

    const sBefore = totalLen();
    if (pts.length >= 2) {
      const pPrev = pts[pts.length - 1];
      const tPrev = dirOf(pts[pts.length - 2], pPrev);
      const tIn = dirOf(world[0], world[1]);
      const prevLetter = letters[letters.length - 1];
      const air = prevLetter && Tracks.letters[prevLetter.ch].launch;
      connector(pPrev, tPrev, world[0], tIn, '#9aa7b8', air);
    }

    const sStart = totalLen();
    for (const p of world) pushPt(p.x, p.y, info.color);
    const sEnd = totalLen();

    // 折り返し点 (Gのバンパー・Hの塔のてっぺん) を検出
    for (let i = Math.max(1, ptsIndexAt(sStart)); i < pts.length - 1; i++) {
      const a = dirOf(pts[i - 1], pts[i]);
      const b = dirOf(pts[i], pts[i + 1]);
      if (a.x * b.x + a.y * b.y < -0.9) {
        bumps.push({ s: cum[i], x: pts[i].x, y: pts[i].y, hit: false });
      }
    }

    // 星を3つ配置
    for (const f of [0.3, 0.55, 0.82]) {
      const s = sStart + (sEnd - sStart) * f;
      const p = posAtRaw(s);
      stars.push({ s, x: p.x - p.ny * 26, y: p.y - p.nyv * 26, taken: false });
    }

    letters.push({
      ch, color: info.color, bx, by, sStart, sEnd, flash: 0,
      struts: (info.struts || []).map(seg => seg.map(([x, y]) => ({ x: bx + x * S, y: by + y * S }))),
      ride: world,
      bumper: info.bumper ? { x: bx + info.bumper[0] * S, y: by + info.bumper[1] * S } : null,
    });
    ridden.push(ch);
    cursorX += 100 * S + 70;
    updateHud();
  }

  function ptsIndexAt(s) {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function posAtRaw(s) {
    s = Math.max(0, Math.min(totalLen(), s));
    while (segIdx < cum.length - 2 && cum[segIdx + 1] < s) segIdx++;
    while (segIdx > 0 && cum[segIdx] > s) segIdx--;
    const i = segIdx;
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    const segLen = cum[i + 1] - cum[i] || 1;
    const t = (s - cum[i]) / segLen;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    return { x, y, dx, dy, ny: -dy, nyv: dx, angle: Math.atan2(dy, dx), air: a.air, slope: dy };
  }

  /* ---------------- モードライフサイクル ---------------- */

  function enter() {
    pts = []; cum = []; ties = []; letters = []; stars = []; bumps = [];
    ridden = []; starCount = 0; choosing = false; segIdx = 0;
    cart = { s: 0, v: 0, spin: 0 };
    layout();

    // 出発駅: 平らなホーム
    const y0 = 50 * S;
    pushPt(-320, y0, '#9aa7b8');
    pushPt(-40, y0, '#9aa7b8');
    cursorX = 40;

    document.getElementById('hud').innerHTML = `
      <div id="ride-history"></div>
      <div id="star-count">⭐ 0</div>
      <div id="choice" class="hidden">
        <div id="choice-label">つぎは どのもじ?</div>
        <div id="choice-btns"></div>
      </div>`;
    updateHud();
    setTimeout(() => openChoice(), 600);
    Sound.speak("All aboard! Let's ride the letters!");
  }

  function layout() {
    letterPx = Math.max(230, Math.min(400, Math.min(innerWidth, innerHeight) * 0.62));
    S = letterPx / 100;
    groundY = 100 * S + 40;
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.4, r: 26 + Math.random() * 40, v: 0.12 + Math.random() * 0.2 });
    }
  }

  function exit() {
    speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
  }

  function onResize() { layout(); } // 既設トラックは旧スケールのまま (走行に支障なし)

  /* ---------------- 文字えらび (駅) ---------------- */

  function pickChoices() {
    const all = Tracks.ALPHABET;
    const unseen = all.filter(c => !ridden.includes(c));
    const pool = [...unseen.sort(() => Math.random() - 0.5), ...all.filter(c => ridden.includes(c)).sort(() => Math.random() - 0.5)];
    return pool.slice(0, 3).sort(() => Math.random() - 0.5);
  }

  function openChoice() {
    choosing = true;
    const el = document.getElementById('choice');
    const btns = document.getElementById('choice-btns');
    if (!el) return;
    btns.innerHTML = '';
    for (const ch of pickChoices()) {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = ch;
      b.style.setProperty('--c', Tracks.letters[ch].color);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        choose(ch);
      });
      btns.appendChild(b);
    }
    el.classList.remove('hidden');
  }

  function choose(ch) {
    if (!choosing) return;
    choosing = false;
    document.getElementById('choice').classList.add('hidden');
    appendLetter(ch);
    Sound.fx.depart();
    Sound.speak(ch + '!', { rate: 0.9 });
    cart.v = 330;
    // 5文字ごとにお祝い
    if (ridden.length % 5 === 0) {
      setTimeout(() => {
        Sound.fx.tada();
        Sound.fx.firework();
        FX.confetti(innerWidth / 2, innerHeight * 0.3, 50);
        FX.firework(innerWidth * 0.3, innerHeight * 0.3);
        FX.firework(innerWidth * 0.7, innerHeight * 0.25);
      }, 800);
    }
  }

  function updateHud() {
    const h = document.getElementById('ride-history');
    if (h) {
      h.innerHTML = ridden.slice(-12).map(c =>
        `<span style="color:${Tracks.letters[c].color}">${c}</span>`).join('');
    }
    const sc = document.getElementById('star-count');
    if (sc) sc.textContent = '⭐ ' + starCount;
  }

  /* ---------------- 毎フレーム ---------------- */

  const VMIN = 150, VMAX = 950, G = 1150;

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    const p = posAtRaw(cart.s);

    if (!choosing) {
      // 坂で加速/減速 (y は下向きが正 → 下りで加速)
      cart.v += G * p.slope * dts;
      cart.v *= (1 - 0.06 * dts);
      // 登り坂はチェーンリフトが押してくれる (止まらない)
      cart.v = Math.max(VMIN, Math.min(VMAX, cart.v));

      // 駅が近づいたら減速して停車
      const remain = totalLen() - 45 - cart.s;
      if (remain < 320) cart.v = Math.min(cart.v, Math.max(90, remain * 2.4));
      cart.s += cart.v * dts;

      if (cart.s >= totalLen() - 46) {
        cart.s = totalLen() - 46;
        cart.v = 0;
        openChoice();
      }

      // --- 音の演出 ---
      const now = performance.now();
      if (p.slope < -0.35 && cart.v < VMIN * 1.4 && now - sndT.clank > 230) {
        sndT.clank = now; Sound.fx.clank(); // ガタン、ガタン…
      }
      if (prevSlope < -0.3 && p.slope > 0.3) Sound.fx.drop(); // 頂上を越えた!
      if (p.slope > 0.5 && cart.v > 560 && now - sndT.wheee > 2600) {
        sndT.wheee = now; Sound.fx.wheee();
      }
      prevSlope = p.slope;

      // ジャンプ区間はきりもみ回転
      if (p.air) {
        cart.spin += dts * 9;
        if (Math.random() < 0.3) FX.sparkle(p.x - camX, p.y - camY);
      } else {
        cart.spin *= 0.8;
      }

      // 文字に入った瞬間に名前を言う + 光る
      for (const L of letters) {
        if (!L.announced && cart.s >= L.sStart + 4) {
          L.announced = true;
          L.flash = 1;
          Sound.speak(L.ch + '!', { rate: 0.95 });
        }
        if (L.flash > 0) L.flash -= dts * 0.7;
      }

      // バンパー / 折り返し
      for (const b of bumps) {
        if (!b.hit && cart.s >= b.s - 4) {
          b.hit = true;
          Sound.fx.bump();
          FX.burst(b.x - camX, b.y - camY, '#ffd45c', 10);
        }
      }

      // 星あつめ
      for (const st of stars) {
        if (!st.taken && Math.abs(cart.s - st.s) < 28) {
          st.taken = true;
          starCount++;
          Sound.fx.star();
          FX.stars(st.x - camX, st.y - camY, 6);
          updateHud();
        }
      }

      // 速いときの風パーティクル
      if (cart.v > 650 && Math.random() < 0.5) {
        FX.sparkle(p.x - camX - 20, p.y - camY + (Math.random() - 0.5) * 30);
      }
    }

    // カメラ
    const targX = p.x - innerWidth * 0.38;
    const worldTop = -130, worldBottom = groundY + 160;
    let targY = p.y - innerHeight * 0.5;
    const minY = worldTop, maxY = Math.max(worldTop, worldBottom - innerHeight);
    targY = Math.max(minY, Math.min(maxY, targY));
    if (worldBottom - worldTop < innerHeight) targY = worldTop - (innerHeight - (worldBottom - worldTop)) / 2;
    camX += (targX - camX) * 0.08;
    camY += (targY - camY) * 0.08;
  }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // 空
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#8ed8f8');
    grad.addColorStop(1, '#e7f6ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 太陽
    ctx.fillStyle = 'rgba(255,216,77,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.86, H * 0.1, 34, 0, Math.PI * 2); ctx.fill();
    // 雲 (ゆっくり流れる)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of clouds) {
      c.x -= c.v;
      if (c.x + c.r * 2 < 0) c.x = W + c.r * 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.arc(c.x + c.r * 0.8, c.y + c.r * 0.2, c.r * 0.7, 0, Math.PI * 2);
      ctx.arc(c.x - c.r * 0.8, c.y + c.r * 0.25, c.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    // 遠くの丘 (パララックス)
    ctx.save();
    ctx.translate(camX * 0.55, 0);
    ctx.fillStyle = '#bfe8a8';
    ctx.beginPath();
    for (let x = -200; x <= W + 200; x += 30) {
      const wx = x;
      const y = groundY - 24 - Math.sin((x + camX * 0.45) / 130) * 26;
      if (x === -200) ctx.moveTo(wx, y); else ctx.lineTo(wx, y);
    }
    ctx.lineTo(W + 200, groundY + 400);
    ctx.lineTo(-200, groundY + 400);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 地面
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(camX - 100, groundY, W + 200, H);
    ctx.fillStyle = '#65c247';
    ctx.fillRect(camX - 100, groundY + 14, W + 200, H);

    const viewL = camX - 150, viewR = camX + W + 150;

    // ゴースト文字 (レールの下に、太い半透明ストロークで文字の形を敷く)
    for (const L of letters) {
      if (L.bx + 100 * S < viewL || L.bx > viewR) continue;
      const alpha = 0.13 + Math.max(0, L.flash) * 0.3;
      ctx.strokeStyle = L.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = letterPx * 0.24;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolyline(ctx, L.ride);
      for (const seg of L.struts) strokePolyline(ctx, seg);
      ctx.globalAlpha = 1;
    }

    // 鉄骨 (走らない画数)
    for (const L of letters) {
      if (L.bx + 100 * S < viewL || L.bx > viewR) continue;
      ctx.strokeStyle = shade(L.color, -18);
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      for (const seg of L.struts) strokePolyline(ctx, seg);
    }

    // レール
    drawRail(ctx, viewL, viewR);

    // Gのバンパー
    for (const L of letters) {
      if (!L.bumper) continue;
      ctx.fillStyle = '#e5533d';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(L.bumper.x - 14, L.bumper.y, 11, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // 星
    for (const st of stars) {
      if (st.taken || st.x < viewL || st.x > viewR) continue;
      drawStar(ctx, st.x, st.y, 12 + Math.sin(t / 200 + st.s) * 2);
    }

    // 駅 (トラック終端)
    drawStation(ctx);

    // カート
    drawCart(ctx, t);

    ctx.restore();

    FX.update();
    FX.draw(ctx);
  }

  function strokePolyline(ctx, seg) {
    ctx.beginPath();
    ctx.moveTo(seg[0].x, seg[0].y);
    for (const p of seg) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function drawRail(ctx, viewL, viewR) {
    ctx.lineCap = 'round';
    // 枕木
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((a.x < viewL && b.x < viewL) || (a.x > viewR && b.x > viewR)) continue;
      if (a.air) continue;
      const len = cum[i] - cum[i - 1];
      const d = dirOf(a, b);
      const n = { x: -d.y, y: d.x };
      for (let s = 0; s < len; s += 26) {
        const x = a.x + d.x * s, y = a.y + d.y * s;
        ctx.strokeStyle = 'rgba(90,70,60,0.55)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x - n.x * 10, y - n.y * 10);
        ctx.lineTo(x + n.x * 10, y + n.y * 10);
        ctx.stroke();
      }
    }
    // レール本体 (文字ごとの色)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((a.x < viewL && b.x < viewL) || (a.x > viewR && b.x > viewR)) continue;
      if (a.air) {
        // ジャンプ区間: 点線のキラキラ
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([3, 14]);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      ctx.strokeStyle = '#5b4a42';
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawStation(ctx) {
    if (pts.length < 2) return;
    const end = pts[pts.length - 1];
    // ホーム
    ctx.fillStyle = '#c9b291';
    ctx.fillRect(end.x - 8, end.y + 8, 120, 12);
    // 旗つきポール
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(end.x + 60, end.y + 8); ctx.lineTo(end.x + 60, end.y - 60); ctx.stroke();
    ctx.fillStyle = '#e5533d';
    ctx.beginPath();
    ctx.moveTo(end.x + 60, end.y - 60);
    ctx.lineTo(end.x + 100, end.y - 48);
    ctx.lineTo(end.x + 60, end.y - 36);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `900 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('?', end.x + 74, end.y - 41);
  }

  function drawCart(ctx, t) {
    const p = posAtRaw(cart.s);
    ctx.save();
    ctx.translate(p.x, p.y - 10);
    ctx.rotate(p.angle + cart.spin);
    // 車体
    ctx.fillStyle = '#e5533d';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    roundRect(ctx, -28, -16, 56, 24, 8);
    ctx.fill(); ctx.stroke();
    // 車輪
    ctx.fillStyle = '#40342e';
    for (const wx of [-16, 16]) {
      ctx.beginPath();
      ctx.arc(wx, 10, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 乗客のうさぎ (速いほど耳が後ろへ)
    const lean = Math.min(20, cart.v * 0.02);
    ctx.font = '34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(0, -26 + Math.sin(t / 90) * (cart.v > 500 ? 3 : 1));
    ctx.rotate(-lean * 0.012);
    ctx.fillText('🐰', 0, 0);
    ctx.restore();
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

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(color, amt) {
    const m = /hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/.exec(color);
    if (!m) return color;
    return `hsl(${m[1]}, ${m[2]}%, ${Math.max(0, Math.min(100, parseFloat(m[3]) + amt))}%)`;
  }

  /* ---------------- 入力 ---------------- */

  // 画面タップ → キラキラ (走行は自動なので操作いらず)
  function onDown(x, y) {
    FX.sparkle(x, y);
    // カートをタップしたらうさぎが「Wheee!」
    const p = posAtRaw(cart.s);
    if (Math.hypot(p.x - camX - x, p.y - camY - y) < 70) {
      Sound.fx.wheee();
      FX.stars(x, y, 6);
    }
  }

  return {
    enter, exit, tick, draw, onResize, onDown,
    onMove() {}, onUp() {},
    get state() { return { ridden, starCount, choosing, cart, lettersCount: letters.length, totalLen: totalLen() }; },
    _choose: choose,
  };
})();

window.Coaster = Coaster;
