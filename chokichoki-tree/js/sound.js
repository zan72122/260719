'use strict';

/* ちいさな効果音をぜんぶ WebAudio で合成する（音声ファイル不要） */
const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastSplit = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts = {}) {
    if (muted || !ensure()) return;
    const { type = 'sine', vol = 0.25, delay = 0, glideTo = 0 } = opts;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, freq, opts = {}) {
    if (muted || !ensure()) return;
    const { vol = 0.3, delay = 0, q = 1.5 } = opts;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  /* ペンタトニック（雅な感じ）: 花が咲くたびに音階が上がる */
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];

  return {
    unlock() { ensure(); },

    setMuted(m) { muted = m; },

    /* 種をうえた */
    plant() {
      tone(196, 0.35, { type: 'triangle', vol: 0.3, glideTo: 392 });
      tone(392, 0.4, { type: 'sine', vol: 0.18, delay: 0.12 });
    },

    /* 枝が分かれた（連発しないよう間引く） */
    split() {
      const now = performance.now();
      if (now - lastSplit < 160) return;
      lastSplit = now;
      tone(660 + Math.random() * 220, 0.09, { type: 'triangle', vol: 0.05 });
    },

    /* ちょきん！ */
    snip() {
      noise(0.07, 5200, { vol: 0.32, q: 1.1 });
      noise(0.06, 3600, { vol: 0.22, delay: 0.045, q: 1.1 });
      tone(880, 0.09, { type: 'square', vol: 0.05, glideTo: 440 });
    },

    /* 花がさいた */
    bloom(n) {
      const f = SCALE[Math.min(n - 1, SCALE.length - 1)] || SCALE[0];
      tone(f, 0.5, { type: 'sine', vol: 0.3 });
      tone(f * 2, 0.4, { type: 'sine', vol: 0.1, delay: 0.05 });
      noise(0.25, 7000, { vol: 0.05, q: 0.8 });
    },

    /* 咲いた花が落ちてしまった */
    unbloom() {
      tone(392, 0.25, { type: 'sine', vol: 0.14, glideTo: 262 });
    },

    /* 枝がしょんぼり（雲のかげ） */
    wilt() {
      tone(233, 0.3, { type: 'triangle', vol: 0.08, glideTo: 175 });
    },

    /* レベルクリア */
    fanfare() {
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => {
        tone(f, 0.35, { type: 'triangle', vol: 0.22, delay: i * 0.13 });
        tone(f * 2, 0.3, { type: 'sine', vol: 0.07, delay: i * 0.13 + 0.02 });
      });
      tone(1318.5, 0.8, { type: 'sine', vol: 0.18, delay: 0.62 });
    },

    /* ぜんぶクリア */
    allclear() {
      const seq = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5, 1568.0];
      seq.forEach((f, i) => {
        tone(f, 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.11 });
      });
    },

    /* ボタン */
    click() {
      tone(740, 0.08, { type: 'triangle', vol: 0.12 });
    },
  };
})();
