/* エレベーター機械室 — 写実3D (断面ビル)
 *
 * ふだん絶対に見られない機械。屋上の機械室で巻上機の綱車が回り、
 * ロープの片側でカゴが、反対側で釣合おもりが逆方向に動く。
 * 連鎖: 呼びボタン → 制御盤 → モーター → 綱車 → ロープ → カゴ昇降 →
 *       釣合おもりが逆に動く → 到着チーン → ドアが開く
 * 分岐: 呼ぶ順番がそのまま巡回順になる × 荷物の重さで加減速が変わる ×
 *       過積載はブザーでドアが閉まらない
 */
window.GAMES.elevator = (() => {
  const FLOORS = [60, 360, 660, 960];      // 各階の床
  const SHAFT_X = -180;                    // 昇降路の中心
  const CW_X = -20;                        // 釣合おもりのレール
  const SHEAVE = new THREE.Vector3(-100, 1180, 0);

  let stage3, scene, raf, prev, time;
  let carG, doorL, doorR, cwG, sheave, motor, governor, ropes, btnHits, lampMats;
  let cargo, cargoDragId, dragCargo;
  let queue, targetF, carY, carV, doorOpen, doorTimer, overload;
  let servo, orbitId, orbitFrom, mats, dingDone;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#b8d0e0', '#c8d8e4', '#98a4ac');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshStandardMaterial({ color: 0x9aa08e, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 2200, 1100), shadowSpan: 1500, intensity: 0.85 });

    /* --- 断面ビル --- */
    const wall = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 });
    const slabM = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.7 });
    /* 奥の壁と側壁 */
    G3.add(scene, new THREE.BoxGeometry(760, 1240, 24), wall, 60, 620, -170);
    G3.add(scene, new THREE.BoxGeometry(24, 1240, 340), wall, 440, 620, 0);
    /* 床スラブ (昇降路の右側だけ) */
    FLOORS.forEach((y, i) => {
      G3.add(scene, new THREE.BoxGeometry(360, 22, 320), slabM, 250, y - 11, 0).receiveShadow = true;
      /* 窓っぽい飾り */
      if (i > 0) G3.add(scene, new THREE.BoxGeometry(120, 90, 6),
        new THREE.MeshStandardMaterial({ color: 0x9ec4e0, roughness: 0.2 }), 300, y + 160, -164);
    });
    /* 昇降路のガイドレール */
    [-70, 70].forEach(z => {
      G3.add(scene, new THREE.BoxGeometry(14, 1240, 14), mats.steel, SHAFT_X - 95, 620, z);
    });
    G3.add(scene, new THREE.BoxGeometry(10, 1240, 10), mats.steel, CW_X, 620, -120);

    /* --- 機械室 (屋上) --- */
    G3.add(scene, new THREE.BoxGeometry(760, 20, 340), slabM, 60, 1130, 0).receiveShadow = true;
    G3.add(scene, new THREE.BoxGeometry(300, 180, 240),
      new THREE.MeshStandardMaterial({ color: 0xc8c2b0, roughness: 0.8, transparent: true, opacity: 0.35 }), -60, 1230, 0);
    /* 巻上機モーター */
    motor = G3.add(scene, new THREE.CylinderGeometry(44, 44, 110, 18), mats.brass, 20, 1180, 0);
    motor.rotation.z = Math.PI / 2;
    /* 綱車 (プーリー) */
    sheave = new THREE.Group();
    sheave.position.copy(SHEAVE);
    scene.add(sheave);
    const sh = G3.add(sheave, new THREE.CylinderGeometry(56, 56, 26, 20), mats.steel, 0, 0, 0);
    sh.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      G3.add(sheave, new THREE.BoxGeometry(100, 10, 8), mats.darkPlastic, 0, 0, 0).rotation.z = i * Math.PI / 4;
    }
    /* ガバナ (調速機) */
    governor = G3.add(scene, new THREE.CylinderGeometry(24, 24, 12, 12), mats.chrome, -220, 1180, 60);
    governor.rotation.x = Math.PI / 2;

    /* --- カゴ --- */
    carG = new THREE.Group();
    scene.add(carG);
    const carM = new THREE.MeshPhysicalMaterial({ color: 0x8898a8, metalness: 0.5, roughness: 0.35 });
    G3.add(carG, new THREE.BoxGeometry(170, 12, 170), carM, 0, 0, 0);
    G3.add(carG, new THREE.BoxGeometry(170, 12, 170), carM, 0, 210, 0);
    G3.add(carG, new THREE.BoxGeometry(12, 210, 170), carM, -84, 105, 0);
    G3.add(carG, new THREE.BoxGeometry(170, 210, 12), carM, 0, 105, -84);
    /* ドア2枚 (手前) */
    doorL = G3.add(carG, new THREE.BoxGeometry(80, 196, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xb8c4cc, metalness: 0.6, roughness: 0.3 }), -42, 105, 86);
    doorR = doorL.clone();
    doorR.position.x = 42;
    carG.add(doorR);

    /* --- 釣合おもり --- */
    cwG = new THREE.Group();
    scene.add(cwG);
    for (let i = 0; i < 4; i++) {
      G3.add(cwG, new THREE.BoxGeometry(90, 34, 40), mats.steel, 0, i * 38, 0);
    }

    /* ロープ (2本: カゴ側とおもり側) */
    ropes = [
      G3.add(scene, new THREE.CylinderGeometry(3, 3, 1, 6), mats.darkPlastic, SHAFT_X, 0, 0),
      G3.add(scene, new THREE.CylinderGeometry(3, 3, 1, 6), mats.darkPlastic, CW_X, 0, -120),
    ];

    /* --- 呼びボタン (各階) --- */
    btnHits = [];
    lampMats = [];
    FLOORS.forEach((y, i) => {
      G3.add(scene, new THREE.BoxGeometry(30, 60, 14), mats.whitePlastic, -30, y + 130, 96);
      const lm = new THREE.MeshBasicMaterial({ color: 0x503030 });
      lampMats.push(lm);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 8, 12), lm);
      b.position.set(-30, y + 130, 106);
      b.rotation.x = Math.PI / 2;
      scene.add(b);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(-30, y + 130, 100);
      hit.userData.floor = i;
      scene.add(hit);
      btnHits.push(hit);
      window.__pts['btn' + i] = hit;
    });

    /* --- 荷物 (おもり玉) --- */
    cargo = [];
    const cargoM = new THREE.MeshPhysicalMaterial({ color: 0xc07830, roughness: 0.5, clearcoat: 0.3 });
    for (let i = 0; i < 3; i++) {
      const m = G3.add(scene, new THREE.SphereGeometry(34, 14, 10), cargoM.clone(), 180 + i * 90, FLOORS[0] + 34, 110);
      m.castShadow = true;
      cargo.push({ m, inCar: false, home: m.position.clone() });
      window.__pts['cargo' + i] = m;
    }

    window.__pts.car = carG;
  }

  function carFloorY() { return carY; }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    for (const h of btnHits) {
      if (ray.intersectObject(h, false).length) {
        const f = h.userData.floor;
        if (!queue.includes(f) && targetF !== f) {
          queue.push(f);           /* 押した順番に巡回する */
          lampMats[f].color.set(0xffa040);
          S.clickReal(0.7);
        }
        return;
      }
    }
    /* 荷物のドラッグ */
    for (const c of cargo) {
      if (cargoDragId === null && ray.intersectObjects([c.m], false).length) {
        cargoDragId = e.pointerId;
        dragCargo = c;
        c.inCar = false;
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragCargo && e.pointerId === cargoDragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (140 - o.z) / d.z * -1;   /* 手前の平面 z=140 */
      const tz = (140 - o.z) / d.z;
      if (tz > 0) {
        dragCargo.m.position.set(o.x + d.x * tz, Math.max(60, o.y + d.y * tz), 140);
      }
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.1);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.9, 1.55);
    }
  }

  function onUp(e) {
    if (dragCargo && e.pointerId === cargoDragId) {
      /* カゴの中に置けたか (ドアが開いているときだけ) */
      const p = dragCargo.m.position;
      const inCarZone = doorOpen > 0.6 &&
        Math.abs(p.x - SHAFT_X) < 100 && Math.abs(p.y - (carY + 100)) < 140;
      if (inCarZone) {
        dragCargo.inCar = true;
        S.thunk();
      } else {
        dragCargo.inCar = false;
        dragCargo.m.position.copy(dragCargo.home);
        S.plip(0.7);
      }
      dragCargo = null;
      cargoDragId = null;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    const load = cargo.filter(c => c.inCar).length;
    overload = load >= 3;

    /* 行き先の決定 (押した順) */
    if (targetF === -1 && queue.length && doorTimer <= 0) {
      if (overload) {
        if (Math.floor(time * 2) % 2 === 0) { /* ブザーはたまに */ }
      } else {
        targetF = queue.shift();
        dingDone = false;
      }
    }
    if (overload && doorOpen > 0.5 && Math.floor(time) !== Math.floor(time - dt)) S.buzz();

    /* ドアの開閉 */
    let doorTarget = 0;
    if (targetF === -1) {
      if (doorTimer > 0) {
        doorTimer -= dt;
        doorTarget = 1;
      }
      if (overload) doorTarget = 1;   /* 過積載はドアが閉まらない */
    }
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 3);
    doorL.position.x = -42 - doorOpen * 76;
    doorR.position.x = 42 + doorOpen * 76;

    /* カゴの移動 (荷物が重いほど加速がにぶい) */
    if (targetF !== -1 && doorOpen < 0.1) {
      const ty = FLOORS[targetF];
      const dy = ty - carY;
      const maxV = 260 * (1 - load * 0.13);
      const want = U.clamp(dy * 1.6, -maxV, maxV);
      carV += (want - carV) * Math.min(1, dt * (1.6 - load * 0.3));
      carY += carV * dt;
      servo.set(U.clamp(Math.abs(carV) / 260, 0.12, 1));
      if (Math.abs(dy) < 6 && Math.abs(carV) < 30) {
        carY = ty;
        carV = 0;
        lampMats[targetF].color.set(0x503030);
        targetF = -1;
        doorTimer = 2.4;
        servo.set(0);
        if (!dingDone) { dingDone = true; S.ding(); }
      }
    } else if (targetF !== -1) {
      /* ドアが閉まるのを待つ */
      servo.set(0.05);
    } else {
      servo.set(0);
    }

    /* カゴ・おもり・ロープ・機械 */
    carG.position.set(SHAFT_X, carY, 0);
    const cwY = 1120 - (carY - FLOORS[0]);   /* 逆方向に動く */
    cwG.position.set(CW_X, cwY - 940, -120);
    ropes[0].position.set(SHAFT_X, (carY + 220 + SHEAVE.y) / 2, 0);
    ropes[0].scale.y = Math.max(1, SHEAVE.y - carY - 220);
    ropes[1].position.set(CW_X, (cwY - 940 + 152 + SHEAVE.y) / 2, -120);
    ropes[1].scale.y = Math.max(1, SHEAVE.y - (cwY - 940) - 152);
    sheave.rotation.z -= carV * dt * 0.02;
    motor.rotation.x += carV * dt * 0.03;
    governor.rotation.y += Math.abs(carV) * dt * 0.05;

    /* カゴ内の荷物はカゴに追従 */
    let ci = 0;
    for (const c of cargo) {
      if (c.inCar && c !== dragCargo) {
        c.m.position.set(SHAFT_X - 40 + ci * 44, carY + 46, 30);
        ci++;
      }
    }

    if (window.__dbgEL) window.__dbgEL({ carY: carY | 0, target: targetF, q: queue.join(''), load, door: +doorOpen.toFixed(2) });
    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      carY = FLOORS[0];
      carV = 0;
      queue = [];
      targetF = -1;
      doorOpen = 1;
      doorTimer = 3;
      cargoDragId = null; dragCargo = null; orbitId = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 620, 0),
        radius: 2100, radiusPortraitBase: 1750, radiusMaxPortrait: 2800,
        az: 0.35, po: 1.35,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 呼びボタン → 荷物をカゴへ */
      let gdCalled = false, gdLoaded = false;
      GUIDE.start(stage3, [
        {
          kind: 'tap', at: () => window.__pts.btn2,
          done: () => (gdCalled = gdCalled || queue.length > 0 || targetF !== -1),
        },
        {
          kind: 'drag', at: () => cargo[0].m, to: () => carG,
          when: () => doorOpen > 0.6,
          done: () => (gdLoaded = gdLoaded || cargo.some(c => c.inCar)),
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (servo) servo.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
