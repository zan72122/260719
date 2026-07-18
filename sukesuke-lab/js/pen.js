/* ノック式ボールペンの中身 */
window.GAMES.pen = (() => {
  const COLORS = ['#ff5d8f', '#ff9f43', '#f9ca24', '#4cd137', '#00a8ff', '#8f6bff'];
  const PRESS_MAX = 80;      // ノックの押し込み量(px)
  const REFILL_OUT = 58;     // 芯が出るときの移動量(px)

  let svg, raf, prev, fx, dom, time;
  let knock, refill;         // バネアニメ
  let engaged, maxPress, pressId, drawId, pressY0;
  let knockTimes, shakeT, dizzyT, surpriseT;
  let colorIdx, curPath, lastPt, ptCount;

  function build(stage) {
    svg = U.makeSvg(stage, 1000, 1000);
    engaged = false; maxPress = 0; pressId = null; drawId = null;
    knockTimes = []; shakeT = 0; dizzyT = 0; surpriseT = 0;
    colorIdx = 0; curPath = null; time = 0;
    knock = U.spring(0);
    refill = U.spring(0);
    dom = {};

    const defs = U.el('defs', {}, svg);
    const clip = U.el('clipPath', { id: 'penPaperClip' }, defs);
    U.el('rect', { x: 430, y: 130, width: 520, height: 510, rx: 24 }, clip);

    /* ---- 紙 ---- */
    U.el('rect', { x: 430, y: 130, width: 520, height: 510, rx: 24, fill: '#fffef8', stroke: '#e3d9ff', 'stroke-width': 6 }, svg);
    for (let i = 0; i < 4; i++) {
      U.el('line', { x1: 460, y1: 240 + i * 100, x2: 920, y2: 240 + i * 100, stroke: '#f0eaff', 'stroke-width': 4 }, svg);
    }
    dom.paperHint = U.text('かけるかな？', { x: 690, y: 195, 'text-anchor': 'middle', 'font-size': 34, fill: '#cbbcf5' }, svg);
    dom.strokes = U.el('g', { 'clip-path': 'url(#penPaperClip)', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);

    /* けしごむボタン */
    const eraser = U.el('g', {}, svg);
    U.el('circle', { cx: 890, cy: 700, r: 38, fill: '#ffe9a8', stroke: '#f5c542', 'stroke-width': 5 }, eraser);
    U.text('🧹', { x: 890, y: 714, 'text-anchor': 'middle', 'font-size': 40 }, eraser);

    /* ---- ペン全体（ゆれ用グループ） ---- */
    dom.pen = U.el('g', {}, svg);

    /* ノックまわりの「おしてね」リング */
    dom.pressRing = U.el('circle', { cx: 270, cy: 150, r: 70, fill: 'none', stroke: '#ffd93b', 'stroke-width': 8, opacity: 0.5 }, dom.pen);

    /* ノックボタン（プランジャー） */
    dom.plunger = U.el('g', {}, dom.pen);
    U.el('rect', { x: 235, y: 110, width: 70, height: 130, rx: 18, fill: '#ff6b81', stroke: '#e0455e', 'stroke-width': 5 }, dom.plunger);
    U.el('rect', { x: 251, y: 122, width: 14, height: 40, rx: 7, fill: '#ffffff', opacity: 0.55 }, dom.plunger);
    U.text('👇', { x: 270, y: 100, 'text-anchor': 'middle', 'font-size': 40 }, dom.plunger);

    /* 芯（リフィル）グループ */
    dom.refill = U.el('g', {}, dom.pen);
    U.el('rect', { x: 252, y: 250, width: 36, height: 340, rx: 12, fill: '#ffffff', opacity: 0.55, stroke: '#b9a7ff', 'stroke-width': 4 }, dom.refill);
    U.el('rect', { x: 258, y: 400, width: 24, height: 186, rx: 8, fill: '#ff7ab6' }, dom.refill);
    U.el('rect', { x: 246, y: 586, width: 48, height: 18, rx: 8, fill: '#b9a7ff' }, dom.refill);
    U.el('path', { d: 'M 258 604 L 270 700 L 282 604 Z', fill: '#9aa7b8', stroke: '#7f8fa6', 'stroke-width': 3 }, dom.refill);
    dom.tipBall = U.el('circle', { cx: 270, cy: 700, r: 7, fill: '#576574' }, dom.refill);

    /* インク玉（かお付き） */
    dom.inkBall = U.el('g', {}, dom.refill);
    U.el('circle', { cx: 270, cy: 372, r: 26, fill: '#ff7ab6', stroke: '#ffffff', 'stroke-width': 4 }, dom.inkBall);
    dom.eyeL = U.text('•', { x: 260, y: 372, 'text-anchor': 'middle', 'font-size': 26, fill: '#5d2a44' }, dom.inkBall);
    dom.eyeR = U.text('•', { x: 280, y: 372, 'text-anchor': 'middle', 'font-size': 26, fill: '#5d2a44' }, dom.inkBall);
    dom.mouth = U.el('path', { d: 'M 261 382 Q 270 390 279 382', fill: 'none', stroke: '#5d2a44', 'stroke-width': 3, 'stroke-linecap': 'round' }, dom.inkBall);

    /* ばね（芯のまわりにぐるぐる、目立つように上へ） */
    dom.spring = U.el('path', { fill: 'none', stroke: '#ff9f43', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.95 }, dom.pen);

    /* 透明ボディ（芯の上にかぶせてスケスケに） */
    U.el('rect', { x: 200, y: 200, width: 140, height: 420, rx: 28, fill: '#bfe6ff', opacity: 0.32, stroke: '#6fbfe6', 'stroke-width': 6 }, dom.pen);
    U.el('path', { d: 'M 212 620 L 258 728 L 282 728 L 328 620 Z', fill: '#bfe6ff', opacity: 0.32, stroke: '#6fbfe6', 'stroke-width': 6, 'stroke-linejoin': 'round' }, dom.pen);
    U.el('rect', { x: 208, y: 216, width: 16, height: 130, rx: 8, fill: '#ffffff', opacity: 0.5 }, dom.pen);

    /* 爪（ラッチ） */
    dom.latch = U.el('rect', { x: 332, y: 288, width: 36, height: 30, rx: 9, fill: '#ff5d8f', stroke: '#e0455e', 'stroke-width': 4 }, dom.pen);

    /* おえかきカーソル */
    dom.cursor = U.el('circle', { r: 12, fill: 'none', 'stroke-width': 5, opacity: 0 }, svg);

    fx = makeFxLayer(svg);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }

  function onDown(e) {
    const p = U.toView(svg, e.clientX, e.clientY);

    /* けしごむ */
    if (Math.hypot(p.x - 890, p.y - 700) < 48) {
      dom.strokes.innerHTML = '';
      fx.puff(890, 700, '#ffffff', 6);
      S.pop();
      return;
    }

    /* ノック */
    if (pressId === null && p.x > 170 && p.x < 370 && p.y > 50 && p.y < 300) {
      pressId = e.pointerId;
      pressY0 = p.y;
      maxPress = 0;
      knock.t = PRESS_MAX;   // タップだけでも押し込まれる
      maxPress = PRESS_MAX * 0.7;
      S.squish();
      return;
    }

    /* 紙 */
    if (drawId === null && p.x > 430 && p.x < 950 && p.y > 130 && p.y < 640) {
      if (engaged) {
        drawId = e.pointerId;
        const color = COLORS[colorIdx++ % COLORS.length];
        curPath = U.el('path', { d: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, stroke: color, 'stroke-width': 16 }, dom.strokes);
        lastPt = p; ptCount = 0;
        dom.cursor.setAttribute('opacity', 1);
        dom.cursor.setAttribute('stroke', color);
        moveCursor(p);
        dom.paperHint.setAttribute('opacity', 0);
        S.tick();
      } else {
        /* 芯が出てないよ！ */
        surpriseT = 1.2;
        S.wobble();
        fx.puff(p.x, p.y, '#e3d9ff', 4);
      }
    }
  }

  function onMove(e) {
    const p = U.toView(svg, e.clientX, e.clientY);
    if (e.pointerId === pressId) {
      knock.t = U.clamp(p.y - pressY0 + PRESS_MAX * 0.7, 0, PRESS_MAX);
      maxPress = Math.max(maxPress, knock.t);
    } else if (e.pointerId === drawId && curPath) {
      if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) > 7) {
        curPath.setAttribute('d', curPath.getAttribute('d') + ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        lastPt = p;
        moveCursor(p);
        if (++ptCount % 14 === 0) S.sparkle();
      }
    }
  }

  function onUp(e) {
    if (e.pointerId === pressId) {
      pressId = null;
      knock.t = 0;
      if (maxPress > 45) {
        toggleEngaged();
        const now = performance.now();
        knockTimes.push(now);
        knockTimes = knockTimes.filter(t => now - t < 1500);
        if (knockTimes.length >= 4) {
          knockTimes = [];
          shakeT = 1;
          dizzyT = 1.8;
          S.wobble();
          fx.burst(270, 380, '#ffd93b', 10);
        }
      }
    } else if (e.pointerId === drawId) {
      drawId = null;
      curPath = null;
      dom.cursor.setAttribute('opacity', 0);
    }
  }

  function moveCursor(p) {
    dom.cursor.setAttribute('cx', p.x);
    dom.cursor.setAttribute('cy', p.y);
  }

  function toggleEngaged() {
    engaged = !engaged;
    S.kachi();
    fx.burst(348, 303, '#ffd93b', 6, 11);
    if (engaged) {
      refill.t = REFILL_OUT;
      S.pop(0.1);
    } else {
      refill.t = 0;
      S.boing(280);
    }
  }

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(knock, dt, 1400, 16);
    U.stepSpring(refill, dt, 420, 8);   // びよんと戻る
    fx.step(dt);

    dom.plunger.setAttribute('transform', `translate(0 ${knock.p.toFixed(1)})`);
    dom.refill.setAttribute('transform', `translate(0 ${refill.p.toFixed(1)})`);

    /* ばね：芯のえりの下 〜 先端のなか（固定） */
    const springTop = 604 + refill.p;
    dom.spring.setAttribute('d', U.springPathV(270, springTop, 700, 4, 40));

    /* 爪：カチッと出入り */
    const latchX = U.lerp(parseFloat(dom.latch.getAttribute('x')), engaged ? 316 : 332, Math.min(1, dt * 18));
    dom.latch.setAttribute('x', latchX.toFixed(1));

    /* 「おしてね」リング：ふわふわ */
    dom.pressRing.setAttribute('opacity', (0.28 + 0.22 * Math.sin(time * 4)).toFixed(2));
    dom.pressRing.setAttribute('r', (66 + 6 * Math.sin(time * 4)).toFixed(1));

    /* ペンのゆれ（れんだギャグ） */
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const a = Math.sin(time * 42) * 7 * shakeT;
      dom.pen.setAttribute('transform', `rotate(${a.toFixed(2)} 270 420)`);
    } else {
      dom.pen.setAttribute('transform', '');
    }

    /* インク玉のかお */
    if (dizzyT > 0) {
      dizzyT -= dt;
      dom.eyeL.textContent = '×'; dom.eyeR.textContent = '×';
      dom.mouth.setAttribute('d', 'M 262 386 Q 270 380 278 386');
      dom.inkBall.setAttribute('transform', `rotate(${(Math.sin(time * 20) * 14).toFixed(1)} 270 372)`);
    } else if (surpriseT > 0) {
      surpriseT -= dt;
      dom.eyeL.textContent = '•'; dom.eyeR.textContent = '•';
      dom.mouth.setAttribute('d', 'M 266 382 a 4 5 0 1 0 8 0 a 4 5 0 1 0 -8 0');
      dom.inkBall.setAttribute('transform', '');
    } else {
      dom.eyeL.textContent = '•'; dom.eyeR.textContent = '•';
      dom.mouth.setAttribute('d', 'M 261 382 Q 270 390 279 382');
      const wig = U.clamp(refill.v * 0.03, -10, 10);
      dom.inkBall.setAttribute('transform', `rotate(${wig.toFixed(1)} 270 372)`);
    }

    raf = requestAnimationFrame(loop);
  }

  return {
    start(stage) {
      build(stage);
      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
})();
