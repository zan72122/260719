/* =========================================================
 * sound.js — WebAudio 効果音シンセ + 英語読み上げ (TTS)
 * コースター用 (ガタンゴトン・ヒュー・発射) と
 * ミニゲーム用 (ポンプ・空気漏れ・ドラムロール) を追加
 * iOS Safari 対策: 最初のタッチで AudioContext と TTS をアンロック
 * ========================================================= */

const Sound = (() => {
  let ctx = null;
  let unlocked = false;
  let voice = null;
  let master = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const prefer = ['Samantha', 'Karen', 'Daniel', 'Google US English'];
    for (const name of prefer) {
      const v = voices.find(v => v.name === name);
      if (v) { voice = v; return; }
    }
    voice = voices.find(v => v.lang === 'en-US') ||
            voices.find(v => v.lang && v.lang.startsWith('en')) || null;
  }

  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
      pickVoice();
    }
  }

  /* ---------- シンセ部品 ---------- */

  function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.5,
                  slideTo = null, delay = 0, attack = 0.005 }) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, freq = 1200, delay = 0, q = 1 }) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
  }

  /* ---------- 効果音 ---------- */

  const fx = {
    click() { tone({ freq: 700, type: 'sine', dur: 0.06, vol: 0.25, slideTo: 1000 }); },
    pop() {
      tone({ freq: 420, type: 'square', dur: 0.09, vol: 0.22, slideTo: 900 });
      noise({ dur: 0.08, vol: 0.2, freq: 2000 });
    },
    chime() {
      [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.35, vol: 0.2, delay: i * 0.07 }));
    },
    star() {
      tone({ freq: 1046, type: 'sine', dur: 0.15, vol: 0.25 });
      tone({ freq: 1568, type: 'sine', dur: 0.28, vol: 0.2, delay: 0.08 });
    },
    boing() { tone({ freq: 160, type: 'sine', dur: 0.28, vol: 0.35, slideTo: 420 }); },
    wrong() { tone({ freq: 260, type: 'sine', dur: 0.18, vol: 0.25, slideTo: 190 }); },
    whoosh() { noise({ dur: 0.35, vol: 0.3, freq: 900 }); },
    tada() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((f, i) => {
        tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.25, delay: i * 0.11 });
        tone({ freq: f * 2, type: 'sine', dur: 0.25, vol: 0.1, delay: i * 0.11 });
      });
    },
    firework() {
      noise({ dur: 0.5, vol: 0.35, freq: 600 });
      [880, 1174, 1568].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.15, delay: 0.1 + i * 0.08 }));
    },

    /* --- コースター用 --- */
    clank() { // チェーンリフトのガチャン
      tone({ freq: 180, type: 'square', dur: 0.04, vol: 0.12 });
      noise({ dur: 0.03, vol: 0.12, freq: 1400 });
    },
    wheee() { // 下り坂の「ヒュー!」
      tone({ freq: 500, type: 'sine', dur: 0.7, vol: 0.22, slideTo: 1250 });
    },
    drop() { // 落下開始の「フワッ」
      tone({ freq: 900, type: 'sine', dur: 0.45, vol: 0.2, slideTo: 350 });
    },
    launch() { // J のジャンプ発射
      tone({ freq: 300, type: 'sawtooth', dur: 0.5, vol: 0.22, slideTo: 1200 });
      noise({ dur: 0.4, vol: 0.25, freq: 1800 });
    },
    bump() { // G のバンパー衝突
      tone({ freq: 120, type: 'square', dur: 0.15, vol: 0.3, slideTo: 80 });
      tone({ freq: 500, type: 'sine', dur: 0.3, vol: 0.2, slideTo: 900, delay: 0.12 });
    },
    depart() { // 出発のベル
      [880, 880].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.15, vol: 0.25, delay: i * 0.22 }));
    },

    /* --- ふうせんもじ用 --- */
    pump() { // 空気入れ「シュコッ」
      noise({ dur: 0.18, vol: 0.3, freq: 700, q: 2 });
      tone({ freq: 220, type: 'sine', dur: 0.15, vol: 0.15, slideTo: 320 });
    },
    inflate() { // ふくらむ「キュゥ」
      tone({ freq: 300, type: 'sine', dur: 0.25, vol: 0.15, slideTo: 520 });
    },
    leak() { // 空気漏れ「プスー!」(おなら風)
      const c = ensureCtx();
      if (!c) return;
      for (let i = 0; i < 9; i++) {
        tone({ freq: 90 + Math.random() * 60, type: 'sawtooth', dur: 0.1, vol: 0.2, delay: i * 0.09, slideTo: 70 });
      }
      noise({ dur: 0.9, vol: 0.22, freq: 500, q: 3 });
    },
    floatUp() { // ふわ~っと上昇
      [392, 494, 587, 784].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 0.4, vol: 0.16, delay: i * 0.14 }));
    },

    /* --- もじオルゴール用 --- */
    note(freq, dur, delay = 0) { // オルゴールのやわらかい音色 (倍音つき)
      tone({ freq, type: 'sine', dur: Math.max(0.22, dur * 0.95), vol: 0.22, delay });
      tone({ freq: freq * 2, type: 'sine', dur: 0.16, vol: 0.07, delay });
      tone({ freq: freq * 4, type: 'sine', dur: 0.09, vol: 0.035, delay });
    },
    slide(f0, f1, dur, delay = 0) { // 線の上り下り = グリッサンド
      tone({ freq: f0, slideTo: f1, type: 'sine', dur: Math.max(0.18, dur * 0.95), vol: 0.2, delay });
      tone({ freq: f0 * 2, slideTo: f1 * 2, type: 'sine', dur: Math.max(0.14, dur * 0.7), vol: 0.05, delay });
    },

    /* --- さかさまサーカス用 --- */
    drumroll() {
      for (let i = 0; i < 16; i++) noise({ dur: 0.05, vol: 0.14, freq: 250, delay: i * 0.055, q: 2 });
    },
    cymbal() { noise({ dur: 0.7, vol: 0.3, freq: 5000, q: 0.6 }); },
    spin() { tone({ freq: 400, type: 'sine', dur: 0.5, vol: 0.15, slideTo: 900 }); },
  };

  /* ---------- 読み上げ ---------- */

  let speakTimer = null;

  function speak(text, { rate = 0.85, pitch = 1.15, interrupt = true } = {}) {
    if (!('speechSynthesis' in window)) return;
    if (interrupt) {
      speechSynthesis.cancel();
      clearTimeout(speakTimer);
    }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = (voice && voice.lang) || 'en-US';
    u.rate = rate;
    u.pitch = pitch;
    speechSynthesis.speak(u);
  }

  function speakSequence(parts, gap = 500) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    clearTimeout(speakTimer);
    let i = 0;
    const next = () => {
      if (i >= parts.length) return;
      const part = parts[i++];
      speak(part.text, { ...part, interrupt: false });
      speakTimer = setTimeout(next, (part.wait || gap));
    };
    next();
  }

  return { unlock, fx, speak, speakSequence };
})();

window.Sound = Sound;
