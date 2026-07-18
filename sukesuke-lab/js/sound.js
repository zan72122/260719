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
