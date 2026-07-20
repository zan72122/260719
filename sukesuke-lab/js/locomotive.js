/* 蒸気機関車 — 写実3D (断面)
 *
 * 連鎖: 石炭をくべる → 火室の火力 → ボイラー圧力が上がる → 加減弁を開く →
 *       蒸気がシリンダーへ → ピストン → 主連棒 → 動輪が回る → 景色が流れる
 * 分岐: くべるリズム × 加減弁の開け方 × 圧力管理。
 *       急発進は空転、圧力の溜めすぎは安全弁が噴き、汽笛は蒸気を消費する。
 */
window.GAMES.locomotive = (() => {
  const WHEEL_R = 95;
  const WHEEL_X = [-170, 55, 280];

  let stage3, scene, raf, prev, time;
  let wheels, sideRod, mainRod, piston, gaugeNeedle, fireGlow, fireLight, waterMesh;
  let coalHit, leverG, leverHit, ropeHit, stackTop, safetyPos;
  let smoke, smokeState, dummy, scenery;
  let fire, pressure, regulator, speed, wheelAngle, slipT, whistleHold;
  let coalAnims, chuffPhase, clackT, ventSnd, fireSnd;
  let dragLever, orbitId, orbitFrom, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#a8c8e8', '#c4d8e8', '#d8d2b8');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x8a9a60, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -40;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(600, 2000, 1600), shadowSpan: 1300, intensity: 0.9 });

    /* 線路 */
    const railMat = new THREE.MeshStandardMaterial({ color: 0x777d84, metalness: 0.85, roughness: 0.35 });
    [-70, 70].forEach(z => {
      G3.add(scene, new THREE.BoxGeometry(8000, 16, 14), railMat, 0, -8, z);
    });
    scenery = [];
    for (let i = 0; i < 26; i++) {
      const s = G3.add(scene, new THREE.BoxGeometry(240, 22, 180),
        new THREE.MeshStandardMaterial({ color: 0x6a4e34, roughness: 0.9 }), -3900 + i * 310, -26, 0);
      scenery.push({ m: s, span: 8060 });
    }
    /* 木と電柱 (流れる景色) */
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Group();
      t.position.set(-3600 + i * 1050, -40, -700 - (i % 3) * 400);
      G3.add(t, new THREE.CylinderGeometry(18, 24, 220, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }), 0, 110, 0);
      G3.add(t, new THREE.ConeGeometry(140, 320, 10),
        new THREE.MeshStandardMaterial({ color: 0x3e6b34, roughness: 0.85 }), 0, 330, 0);
      scene.add(t);
      scenery.push({ m: t, span: 8400 });
    }
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group();
      p.position.set(-3400 + i * 1200, -40, 500);
      G3.add(p, new THREE.CylinderGeometry(10, 12, 460, 8), mats.darkPlastic, 0, 230, 0);
      G3.add(p, new THREE.BoxGeometry(160, 10, 10), mats.darkPlastic, 0, 420, 0);
      scene.add(p);
      scenery.push({ m: p, span: 8400 });
    }

    /* --- 機関車 (カメラ側が開いた断面) --- */
    const loco = new THREE.Group();
    scene.add(loco);
    const body = new THREE.MeshStandardMaterial({ color: 0x27313a, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });

    /* ボイラー外殻: 上半分+向こう半分だけ残す */
    const boilerGeo = new THREE.CylinderGeometry(115, 115, 520, 26, 1, true, 0, Math.PI * 1.25);
    boilerGeo.rotateZ(Math.PI / 2);          /* 軸をXへ (上半分が殻) */
    const boiler = new THREE.Mesh(boilerGeo, body);
    boiler.rotation.x = -0.85;               /* 開口をカメラ側の下へ */
    boiler.position.set(30, 280, 0);
    boiler.castShadow = true;
    loco.add(boiler);
    /* ボイラー内部: 水 (下) と煙管 */
    waterMesh = G3.add(loco, new THREE.BoxGeometry(500, 80, 90),
      new THREE.MeshStandardMaterial({ color: 0x2e5f83, roughness: 0.25 }), 30, 232, -10);
    for (let i = 0; i < 3; i++) {
      const fl = G3.add(loco, new THREE.CylinderGeometry(9, 9, 500, 8), mats.brass, 30, 300 + i * 28, 30 - i * 22);
      fl.rotation.z = Math.PI / 2;
    }
    /* 煙突と安全弁ドーム */
    G3.add(loco, new THREE.CylinderGeometry(30, 42, 110, 14), body, 250, 450, 0);
    stackTop = new THREE.Vector3(250, 510, 0);
    G3.add(loco, new THREE.SphereGeometry(46, 14, 10), body, 60, 400, 0);
    safetyPos = new THREE.Vector3(60, 440, 0);
    /* キャブ */
    G3.add(loco, new THREE.BoxGeometry(200, 260, 170), body, -400, 300, -40).castShadow = true;
    G3.add(loco, new THREE.BoxGeometry(230, 14, 220), body, -400, 445, 0);
    /* 火室 (キャブ内) */
    G3.add(loco, new THREE.BoxGeometry(120, 130, 120), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.8 }), -300, 210, 0);
    fireGlow = G3.add(loco, new THREE.BoxGeometry(100, 100, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5a1a }), -300, 205, 62);
    fireLight = new THREE.PointLight(0xff6a20, 0, 500);
    fireLight.position.set(-300, 230, 90);
    loco.add(fireLight);
    /* 石炭の山 (炭水車がわり) */
    const coalMat = new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      G3.add(loco, new THREE.SphereGeometry(U.rand(22, 34), 7, 5), coalMat,
        -560 + (i % 3) * 44, 170 + Math.floor(i / 3) * 34, (i % 2) * 40 - 20);
    }
    coalHit = new THREE.Mesh(new THREE.BoxGeometry(220, 220, 220), new THREE.MeshBasicMaterial({ visible: false }));
    coalHit.position.set(-560, 220, 0);
    loco.add(coalHit);

    /* 圧力計 */
    G3.add(loco, new THREE.CylinderGeometry(44, 44, 10, 20), mats.chrome, -302, 380, 62)
      .rotation.x = Math.PI / 2;
    gaugeNeedle = G3.add(loco, new THREE.BoxGeometry(4, 34, 4),
      new THREE.MeshBasicMaterial({ color: 0xd03030 }), -302, 380, 70);
    /* 加減弁レバー */
    leverG = new THREE.Group();
    leverG.position.set(-360, 360, 60);
    loco.add(leverG);
    G3.add(leverG, new THREE.CylinderGeometry(6, 6, 110, 8), mats.brass, 0, 55, 0);
    G3.add(leverG, new THREE.SphereGeometry(14, 10, 8), mats.brass, 0, 110, 0);
    leverHit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    leverHit.position.set(-360, 450, 60);
    loco.add(leverHit);
    /* 汽笛ひも */
    G3.add(loco, new THREE.CylinderGeometry(3, 3, 90, 6), mats.whitePlastic, -450, 420, 70);
    ropeHit = new THREE.Mesh(new THREE.SphereGeometry(60, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    ropeHit.position.set(-450, 400, 70);
    loco.add(ropeHit);

    /* 動輪と足回り */
    wheels = [];
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x8a2222, metalness: 0.3, roughness: 0.5 });
    WHEEL_X.forEach(x => {
      const w = new THREE.Group();
      w.position.set(x, WHEEL_R - 40, 95);
      loco.add(w);
      const disc = G3.add(w, new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 24, 24), wheelMat, 0, 0, 0);
      disc.rotation.x = Math.PI / 2;
      for (let s = 0; s < 8; s++) {
        const sp = G3.add(w, new THREE.BoxGeometry(10, WHEEL_R * 1.7, 8), mats.steel, 0, 0, 14);
        sp.rotation.z = s * Math.PI / 4;
      }
      G3.add(w, new THREE.CylinderGeometry(16, 16, 20, 10), mats.steel, 0, 0, 16).rotation.x = Math.PI / 2;
      /* クランクピン */
      const pin = G3.add(w, new THREE.CylinderGeometry(10, 10, 26, 8), mats.chrome, 0, -55, 24);
      pin.rotation.x = Math.PI / 2;
      wheels.push({ g: w, pin });
    });
    /* サイドロッド (動輪3つのピンを連結) と主連棒 */
    sideRod = G3.add(loco, new THREE.BoxGeometry(WHEEL_X[2] - WHEEL_X[0], 20, 12), mats.chrome, 0, 0, 130);
    mainRod = G3.add(loco, new THREE.BoxGeometry(220, 16, 10), mats.chrome, 0, 0, 132);
    /* シリンダー (断面) とピストン */
    G3.add(loco, new THREE.CylinderGeometry(46, 46, 150, 16, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({
      color: 0x27313a, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide,
    }), 445, 120, 95).rotation.z = Math.PI / 2;
    piston = G3.add(loco, new THREE.CylinderGeometry(40, 40, 26, 14), mats.steel, 445, 120, 95);
    piston.rotation.z = Math.PI / 2;

    /* 煙 */
    smoke = new THREE.InstancedMesh(new THREE.SphereGeometry(24, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }), 70);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = false;
    scene.add(smoke);
    smokeState = [];
    for (let i = 0; i < 70; i++) smokeState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, age: 0, life: 1, white: 1, s: 1 });
    dummy = new THREE.Object3D();
    coalAnims = [];

    window.__pts.coal = coalHit;
    window.__pts.lever = leverHit;
    window.__pts.rope = ropeHit;
  }

  function spawnPuff(p, white, vy, sc) {
    const s = smokeState.find(q => !q.on);
    if (!s) return;
    s.on = true;
    s.x = p.x; s.y = p.y; s.z = p.z;
    s.vx = U.rand(-30, 10) - speed * 0.55;
    s.vy = vy || U.rand(120, 220);
    s.age = 0;
    s.life = U.rand(1.1, 2);
    s.white = white;
    s.s = sc || 1;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (ray.intersectObject(coalHit, false).length) {
      /* 石炭ひとすくい */
      if (coalAnims.length < 3) {
        const m = G3.add(scene, new THREE.SphereGeometry(20, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.9 }), -560, 260, 40);
        coalAnims.push({ m, t: 0 });
        S.ratchet(0.8);
      }
      return;
    }
    if (dragLever === null && ray.intersectObject(leverHit, false).length) {
      dragLever = { id: e.pointerId, x0: e.clientX, v0: regulator };
      return;
    }
    if (ray.intersectObject(ropeHit, false).length) {
      whistleHold = 0.9;
      if (pressure > 0.15) {
        S.trainWhistle(0.9);
        pressure = Math.max(0, pressure - 0.07);
      } else {
        S.sputter();
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragLever && e.pointerId === dragLever.id) {
      const r = stage3.renderer.domElement.getBoundingClientRect();
      regulator = U.clamp(dragLever.v0 + (e.clientX - dragLever.x0) / r.width * 1.8, 0, 1);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.6, 0.7);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.5);
    }
  }

  function onUp(e) {
    if (dragLever && e.pointerId === dragLever.id) dragLever = null;
    else if (e.pointerId === orbitId) orbitId = null;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    /* 石炭が飛んで火室へ */
    for (let i = coalAnims.length - 1; i >= 0; i--) {
      const c = coalAnims[i];
      c.t += dt * 2.4;
      const t = Math.min(1, c.t);
      c.m.position.set(U.lerp(-560, -300, t), 260 + Math.sin(t * Math.PI) * 130 - t * 40, U.lerp(40, 60, t));
      if (c.t >= 1) {
        fire = Math.min(1, fire + 0.15);
        S.thunk();
        scene.remove(c.m);
        c.m.geometry.dispose();
        c.m.material.dispose();
        coalAnims.splice(i, 1);
      }
    }

    /* 火力と圧力 */
    fire = Math.max(0, fire - dt * 0.022);
    fireGlow.material.color.setHSL(0.05, 1, 0.14 + fire * 0.42);
    fireLight.intensity = fire * 1.4 + Math.sin(time * 9) * 0.12 * fire;
    fireSnd.set(fire * 0.35);
    const consume = regulator * 0.05 * (0.4 + speed / 600);
    pressure = U.clamp(pressure + fire * 0.075 * dt * (1.15 - pressure) - consume * dt, 0, 1);
    /* 安全弁 */
    if (pressure > 0.92) {
      ventSnd.set(0.7);
      pressure -= dt * 0.06;
      if (Math.random() < 0.5) spawnPuff(safetyPos, 1, U.rand(260, 380), 0.7);
    } else {
      ventSnd.set(0);
    }
    gaugeNeedle.rotation.z = -U.lerp(-2.1, 2.1, pressure);
    leverG.rotation.z = U.lerp(0.5, -0.5, regulator);

    /* 牽引力と空転 */
    const force = regulator * pressure * 30000;
    const adhesion = 12000;
    let slipping = false;
    if (force > adhesion && speed < 110) {
      slipping = true;
      slipT = 0.3;
      speed += (adhesion * 0.35 / 90) * dt;
    } else {
      speed += ((force - speed * 26 - 500) / 90) * dt;
    }
    speed = U.clamp(speed, 0, 640);
    if (slipT > 0) slipT -= dt;

    /* 動輪とロッド */
    const wheelSpeed = slipping ? speed + 420 : speed;
    wheelAngle += (wheelSpeed / WHEEL_R) * dt;
    const pinA = wheelAngle;
    wheels.forEach(w => { w.g.rotation.z = -pinA; });
    /* ピン位置 (全輪同位相) にサイドロッドを載せる */
    const px = Math.sin(pinA) * 55, py = -Math.cos(pinA) * 55;
    sideRod.position.set((WHEEL_X[0] + WHEEL_X[2]) / 2 + px, WHEEL_R - 40 + py, 130);
    /* 主連棒: 先頭ピン → クロスヘッド */
    const pinX = WHEEL_X[2] + px, pinY = WHEEL_R - 40 + py;
    const crossX = 445 + Math.sin(pinA) * 42;
    piston.position.x = crossX;
    const mx = (pinX + crossX + 90) / 2, my = (pinY + 120) / 2;
    mainRod.position.set(mx, my, 132);
    mainRod.rotation.z = Math.atan2(120 - pinY, crossX + 90 - pinX);
    mainRod.scale.x = Math.hypot(crossX + 90 - pinX, 120 - pinY) / 220;

    /* ドラフト音: 1回転4回 */
    const chuffNow = Math.floor(wheelAngle / (Math.PI / 2));
    if (chuffNow !== chuffPhase) {
      chuffPhase = chuffNow;
      if (regulator > 0.05 && wheelSpeed > 8) {
        S.chuff(U.clamp(regulator * pressure * (slipping ? 1.2 : 0.9), 0.1, 1));
        spawnPuff(stackTop, 1 - U.clamp(fire, 0, 0.8), U.rand(200, 320), 1 + regulator * 0.5);
      }
    }
    /* 常時の薄い煙 */
    if (fire > 0.1 && Math.random() < fire * 0.25) spawnPuff(stackTop, 0.4, U.rand(80, 150), 0.7);

    /* レールの継ぎ目音 */
    clackT -= speed * dt;
    if (clackT <= 0) {
      clackT = 900;
      if (speed > 30) S.ratchet(U.clamp(speed / 500, 0.2, 0.8));
    }

    /* 景色が流れる */
    for (const s of scenery) {
      s.m.position.x -= speed * dt;
      if (s.m.position.x < -s.span / 2) s.m.position.x += s.span;
    }

    /* 煙の更新 */
    let k = 0;
    for (const s of smokeState) {
      if (s.on) {
        s.age += dt;
        if (s.age >= s.life) s.on = false;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy *= Math.exp(-dt * 0.8);
      }
      dummy.position.set(s.x, s.on ? s.y : -9000, s.z);
      dummy.scale.setScalar(s.on ? Math.max(0.01, s.s * (0.5 + s.age) * (1 - s.age / s.life * 0.3)) : 0.001);
      dummy.updateMatrix();
      smoke.setMatrixAt(k, dummy.matrix);
      smoke.setColorAt(k, new THREE.Color().setScalar(0.25 + s.white * 0.75));
      k++;
    }
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;

    if (window.__dbgLC) window.__dbgLC({ fire: +fire.toFixed(2), p: +pressure.toFixed(2), reg: +regulator.toFixed(2), spd: speed | 0 });
    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      fire = 0.25; pressure = 0.3; regulator = 0; speed = 0;
      wheelAngle = 0; slipT = 0; chuffPhase = 0; clackT = 900;
      dragLever = null; orbitId = null; whistleHold = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-80, 250, 0),
        radius: 2000, radiusPortraitBase: 2000, radiusMaxPortrait: 3000,
        az: 0.05, po: 1.32,
      });
      build();
      ventSnd = S.wind();
      fireSnd = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 石炭をくべる → 圧力が上がったら加減弁 */
      GUIDE.start(stage3, [
        { kind: 'tap', at: () => coalHit, done: () => fire > 0.5 },
        {
          kind: 'drag', at: () => leverHit,
          to: () => {
            const v = new THREE.Vector3();
            leverHit.getWorldPosition(v);
            v.x += 160;
            return v;
          },
          when: () => pressure > 0.45, done: () => regulator > 0.25,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (ventSnd) ventSnd.stop();
      if (fireSnd) fireSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
