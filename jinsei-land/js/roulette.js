/* じんせいゲームと いえば ルーレット！（1〜6） */
const Roulette = (() => {

  const SEG = 6;
  const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'];
  /* うえ（ポインタ位置）に くる 数字を きめる ためのならび */
  const NUMBERS = [1, 2, 3, 4, 5, 6];

  function create(canvas, onResult) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 14;
    const R = W / 2 - 34;

    let angle = 0;            /* いまの かいてん かく */
    let vel = 0;              /* かく そくど */
    let spinning = false;
    let enabled = false;
    let resolveSpin = null;
    let lastSeg = -1;
    let wobble = 0;           /* けっかの ぷるぷる */
    let resultSeg = -1;

    /* ドラッグ */
    let dragging = false;
    let lastPointerAngle = 0;
    let lastMoveTime = 0;
    let dragVel = 0;

    function segAt(a) {
      /* ポインタは うえ（-90°）。かいてんぶん を ひいて どのセグメントか */
      const rel = ((-Math.PI / 2 - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return Math.floor(rel / (Math.PI * 2 / SEG));
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      /* そとわく */
      ctx.beginPath();
      ctx.arc(cx, cy, R + 16, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R + 16, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f1dede';
      ctx.stroke();

      /* まわりの でんきゅう */
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + angle * 0.3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16), 5, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#ffd43b' : '#ff8fb1';
        ctx.fill();
      }

      const wob = wobble > 0 ? Math.sin(wobble * 24) * wobble * 0.05 : 0;

      /* セグメント */
      for (let i = 0; i < SEG; i++) {
        const a0 = angle + wob + i * Math.PI * 2 / SEG;
        const a1 = a0 + Math.PI * 2 / SEG;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = COLORS[i];
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        /* すうじ */
        const mid = (a0 + a1) / 2;
        ctx.save();
        ctx.translate(cx + Math.cos(mid) * R * 0.64, cy + Math.sin(mid) * R * 0.64);
        ctx.rotate(mid + Math.PI / 2);
        ctx.font = 'bold 64px "Hiragino Maru Gothic ProN", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(String(NUMBERS[i]), 0, 0);
        ctx.fillStyle = '#5c4a55';
        ctx.fillText(String(NUMBERS[i]), 0, 0);
        if (NUMBERS[i] === 6) {
          /* 「9」と まちがえない ように したせん */
          ctx.strokeStyle = '#5c4a55';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(-20, 40); ctx.lineTo(20, 40);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* まんなかの ボタン */
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.27, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffd43b';
      ctx.stroke();
      ctx.font = (R * 0.3) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spinning ? '😆' : '😊', cx, cy + 4);

      /* ポインタ（うえの さんかく） */
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy - R - 24);
      ctx.lineTo(cx + 22, cy - R - 24);
      ctx.lineTo(cx, cy - R + 12);
      ctx.closePath();
      ctx.fillStyle = '#ff5d8f';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      /* けっかを ハイライト */
      if (resultSeg >= 0 && !spinning) {
        const a0 = angle + resultSeg * Math.PI * 2 / SEG;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a0 + Math.PI * 2 / SEG);
        ctx.closePath();
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.stroke();
      }
    }

    function tickLoop(now) {
      /* かんせい で まわす */
      if (spinning && !dragging) {
        vel *= 0.976;
        angle += vel * (1 / 60);
        const s = segAt(angle);
        if (s !== lastSeg) { S.tick(); lastSeg = s; }
        if (Math.abs(vel) < 0.25) {
          /* とまった！ */
          spinning = false;
          resultSeg = segAt(angle);
          wobble = 1;
          const n = NUMBERS[resultSeg];
          S.ding();
          U.vibrate(60);
          if (resolveSpin) { const r = resolveSpin; resolveSpin = null; setTimeout(() => r(n), 550); }
        }
      }
      if (wobble > 0) wobble = Math.max(0, wobble - 1 / 40);
      draw();
      requestAnimationFrame(tickLoop);
    }
    requestAnimationFrame(tickLoop);

    function pointerAngle(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * W;
      const y = (e.clientY - rect.top) / rect.height * H;
      return Math.atan2(y - cy, x - cx);
    }

    function beginSpin(v) {
      spinning = true;
      resultSeg = -1;
      vel = v;
      lastSeg = segAt(angle);
      S.pop();
    }

    canvas.addEventListener('pointerdown', e => {
      if (!enabled || spinning) return;
      dragging = true;
      dragVel = 0;
      lastPointerAngle = pointerAngle(e);
      lastMoveTime = performance.now();
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const a = pointerAngle(e);
      const now = performance.now();
      let da = a - lastPointerAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      angle += da;
      const dt = Math.max(8, now - lastMoveTime) / 1000;
      dragVel = U.lerp(dragVel, da / dt, 0.5);
      lastPointerAngle = a;
      lastMoveTime = now;
      const s = segAt(angle);
      if (s !== lastSeg) { S.tick(); lastSeg = s; }
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (!enabled) return;
      const sp = Math.abs(dragVel);
      if (sp > 2.5) {
        /* びゅん！と はじいた */
        enabled = false;
        beginSpin(Math.sign(dragVel || 1) * U.clamp(sp, 8, 30));
      } else {
        /* ぽん と タップ → おまかせスピン */
        enabled = false;
        beginSpin((Math.random() < 0.5 ? -1 : 1) * U.rand(16, 27));
      }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    return {
      /* スピンできる ように して、けっかを まつ */
      waitForSpin() {
        return new Promise(res => {
          resolveSpin = res;
          enabled = true;
        });
      },
      /* CPU よう：かってに まわす */
      autoSpin() {
        return new Promise(res => {
          resolveSpin = res;
          enabled = false;
          beginSpin((Math.random() < 0.5 ? -1 : 1) * U.rand(16, 27));
        });
      },
      setEnabled(b) { enabled = b; },
      isSpinning() { return spinning; },
    };
  }

  return { create };
})();
