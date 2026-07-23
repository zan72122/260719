'use strict';
/* ================= サウンド（全て WebAudio で手続き生成） =================
   ・アンビエントなパッド和音 ＋ まばらなペンタトニックの水琴メロディ
   ・泡ポップ音（大きさでピッチ変化、チェインで音階上昇）
   ・膨らまし音、マージ音、UI音、水中環境音 */

const AudioMan = (() => {
  let ctx = null;
  let master, musicGain, sfxGain;
  let started = false;
  let musicOn = true, sfxOn = true;
  let chordTimer = null, plinkTimer = null;
  let inflateNodes = new Map(); // pointerId -> {src, gain}

  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; // マイナーペンタ拡張
  const CHORDS = [
    [0, 7, 12, 16, 23],   // ふわっと開いた和音たち（半音）
    [-4, 3, 10, 15, 19],
    [-7, 0, 7, 14, 17],
    [-2, 5, 12, 16, 21],
  ];
  const BASE = 174.61; // F3 付近：落ち着く低め

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.5 : 0; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.9 : 0; sfxGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) { started = true; startWater(); startMusic(); }
  }

  function freq(semi) { return BASE * Math.pow(2, semi / 12); }

  /* ---- 環境音：水中のこもったノイズ ---- */
  function startWater() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // ブラウンノイズ
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.16;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(musicGain);
    src.start(); lfo.start();
  }

  /* ---- パッド和音 ---- */
  let chordIdx = 0;
  function playChord() {
    const chord = CHORDS[chordIdx % CHORDS.length];
    chordIdx++;
    const now = ctx.currentTime;
    const dur = 11;
    for (const semi of chord) {
      for (const det of [-4, 4]) { // デチューンで厚み
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq(semi);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(300, now);
        lp.frequency.linearRampToValueAtTime(900, now + dur * 0.4);
        lp.frequency.linearRampToValueAtTime(260, now + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.028, now + dur * 0.35);
        g.gain.linearRampToValueAtTime(0, now + dur);
        o.connect(lp); lp.connect(g); g.connect(musicGain);
        o.start(now); o.stop(now + dur + 0.1);
      }
    }
  }
  function playPlink() {
    if (Math.random() < 0.35) return; // まばらに
    const now = ctx.currentTime;
    const semi = 12 + PENTA[Math.floor(Math.random() * PENTA.length)];
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq(semi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.05, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq(semi) * 2.01;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.012, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    o.connect(g); g.connect(musicGain);
    o2.connect(g2); g2.connect(musicGain);
    o.start(now); o.stop(now + 2.6); o2.start(now); o2.stop(now + 1.4);
  }
  function startMusic() {
    playChord();
    chordTimer = setInterval(playChord, 10000);
    plinkTimer = setInterval(playPlink, 2100);
  }

  /* ---- SFX ---- */
  function noiseBurst(dur, filterFreq, gain, type = 'bandpass') {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
    return g;
  }

  function pop(sizeRatio, chainStep = 0) {
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    // チェインごとにペンタトニックで上がっていく
    const semi = PENTA[Math.min(chainStep, PENTA.length - 1)];
    const base = Util.clamp(560 / Math.max(0.4, sizeRatio), 220, 1100) * Math.pow(2, semi / 12);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(base, now);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.2);
    noiseBurst(0.09, 1900 + Math.random() * 900, 0.14);
  }

  function inflateStart(id) {
    if (!ctx || !sfxOn) return;
    inflateStop(id);
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(300, ctx.currentTime);
    f.frequency.linearRampToValueAtTime(900, ctx.currentTime + 1.4);
    const g = ctx.createGain(); g.gain.value = 0.06;
    const wob = ctx.createOscillator(); wob.frequency.value = 11;
    const wobG = ctx.createGain(); wobG.gain.value = 0.02;
    wob.connect(wobG); wobG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(); wob.start();
    inflateNodes.set(id, { src, wob, g });
  }
  function inflateStop(id) {
    const n = inflateNodes.get(id);
    if (!n) return;
    try { n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); n.src.stop(ctx.currentTime + 0.1); n.wob.stop(ctx.currentTime + 0.1); } catch (e) {}
    inflateNodes.delete(id);
  }

  function merge() {
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(330, now);
    o.frequency.exponentialRampToValueAtTime(90, now + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.3);
    noiseBurst(0.16, 700, 0.1, 'lowpass');
  }

  function chime(n = 3) { // ワイルド獲得・クリアなど
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const semi = 12 + PENTA[(i * 2) % PENTA.length];
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq(semi) * 2;
      const g = ctx.createGain();
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 1);
    }
  }

  function fanfare() { chime(6); noiseBurst(0.5, 2600, 0.08, 'highpass'); }

  function womp() { // 失敗（やわらかく）
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(200, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.9);
  }

  function tick() {
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.08);
  }

  function deny() {
    if (!ctx || !sfxOn) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 140;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.13);
  }

  function urchinPop() {
    if (!ctx || !sfxOn) return;
    noiseBurst(0.14, 3300, 0.16, 'highpass');
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, now);
    o.frequency.exponentialRampToValueAtTime(160, now + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(g); g.connect(sfxGain);
    o.start(now); o.stop(now + 0.16);
  }

  function setMusic(on) { musicOn = on; if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.2); }
  function setSfx(on) { sfxOn = on; if (sfxGain) sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05); }

  return { unlock, pop, inflateStart, inflateStop, merge, chime, fanfare, womp, tick, deny, urchinPop, setMusic, setSfx,
    get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
