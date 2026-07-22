/* 観覧車 — 写実3D (断面)
 *
 * 遊園地で見上げるだけの巨大機械。土台の駆動室を断面で見せる。
 * 連鎖: レバーを上げる → モーター → 減速ギア → ゴムタイヤが輪のふちを
 *       まさつで回す (リムドライブ) → 大きな輪がゆっくり回る →
 *       ゴンドラは振り子になっていて、加速のたびにゆれる → 一周でチン♪
 * 分岐: 速さの上げかた (急発進はゴンドラが大ゆれ) × だれをどのゴンドラに
 *       乗せるか × てっぺんで止めて景色を見る。人形は乗せたゴンドラに残る。
 */
window.GAMES.ferris = (() => {
  const HUB = new THREE.Vector3(0, 680, 0);
  const RADIUS = 480;
  const N_GONDOLA = 8;

  let stage3, scene, raf, prev, time;
  let wheelG, gondolas, motorRotor, gearBig, tireL, tireR, leverG, bulbs;
  let dolls, dragDoll, dragId, orbitId, orbitFrom;
  let lever, speed, angle, lastRev, prevSpeed;
  let rumble, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#8ec4e8', '#c8e0f0', '#5e94c0');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x7da45e, roughness: 0.85 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(1200, 2400, 1600), shadowSpan: 1600, intensity: 1 });

    /* 遠くの出店 */
    [[-1300, 0xd85a4a], [1350, 0x4a9ad8]].forEach(([x, c]) => {
      G3.add(scene, new THREE.BoxGeometry(320, 220, 260),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }), x, 110, -700);
      G3.add(scene, new THREE.ConeGeometry(240, 140, 4),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), x, 290, -700);
    });

    /* --- 支柱 (A形) --- */
    const legM = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 0.6, roughness: 0.35 });
    [[-1, -130], [1, -130], [-1, 130], [1, 130]].forEach(([s, z]) => {
      const leg = G3.add(scene, new THREE.CylinderGeometry(26, 34, 900, 12), legM, s * 230, 380, z);
      leg.rotation.z = s * 0.32;
      leg.castShadow = true;
    });
    const axle = G3.add(scene, new THREE.CylinderGeometry(40, 40, 340, 16), mats.steel, HUB.x, HUB.y, 0);
    axle.rotation.x = Math.PI / 2;
    axle.castShadow = true;

    /* --- 大きな輪 --- */
    wheelG = new THREE.Group();
    wheelG.position.copy(HUB);
    scene.add(wheelG);
    const rimM = new THREE.MeshStandardMaterial({ color: 0xd84a5a, metalness: 0.5, roughness: 0.4 });
    [-90, 90].forEach(z => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 13, 10, 48), rimM);
      rim.position.z = z;
      rim.castShadow = true;
      wheelG.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.62, 9, 8, 40), rimM);
      rim2.position.z = z;
      wheelG.add(rim2);
    });
    bulbs = [];
    const bulbGeo = new THREE.SphereGeometry(9, 8, 6);
    for (let i = 0; i < N_GONDOLA * 2; i++) {
      const a = i / (N_GONDOLA * 2) * Math.PI * 2;
      [-90, 90].forEach(z => {
        const spoke = G3.add(wheelG, new THREE.CylinderGeometry(6, 6, RADIUS, 8), legM, 0, 0, 0);
        spoke.position.set(Math.cos(a) * RADIUS / 2, Math.sin(a) * RADIUS / 2, z);
        spoke.rotation.z = a + Math.PI / 2;
        if (i % 2 === 0) {
          const b = new THREE.Mesh(bulbGeo,
            new THREE.MeshBasicMaterial({ color: [0xffd040, 0x60d080, 0x6090ff, 0xff7060][i / 2 % 4] }));
          b.position.set(Math.cos(a) * RADIUS * 0.82, Math.sin(a) * RADIUS * 0.82, z);
          wheelG.add(b);
          bulbs.push(b);
        }
      });
      const brace = G3.add(wheelG, new THREE.CylinderGeometry(5, 5, 180, 6), legM, 0, 0, 0);
      brace.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
      brace.rotation.x = Math.PI / 2;
    }

    /* --- ゴンドラ (振り子) --- */
    gondolas = [];
    const cabCols = [0xe85a4a, 0xe8b23a, 0x4ab26a, 0x4a86d8, 0xa86ad8, 0xe87aaa, 0x50c8c0, 0xd87a3a];
    for (let i = 0; i < N_GONDOLA; i++) {
      const pivot = new THREE.Group();
      wheelG.add(pivot);
      const swing = new THREE.Group();
      pivot.add(swing);
      const cab = new THREE.Group();
      swing.add(cab);
      cab.position.y = -95;
      const m = new THREE.MeshPhysicalMaterial({ color: cabCols[i], roughness: 0.35, clearcoat: 0.5 });
      G3.add(cab, new THREE.BoxGeometry(150, 110, 130), m, 0, 0, 0).castShadow = true;
      G3.add(cab, new THREE.BoxGeometry(150, 40, 130),
        new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.5 }), 0, 80, 0);
      [[-1], [1]].forEach(([s]) => {
        G3.add(cab, new THREE.CylinderGeometry(5, 5, 110, 6), mats.chrome, s * 65, 55, 0).rotation.z = s * 0.5;
      });
      gondolas.push({ pivot, swing, cab, sw: U.spring(0), rider: -1 });
    }

    /* --- 駆動室 (断面) --- */
    const pitM = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.7 });
    G3.add(scene, new THREE.BoxGeometry(560, 30, 360), pitM, 0, 15, 0);
    motorRotor = G3.add(scene, new THREE.CylinderGeometry(52, 52, 130, 16), mats.steel, -180, 90, 130);
    motorRotor.rotation.z = Math.PI / 2;
    motorRotor.castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(90, 90, 100),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), -280, 90, 130);
    gearBig = G3.add(scene, new THREE.CylinderGeometry(80, 80, 30, 20), mats.brass, -40, 90, 130);
    gearBig.rotation.z = Math.PI / 2;
    /* リムを押すゴムタイヤ2つ */
    const tireM = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.85 });
    tireL = G3.add(scene, new THREE.CylinderGeometry(60, 60, 60, 18), tireM, -60, 195, 90);
    tireL.rotation.x = Math.PI / 2;
    tireR = G3.add(scene, new THREE.CylinderGeometry(60, 60, 60, 18), tireM, 60, 195, 90);
    tireR.rotation.x = Math.PI / 2;

    /* --- 乗り場 --- */
    G3.add(scene, new THREE.BoxGeometry(420, 60, 300),
      new THREE.MeshStandardMaterial({ color: 0xb09a6a, roughness: 0.7 }), 0, 30, 330).receiveShadow = true;

    /* --- レバー台 --- */
    const cons = G3.add(scene, new THREE.BoxGeometry(120, 160, 100),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.45 }), -420, 80, 420);
    cons.castShadow = true;
    leverG = new THREE.Group();
    leverG.position.set(-420, 160, 420);
    scene.add(leverG);
    G3.add(leverG, new THREE.BoxGeometry(16, 110, 12), mats.steel, 0, 45, 0);
    G3.add(leverG, new THREE.SphereGeometry(18, 12, 10), mats.darkPlastic, 0, 100, 0);
    window.__pts.lever = leverG;

    /* --- 人形 --- */
    dolls = [];
    [[0xd85a4a, 240, 430], [0xd8b83a, 350, 500]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 60, z);
      scene.add(d.g);
      dolls.push({ ...d, state: 'free' });
      window.__pts['doll' + i] = d.g;
    });
  }

  /* いちばん乗り場に近いゴンドラ */
  function lowestGondola() {
    let best = -1, by = 1e9;
    gondolas.forEach((g, i) => {
      const v = new THREE.Vector3();
      g.cab.getWorldPosition(v);
      if (v.y < by) { by = v.y; best = i; }
    });
    return { idx: best, y: by };
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    for (const d of dolls) {
      if (d.state === 'ride') continue;
      d.g.getWorldPosition(v);
      v.y += 80;
      if (ray.ray.distanceToPoint(v) < 120) {
        dragDoll = d;
        d.state = 'held';
        dragId = e.pointerId;
        S.plip(1.4);
        return;
      }
    }
    /* 止まっているとき、乗客入りゴンドラをタップで降ろす */
    if (speed < 0.03) {
      for (const g of gondolas) {
        if (g.rider < 0) continue;
        g.cab.getWorldPosition(v);
        if (ray.ray.distanceToPoint(v) < 130 && v.y < 320) {
          const d = dolls[g.rider];
          d.state = 'free';
          d.g.position.set(160 + g.rider * 110, 60, 420);
          d.g.rotation.z = 0;
          g.rider = -1;
          S.plip(2);
          return;
        }
      }
    }
    leverG.getWorldPosition(v);
    v.y += 60;
    if (ray.ray.distanceToPoint(v) < 100) {
      dragId = e.pointerId;
      leverG.userData.drag = { y0: e.clientY, v0: lever };
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragDoll) {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = -o.z / d.z;
        if (t > 0) dragDoll.g.position.set(o.x + d.x * t, Math.max(0, o.y + d.y * t - 100), 0);
      } else if (leverG.userData.drag) {
        const dr = leverG.userData.drag;
        lever = U.clamp(dr.v0 + (dr.y0 - e.clientY) / 300, 0, 1);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.6, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragDoll) {
        /* いちばん下のゴンドラの近くなら乗せる */
        const lg = lowestGondola();
        const v = new THREE.Vector3();
        gondolas[lg.idx].cab.getWorldPosition(v);
        const p = dragDoll.g.position;
        if (gondolas[lg.idx].rider < 0 && Math.hypot(p.x - v.x, p.y + 80 - v.y) < 190) {
          dragDoll.state = 'ride';
          gondolas[lg.idx].rider = dolls.indexOf(dragDoll);
          S.plip(1.9);
        } else {
          dragDoll.state = 'free';
          dragDoll.g.position.y = 60;
          dragDoll.g.position.z = 420;
        }
        dragDoll = null;
      }
      leverG.userData.drag = null;
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

    /* 輪の回転: レバー目標にゆっくり追従 (慣性が大きい) */
    prevSpeed = speed;
    speed += (lever * 0.55 - speed) * Math.min(1, dt * 0.7);
    const accel = (speed - prevSpeed) / Math.max(dt, 0.001);
    angle += speed * dt;
    wheelG.rotation.z = angle;
    if (rumble) rumble.set(speed * 1.2);

    /* 一周ごとにチン */
    if (Math.floor(angle / (Math.PI * 2)) > lastRev) {
      lastRev = Math.floor(angle / (Math.PI * 2));
      S.ding();
    }

    /* 駆動機械: タイヤはリムの周速に合わせて回る */
    const tireSpin = speed * RADIUS / 60;
    tireL.rotation.z += tireSpin * dt;
    tireR.rotation.z += tireSpin * dt;
    motorRotor.rotation.x += tireSpin * 3.2 * dt;
    gearBig.rotation.x += tireSpin * 1.1 * dt;

    /* 電球の点滅 (回っているときだけ) */
    bulbs.forEach((b, i) => {
      b.visible = speed < 0.01 || Math.floor(time * 4 + i) % 3 !== 0;
    });

    /* ゴンドラ: ピボット位置 + 振り子 */
    gondolas.forEach((g, i) => {
      const a = i / N_GONDOLA * Math.PI * 2;
      g.pivot.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
      /* 世界では常に下向き + ゆれ */
      g.sw.t = 0;
      g.sw.v -= accel * 2.2 * dt * 60;
      U.stepSpring(g.sw, dt, 30, 2.2);
      g.pivot.rotation.z = -angle;          /* 水平を保つ */
      g.swing.rotation.z = U.clamp(g.sw.p, -0.6, 0.6);
      /* 乗客 */
      if (g.rider >= 0) {
        const d = dolls[g.rider];
        const v = new THREE.Vector3();
        g.cab.getWorldPosition(v);
        d.g.position.set(v.x, v.y - 40, v.z);
        d.g.rotation.z = g.swing.rotation.z * 0.7;
      }
    });

    /* レバーの見た目 */
    leverG.rotation.x = -lever * 0.7;

    if (window.__dbgFW) window.__dbgFW({
      lever: +lever.toFixed(2), speed: +speed.toFixed(3),
      angle: +(angle % (Math.PI * 2)).toFixed(2), rev: lastRev,
      riders: gondolas.map(g => g.rider),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      lever = 0; speed = 0; prevSpeed = 0; angle = 0; lastRev = 0;
      dragDoll = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 560, 0),
        radius: 2300, radiusPortraitBase: 2100, radiusMaxPortrait: 3400,
        az: 0.2, po: 1.12,
      });
      build();
      rumble = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 人形をゴンドラへ → レバーを上げる */
      let gdBoard = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.doll0,
          to: () => {
            const v = new THREE.Vector3();
            const lg = lowestGondola();
            gondolas[lg.idx].cab.getWorldPosition(v);
            return v;
          },
          done: () => (gdBoard = gdBoard || gondolas.some(g => g.rider >= 0)),
        },
        { kind: 'drag', at: () => leverG, to: () => {
          const v = new THREE.Vector3();
          leverG.getWorldPosition(v);
          v.y += 160;
          return v;
        }, done: () => speed > 0.1 },
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
