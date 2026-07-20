/* Web Audio で「おおげさな音」を合成する */
const S = (() => {
  let ctx = null;
  let noiseBuf = null;
  let unlocked = false;

  function ac() {
    if (!unlocked) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function blip(type, f0, f1, dur, vol, delay) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function hiss(dur, vol, freq, delay) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 1200;
    f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  return {
    unlock() {
      unlocked = true;
      ac();
    },

    /* カチッ */
    kachi() {
      blip('square', 2200, 1400, 0.035, 0.22);
      blip('square', 1200, 700, 0.05, 0.2, 0.045);
    },

    /* びよ〜ん */
    boing(f0, vol) {
      const c = ac(); if (!c) return;
      const t = c.currentTime;
      f0 = f0 || 260;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + 0.42);
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.setValueAtTime(26, t);
      lfo.frequency.exponentialRampToValueAtTime(11, t + 0.42);
      lg.gain.value = f0 * 0.4;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(vol || 0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.55);
      lfo.start(t); lfo.stop(t + 0.55);
    },

    /* ポンッ */
    pop(delay) { blip('sine', 320, 950, 0.09, 0.32, delay); },

    /* とぷん（液体） */
    blub(delay) { blip('sine', 230, 85, 0.13, 0.26, delay); },

    /* むにゅ */
    squish() {
      hiss(0.16, 0.12, 480);
      blip('sine', 160, 60, 0.18, 0.22);
    },

    /* ヒューン（風・勢い 0〜1） */
    whoosh(k) {
      k = k == null ? 0.6 : k;
      hiss(0.45, 0.1 + 0.16 * k, 700 + 1400 * k);
    },

    /* キラキラ〜ン */
    sparkle() {
      const fs = [880, 1174, 1568, 2093];
      fs.forEach((f, i) => blip('sine', f, f * 1.02, 0.14, 0.16, i * 0.055));
    },

    /* ぴちょん（雨粒） */
    tick() { blip('sine', 2600, 1700, 0.03, 0.06); },

    /* やったー！ */
    yay() {
      const fs = [523, 659, 784, 1046];
      fs.forEach((f, i) => blip('square', f, f, 0.16, 0.14, i * 0.12));
      blip('sine', 1568, 2093, 0.3, 0.12, 0.5);
    },

    /* ふにゃふにゃ（おもしろ音） */
    wobble() {
      blip('triangle', 220, 640, 0.16, 0.26);
      this.boing(520, 0.26);
    },

    /* スカッ（からっぽ） */
    empty() {
      hiss(0.25, 0.14, 2400);
      blip('triangle', 500, 130, 0.3, 0.2, 0.06);
    },

    /* ---- 写実系（3Dペンなど実録風の音） ---- */

    /* 金属ラッチの実物風クリック */
    clickReal(vol, delay) {
      const c = ac(); if (!c) return;
      vol = vol == null ? 1 : vol;
      const t = c.currentTime + (delay || 0);
      const src = c.createBufferSource();
      src.buffer = noise(c);
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2600;
      const g = c.createGain();
      g.gain.setValueAtTime(0.5 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + 0.04);
      blip('sine', 1300, 480, 0.028, 0.2 * vol, (delay || 0) + 0.012);
    },

    /* バネが戻るときの微かな金属振動＋着座音 */
    snapBack() {
      const c = ac(); if (!c) return;
      const t = c.currentTime;
      [[2150, 0.1], [3350, 0.07]].forEach(([fq, dur]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.93, t + dur);
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
      this.clickReal(0.75, 0.05);
    },

    /* ポンプを押すときの実物風スクイズ音 */
    squishReal(vol) {
      vol = vol == null ? 1 : vol;
      hiss(0.22, 0.1 * vol, 420);
      blip('sine', 150, 62, 0.22, 0.2 * vol);
    },

    /* 液体を吸い上げるゴボッという音 */
    glug() {
      blip('sine', 260, 110, 0.12, 0.22);
      blip('sine', 200, 85, 0.14, 0.2, 0.11);
      hiss(0.28, 0.05, 700, 0.03);
    },

    /* 小さな液だまりに落ちるピチャ (k: ピッチ倍率 0.5=低くて重い) */
    plip(k) {
      k = k || 1;
      blip('sine', 950 * k, 320 * k, 0.05, 0.12);
      hiss(0.05, 0.04, 2600 * k, 0.01);
    },

    /* 骨先などから垂れる滴のポチャ */
    drip() {
      blip('sine', 620, 210, 0.07, 0.1);
    },

    /* 紙をめくるサッ */
    flipPage() {
      hiss(0.16, 0.16, 1600);
      hiss(0.1, 0.1, 900, 0.09);
    },

    /* 空気を吸ってスパスパいうポンプ */
    sputter() {
      hiss(0.06, 0.16, 1900);
      blip('triangle', 300, 90, 0.08, 0.14, 0.04);
      hiss(0.05, 0.1, 2400, 0.11);
    },

    /* 風車のヒュンヒュン。set(回転の速さ0〜1)、stop() */
    whirrLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 2.2;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 4;
      lg.gain.value = 300;
      lfo.connect(lg).connect(f.frequency);
      lfo.start();
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.setTargetAtTime(Math.min(level, 1) * 0.07, t, 0.15);
          lfo.frequency.setTargetAtTime(2 + level * 14, t, 0.15);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.1);
          try { src.stop(c.currentTime + 0.4); lfo.stop(c.currentTime + 0.4); } catch (e) { /* stopped */ }
        },
      };
    },

    /* 低いコトッという着座音 */
    thunk() {
      blip('sine', 190, 70, 0.07, 0.3);
      hiss(0.04, 0.12, 900);
    },

    /* 布がはためくバサッ */
    flap() {
      hiss(0.22, 0.22, 850);
      hiss(0.14, 0.14, 500, 0.1);
    },

    /* 雨の環境音ループ。set(0〜1)、stop() */
    rainLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 5200;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          g.gain.setTargetAtTime(level * 0.055, c.currentTime, 0.3);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.1);
          try { src.stop(c.currentTime + 0.5); } catch (e) { /* stopped */ }
        },
      };
    },

    /* モーターのうなりループ。set(0〜1)、stop() */
    humLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 82;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(c.destination);
      o.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.setTargetAtTime(level * 0.05, t, 0.1);
          o.frequency.setTargetAtTime(82 + level * 46, t, 0.1);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.08);
          try { o.stop(c.currentTime + 0.4); } catch (e) { /* stopped */ }
        },
      };
    },

    /* コインを入れるチャリン */
    coin() {
      blip('sine', 4200, 3900, 0.06, 0.12);
      blip('sine', 3100, 2800, 0.09, 0.1, 0.05);
      hiss(0.12, 0.05, 5200, 0.1);
      blip('sine', 2500, 2300, 0.05, 0.06, 0.16);
    },

    /* 巻き上げなどのラチェット1コマ */
    ratchet(vol) {
      vol = vol == null ? 1 : vol;
      blip('square', 1900, 1300, 0.02, 0.12 * vol);
      hiss(0.02, 0.06 * vol, 3400);
    },

    /* ブー (エラー・過積載) */
    buzz() {
      const c = ac(); if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 210;
      const g = c.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.setValueAtTime(0.09, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.4);
    },

    /* スタンプがガチャン */
    stamp() {
      blip('sine', 300, 90, 0.06, 0.3);
      blip('square', 1500, 900, 0.03, 0.15, 0.03);
      hiss(0.05, 0.12, 1200, 0.02);
    },

    /* ドーン (打上げ・破裂。size 0〜1で重さ) */
    boom(size, delay) {
      size = size == null ? 1 : size;
      const c = ac(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90 + 60 * (1 - size), t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0.5 * size, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + size * 0.4);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 1.2);
      hiss(0.5 + size * 0.4, 0.22 * size, 500, delay);
    },

    /* パチパチ (花火の残り火) */
    crackleBurst(n, delay) {
      n = n || 8;
      for (let i = 0; i < n; i++) {
        blip('square', 2400 + (i % 5) * 380, 1500, 0.02, 0.05, (delay || 0) + i * 0.05 + (i % 3) * 0.02);
      }
    },

    /* 蒸気機関車の汽笛 */
    trainWhistle(dur) {
      const c = ac(); if (!c) return;
      const t = c.currentTime;
      dur = dur || 0.9;
      [620, 780, 930].forEach(fq => {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fq * 0.96, t);
        o.frequency.linearRampToValueAtTime(fq, t + 0.08);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.08);
        g.gain.setValueAtTime(0.055, t + dur - 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + dur + 0.1);
      });
      hiss(dur, 0.05, 1800);
    },

    /* エレベーターのチーン */
    ding() {
      blip('sine', 880, 875, 0.5, 0.12);
      blip('sine', 1320, 1310, 0.4, 0.07, 0.01);
    },

    /* 汽笛より小さいシュッシュ (ドラフト音1回) */
    chuff(vol) {
      hiss(0.16, 0.2 * (vol == null ? 1 : vol), 900);
    },

    /* シャッターのカシャッ */
    shutterClack() {
      blip('square', 2600, 1800, 0.015, 0.16);
      hiss(0.03, 0.14, 3000, 0.012);
      blip('sine', 420, 180, 0.05, 0.2, 0.03);
      blip('square', 2000, 1400, 0.02, 0.12, 0.07);
    },

    /* モーターのサーボ音ループ。set(0〜1)、stop() */
    servoLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 170;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(c.destination);
      o.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.setTargetAtTime(level * 0.045, t, 0.08);
          o.frequency.setTargetAtTime(150 + level * 260, t, 0.08);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.06);
          try { o.stop(c.currentTime + 0.3); } catch (e) { /* stopped */ }
        },
      };
    },

    /* 低いゴーというループ (ロケット・ボイラー)。set(0〜1)、stop() */
    rumbleLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.setTargetAtTime(level * 0.34, t, 0.15);
          f.frequency.setTargetAtTime(180 + level * 420, t, 0.15);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.12);
          try { src.stop(c.currentTime + 0.6); } catch (e) { /* stopped */ }
        },
      };
    },

    /* 導火線のパチパチループ。set(0〜1)、stop() */
    fuseLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3600;
      f.Q.value = 1.4;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 13;
      const lg = c.createGain();
      lg.gain.value = 0;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          g.gain.setTargetAtTime(level * 0.045, c.currentTime, 0.06);
          lg.gain.setTargetAtTime(level * 0.04, c.currentTime, 0.06);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          g.gain.setTargetAtTime(0, c.currentTime, 0.05);
          lg.gain.setTargetAtTime(0, c.currentTime, 0.05);
          try { src.stop(c.currentTime + 0.3); lfo.stop(c.currentTime + 0.3); } catch (e) { /* stopped */ }
        },
      };
    },

    /* ボールペンが紙をこする音。set(0〜1)で速さ、stop()で終了 */
    scratchLoop() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 1.1;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setTargetAtTime(Math.min(level, 1) * 0.09, t, 0.04);
          f.frequency.setTargetAtTime(2800 + level * 1800, t, 0.06);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          const t = c.currentTime;
          g.gain.setTargetAtTime(0, t, 0.03);
          try { src.stop(t + 0.2); } catch (e) { /* already stopped */ }
        },
      };
    },

    /* 連続の風音。set(0〜1)で強さ、stop()で終了 */
    wind() {
      const c = ac();
      if (!c) return { set() {}, stop() {} };
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 600;
      f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
      let stopped = false;
      return {
        set(level) {
          if (stopped) return;
          const t = c.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setTargetAtTime(level * 0.22, t, 0.12);
          f.frequency.setTargetAtTime(450 + level * 1600, t, 0.12);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          const t = c.currentTime;
          g.gain.setTargetAtTime(0, t, 0.08);
          try { src.stop(t + 0.4); } catch (e) { /* already stopped */ }
        },
      };
    },
  };
})();
