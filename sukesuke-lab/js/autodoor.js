/* 自動ドア — 写実3D (断面)
 *
 * お店の入口で毎日会うのに、上の箱の中は見たことがない。
 * ヘッダーカバーを外して、モーター・歯付きベルト・プーリー・吊り金具を見せる。
 * 連鎖: 人形がセンサーの検知エリアへ → センサーが光る → チャイム →
 *       モーターが回ってベルトが動く → 左右の扉が逆向きに開く →
 *       通り抜ける → しばらくすると閉まる → 閉まりかけに人がいると安全再オープン
 * 分岐: 近づく速さ (走ると開ききる前に着く) × 立ち止まる場所 ×
 *       ボールは背が低くて反応しない × 2人が両側から同時に。
 */
window.GAMES.autodoor = (() => {
  const OPEN_W = 270;      /* 扉1枚の開きストローク */

  let stage3, scene, raf, prev, time;
  let doorL, doorR, beltMarks, motorW, pulleyL, pulleyR, sensorLamp, hangerL, hangerR;
  let dolls, ball, dragObj, dragId, orbitId, orbitFrom, vel;
  let doorX, sensed, closeTimer, chimed;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#cfd8e0', '#e0e4e8', '#a8b0ba');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb0aca0, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1200, intensity: 0.95 });

    /* お店のかべ (入口の左右) と中の棚 */
    const wallM = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(700, 620, 40), wallM, -680, 310, 0).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(700, 620, 40), wallM, 680, 310, 0).castShadow = true;
    /* 店内: 商品棚 */
    const shelfM = new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.6 });
    [[-380, -420], [0, -520], [380, -420]].forEach(([x, z]) => {
      G3.add(scene, new THREE.BoxGeometry(260, 300, 80), shelfM, x, 150, z).castShadow = true;
      for (let i = 0; i < 6; i++) {
        G3.add(scene, new THREE.BoxGeometry(60, 60, 60),
          new THREE.MeshStandardMaterial({ color: [0xd85a4a, 0x4a9ad8, 0xd8c04a][i % 3], roughness: 0.5 }),
          x - 80 + (i % 3) * 80, 120 + Math.floor(i / 3) * 100, z + 10);
      }
    });

    /* --- ヘッダー (断面: 前カバーなし) --- */
    const headM = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.5 });
    G3.add(scene, new THREE.BoxGeometry(1100, 30, 160), headM, 0, 635, 0).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(1100, 170, 20), headM, 0, 535, -70);
    /* モーターとプーリー2つ + ベルト */
    motorW = G3.add(scene, new THREE.CylinderGeometry(40, 40, 60, 16), mats.steel, -400, 540, -20);
    motorW.rotation.x = Math.PI / 2;
    motorW.castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(80, 60, 50),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), -470, 540, -20);
    pulleyL = G3.add(scene, new THREE.CylinderGeometry(30, 30, 24, 14), mats.brass, -400, 540, 20);
    pulleyL.rotation.x = Math.PI / 2;
    pulleyR = G3.add(scene, new THREE.CylinderGeometry(30, 30, 24, 14), mats.brass, 400, 540, 20);
    pulleyR.rotation.x = Math.PI / 2;
    const beltM = new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.7 });
    G3.add(scene, new THREE.BoxGeometry(800, 10, 6), beltM, 0, 570, 20);
    G3.add(scene, new THREE.BoxGeometry(800, 10, 6), beltM, 0, 510, 20);
    beltMarks = [];
    for (let i = 0; i < 8; i++) {
      const m = G3.add(scene, new THREE.BoxGeometry(16, 14, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 }), 0, 570, 22);
      beltMarks.push(m);
    }
    /* 吊り金具 (上ベルト=左扉 / 下ベルト=右扉) */
    hangerL = G3.add(scene, new THREE.BoxGeometry(30, 70, 14), mats.steel, 0, 555, 30);
    hangerR = G3.add(scene, new THREE.BoxGeometry(30, 130, 14), mats.steel, 0, 525, 30);
    /* レール */
    G3.add(scene, new THREE.BoxGeometry(1080, 14, 30), mats.chrome, 0, 500, 30);

    /* --- センサー (検知エリアが見える) --- */
    const sens = G3.add(scene, new THREE.BoxGeometry(90, 34, 50),
      new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.4 }), 0, 610, 70);
    sens.rotation.x = 0.5;
    sensorLamp = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x333a33 }));
    sensorLamp.position.set(0, 600, 92);
    scene.add(sensorLamp);
    const zoneM = new THREE.MeshBasicMaterial({
      color: 0x60c0ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
    });
    const zone = new THREE.Mesh(new THREE.ConeGeometry(280, 590, 4, 1, true), zoneM);
    zone.position.set(0, 300, 240);
    zone.rotation.y = Math.PI / 4;
    zone.scale.z = 0.7;
    scene.add(zone);

    /* --- ガラス扉2枚 --- */
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xd8e8f0, roughness: 0.03, transmission: 0.88, thickness: 10, transparent: true, opacity: 0.45,
    });
    const frameM = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.8, roughness: 0.35 });
    const mkDoor = () => {
      const g = new THREE.Group();
      G3.add(g, new THREE.BoxGeometry(300, 490, 16), glassM, 0, 245, 0);
      G3.add(g, new THREE.BoxGeometry(300, 20, 22), frameM, 0, 495, 0);
      G3.add(g, new THREE.BoxGeometry(300, 26, 22), frameM, 0, 10, 0);
      G3.add(g, new THREE.BoxGeometry(20, 490, 22), frameM, -145, 245, 0).castShadow = true;
      G3.add(g, new THREE.BoxGeometry(20, 490, 22), frameM, 145, 245, 0);
      /* 黄色い注意テープ */
      G3.add(g, new THREE.BoxGeometry(300, 34, 17),
        new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.6 }), 0, 250, 0);
      scene.add(g);
      return g;
    };
    doorL = mkDoor();
    doorR = mkDoor();
    window.__pts.door = doorL;

    /* --- 人形2体とボール --- */
    dolls = [];
    [[0xd85a4a, -240, 470], [0x4a9ad8, 320, 560]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 0, z);
      scene.add(d.g);
      dolls.push({ ...d, vx: 0, vz: 0 });
      window.__pts['doll' + i] = d.g;
    });
    ball = G3.add(scene, new THREE.SphereGeometry(42, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe07030, roughness: 0.5 }), -450, 42, 420);
    ball.castShadow = true;
    ball.userData = { vx: 0, vz: 0 };
    window.__pts.ball = ball;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    for (const d of dolls) {
      d.g.getWorldPosition(v);
      v.y += 80;
      if (ray.ray.distanceToPoint(v) < 120) {
        dragObj = d;
        dragId = e.pointerId;
        vel = U.velTracker();
        vel.push(e.clientX, e.clientY, performance.now());
        return;
      }
    }
    ball.getWorldPosition(v);
    if (ray.ray.distanceToPoint(v) < 90) {
      dragObj = ball.userData;
      dragObj.isBall = true;
      dragId = e.pointerId;
      vel = U.velTracker();
      vel.push(e.clientX, e.clientY, performance.now());
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function moveOnFloor(obj, ray) {
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = -o.y / d.y;
    if (t <= 0) return;
    let nx = U.clamp(o.x + d.x * t, -900, 900);
    let nz = U.clamp(o.z + d.z * t, -650, 750);
    /* 扉がふさいでいる場所は通れない */
    const gap = doorX * OPEN_W;
    const oldZ = obj.position.z;
    if (Math.abs(nx) > gap - 30 && Math.abs(nx) < 560 && Math.sign(nz - 8) !== Math.sign(oldZ - 8)) {
      nz = oldZ > 8 ? Math.max(nz, 60) : Math.min(nz, -50);
      S.thunk();
    }
    obj.position.x = nx;
    obj.position.z = nz;
  }

  function onMove(e) {
    if (dragObj && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      if (dragObj.isBall) moveOnFloor(ball, ray);
      else moveOnFloor(dragObj.g, ray);
      vel.push(e.clientX, e.clientY, performance.now());
      /* 歩きアニメ */
      if (!dragObj.isBall) {
        const w = Math.min(1, vel.vel().mag / 800);
        dragObj.legL.rotation.x = Math.sin(time * 11) * 0.6 * w;
        dragObj.legR.rotation.x = -Math.sin(time * 11) * 0.6 * w;
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.7, 0.7);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.6, 1.42);
    }
  }

  function onUp(e) {
    if (dragObj && e.pointerId === dragId) {
      if (dragObj.isBall) {
        /* フリックで転がる */
        const vv = vel.vel();
        ball.userData.vx = vv.x * 0.9;
        ball.userData.vz = vv.y * 0.9;
        dragObj.isBall = false;
      } else {
        dragObj.legL.rotation.x = 0;
        dragObj.legR.rotation.x = 0;
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

    /* センサー判定: 人形だけ (ボールは背が低い) */
    sensed = dolls.some(d => Math.abs(d.g.position.x) < 300 &&
      d.g.position.z > 30 && d.g.position.z < 460);
    /* 安全: 扉の間に人がいたら開けなおす */
    const inDoorway = dolls.some(d => Math.abs(d.g.position.x) < 320 && Math.abs(d.g.position.z) < 55);
    const wantOpen = sensed || inDoorway;

    if (wantOpen) {
      if (!chimed) { chimed = true; S.doorChime(); }
      closeTimer = 1.6;
    } else {
      closeTimer -= dt;
      if (closeTimer < 0) chimed = false;
    }
    const target = (wantOpen || closeTimer > 0) ? 1 : 0;
    const before = doorX;
    doorX += (target - doorX) * Math.min(1, dt * (target > doorX ? 3.2 : 1.7));
    if (servo) servo.set(Math.abs(doorX - before) > 0.0004 ? 0.5 : 0);
    sensorLamp.material.color.set(wantOpen ? 0x50e070 : 0x333a33);

    /* 扉とベルトと吊り金具 */
    const off = 150 + doorX * OPEN_W;
    doorL.position.x = -off;
    doorR.position.x = off;
    hangerL.position.x = -off + 100;
    hangerR.position.x = off - 100;
    const spin = (doorX - before) * 40;
    motorW.rotation.z += spin;
    pulleyL.rotation.z += spin;
    pulleyR.rotation.z += spin;
    beltMarks.forEach((m, i) => {
      const u = ((i / 8 + doorX * 0.35) % 1);
      const top = u < 0.5;
      const f = top ? u * 2 : (u - 0.5) * 2;
      m.position.set(-390 + f * 780 * (top ? 1 : -1) + (top ? 0 : 780 * 0), top ? 570 : 510, 22);
      m.position.x = top ? -390 + f * 780 : 390 - f * 780;
    });

    /* ボールの転がり */
    const bu = ball.userData;
    if (Math.abs(bu.vx) > 1 || Math.abs(bu.vz) > 1) {
      let nx = ball.position.x + bu.vx * dt;
      let nz = ball.position.z + bu.vz * dt;
      const gap = doorX * OPEN_W;
      if (Math.abs(nx) > gap - 30 && Math.abs(nx) < 560 &&
          Math.sign(nz - 8) !== Math.sign(ball.position.z - 8)) {
        bu.vz *= -0.5;
        nz = ball.position.z;
        S.thunk();
      }
      if (nx < -880 || nx > 880) bu.vx *= -0.6;
      else ball.position.x = nx;
      if (nz < -630 || nz > 730) bu.vz *= -0.6;
      else ball.position.z = nz;
      bu.vx *= Math.pow(0.35, dt);
      bu.vz *= Math.pow(0.35, dt);
      ball.rotation.x += bu.vz * dt / 42;
      ball.rotation.z -= bu.vx * dt / 42;
    }

    if (window.__dbgAD) window.__dbgAD({
      doorX: +doorX.toFixed(2), sensed, inDoorway,
      dolls: dolls.map(d => [d.g.position.x | 0, d.g.position.z | 0]),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      doorX = 0; sensed = false; closeTimer = 0; chimed = false;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 260, 0),
        radius: 1650, radiusPortraitBase: 1500, radiusMaxPortrait: 2600,
        az: 0.12, po: 1.12,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 人形をセンサーの前へ → 通り抜ける */
      let gdOpened = false, gdThrough = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.doll0, to: () => new THREE.Vector3(0, 60, 220),
          done: () => (gdOpened = gdOpened || doorX > 0.5),
        },
        {
          kind: 'drag', at: () => window.__pts.doll0, to: () => new THREE.Vector3(0, 60, -320),
          when: () => doorX > 0.5,
          done: () => (gdThrough = gdThrough || dolls.some(d => d.g.position.z < -100)),
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
