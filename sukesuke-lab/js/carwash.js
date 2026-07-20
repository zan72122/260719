/* 洗車機 — 写実3D
 *
 * 1回ごとにお金がかかる機械。コインを入れるとゲートが開き、コンベアが
 * 泥だらけの車をトンネルへ引き込む。
 * 連鎖: コイン → ゲート → コンベア → 泡 → 回転ブラシ(触れた所だけ落ちる) →
 *       すすぎ → 送風乾燥 → 出口
 * 分岐: 車をつかんで各装置の下に長く/短く留めると洗われ方が変わる。
 *       泥の付き方は毎回違い、洗い残しはそのまま残る。
 */
window.GAMES.carwash = (() => {
  const STATIONS = { gate: -520, foam: -260, brush: -40, rinse: 190, blower: 400 };

  let stage3, scene, raf, prev, time;
  let carG, dirtCv, foamCv, dirtTex, foamTex, gateArm, brushes, coinMesh, coinHome;
  let carHit, coinHit, drops, dummy, dropMesh, dropState;
  let conveyorOn, carX, carDragId, coinDragId, phase; // idle | washing | done
  let servo, brushSnd, blowSnd, sndT;
  let orbitId, orbitFrom, mats;

  function makeLayer(w, h) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    return cv;
  }

  function splatMud() {
    for (const side of dirtCv) {
      const ctx = side.getContext('2d');
      ctx.clearRect(0, 0, 256, 96);
      for (let i = 0; i < 13; i++) {
        ctx.fillStyle = `rgba(${86 + Math.random() * 30 | 0},${60 + Math.random() * 20 | 0},30,${0.55 + Math.random() * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * 256, 40 + Math.random() * 56, 12 + Math.random() * 26, 8 + Math.random() * 16,
          Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    dirtTex.forEach(t => { t.needsUpdate = true; });
  }

  function eraseCol(canvases, texes, worldX, width, alpha) {
    const u = (worldX - (carX - 180)) / 360 * 256;
    if (u < -20 || u > 276) return;
    for (const cv of canvases) {
      const ctx = cv.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = alpha;
      ctx.fillRect(u - width / 2, 0, width, 96);
      ctx.restore();
    }
    texes.forEach(t => { t.needsUpdate = true; });
  }

  function paintFoam(worldX) {
    const u = (worldX - (carX - 180)) / 360 * 256;
    if (u < -20 || u > 276) return;
    for (const cv of foamCv) {
      const ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgba(250,250,255,0.85)';
      ctx.beginPath();
      ctx.arc(u + (Math.random() - 0.5) * 26, 20 + Math.random() * 66, 9 + Math.random() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    foamTex.forEach(t => { t.needsUpdate = true; });
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#a8c4dc', '#c2d4e0', '#9aa4a8');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x767c80, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(600, 1600, 1000), shadowSpan: 1200, intensity: 0.9 });

    /* --- トンネルの骨組み --- */
    const frame = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, metalness: 0.4, roughness: 0.5 });
    [-320, 60, 320, 520].forEach(x => {
      [-230, 230].forEach(z => G3.add(scene, new THREE.BoxGeometry(24, 440, 24), frame, x, 220, z));
      G3.add(scene, new THREE.BoxGeometry(24, 24, 480), frame, x, 440, 0);
    });
    G3.add(scene, new THREE.BoxGeometry(900, 24, 24), frame, 100, 440, -230);
    G3.add(scene, new THREE.BoxGeometry(900, 24, 24), frame, 100, 440, 230);

    /* ゲートの腕 */
    gateArm = new THREE.Group();
    gateArm.position.set(STATIONS.gate, 130, 250);
    scene.add(gateArm);
    G3.add(gateArm, new THREE.BoxGeometry(16, 16, 400),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.6 }), 0, 0, -200);
    G3.add(scene, new THREE.BoxGeometry(30, 260, 30), mats.darkPlastic, STATIONS.gate, 65, 260);

    /* 泡ノズルのアーチ */
    [-230, 0, 230].forEach(z => {
      G3.add(scene, new THREE.ConeGeometry(14, 34, 8), mats.chrome, STATIONS.foam, z === 0 ? 420 : 260, z * 0.8)
        .rotation.x = Math.PI;
    });
    /* ブラシ2本 */
    const brushMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.95 });
    brushes = [];
    [-160, 160].forEach(z => {
      const b = G3.add(scene, new THREE.CylinderGeometry(58, 58, 320, 12), brushMat, STATIONS.brush, 200, z);
      b.castShadow = true;
      /* 房のギザギザ */
      for (let i = 0; i < 8; i++) {
        G3.add(b, new THREE.BoxGeometry(14, 300, 14), brushMat,
          Math.cos(i * Math.PI / 4) * 56, 0, Math.sin(i * Math.PI / 4) * 56);
      }
      brushes.push(b);
    });
    /* すすぎパイプと送風機 */
    G3.add(scene, new THREE.CylinderGeometry(10, 10, 460, 10), mats.chrome, STATIONS.rinse, 400, 0)
      .rotation.x = Math.PI / 2;
    G3.add(scene, new THREE.BoxGeometry(120, 90, 380), mats.whitePlastic, STATIONS.blower, 400, 0);

    /* --- 車 --- */
    carG = new THREE.Group();
    scene.add(carG);
    const body = new THREE.MeshPhysicalMaterial({ color: 0x2a62b8, roughness: 0.25, clearcoat: 0.8, envMapIntensity: 0.7 });
    G3.add(carG, new THREE.BoxGeometry(360, 84, 164), body, 0, 96, 0).castShadow = true;
    G3.add(carG, new THREE.BoxGeometry(190, 74, 148), body, -16, 172, 0).castShadow = true;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9ec4e0, roughness: 0.1, metalness: 0.3 });
    G3.add(carG, new THREE.BoxGeometry(150, 52, 152), glass, -16, 176, 0);
    [[-120, 70], [120, 70], [-120, -70], [120, -70]].forEach(([x, z]) => {
      const w = G3.add(carG, new THREE.CylinderGeometry(42, 42, 26, 16), mats.darkPlastic, x, 42, z);
      w.rotation.x = Math.PI / 2;
    });
    /* 汚れと泡のレイヤー (左右側面) */
    dirtCv = [makeLayer(), makeLayer()];
    foamCv = [makeLayer(), makeLayer()];
    dirtTex = [];
    foamTex = [];
    [86, -86].forEach((z, i) => {
      const dt2 = new THREE.CanvasTexture(dirtCv[i]);
      dt2.encoding = THREE.sRGBEncoding;
      dirtTex.push(dt2);
      const dp = new THREE.Mesh(new THREE.PlaneGeometry(360, 150),
        new THREE.MeshStandardMaterial({ map: dt2, transparent: true, roughness: 0.9, side: THREE.DoubleSide }));
      dp.position.set(0, 120, z);
      if (z < 0) dp.rotation.y = Math.PI;
      carG.add(dp);
      const ft = new THREE.CanvasTexture(foamCv[i]);
      ft.encoding = THREE.sRGBEncoding;
      foamTex.push(ft);
      const fp = new THREE.Mesh(new THREE.PlaneGeometry(360, 150),
        new THREE.MeshStandardMaterial({ map: ft, transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
      fp.position.set(0, 120, z + (z > 0 ? 2 : -2));
      if (z < 0) fp.rotation.y = Math.PI;
      carG.add(fp);
    });
    carHit = new THREE.Mesh(new THREE.BoxGeometry(420, 260, 260), new THREE.MeshBasicMaterial({ visible: false }));
    carHit.position.y = 130;
    carG.add(carHit);

    /* --- コインと投入口 --- */
    coinHome = new THREE.Vector3(-60, 96, 560);
    G3.add(scene, new THREE.CylinderGeometry(44, 48, 80, 12), mats.darkPlastic, -60, 40, 560);
    coinMesh = G3.add(scene, new THREE.CylinderGeometry(34, 34, 8, 20), mats.brass, coinHome.x, coinHome.y, coinHome.z);
    coinMesh.castShadow = true;
    coinHit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    coinHit.position.copy(coinHome);
    scene.add(coinHit);
    const slotBox = G3.add(scene, new THREE.BoxGeometry(70, 160, 70), mats.whitePlastic, 100, 80, 560);
    G3.add(scene, new THREE.BoxGeometry(8, 44, 5), mats.darkPlastic, 100, 130, 596);
    slotBox.userData.isSlot = true;

    /* 水滴・泡の粒 */
    dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(7, 6, 5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }), 80);
    dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dropMesh.frustumCulled = false;
    scene.add(dropMesh);
    dropState = [];
    for (let i = 0; i < 80; i++) dropState.push({ on: false, x: 0, y: 0, z: 0, vy: 0, kind: 0, age: 0 });
    dummy = new THREE.Object3D();

    splatMud();
    window.__pts.coin = coinHit;
    window.__pts.car = carHit;
    window.__pts.slot = slotBox;
  }

  function spawnDrop(x, y, z, kind) {
    const s = dropState.find(q => !q.on);
    if (!s) return;
    s.on = true; s.x = x; s.y = y; s.z = z; s.vy = 0; s.kind = kind; s.age = 0;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (phase !== 'washing' && coinDragId === null && ray.intersectObject(coinHit, false).length) {
      coinDragId = e.pointerId;
      if (window.__dbgCW2) window.__dbgCW2('coin');
      return;
    }
    if (window.__dbgCW2) window.__dbgCW2('other');
    if (carDragId === null && ray.intersectObject(carHit, false).length) {
      if (phase === 'done') {
        /* どろ道へ: もう一度よごれて戻ってくる */
        phase = 'idle';
        carX = -540;
        splatMud();
        foamCv.forEach(cv => cv.getContext('2d').clearRect(0, 0, 256, 96));
        foamTex.forEach(t => { t.needsUpdate = true; });
        S.whoosh(0.5);
        S.plip(0.6);
        return;
      }
      carDragId = e.pointerId;
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    const ray = stage3.setRay(e);
    if (e.pointerId === coinDragId) {
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (120 - o.y) / d.y;
      if (t > 0) {
        coinMesh.position.set(o.x + d.x * t, 120, o.z + d.z * t);
        /* 投入口に届いたら開始 */
        if (Math.hypot(coinMesh.position.x - 100, coinMesh.position.z - 560) < 80) {
          coinDragId = null;
          coinMesh.position.copy(coinHome);
          startWash();
        }
      }
    } else if (e.pointerId === carDragId) {
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (100 - o.y) / d.y;
      if (t > 0) carX = U.clamp(o.x + d.x * t, -540, 750);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.55, 1.25);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === coinDragId) {
      coinDragId = null;
      coinMesh.position.copy(coinHome);
    } else if (e.pointerId === carDragId) {
      carDragId = null;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  function startWash() {
    phase = 'washing';
    conveyorOn = true;
    S.coin();
    servo.set(0.6);
    S.clickReal(0.6, 0.3);
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    /* ゲートの腕 */
    gateArm.rotation.x += (((phase === 'washing') ? -1.4 : 0) - gateArm.rotation.x) * Math.min(1, dt * 4);

    if (phase === 'washing') {
      if (carDragId === null) carX += 95 * dt;
      if (carX >= 750) {
        phase = 'done';
        conveyorOn = false;
        servo.set(0);
        brushSnd.set(0);
        blowSnd.set(0);
        S.ding();
      }
    }
    carG.position.x = carX;

    const under = (st, range) => Math.abs(carX - st) < range;

    /* 泡ステーション */
    if (phase === 'washing' && under(STATIONS.foam, 150)) {
      if (Math.random() < 0.7) {
        paintFoam(STATIONS.foam + U.rand(-60, 60));
        spawnDrop(STATIONS.foam + U.rand(-60, 60), 380, U.rand(-160, 160), 1);
      }
    }
    /* ブラシ */
    const brushing = phase === 'washing' && under(STATIONS.brush, 160);
    brushes.forEach((b, i) => {
      b.rotation.y += (conveyorOn ? 9 : 0.6) * dt * (i ? -1 : 1);
      b.position.z = (i ? 160 : -160) + (brushing ? Math.sin(time * 22 + i) * 8 : 0);
    });
    if (brushing) {
      eraseCol([...dirtCv, ...foamCv], [...dirtTex, ...foamTex], STATIONS.brush, 16, 0.55);
      brushSnd.set(0.5);
    } else {
      brushSnd.set(0);
    }
    /* すすぎ */
    if (phase === 'washing' && under(STATIONS.rinse, 130)) {
      eraseCol(foamCv, foamTex, STATIONS.rinse + U.rand(-40, 40), 30, 0.5);
      eraseCol(dirtCv, dirtTex, STATIONS.rinse + U.rand(-40, 40), 20, 0.06);
      for (let i = 0; i < 2; i++) spawnDrop(STATIONS.rinse + U.rand(-80, 80), 390, U.rand(-140, 140), 0);
    }
    /* 送風 */
    if (phase === 'washing' && under(STATIONS.blower, 120)) {
      blowSnd.set(0.8);
      for (let i = 0; i < 2; i++) spawnDrop(carX + U.rand(-140, 140), U.rand(120, 200), U.rand(-100, 100), 2);
    } else {
      blowSnd.set(0);
    }

    /* 水滴たち */
    let k = 0;
    for (const s of dropState) {
      if (s.on) {
        s.age += dt;
        if (s.kind === 2) {
          s.x += 320 * dt;
          s.y += 60 * dt;
          if (s.age > 0.7) s.on = false;
        } else {
          s.vy -= 900 * dt;
          s.y += s.vy * dt;
          if (s.y < 10) s.on = false;
        }
      }
      dummy.position.set(s.x, s.on ? s.y : -9000, s.z);
      dummy.scale.setScalar(s.on ? (s.kind === 1 ? 1.7 : 1) : 0.001);
      dummy.updateMatrix();
      dropMesh.setMatrixAt(k, dummy.matrix);
      dropMesh.setColorAt(k, new THREE.Color(s.kind === 1 ? 0xf4f4ff : 0x9ecdf0));
      k++;
    }
    dropMesh.instanceMatrix.needsUpdate = true;
    if (dropMesh.instanceColor) dropMesh.instanceColor.needsUpdate = true;

    if (window.__dbgCW) window.__dbgCW({ phase, x: carX | 0 });
    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      carX = -540;
      phase = 'idle';
      conveyorOn = false;
      carDragId = null; coinDragId = null; orbitId = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-40, 220, 0),
        radius: 1900, radiusPortraitBase: 1750, radiusMaxPortrait: 2800,
        az: 0.4, po: 1.25,
      });
      build();
      servo = S.servoLoop();
      brushSnd = S.rumbleLoop();
      blowSnd = S.wind();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: コインを入れる → おわったら車をタップ */
      GUIDE.start(stage3, [
        { kind: 'drag', at: () => coinHit, to: () => window.__pts.slot, when: () => phase === 'idle', done: () => phase !== 'idle' },
        { kind: 'tap', at: () => carHit, when: () => phase === 'done', done: () => phase !== 'done' },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (servo) servo.stop();
      if (brushSnd) brushSnd.stop();
      if (blowSnd) blowSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
