/* 回転寿司のレーン — 写実3D (断面)
 *
 * お皿がどうして回っているのか、カウンターの下は見えない。
 * レーンの手前を断面にして、チェーンリンクとスプロケットと
 * モーターを見せる。
 * 連鎖: 厨房でシャリに好きなネタをのせる → お皿をレーンに置く →
 *       チェーンがぐるぐる運ぶ → 席の前を通る → タップで取る → お皿がつみあがる →
 *       注文ボタンをおすと特急レーンで直行便がシュッと届く
 * 分岐: なにを作って流すか × どこで取るか × 注文のタイミング。
 *       取られなかったお皿はずっと回り続ける。
 */
window.GAMES.sushi = (() => {
  /* レーンのループ (x, z)。カウンターを一周 */
  const LOOP = [
    [-520, 60], [520, 60], [620, -60], [620, -320], [520, -440],
    [-520, -440], [-620, -320], [-620, -60],
  ];
  const NETA = [
    { name: 'maguro', col: 0xd83a3a },
    { name: 'tamago', col: 0xf0c840 },
    { name: 'ebi', col: 0xf08060 },
    { name: 'kappa', col: 0x50a850 },
  ];

  let stage3, scene, raf, prev, time;
  let plates, prepPlate, prepTopping, sprocketA, motorRotor, chainMarks;
  let expressSled, expressT, expressNeta, orderBtns;
  let stack, stackG, dragMode, dragId, dragNeta, orbitId, orbitFrom;
  let beltT, segLens, totalLen;
  let servo, mats;

  function loopPoint(d) {
    d = ((d % totalLen) + totalLen) % totalLen;
    for (let i = 0; i < LOOP.length; i++) {
      const a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
      if (d <= segLens[i]) {
        const f = d / segLens[i];
        return { x: U.lerp(a[0], b[0], f), z: U.lerp(a[1], b[1], f) };
      }
      d -= segLens[i];
    }
    return { x: LOOP[0][0], z: LOOP[0][1] };
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#e8e0d0', '#f0e8dc', '#b8ac98');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1800, 1300), shadowSpan: 1300, intensity: 0.95 });

    /* --- カウンター (レーンの土台)。手前中央は断面 --- */
    const counterM = new THREE.MeshStandardMaterial({ color: 0x6a4e34, roughness: 0.5 });
    G3.add(scene, new THREE.BoxGeometry(1400, 30, 700), counterM, 0, 175, -190).receiveShadow = true;
    /* レーン面 (帯) は少し高い */
    const laneM = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(1290, 16, 130), laneM, 0, 205, 60);
    G3.add(scene, new THREE.BoxGeometry(1290, 16, 130), laneM, 0, 205, -440);
    G3.add(scene, new THREE.BoxGeometry(130, 16, 420), laneM, -620, 205, -190);
    G3.add(scene, new THREE.BoxGeometry(130, 16, 420), laneM, 620, 205, -190);
    /* 手前断面: チェーンとスプロケット */
    const pitM = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 });
    G3.add(scene, new THREE.BoxGeometry(560, 130, 140), pitM, 0, 120, 60);
    chainMarks = [];
    for (let i = 0; i < 9; i++) {
      const c = G3.add(scene, new THREE.BoxGeometry(34, 14, 22), mats.steel, -240 + i * 60, 178, 60);
      chainMarks.push(c);
    }
    sprocketA = G3.add(scene, new THREE.CylinderGeometry(40, 40, 26, 12), mats.brass, -270, 150, 60);
    sprocketA.castShadow = true;
    motorRotor = G3.add(scene, new THREE.CylinderGeometry(34, 34, 90, 14), mats.steel, -270, 90, 60);
    motorRotor.rotation.z = Math.PI / 2;
    G3.add(scene, new THREE.BoxGeometry(70, 60, 70),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), -350, 90, 60);

    /* --- 厨房 (むこう側) --- */
    G3.add(scene, new THREE.BoxGeometry(700, 240, 240),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.55 }), 0, 120, -700).castShadow = true;
    /* のれん */
    for (let i = 0; i < 5; i++) {
      G3.add(scene, new THREE.BoxGeometry(120, 160, 6),
        new THREE.MeshStandardMaterial({ color: 0x22468a, roughness: 0.7 }), -260 + i * 130, 560, -680);
    }
    /* 準備台 (シャリのお皿がある場所) */
    G3.add(scene, new THREE.BoxGeometry(360, 26, 200),
      new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.5 }), 0, 253, -600);

    /* --- ネタのトレイ --- */
    orderBtns = [];
    NETA.forEach((n, i) => {
      const x = -420 + i * 120;
      G3.add(scene, new THREE.BoxGeometry(100, 20, 100),
        new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.5 }), x, 250, -600);
      const t = mkTopping(n, x, 270, -600);
      t.userData.tray = i;
      window.__pts['neta' + i] = t;
    });

    /* --- 注文ボタン (特急レーン) --- */
    NETA.forEach((n, i) => {
      const b = G3.add(scene, new THREE.CylinderGeometry(30, 33, 18, 14),
        new THREE.MeshPhysicalMaterial({ color: n.col, roughness: 0.35, clearcoat: 0.5 }),
        330 + (i % 2) * 90, 260, 460 + Math.floor(i / 2) * 90);
      b.userData.order = i;
      orderBtns.push(b);
      window.__pts['order' + i] = b;
    });
    G3.add(scene, new THREE.BoxGeometry(230, 16, 230),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5 }), 375, 242, 500);
    /* 特急レール (厨房から席まで直線) */
    G3.add(scene, new THREE.BoxGeometry(30, 10, 1100), mats.chrome, -80, 300, -80);
    expressSled = new THREE.Group();
    expressSled.position.set(-80, 310, -620);
    scene.add(expressSled);
    G3.add(expressSled, new THREE.BoxGeometry(150, 16, 150),
      new THREE.MeshPhysicalMaterial({ color: 0xc83a3a, roughness: 0.35, clearcoat: 0.6 }), 0, 0, 0).castShadow = true;

    /* --- 客席 (手前) と皿スタック --- */
    G3.add(scene, new THREE.BoxGeometry(500, 26, 260),
      new THREE.MeshStandardMaterial({ color: 0xb09468, roughness: 0.5 }), -80, 253, 330).receiveShadow = true;
    stackG = new THREE.Group();
    stackG.position.set(-330, 266, 330);
    scene.add(stackG);
    window.__pts.stack = stackG;

    /* --- 準備中のお皿 (シャリつき) --- */
    plates = [];
    spawnPrepPlate();
  }

  function mkPlate(col) {
    const g = new THREE.Group();
    const p = G3.add(g, new THREE.CylinderGeometry(58, 44, 12, 18),
      new THREE.MeshPhysicalMaterial({ color: col || 0xe8e4dc, roughness: 0.25, clearcoat: 0.6 }), 0, 0, 0);
    p.castShadow = true;
    return g;
  }

  function mkRice(parent) {
    const rice = G3.add(parent, new THREE.CapsuleGeometry(20, 30, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.85 }), 0, 18, 0);
    rice.rotation.z = Math.PI / 2;
    rice.scale.set(1, 0.75, 1);
    return rice;
  }

  function mkTopping(neta, x, y, z) {
    const t = G3.add(scene, new THREE.BoxGeometry(56, 14, 34),
      new THREE.MeshPhysicalMaterial({ color: neta.col, roughness: 0.4, clearcoat: 0.4 }), x, y, z);
    t.castShadow = true;
    if (neta.name === 'ebi') t.scale.set(1, 1, 0.8);
    return t;
  }

  function spawnPrepPlate() {
    prepPlate = mkPlate();
    prepPlate.position.set(120, 272, -600);
    scene.add(prepPlate);
    mkRice(prepPlate);
    prepTopping = null;
    window.__pts.prep = prepPlate;
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
    /* ネタをつかむ */
    for (let i = 0; i < NETA.length; i++) {
      if (near(window.__pts['neta' + i], 80)) {
        dragNeta = mkTopping(NETA[i], 0, 0, 0);
        dragNeta.userData.neta = i;
        dragNeta.position.copy(window.__pts['neta' + i].position);
        dragMode = 'neta';
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    /* できたお皿をレーンへ */
    if (prepPlate && prepTopping !== null && near(prepPlate, 100, 20)) {
      dragMode = 'plate';
      dragId = e.pointerId;
      return;
    }
    /* 注文ボタン */
    for (const b of orderBtns) {
      if (near(b, 60)) {
        if (expressT <= 0) {
          expressNeta = b.userData.order;
          expressT = 0.001;
          S.clickReal(1);
          S.ding();
        } else {
          S.buzz();
        }
        return;
      }
    }
    /* レーンのお皿をタップで取る (客席の前だけ) */
    for (let i = plates.length - 1; i >= 0; i--) {
      const pl = plates[i];
      pl.g.getWorldPosition(v);
      if (v.z > -40 && ray.ray.distanceToPoint(v) < 90) {
        takePlate(i);
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function takePlate(i) {
    const pl = plates[i];
    plates.splice(i, 1);
    scene.remove(pl.g);
    /* スタックに皿を積む */
    const p = mkPlate(0xe8e4dc);
    p.position.set(0, stack * 14, 0);
    stackG.add(p);
    stack++;
    S.plip(1.6 + Math.min(1, stack * 0.08));
    S.squishReal(0.5);
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (dragMode === 'neta') {
        const t = (300 - o.y) / d.y;
        if (t > 0) dragNeta.position.set(o.x + d.x * t, 300, o.z + d.z * t);
      } else if (dragMode === 'plate') {
        const t = (280 - o.y) / d.y;
        if (t > 0) prepPlate.position.set(o.x + d.x * t, 280, o.z + d.z * t);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.55, 1.25);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'neta' && dragNeta) {
        /* シャリの上に置けたか */
        const v = new THREE.Vector3();
        prepPlate.getWorldPosition(v);
        if (prepTopping === null &&
            Math.hypot(dragNeta.position.x - v.x, dragNeta.position.z - v.z) < 90) {
          scene.remove(dragNeta);
          prepTopping = dragNeta.userData.neta;
          const top = mkTopping(NETA[prepTopping], 0, 0, 0);
          scene.remove(top);
          prepPlate.add(top);
          top.position.set(0, 40, 0);
          S.squishReal(0.6);
        } else {
          scene.remove(dragNeta);
        }
        dragNeta = null;
      } else if (dragMode === 'plate') {
        /* レーンの上で離すと流れはじめる */
        const p = prepPlate.position;
        const nearLane = Math.abs(p.z - 60) < 100 || Math.abs(p.z + 440) < 100 ||
          Math.abs(p.x - 620) < 100 || Math.abs(p.x + 620) < 100;
        if (nearLane) {
          /* いちばん近いループ位置に載せる */
          let bd = 1e9, bestD = 0;
          for (let d2 = 0; d2 < totalLen; d2 += 20) {
            const lp = loopPoint(d2);
            const dd = Math.hypot(p.x - lp.x, p.z - lp.z);
            if (dd < bd) { bd = dd; bestD = d2; }
          }
          plates.push({ g: prepPlate, d: bestD - beltT });
          S.ratchet(0.7);
          spawnPrepPlate();
        } else {
          prepPlate.position.set(120, 272, -600);
        }
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

    /* ベルトは一定速でぐるぐる */
    beltT += dt * 85;
    if (servo) servo.set(0.3);
    sprocketA.rotation.y += dt * 2.2;
    motorRotor.rotation.x += dt * 7;
    chainMarks.forEach((c, i) => {
      c.position.x = -240 + ((i * 60 + beltT) % 540);
    });

    /* お皿の巡回 (席に置かれた特急皿は動かない) */
    plates.forEach(pl => {
      if (pl.seat) return;
      const lp = loopPoint(pl.d + beltT);
      pl.g.position.set(lp.x, 218, lp.z);
    });

    /* 特急便 */
    if (expressT > 0) {
      expressT += dt * 0.7;
      const tt = Math.min(1, expressT);
      /* 行き: 厨房→席。すこし待って皿が下りて、そりが帰る */
      if (tt < 1) {
        expressSled.position.z = U.lerp(-620, 300, U.clamp((tt - 0.15) / 0.6, 0, 1));
        if (expressSled.children.length === 1 && tt > 0.1) {
          const p = mkPlate();
          mkRice(p);
          const top = mkTopping(NETA[expressNeta], 0, 0, 0);
          scene.remove(top);
          p.add(top);
          top.position.set(0, 40, 0);
          p.position.set(0, 14, 0);
          expressSled.add(p);
        }
      } else if (expressT > 1.6) {
        /* 皿を席に置いてそりが帰る */
        if (expressSled.children.length > 1) {
          const p = expressSled.children[1];
          expressSled.remove(p);
          p.position.set(80, 266, 330);
          scene.add(p);
          plates.push({ g: p, d: null, seat: true });
          S.stamp();
        }
        expressSled.position.z = U.lerp(300, -620, Math.min(1, (expressT - 1.6) / 0.8));
        if (expressT > 2.5) expressT = 0;
      }
    }

    if (window.__dbgSU) window.__dbgSU({
      plates: plates.filter(p => !p.seat).length, stack,
      prepTopping, express: +expressT.toFixed(2),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      stack = 0; beltT = 0; expressT = 0; expressNeta = 0;
      dragMode = null; dragId = null; dragNeta = null; orbitId = null; orbitFrom = null;

      segLens = [];
      totalLen = 0;
      for (let i = 0; i < LOOP.length; i++) {
        const a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segLens.push(l);
        totalLen += l;
      }

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 210, -140),
        radius: 1750, radiusPortraitBase: 2100, radiusMaxPortrait: 3300,
        az: 0.05, po: 0.85,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ネタをのせる → お皿をレーンへ → 通ったら取る */
      let gdTook = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.neta0, to: () => prepPlate,
          when: () => prepTopping === null, done: () => prepTopping !== null,
        },
        {
          kind: 'drag', at: () => prepPlate, to: () => new THREE.Vector3(0, 240, 60),
          when: () => prepTopping !== null, done: () => plates.filter(p => !p.seat).length > 0,
        },
        {
          kind: 'tap',
          at: () => {
            const target = plates.find(p => !p.seat);
            return target ? target.g : null;
          },
          when: () => {
            const v = new THREE.Vector3();
            return plates.some(p => {
              if (p.seat) return false;
              p.g.getWorldPosition(v);
              return v.z > -40;
            });
          },
          done: () => (gdTook = gdTook || stack > 0),
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
