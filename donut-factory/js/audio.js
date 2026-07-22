'use strict';
/* ============================================================
 * audio.js — WebAudio 合成の効果音 + レベルごとの自動生成BGM
 * 音源ファイル不要。iOS では最初のタップで unlock される。
 * ============================================================ */

const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let muted = false;
  let musicTimer = null;
  let musicState = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function setMuted(m) {
    muted = m;
    if (master) {
      master.gain.cancelScheduledValues(0);
      master.gain.value = m ? 0 : 1;
    }
  }

  // ---------- 効果音プリミティブ ----------
  function tone(freq, dur, opts = {}) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + (opts.delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
      const v = opts.vol || 0.5;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(opts.dest || sfxGain);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  function noise(dur, opts = {}) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + (opts.delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = opts.filter || 'highpass';
      filt.frequency.value = opts.freq || 3000;
      const g = ctx.createGain();
      const v = opts.vol || 0.25;
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(sfxGain);
      src.start(t0); src.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  // ---------- 名前つき効果音 ----------
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const S = {
    pop()      { tone(400, 0.12, { type: 'sine', slideTo: 900, vol: 0.5 }); },
    bigPop()   { tone(300, 0.16, { type: 'triangle', slideTo: 1100, vol: 0.6 }); noise(0.08, { freq: 4000, vol: 0.12 }); },
    boing()    { tone(500, 0.22, { type: 'triangle', slideTo: 170, vol: 0.5 }); tone(180, 0.22, { type: 'sine', slideTo: 420, vol: 0.3, delay: 0.07 }); },
    giggle()   { tone(700, 0.07, { type: 'square', vol: 0.12 }); tone(880, 0.07, { type: 'square', vol: 0.12, delay: 0.08 }); tone(1050, 0.09, { type: 'square', vol: 0.12, delay: 0.16 }); },
    chime(n)   {
      const step = PENTA[n % PENTA.length];
      tone(midiFreq(76 + step), 0.3, { type: 'sine', vol: 0.4 });
      tone(midiFreq(76 + step) * 2, 0.22, { type: 'sine', vol: 0.14, delay: 0.03 });
    },
    clunk()    { tone(160, 0.1, { type: 'square', vol: 0.3 }); tone(90, 0.14, { type: 'sine', vol: 0.4, delay: 0.02 }); },
    tick()     { tone(600, 0.05, { type: 'square', vol: 0.16 }); },
    whoosh()   { noise(0.3, { filter: 'bandpass', freq: 1200, vol: 0.3 }); tone(300, 0.3, { type: 'sine', slideTo: 1400, vol: 0.22 }); },
    stamp()    { tone(120, 0.16, { type: 'square', vol: 0.4 }); noise(0.1, { freq: 800, filter: 'lowpass', vol: 0.3 }); },
    shaker()   { noise(0.14, { freq: 5000, vol: 0.2 }); noise(0.1, { freq: 6500, vol: 0.14, delay: 0.1 }); },
    splat()    { noise(0.12, { filter: 'lowpass', freq: 700, vol: 0.35 }); tone(220, 0.14, { type: 'sine', slideTo: 90, vol: 0.35 }); },
    fallWhistle() { tone(1100, 0.5, { type: 'sine', slideTo: 250, vol: 0.25 }); },
    plop()     { tone(240, 0.12, { type: 'sine', slideTo: 90, vol: 0.4 }); },
    slide()    { tone(300, 0.4, { type: 'triangle', slideTo: 1500, vol: 0.3 }); },
    fanfare()  {
      const seq = [0, 4, 7, 12, 16, 12, 16, 19];
      seq.forEach((s, i) => {
        tone(midiFreq(72 + s), 0.22, { type: 'triangle', vol: 0.4, delay: i * 0.09 });
        tone(midiFreq(60 + s), 0.22, { type: 'sine', vol: 0.2, delay: i * 0.09 });
      });
      noise(0.4, { freq: 5000, vol: 0.1, delay: 0.3 });
    },
    spin()     { for (let i = 0; i < 5; i++) tone(500 + i * 140, 0.06, { type: 'square', vol: 0.12, delay: i * 0.05 }); },
    zap()      { tone(900, 0.14, { type: 'sawtooth', slideTo: 300, vol: 0.16 }); },
    honk()     {
      tone(345, 0.18, { type: 'square', vol: 0.22 });
      tone(435, 0.18, { type: 'square', vol: 0.22 });
      tone(345, 0.3, { type: 'square', vol: 0.2, delay: 0.24 });
      tone(435, 0.3, { type: 'square', vol: 0.2, delay: 0.24 });
    },
    beep()     { tone(880, 0.12, { type: 'square', vol: 0.14 }); tone(880, 0.12, { type: 'square', vol: 0.14, delay: 0.3 }); },
    powerDown() { tone(420, 0.7, { type: 'sawtooth', slideTo: 55, vol: 0.25 }); tone(210, 0.7, { type: 'sine', slideTo: 40, vol: 0.2, delay: 0.05 }); },
    rain()     { noise(0.5, { filter: 'lowpass', freq: 900, vol: 0.18 }); tone(700, 0.4, { type: 'sine', slideTo: 400, vol: 0.1, delay: 0.1 }); },
    pokon()    { tone(240, 0.14, { type: 'sine', slideTo: 520, vol: 0.5 }); tone(520, 0.1, { type: 'sine', slideTo: 700, vol: 0.25, delay: 0.1 }); },
    zupon()    { tone(520, 0.16, { type: 'sine', slideTo: 160, vol: 0.45 }); noise(0.1, { filter: 'lowpass', freq: 900, vol: 0.2, delay: 0.06 }); },
  };

  function sfx(name, arg) {
    if (!ctx || muted) return;
    const f = S[name];
    if (f) { try { f(arg); } catch (e) {} }
  }

  // ---------- BGM（レベルシードから自動生成されるやさしいループ） ----------
  function startMusic(spec) {
    stopMusic();
    if (!ctx) return;
    const seed = (spec && spec.seed) || 1;
    const tempo = (spec && spec.tempo) || 80;
    const keyRoot = 60 + ((spec && spec.key) || 0);   // MIDI
    const rng = mulberry32(seed * 7919 + 13);
    const beat = 60 / tempo;
    const scale = [0, 2, 4, 7, 9];                     // メジャーペンタトニック
    const chords = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]]; // I vi IV V

    // 16小節ぶんのメロディを先に生成してループ
    const melody = [];
    let deg = 4;
    for (let i = 0; i < 64; i++) {
      if (rng() < 0.3) { melody.push(null); continue; }
      deg += Math.floor(rng() * 5) - 2;
      deg = clamp(deg, 0, 9);
      melody.push(scale[deg % 5] + 12 * Math.floor(deg / 5));
    }

    musicState = { nextBar: 0, nextTime: ctx.currentTime + 0.15, beat, keyRoot, chords, melody, rng };

    musicTimer = setInterval(() => {
      if (!ctx || !musicState) return;
      try {
        while (musicState.nextTime < ctx.currentTime + 0.6) scheduleBar();
      } catch (e) {}
    }, 120);
  }

  function scheduleBar() {
    const st = musicState;
    const t0 = st.nextTime;
    const bar = st.nextBar;
    const chord = st.chords[bar % st.chords.length];
    const b = st.beat;

    // ベース（小節あたま）
    mtone(midiFreq(st.keyRoot - 24 + chord[0]), t0, b * 3.6, 'triangle', 0.35);
    // パッド和音
    for (const c of chord) mtone(midiFreq(st.keyRoot - 12 + c), t0, b * 3.8, 'sine', 0.1);
    // アルペジオ（8分）
    for (let i = 0; i < 8; i++) {
      const n = chord[i % chord.length] + (i >= 4 ? 12 : 0);
      mtone(midiFreq(st.keyRoot + n), t0 + i * b * 0.5, b * 0.42, 'triangle', 0.09);
    }
    // メロディ（4分）
    for (let i = 0; i < 4; i++) {
      const m = st.melody[(bar * 4 + i) % st.melody.length];
      if (m !== null && m !== undefined) {
        mtone(midiFreq(st.keyRoot + 12 + m), t0 + i * b, b * 0.8, 'sine', 0.16);
      }
    }
    st.nextBar++;
    st.nextTime += b * 4;
  }

  function mtone(freq, t0, dur, type, vol) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 2400;
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
      g.gain.setValueAtTime(vol, t0 + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(filt); filt.connect(g); g.connect(musicGain);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicState = null;
  }

  return { ensure, sfx, setMuted, startMusic, stopMusic, get muted() { return muted; } };
})();
