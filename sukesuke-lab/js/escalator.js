/* エスカレーター — 写実3D (断面)
 *
 * 毎日乗るのに、中の機械室は絶対に見られない。トラスの手前側を
 * まるごと切り欠いて、ステップチェーンのループと駆動機械を見せる。
 * 連鎖: スタートボタン → 機械室のモーター → 減速ギア → 駆動スプロケット →
 *       ステップチェーンが回る → ステップが平ら→階段→平らに変形しながら循環 →
 *       手すりベルトも同じ速さで回る → 乗せた人形が上まで運ばれて降りる
 * 分岐: 速さレバー × 乗せるタイミング × 上り/下り切りかえ × 2人の間隔 ×
 *       非常停止でつんのめる。人形は降りた場所にとどまる。
 */
window.GAMES.escalator = (() => {
  /* ステップチェーンのループ (x, y)。前半=表の走行面、後半=もどり */
  const LOOP = [
    [-360, 0], [-60, 0], [380, 330], [620, 330],       /* 表: 下の平ら→坂→上の平ら */
    [620, 240], [380, 240], [-60, -90], [-360, -90],   /* 裏: もどり */
  ];
  const N_STEP = 24;

  let stage3, scene, raf, prev, time;
  let steps, handrailMarks, motorRotor, gearA, gearB, sprocket;
  let dolls, dragDoll, dragId, orbitId, orbitFrom;
  let running, lever, dirUp, speed, chainT, estopT;
  let hum, mats;
  let segLens, totalLen;

  /* ループ上の位置 (弧長パラメータ d: 0..totalLen) */
  function loopPoint(d) {
    d = ((d % totalLen) + totalLen) % totalLen;
    for (let i = 0; i < LOOP.length; i++) {
      const a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
      if (d <= segLens[i]) {
        const f = d / segLens[i];
        return {
          x: U.lerp(a[0], b[0], f),
          y: U.lerp(a[1], b[1], f),
          front: i < 3 || (i === 3 && f < 1),   /* 表側か */
          seg: i, f,
        };
      }
      d -= segLens[i];
    }
    return { x: LOOP[0][0], y: LOOP[0][1], front: true, seg: 0, f: 0 };
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d8dce2', '#e4e6ea', '#b4b8c0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.65 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -140;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(800, 1800, 1200), shadowSpan: 1300, intensity: 0.95 });

    /* 下の床と上の床 */
    const deckM = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(700, 140, 800), deckM, -700, -70, 0).receiveShadow = true;
    G3.add(scene, new THREE.BoxGeometry(800, 140, 800), deckM, 1000, 260, 0).receiveShadow = true;

    /* トラス: 奥のパネルと上下レール (手前は断面であけてある) */
    const truss = new THREE.MeshStandardMaterial({ color: 0x3f7a4f, roughness: 0.5, metalness: 0.4 });
    const panel = G3.add(scene, new THREE.BoxGeometry(1300, 430, 14),
      new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.7 }), 130, 100, -115);
    panel.rotation.z = 0.643;
    const rail1 = G3.add(scene, new THREE.BoxGeometry(1250, 14, 12), truss, 130, 210, -95);
    rail1.rotation.z = 0.643;
    const rail2 = G3.add(scene, new THREE.BoxGeometry(1250, 14, 12), truss, 130, -40, -95);
    rail2.rotation.z = 0.643;

    /* 奥側のガラス欄干 + 手すりベルト */
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xcfe0e8, roughness: 0.05, transmission: 0.85, thickness: 8, transparent: true, opacity: 0.5,
    });
    const bal = G3.add(scene, new THREE.BoxGeometry(1050, 190, 10), glassM, 130, 260, -80);
    bal.rotation.z = 0.643;
    const railM = new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.5 });
    const handrail = G3.add(scene, new THREE.BoxGeometry(1130, 22, 26), railM, 130, 368, -80);
    handrail.rotation.z = 0.643;
    /* 手すりの動きを見せる白マーク */
    handrailMarks = [];
    for (let i = 0; i < 6; i++) {
      const m = G3.add(scene, new THREE.BoxGeometry(24, 6, 28),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 }), 0, 0, -80);
      m.rotation.z = 0.643;
      handrailMarks.push(m);
    }

    /* --- 機械室 (上の床の下) --- */
    const pitM = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.8 });
    G3.add(scene, new THREE.BoxGeometry(400, 220, 300), pitM, 780, 140, -60);
    motorRotor = G3.add(scene, new THREE.CylinderGeometry(46, 46, 120, 18), mats.steel, 700, 180, 40);
    motorRotor.rotation.x = Math.PI / 2;
    motorRotor.castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(90, 70, 90),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), 700, 110, 40);
    gearA = G3.add(scene, new THREE.CylinderGeometry(34, 34, 22, 14), mats.brass, 700, 180, -30);
    gearA.rotation.x = Math.PI / 2;
    gearB = G3.add(scene, new THREE.CylinderGeometry(72, 72, 22, 20), mats.brass, 700, 130, -30);
    gearB.rotation.x = Math.PI / 2;
    sprocket = G3.add(scene, new THREE.CylinderGeometry(58, 58, 30, 10), mats.steel, 620, 285, 0);
    sprocket.rotation.x = Math.PI / 2;
    sprocket.castShadow = true;

    /* --- ステップ --- */
    steps = [];
    const stepM = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 });
    const ribM = new THREE.MeshStandardMaterial({ color: 0xc8b428, roughness: 0.5 });
    for (let i = 0; i < N_STEP; i++) {
      const g = new THREE.Group();
      const tread = G3.add(g, new THREE.BoxGeometry(96, 14, 180), stepM, 0, 0, 0);
      tread.castShadow = true;
      G3.add(g, new THREE.BoxGeometry(96, 4, 180), ribM, 0, 9, 0);
      G3.add(g, new THREE.BoxGeometry(90, 60, 170), stepM, -18, -37, 0).castShadow = true;
      scene.add(g);
      steps.push({ g, d: 0 });
    }

    /* --- 操作盤 --- */
    const consM = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4 });
    const cons = G3.add(scene, new THREE.BoxGeometry(150, 240, 90), consM, -430, 0, 380);
    cons.castShadow = true;
    const startBtn = G3.add(scene, new THREE.CylinderGeometry(34, 36, 22, 18),
      new THREE.MeshStandardMaterial({ color: 0x2f9e4f, roughness: 0.35 }), -430, 132, 380);
    const stopBtn = G3.add(scene, new THREE.CylinderGeometry(30, 32, 26, 18),
      new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.35 }), -430, 132, 450);
    /* 速さレバー */
    const leverG = new THREE.Group();
    leverG.position.set(-430, 90, 300);
    scene.add(leverG);
    G3.add(leverG, new THREE.BoxGeometry(20, 90, 14), mats.steel, 0, 34, 0);
    G3.add(leverG, new THREE.SphereGeometry(17, 12, 10), mats.darkPlastic, 0, 84, 0);
    window.__pts.startBtn = startBtn;
    window.__pts.stopBtn = stopBtn;
    window.__pts.lever = leverG;
    startBtn.userData.kind = 'start';
    stopBtn.userData.kind = 'stop';
    leverG.userData.kind = 'lever';

    /* --- 人形2体 --- */
    dolls = [];
    [[0xd85a4a, -620, 300], [0xd8b83a, -760, 180]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 0, z);
      scene.add(d.g);
      dolls.push({ ...d, state: 'free', stepIdx: -1, off: 0, walkT: 0 });
      window.__pts['doll' + i] = d.g;
    });
  }

  function nearestStepTo(pos) {
    let best = -1, bd = 1e9;
    steps.forEach((s, i) => {
      const p = loopPoint(s.d);
      if (!p.front) return;
      const dx = pos.x - p.x, dy = pos.y + 140 - (p.y + 150);
      const dd = Math.hypot(dx, dy);
      if (dd < bd) { bd = dd; best = i; }
    });
    return bd < 140 ? best : -1;
  }

  /* ---------------- 入力 ---------------- */

  function hitOf(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    const test = (obj, rad) => {
      obj.getWorldPosition(v);
      return ray.ray.distanceToPoint(v) < rad;
    };
    for (let i = 0; i < dolls.length; i++) {
      dolls[i].g.getWorldPosition(v);
      v.y += 80;
      if (ray.ray.distanceToPoint(v) < 110) return { kind: 'doll', i };
    }
    if (test(window.__pts.startBtn, 70)) return { kind: 'start' };
    if (test(window.__pts.stopBtn, 60)) return { kind: 'stop' };
    if (test(window.__pts.lever, 80)) return { kind: 'lever' };
    return null;
  }

  function onDown(e) {
    const hit = hitOf(e);
    if (!hit) {
      if (orbitId === null) {
        orbitId = e.pointerId;
        orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
      }
      return;
    }
    if (hit.kind === 'doll') {
      dragDoll = dolls[hit.i];
      dragDoll.state = 'held';
      dragId = e.pointerId;
      S.plip(1.4);
    } else if (hit.kind === 'start') {
      running = true;
      S.clickReal(1);
    } else if (hit.kind === 'stop') {
      if (running && speed > 0.05) estopT = 0.6;
      running = false;
      S.thunk();
      S.buzz();
    } else if (hit.kind === 'lever') {
      dragId = e.pointerId;
      dragDoll = null;
      window.__pts.lever.userData.drag = { y0: e.clientY, v0: lever };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragDoll) {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = -o.z / d.z;   /* z=0 平面 */
        if (t > 0) {
          dragDoll.g.position.set(o.x + d.x * t, Math.max(-140, o.y + d.y * t - 120), 0);
        }
      } else if (window.__pts.lever.userData.drag) {
        const dr = window.__pts.lever.userData.drag;
        lever = U.clamp(dr.v0 + (dr.y0 - e.clientY) / 260, 0.25, 1);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.9);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.6, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragDoll) {
        const idx = nearestStepTo(dragDoll.g.position);
        if (idx >= 0) {
          dragDoll.state = 'ride';
          dragDoll.stepIdx = idx;
          S.plip(1.8);
        } else {
          dragDoll.state = 'free';
          dragDoll.g.position.y = dragDoll.g.position.x > 500 ? 190 : 0;
        }
        dragDoll = null;
      }
      window.__pts.lever.userData.drag = null;
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

    /* 速度: スタートでレバーぶんまで立ち上がる。非常停止は急ブレーキ */
    const target = running ? lever : 0;
    const k = estopT > 0 ? 10 : 1.6;
    speed += (target - speed) * Math.min(1, dt * k);
    estopT = Math.max(0, estopT - dt);
    if (hum) hum.set(speed * 0.8);

    const dir = dirUp ? 1 : -1;
    const adv = speed * 150 * dt * dir;
    chainT += adv;

    /* ステップ配置 */
    const spacing = totalLen / N_STEP;
    steps.forEach((s, i) => {
      s.d = chainT + i * spacing;
      const p = loopPoint(s.d);
      s.g.position.set(p.x, p.y + 150 - 60, 0);
      s.g.visible = true;
    });

    /* 機械の回転 */
    motorRotor.rotation.z -= speed * dt * 22 * dir;
    gearA.rotation.z -= speed * dt * 22 * dir;
    gearB.rotation.z += speed * dt * 10.4 * dir;
    sprocket.rotation.z += speed * dt * 2.6 * dir;

    /* 手すりマーク: 手すりの直線 (中心(130,368)・傾き0.643・長さ1130) に沿って流す */
    handrailMarks.forEach((m, i) => {
      const f = ((chainT * 0.9 + i * 190) % 1140 + 1140) % 1140;
      const u = f / 1140 - 0.5;
      m.position.set(130 + Math.cos(0.643) * 1130 * u, 368 + Math.sin(0.643) * 1130 * u, -80);
    });

    /* 人形 */
    dolls.forEach(dl => {
      if (dl.state === 'ride') {
        const s = steps[dl.stepIdx];
        const p = loopPoint(s.d);
        if (!p.front) { dl.state = 'free'; dl.g.position.set(-500, 0, 60); return; }
        dl.g.position.set(p.x, p.y + 150 - 60 + 16, 0);
        /* 非常停止のつんのめり */
        dl.g.rotation.z = estopT > 0 ? -0.3 * estopT / 0.6 * dir : Math.sin(time * 3) * 0.015;
        /* 上端/下端に着いたら降りる */
        if (dirUp && p.seg === 3 && p.f > 0.55) { dl.state = 'walk'; dl.walkT = 0; S.plip(2.1); }
        if (!dirUp && p.seg === 0 && p.f < 0.4) { dl.state = 'walkdown'; dl.walkT = 0; S.plip(1.1); }
      } else if (dl.state === 'walk') {
        dl.walkT += dt;
        dl.g.position.set(620 + 90 + dl.walkT * 160, 330 + 150 - 60 + 16 - 230, 0);
        dl.g.position.y = 190;
        dl.legL.rotation.x = Math.sin(dl.walkT * 9) * 0.5;
        dl.legR.rotation.x = -Math.sin(dl.walkT * 9) * 0.5;
        if (dl.walkT > 1.4) { dl.state = 'free'; dl.legL.rotation.x = 0; dl.legR.rotation.x = 0; }
      } else if (dl.state === 'walkdown') {
        dl.walkT += dt;
        dl.g.position.set(-360 - 60 - dl.walkT * 160, 0, 0);
        dl.legL.rotation.x = Math.sin(dl.walkT * 9) * 0.5;
        dl.legR.rotation.x = -Math.sin(dl.walkT * 9) * 0.5;
        if (dl.walkT > 1.4) { dl.state = 'free'; dl.legL.rotation.x = 0; dl.legR.rotation.x = 0; }
      }
    });

    /* レバーの見た目 */
    window.__pts.lever.rotation.x = -(lever - 0.25) * 0.8;

    if (window.__dbgES) window.__dbgES({
      run: running, speed: +speed.toFixed(2), lever: +lever.toFixed(2),
      dolls: dolls.map(d => d.state), up: dirUp,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      running = false; lever = 0.55; dirUp = true; speed = 0; chainT = 0; estopT = 0;
      dragDoll = null; dragId = null; orbitId = null; orbitFrom = null;

      /* ループの弧長 */
      segLens = [];
      totalLen = 0;
      for (let i = 0; i < LOOP.length; i++) {
        const a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segLens.push(l);
        totalLen += l;
      }

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(120, 190, 0),
        radius: 1900, radiusPortraitBase: 2800, radiusMaxPortrait: 4400,
        az: 0.25, po: 1.1,
      });
      build();
      hum = S.humLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: スタート → 人形をステップへ */
      let gdRode = false;
      GUIDE.start(stage3, [
        { kind: 'tap', at: () => window.__pts.startBtn, done: () => running },
        {
          kind: 'drag', at: () => window.__pts.doll0,
          to: () => new THREE.Vector3(-150, 160, 0),
          when: () => running,
          done: () => (gdRode = gdRode || dolls.some(d => d.state === 'ride')),
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
