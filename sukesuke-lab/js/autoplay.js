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
  const TAP_SETTLE_TIMEOUT = 15000;  /* バネで確定するラッチ機構 (ぺんのノック等) が落ち着くのを待つ。早すぎる再タップは進行中のラッチ動作を邪魔しうるので、ここは長めに待ってから再試行する */
  const MAX_TAP_ATTEMPTS = 2;
  const TAP_SETTLE_TICKS = 30;  /* 再試行前に最低これだけのフレームを見送る */
  const HOLD_TIMEOUT = 20000;
  const HOLD_PRESS_MS = 500;    /* pump.js のように押し込み量で反応する系のための沈み込み */
  const HOLD_PRESS_PX = 70;
  const DRAG_MS = 900;
  const DRAG_DWELL_MS = 5000;   /* 目標の上で保持する基本時間 (そそぐ・押し当てる系はここで完了する) */
  const DRAG_DWELL_MAX_MS = 20000;
  const DRAG_SETTLE_MS = 4000;  /* 目標で離したあと「置く」動作が確定するのを待つ時間 */
  const TURN_RADIUS = 90;      /* 円運動の半径 (px)。つかむのは中心、回すのはこの半径で */
  const TURN_STEP_RAD = 0.06;   /* 金庫のタンブラー等、狭い一致窓を飛び越えないよう小刻みに */
  const TURN_ARC_BUDGET = Math.PI * 2 * 4;    /* 1方向あたりの試行角度 (円盤を1枚ずつ拾う遊びの合計を上回る余裕) */

  const MAX_STEP_CYCLES = 5;    /* 同じステップに何度もジェスチャーをやり直しても進まない場合の見切り上限 */

  let stage3 = null, steps = null, raf = 0, runStartT = 0, onEnd = null;
  let runTimeout = RUN_TIMEOUT;
  let phase = 'idle';           /* idle | scanning | gesture */
  let curStep = -1, tapAttempts = 0, stepCycles = 0;
  let latched = null;           /* 一度完了を観測したステップの記録 (done() が非単調でも前へ進むため) */
  let lastResult = null;        /* 直近の終了理由: done | timeout | stuck | stopped | aborted */
  let g = null;                 /* 実行中のジェスチャー状態 */
  let lastX = 0, lastY = 0;
  let dotEl = null;
  let onGenuineDown = null;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _lerp = new THREE.Vector3(), _proj = new THREE.Vector3();

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
    const v = _proj.copy(worldPos).project(cam);
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

  function stepDone(i) {
    try { return !!steps[i].done(); } catch (e) { return true; }
  }

  function stepGateOpen(i) {
    if (!steps[i].when) return true;
    try { return !!steps[i].when(); } catch (e) { return false; }
  }

  function findStep() {
    /* 実演は前へ進む一回性のパフォーマンス。done() は非単調なことがある
       (例: すいはんきは炊飯が入れた水を消費する、ミキサーは注ぐとジュースが減る) ので、
       一度完了を観測したステップはラッチして前進する。優先順位:
       1. 未提示でゲートが開いているステップ → すぐ演じる
       2. 後戻りしていてゲートが開いているステップ → やり直す
          (金庫の円盤がずれた/ジュースが足りず果物を足す、など。ゲート持ちの
           未提示ステップが素材切れで開かないときも、これが素材を作り直す)
       3. 未提示でゲートが閉じているステップ → 開くのを待つ */
    let firstBlocked = -1, regressedOpen = -1;
    for (let i = 0; i < steps.length; i++) {
      if (stepDone(i)) { latched[i] = true; continue; }
      if (!latched[i]) {
        if (stepGateOpen(i)) return i;
        if (firstBlocked < 0) firstBlocked = i;
      } else if (regressedOpen < 0 && stepGateOpen(i)) {
        regressedOpen = i;
      }
    }
    if (firstBlocked >= 0) {
      /* やり直しは「まだ演じていないステップの前進が塞がれている」ときだけ。
         全ステップを一度演じ終えたのに後戻りだけが残る状態 (かさの開→閉のように
         同じ状態を往復する演目) でやり直すと、開いて閉じてを永遠にくり返してしまう */
      if (regressedOpen >= 0) { latched[regressedOpen] = false; return regressedOpen; }
      return firstBlocked;
    }
    return -1;
  }

  function latchCur() {
    if (latched && curStep >= 0 && curStep < latched.length) latched[curStep] = true;
  }

  function allDone() {
    if (!steps) return true;
    return steps.every((s, i) => (latched && latched[i]) || stepDone(i));
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
      /* down と up は同じフレーム内で連続送出する。ぺんやかさは「押してから
         200ms前後までに離した素早いタップ」だけをカチッと扱うが、フレームや
         タイマーは描画負荷で平気で数秒遅れる環境がある。ハンドラは同期実行
         なので、0ms のタップはどの環境でも確実に「素早いタップ」になる */
      fire('pointerdown', s.x, s.y);
      fire('pointerup', s.x, s.y);
      g.sub = 'settle'; g.t0 = now; g.settleTicks = 0;
      return;
    }
    if (g.sub === 'settle') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done) { latchCur(); finishGesture(); return; }
      /* まだ未達成でも、ラッチのアニメーションが落ち着くまではここでじっと待つ。
         時間だけでなく描画フレーム数でも待つ: バネの押し→戻り行程は十数フレーム
         かかり、描画が遅い環境では壁時計だけだと早すぎる再タップになる。
         トグル機構への再タップは進んだ状態を巻き戻してしまうので特に危険。 */
      g.settleTicks = (g.settleTicks || 0) + 1;
      if (elapsed >= TAP_SETTLE_TIMEOUT && g.settleTicks >= TAP_SETTLE_TICKS) {
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
        if (done) latchCur();
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
        const s = toScreen(_lerp.copy(a).lerp(b, easeInOut(t)));
        if (s) fire('pointermove', s.x, s.y);
      }
      if (t >= 1) { g.sub = 'dwell'; g.t0 = now; g.lastPing = now; }
      return;
    }
    if (g.sub === 'dwell') {
      /* 目標の上でにぎったまま待つ (そそぐ・レバー保持・当て続ける系はここで done() が立つ)。
         at/to は毎回とり直す: レバーのように at が動く相対ステップは、周回ごとの
         にぎり直しで自然に先へ進む。うまくいかない周回ほど長く待つ (低fps環境対策)。 */
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done) {
        latchCur();
        fire('pointerup', lastX, lastY);
        finishGesture();
        return;
      }
      if (elapsed >= Math.min(DRAG_DWELL_MAX_MS, DRAG_DWELL_MS * stepCycles)) {
        /* 目標地点でそっと離す (「はなした瞬間に置く」が成立する系のため、
           必ず to の真上へ戻ってから離す) */
        const b = posOf(st.to, _b);
        const s = b && toScreen(b);
        if (s) fire('pointermove', s.x, s.y);
        fire('pointerup', lastX, lastY);
        g.sub = 'settle'; g.t0 = now;
        return;
      }
      if (now - g.lastPing > 150) {
        const b = posOf(st.to, _b);
        const s = b && toScreen(b);
        if (s) fire('pointermove', s.x, s.y);
        g.lastPing = now;
      }
      return;
    }
    if (g.sub === 'settle') {
      /* 離したあとの「置く」動作 (落下・吸着・アニメーション) が確定するのを待つ */
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done) latchCur();
      if (done || elapsed >= DRAG_SETTLE_MS) finishGesture();
    }
  }

  function driveTurn(now) {
    const st = g.step;
    if (g.sub === 'start') {
      const p = posOf(st.at, _a);
      const c = toScreen(p);
      if (!c) { finishGesture(); return; }
      g.cx = c.x; g.cy = c.y;
      g.radius = 0;             /* 中心で確実につかんでから、らせん状に外へ */
      g.angle = -Math.PI / 2;
      g.dir = st.turnDir || 1;
      g.accum = 0;
      g.flipped = false;
      /* ノブの中心で pointerdown する: 半径90pxの円周上から始めると、
         小さなつまみ (バルブ・クランク等) では当たり判定を外れてしまう */
      fire('pointerdown', g.cx, g.cy);
      g.sub = 'turning'; g.t0 = now;
      return;
    }
    if (g.sub === 'turning') {
      let done = false;
      try { done = !!st.done(); } catch (e) { done = true; }
      if (done) {
        latchCur();
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
      if (g.radius < TURN_RADIUS) {
        /* まっすぐ外へ (角度一定なので回転量には影響しない) */
        g.radius = Math.min(TURN_RADIUS, g.radius + 18);
      } else {
        g.angle += g.dir * TURN_STEP_RAD;
        g.accum += TURN_STEP_RAD;
      }
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
        running: phase !== 'idle', phase, curStep, allDone: allDone(), result: lastResult,
        g: g && { kind: g.kind, sub: g.sub, dir: g.dir, accum: g.accum && +g.accum.toFixed(2), flipped: g.flipped, x: lastX | 0, y: lastY | 0 },
        stepDone: steps ? steps.map(s => { try { return !!s.done(); } catch (e) { return 'ERR:' + e.message; } }) : null,
        latched: latched ? latched.slice() : null,
      });
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!stage3 || !steps) { stopInternal('error'); return; }
    if (now - runStartT > runTimeout) { stopInternal('timeout'); return; }
    ensureDot();

    if (phase === 'scanning') {
      const i = findStep();
      if (i < 0) { stopInternal('done'); return; }
      const st = steps[i];
      let gateOpen = true;
      if (st.when) { try { gateOpen = !!st.when(); } catch (e) { gateOpen = false; } }
      if (!gateOpen) { report(); return; }
      if (i !== curStep) { curStep = i; tapAttempts = 0; stepCycles = 0; }
      stepCycles++;
      if (stepCycles > MAX_STEP_CYCLES) { stopInternal('stuck'); return; }
      beginGesture(st, now);
    }
    if (phase === 'gesture') driveGesture(now);
    report();
  }

  function stopInternal(reason) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    /* にぎったままの合成指を必ず離す (ゲームやguide.jsをドラッグ中状態のまま取り残さない) */
    if (g) { fire('pointercancel', lastX, lastY); g = null; }
    if (onGenuineDown) window.removeEventListener('pointerdown', onGenuineDown, true);
    onGenuineDown = null;
    const wasRunning = phase !== 'idle';
    phase = 'idle';
    if (wasRunning) {
      /* steps を消す前に、最終状態を正直に報告する (失敗した停止を成功と偽らない) */
      lastResult = reason || 'stopped';
      report();
    }
    curStep = -1;
    steps = null;
    latched = null;
    stage3 = null;
    moveDot(lastX, lastY, false);
    const cb = onEnd;
    onEnd = null;
    if (wasRunning && cb) { try { cb(); } catch (e) { /* ignore */ } }
  }

  function abortForRealTouch() {
    stopInternal('aborted');
  }

  return {
    run(s3, stps, opts) {
      stopInternal('stopped');
      if (!s3 || !s3.renderer || !s3.camera || !stps || !stps.length) return false;
      stage3 = s3;
      steps = stps;
      latched = stps.map(() => false);
      onEnd = (opts && opts.onEnd) || null;
      runTimeout = (opts && opts.timeoutMs) || RUN_TIMEOUT;
      runStartT = performance.now();
      lastResult = null;
      phase = 'scanning';
      curStep = -1;
      tapAttempts = 0;
      stepCycles = 0;
      ensureDot();
      /* キャプチャ段階のwindowリスナー: ゲームが本物のタッチを処理する前に
         合成指を pointercancel で離してから停止する (本物のタッチが巻き添えで
         キャンセルされない・きれいな順序で操作がユーザーへ返る)。
         ボタン類 (🪄/🏠) へのタッチは対象外にして、🪄のトグル停止をこわさない。 */
      onGenuineDown = (e) => {
        if (e.pointerId === SYN_ID) return;
        const el = domEl();
        if (!el || (e.target !== el && !el.contains(e.target))) return;
        abortForRealTouch();
      };
      window.addEventListener('pointerdown', onGenuineDown, true);
      raf = requestAnimationFrame(tick);
      return true;
    },
    stop() { stopInternal('stopped'); },
    isRunning() { return phase !== 'idle'; },
  };
})();
