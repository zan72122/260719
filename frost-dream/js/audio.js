'use strict';
/*
 * AudioSys — Web Audio API によるやさしいシンセ音。
 * 外部音源ファイルなし。すべてその場で合成する。
 * ペンタトニック音階だけを使うので、どこを触っても「はずれの音」が出ない。
 */
const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let started = false;
  let ambientTimer = null;
  let lastBoing = 0;
  let lastTick = 0;
  let lastAbsorb = 0;
  let lastShimmer = 0;

  // ド レ ミ ソ ラ のペンタトニック（2オクターブ半）
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00,
                 523.25, 587.33, 659.25, 783.99, 880.00,
                 1046.5, 1174.7, 1318.5];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (!started) {
      started = true;
      startAmbient();
    }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.55;
  }
  function isMuted() { return muted; }

  /* 基本トーン（正弦波＋エンベロープ） */
  function tone(opt) {
    if (!ctx || muted) return;
    const freq = opt.freq || 440;
    const dur = opt.dur || 0.5;
    const type = opt.type || 'sine';
    const gain = opt.gain !== undefined ? opt.gain : 0.15;
    const attack = opt.attack !== undefined ? opt.attack : 0.008;
    const delay = opt.delay || 0;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opt.freqTo) o.frequency.exponentialRampToValueAtTime(opt.freqTo, t0 + dur);
    if (opt.detune) o.detune.value = opt.detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /* きらきらしたチャイム（倍音つき） */
  function chime(idx, opt) {
    if (!ctx || muted) return;
    opt = opt || {};
    const i = ((idx % PENTA.length) + PENTA.length) % PENTA.length;
    const f = PENTA[i];
    const gn = opt.gain !== undefined ? opt.gain : 0.14;
    const d = opt.dur !== undefined ? opt.dur : 0.7;
    tone({ freq: f, dur: d, gain: gn, delay: opt.delay || 0 });
    tone({ freq: f * 2, dur: d * 0.6, gain: gn * 0.3, delay: opt.delay || 0 });
    tone({ freq: f * 3.01, dur: d * 0.35, gain: gn * 0.12, delay: opt.delay || 0 });
  }

  /* 道を描いているときの小さなキラッという音（呼び出し側が間引く必要なし） */
  function sparkleTick(yRatio) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastTick < 0.09) return;
    lastTick = now;
    // 画面の上のほうほど高い音
    const idx = clamp(Math.round((1 - yRatio) * (PENTA.length - 1)), 0, PENTA.length - 1);
    tone({ freq: PENTA[idx] * 2, dur: 0.18, gain: 0.045 });
  }

  /* まちがった惑星にぶつかったときの、やさしい「ぽよん」 */
  function boing() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastBoing < 0.25) return;
    lastBoing = now;
    tone({ freq: 320, freqTo: 160, dur: 0.22, gain: 0.09, type: 'sine' });
  }

  /* 粒子が惑星に吸い込まれたとき（満ちるほど音が上がる・連発は間引く） */
  function absorb(ratio) {
    if (!ctx || muted) return;
    const now2 = ctx.currentTime;
    if (now2 - lastAbsorb < 0.085) return;
    lastAbsorb = now2;
    chime(3 + Math.round(ratio * 8), { gain: 0.10, dur: 0.45 });
  }

  /* 群れの活発さに応じたきらめき（毎フレーム呼んでよい・内部で間引く） */
  function shimmer(activity) {
    if (!ctx || muted || activity <= 0) return;
    const now2 = ctx.currentTime;
    if (now2 - lastShimmer < 0.16) return;
    if (Math.random() > activity) return;
    lastShimmer = now2;
    tone({ freq: PENTA[randInt(5, 12)] * 2, dur: 0.22, gain: 0.028 });
  }

  /* フォーメーションが形になった瞬間のやわらかい和音 */
  function formationChord() {
    const root = randInt(0, 4);
    chime(root, { gain: 0.13, dur: 1.2 });
    chime(root + 2, { gain: 0.11, dur: 1.2, delay: 0.05 });
    chime(root + 4, { gain: 0.11, dur: 1.4, delay: 0.1 });
  }

  /* 惑星をタップしたときの声（惑星ごとに音がちがう） */
  function planetVoice(noteIdx) {
    chime(noteIdx, { gain: 0.16, dur: 0.8 });
    chime(noteIdx + 2, { gain: 0.08, dur: 0.6, delay: 0.09 });
  }

  /* 惑星が満開になったとき */
  function bloom(noteIdx) {
    chime(noteIdx, { delay: 0, gain: 0.16 });
    chime(noteIdx + 2, { delay: 0.11, gain: 0.16 });
    chime(noteIdx + 4, { delay: 0.22, gain: 0.18, dur: 1.0 });
    tone({ freq: 1200, freqTo: 2400, dur: 0.5, gain: 0.05, delay: 0.2 });
  }

  /* レベルクリアのファンファーレ */
  function fanfare() {
    const seq = [0, 2, 4, 5, 7, 9, 11];
    for (let i = 0; i < seq.length; i++) {
      chime(seq[i], { delay: i * 0.13, gain: 0.15, dur: 0.8 });
    }
    chime(12, { delay: seq.length * 0.13, gain: 0.2, dur: 1.6 });
    tone({ freq: 130.8, dur: 2.0, gain: 0.07, type: 'triangle', delay: 0.1 });
  }

  /* タップで星くずを出したとき */
  function twinkle() {
    chime(randInt(6, 11), { gain: 0.1, dur: 0.4 });
  }

  /* くじらの歌（低くゆったりとしたグライド） */
  function whaleSong() {
    tone({ freq: 150, freqTo: 235, dur: 1.4, gain: 0.11, attack: 0.25 });
    tone({ freq: 300, freqTo: 470, dur: 1.4, gain: 0.035, attack: 0.25 });
    tone({ freq: 228, freqTo: 165, dur: 1.7, gain: 0.07, attack: 0.3, delay: 0.9 });
  }

  /* 指を離したときの大きな「息」 */
  function exhale() {
    tone({ freq: 500, freqTo: 180, dur: 0.8, gain: 0.06, attack: 0.05 });
    chime(randInt(2, 6), { gain: 0.07, dur: 0.9 });
  }

  /* ホワイトノイズの風・しぶき（バッファは1度だけ作る） */
  let noiseBuf = null;
  function whoosh(dur, gain, f0, f1, delay) {
    if (!ctx || muted) return;
    if (!noiseBuf) {
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(Math.max(40, f0), t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* 静かに押さえているときの、やわらかい心拍 */
  function heartBeat() {
    tone({ freq: 76, freqTo: 52, dur: 0.2, gain: 0.13 });
    tone({ freq: 70, freqTo: 50, dur: 0.16, gain: 0.08, delay: 0.14 });
  }

  /* ためている間の、上がっていく音 */
  function chargeTick(lvl) {
    chime(2 + lvl * 2, { gain: 0.09, dur: 0.35 });
  }

  /* ためた玉の大爆発 */
  function bigBoom() {
    tone({ freq: 72, freqTo: 30, dur: 0.75, gain: 0.24, type: 'sine' });
    whoosh(0.7, 0.16, 1100, 130);
    chime(0, { delay: 0.12, gain: 0.14 });
    chime(4, { delay: 0.2, gain: 0.14 });
    chime(7, { delay: 0.28, gain: 0.16, dur: 1.2 });
  }

  /* 満ちた惑星の間欠泉 */
  function geyser() {
    whoosh(0.9, 0.1, 260, 1500);
    chime(randInt(5, 9), { delay: 0.15, gain: 0.07 });
    chime(randInt(8, 12), { delay: 0.32, gain: 0.05 });
  }

  /* 突風 */
  function gust() {
    whoosh(2.0, 0.07, 200, 80);
  }

  /* 彗星 */
  function comet() {
    whoosh(1.3, 0.05, 700, 2300);
    for (let i = 0; i < 5; i++) chime(2 + i * 2, { delay: i * 0.09, gain: 0.05 });
  }

  /* くじらの短い返事 */
  function whaleChirp() {
    if (!ctx || muted) return;
    const now2 = ctx.currentTime;
    if (now2 - lastBoing < 0.2) return;
    lastBoing = now2;
    tone({ freq: 260, freqTo: 430, dur: 0.3, gain: 0.1, attack: 0.04 });
    tone({ freq: 520, freqTo: 860, dur: 0.25, gain: 0.03, attack: 0.04 });
  }

  /* ブリーチの着水スプラッシュ */
  function splash() {
    whoosh(0.9, 0.2, 520, 85);
    tone({ freq: 95, freqTo: 42, dur: 0.7, gain: 0.2 });
    for (let i = 0; i < 4; i++) chime(randInt(6, 11), { delay: 0.1 + i * 0.07, gain: 0.06 });
  }

  /* 惑星のくすぐったい笑い */
  function giggle() {
    chime(9, { gain: 0.1, dur: 0.18 });
    chime(11, { delay: 0.08, gain: 0.1, dur: 0.18 });
    chime(8, { delay: 0.16, gain: 0.09, dur: 0.22 });
  }

  /* ひかりのちから：突入ファンファーレと終了の吐息 */
  function powerUp() {
    whoosh(0.7, 0.08, 300, 2600);
    const seq = [0, 4, 7, 9, 12];
    for (let i = 0; i < seq.length; i++) {
      chime(seq[i], { delay: i * 0.07, gain: 0.13, dur: 0.5 });
    }
  }
  function powerDown() {
    chime(7, { gain: 0.07, dur: 0.8 });
    chime(4, { delay: 0.18, gain: 0.06, dur: 1.0 });
  }

  /* 背景でゆっくり鳴りつづける、風鈴のような環境音 */
  function startAmbient() {
    if (ambientTimer) return;
    const step = () => {
      if (ctx && !muted && !document.hidden) {
        const i = randInt(0, 7);
        tone({ freq: PENTA[i], dur: rand(2.0, 3.5), gain: rand(0.02, 0.04), attack: 0.4 });
        if (Math.random() < 0.35) {
          tone({ freq: PENTA[i + 4] || PENTA[i], dur: 2.5, gain: 0.02, attack: 0.6, delay: 0.5 });
        }
      }
      ambientTimer = setTimeout(step, rand(2400, 5200));
    };
    ambientTimer = setTimeout(step, 800);
  }

  return {
    unlock, setMuted, isMuted,
    chime, sparkleTick, boing, absorb, shimmer, formationChord,
    planetVoice, bloom, fanfare, twinkle, whaleSong, exhale,
    heartBeat, chargeTick, bigBoom, geyser, gust, comet,
    whaleChirp, splash, giggle, powerUp, powerDown
  };
})();
