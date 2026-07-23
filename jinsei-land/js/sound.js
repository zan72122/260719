/* Web Audio で ぜんぶの音を合成する（ファイル不要・オフラインOK） */
const S = (() => {
  let ctx = null;
  let noiseBuf = null;
  let unlocked = false;
  let muted = false;
  let master = null;

  function ac() {
    if (!unlocked || muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
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

  /* 基本ブザー：type波形で f0→f1 に dur 秒 */
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
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function hiss(dur, vol, delay, hp) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || 900;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /* ドレミ… 音名→周波数 */
  const N = { C4:261.6, D4:293.7, E4:329.6, F4:349.2, G4:392, A4:440, B4:493.9,
              C5:523.3, D5:587.3, E5:659.3, F5:698.5, G5:784, A5:880, B5:987.8,
              C6:1046.5, D6:1174.7, E6:1318.5, G6:1568,
              C3:130.8, D3:146.8, E3:164.8, F3:174.6, G3:196, A3:220, B3:246.9 };

  function tone(freq, dur, vol, delay, type) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ---------------- こうか音 ---------------- */

  const api = {
    unlock() {
      unlocked = true;
      ac();
    },

    setMuted(b) {
      muted = b;
      if (b) { api.bgmStop(); if (window.speechSynthesis) speechSynthesis.cancel(); }
    },
    isMuted() { return muted; },

    pop()   { blip('sine', 500, 900, 0.09, 0.3); },
    tick()  { blip('square', 1600, 1200, 0.03, 0.06); },

    /* ルーレット結果：ぽん！ */
    ding()  { tone(N.C6, 0.4, 0.3); tone(N.E6, 0.5, 0.22, 0.06); },

    /* 1マスぴょん */
    hop(i) {
      const f = 300 + (i % 4) * 70;
      blip('sine', f, f * 1.9, 0.13, 0.22);
    },
    land() { hiss(0.09, 0.18); blip('sine', 220, 120, 0.1, 0.2); },

    /* ほし げっと */
    star(k) {
      const base = [N.C6, N.E6, N.G6][ (k||0) % 3 ];
      tone(base, 0.25, 0.26);
      tone(base * 1.5, 0.3, 0.2, 0.07);
      hiss(0.18, 0.06, 0, 4000);
    },

    /* ざんねん→でも たのしい すべり音 */
    slip() {
      blip('sine', 1100, 180, 0.65, 0.28);
      hiss(0.25, 0.12, 0.1);
      blip('sine', 160, 90, 0.15, 0.25, 0.62);
    },

    rocket() {
      hiss(0.9, 0.3, 0, 700);
      blip('sawtooth', 90, 500, 0.85, 0.14);
      blip('sine', 600, 1400, 0.6, 0.1, 0.15);
    },

    present() {
      tone(N.C5, 0.12, 0.24); tone(N.E5, 0.12, 0.24, 0.1);
      tone(N.G5, 0.12, 0.24, 0.2); tone(N.C6, 0.4, 0.3, 0.3);
      hiss(0.35, 0.08, 0.3, 3000);
    },

    cheer() {
      for (let i = 0; i < 7; i++) {
        blip('sine', 500 + Math.random() * 700, 900 + Math.random() * 800, 0.18, 0.07, i * 0.05);
      }
      hiss(0.5, 0.1, 0, 2500);
    },

    puff() { hiss(0.22, 0.28, 0, 1200); },

    note(i) {
      const seq = [N.C5, N.E5, N.G5, N.A5, N.G5, N.E5];
      tone(seq[i % seq.length], 0.22, 0.2);
    },

    honk() { blip('square', 340, 300, 0.14, 0.12); blip('square', 430, 380, 0.14, 0.1, 0.02); },

    drum() {
      const c = ac(); if (!c) return;
      for (let i = 0; i < 10; i++) {
        blip('sine', 170, 90, 0.09, 0.22, i * 0.11);
        hiss(0.05, 0.1, i * 0.11, 5000);
      }
    },

    /* ファンファーレ */
    fanfare() {
      const m = [ [N.C5,0], [N.C5,.16], [N.C5,.32], [N.G5,.48],
                  [N.E5,.82], [N.G5,1.0], [N.C6,1.2] ];
      m.forEach(([f, d]) => { tone(f, 0.3, 0.28, d, 'square'); tone(f/2, 0.3, 0.2, d, 'triangle'); });
      tone(N.C6, 1.0, 0.24, 1.5);
      tone(N.E6, 1.0, 0.2, 1.5);
      tone(N.G6, 1.2, 0.16, 1.55);
    },

    goalBoom(delay) {
      hiss(0.8, 0.3, delay || 0);
      blip('sine', 200, 60, 0.7, 0.3, delay || 0);
    },

    /* ---------------- BGM ---------------- */
    /* かんたんな 8小節ループを ずっと ならす */
    bgmStart() {
      if (api._bgmTimer || muted) return;
      const c = ac(); if (!c) return;

      const bpm = 132;
      const beat = 60 / bpm;
      /* コード：C G Am F ×2（ルート音） */
      const roots = [N.C3, N.G3, N.A3, N.F3, N.C3, N.G3, N.A3, N.F3];
      /* メロディ（8分音符 × 64、0 は休符） */
      const mel = [
        N.E5,0,N.G5,0, N.A5,N.G5,N.E5,0,  N.D5,0,N.G5,0, N.B4,0,N.D5,0,
        N.C5,0,N.E5,0, N.A4,0,N.C5,N.E5,  N.F5,N.E5,N.D5,0, N.C5,0,0,0,
        N.E5,0,N.G5,0, N.A5,0,N.C6,0,     N.B5,0,N.G5,0, N.D5,0,N.G5,0,
        N.A5,0,N.E5,0, N.C5,0,N.E5,0,     N.D5,N.C5,N.D5,N.E5, N.C5,0,0,0,
      ];

      let bar = 0, nextT = c.currentTime + 0.1;
      const loopLen = beat * 4; /* 1小節 */

      api._bgmTimer = setInterval(() => {
        const cc = ac(); if (!cc) return;
        while (nextT < cc.currentTime + 0.6) {
          const b = bar % 8;
          /* ベース：4分音符 */
          for (let q = 0; q < 4; q++) {
            tone(roots[b], beat * 0.85, 0.07, nextT - cc.currentTime + q * beat, 'triangle');
          }
          /* ハイハットもどき：うら拍 */
          for (let q = 0; q < 4; q++) {
            hiss(0.03, 0.02, nextT - cc.currentTime + q * beat + beat / 2, 7000);
          }
          /* メロディ：8分音符 */
          for (let e = 0; e < 8; e++) {
            const f = mel[b * 8 + e];
            if (f) tone(f, beat * 0.42, 0.045, nextT - cc.currentTime + e * beat / 2, 'square');
          }
          nextT += loopLen;
          bar++;
        }
      }, 300);
    },

    bgmStop() {
      if (api._bgmTimer) { clearInterval(api._bgmTimer); api._bgmTimer = null; }
    },

    /* ---------------- こえ（あれば） ---------------- */
    say(text) {
      if (muted) return;
      try {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = 0.95;
        u.pitch = 1.3;
        u.volume = 0.9;
        const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ja'));
        if (v) u.voice = v;
        speechSynthesis.speak(u);
      } catch (e) { /* こえは おまけ */ }
    },
  };

  /* iOS Safari：voices は あとから来るので さきに 読んでおく */
  try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) {}

  return api;
})();
