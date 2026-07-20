/* 4歳向け共通ガイドエンジン
 *
 * 文字を使わず「光る輪 + 動く指マーク」で次にさわる場所を教える。
 * - ゲーム開始直後: 最初の一手だけすぐ示す
 * - 以降: 進捗が IDLE_SEC 秒ないときだけ、いま必要な一手を提示
 * - 対象にさわった瞬間・ステップ達成の瞬間にすっと消える
 *
 * 使いかた (各ゲームの start() 内):
 *   GUIDE.start(stage3, [
 *     { kind: 'tap',  at: () => obj,            done: () => bool },
 *     { kind: 'drag', at: () => a, to: () => b, done: () => bool },
 *     { kind: 'hold', at: () => obj,            done: () => bool },
 *     { kind: 'turn', at: () => obj, turnDir: 1, done: () => bool },
 *   ]);
 *   ループ内で GUIDE.tick(dt)、stop() で GUIDE.stop()。
 * at/to は THREE.Object3D か THREE.Vector3 を返す関数。
 * 省略可: r (輪の半径・ワールド単位), when: () => bool (前提条件)。
 */
window.GUIDE = (() => {
  const IDLE_SEC = 6;        /* 迷ったと判定するまでの秒数 */
  const FIRST_SEC = 0.8;     /* 開始直後に最初の一手を出すまで */
  const REGRAB_SEC = 1.5;    /* 指を離してから再表示までの猶予 */

  let stage3, steps, group, ring, ringMat, finger, fingerMat;
  let chev, chevMats, arc, arcMat, arcArrow;
  let stepIdx, visible, idleT, anim, lastShownStep, downCount, releaseT;
  let dom, onDown, onUp;
  const V = () => new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function posOf(x) {
    const o = typeof x === 'function' ? x() : x;
    if (!o) return null;
    if (o.isVector3) return tmp.copy(o);
    o.getWorldPosition(tmp);
    return tmp;
  }

  function makeVisuals() {
    group = new THREE.Group();
    group.renderOrder = 999;
    stage3.scene.add(group);

    const mat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
    });

    /* 光る輪 (2重) */
    ringMat = mat(0xffd94a, 0.85);
    ring = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40), ringMat);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.68, 40), mat(0xfff4c0, 0.5));
    r2.userData.inner = true;
    ring.add(r1, r2);
    group.add(ring);

    /* 指マーク (白い手ぶくろ風の指) */
    fingerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false,
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x39404a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false,
    });
    finger = new THREE.Group();
    /* 指本体: 先を下に向けたカプセル + 握りこぶし */
    const tipLen = 1.3;
    const fBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, tipLen, 6, 12), fingerMat);
    fBody.position.y = tipLen / 2 + 0.3;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), fingerMat);
    fist.position.set(0.22, tipLen + 0.55, 0);
    fist.scale.set(1.15, 0.85, 0.9);
    /* ふちどり (少し大きい暗色を背面に) */
    const oBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, tipLen, 6, 12), edgeMat);
    oBody.position.copy(fBody.position);
    oBody.renderOrder = -1;
    const oFist = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), edgeMat);
    oFist.position.copy(fist.position);
    oFist.scale.copy(fist.scale);
    oFist.renderOrder = -1;
    finger.add(oBody, oFist, fBody, fist);
    group.add(finger);

    /* ドラッグ用のシェブロン矢印 (進行方向へ流れる) */
    chev = new THREE.Group();
    chevMats = [];
    for (let i = 0; i < 5; i++) {
      const m = mat(0xffd94a, 0.8);
      chevMats.push(m);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4), m);
      chev.add(c);
    }
    group.add(chev);

    /* 回す用の円弧矢印 */
    arcMat = mat(0xffd94a, 0.8);
    arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 40, Math.PI * 1.45), arcMat);
    arcArrow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 4), arcMat);
    arc.add(arcArrow);
    arcArrow.position.set(Math.cos(Math.PI * 1.45), Math.sin(Math.PI * 1.45), 0);
    arcArrow.rotation.z = Math.PI * 1.45 + Math.PI / 2 + 0.3;
    group.add(arc);

    group.traverse(o => { o.renderOrder = 999; });
    group.visible = false;
  }

  function baseR(st) {
    return st.r || (stage3.orbit.radius * 0.055);
  }

  function show() {
    visible = true;
    group.visible = true;
    anim = 0;
    if (lastShownStep !== stepIdx) {
      lastShownStep = stepIdx;
      if (window.S && S.guideChime) S.guideChime();
    }
  }

  function hide() {
    visible = false;
    if (group) group.visible = false;
  }

  function currentStep() {
    if (!steps) return -1;
    for (let i = 0; i < steps.length; i++) {
      let d = false;
      try { d = !!steps[i].done(); } catch (e) { d = true; }
      if (!d) return i;
    }
    return -1;
  }

  function layout(dt) {
    const st = steps[stepIdx];
    const p = posOf(st.at);
    if (!p) { hide(); return; }
    const R = baseR(st);
    const cam = stage3.camera;
    anim += dt;

    /* 輪: 対象位置でカメラを向いて脈打つ */
    ring.position.copy(p);
    ring.quaternion.copy(cam.quaternion);
    const pulse = 1 + 0.18 * Math.sin(anim * 4.2);
    ring.scale.setScalar(R * pulse);
    ringMat.opacity = 0.55 + 0.3 * Math.sin(anim * 4.2);

    /* カメラの右/上方向 (指のオフセットに使う) */
    const camUp = tmp2.set(0, 1, 0).applyQuaternion(cam.quaternion);

    chev.visible = false;
    arc.visible = false;
    finger.visible = true;
    finger.quaternion.copy(cam.quaternion);
    finger.scale.setScalar(R * 0.55);

    if (st.kind === 'tap') {
      /* 指がトントンと降りる */
      const t = anim % 1.1;
      const dy = t < 0.25 ? U.lerp(0.9, 0.1, t / 0.25)
        : t < 0.45 ? 0.1
        : U.lerp(0.1, 0.9, Math.min(1, (t - 0.45) / 0.4));
      finger.position.copy(p).addScaledVector(camUp, R * (0.35 + dy));
    } else if (st.kind === 'hold') {
      /* 押しこんだまま・輪がじわっと広がる */
      const t = anim % 2.2;
      const press = t < 0.3 ? U.lerp(0.9, 0.1, t / 0.3) : 0.1;
      finger.position.copy(p).addScaledVector(camUp, R * (0.35 + press));
      if (t >= 0.3) {
        const g = (t - 0.3) / 1.9;
        ring.scale.setScalar(R * (1 + g * 0.8));
        ringMat.opacity = 0.85 * (1 - g);
      }
    } else if (st.kind === 'drag') {
      const q = posOf(st.to);
      if (q) {
        const a = p.clone(), b = q.clone();
        /* 指がAからBへ動き続ける */
        const t = (anim % 1.6) / 1.6;
        const ease = t < 0.15 ? 0 : t > 0.85 ? 1 : (t - 0.15) / 0.7;
        finger.position.lerpVectors(a, b, ease).addScaledVector(camUp, R * 0.3);
        /* 道すじのシェブロン */
        chev.visible = true;
        const dir = tmp2.copy(b).sub(a);
        const len = dir.length();
        dir.normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        chev.children.forEach((c, i) => {
          const f = (i + 1) / 6;
          c.position.copy(a).addScaledVector(dir, len * f);
          c.quaternion.copy(quat);
          c.scale.setScalar(R * 0.55);
          chevMats[i].opacity = 0.25 + 0.6 * Math.max(0, Math.sin(anim * 5 - i * 1.1));
        });
        /* 輪はスタート地点に */
        ring.position.copy(a);
      }
    } else if (st.kind === 'turn') {
      /* 指が円を描き、円弧矢印を表示 */
      arc.visible = true;
      arc.position.copy(p);
      arc.quaternion.copy(cam.quaternion);
      arc.scale.setScalar(R * 1.15);
      arc.rotation.z += 0;
      const dir = st.turnDir || 1;
      const th = -dir * anim * 2.4;
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      finger.position.copy(p)
        .addScaledVector(camRight, Math.cos(th) * R * 1.15)
        .addScaledVector(camUp, Math.sin(th) * R * 1.15 + R * 0.2);
      if (dir < 0) { arc.scale.x *= -1; }
      ringMat.opacity *= 0.4;
    }
  }

  return {
    start(s3, defs) {
      this.stop();
      stage3 = s3;
      steps = defs;
      stepIdx = -2;
      visible = false;
      idleT = IDLE_SEC - FIRST_SEC;   /* 最初の一手はすぐ出す */
      lastShownStep = -1;
      downCount = 0;
      releaseT = 99;
      anim = 0;
      makeVisuals();
      dom = stage3.renderer.domElement;
      onDown = () => { downCount++; hide(); };
      onUp = () => { downCount = Math.max(0, downCount - 1); releaseT = 0; };
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);
    },

    tick(dt) {
      if (!steps) return;
      const cur = currentStep();
      if (cur !== stepIdx) {
        const first = stepIdx === -2;   /* 起動直後の初期化は進捗あつかいしない */
        stepIdx = cur;
        if (!first) {
          idleT = 0;
          hide();
        }
      }
      if (stepIdx < 0) { hide(); this.report(); return; }
      const st = steps[stepIdx];
      if (st.when && !st.when()) { idleT = 0; hide(); this.report(); return; }

      releaseT += dt;
      if (downCount > 0) {
        /* さわっているあいだは出さない (探索の邪魔をしない) */
        idleT = Math.min(idleT, IDLE_SEC - REGRAB_SEC);
      } else {
        idleT += dt;
      }
      if (!visible && idleT >= IDLE_SEC && releaseT >= REGRAB_SEC) show();
      if (visible) layout(dt);
      this.report();
    },

    report() {
      if (window.__dbgGD) window.__dbgGD({ step: stepIdx, visible, idleT: +idleT.toFixed(1) });
    },

    stop() {
      if (dom) {
        dom.removeEventListener('pointerdown', onDown);
        dom.removeEventListener('pointerup', onUp);
        dom = null;
      }
      if (group && stage3) {
        stage3.scene.remove(group);
        group.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      }
      group = null;
      steps = null;
      stage3 = null;
      visible = false;
    },
  };
})();
