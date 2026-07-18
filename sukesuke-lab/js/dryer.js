/* ドライヤーの中身 */
window.GAMES.dryer = (() => {
  const PIVOT = { x: 300, y: 430 };   // ドライヤーの回転中心
  const NOZZLE = 215;                 // ふきだし口（ローカルx）
  const FACE = { x: 750, y: 430 };
  const HAIR_N = 9;

  let svg, raf, prev, fx, dom, time;
  let aim, afro;
  let level, hot, aimId;
  let fanAngle, airLocal, airWorld, bubbles, hairs, ribbon;
  let spawnAcc, bubbleT, hotStrongT, warmT, happyT, gagOn, windSnd;

  function build(stage) {
    svg = U.makeSvg(stage, 1000, 1000);
    aim = U.spring(0);
    afro = U.spring(0);
    level = 0; hot = false; aimId = null;
    fanAngle = 0; airLocal = []; airWorld = []; bubbles = [];
    spawnAcc = 0; bubbleT = 1; hotStrongT = 0; warmT = 0; happyT = 0; gagOn = false;
    time = 0;
    dom = {};
    windSnd = S.wind();

    /* ---- リボンのはた ---- */
    U.el('line', { x1: 560, y1: 730, x2: 560, y2: 560, stroke: '#b0895f', 'stroke-width': 10, 'stroke-linecap': 'round' }, svg);
    U.el('circle', { cx: 560, cy: 556, r: 9, fill: '#ffd93b' }, svg);
    dom.ribbon = U.el('path', { fill: 'none', stroke: '#ff8fb5', 'stroke-width': 15, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    ribbon = [U.spring(0.1), U.spring(0.1), U.spring(0.1)];

    /* ---- おんなのこ ---- */
    const ch = U.el('g', {}, svg);
    U.el('ellipse', { cx: FACE.x, cy: FACE.y + 150, rx: 95, ry: 75, fill: '#ffb8d9', stroke: '#ff8fc0', 'stroke-width': 5 }, ch);
    dom.hairG = U.el('g', { fill: 'none', 'stroke-linecap': 'round' }, svg);
    dom.face = U.el('g', {}, svg);
    U.el('circle', { cx: FACE.x, cy: FACE.y, r: 86, fill: '#ffe0c2', stroke: '#eab98d', 'stroke-width': 5 }, dom.face);
    U.el('circle', { cx: FACE.x - 42, cy: FACE.y + 26, r: 13, fill: '#ffb3ab', opacity: 0.7 }, dom.face);
    U.el('circle', { cx: FACE.x + 42, cy: FACE.y + 26, r: 13, fill: '#ffb3ab', opacity: 0.7 }, dom.face);
    dom.eyeL = U.text('•', { x: FACE.x - 30, y: FACE.y + 6, 'text-anchor': 'middle', 'font-size': 38, fill: '#5d4030' }, dom.face);
    dom.eyeR = U.text('•', { x: FACE.x + 30, y: FACE.y + 6, 'text-anchor': 'middle', 'font-size': 38, fill: '#5d4030' }, dom.face);
    dom.mouth = U.el('path', { d: '', fill: 'none', stroke: '#5d4030', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, dom.face);

    hairs = [];
    for (let i = 0; i < HAIR_N; i++) {
      const a = Math.PI * (1.08 + (i / (HAIR_N - 1)) * 0.84);   // 頭のてっぺんに沿って
      const rx = FACE.x + Math.cos(a) * 84;
      const ry = FACE.y + Math.sin(a) * 84;
      const el = U.el('path', { stroke: '#8a5a3a', 'stroke-width': 13, fill: 'none', 'stroke-linecap': 'round' }, dom.hairG);
      hairs.push({ el, rx, ry, nx: Math.cos(a), ny: Math.sin(a), o: U.spring(0), ph: U.rand(0, 6) });
    }

    /* ---- ドライヤー本体（回転グループ） ---- */
    dom.dryer = U.el('g', {}, svg);
    /* もちて */
    U.el('rect', { x: -70, y: 70, width: 60, height: 190, rx: 26, transform: 'rotate(14 -40 80)', fill: '#8f6bff', stroke: '#7052d6', 'stroke-width': 5 }, dom.dryer);
    /* あったかグロー */
    dom.glow = U.el('rect', { x: 50, y: -70, width: 110, height: 140, rx: 24, fill: '#ff9f43', opacity: 0 }, dom.dryer);
    /* ファン */
    dom.fan = U.el('g', {}, dom.dryer);
    for (let i = 0; i < 5; i++) {
      U.el('ellipse', { cx: 0, cy: -38, rx: 17, ry: 34, fill: '#7fd0ff', stroke: '#4aa9ee', 'stroke-width': 4, transform: `rotate(${i * 72})` }, dom.fan);
    }
    U.el('circle', { cx: 0, cy: 0, r: 17, fill: '#4aa9ee' }, dom.fan);
    /* ヒーター（オレンジのくねくね線） */
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 30;
      U.el('path', {
        d: `M ${x} -52 ${[-30, -10, 10, 30, 52].map((y, j) => `L ${x + (j % 2 === 0 ? 14 : -14)} ${y}`).join(' ')}`,
        stroke: '#ff7b54', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round',
      }, dom.dryer);
    }
    /* すいこみグリル */
    for (let i = -3; i <= 3; i++) {
      U.el('line', { x1: -182, y1: i * 22, x2: -160, y2: i * 22, stroke: '#9aa7b8', 'stroke-width': 6, 'stroke-linecap': 'round' }, dom.dryer);
    }
    /* なかを飛ぶ空気（ローカル） */
    dom.airLocalG = U.el('g', {}, dom.dryer);
    /* スケスケボディ */
    U.el('path', {
      d: 'M -95 -95 L 150 -95 L 150 -55 L 215 -32 L 215 32 L 150 55 L 150 95 L -95 95 A 95 95 0 0 1 -190 0 A 95 95 0 0 1 -95 -95 Z',
      fill: '#dff2ff', opacity: 0.32, stroke: '#7fc4e8', 'stroke-width': 6, 'stroke-linejoin': 'round',
    }, dom.dryer);
    U.el('rect', { x: -120, y: -80, width: 150, height: 20, rx: 10, fill: '#ffffff', opacity: 0.5 }, dom.dryer);

    /* そとを飛ぶ空気 */
    dom.airWorldG = U.el('g', {}, svg);
    /* シャボン玉 */
    dom.bubbleG = U.el('g', {}, svg);

    /* ---- ボタン ---- */
    dom.powerBtn = U.el('g', {}, svg);
    dom.powerRect = U.el('rect', { x: 60, y: 860, width: 280, height: 110, rx: 30, fill: '#cbd6e0', stroke: '#9aa7b8', 'stroke-width': 6 }, dom.powerBtn);
    dom.powerIcon = U.text('😴', { x: 120, y: 933, 'text-anchor': 'middle', 'font-size': 50 }, dom.powerBtn);
    dom.powerLabel = U.text('とまってる', { x: 225, y: 928, 'text-anchor': 'middle', 'font-size': 36, fill: '#ffffff', style: 'paint-order:stroke', stroke: '#7f8fa6', 'stroke-width': 5 }, dom.powerBtn);

    dom.tempBtn = U.el('g', {}, svg);
    dom.tempRect = U.el('rect', { x: 380, y: 860, width: 280, height: 110, rx: 30, fill: '#a8dcff', stroke: '#5ab7f0', 'stroke-width': 6 }, dom.tempBtn);
    dom.tempIcon = U.text('❄️', { x: 440, y: 933, 'text-anchor': 'middle', 'font-size': 50 }, dom.tempBtn);
    dom.tempLabel = U.text('つめたい', { x: 545, y: 928, 'text-anchor': 'middle', 'font-size': 36, fill: '#ffffff', style: 'paint-order:stroke', stroke: '#5ab7f0', 'stroke-width': 5 }, dom.tempBtn);

    U.text('ゆびで うえした にうごかせるよ', { x: 300, y: 210, 'text-anchor': 'middle', 'font-size': 28, fill: '#8faabf' }, svg);

    fx = makeFxLayer(svg);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }

  function setPower(n) {
    level = n;
    S.kachi();
    if (level > 0) S.whoosh(level / 2);
    windSnd.set(level / 2);
    const looks = [
      ['#cbd6e0', '#9aa7b8', '😴', 'とまってる'],
      ['#bfe9b0', '#7cc86a', '🍃', 'よわいかぜ'],
      ['#ffd493', '#f0a63a', '🌀', 'つよいかぜ'],
    ][level];
    dom.powerRect.setAttribute('fill', looks[0]);
    dom.powerRect.setAttribute('stroke', looks[1]);
    dom.powerLabel.setAttribute('stroke', looks[1]);
    dom.powerIcon.textContent = looks[2];
    dom.powerLabel.textContent = looks[3];
  }

  function setHot(h) {
    hot = h;
    S.kachi();
    if (hot) S.sparkle();
    dom.tempRect.setAttribute('fill', hot ? '#ffc4a3' : '#a8dcff');
    dom.tempRect.setAttribute('stroke', hot ? '#ff8a50' : '#5ab7f0');
    dom.tempLabel.setAttribute('stroke', hot ? '#ff8a50' : '#5ab7f0');
    dom.tempIcon.textContent = hot ? '☀️' : '❄️';
    dom.tempLabel.textContent = hot ? 'あったかい' : 'つめたい';
  }

  function onDown(e) {
    const p = U.toView(svg, e.clientX, e.clientY);

    if (p.y > 845) {
      if (p.x > 40 && p.x < 355) { setPower((level + 1) % 3); return; }
      if (p.x > 365 && p.x < 675) { setHot(!hot); return; }
      return;
    }
    /* シャボン玉をつつく */
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14) {
        popBubble(i);
        return;
      }
    }
    /* ドライヤーのむきをかえる */
    if (p.x < 540) {
      aimId = e.pointerId;
      aim.t = U.clamp((p.y - PIVOT.y) / 380, -1, 1) * 0.5;
    }
  }

  function onMove(e) {
    if (e.pointerId === aimId) {
      const p = U.toView(svg, e.clientX, e.clientY);
      aim.t = U.clamp((p.y - PIVOT.y) / 380, -1, 1) * 0.5;
    }
  }

  function onUp(e) {
    if (e.pointerId === aimId) aimId = null;
  }

  function popBubble(i) {
    const b = bubbles[i];
    fx.burst(b.x, b.y, '#a7e8ff', 6, 10);
    S.pop();
    S.sparkle();
    b.el.remove();
    bubbles.splice(i, 1);
  }

  /* ふきだし口からの風のつよさ（0〜1） */
  function windForceAt(px, py, dirX, dirY, ox, oy) {
    if (level === 0) return 0;
    const rx = px - ox, ry = py - oy;
    const t = rx * dirX + ry * dirY;
    if (t < 0) return 0;
    const perp = Math.abs(rx * -dirY + ry * dirX);
    const width = 75 + t * 0.42;
    return (level / 2) * Math.max(0, 1 - perp / width) * Math.max(0, 1 - t / 900);
  }

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(aim, dt, 160, 12);
    U.stepSpring(afro, dt, 30, 5);
    fx.step(dt);

    const a = aim.p;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ox = PIVOT.x + NOZZLE * ca, oy = PIVOT.y + NOZZLE * sa;
    dom.dryer.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${(a * 180 / Math.PI).toFixed(2)})`);

    /* ファンとヒーター */
    fanAngle += (level * 520 + (level ? 140 : 0)) * dt;
    dom.fan.setAttribute('transform', `translate(-90 0) rotate(${(fanAngle % 360).toFixed(1)})`);
    const glowTarget = hot && level > 0 ? 0.4 + 0.12 * Math.sin(time * 6) : 0;
    dom.glow.setAttribute('opacity', glowTarget.toFixed(2));

    /* なかの空気（小さな丸） */
    spawnAcc += level * 38 * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      const el = U.el('circle', { r: U.rand(5, 9), fill: '#cfd8e0', opacity: 0.85 }, dom.airLocalG);
      airLocal.push({ el, lx: -185, ly: U.rand(-58, 58), v: U.rand(140, 200) });
    }
    for (let i = airLocal.length - 1; i >= 0; i--) {
      const q = airLocal[i];
      q.v = Math.min(q.v + 900 * dt, 320 + level * 260);
      q.lx += q.v * dt;
      q.ly *= 1 - dt * 1.6;   // ノズルへすぼまる
      q.el.setAttribute('fill', q.lx > 55 ? (hot ? '#ffb46b' : '#8fd0ff') : '#cfd8e0');
      q.el.setAttribute('cx', q.lx.toFixed(1));
      q.el.setAttribute('cy', q.ly.toFixed(1));
      if (q.lx > NOZZLE) {
        q.el.remove();
        airLocal.splice(i, 1);
        const wx = PIVOT.x + q.lx * ca - q.ly * sa;
        const wy = PIVOT.y + q.lx * sa + q.ly * ca;
        const spd = q.v * U.rand(1, 1.35);
        const wobble = U.rand(-55, 55);
        const el2 = U.el('circle', { r: U.rand(5, 9), fill: hot ? '#ffb46b' : '#8fd0ff', opacity: 0.9 }, dom.airWorldG);
        airWorld.push({ el: el2, x: wx, y: wy, vx: spd * ca - wobble * sa, vy: spd * sa + wobble * ca, life: U.rand(0.9, 1.5), age: 0 });
      }
    }
    for (let i = airWorld.length - 1; i >= 0; i--) {
      const q = airWorld[i];
      q.age += dt;
      if (q.age >= q.life || q.x > 1020) { q.el.remove(); airWorld.splice(i, 1); continue; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.el.setAttribute('cx', q.x.toFixed(1));
      q.el.setAttribute('cy', q.y.toFixed(1));
      q.el.setAttribute('opacity', (0.9 * (1 - q.age / q.life)).toFixed(2));
    }

    /* かみのけ */
    const faceForce = windForceAt(FACE.x, FACE.y - 60, ca, sa, ox, oy);
    for (let i = 0; i < hairs.length; i++) {
      const h = hairs[i];
      const force = windForceAt(h.rx, h.ry, ca, sa, ox, oy);
      h.o.t = force * 150;
      U.stepSpring(h.o, dt, 90 + i * 8, 7);
      const len = 60 + afro.p * 55 + Math.sin(time * 2 + h.ph) * 4;
      const crazy = afro.p * Math.sin(time * 9 + h.ph) * 26;
      const ex = h.rx + h.nx * len + h.o.p * ca + crazy * h.ny;
      const ey = h.ry + h.ny * len + h.o.p * sa * 0.7 - afro.p * 18 - crazy * h.nx;
      const cx = h.rx + h.nx * len * 0.55 + h.o.p * ca * 0.35;
      const cy = h.ry + h.ny * len * 0.55 - afro.p * 10;
      h.el.setAttribute('d', `M ${h.rx.toFixed(1)} ${h.ry.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    }

    /* リボン */
    const ribForce = windForceAt(560, 590, ca, sa, ox, oy);
    let rpx = 560, rpy = 570;
    let d = `M ${rpx} ${rpy}`;
    for (let i = 0; i < ribbon.length; i++) {
      const seg = ribbon[i];
      seg.t = U.clamp(ribForce * (1.7 - i * 0.2), 0, 1.5) + Math.sin(time * (3 + i)) * 0.12;
      U.stepSpring(seg, dt, 60, 6);
      rpx += Math.sin(seg.p) * 56;
      rpy += Math.cos(seg.p) * 56 * (seg.p > 1.2 ? 0.4 : 1);
      d += ` L ${rpx.toFixed(1)} ${rpy.toFixed(1)}`;
    }
    dom.ribbon.setAttribute('d', d);

    /* シャボン玉 */
    bubbleT -= dt;
    if (bubbleT <= 0 && bubbles.length < 8) {
      bubbleT = U.rand(1.6, 2.8);
      const r = U.rand(16, 30);
      const el = U.el('g', {}, dom.bubbleG);
      U.el('circle', { r, fill: '#dff4ff', opacity: 0.45, stroke: '#9fd6f2', 'stroke-width': 3.5 }, el);
      U.el('circle', { cx: -r * 0.35, cy: -r * 0.35, r: r * 0.22, fill: '#ffffff', opacity: 0.9 }, el);
      bubbles.push({ el, x: U.rand(120, 900), y: 990 + r, r, vx: 0, vy: -U.rand(35, 60), age: 0 });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      const force = windForceAt(b.x, b.y, ca, sa, ox, oy);
      b.vx += force * 700 * ca * dt;
      b.vy += force * 700 * sa * dt;
      b.vx *= Math.exp(-dt * 1.2);
      b.vy = (b.vy + 30 * dt * (b.vy > -30 ? -1 : 0)) * Math.exp(-dt * 0.4);
      b.x += (b.vx + Math.sin(time * 2 + i) * 20) * dt;
      b.y += (b.vy - 20) * dt;
      if (b.y < -b.r - 10 || b.x > 1010 || b.x < -30 || b.age > 12) {
        popBubble(i);
        continue;
      }
      b.el.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
    }

    /* あったか×つよい でボワッ */
    if (level === 2 && hot) {
      hotStrongT += dt;
      if (hotStrongT > 3.5 && !gagOn) {
        gagOn = true;
        afro.t = 1;
        S.wobble();
        fx.burst(FACE.x, FACE.y - 90, '#ffd93b', 10);
      }
    } else {
      hotStrongT = 0;
      if (gagOn) { gagOn = false; afro.t = 0; }
    }

    /* あったかい風でさらさらヘアー */
    if (hot && level >= 1 && faceForce > 0.22 && !gagOn) {
      warmT += dt;
      if (warmT > 3) {
        warmT = -6;
        happyT = 2.2;
        S.yay();
        fx.burst(FACE.x, FACE.y - 60, '#ffd93b', 14);
      }
    }

    /* かお */
    if (gagOn || afro.p > 0.4) {
      dom.eyeL.textContent = '◎'; dom.eyeR.textContent = '◎';
      dom.mouth.setAttribute('d', `M ${FACE.x - 16} ${FACE.y + 42} a 16 14 0 1 0 32 0 a 16 14 0 1 0 -32 0`);
    } else if (happyT > 0) {
      happyT -= dt;
      dom.eyeL.textContent = '＾'; dom.eyeR.textContent = '＾';
      dom.mouth.setAttribute('d', `M ${FACE.x - 26} ${FACE.y + 36} Q ${FACE.x} ${FACE.y + 62} ${FACE.x + 26} ${FACE.y + 36}`);
    } else if (faceForce > 0.25) {
      dom.eyeL.textContent = '＞'; dom.eyeR.textContent = '＜';
      dom.mouth.setAttribute('d', `M ${FACE.x - 14} ${FACE.y + 44} Q ${FACE.x} ${FACE.y + 52} ${FACE.x + 14} ${FACE.y + 44}`);
    } else {
      dom.eyeL.textContent = '•'; dom.eyeR.textContent = '•';
      dom.mouth.setAttribute('d', `M ${FACE.x - 20} ${FACE.y + 38} Q ${FACE.x} ${FACE.y + 54} ${FACE.x + 20} ${FACE.y + 38}`);
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
      if (windSnd) windSnd.stop();
    },
  };
})();
