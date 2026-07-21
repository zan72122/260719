/* =========================================================
 * sound.js — WebAudio 効果音シンセ + 英語読み上げ (TTS)
 * iOS Safari 対策: 最初のタッチで AudioContext と
 * speechSynthesis の両方をアンロックする
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
    // iOS の自然な英語音声を優先
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
    // 無音の発話で TTS をアンロック
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

  function noise({ dur = 0.2, vol = 0.3, freq = 1200, delay = 0 }) {
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
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
  }

  /* ---------- ゲーム効果音 ---------- */

  const fx = {
    // 衝突音: 重い文字ほど低い「ドスン」、軽い文字ほど高い「コツン」
    thud(mass, strength = 1) {
      const f = Math.max(60, 340 - mass * 55);
      tone({ freq: f, type: 'triangle', dur: 0.12, vol: Math.min(0.5, 0.14 * strength), slideTo: f * 0.5 });
      noise({ dur: 0.05, vol: Math.min(0.25, 0.06 * strength), freq: 400 + f });
    },
    // i の点の音: キラッとした鈴の音
    dotChime() {
      tone({ freq: 1660, type: 'sine', dur: 0.3, vol: 0.25 });
      tone({ freq: 2490, type: 'sine', dur: 0.4, vol: 0.15, delay: 0.03 });
    },
    boing() {
      tone({ freq: 160, type: 'sine', dur: 0.28, vol: 0.35, slideTo: 420 });
    },
    pop() {
      tone({ freq: 420, type: 'square', dur: 0.09, vol: 0.22, slideTo: 900 });
      noise({ dur: 0.08, vol: 0.2, freq: 2000 });
    },
    click() {
      tone({ freq: 700, type: 'sine', dur: 0.06, vol: 0.25, slideTo: 1000 });
    },
    spawn() {
      tone({ freq: 500, type: 'sine', dur: 0.14, vol: 0.25, slideTo: 950 });
    },
    chime() {
      [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.35, vol: 0.2, delay: i * 0.07 }));
    },
    wrong() {
      tone({ freq: 260, type: 'sine', dur: 0.18, vol: 0.25, slideTo: 190 });
    },
    whoosh() {
      noise({ dur: 0.35, vol: 0.3, freq: 900 });
    },
    star() {
      tone({ freq: 1046, type: 'sine', dur: 0.18, vol: 0.25 });
      tone({ freq: 1568, type: 'sine', dur: 0.3, vol: 0.2, delay: 0.09 });
    },
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
    roll() {
      noise({ dur: 0.12, vol: 0.05, freq: 300 });
    },
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

  // 少し間をあけて続けて話す ("B!" → "buh" → "Ball!")
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

  function speakLetter(ch) {
    const info = window.GameData.LETTERS[ch.toUpperCase()];
    if (!info) return;
    speakSequence([
      { text: ch.toUpperCase() + '!', wait: 700 },
      { text: info.phonic, rate: 0.7, wait: 700 },
      { text: info.word + '!', wait: 0 },
    ]);
  }

  function speakWord(word) {
    const parts = word.split('').map(ch => ({ text: ch, wait: 550, pitch: 1.2 }));
    parts.push({ text: word + '!', rate: 0.8, wait: 0 });
    speakSequence(parts);
  }

  return { unlock, fx, speak, speakSequence, speakLetter, speakWord };
})();

window.Sound = Sound;
