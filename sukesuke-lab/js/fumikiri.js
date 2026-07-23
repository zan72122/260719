/* ふみきり — 写実3D
 *
 * カンカン鳴って棒が下りて電車が通る。あの一連の流れを自分で起こせる。
 * 連鎖: よびだしボタン → 遠くから電車が近づく → センサー → 警報機カンカン+
 *       赤ランプ交互点滅 → 遮断桿がゆっくり下りる → 電車がゴーッと通過 →
 *       遮断桿が上がって静かになる → 人形が渡れる
 * 分岐: 渡るタイミング × 非常ボタン (電車がキーッと急ブレーキで止まる) ×
 *       警報中は遮断桿が人形を通せんぼ。
 */
window.GAMES.fumikiri = (() => {
  let stage3, scene, raf, prev, time;
  let train, trainX, trainV, phase, warnT, bellT, lampFlip;
  let lampA, lampB, armL, armR, armA, doll, dollHome;
  let callBtn, emgBtn, emgOn, crossedN, stoppedByEmg;
  let dragDoll, dragId, orbitId, orbitFrom;
  let rumble, mats;

  const RAIL_Z = -80;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#cfe2ec', '#e8f0f2', '#9ab4c0');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshStandardMaterial({ color: 0x8fae72, roughness: 0.8 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1400), shadowSpan: 1500, intensity: 1.0 });

    /* --- 線路 (x方向) --- */
    G3.add(scene, new THREE.BoxGeometry(7000, 14, 240),
      new THREE.MeshStandardMaterial({ color: 0x9a8f78, roughness: 0.85 }), 0, 7, RAIL_Z);
    const railM = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.85, roughness: 0.3 });
    G3.add(scene, new THREE.BoxGeometry(7000, 12, 16), railM, 0, 22, RAIL_Z - 70);
    G3.add(scene, new THREE.BoxGeometry(7000, 12, 16), railM, 0, 22, RAIL_Z + 70);
    for (let i = -16; i <= 16; i++) {
      G3.add(scene, new THREE.BoxGeometry(60, 10, 200),
        new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }), i * 210, 14, RAIL_Z);
    }
    /* --- 道路 (z方向・踏切部分) --- */
    G3.add(scene, new THREE.BoxGeometry(300, 10, 2600),
      new THREE.MeshStandardMaterial({ color: 0x6e7276, roughness: 0.8 }), 0, 5, 0);
    G3.add(scene, new THREE.BoxGeometry(300, 16, 220),
      new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.8 }), 0, 12, RAIL_Z);

    /* --- 警報機 (ポール+X印+ランプ2+ベル) --- */
    const poleG = new THREE.Group();
    poleG.position.set(230, 0, 160);
    scene.add(poleG);
    G3.add(poleG, new THREE.CylinderGeometry(14, 16, 620, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 }), 0, 310, 0).castShadow = true;
    /* しましま */
    for (let i = 0; i < 5; i++) {
      G3.add(poleG, new THREE.CylinderGeometry(15.5, 15.5, 42, 10),
        new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.6 }), 0, 120 + i * 110, 0);
    }
    /* X印 (交差した板) */
    const xm = new THREE.MeshStandardMaterial({ color: 0xf0d020, roughness: 0.5 });
    const x1 = G3.add(poleG, new THREE.BoxGeometry(240, 40, 12), xm, 0, 600, 0);
    x1.rotation.z = 0.5;
    const x2 = G3.add(poleG, new THREE.BoxGeometry(240, 40, 12), xm, 0, 600, 0);
    x2.rotation.z = -0.5;
    /* ランプ2つ (交互点滅) */
    const lampBox = G3.add(poleG, new THREE.BoxGeometry(200, 70, 30), mats.darkPlastic, 0, 500, 0);
    lampA = G3.add(poleG, new THREE.SphereGeometry(26, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x581010, emissive: 0x000000 }), -60, 500, 18);
    lampB = G3.add(poleG, new THREE.SphereGeometry(26, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x581010, emissive: 0x000000 }), 60, 500, 18);
    /* ベル */
    G3.add(poleG, new THREE.SphereGeometry(30, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.brass, 0, 660, 0);

    /* --- 遮断桿 2本 (道の両側・根本ピボット) --- */
    const mkArm = (z, dir) => {
      const g = new THREE.Group();
      g.position.set(dir * 170, 130, z);
      scene.add(g);
      G3.add(g, new THREE.BoxGeometry(40, 260, 40),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 }), 0, -65, 0).castShadow = true;
      const arm = new THREE.Group();
      g.add(arm);
      for (let i = 0; i < 6; i++) {
        G3.add(arm, new THREE.BoxGeometry(56, 16, 16),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe23030 : 0xf0f0e8, roughness: 0.5 }),
          -dir * (34 + i * 55), 0, 0);
      }
      arm.rotation.z = dir * 1.35;
      return { g, arm, dir };
    };
    armL = mkArm(150, 1);
    armR = mkArm(-310, -1);
    window.__pts.arm = armL.g;

    /* --- 電車 (3両) --- */
    train = new THREE.Group();
    scene.add(train);
    const bodyM = new THREE.MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.3, clearcoat: 0.5 });
    const lineM = new THREE.MeshStandardMaterial({ color: 0xe87820, roughness: 0.4 });
    for (let c = 0; c < 3; c++) {
      const car = new THREE.Group();
      car.position.x = (c - 1) * 640;
      train.add(car);
      const body = G3.add(car, new THREE.BoxGeometry(600, 260, 180), bodyM, 0, 240, 0);
      body.castShadow = true;
      G3.add(car, new THREE.BoxGeometry(600, 40, 184), lineM, 0, 160, 0);
      for (let w = 0; w < 4; w++) {
        G3.add(car, new THREE.BoxGeometry(90, 80, 184),
          new THREE.MeshPhysicalMaterial({ color: 0x4a6a80, roughness: 0.15, metalness: 0.4 }), -210 + w * 140, 290, 0);
      }
      G3.add(car, new THREE.BoxGeometry(600, 30, 160), mats.darkPlastic, 0, 105, 0);
      [-200, 200].forEach(wx => {
        [-70, 70].forEach(wz => {
          const wheel = G3.add(car, new THREE.CylinderGeometry(42, 42, 20, 12), mats.steel, wx, 42, wz);
          wheel.rotation.x = Math.PI / 2;
        });
      });
    }
    train.position.set(-4200, 0, RAIL_Z);

    /* --- 人形 --- */
    doll = G3.doll({ shirt: 0xd8a03a });
    dollHome = new THREE.Vector3(80, 0, 420);
    doll.g.position.copy(dollHome);
    scene.add(doll.g);
    window.__pts.fdoll = doll.g;

    /* --- よびだしボタン (でんしゃがくる) と 非常ボタン --- */
    const boxCall = new THREE.Group();
    boxCall.position.set(-260, 0, 300);
    scene.add(boxCall);
    G3.add(boxCall, new THREE.BoxGeometry(80, 260, 60),
      new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.5 }), 0, 130, 0).castShadow = true;
    callBtn = G3.add(boxCall, new THREE.CylinderGeometry(30, 34, 22, 14),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.3, clearcoat: 0.6 }), 0, 280, 0);
    window.__pts.call = callBtn;
    const boxEmg = new THREE.Group();
    boxEmg.position.set(340, 0, -280);
    scene.add(boxEmg);
    G3.add(boxEmg, new THREE.BoxGeometry(90, 220, 60),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 }), 0, 110, 0).castShadow = true;
    G3.add(boxEmg, new THREE.BoxGeometry(100, 90, 66),
      new THREE.MeshStandardMaterial({ color: 0xd83030, roughness: 0.45 }), 0, 240, 0);
    emgBtn = G3.add(boxEmg, new THREE.CylinderGeometry(28, 32, 24, 14),
      new THREE.MeshPhysicalMaterial({ color: 0xf0d020, roughness: 0.3, clearcoat: 0.6 }), 0, 240, 40);
    emgBtn.rotation.x = Math.PI / 2;
    window.__pts.emg = emgBtn;
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
    if (near(callBtn, 80)) {
      if (phase === 'idle') {
        phase = 'come';
        trainX = -3800;
        trainV = 900;
        stoppedByEmg = false;
        S.clickReal(0.9);
        S.doorChime();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(emgBtn, 80)) {
      if ((phase === 'come' || phase === 'warn' || phase === 'pass') && !emgOn) {
        emgOn = true;
        S.boom(0.1);
        S.buzz();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(doll.g, 130, 80)) {
      dragDoll = true;
      dragId = e.pointerId;
      S.plip(1.3);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragDoll && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (140 - o.y) / d.y;
      if (t > 0) {
        let nx = U.clamp(o.x + d.x * t, -420, 420);
        let nz = U.clamp(o.z + d.z * t, -460, 470);
        /* 遮断桿が下りていたら線路帯に入れない */
        if (armA > 0.35) {
          const zNow = doll.g.position.z;
          if (zNow > 120 && nz < 120) nz = 122;
          if (zNow < -270 && nz > -270) nz = -272;
        }
        doll.g.position.set(nx, 0, nz);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.55, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.35);
    }
  }

  function onUp(e) {
    if (dragDoll && e.pointerId === dragId) {
      dragDoll = false;
      dragId = null;
      /* 渡りきった? */
      if (doll.g.position.z < -290) {
        crossedN++;
        S.yay();
      }
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* 電車の走行と状態機械 */
    if (phase !== 'idle') {
      if (emgOn && trainV > 0 && trainX < 900) {
        /* 非常ブレーキ */
        trainV = Math.max(0, trainV - dt * 700);
        if (trainV <= 0 && !stoppedByEmg) {
          stoppedByEmg = true;
          S.snapBack();
        }
      } else if (!emgOn || trainX >= 900) {
        trainV = Math.min(900, trainV + dt * 300);
      }
      trainX += trainV * dt;
      train.position.x = trainX;
      if (rumble) rumble.set(U.clamp(trainV / 900, 0, 1) * U.clamp(1 - Math.abs(trainX) / 3200, 0.05, 1) * 0.9);

      if (phase === 'come' && trainX > -2400) {
        phase = 'warn';
        warnT = 0;
      }
      if (phase === 'warn') {
        warnT += dt;
        if (warnT > 1.6 && armA < 1) armA = Math.min(1, armA + dt * 0.45);
        if (trainX > -1250) phase = 'pass';
      }
      if (phase === 'pass') {
        armA = Math.min(1, armA + dt * 0.45);
        if (trainX > 2600) {
          phase = 'leave';
        }
      }
      if (phase === 'leave') {
        armA = Math.max(0, armA - dt * 0.5);
        if (armA <= 0) {
          phase = 'idle';
          emgOn = false;
          if (rumble) rumble.set(0);
          train.position.x = -4200;
          trainX = -4200;
          trainV = 0;
          S.ding();
        }
      }
      /* カンカン (警報中) */
      const warning = phase === 'warn' || phase === 'pass' || (emgOn && phase !== 'leave');
      if (warning) {
        bellT += dt;
        if (bellT > 0.42) {
          bellT = 0;
          lampFlip = !lampFlip;
          S.kankan();
        }
      }
      lampA.material.emissive.setRGB(warning && lampFlip ? 1 : 0, 0, 0);
      lampB.material.emissive.setRGB(warning && !lampFlip ? 1 : 0, 0, 0);
      lampA.material.color.set(warning && lampFlip ? 0xff5040 : 0x581010);
      lampB.material.color.set(warning && !lampFlip ? 0xff5040 : 0x581010);
    }

    /* 遮断桿の角度 */
    armL.arm.rotation.z = armL.dir * 1.35 * (1 - armA);
    armR.arm.rotation.z = armR.dir * 1.35 * (1 - armA);

    /* 人形の歩きゆれ */
    if (dragDoll) {
      doll.g.rotation.z = Math.sin(time * 10) * 0.06;
      doll.legL.rotation.x = Math.sin(time * 11) * 0.5;
      doll.legR.rotation.x = -Math.sin(time * 11) * 0.5;
    } else {
      doll.g.rotation.z = 0;
      doll.legL.rotation.x = 0;
      doll.legR.rotation.x = 0;
    }

    if (window.__dbgFK) window.__dbgFK({
      phase, arm: +armA.toFixed(2), trainX: trainX | 0, v: trainV | 0,
      emg: emgOn, dollZ: doll.g.position.z | 0, crossed: crossedN,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      phase = 'idle'; trainX = -4200; trainV = 0; warnT = 0; bellT = 0;
      lampFlip = false; armA = 0; emgOn = false; crossedN = 0; stoppedByEmg = false;
      dragDoll = false; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 240, -20),
        radius: 1500, radiusPortraitBase: 1750, radiusMaxPortrait: 2900,
        az: 0.2, po: 1.05,
      });
      build();
      rumble = S.rumbleLoop();
      rumble.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: 人形を渡らせる → よびだしボタン → (通過後) また渡る */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => doll.g, to: () => new THREE.Vector3(80, 140, -380),
          when: () => phase === 'idle' && crossedN === 0 && doll.g.position.z > 100,
          done: () => doll.g.position.z < -290 || crossedN > 0,
        },
        {
          kind: 'tap', at: () => callBtn,
          when: () => phase === 'idle' && (crossedN > 0 || doll.g.position.z < -290),
          done: () => phase !== 'idle',
        },
        {
          kind: 'tap', at: () => emgBtn,
          when: () => phase === 'pass' && !emgOn && trainV > 500,
          done: () => emgOn || phase === 'idle' || phase === 'leave',
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (rumble) rumble.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
