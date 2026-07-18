/* 石けんポンプの中身 */
window.GAMES.pump = (() => {
  const MODES = {
    sara: { label: 'さらさら', icon: '💧', liquid: '#7bed9f', deep: '#35c46f', interval: 0.05, g: 1800, vx: 380, r: 9,  use: 0.025, foam: false },
    toro: { label: 'とろとろ', icon: '🍯', liquid: '#ffb8d9', deep: '#ff6fae', interval: 0.3,  g: 500,  vx: 205, r: 21, use: 0.13,  foam: false },
    awa:  { label: 'あわあわ', icon: '🫧', liquid: '#a8dcff', deep: '#5ab7f0', interval: 0.1,  g: 300,  vx: 165, r: 15, use: 0.045, foam: true },
  };

  let svg, raf, prev, fx, dom, time;
  let mode, stroke, pressing;
  let level, chamberFill, inletOpen, flapOpen;
  let drops, pile, sparks, dirt;
  let emitTimer, suckSndT, gagT, cleanCelebT, pouringT, refillShown, emitSndN;

  function build(stage) {
    svg = U.makeSvg(stage, 1000, 1000);
    mode = 'sara';
    stroke = U.spring(0);
    pressing = false;
    level = 1; chamberFill = 1; inletOpen = 0; flapOpen = 0;
    drops = []; pile = []; sparks = [];
    emitTimer = 0; suckSndT = 0; gagT = 0; cleanCelebT = 0; pouringT = 0; refillShown = false; emitSndN = 0;
    time = 0;
    dom = {};

    /* ---- 手（よごれつき） ---- */
    const hand = U.el('g', {}, svg);
    const skin = '#ffd9b8', skinLine = '#eab98d';
    [706, 752, 798, 844].forEach((x, i) => {
      U.el('rect', { x, y: 505 - (i === 1 || i === 2 ? 22 : 0), width: 40, height: 130, rx: 20, fill: skin, stroke: skinLine, 'stroke-width': 4 }, hand);
    });
    U.el('ellipse', { cx: 672, cy: 640, rx: 30, ry: 52, transform: 'rotate(30 672 640)', fill: skin, stroke: skinLine, 'stroke-width': 4 }, hand);
    U.el('ellipse', { cx: 795, cy: 655, rx: 112, ry: 95, fill: skin, stroke: skinLine, 'stroke-width': 5 }, hand);
    dom.handEyeL = U.text('•', { x: 765, y: 655, 'text-anchor': 'middle', 'font-size': 30, fill: '#8a5a3a' }, hand);
    dom.handEyeR = U.text('•', { x: 825, y: 655, 'text-anchor': 'middle', 'font-size': 30, fill: '#8a5a3a' }, hand);
    dom.handMouth = U.el('path', { d: 'M 775 675 Q 795 688 815 675', fill: 'none', stroke: '#8a5a3a', 'stroke-width': 4, 'stroke-linecap': 'round' }, hand);

    dirt = [];
    [[740, 590], [850, 605], [790, 705], [722, 668], [862, 668]].forEach(([x, y]) => {
      const el = U.el('ellipse', { cx: x, cy: y, rx: U.rand(15, 22), ry: U.rand(12, 17), fill: '#a67c52', opacity: 0.9, transform: `rotate(${U.rand(-30, 30)} ${x} ${y})` }, hand);
      dirt.push({ el, x, y, on: true, hp: 3 });
    });

    /* あわの山 */
    dom.pileG = U.el('g', {}, svg);

    /* ---- ボトル ---- */
    dom.liquid = U.el('rect', { x: 188, y: 450, width: 284, height: 382, rx: 28, fill: MODES.sara.liquid, opacity: 0.75 }, svg);
    dom.tubeLiquid = U.el('rect', { x: 320, y: 368, width: 20, height: 428, fill: MODES.sara.deep, opacity: 0.8 }, svg);
    U.el('rect', { x: 180, y: 420, width: 300, height: 420, rx: 40, fill: '#dff2ff', opacity: 0.3, stroke: '#7fc4e8', 'stroke-width': 6 }, svg);
    U.el('rect', { x: 196, y: 445, width: 20, height: 180, rx: 10, fill: '#ffffff', opacity: 0.5 }, svg);
    U.el('rect', { x: 290, y: 360, width: 80, height: 66, fill: '#dff2ff', opacity: 0.35, stroke: '#7fc4e8', 'stroke-width': 6 }, svg);
    /* すいこみパイプ */
    U.el('rect', { x: 314, y: 360, width: 32, height: 440, rx: 10, fill: 'none', stroke: '#9fd6f2', 'stroke-width': 5 }, svg);
    /* すいこみ弁（赤いボール） */
    U.el('path', { d: 'M 306 404 L 322 392 M 354 404 L 338 392', stroke: '#7fc4e8', 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
    dom.inletBall = U.el('circle', { cx: 330, cy: 388, r: 16, fill: '#ff6b6b', stroke: '#e05555', 'stroke-width': 4 }, svg);

    /* シリンダー */
    U.el('rect', { x: 292, y: 250, width: 76, height: 112, rx: 10, fill: '#dff2ff', opacity: 0.35, stroke: '#7fc4e8', 'stroke-width': 6 }, svg);
    dom.chamberLiquid = U.el('rect', { x: 298, y: 300, width: 64, height: 58, fill: MODES.sara.liquid, opacity: 0.85 }, svg);

    /* ---- 動くヘッド ---- */
    dom.head = U.el('g', {}, svg);
    U.el('rect', { x: 316, y: 226, width: 28, height: 48, fill: '#cbd6e0', stroke: '#9aa7b8', 'stroke-width': 4 }, dom.head);
    dom.piston = U.el('rect', { x: 296, y: 258, width: 68, height: 24, rx: 8, fill: '#8f6bff', stroke: '#7052d6', 'stroke-width': 4 }, dom.head);
    /* ノズル */
    U.el('rect', { x: 400, y: 172, width: 160, height: 36, rx: 14, fill: '#ffb8d9', stroke: '#ff8fc0', 'stroke-width': 5 }, dom.head);
    U.el('rect', { x: 532, y: 172, width: 46, height: 78, rx: 16, fill: '#ffb8d9', stroke: '#ff8fc0', 'stroke-width': 5 }, dom.head);
    /* おしだし弁（みどりのフタ） */
    dom.flap = U.el('rect', { x: 404, y: 178, width: 12, height: 40, rx: 6, fill: '#4cd137', stroke: '#38a52a', 'stroke-width': 3 }, dom.head);
    /* おすところ */
    U.el('rect', { x: 240, y: 150, width: 180, height: 84, rx: 26, fill: '#ff8fc0', stroke: '#ff6fae', 'stroke-width': 6 }, dom.head);
    U.el('rect', { x: 258, y: 164, width: 60, height: 18, rx: 9, fill: '#ffffff', opacity: 0.55 }, dom.head);
    U.text('👇', { x: 330, y: 140, 'text-anchor': 'middle', 'font-size': 40 }, dom.head);

    /* つめかえボタン */
    dom.refillBtn = U.el('g', { opacity: 0 }, svg);
    U.el('circle', { cx: 110, cy: 300, r: 62, fill: '#ffe9a8', stroke: '#f5c542', 'stroke-width': 6 }, dom.refillBtn);
    U.text('🫗', { x: 110, y: 320, 'text-anchor': 'middle', 'font-size': 58 }, dom.refillBtn);
    /* そそぎこみのながれ */
    dom.pourStream = U.el('rect', { x: 320, y: 40, width: 20, height: 390, rx: 10, fill: MODES.sara.deep, opacity: 0 }, svg);

    /* ---- モードボタン ---- */
    dom.modeBtns = {};
    let bx = 55;
    for (const key of Object.keys(MODES)) {
      const m = MODES[key];
      const g = U.el('g', { 'data-mode': key }, svg);
      const r = U.el('rect', { x: bx, y: 872, width: 280, height: 104, rx: 30, fill: m.liquid, stroke: m.deep, 'stroke-width': 5 }, g);
      U.text(m.icon, { x: bx + 52, y: 942, 'text-anchor': 'middle', 'font-size': 46 }, g);
      U.text(m.label, { x: bx + 168, y: 940, 'text-anchor': 'middle', 'font-size': 42, fill: '#ffffff', style: 'paint-order:stroke', stroke: m.deep, 'stroke-width': 5 }, g);
      dom.modeBtns[key] = { g, r };
      bx += 305;
    }

    dom.dropsG = U.el('g', {}, svg);
    dom.sparksG = U.el('g', {}, svg);
    fx = makeFxLayer(svg);

    setMode('sara');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }

  function setMode(key) {
    mode = key;
    const m = MODES[key];
    dom.liquid.setAttribute('fill', m.liquid);
    dom.tubeLiquid.setAttribute('fill', m.deep);
    dom.chamberLiquid.setAttribute('fill', m.liquid);
    dom.pourStream.setAttribute('fill', m.deep);
    for (const k in dom.modeBtns) {
      dom.modeBtns[k].r.setAttribute('stroke-width', k === key ? 10 : 5);
      dom.modeBtns[k].g.setAttribute('transform', k === key ? 'translate(0 -10)' : '');
    }
  }

  function onDown(e) {
    const p = U.toView(svg, e.clientX, e.clientY);

    /* モードきりかえ */
    if (p.y > 850) {
      const idx = Math.floor((p.x - 55) / 305);
      const keys = Object.keys(MODES);
      if (idx >= 0 && idx < keys.length) {
        setMode(keys[idx]);
        S.blub();
        S.sparkle();
      }
      return;
    }

    /* つめかえ */
    if (refillShown && Math.hypot(p.x - 110, p.y - 300) < 72) {
      refillShown = false;
      dom.refillBtn.setAttribute('opacity', 0);
      pouringT = 1.6;
      S.blub();
      return;
    }

    /* ポンプヘッド */
    if (p.x > 220 && p.x < 600 && p.y > 110 && p.y < 320) {
      pressing = true;
      stroke.t = 1;
      if (level <= 0.02 && chamberFill <= 0.02) {
        S.empty();
        fx.puff(560, 250, '#e8f4ff', 4);
      } else {
        S.squish();
      }
    }
  }

  function onUp() {
    if (pressing) {
      pressing = false;
      stroke.t = 0;
    }
  }

  function spawnDrop() {
    const m = MODES[mode];
    const sy = 252 + stroke.p * 70;
    let el;
    if (m.foam) {
      el = U.el('g', {}, dom.dropsG);
      for (let i = 0; i < 4; i++) {
        U.el('circle', { cx: U.rand(-10, 10), cy: U.rand(-8, 8), r: U.rand(7, 12), fill: '#ffffff', stroke: '#bfe4ff', 'stroke-width': 2.5, opacity: 0.95 }, el);
      }
    } else {
      el = U.el('circle', { r: m.r, fill: m.deep, opacity: 0.95 }, dom.dropsG);
    }
    drops.push({
      el, x: 555, y: sy,
      vx: m.vx * U.rand(0.85, 1.1),
      vy: U.rand(10, 60),
      g: m.g, r: m.r, foam: m.foam,
    });
    emitSndN++;
    if (m.foam) { if (emitSndN % 2 === 0) S.pop(); }
    else if (mode === 'toro') S.squish();
    else if (emitSndN % 3 === 0) S.tick();
  }

  function landDrop(d) {
    const m = MODES[mode];
    /* いちばん近いよごれをきれいに */
    let best = null, bd = 1e9;
    for (const s of dirt) {
      if (!s.on) continue;
      const dd = Math.hypot(s.x - d.x, s.y - d.y);
      if (dd < bd) { bd = dd; best = s; }
    }
    if (best && bd < 160) {
      best.hp--;
      if (best.hp <= 0) {
        best.on = false;
        best.el.setAttribute('opacity', 0);
        fx.burst(best.x, best.y, '#a7e8ff', 6, 10);
        S.sparkle();
        if (dirt.every(s => !s.on)) {
          cleanCelebT = 1.6;
          S.yay();
          fx.burst(795, 640, '#ffd93b', 12);
        }
      } else {
        best.el.setAttribute('opacity', (0.9 * best.hp / 3).toFixed(2));
        fx.puff(best.x, best.y, '#e8f8ff', 2);
      }
    }
    /* あわの山にたす */
    const px = U.clamp(d.x + U.rand(-30, 30), 700, 890);
    const py = 585 - pile.length * 7 + U.rand(-10, 10);
    const el = U.el('circle', {
      cx: px, cy: py, r: d.foam ? U.rand(12, 20) : U.rand(9, 15),
      fill: '#ffffff', stroke: d.foam ? '#bfe4ff' : m.liquid, 'stroke-width': 3, opacity: 0.95,
    }, dom.pileG);
    pile.push({ el, x: px, y: py });
    if (pile.length > 24 && gagT <= 0) {
      gagT = 1.1;
      S.wobble();
    }
  }

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;
    const m = MODES[mode];

    U.stepSpring(stroke, dt, 260, 11);
    fx.step(dt);

    const sPix = stroke.p * 70;
    dom.head.setAttribute('transform', `translate(0 ${sPix.toFixed(1)})`);

    /* 押し下げ → 石けんが出る */
    let emitting = false;
    if (stroke.v > 0.25 && stroke.p > 0.06 && chamberFill > 0) {
      emitting = true;
      emitTimer -= dt;
      if (emitTimer <= 0) {
        emitTimer = m.interval;
        spawnDrop();
        chamberFill = Math.max(0, chamberFill - m.use);
      }
    }
    flapOpen += ((emitting ? 1 : 0) - flapOpen) * Math.min(1, dt * 14);
    dom.flap.setAttribute('transform', `rotate(${(-70 * flapOpen).toFixed(1)} 410 178)`);

    /* 引き上げ → すいこむ */
    let sucking = false;
    if (stroke.v < -0.25 && level > 0 && chamberFill < 1) {
      sucking = true;
      chamberFill = Math.min(1, chamberFill + dt * 1.4);
      level = Math.max(0, level - dt * 0.11);
      suckSndT -= dt;
      if (suckSndT <= 0) { suckSndT = 0.22; S.blub(); }
      /* キラキラがパイプをのぼる */
      if (Math.random() < 0.6) {
        const el = U.el('path', { d: U.starPath(0, 0, U.rand(5, 9)), fill: '#ffffff', opacity: 0.95 }, dom.sparksG);
        sparks.push({ el, x: U.rand(320, 340), y: U.rand(680, 790), vy: -U.rand(500, 750), life: U.rand(0.5, 0.75), age: 0 });
      }
    }
    inletOpen += ((sucking ? 1 : 0) - inletOpen) * Math.min(1, dt * 12);
    dom.inletBall.setAttribute('cy', (388 - inletOpen * 26).toFixed(1));

    if (level <= 0.02 && chamberFill <= 0.02 && !refillShown && pouringT <= 0) {
      refillShown = true;
      dom.refillBtn.setAttribute('opacity', 1);
      S.empty();
    }

    /* つめかえ中 */
    if (pouringT > 0) {
      pouringT -= dt;
      dom.pourStream.setAttribute('opacity', pouringT > 0.15 ? 0.9 : pouringT * 6);
      level = Math.min(1, level + dt * 0.7);
      if (Math.random() < 0.3) fx.burst(330, U.rand(430, 700), '#ffffff', 1, 8);
      if (Math.random() < 0.12) S.blub();
      if (pouringT <= 0) { S.sparkle(); dom.pourStream.setAttribute('opacity', 0); }
    }

    /* ボトルとシリンダーの液 */
    const levelY = 830 - level * 375;
    dom.liquid.setAttribute('y', levelY.toFixed(1));
    dom.liquid.setAttribute('height', Math.max(2, 832 - levelY).toFixed(1));
    dom.tubeLiquid.setAttribute('opacity', level > 0.04 ? 0.8 : 0.15);
    const pistonBottom = 282 + sPix;
    const chTop = Math.max(pistonBottom, 358 - chamberFill * 74);
    dom.chamberLiquid.setAttribute('y', chTop.toFixed(1));
    dom.chamberLiquid.setAttribute('height', Math.max(1, 358 - chTop).toFixed(1));

    /* とんでいく石けん */
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += d.g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.foam) {
        d.el.setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${(d.x * 0.5).toFixed(0)})`);
      } else {
        const stretch = U.clamp(1 + d.vy / 2500, 1, 1.8);
        d.el.setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) scale(1 ${stretch.toFixed(2)})`);
      }
      if (d.y > 555 && d.x > 680 && d.x < 900) {
        d.el.remove(); drops.splice(i, 1);
        landDrop(d);
      } else if (d.y > 970 || d.x > 1010) {
        d.el.remove(); drops.splice(i, 1);
        fx.puff(Math.min(d.x, 990), 960, '#ffffff', 3);
        S.blub();
      }
    }

    /* パイプのキラキラ */
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { s.el.remove(); sparks.splice(i, 1); continue; }
      s.y += s.vy * dt;
      s.el.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${(s.age * 400).toFixed(0)})`);
      s.el.setAttribute('opacity', (1 - s.age / s.life).toFixed(2));
    }

    /* あわの山もりもりギャグ */
    if (gagT > 0) {
      gagT -= dt;
      dom.pileG.setAttribute('transform', `translate(${(Math.sin(time * 30) * 10 * gagT).toFixed(1)} 0)`);
      if (gagT <= 0) {
        pile.forEach(b => {
          fx.burst(b.x, b.y, '#ffffff', 1, 10);
          b.el.remove();
        });
        pile = [];
        dom.pileG.setAttribute('transform', '');
        S.sparkle();
        S.pop();
        S.pop(0.12);
      }
    }

    /* 手のかお */
    if (cleanCelebT > 0) {
      cleanCelebT -= dt;
      dom.handEyeL.textContent = '＾'; dom.handEyeR.textContent = '＾';
      dom.handMouth.setAttribute('d', 'M 772 672 Q 795 695 818 672');
      if (cleanCelebT <= 0) {
        dirt.forEach(s => { s.on = true; s.hp = 3; s.el.setAttribute('opacity', 0.9); });
        S.blub();
      }
    } else {
      dom.handEyeL.textContent = '•'; dom.handEyeR.textContent = '•';
      dom.handMouth.setAttribute('d', 'M 775 675 Q 795 688 815 675');
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
