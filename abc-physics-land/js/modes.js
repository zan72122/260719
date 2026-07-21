/* =========================================================
 * modes.js — 3つの遊びモード
 *  1. Playground もじあそび : 文字を降らせて触って遊ぶ物理砂場
 *  2. Words     ことばパズル: 文字をドラッグして単語を完成
 *  3. Catch     もじキャッチ: 「Find B!」耳で聞いて文字を探す
 * ========================================================= */

const Modes = (() => {
  const { ALPHABET, LETTERS, WORDS } = window.GameData;
  const hud = () => document.getElementById('hud');

  function letterSize() {
    // 画面サイズに応じた文字の大きさ (縦横どちらでも快適に)
    return Math.max(72, Math.min(130, Math.min(innerWidth, innerHeight) * 0.16));
  }

  /* =====================================================
   * 1. もじあそび (Playground)
   * ===================================================== */
  const playground = {
    id: 'playground',
    moonMode: false,
    lower: false,

    enter() {
      this.moonMode = false;
      this.lower = false;
      this.buildTray();
      this.layout();
      Sound.speak("Let's play with letters!");
    },

    layout() {
      const tray = document.getElementById('tray');
      const trayH = tray ? tray.offsetHeight : 120;
      Phys.setBounds(innerWidth, innerHeight, { floorOffset: trayH + 8 });
    },

    buildTray() {
      const h = hud();
      h.innerHTML = `
        <div id="tray">
          <div id="tray-letters"></div>
          <div id="tray-tools">
            <button class="tool-btn" id="btn-case" title="大文字/小文字">Aa</button>
            <button class="tool-btn" id="btn-moon" title="月モード">🌙</button>
            <button class="tool-btn" id="btn-clear" title="おそうじ">🧹</button>
          </div>
        </div>`;
      const tl = document.getElementById('tray-letters');
      ALPHABET.forEach(ch => {
        const b = document.createElement('button');
        b.className = 'letter-btn';
        b.style.setProperty('--c', LETTERS[ch].color);
        b.textContent = ch;
        b.dataset.ch = ch;
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.dropLetter(ch);
          b.classList.remove('pressed');
          void b.offsetWidth;
          b.classList.add('pressed');
        });
        tl.appendChild(b);
      });
      document.getElementById('btn-case').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.lower = !this.lower;
        document.getElementById('btn-case').textContent = this.lower ? 'a' : 'A';
        document.querySelectorAll('.letter-btn').forEach(b => {
          b.textContent = this.lower ? b.dataset.ch.toLowerCase() : b.dataset.ch;
        });
        Sound.fx.click();
        Sound.speak(this.lower ? 'small letters!' : 'BIG letters!');
      });
      document.getElementById('btn-moon').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.moonMode = !this.moonMode;
        document.getElementById('btn-moon').textContent = this.moonMode ? '☀️' : '🌙';
        Phys.engine.gravity.y = this.moonMode ? 0.14 : 1;
        Sound.fx.chime();
        Sound.speak(this.moonMode ? 'Moon jump!' : 'Back to Earth!');
        // ふわっと浮かせる
        if (this.moonMode) {
          for (const b of Phys.letters) {
            Matter.Body.setVelocity(b, { x: (Math.random() - 0.5) * 6, y: -6 - Math.random() * 5 });
          }
        }
      });
      document.getElementById('btn-clear').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        Sound.fx.whoosh();
        Phys.clearLetters(true);
      });
    },

    dropLetter(ch) {
      const s = letterSize();
      const x = s + Math.random() * (innerWidth - s * 2);
      Phys.spawnLetter(ch, x, -s * 0.6, {
        size: s, lower: this.lower,
        vx: (Math.random() - 0.5) * 3,
      });
      Sound.fx.spawn();
      Sound.speak(ch + '!', { rate: 0.9 });
    },

    // 置いてある文字をポンとタップ → おしゃべり + 絵文字が飛び出す
    onTapBody(body) {
      const g = body.game;
      if (!g || g.isDot) return;
      Sound.speakLetter(g.char);
      const info = LETTERS[g.char];
      FX.emojiPop(body.position.x, body.position.y - g.size * 0.4, info.emoji, 5);
      FX.stars(body.position.x, body.position.y, 6);
      g.squashV = -0.3;
      Matter.Body.setVelocity(body, { x: body.velocity.x, y: -6 });
      Sound.fx.pop();
    },

    onTapEmpty(x, y) {
      // 何もない所をタップ → ランダムな文字がその場に降ってくる
      const ch = ALPHABET[Math.floor(Math.random() * 26)];
      Phys.spawnLetter(ch, x, Math.min(y, 80), { size: letterSize(), lower: this.lower });
      Sound.fx.spawn();
      Sound.speak(ch + '!', { rate: 0.9 });
    },

    tick() {},
    drawOpts() { return { moonMode: this.moonMode }; },
    onResize() { this.layout(); },
    exit() {
      Phys.engine.gravity.y = 1;
    },
  };

  /* =====================================================
   * 2. ことばパズル (Word Builder)
   * ===================================================== */
  const words = {
    id: 'words',
    current: null,
    slots: [],
    locked: [],
    celebrating: false,
    wordIndex: 0,
    deck: [],

    enter() {
      Phys.setBounds(innerWidth, innerHeight, { floorOffset: 10, ceiling: false });
      this.deck = [...WORDS].sort(() => Math.random() - 0.5)
        .sort((a, b) => a.word.length - b.word.length); // 3文字から始める
      this.wordIndex = 0;
      hud().innerHTML = `<div id="word-banner"><span id="word-emoji"></span><span id="word-text"></span></div>
        <button id="btn-next" class="big-next hidden">▶</button>`;
      document.getElementById('btn-next').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.nextWord();
      });
      this.startWord();
    },

    startWord() {
      Phys.clearLetters(false);
      this.celebrating = false;
      clearTimeout(this.autoNext);
      document.getElementById('btn-next').classList.add('hidden');
      this.current = this.deck[this.wordIndex % this.deck.length];
      const w = this.current.word;
      document.getElementById('word-emoji').textContent = this.current.emoji;
      document.getElementById('word-text').textContent = '';

      // スロット配置 (上部中央)
      const s = letterSize();
      const gap = s * 1.12;
      const total = gap * w.length;
      const y = Math.max(s * 1.5, innerHeight * 0.24);
      this.slots = w.split('').map((ch, i) => ({
        ch, x: innerWidth / 2 - total / 2 + gap * (i + 0.5), y, filled: null, glow: 0,
      }));
      this.locked = [];

      // 正解の文字 + ダミー3文字を下にばらまく
      const chars = w.split('');
      const decoys = [];
      while (decoys.length < Math.min(3, 26 - new Set(chars).size)) {
        const c = ALPHABET[Math.floor(Math.random() * 26)];
        if (!chars.includes(c) && !decoys.includes(c)) decoys.push(c);
      }
      const all = [...chars, ...decoys].sort(() => Math.random() - 0.5);
      all.forEach((ch, i) => {
        const x = (innerWidth / (all.length + 1)) * (i + 1) + (Math.random() - 0.5) * 30;
        Phys.spawnLetter(ch, x, innerHeight * 0.45 + Math.random() * 60 - s, { size: s * 0.92 });
      });
      Sound.speakSequence([
        { text: 'Make the word... ', wait: 1300 },
        { text: this.current.word + '!', wait: 0 },
      ]);
    },

    onDragEnd(link) {
      if (this.celebrating) return;
      const body = link.body;
      const g = body.game;
      if (!g || g.locked || g.isDot) return;
      const s = letterSize();
      for (const slot of this.slots) {
        if (slot.filled) continue;
        const d = Math.hypot(body.position.x - slot.x, body.position.y - slot.y);
        if (d < s * 0.95) {
          if (slot.ch === g.char) {
            this.lockIn(body, slot);
          } else {
            // ちがう文字: やさしく揺れてお知らせ (罰はなし)
            slot.glow = -1;
            Sound.fx.wrong();
            g.squashV = -0.25;
            Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 8, y: -5 });
          }
          return;
        }
      }
    },

    lockIn(body, slot) {
      slot.filled = body;
      slot.glow = 1;
      body.game.locked = true;
      Matter.Body.setStatic(body, true);
      this.locked.push({ body, slot, t: 0 });
      Sound.fx.chime();
      Sound.speak(slot.ch + '!', { pitch: 1.3 });
      FX.stars(slot.x, slot.y, 8);

      if (this.slots.every(sl => sl.filled)) {
        this.celebrate();
      }
    },

    celebrate() {
      this.celebrating = true;
      const w = this.current.word;
      document.getElementById('word-text').textContent = w;
      setTimeout(() => Sound.fx.tada(), 300);
      setTimeout(() => Sound.speakWord(w), 900);

      // 絵文字の雨 + 紙吹雪
      const emoji = this.current.emoji;
      let n = 0;
      this.rainTimer = setInterval(() => {
        FX.emojiPop(Math.random() * innerWidth, innerHeight * 0.25, emoji, 2);
        FX.confetti(Math.random() * innerWidth, innerHeight * 0.3, 12);
        if (++n > 8) clearInterval(this.rainTimer);
      }, 350);

      this.showNextTimer = setTimeout(() => {
        const btn = document.getElementById('btn-next');
        if (btn) btn.classList.remove('hidden');
      }, 2500);
      this.autoNext = setTimeout(() => this.nextWord(), 9000);
    },

    nextWord() {
      if (!this.celebrating) return;
      clearInterval(this.rainTimer);
      clearTimeout(this.autoNext);
      Sound.fx.click();
      this.wordIndex++;
      this.startWord();
    },

    onTapBody(body) {
      const g = body.game;
      if (!g || g.locked || g.isDot) return;
      Sound.speak(g.char + '!', { rate: 0.9 });
      g.squashV = -0.2;
      Sound.fx.pop();
    },

    onTapEmpty() {},

    tick() {
      // ロックした文字をスロット中心にスルスル寄せる
      for (const item of this.locked) {
        const { body, slot } = item;
        const k = 0.2;
        Matter.Body.setPosition(body, {
          x: body.position.x + (slot.x - (body.position.x + rotOffX(body))) * k,
          y: body.position.y + (slot.y - (body.position.y + rotOffY(body))) * k,
        });
        Matter.Body.setAngle(body, body.angle * 0.8);
      }
      for (const slot of this.slots) {
        if (slot.glow > 0) slot.glow = Math.max(0, slot.glow - 0.02);
        if (slot.glow < 0) slot.glow = Math.min(0, slot.glow + 0.04);
      }
    },

    drawOpts() {
      return {
        beforeBodies: (ctx) => this.drawSlots(ctx),
      };
    },

    drawSlots(ctx) {
      const s = letterSize();
      const t = performance.now();
      for (const slot of this.slots) {
        ctx.save();
        ctx.translate(slot.x, slot.y + (slot.glow < 0 ? Math.sin(t / 30) * 5 : 0));
        const pulse = slot.filled ? 1 : 1 + Math.sin(t / 400) * 0.03;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = slot.filled
          ? 'rgba(255,255,255,0.25)'
          : 'rgba(255,255,255,0.55)';
        ctx.strokeStyle = slot.glow > 0
          ? `rgba(255,220,80,${slot.glow})`
          : 'rgba(120,140,180,0.7)';
        ctx.lineWidth = slot.glow > 0 ? 8 : 4;
        ctx.setLineDash(slot.filled ? [] : [10, 8]);
        roundRect(ctx, -s * 0.5, -s * 0.58, s, s * 1.16, s * 0.18);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        if (!slot.filled) {
          // うすい手本の文字
          ctx.font = `900 ${s * 0.8}px ${Render2D.FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(120,140,180,0.35)';
          ctx.fillText(slot.ch, 0, 0);
        }
        ctx.restore();
      }
    },

    onResize() {
      Phys.setBounds(innerWidth, innerHeight, { floorOffset: 10 });
      if (!this.current) return;
      const s = letterSize();
      const gap = s * 1.12;
      const total = gap * this.current.word.length;
      const y = Math.max(s * 1.5, innerHeight * 0.24);
      this.slots.forEach((slot, i) => {
        slot.x = innerWidth / 2 - total / 2 + gap * (i + 0.5);
        slot.y = y;
      });
    },

    exit() {
      clearInterval(this.rainTimer);
      clearTimeout(this.autoNext);
      clearTimeout(this.showNextTimer);
    },
  };

  /* =====================================================
   * 3. もじキャッチ (Letter Catch)
   * ===================================================== */
  const catcher = {
    id: 'catch',
    target: null,
    stars: 0,
    spawnTimer: 0,
    announceTimer: 0,

    enter() {
      Phys.setBounds(innerWidth, innerHeight, { floorOffset: -300 }); // 床なし: 下に抜ける
      hud().innerHTML = `
        <div id="catch-banner">
          <div id="catch-find">FIND</div>
          <div id="catch-target"></div>
          <div id="catch-stars"></div>
        </div>`;
      this.stars = 0;
      this.newTarget(true);
    },

    newTarget(first = false) {
      this.target = ALPHABET[Math.floor(Math.random() * 26)];
      this.stars = 0;
      this.renderBanner();
      const say = () => Sound.speakSequence([
        { text: 'Find the letter...', wait: 1400 },
        { text: this.target + '!', pitch: 1.3, wait: 0 },
      ]);
      if (first) setTimeout(say, 600); else say();
      this.spawnTimer = 0;
    },

    renderBanner() {
      const el = document.getElementById('catch-target');
      if (!el) return;
      el.textContent = this.target;
      el.style.color = LETTERS[this.target].color;
      const stars = document.getElementById('catch-stars');
      stars.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('span');
        s.textContent = '⭐';
        s.className = i < this.stars ? 'star on' : 'star';
        stars.appendChild(s);
      }
    },

    tick(dt) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && Phys.letters.length < 9) {
        this.spawnTimer = 1150;
        const isTarget = Math.random() < 0.4 ||
          !Phys.letters.some(b => b.game.char === this.target);
        const ch = isTarget ? this.target : ALPHABET[Math.floor(Math.random() * 26)];
        const s = letterSize() * 0.95;
        const body = Phys.spawnLetter(ch, s + Math.random() * (innerWidth - s * 2), -s, {
          size: s, maxCount: 12,
        });
        // 風船のようにゆっくり落ちる
        body.frictionAir = 0.06;
        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);
      }
      // 画面の下に抜けた文字を消す
      for (const b of [...Phys.letters]) {
        if (b.position.y > innerHeight + 150) Phys.removeLetter(b, false);
      }
    },

    onTapBody(body) {
      const g = body.game;
      if (!g || g.isDot) return;
      if (g.char === this.target) {
        // あたり!
        Sound.fx.pop();
        Sound.fx.star();
        Sound.speak(g.char + '!', { pitch: 1.3 });
        FX.burst(body.position.x, body.position.y, g.color, 18);
        FX.stars(body.position.x, body.position.y, 10);
        Phys.removeLetter(body, false);
        this.stars++;
        this.renderBanner();
        if (this.stars >= 5) this.winRound();
      } else {
        // ちがう文字: その文字が名前を言って逃げる (まちがいも学び!)
        Sound.fx.boing();
        Sound.speak(g.char + '?', { rate: 0.9 });
        g.squashV = -0.3;
        Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 10, y: -8 });
      }
    },

    winRound() {
      Sound.fx.tada();
      setTimeout(() => Sound.speak('Great job!', { pitch: 1.2 }), 700);
      const hue = Math.random() * 360;
      [[0.3, 0.35], [0.7, 0.3], [0.5, 0.5]].forEach(([fx_, fy], i) => {
        setTimeout(() => {
          Sound.fx.firework();
          FX.firework(innerWidth * fx_, innerHeight * fy, hue + i * 60);
          FX.confetti(innerWidth * fx_, innerHeight * fy, 20);
        }, i * 450);
      });
      Phys.clearLetters(true);
      setTimeout(() => this.newTarget(), 2600);
    },

    onTapEmpty(x, y) { FX.sparkle(x, y); },
    drawOpts() { return { drawGround: false }; },
    onResize() { Phys.setBounds(innerWidth, innerHeight, { floorOffset: -300 }); },
    exit() {},
  };

  /* ---------- 共通ヘルパー ---------- */

  function rotOffX(body) {
    const g = body.game;
    return g.offsetX * Math.cos(body.angle) - g.offsetY * Math.sin(body.angle);
  }
  function rotOffY(body) {
    const g = body.game;
    return g.offsetX * Math.sin(body.angle) + g.offsetY * Math.cos(body.angle);
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

  return { playground, words, catcher };
})();

window.Modes = Modes;
