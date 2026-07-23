/* こまごました 道具箱 */
const U = {
  lerp(a, b, t) { return a + (b - a) * t; },
  clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); },
  rand(lo, hi) { return lo + Math.random() * (hi - lo); },
  randInt(lo, hi) { return Math.floor(U.rand(lo, hi + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  /* ゆっくり→はやい→ゆっくり */
  easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  wait(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* requestAnimationFrame ベースの アニメ。fn(t: 0→1)。 */
  tween(dur, fn) {
    return new Promise(resolve => {
      const t0 = performance.now();
      function step(now) {
        const t = U.clamp((now - t0) / dur, 0, 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  },

  vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },

  /* 絵文字を キャンバスに描いて テクスチャに */
  emojiTexture(emoji, size, bg) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size || 128;
    const g = cv.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.arc(cv.width / 2, cv.height / 2, cv.width / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.font = Math.floor(cv.width * 0.72) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, cv.width / 2, cv.height / 2 + cv.width * 0.04);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  },

  /* もじの スプライト（"+1" など） */
  textSprite(text, color, scale) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'bold 72px "Hiragino Maru Gothic ProN", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 14;
    g.strokeStyle = '#ffffff';
    g.strokeText(text, 128, 64);
    g.fillStyle = color || '#ff5d8f';
    g.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    const s = scale || 3;
    sp.scale.set(s * 2, s, 1);
    return sp;
  },

  disposeSprite(sp) {
    if (sp.material.map) sp.material.map.dispose();
    sp.material.dispose();
  },
};
