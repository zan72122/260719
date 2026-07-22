/* ポップコーンマシン — 写実3D (断面)
 *
 * 遊園地や映画館のガラスケースの中の機械。さわらせてはもらえない。
 * 連鎖: スコップで豆を釜に入れる → ヒーターのつまみ → 釜が熱くなる →
 *       豆がゆれはじめる → 一粒ずつポン！ポン！とはじけて白いコーンに →
 *       釜からあふれてケースにたまる → 取っ手をタップで釜をかたむけて全部出す →
 *       紙袋をタップですくう
 * 分岐: 豆の量 × 火加減 (強すぎると焦げて煙) × いつ釜をあけるか × バター。
 *       ケースのコーンはバッチをまたいで積もり続ける。
 */
window.GAMES.popcorn = (() => {
  const KETTLE = new THREE.Vector3(0, 470, 0);
  const MAX_KERNEL = 70;
  const MAX_CORN = 240;
  const CASE_FLOOR = 180;

  let stage3, scene, raf, prev, time;
  let caseG, kettleG, stirrer, heatGlow, scoopG, bagG, butterG, knobG;
  let kernels, kernelData, corns, cornData, cornCount, dummy;
  let heat, kettleTip, scooping, dragMode, dragId, orbitId, orbitFrom;
  let bagFill, bagMesh, smokes, smokeState, burntNote;
  let whirr, mats;

  const hash = (i, k) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d8c8e0', '#e8dce8', '#a898b8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x9a8a74, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(800, 1800, 1300), shadowSpan: 1100, intensity: 0.95 });

    /* --- 屋台ワゴン --- */
    const cartM = new THREE.MeshPhysicalMaterial({ color: 0xb03040, roughness: 0.35, clearcoat: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(760, 320, 480), cartM, 0, 160 - 140, 0).castShadow = true;
    [[-300, -180], [300, -180], [-300, 180], [300, 180]].forEach(([x, z]) => {
      const w = G3.add(scene, new THREE.CylinderGeometry(60, 60, 24, 16), mats.darkPlastic, x, -80, z);
      w.rotation.x = Math.PI / 2;
    });
    /* 屋根 (しましま) */
    for (let i = 0; i < 6; i++) {
      G3.add(scene, new THREE.BoxGeometry(130, 14, 520),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e0d4 : 0xc84050, roughness: 0.6 }),
        -325 + i * 130, 920, 0);
    }
    [[-370, -230], [370, -230], [-370, 230], [370, 230]].forEach(([x, z]) => {
      G3.add(scene, new THREE.CylinderGeometry(9, 9, 740, 8), mats.brass, x, 550, z);
    });

    /* --- ガラスケース (手前は断面であいている) --- */
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xe8f0f4, roughness: 0.03, transmission: 0.9, thickness: 8, transparent: true, opacity: 0.35,
    });
    G3.add(scene, new THREE.BoxGeometry(700, 560, 10), glassM, 0, 460, -220);
    G3.add(scene, new THREE.BoxGeometry(10, 560, 430), glassM, -350, 460, 0);
    G3.add(scene, new THREE.BoxGeometry(10, 560, 430), glassM, 350, 460, 0);
    G3.add(scene, new THREE.BoxGeometry(700, 20, 440),
      new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 }), 0, CASE_FLOOR - 10, 0);

    /* --- 釜 (かたむけられる) --- */
    kettleG = new THREE.Group();
    kettleG.position.copy(KETTLE);
    scene.add(kettleG);
    const potM = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.9, roughness: 0.35 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(150, 120, 150, 22, 1, true), potM);
    pot.castShadow = true;
    kettleG.add(pot);
    G3.add(kettleG, new THREE.CylinderGeometry(120, 120, 10, 22), potM, 0, -72, 0);
    /* かきまぜ棒 */
    stirrer = new THREE.Group();
    stirrer.position.y = 40;
    kettleG.add(stirrer);
    G3.add(stirrer, new THREE.CylinderGeometry(7, 7, 130, 8), mats.steel, 0, 0, 0);
    G3.add(stirrer, new THREE.BoxGeometry(200, 10, 14), mats.steel, 0, -55, 0);
    /* 取っ手 (タップで傾ける) */
    const handle = G3.add(kettleG, new THREE.CylinderGeometry(10, 10, 120, 8), mats.brass, 175, 20, 0);
    handle.rotation.z = 0.4;
    window.__pts.kettle = kettleG;
    /* 吊り具 */
    [[-1], [1]].forEach(([s]) => {
      G3.add(scene, new THREE.CylinderGeometry(7, 7, 240, 8), mats.chrome, s * 150, 640, 0).rotation.z = s * 0.25;
    });
    /* ヒーター */
    heatGlow = new THREE.Mesh(new THREE.CylinderGeometry(110, 110, 16, 20),
      new THREE.MeshBasicMaterial({ color: 0x331808 }));
    heatGlow.position.set(0, 380, 0);
    scene.add(heatGlow);

    /* --- 豆スコップとトレイ --- */
    G3.add(scene, new THREE.BoxGeometry(220, 60, 160),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), -520, 350, 260).castShadow = true;
    const seedM = new THREE.MeshStandardMaterial({ color: 0xd8a838, roughness: 0.5 });
    for (let i = 0; i < 24; i++) {
      G3.add(scene, new THREE.SphereGeometry(11, 8, 6), seedM,
        -520 + (hash(i, 1) - 0.5) * 170, 388 + hash(i, 2) * 16, 260 + (hash(i, 3) - 0.5) * 110);
    }
    scoopG = new THREE.Group();
    scoopG.position.set(-520, 430, 260);
    scene.add(scoopG);
    const sc = G3.add(scoopG, new THREE.CylinderGeometry(46, 40, 60, 14, 1, true), mats.steel, 0, 0, 0);
    sc.castShadow = true;
    G3.add(scoopG, new THREE.CylinderGeometry(40, 40, 8, 14), mats.steel, 0, -28, 0);
    G3.add(scoopG, new THREE.CylinderGeometry(6, 6, 90, 8), mats.brass, 60, 30, 0).rotation.z = -0.7;
    scoopG.userData.home = scoopG.position.clone();
    window.__pts.scoop = scoopG;

    /* --- バター --- */
    butterG = G3.add(scene, new THREE.BoxGeometry(70, 44, 70),
      new THREE.MeshStandardMaterial({ color: 0xf0d060, roughness: 0.35 }), -520, 372, 60);
    butterG.castShadow = true;
    window.__pts.butter = butterG;

    /* --- 火加減つまみ --- */
    knobG = new THREE.Group();
    knobG.position.set(430, 240, 260);
    scene.add(knobG);
    const kb = G3.add(knobG, new THREE.CylinderGeometry(44, 48, 26, 18), mats.darkPlastic, 0, 0, 0);
    kb.rotation.x = Math.PI / 2;
    kb.castShadow = true;
    G3.add(knobG, new THREE.BoxGeometry(10, 40, 30), mats.whitePlastic, 0, 0, 4);
    window.__pts.knob = knobG;

    /* --- 紙袋 --- */
    bagG = new THREE.Group();
    bagG.position.set(530, 180, 300);
    scene.add(bagG);
    bagMesh = G3.add(bagG, new THREE.CylinderGeometry(60, 46, 150, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 }));
    bagMesh.rotation.y = Math.PI / 4;
    bagMesh.position.y = 75;
    bagMesh.castShadow = true;
    G3.add(bagG, new THREE.BoxGeometry(60, 30, 4),
      new THREE.MeshStandardMaterial({ color: 0xc84050, roughness: 0.6 }), 0, 90, 42);
    bagFill = G3.add(bagG, new THREE.SphereGeometry(48, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf6efd8, roughness: 0.8 }));
    bagFill.position.y = 150;
    bagFill.scale.set(1, 0.01, 1);
    window.__pts.bag = bagG;

    /* --- 豆とコーンのインスタンス --- */
    kernels = new THREE.InstancedMesh(new THREE.SphereGeometry(10, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8a838, roughness: 0.5 }), MAX_KERNEL);
    kernels.frustumCulled = false;
    scene.add(kernels);
    kernelData = [];

    corns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(20, 1),
      new THREE.MeshStandardMaterial({ color: 0xf6efd8, roughness: 0.85 }), MAX_CORN);
    corns.frustumCulled = false;
    corns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(corns);
    cornData = [];
    cornCount = 0;

    /* けむり */
    smokes = new THREE.InstancedMesh(new THREE.SphereGeometry(20, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x555, transparent: true, opacity: 0.35, roughness: 1 }), 30);
    smokes.frustumCulled = false;
    scene.add(smokes);
    smokeState = [];
    for (let i = 0; i < 30; i++) smokeState.push({ on: false, x: 0, y: 0, z: 0, age: 0 });

    dummy = new THREE.Object3D();
  }

  function addKernel() {
    if (kernelData.length >= MAX_KERNEL) return;
    kernelData.push({
      lx: (hash(kernelData.length, 7) - 0.5) * 200,
      lz: (hash(kernelData.length, 8) - 0.5) * 200,
      e: 0, popped: false,
    });
  }

  function popKernel(kd, i) {
    kd.popped = true;
    S.pop(hash(i, 9));
    if (cornCount >= MAX_CORN) return;
    const world = new THREE.Vector3(kd.lx * 0.6, 20, kd.lz * 0.6);
    kettleG.localToWorld(world);
    cornData.push({
      x: world.x, y: world.y, z: world.z,
      vx: (hash(i, 10) - 0.5) * 500, vy: 300 + hash(i, 11) * 380, vz: (hash(i, 12) - 0.5) * 400,
      settled: false, burnt: 0, r: 0.8 + hash(i, 13) * 0.5,
      spin: hash(i, 14) * 6,
    });
    cornCount++;
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
    if (near(scoopG, 110)) {
      dragMode = 'scoop';
      dragId = e.pointerId;
      return;
    }
    if (near(knobG, 90)) {
      dragMode = 'knob';
      dragId = e.pointerId;
      knobG.userData.drag = { y0: e.clientY, v0: heat };
      return;
    }
    if (near(kettleG, 190)) {
      /* 釜をかたむけて全部あける */
      kettleTip = 1.2;
      S.thunk();
      return;
    }
    if (near(butterG, 90)) {
      /* バターをひとかけ釜へ */
      S.glug();
      butterG.scale.multiplyScalar(0.9);
      corns.material.color.lerp(new THREE.Color(0xf2e0a0), 0.35);
      return;
    }
    if (near(bagG, 130, 80)) {
      /* 袋にすくう: ケースにたまったコーンを移す */
      const avail = cornData.filter(c => c.settled).length;
      if (avail > 4) {
        let moved = 0;
        for (let i = cornData.length - 1; i >= 0 && moved < 30; i--) {
          if (cornData[i].settled) { cornData.splice(i, 1); moved++; }
        }
        cornCount = cornData.length;
        bagG.userData.fill = Math.min(1, (bagG.userData.fill || 0) + moved / 60);
        S.squishReal(0.7);
        S.plip(1.8);
      } else {
        S.buzz();
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'scoop') {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (520 - o.y) / d.y;
        if (t > 0) {
          scoopG.position.set(o.x + d.x * t, 520, U.clamp(o.z + d.z * t, -100, 400));
          /* 釜の上ならかたむけて豆を流しこむ */
          const over = Math.hypot(scoopG.position.x - KETTLE.x, scoopG.position.z - KETTLE.z) < 170;
          scoopG.rotation.z = over ? 1.1 : 0;
          if (over) {
            scooping += 1;
            if (scooping % 4 === 0 && kernelData.filter(k => !k.popped).length < MAX_KERNEL) {
              addKernel();
              S.plip(0.7 + Math.random() * 0.3);
            }
          }
        }
      } else if (dragMode === 'knob' && knobG.userData.drag) {
        const dr = knobG.userData.drag;
        heat = U.clamp(dr.v0 + (dr.y0 - e.clientY) / 260, 0, 1);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.6, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'scoop') {
        scoopG.position.copy(scoopG.userData.home);
        scoopG.rotation.z = 0;
      }
      dragMode = null;
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

    /* 釜のかたむき: タップから1.2秒かけて かたむいて→もどる */
    kettleTip = Math.max(0, kettleTip - dt * 0.5);
    kettleG.rotation.z = kettleTip > 0 ? Math.sin((1.2 - kettleTip) / 1.2 * Math.PI) * 1.15 : 0;

    /* ヒーターとかきまぜ */
    const hc = new THREE.Color().setHSL(0.05, 0.9, 0.08 + heat * 0.38);
    heatGlow.material.color.copy(hc);
    stirrer.rotation.y += heat * dt * 5;
    if (whirr) whirr.set(heat * 0.4);

    /* 豆: 加熱でエネルギーがたまり、順にはじける */
    const live = kernelData.filter(k => !k.popped);
    live.forEach((kd) => {
      const i = kernelData.indexOf(kd);
      kd.e += heat * dt * (0.55 + hash(i, 4) * 0.5);
      if (kd.e > 2.2) popKernel(kd, i);
    });
    /* 豆の描画 (熱いほどゆれる) */
    let ki = 0;
    kernelData.forEach((kd, i) => {
      if (kd.popped) return;
      const jig = heat * 8;
      dummy.position.set(
        kd.lx * 0.6 + Math.sin(time * 21 + i * 3) * jig,
        -55 + Math.abs(Math.sin(time * 25 + i * 5)) * jig * 1.6,
        kd.lz * 0.6 + Math.cos(time * 19 + i * 7) * jig);
      dummy.position.applyMatrix4(kettleG.matrixWorld);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      kernels.setMatrixAt(ki++, dummy.matrix);
    });
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = ki; i < MAX_KERNEL; i++) kernels.setMatrixAt(i, dummy.matrix);
    kernels.instanceMatrix.needsUpdate = true;

    /* コーンの物理 */
    cornData.forEach((c, i) => {
      if (!c.settled) {
        c.vy -= 1300 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        /* ガラスではね返る */
        if (c.x < -330 || c.x > 330) { c.vx *= -0.5; c.x = U.clamp(c.x, -330, 330); }
        if (c.z < -200 || c.z > 205) { c.vz *= -0.5; c.z = U.clamp(c.z, -200, 205); }
        /* 釜の中にもどる (低ければ) か、ケースの床に着地 */
        const pileH = CASE_FLOOR + 14 + Math.min(140, cornCount * 0.55) * hash(i, 15);
        if (c.y < pileH && c.vy < 0) {
          c.y = pileH;
          c.settled = true;
        }
      } else if (heat > 0.85 && Math.hypot(c.x - KETTLE.x, c.z - KETTLE.z) < 170 && c.y > 380) {
        /* 釜のそばの熱で焦げる */
        c.burnt = Math.min(1, c.burnt + dt * 0.1);
      }
      if (kettleTip > 0 && !c.settled) c.vy -= 100 * dt;
    });
    /* 焦げ煙 */
    const burntTotal = cornData.reduce((a, c) => a + c.burnt, 0);
    if (burntTotal > 2 && Math.random() < heat * 0.2) {
      const s = smokeState.find(s2 => !s2.on);
      if (s) {
        s.on = true;
        s.x = KETTLE.x + (Math.random() - 0.5) * 120;
        s.y = 520;
        s.z = (Math.random() - 0.5) * 120;
        s.age = 0;
      }
      if (!burntNote) { burntNote = true; S.buzz(); }
    }
    smokeState.forEach((s, i) => {
      if (s.on) {
        s.age += dt;
        s.y += dt * 130;
        if (s.age > 2.4) s.on = false;
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(s.on ? 0.6 + s.age * 0.7 : 0.0001);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      smokes.setMatrixAt(i, dummy.matrix);
    });
    smokes.instanceMatrix.needsUpdate = true;

    /* コーンの描画 */
    cornData.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.setScalar(c.r);
      dummy.rotation.set(c.spin, c.spin * 1.7, 0);
      dummy.updateMatrix();
      corns.setMatrixAt(i, dummy.matrix);
      corns.setColorAt(i, new THREE.Color().lerpColors(
        new THREE.Color(0xf6efd8), new THREE.Color(0x4a3520), c.burnt));
    });
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = cornData.length; i < MAX_CORN; i++) corns.setMatrixAt(i, dummy.matrix);
    corns.instanceMatrix.needsUpdate = true;
    if (corns.instanceColor) corns.instanceColor.needsUpdate = true;

    /* 袋のふくらみ */
    bagFill.scale.set(1, Math.max(0.01, (bagG.userData.fill || 0)), 1);

    /* つまみの見た目 */
    knobG.rotation.z = -heat * 2.4;

    if (window.__dbgPC) window.__dbgPC({
      heat: +heat.toFixed(2), kernels: kernelData.filter(k => !k.popped).length,
      corns: cornCount, settled: cornData.filter(c => c.settled).length,
      bag: +(bagG.userData.fill || 0).toFixed(2),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      heat = 0; kettleTip = 0; scooping = 0; burntNote = false;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 400, 0),
        radius: 1700, radiusPortraitBase: 2100, radiusMaxPortrait: 3300,
        az: 0.25, po: 1.15,
      });
      build();
      whirr = S.whirrLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 豆を入れる → 火をつける → 袋にすくう */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => scoopG, to: () => kettleG,
          done: () => kernelData.length > 6,
        },
        {
          kind: 'drag', at: () => knobG,
          to: () => {
            const v = new THREE.Vector3();
            knobG.getWorldPosition(v);
            v.y += 140;
            return v;
          },
          when: () => kernelData.length > 0, done: () => heat > 0.4,
        },
        {
          kind: 'tap', at: () => bagG,
          when: () => cornData.filter(c => c.settled).length > 10,
          done: () => (bagG.userData.fill || 0) > 0.1,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (whirr) whirr.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
