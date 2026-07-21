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

  /* 星の子を吸い込んだとき（進み具合で音が上がる） */
  function absorb(step) {
    chime(3 + step, { gain: 0.13, dur: 0.5 });
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
    chime, sparkleTick, boing, absorb,
    planetVoice, bloom, fanfare, twinkle
  };
})();
