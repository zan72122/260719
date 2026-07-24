/* 自動再生（お手本）エンジン
 *
 * 各ゲームが GUIDE.start(stage3, steps) にわたす「理想の操作手順」をそのまま流用し、
 * ヒント表示ではなく実際にポインター操作を合成してゲームを最後まで動かす。
 * steps の at/to/when/done はゲームの生きた内部状態を見るクロージャなので、
 * 乱数化されたパズル（きんこ の組合せ等）でも正しく最後まで解ける。
 *
 * 使いかた: AUTOPLAY.run(GUIDE.getStage3(), GUIDE.getSteps(), { onEnd });
 *           途中でやめる: AUTOPLAY.stop()
 *
 * 本物のタッチ（合成でない pointerId）が来たら即座に中断し、操作をユーザーへ返す。
 */
window.AUTOPLAY = (() => {
  const SYN_ID = 999001;
  const RUN_TIMEOUT = 180000;   /* 全体の安全打ち切り (複数タンブラーの連鎖ピック手順や、ゆっくり収束する物理は長くなりうる) */
  const TAP_HOLD_MS = 120;
  const TAP_SETTLE_TIMEOUT = 15000;  /* バネで確定するラッチ機構 (ぺんのノック等) が落ち着くのを待つ。早すぎる再タップは進行中のラッチ動作を邪魔しうるので、ここは長めに待ってから再試行する */
  const MAX_TAP_ATTEMPTS = 2;
  const HOLD_TIMEOUT = 20000;
  const HOLD_PRESS_MS = 500;    /* pump.js のように押し込み量で反応する系のための沈み込み */
  const HOLD_PRESS_PX = 70;
  const DRAG_MS = 900;
  const DRAG_HOLD_TIMEOUT = 15000;
  const TURN_STEP_RAD = 0.06;   /* 金庫のタンブラー等、狭い一致窓を飛び越えないよう小刻みに */
  const TURN_ARC_BUDGET = Math.PI * 2 * 4;    /* 1方向あたりの試行角度 (円盤を1枚ずつ拾う遊びの合計を上回る余裕) */
  const TURN_TIMEOUT = 30000;   /* 1方向あたりの安全打ち切り (ソフトウェアレンダリング環境でも十分な余裕) */

  const MAX_STEP_CYCLES = 5;    /* 同じステップに何度もジェスチャーをやり直しても進まない場合の見切り上限 */

  let stage3 = null, steps = null, raf = 0, runStartT = 0, onEnd = null;
  let phase = 'idle';           /* idle | scanning | gesture */
  let curStep = -1, tapAttempts = 0, stepCycles = 0;
  let g = null;                 /* 実行中のジェスチャー状態 */
  let lastX = 0, lastY = 0;
  let dotEl = null;
  let onGenuineDown = null;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _lerp = new THREE.Vector3();

  function posOf(x, out) {
    const o = typeof x === 'function' ? x() : x;
    if (!o) return null;
    if (o.isVector3) return out.copy(o);
    o.getWorldPosition(out);
    return out;
  }

  function domEl() {
    return stage3 && stage3.renderer && stage3.renderer.domElement;
  }

  function toScreen(worldPos) {
    const cam = stage3 && stage3.camera;
    const el = domEl();
    if (!cam || !el || !worldPos) return null;
    const v = _lerp.copy(worldPos).project(cam);
    const r = el.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  function ensureDot() {
    if (dotEl && dotEl.parentNode) return;
    dotEl = document.createElement('div');
    dotEl.id = 'autoplayDot';
    document.body.appendChild(dotEl);
  }

  function moveDot(x, y, on) {
    if (!dotEl) return;
    dotEl.style.left = x + 'px';
    dotEl.style.top = y + 'px';
    dotEl.classList.toggle('on', !!on);
  }

  function fire(type, x, y) {
    const el = domEl();
    if (!el) return;
    lastX = x; lastY = y;
    const down = type === 'pointerdown' || type === 'pointermove';
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: SYN_ID, clientX: x, clientY: y, bubbles: true, cancelable: true,
      pointerType: 'touch', isPrimary: true, button: 0, buttons: down ? 1 : 0,
    }));
    moveDot(x, y, type !== 'pointerup' && type !== 'pointercancel');
  }

  function findStep() {
    for (let i = 0; i < steps.length; i++) {
      let d = false;
      try { d = !!steps[i].done(); } catch (e) { d = true; }
      if (!d) return i;
    }
    return -1;
  }

  function allDone() {
    if (!steps) return true;
    return steps.every(s => { try { return !!s.done(); } catch (e) { return true; } });
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function beginGesture(step, now) {
    g = { kind: step.kind, step, sub: 'start', t0: now };
    phase = 'gesture';
  }

  function finishGesture() {
    g = null;
    phase = 'scanning';
  }

  function driveTap(now) {
    const st = g.step;
    const elapsed = now - g.t0;
    if (g.sub === 'start') {
      const p = posOf(st.at, _a);
      const s = toScreen(p);
      if (!s) { finishGesture(); return; }
      fire('pointerdown', s.x, s.y);
      g.sub = 'down'; g.t0 = now;
      return;
    }
    if (g.sub === 'down') {
      if (elapsed >= TAP_HOLD_MS) {
        fire('pointerup', lastX, lastY);
        g.sub = 'settle'; g.t0 = now;
      }
      return;
    }
    if (g.sub === 'settle') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done) { finishGesture(); return; }
      /* まだ未達成でも、ラッチのアニメーションが落ち着くまではここでじっと待つ
         (早すぎる再タップは進行中の物理を邪魔しうる)。長時間待っても変化がなければ再試行。 */
      if (elapsed >= TAP_SETTLE_TIMEOUT) {
        tapAttempts++;
        if (tapAttempts < MAX_TAP_ATTEMPTS) {
          g.sub = 'start'; g.t0 = now;
        } else {
          finishGesture();
        }
      }
    }
  }

  function driveHold(now) {
    const st = g.step;
    const elapsed = now - g.t0;
    if (g.sub === 'start') {
      const p = posOf(st.at, _a);
      const s = toScreen(p);
      if (!s) { finishGesture(); return; }
      g.baseX = s.x; g.baseY = s.y;
      fire('pointerdown', s.x, s.y);
      g.sub = 'press'; g.t0 = now; g.holdStart = now; g.lastPing = now;
      return;
    }
    if (g.sub === 'press') {
      const t = Math.min(1, elapsed / HOLD_PRESS_MS);
      fire('pointermove', g.baseX, g.baseY + t * HOLD_PRESS_PX);
      if (t >= 1) g.sub = 'hold';
      return;
    }
    if (g.sub === 'hold') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      const heldFor = now - g.holdStart;
      if (done || heldFor > HOLD_TIMEOUT) {
        fire('pointerup', lastX, lastY);
        finishGesture();
        return;
      }
      if (now - g.lastPing > 150) {
        fire('pointermove', lastX, lastY);
        g.lastPing = now;
      }
    }
  }

  function driveDrag(now) {
    const st = g.step;
    const elapsed = now - g.t0;
    if (g.sub === 'start') {
      const p = posOf(st.at, _a);
      const s = toScreen(p);
      if (!s) { finishGesture(); return; }
      fire('pointerdown', s.x, s.y);
      g.sub = 'move'; g.t0 = now;
      return;
    }
    if (g.sub === 'move') {
      const t = Math.min(1, elapsed / DRAG_MS);
      const a = posOf(st.at, _a);
      const b = posOf(st.to, _b);
      if (a && b) {
        const w = _lerp.copy(a).lerp(b, easeInOut(t));
        const s = toScreen(w.clone());
        if (s) fire('pointermove', s.x, s.y);
      }
      if (t >= 1) { g.sub = 'hold'; g.holdStart = now; g.lastPing = now; }
      return;
    }
    if (g.sub === 'hold') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      const heldFor = now - g.holdStart;
      if (done || heldFor > DRAG_HOLD_TIMEOUT) {
        fire('pointerup', lastX, lastY);
        finishGesture();
        return;
      }
      if (now - g.lastPing > 150) {
        const a = posOf(st.at, _a);
        const b = posOf(st.to, _b);
        if (a && b) {
          /* 目標地点まで来てもまだ終わらないなら、レバーのように「ヒントの矢印より
             実際にはもっと動かす必要がある」場合に備え、同じ向きにさらに手を伸ばし続ける */
          const a2 = a.clone(), b2 = b.clone();
          const extra = Math.min(3, (heldFor / DRAG_HOLD_TIMEOUT) * 3);
          const w = b2.clone().addScaledVector(b2.clone().sub(a2), extra);
          const s = toScreen(w);
          if (s) fire('pointermove', s.x, s.y);
        }
        g.lastPing = now;
      }
    }
  }

  function driveTurn(now) {
    const st = g.step;
    if (g.sub === 'start') {
      const p = posOf(st.at, _a);
      const c = toScreen(p);
      if (!c) { finishGesture(); return; }
      g.cx = c.x; g.cy = c.y;
      g.radius = 90;
      g.angle = -Math.PI / 2;
      g.dir = st.turnDir || 1;
      g.accum = 0;
      g.flipped = false;
      const x = g.cx + Math.cos(g.angle) * g.radius;
      const y = g.cy + Math.sin(g.angle) * g.radius;
      fire('pointerdown', x, y);
      g.sub = 'turning'; g.t0 = now;
      return;
    }
    if (g.sub === 'turning') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done || now - g.t0 > TURN_TIMEOUT) {
        fire('pointerup', lastX, lastY);
        finishGesture();
        return;
      }
      if (g.accum >= TURN_ARC_BUDGET) {
        if (!g.flipped) {
          /* turnDir の符号がゲームの実際の向きと合わないケースへの保険: 逆回転を試す */
          g.flipped = true;
          g.dir = -g.dir;
          g.accum = 0;
        } else {
          fire('pointerup', lastX, lastY);
          finishGesture();
          return;
        }
      }
      const p = posOf(st.at, _a);
      const c = toScreen(p);
      if (c) { g.cx = c.x; g.cy = c.y; }
      g.angle += g.dir * TURN_STEP_RAD;
      g.accum += TURN_STEP_RAD;
      const x = g.cx + Math.cos(g.angle) * g.radius;
      const y = g.cy + Math.sin(g.angle) * g.radius;
      fire('pointermove', x, y);
    }
  }

  function driveGesture(now) {
    if (!g) { phase = 'scanning'; return; }
    if (g.kind === 'tap') driveTap(now);
    else if (g.kind === 'hold') driveHold(now);
    else if (g.kind === 'drag') driveDrag(now);
    else if (g.kind === 'turn') driveTurn(now);
    else finishGesture();
  }

  function report() {
    if (window.__dbgAP) {
      window.__dbgAP({
        running: phase !== 'idle', phase, curStep, allDone: allDone(),
        g: g && { kind: g.kind, sub: g.sub, dir: g.dir, accum: g.accum && +g.accum.toFixed(2), flipped: g.flipped, x: lastX | 0, y: lastY | 0 },
        stepDone: steps ? steps.map(s => { try { return !!s.done(); } catch (e) { return 'ERR:' + e.message; } }) : null,
      });
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!stage3 || !steps) { stopInternal(); return; }
    if (now - runStartT > RUN_TIMEOUT) { stopInternal(); return; }
    ensureDot();

    if (phase === 'scanning') {
      const i = findStep();
      if (i < 0) { stopInternal(); return; }
      const st = steps[i];
      let gateOpen = true;
      if (st.when) { try { gateOpen = !!st.when(); } catch (e) { gateOpen = false; } }
      if (!gateOpen) { report(); return; }
      if (i !== curStep) { curStep = i; tapAttempts = 0; stepCycles = 0; }
      stepCycles++;
      if (stepCycles > MAX_STEP_CYCLES) { stopInternal(); return; }
      beginGesture(st, now);
    }
    if (phase === 'gesture') driveGesture(now);
    report();
  }

  function stopInternal() {
    const el = domEl();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (onGenuineDown && el) el.removeEventListener('pointerdown', onGenuineDown);
    onGenuineDown = null;
    const wasRunning = phase !== 'idle';
    phase = 'idle';
    g = null;
    curStep = -1;
    steps = null;
    stage3 = null;
    moveDot(lastX, lastY, false);
    const cb = onEnd;
    onEnd = null;
    if (wasRunning && cb) { try { cb(); } catch (e) { /* ignore */ } }
    report();
  }

  function abortForRealTouch() {
    if (g) fire('pointercancel', lastX, lastY);
    stopInternal();
  }

  return {
    run(s3, stps, opts) {
      stopInternal();
      if (!s3 || !s3.renderer || !s3.camera || !stps || !stps.length) return;
      stage3 = s3;
      steps = stps;
      onEnd = (opts && opts.onEnd) || null;
      runStartT = performance.now();
      phase = 'scanning';
      curStep = -1;
      tapAttempts = 0;
      ensureDot();
      onGenuineDown = (e) => {
        if (e.pointerId === SYN_ID) return;
        abortForRealTouch();
      };
      domEl().addEventListener('pointerdown', onGenuineDown);
      raf = requestAnimationFrame(tick);
    },
    stop() { stopInternal(); },
    isRunning() { return phase !== 'idle'; },
  };
})();
