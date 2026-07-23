/* ドラム式せんたくき — 写実3D (断面)
 *
 * おうちで毎日回っているのに、中のからくりは見えない。
 * 右側面を断面にして、外槽・ドラム・モーターとベルト・給水弁・排水ポンプを見せる。
 * 連鎖: 服を入れる → 洗剤を注ぐ → スタート → ドアがロック → 給水弁が開いて
 *       水位が上がる → ドラムがごろんごろん回って泡が育つ → 汚れが水に溶けて
 *       水がにごる → 排水 → 高速脱水 (服が壁にはりつく) → ロック解除 → 取り出す
 * 分岐: 洗剤の量 (少なすぎ=落ちない/多すぎ=泡あふれ) × 服の枚数 ×
 *       途中でとめる。服の汚れはサイクルをまたいで記憶される。
 */
window.GAMES.washer = (() => {
  const DRUM = new THREE.Vector3(0, 330, 0);

  let stage3, scene, raf, prev, time;
  let bodyG, drumG, doorG, waterMesh, foamMesh, motorW, beltMesh, drawerG, gaugeFill;
  let clothes, detergent, phase, phaseT, drumA, drumSpeed, waterLv, dirtInWater;
  let bottleG, pouring, dragObj, dragId, orbitId, orbitFrom;
  let startBtn, lockLamp, overflowBlobs;
  let slosh, whirr, mats;

  const CLOTH_COLS = [0xd85a4a, 0x4a86d8, 0x50b060];

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d8e0e4', '#e8ecee', '#aab4bc');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1200), shadowSpan: 1000, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 40),
      new THREE.MeshStandardMaterial({ color: 0xe4e0d4, roughness: 0.7 }), 0, 700, -420);

    /* --- 本体 (右側面は断面であいている) --- */
    bodyG = new THREE.Group();
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xeceae4, roughness: 0.25, clearcoat: 0.6 });
    G3.add(bodyG, new THREE.BoxGeometry(560, 30, 480), shellM, 0, 705, 0).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(560, 700, 30), shellM, 0, 350, -230);
    G3.add(bodyG, new THREE.BoxGeometry(30, 700, 480), shellM, -280, 350, 0).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(560, 40, 480), shellM, 0, 20, 0);
    /* 前面パネル (ドア穴つき) */
    const fp = new THREE.Shape();
    fp.moveTo(-280, 0); fp.lineTo(280, 0); fp.lineTo(280, 690); fp.lineTo(-280, 690);
    fp.closePath();
    const holeP = new THREE.Path();
    holeP.absarc(0, 330, 180, 0, Math.PI * 2, true);
    fp.holes.push(holeP);
    const front = new THREE.Mesh(new THREE.ExtrudeGeometry(fp, { depth: 24, bevelEnabled: false }), shellM);
    front.position.set(0, 0, 216);
    front.castShadow = true;
    bodyG.add(front);

    /* --- 外槽 (断面: 右半分カット) と水 --- */
    const tubM = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(210, 210, 300, 28, 1, true, Math.PI * 0.5, Math.PI * 1.5), tubM);
    tub.rotation.x = Math.PI / 2;
    tub.position.copy(DRUM);
    scene.add(tub);
    waterMesh = G3.add(scene, new THREE.CylinderGeometry(200, 200, 280, 24),
      new THREE.MeshStandardMaterial({ color: 0x9ec8e0, transparent: true, opacity: 0.55, roughness: 0.2 }),
      DRUM.x, DRUM.y, DRUM.z);
    waterMesh.rotation.x = Math.PI / 2;
    waterMesh.scale.set(1, 1, 0.01);
    waterMesh.position.y = DRUM.y - 190;

    /* --- ドラム (穴あき) --- */
    drumG = new THREE.Group();
    drumG.position.copy(DRUM);
    scene.add(drumG);
    const drumM = new THREE.MeshStandardMaterial({ color: 0xc8ced4, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(175, 175, 260, 24, 1, true), drumM);
    drum.rotation.x = Math.PI / 2;
    drumG.add(drum);
    const back = new THREE.Mesh(new THREE.CircleGeometry(175, 24), drumM);
    back.position.z = -130;
    drumG.add(back);
    /* リフター3枚 (服を持ち上げる羽根) */
    for (let i = 0; i < 3; i++) {
      const lift = G3.add(drumG, new THREE.BoxGeometry(30, 40, 240),
        new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.7, roughness: 0.4 }), 0, 0, 0);
      const a = i / 3 * Math.PI * 2;
      lift.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 0);
      lift.rotation.z = a;
    }
    /* 泡 */
    foamMesh = G3.add(scene, new THREE.SphereGeometry(150, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.9 }),
      DRUM.x, DRUM.y - 90, DRUM.z);
    foamMesh.scale.setScalar(0.01);

    /* --- ドア (ガラスのふくらみ・あけしめ) --- */
    doorG = new THREE.Group();
    doorG.position.set(-180, 330, 240);
    scene.add(doorG);
    const ring = G3.add(doorG, new THREE.TorusGeometry(170, 22, 12, 28), mats.chrome, 180, 0, 0);
    ring.castShadow = true;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(170, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshPhysicalMaterial({
        color: 0xd8e8f0, roughness: 0.04, transmission: 0.85, thickness: 14, transparent: true, opacity: 0.5,
      }));
    glass.rotation.x = Math.PI / 2;
    glass.position.set(180, 0, 20);
    doorG.add(glass);
    doorG.rotation.y = -1.7;   /* 最初はあいている */
    window.__pts.door = doorG;
    lockLamp = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x3a4038 }));
    lockLamp.position.set(-150, 620, 232);
    scene.add(lockLamp);

    /* --- 機械 (断面側) --- */
    motorW = G3.add(scene, new THREE.CylinderGeometry(56, 56, 90, 16), mats.steel, 150, 110, -60);
    motorW.rotation.x = Math.PI / 2;
    motorW.castShadow = true;
    beltMesh = G3.add(scene, new THREE.TorusGeometry(120, 8, 6, 24),
      new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.8 }), 150, 220, -70);
    beltMesh.scale.set(0.5, 1, 1);
    /* 給水弁とホース */
    G3.add(scene, new THREE.BoxGeometry(60, 40, 40), mats.brass, 180, 660, -120);
    G3.add(scene, new THREE.CylinderGeometry(10, 10, 140, 8), mats.chrome, 180, 580, -120);
    /* 排水ポンプ */
    G3.add(scene, new THREE.CylinderGeometry(36, 36, 60, 12), mats.steel, -80, 70, 120).rotation.z = Math.PI / 2;
    G3.add(scene, new THREE.CylinderGeometry(12, 12, 160, 8),
      new THREE.MeshStandardMaterial({ color: 0x777, roughness: 0.6 }), -170, 70, 140).rotation.z = 1.2;

    /* --- 洗剤引き出しとボトル --- */
    drawerG = new THREE.Group();
    drawerG.position.set(-170, 640, 230);
    scene.add(drawerG);
    G3.add(drawerG, new THREE.BoxGeometry(140, 50, 60),
      new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.4 }), 0, 0, 0);
    gaugeFill = G3.add(drawerG, new THREE.BoxGeometry(120, 30, 40),
      new THREE.MeshStandardMaterial({ color: 0x50c0e8, roughness: 0.3 }), 0, 0, 4);
    gaugeFill.scale.x = 0.01;
    window.__pts.drawer = drawerG;
    bottleG = new THREE.Group();
    bottleG.position.set(-340, 90, 310);
    scene.add(bottleG);
    G3.add(bottleG, new THREE.CylinderGeometry(44, 50, 150, 10),
      new THREE.MeshPhysicalMaterial({ color: 0x50c0e8, roughness: 0.3, clearcoat: 0.5 }), 0, 75, 0).castShadow = true;
    G3.add(bottleG, new THREE.CylinderGeometry(18, 18, 40, 8), mats.whitePlastic, 0, 170, 0);
    bottleG.userData.home = bottleG.position.clone();
    window.__pts.bottle = bottleG;

    /* --- スタートボタン --- */
    startBtn = G3.add(scene, new THREE.CylinderGeometry(36, 40, 20, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.35, clearcoat: 0.5 }), 120, 640, 232);
    startBtn.rotation.x = Math.PI / 2;
    window.__pts.startBtn = startBtn;

    /* --- かご + 服 --- */
    G3.add(scene, new THREE.CylinderGeometry(150, 120, 110, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.8, side: THREE.DoubleSide }), 470, 55, 220);
    clothes = [];
    CLOTH_COLS.forEach((c, i) => {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
      const body = G3.add(g, new THREE.CapsuleGeometry(38, 60, 6, 10), m, 0, 0, 0);
      body.rotation.z = Math.PI / 2;
      body.scale.set(1, 0.6, 1);
      body.castShadow = true;
      g.position.set(430 + (i % 2) * 70, 130 + i * 40, 200 + (i % 2) * 40);
      scene.add(g);
      clothes.push({ g, m, dirt: 0.85, in: false, baseCol: new THREE.Color(c) });
      window.__pts['cloth' + i] = g;
    });

    overflowBlobs = [];
  }

  function clothColor(c) {
    /* 汚れ = 黒ずみ */
    c.m.color.lerpColors(c.baseCol, new THREE.Color(0x4a4438), c.dirt * 0.75);
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
    if (phase === 'idle' || phase === 'done') {
      for (const c of clothes) {
        if (near(c.g, 100)) {
          dragObj = c;
          dragId = e.pointerId;
          c.in = false;
          S.plip(1.2);
          return;
        }
      }
      if (near(bottleG, 120, 80)) {
        dragObj = 'bottle';
        dragId = e.pointerId;
        return;
      }
      if (near(startBtn, 70)) {
        if (clothes.some(c => c.in)) {
          startCycle();
        } else {
          S.buzz();
        }
        return;
      }
    } else if (near(startBtn, 70)) {
      /* 動作中にもう一度おすと途中でやめて排水へ */
      if (phase === 'fill' || phase === 'wash') {
        phase = 'drain';
        phaseT = 0;
        S.clickReal(1);
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function startCycle() {
    phase = 'fill';
    phaseT = 0;
    dirtInWater = 0;
    S.clickReal(1);
    S.thunk();   /* ドアロック */
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (dragObj === 'bottle') {
        const t = (620 - o.y) / d.y;
        if (t > 0) {
          bottleG.position.set(o.x + d.x * t, 620 - 80, Math.max(180, o.z + d.z * t));
          /* 引き出しの上でかたむけて注ぐ */
          const over = Math.hypot(bottleG.position.x + 170, bottleG.position.z - 230) < 150;
          bottleG.rotation.z = over ? 1.2 : 0;
          pouring = over;
        }
      } else {
        const t = (330 - o.y) / d.y;
        if (t > 0) {
          dragObj.g.position.set(o.x + d.x * t, 330, Math.max(60, o.z + d.z * t));
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.55, 0.75);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragObj && dragObj !== 'bottle') {
        /* ドラムの中に入れたか */
        const p = dragObj.g.position;
        if (Math.hypot(p.x - DRUM.x, p.y - DRUM.y) < 200 && p.z < 220) {
          dragObj.in = true;
          dragObj.g.position.set(DRUM.x + (Math.random() - 0.5) * 100, DRUM.y - 90, (Math.random() - 0.5) * 80);
          S.squishReal(0.5);
        } else {
          dragObj.g.position.set(430 + Math.random() * 80, 140, 200 + Math.random() * 60);
        }
      }
      if (dragObj === 'bottle') {
        bottleG.position.copy(bottleG.userData.home);
        bottleG.rotation.z = 0;
        pouring = false;
      }
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
    phaseT += dt;

    /* 洗剤そそぎ (かたむけているあいだ時間で増える) */
    if (pouring && dragObj === 'bottle' && phase !== 'wash') {
      detergent = Math.min(1.2, detergent + dt * 0.28);
      gaugeFill.scale.x = Math.min(1, detergent);
      if (Math.random() < dt * 6) S.drip();
      if (detergent > 1 && Math.random() < dt * 4) S.buzz();
    }

    const locked = phase !== 'idle' && phase !== 'done';
    lockLamp.material.color.set(locked ? 0xd83030 : 0x3a4038);
    /* ドアのあけしめ */
    const doorTarget = locked ? 0 : -1.7;
    doorG.rotation.y += (doorTarget - doorG.rotation.y) * Math.min(1, dt * 4);

    /* フェーズ進行 */
    if (phase === 'fill') {
      waterLv = Math.min(0.45, waterLv + dt * 0.09);
      if (slosh) slosh.set(0.5);
      if (waterLv >= 0.45) { phase = 'wash'; phaseT = 0; }
    } else if (phase === 'wash') {
      drumSpeed += ((Math.floor(phaseT / 2.2) % 2 ? -2.2 : 2.2) - drumSpeed) * Math.min(1, dt * 2);
      /* 汚れ落ち: 洗剤の量がものをいう */
      const power = U.clamp(detergent, 0.05, 1) * 0.055;
      clothes.forEach(c => {
        if (!c.in) return;
        const rm = Math.min(c.dirt, power * dt);
        c.dirt -= rm;
        dirtInWater += rm;
      });
      if (slosh) slosh.set(0.8);
      /* 泡あふれ */
      if (detergent > 1 && overflowBlobs.length < 12 && Math.random() < 0.06) {
        const b = G3.add(scene, new THREE.SphereGeometry(26, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
          -150 + Math.random() * 60, 620, 250);
        b.userData.vy = 0;
        overflowBlobs.push(b);
      }
      if (phaseT > 9) { phase = 'drain'; phaseT = 0; }
    } else if (phase === 'drain') {
      waterLv = Math.max(0, waterLv - dt * 0.16);
      drumSpeed += (0 - drumSpeed) * Math.min(1, dt * 2);
      if (slosh) slosh.set(0.3);
      if (waterLv <= 0) { phase = 'spin'; phaseT = 0; S.clickReal(0.7); }
    } else if (phase === 'spin') {
      drumSpeed += (16 - drumSpeed) * Math.min(1, dt * 0.8);
      if (whirr) whirr.set(Math.min(1, drumSpeed / 16));
      if (slosh) slosh.set(0);
      if (phaseT > 5) { phase = 'done'; phaseT = 0; drumSpeed = 0; S.ding(); }
    } else {
      drumSpeed += (0 - drumSpeed) * Math.min(1, dt * 2);
      if (whirr) whirr.set(0);
      if (slosh) slosh.set(0);
    }

    drumA += drumSpeed * dt;
    drumG.rotation.z = drumA;
    motorW.rotation.z = drumA * 3;

    /* 水と泡 */
    waterMesh.scale.z = Math.max(0.01, waterLv);
    waterMesh.position.y = DRUM.y - 190 + waterLv * 190;
    waterMesh.material.color.lerpColors(new THREE.Color(0x9ec8e0), new THREE.Color(0x6a6a58),
      Math.min(1, dirtInWater * 1.4));
    const foam = Math.min(1, detergent * waterLv * 4);
    foamMesh.scale.setScalar(Math.max(0.01, foam));
    overflowBlobs.forEach(b => {
      b.userData.vy -= 800 * dt;
      b.position.y += b.userData.vy * dt;
      if (b.position.y < 20) { b.position.y = 20; b.userData.vy = 0; }
    });

    /* 服の動き */
    clothes.forEach((c, i) => {
      clothColor(c);
      if (!c.in || dragObj === c) return;
      if (phase === 'wash' || phase === 'fill') {
        /* ドラムに持ち上げられて落ちる */
        const a = drumA * 0.9 + i * 2.1;
        const r = 60 + 60 * Math.abs(Math.sin(a * 0.7));
        c.g.position.set(DRUM.x + Math.cos(a) * r, DRUM.y + Math.sin(a) * r * 0.8 - 40, (i - 1) * 60);
        c.g.rotation.z = a;
      } else if (phase === 'spin') {
        /* 遠心力で壁にはりつく */
        const a = drumA + i * 2.1;
        c.g.position.set(DRUM.x + Math.cos(a) * 130, DRUM.y + Math.sin(a) * 130, (i - 1) * 60);
        c.g.rotation.z = a + Math.PI / 2;
      } else if (phase === 'done') {
        c.g.position.set(DRUM.x + (i - 1) * 60, DRUM.y - 110, 30);
        c.g.rotation.z = 0;
      }
    });

    if (window.__dbgWS) window.__dbgWS({
      phase, t: +phaseT.toFixed(1), det: +detergent.toFixed(2),
      water: +waterLv.toFixed(2),
      dirt: clothes.map(c => +c.dirt.toFixed(2)),
      loaded: clothes.filter(c => c.in).length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      phase = 'idle'; phaseT = 0; drumA = 0; drumSpeed = 0; pouring = false;
      waterLv = 0; detergent = 0; dirtInWater = 0;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(30, 360, 0),
        radius: 1350, radiusPortraitBase: 1700, radiusMaxPortrait: 2700,
        az: 0.35, po: 1.15,
      });
      build();
      slosh = S.sloshLoop();
      whirr = S.whirrLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 服を入れる → 洗剤 → スタート → おわったら取り出す */
      let gdOut = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.cloth0, to: () => drumG,
          when: () => phase === 'idle', done: () => clothes.some(c => c.in),
        },
        {
          kind: 'drag', at: () => bottleG, to: () => drawerG,
          when: () => phase === 'idle' && clothes.some(c => c.in), done: () => detergent > 0.25,
        },
        {
          kind: 'tap', at: () => startBtn,
          when: () => phase === 'idle' && clothes.some(c => c.in), done: () => phase !== 'idle',
        },
        {
          kind: 'drag', at: () => {
            const c = clothes.find(cc => cc.in);
            return c ? c.g : null;
          },
          to: () => new THREE.Vector3(460, 200, 220),
          when: () => phase === 'done',
          done: () => (gdOut = gdOut || (phase === 'done' && clothes.every(c => !c.in))),
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (slosh) slosh.stop();
      if (whirr) whirr.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
