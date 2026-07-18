/* 傘の中身 */
window.GAMES.umbrella = (() => {
  const HUB = { x: 500, y: 230 };
  const L = 310;                 // 骨のながさ
  const PIVOT = { x: 500, y: 690 };
  const CHICK = { x: 660, y: 852 };
  const CLOUD = { x: 140, y: 130 };

  let svg, raf, prev, fx, dom, time;
  let open, flip, tilt;          // バネアニメ
  let wind, gustT, flipDelay;
  let drops, tiltId, wetT, tickT, chickBounce;

  function build(stage) {
    svg = U.makeSvg(stage, 1000, 1000);
    open = U.spring(0);
    flip = U.spring(0);
    tilt = U.spring(0);
    wind = 0; gustT = 0; flipDelay = -1;
    drops = []; tiltId = null; wetT = 0; tickT = 0; chickBounce = 0;
    time = 0;
    dom = {};

    const defs = U.el('defs', {}, svg);
    const grad = U.el('linearGradient', { id: 'umbRainbow', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [['0%', '#ff8fb5'], ['25%', '#ffc46b'], ['50%', '#ffe97a'], ['75%', '#8fe3a5'], ['100%', '#8fc6ff']].forEach(([o, c]) => {
      U.el('stop', { offset: o, 'stop-color': c }, grad);
    });

    /* じめん */
    U.el('rect', { x: 0, y: 920, width: 1000, height: 80, fill: '#bfe8c8', opacity: 0.7 }, svg);

    /* くも（かぜボタン） */
    dom.cloud = U.el('g', {}, svg);
    U.el('ellipse', { cx: CLOUD.x, cy: CLOUD.y + 14, rx: 78, ry: 42, fill: '#eef6ff', stroke: '#c9dff2', 'stroke-width': 5 }, dom.cloud);
    U.el('circle', { cx: CLOUD.x - 34, cy: CLOUD.y - 8, r: 36, fill: '#eef6ff', stroke: '#c9dff2', 'stroke-width': 5 }, dom.cloud);
    U.el('circle', { cx: CLOUD.x + 26, cy: CLOUD.y - 16, r: 42, fill: '#eef6ff', stroke: '#c9dff2', 'stroke-width': 5 }, dom.cloud);
    U.el('ellipse', { cx: CLOUD.x, cy: CLOUD.y + 12, rx: 76, ry: 40, fill: '#eef6ff' }, dom.cloud);
    U.text('•', { x: CLOUD.x - 18, y: CLOUD.y + 12, 'text-anchor': 'middle', 'font-size': 26, fill: '#6b87a5' }, dom.cloud);
    U.text('•', { x: CLOUD.x + 18, y: CLOUD.y + 12, 'text-anchor': 'middle', 'font-size': 26, fill: '#6b87a5' }, dom.cloud);
    U.el('path', { d: `M ${CLOUD.x - 12} ${CLOUD.y + 26} Q ${CLOUD.x} ${CLOUD.y + 34} ${CLOUD.x + 12} ${CLOUD.y + 26}`, fill: 'none', stroke: '#6b87a5', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, dom.cloud);
    U.text('💨', { x: CLOUD.x + 78, y: CLOUD.y + 56, 'text-anchor': 'middle', 'font-size': 34 }, dom.cloud);

    /* ひよこ */
    dom.chick = U.el('g', {}, svg);
    U.el('ellipse', { cx: CHICK.x - 16, cy: CHICK.y + 44, rx: 14, ry: 7, fill: '#ff9f43' }, dom.chick);
    U.el('ellipse', { cx: CHICK.x + 16, cy: CHICK.y + 44, rx: 14, ry: 7, fill: '#ff9f43' }, dom.chick);
    U.el('circle', { cx: CHICK.x, cy: CHICK.y, r: 44, fill: '#ffd93b', stroke: '#f0b429', 'stroke-width': 4 }, dom.chick);
    U.el('ellipse', { cx: CHICK.x + 26, cy: CHICK.y + 8, rx: 14, ry: 20, fill: '#ffcf1f' }, dom.chick);
    dom.chickEyeL = U.text('•', { x: CHICK.x - 14, y: CHICK.y - 2, 'text-anchor': 'middle', 'font-size': 26, fill: '#5d4a1a' }, dom.chick);
    dom.chickEyeR = U.text('•', { x: CHICK.x + 12, y: CHICK.y - 2, 'text-anchor': 'middle', 'font-size': 26, fill: '#5d4a1a' }, dom.chick);
    U.el('path', { d: `M ${CHICK.x - 4} ${CHICK.y + 10} L ${CHICK.x + 12} ${CHICK.y + 16} L ${CHICK.x - 4} ${CHICK.y + 22} Z`, fill: '#ff9f43' }, dom.chick);

    /* ---- かさ（かたむきグループ） ---- */
    dom.umb = U.el('g', {}, svg);

    /* え（棒）スケスケ */
    U.el('rect', { x: 488, y: 226, width: 24, height: 534, rx: 10, fill: '#e8f4ff', opacity: 0.4, stroke: '#9fd6f2', 'stroke-width': 5 }, dom.umb);
    U.el('path', { d: 'M 500 758 Q 500 812 452 812 Q 418 812 418 782', fill: 'none', stroke: '#8f6bff', 'stroke-width': 16, 'stroke-linecap': 'round' }, dom.umb);
    U.el('circle', { cx: 500, cy: 214, r: 15, fill: '#ff9f43', stroke: '#e08a2e', 'stroke-width': 4 }, dom.umb);

    /* なかのばね と ランナー */
    dom.spring = U.el('path', { fill: 'none', stroke: '#ff9f43', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dom.umb);
    dom.runner = U.el('rect', { x: 480, y: 590, width: 40, height: 22, rx: 9, fill: '#ff6fae', stroke: '#e0559a', 'stroke-width': 4 }, dom.umb);
    dom.stretchL = U.el('line', { stroke: '#b9a7ff', 'stroke-width': 8, 'stroke-linecap': 'round' }, dom.umb);
    dom.stretchR = U.el('line', { stroke: '#b9a7ff', 'stroke-width': 8, 'stroke-linecap': 'round' }, dom.umb);

    /* かさのぬの と ほね */
    dom.canopy = U.el('path', { fill: 'url(#umbRainbow)', opacity: 0.78, stroke: '#8f6bff', 'stroke-width': 5, 'stroke-linejoin': 'round' }, dom.umb);
    dom.ribs = U.el('g', { stroke: '#7a5ce0', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }, dom.umb);
    dom.ribL = U.el('line', {}, dom.ribs);
    dom.ribR = U.el('line', {}, dom.ribs);
    dom.ribML = U.el('line', { 'stroke-width': 4, opacity: 0.6 }, dom.ribs);
    dom.ribMR = U.el('line', { 'stroke-width': 4, opacity: 0.6 }, dom.ribs);

    /* ボタン */
    dom.btn = U.el('g', {}, dom.umb);
    U.el('circle', { cx: 500, cy: 655, r: 36, fill: '#ff6b6b', stroke: '#e05555', 'stroke-width': 6 }, dom.btn);
    U.el('circle', { cx: 492, cy: 646, r: 9, fill: '#ffffff', opacity: 0.6 }, dom.btn);
    dom.btnRing = U.el('circle', { cx: 500, cy: 655, r: 52, fill: 'none', stroke: '#ffd93b', 'stroke-width': 7, opacity: 0.5 }, dom.umb);

    dom.dropsG = U.el('g', {}, svg);
    fx = makeFxLayer(svg);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }

  function toggleOpen() {
    if (open.t < 0.5) {
      open.t = 1;
      S.kachi();
      S.whoosh(0.8);
      S.pop(0.25);
    } else {
      open.t = 0;
      flip.t = 0;
      S.kachi();
      S.boing(240);
    }
  }

  function gust() {
    wind = 560;
    gustT = 1.2;
    S.whoosh(1);
    fx.puff(CLOUD.x + 90, CLOUD.y + 10, '#ffffff', 6);
    if (open.p > 0.75 && flip.t < 0.5) flipDelay = 0.35;
  }

  function onDown(e) {
    const p = U.toView(svg, e.clientX, e.clientY);

    if (Math.hypot(p.x - 500, p.y - 655) < 50) { toggleOpen(); return; }
    if (Math.hypot(p.x - CLOUD.x, p.y - CLOUD.y) < 95) { gust(); return; }
    if (Math.hypot(p.x - CHICK.x, p.y - CHICK.y) < 62) {
      chickBounce = 1;
      S.pop();
      S.pop(0.1);
      return;
    }
    /* うらがえった かさをなおす */
    if (flip.t > 0.5 && p.y < 560) {
      flip.t = 0;
      S.boing(320);
      S.sparkle();
      fx.burst(500, 300, '#ffd93b', 10);
      return;
    }
    /* かたむけあそび */
    if (p.y < 620 && tiltId === null) {
      tiltId = e.pointerId;
      tilt.t = U.clamp((p.x - 500) / 420, -1, 1) * 0.38;
    }
  }

  function onMove(e) {
    if (e.pointerId === tiltId) {
      const p = U.toView(svg, e.clientX, e.clientY);
      tilt.t = U.clamp((p.x - 500) / 420, -1, 1) * 0.38;
    }
  }

  function onUp(e) {
    if (e.pointerId === tiltId) {
      tiltId = null;
      tilt.t = 0;   // びよんと まっすぐにもどる
    }
  }

  /* かさフレーム座標 ⇄ ワールド座標 */
  function toFrame(x, y, phi) {
    const c = Math.cos(-phi), s = Math.sin(-phi);
    return {
      x: c * (x - PIVOT.x) - s * (y - PIVOT.y) + PIVOT.x,
      y: s * (x - PIVOT.x) + c * (y - PIVOT.y) + PIVOT.y,
    };
  }
  function toWorld(x, y, phi) {
    const c = Math.cos(phi), s = Math.sin(phi);
    return {
      x: c * (x - PIVOT.x) - s * (y - PIVOT.y) + PIVOT.x,
      y: s * (x - PIVOT.x) + c * (y - PIVOT.y) + PIVOT.y,
    };
  }

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(open, dt, 130, 7.5);   // ふわっ＆びよん
    U.stepSpring(flip, dt, 210, 9);
    U.stepSpring(tilt, dt, 200, 11);
    fx.step(dt);

    if (gustT > 0) gustT -= dt;
    wind *= Math.exp(-dt * 1.7);
    if (flipDelay >= 0) {
      flipDelay -= dt;
      if (flipDelay < 0 && open.p > 0.6) {
        flip.t = 1;
        S.wobble();
      }
    }

    const openT = U.clamp(open.p, -0.1, 1.35);
    const theta = U.lerp(0.24, 1.26, openT) + flip.p * 0.62;
    const phi = tilt.p;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    const spanX = sinT * L;
    const tipY = HUB.y + cosT * L;

    dom.umb.setAttribute('transform', `rotate(${(phi * 180 / Math.PI).toFixed(2)} ${PIVOT.x} ${PIVOT.y})`);

    /* ランナーとばね */
    const runnerY = U.lerp(600, 420, U.clamp(openT, 0, 1.1));
    dom.runner.setAttribute('y', (runnerY - 11).toFixed(1));
    dom.spring.setAttribute('d', U.springPathV(500, runnerY + 14, 668, 5, 15));

    /* ほね */
    const lt = { x: HUB.x - spanX, y: tipY };
    const rt = { x: HUB.x + spanX, y: tipY };
    const t2 = theta * 0.6, l2 = L * 0.92;
    const mlt = { x: HUB.x - Math.sin(t2) * l2, y: HUB.y + Math.cos(t2) * l2 };
    const mrt = { x: HUB.x + Math.sin(t2) * l2, y: HUB.y + Math.cos(t2) * l2 };
    setLine(dom.ribL, HUB, lt);
    setLine(dom.ribR, HUB, rt);
    setLine(dom.ribML, HUB, mlt);
    setLine(dom.ribMR, HUB, mrt);
    setLine(dom.stretchL, { x: 500, y: runnerY }, { x: HUB.x - Math.sin(theta) * L * 0.55, y: HUB.y + Math.cos(theta) * L * 0.55 });
    setLine(dom.stretchR, { x: 500, y: runnerY }, { x: HUB.x + Math.sin(theta) * L * 0.55, y: HUB.y + Math.cos(theta) * L * 0.55 });

    /* ぬの：上のカーブ＋スカラップのふち */
    const apexY = HUB.y - 70 * U.clamp(openT, 0, 1.2) + flip.p * 240;
    let d = `M ${lt.x.toFixed(1)} ${lt.y.toFixed(1)} Q ${HUB.x} ${apexY.toFixed(1)} ${rt.x.toFixed(1)} ${rt.y.toFixed(1)}`;
    const sag = 34 * U.clamp(openT, 0.15, 1.2) * (1 - flip.p * 0.7);
    let px = rt.x, py = rt.y;
    for (let i = 3; i >= 0; i--) {
      const q = { x: U.lerp(lt.x, rt.x, i / 4), y: U.lerp(lt.y, rt.y, i / 4) };
      const mx = (px + q.x) / 2, my = (py + q.y) / 2 + sag;
      d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      px = q.x; py = q.y;
    }
    dom.canopy.setAttribute('d', d + ' Z');

    /* ボタンの「おしてね」リング */
    dom.btnRing.setAttribute('opacity', (0.25 + 0.2 * Math.sin(time * 4)).toFixed(2));
    dom.btnRing.setAttribute('r', (48 + 5 * Math.sin(time * 4)).toFixed(1));

    /* ---- あめ ---- */
    if (drops.length < 55 && Math.random() < dt * 30) {
      const el = U.el('ellipse', { rx: 4.5, ry: 8, fill: '#6fc3ff', opacity: 0.9 }, dom.dropsG);
      drops.push({ el, x: U.rand(-30, 1030), y: -15, vx: 0, vy: U.rand(360, 520), slide: false, dxS: 0, vs: 0 });
    }

    const canOpen = open.p > 0.75 && flip.p < 0.35;
    for (let i = drops.length - 1; i >= 0; i--) {
      const dr = drops[i];
      if (!dr.slide) {
        dr.vx += (wind * 0.9 - dr.vx) * Math.min(1, dt * 2);
        dr.x += dr.vx * dt;
        dr.y += dr.vy * dt;

        if (canOpen) {
          const f = toFrame(dr.x, dr.y, phi);
          const dx = f.x - HUB.x;
          if (Math.abs(dx) < spanX * 0.98) {
            const surf = HUB.y + (dx / spanX) * (dx / spanX) * (tipY - HUB.y);
            if (f.y > surf - 10 && f.y < surf + 30) {
              dr.slide = true;
              dr.dxS = dx;
              dr.vs = (dx >= 0 ? 1 : -1) * 60;
              if (tickT <= 0) { S.tick(); tickT = 0.12; }
              fx.puff(dr.x, dr.y, '#cfeaff', 2);
            }
          }
        }
        /* ひよこにあたる */
        if (dr.y > CHICK.y - 55 && dr.y < CHICK.y + 30 && Math.abs(dr.x - CHICK.x) < 52) {
          wetT = 1.6;
          fx.puff(dr.x, dr.y, '#9fd6ff', 3);
          dr.el.remove(); drops.splice(i, 1);
          continue;
        }
        if (dr.y > 930) {
          fx.puff(dr.x, 935, '#bfe4ff', 2);
          dr.el.remove(); drops.splice(i, 1);
          continue;
        }
        dr.el.setAttribute('transform', `translate(${dr.x.toFixed(1)} ${dr.y.toFixed(1)})`);
      } else {
        /* ぬのの上をころころすべる */
        dr.vs += ((dr.dxS >= 0 ? 1 : -1) * 800 + 2400 * Math.sin(phi)) * dt;
        dr.dxS += dr.vs * dt;
        if (Math.abs(dr.dxS) > spanX || !canOpen) {
          const surf = HUB.y + (dr.dxS / spanX) * (dr.dxS / spanX) * (tipY - HUB.y);
          const w = toWorld(HUB.x + U.clamp(dr.dxS, -spanX, spanX), surf, phi);
          dr.slide = false;
          dr.x = w.x; dr.y = w.y;
          dr.vx = dr.vs * Math.cos(phi);
          dr.vy = 120;
        } else {
          const surf = HUB.y + (dr.dxS / spanX) * (dr.dxS / spanX) * (tipY - HUB.y);
          const w = toWorld(HUB.x + dr.dxS, surf - 6, phi);
          dr.el.setAttribute('transform', `translate(${w.x.toFixed(1)} ${w.y.toFixed(1)})`);
        }
      }
    }
    if (tickT > 0) tickT -= dt;

    /* ひよこ */
    chickBounce = Math.max(0, chickBounce - dt * 2);
    let cy = -Math.abs(Math.sin(time * 3)) * 6;
    if (chickBounce > 0) cy -= Math.abs(Math.sin(time * 14)) * 22 * chickBounce;
    if (wetT > 0) {
      wetT -= dt;
      dom.chickEyeL.textContent = '＞'; dom.chickEyeR.textContent = '＜';
      dom.chick.setAttribute('transform', `translate(${(Math.sin(time * 26) * 5).toFixed(1)} ${cy.toFixed(1)})`);
    } else {
      dom.chickEyeL.textContent = '•'; dom.chickEyeR.textContent = '•';
      dom.chick.setAttribute('transform', `translate(0 ${cy.toFixed(1)})`);
    }

    /* くも：ぷくぷく */
    const ck = 1 + 0.03 * Math.sin(time * 2.5) + (gustT > 0 ? 0.12 * gustT : 0);
    dom.cloud.setAttribute('transform', `translate(${CLOUD.x * (1 - ck)} ${CLOUD.y * (1 - ck)}) scale(${ck.toFixed(3)})`);

    raf = requestAnimationFrame(loop);
  }

  function setLine(el, a, b) {
    el.setAttribute('x1', a.x.toFixed(1));
    el.setAttribute('y1', a.y.toFixed(1));
    el.setAttribute('x2', b.x.toFixed(1));
    el.setAttribute('y2', b.y.toFixed(1));
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
