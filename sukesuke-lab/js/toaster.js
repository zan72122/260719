/* ポップアップトースター — 写実3D (断面)
 *
 * 毎朝パンが飛び出すのに、中で何がおきているかは見えない。
 * 側面パネルを外して、キャリッジ・バネ・ラッチ・ニクロム線を見せる。
 * 連鎖: パンをスロットへ → レバーを下げる → バネが縮んでラッチがカチッ →
 *       ニクロム線が赤く光る → パンがだんだんきつね色 → チン！ラッチが外れて
 *       バネがパンを打ち上げる → お皿へ
 * 分岐: 焼き加減ダイヤル (1〜5) × 途中でキャンセル × 焼きすぎると煙。
 *       焼いたパンはお皿にたまっていく (色もそのまま)。
 */
window.GAMES.toaster = (() => {
  const SLOT = new THREE.Vector3(0, 0, 0);

  let stage3, scene, raf, prev, time;
  let bodyG, carriage, leverKnob, springCtl, latchArm, wires, dialG, cancelBtn;
  let breads, toasting, carriageY, dial, heatT, popVel;
  let dragObj, dragId, orbitId, orbitFrom, smokes, smokeState, dummy;
  let plateG, doneCount;
  let hum, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#f0e8d8', '#f8f2e6', '#c8bca4');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -8;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1600, 1200), shadowSpan: 900, intensity: 0.95 });
    /* キッチンのタイル壁 */
    G3.add(scene, new THREE.BoxGeometry(2400, 1200, 30),
      new THREE.MeshStandardMaterial({ color: 0xdfe8e4, roughness: 0.5 }), 0, 600, -420);

    /* --- トースター本体 (手前側パネルなし = 断面) --- */
    bodyG = new THREE.Group();
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xd84a3a, roughness: 0.22, clearcoat: 0.8, metalness: 0.2 });
    G3.add(bodyG, new THREE.BoxGeometry(520, 300, 20), shellM, 0, 170, -150).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(20, 300, 300), shellM, -260, 170, 0).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(20, 300, 300), shellM, 260, 170, 0);
    G3.add(bodyG, new THREE.BoxGeometry(520, 24, 300), mats.steel, 0, 12, 0);
    /* 天板 (スロット2本) */
    const topM = mats.chrome;
    G3.add(bodyG, new THREE.BoxGeometry(520, 18, 60), topM, 0, 328, -120);
    G3.add(bodyG, new THREE.BoxGeometry(520, 18, 60), topM, 0, 328, 120);
    G3.add(bodyG, new THREE.BoxGeometry(520, 18, 70), topM, 0, 328, 0);
    G3.add(bodyG, new THREE.BoxGeometry(50, 18, 300), topM, -235, 328, 0);
    G3.add(bodyG, new THREE.BoxGeometry(50, 18, 300), topM, 235, 328, 0);

    /* ニクロム線 (ジグザグ 3面) */
    wires = [];
    [-95, 0, 95].forEach(z => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        pts.push(new THREE.Vector3(-180 + i * 30, i % 2 ? 300 : 60, z));
      }
      const wire = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 4, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x553322 }));
      bodyG.add(wire);
      wires.push(wire);
    });

    /* --- キャリッジとバネとラッチ --- */
    carriage = new THREE.Group();
    carriage.position.y = 240;
    bodyG.add(carriage);
    G3.add(carriage, new THREE.BoxGeometry(440, 14, 240), mats.steel, 0, 0, 0);
    [[-60], [60]].forEach(([z]) => {
      G3.add(carriage, new THREE.BoxGeometry(420, 40, 8), mats.steel, 0, 26, z);
    });
    /* レバーつまみ (手前レール) */
    leverKnob = G3.add(scene, new THREE.BoxGeometry(60, 40, 26),
      new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4 }), 290, 240, 160);
    leverKnob.castShadow = true;
    window.__pts.lever = leverKnob;
    G3.add(scene, new THREE.BoxGeometry(14, 300, 14), mats.chrome, 290, 170, 130);
    /* バネ */
    springCtl = G3.springMesh(bodyG, mats.steel, 7, 30, 5);
    /* ラッチのつめ */
    latchArm = G3.add(bodyG, new THREE.BoxGeometry(50, 16, 20),
      new THREE.MeshStandardMaterial({ color: 0x8a6f3c, metalness: 0.8, roughness: 0.4 }), -240, 90, 130);

    /* --- ダイヤルとキャンセル --- */
    dialG = new THREE.Group();
    dialG.position.set(-120, 60, 160);
    scene.add(dialG);
    const dl = G3.add(dialG, new THREE.CylinderGeometry(40, 44, 24, 16), mats.whitePlastic, 0, 0, 0);
    dl.rotation.x = Math.PI / 2;
    dl.castShadow = true;
    G3.add(dialG, new THREE.BoxGeometry(8, 34, 26), new THREE.MeshStandardMaterial({ color: 0xc03030 }), 0, 0, 6);
    window.__pts.dial = dialG;
    cancelBtn = G3.add(scene, new THREE.CylinderGeometry(26, 30, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x505860, roughness: 0.4 }), 30, 60, 160);
    cancelBtn.rotation.x = Math.PI / 2;
    window.__pts.cancel = cancelBtn;

    /* --- パンとお皿 --- */
    breads = [];
    for (let i = 0; i < 2; i++) {
      const b = mkBread();
      b.g.position.set(-330 + i * 140, 60, 290);
      breads.push(b);
      window.__pts['bread' + i] = b.g;
    }
    /* パンの袋 */
    G3.add(scene, new THREE.BoxGeometry(180, 130, 90),
      new THREE.MeshPhysicalMaterial({ color: 0xe8e0c8, roughness: 0.5, transparent: true, opacity: 0.6 }),
      -330, 65, 290);
    plateG = new THREE.Group();
    plateG.position.set(520, 10, 220);
    scene.add(plateG);
    const plate = G3.add(plateG, new THREE.CylinderGeometry(150, 120, 22, 22),
      new THREE.MeshPhysicalMaterial({ color: 0xf0f0ea, roughness: 0.2, clearcoat: 0.5 }), 0, 0, 0);
    plate.castShadow = true;
    window.__pts.plate = plateG;

    /* けむり */
    smokes = new THREE.InstancedMesh(new THREE.SphereGeometry(16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x555, transparent: true, opacity: 0.4, roughness: 1 }), 24);
    smokes.frustumCulled = false;
    scene.add(smokes);
    smokeState = [];
    for (let i = 0; i < 24; i++) smokeState.push({ on: false, x: 0, y: 0, z: 0, age: 0 });
    dummy = new THREE.Object3D();
  }

  function mkBread() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xf2e2c0, roughness: 0.8 });
    const slice = G3.add(g, new THREE.BoxGeometry(150, 170, 34), m, 0, 0, 0);
    slice.castShadow = true;
    const crust = G3.add(g, new THREE.BoxGeometry(160, 180, 30),
      new THREE.MeshStandardMaterial({ color: 0xc89050, roughness: 0.8 }), 0, 0, 0);
    crust.renderOrder = -1;
    scene.add(g);
    return { g, m, toast: 0, state: 'raw', slot: -1, vy: 0, vx: 0 };
  }

  function breadColor(b) {
    const c = new THREE.Color();
    if (b.toast < 0.5) c.lerpColors(new THREE.Color(0xf2e2c0), new THREE.Color(0xd8a860), b.toast * 2);
    else c.lerpColors(new THREE.Color(0xd8a860), new THREE.Color(0x35281a), (b.toast - 0.5) * 2);
    b.m.color.copy(c);
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    const near = (obj, rad, dy) => {
      obj.getWorldPosition(v);
      v.y += dy || 0;
      return ray.ray.distanceToPoint(v) < rad;
    };
    for (const b of breads) {
      if ((b.state === 'raw' || b.state === 'plate') && near(b.g, 110)) {
        dragObj = b;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (near(leverKnob, 80)) {
      dragObj = 'lever';
      dragId = e.pointerId;
      return;
    }
    if (near(dialG, 70)) {
      dragObj = 'dial';
      dragId = e.pointerId;
      dialG.userData.x0 = e.clientX;
      dialG.userData.v0 = dial;
      return;
    }
    if (near(cancelBtn, 55)) {
      if (toasting) pop();
      else S.clickReal(0.4);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (dragObj === 'lever') {
        /* レバーを下げる */
        const t = -o.z / d.z;
        if (t > 0) {
          const y = U.clamp(o.y + d.y * t, 100, 240);
          carriageY = y;
          if (y <= 104 && !toasting && breads.some(b => b.state === 'in')) {
            latchAndToast();
          }
        }
      } else if (dragObj === 'dial') {
        dial = U.clamp(dialG.userData.v0 + (e.clientX - dialG.userData.x0) / 60, 1, 5);
      } else {
        const t = (240 - o.y) / d.y;
        if (t > 0) {
          dragObj.g.position.set(o.x + d.x * t, 240, U.clamp(o.z + d.z * t, -60, 320));
          dragObj.state = 'raw';
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.6, 0.75);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.42);
    }
  }

  function latchAndToast() {
    toasting = true;
    heatT = 0;
    S.kachi();
    S.clickReal(1);
    if (hum) hum.set(0.5);
  }

  function pop() {
    toasting = false;
    if (hum) hum.set(0);
    S.snapBack();
    S.ding();
    popVel = 900;
    breads.forEach(b => {
      if (b.state === 'in') {
        b.state = 'fly';
        b.vy = 950 + dial * 40;
        b.vx = 120 + Math.random() * 120;
      }
    });
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragObj && dragObj !== 'lever' && dragObj !== 'dial') {
        /* スロットに入れたか (2本のどちらか) */
        const p = dragObj.g.position;
        const nearSlot = Math.abs(p.x) < 220 && Math.abs(p.z) < 160 && !toasting;
        if (nearSlot) {
          const slot = p.z < 0 ? -60 : 60;
          dragObj.state = 'in';
          dragObj.slot = slot;
          dragObj.g.position.set(U.clamp(p.x, -140, 140), carriageY - 40, slot);
          dragObj.g.rotation.set(0, 0, 0);
          S.squishReal(0.4);
        } else if (Math.hypot(p.x - 520, p.z - 220) < 180) {
          dragObj.state = 'plate';
          dragObj.g.position.set(520 + (Math.random() - 0.5) * 60, 40 + doneCount * 8, 220 + (Math.random() - 0.5) * 40);
          dragObj.g.rotation.set(-1.35, 0, (Math.random() - 0.5) * 0.4);
        } else {
          dragObj.g.position.y = 90;
          dragObj.g.rotation.set(0, 0, 0);
        }
      }
      if (dragObj === 'lever' && !toasting) carriageY = 240;
      dragObj = null;
      dragId = null;
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* トースト進行 */
    if (toasting) {
      carriageY = 100;
      heatT += dt;
      const doneT = 3 + dial * 2.2;
      breads.forEach(b => {
        if (b.state !== 'in') return;
        b.toast = Math.min(1.15, b.toast + dt / (doneT * 1.4));
        /* 焼きすぎで煙 */
        if (b.toast > 0.85 && Math.random() < 0.15) {
          const s = smokeState.find(ss => !ss.on);
          if (s) {
            s.on = true;
            s.x = b.g.position.x;
            s.y = 340;
            s.z = b.slot;
            s.age = 0;
          }
        }
      });
      if (heatT >= doneT) pop();
    } else if (dragObj !== 'lever') {
      /* キャリッジはバネで上へ */
      carriageY = Math.min(240, carriageY + popVel * dt);
      popVel = Math.max(0, popVel - 1600 * dt);
    }
    carriage.position.y = carriageY;
    leverKnob.position.y = carriageY;
    springCtl.update(24, Math.max(30, carriageY - 90));
    latchArm.position.x = toasting ? -215 : -240;

    /* ニクロム線の光り */
    const glow = toasting ? 1 : 0;
    wires.forEach(w => {
      w.material.color.lerp(new THREE.Color(glow ? 0xff5522 : 0x553322), Math.min(1, dt * 5));
    });

    /* パン */
    breads.forEach(b => {
      breadColor(b);
      if (b.state === 'in' && dragObj !== b) {
        b.g.position.y = carriageY - 40;
        b.g.position.z = b.slot;
      } else if (b.state === 'fly') {
        b.vy -= 2600 * dt;
        b.g.position.y += b.vy * dt;
        b.g.position.x += b.vx * dt;
        b.g.rotation.z += dt * 3;
        if (b.g.position.y < 60 && b.vy < 0) {
          /* 着地: お皿の上ならきれいに乗る */
          if (Math.hypot(b.g.position.x - 520, b.g.position.z - 220) < 220) {
            b.state = 'plate';
            doneCount++;
            b.g.position.y = 40 + doneCount * 8;
            b.g.rotation.set(-1.35, 0, (Math.random() - 0.5) * 0.4);
          } else {
            b.state = 'raw';
            b.g.position.y = 90;
            b.g.rotation.set(0, 0, 0.3);
          }
          S.thunk();
        }
      }
    });

    /* けむり */
    smokeState.forEach((s, i) => {
      if (s.on) {
        s.age += dt;
        s.y += dt * 120;
        if (s.age > 2) s.on = false;
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(s.on ? 0.5 + s.age * 0.8 : 0.0001);
      dummy.updateMatrix();
      smokes.setMatrixAt(i, dummy.matrix);
    });
    smokes.instanceMatrix.needsUpdate = true;

    /* ダイヤルの見た目 */
    dialG.rotation.z = -(dial - 1) * 0.5;

    if (window.__dbgTS) window.__dbgTS({
      toasting, dial: +dial.toFixed(1), heatT: +heatT.toFixed(1),
      breads: breads.map(b => [b.state, +b.toast.toFixed(2)]),
      carriage: carriageY | 0,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      toasting = false; carriageY = 240; dial = 2; heatT = 0; popVel = 0; doneCount = 0;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(20, 200, 0),
        radius: 1250, radiusPortraitBase: 1600, radiusMaxPortrait: 2600,
        az: 0.25, po: 1.1,
      });
      build();
      hum = S.humLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: パンを入れる → レバーを下げる → 焼けたらお皿へ */
      let gdPlate = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.bread0, to: () => new THREE.Vector3(0, 320, 60),
          when: () => !toasting, done: () => breads.some(b => b.state === 'in'),
        },
        {
          kind: 'drag', at: () => leverKnob, to: () => new THREE.Vector3(290, 90, 160),
          when: () => breads.some(b => b.state === 'in') && !toasting,
          done: () => toasting || breads.some(b => b.toast > 0.05),
        },
        {
          kind: 'drag',
          at: () => {
            const b = breads.find(bb => bb.state === 'raw' && bb.toast > 0.1);
            return b ? b.g : null;
          },
          to: () => plateG,
          when: () => breads.some(b => b.state === 'raw' && b.toast > 0.1),
          done: () => (gdPlate = gdPlate || breads.some(b => b.state === 'plate')),
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (hum) hum.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
