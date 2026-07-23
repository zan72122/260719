/* コーヒーメーカー — 写実3D (断面)
 *
 * 朝、おとうさんおかあさんが使う機械。中で水がどう旅するのかは見えない。
 * 断面: 水タンク → ヒーターのU字管 → 泡がのぼる細い管 → シャワーヘッド →
 *       粉のフィルター → ポットへポタポタ。
 * 連鎖: 豆をミルへ → ハンドルぐるぐる → 粉がたまる → 粉をフィルターへ →
 *       水をタンクへ → スイッチ → ヒーター → 沸騰の泡が管をのぼる →
 *       シャワー → ドリップ → ポットに珈琲 → カップへそそぐ
 * 分岐: 挽いた粉の量 × 水の量 = 濃さ (色) が毎回変わる。カップはたまる。
 */
window.GAMES.coffeemaker = (() => {
  let stage3, scene, raf, prev, time;
  let makerG, tankWater, heater, riserBubbles, bubbleState, drops, dropState, dummy;
  let carafe, carafeCoffee, filterG, filterPowder, sw, swLamp;
  let mill, crank, millBeans, drawer, drawerPowder, beansJar;
  let cup, cupCoffee;
  let beansIn, groundN, powderN, waterN, brewing, brewT, carafeN, strength;
  let dragObj, dragId, orbitId, orbitFrom, crankA0, pourT;
  let hum, grind, mats;

  const MAK_X = -240, MAK_Z = 0;
  const MILL_X = 330, MILL_Z = 160;

  /* 操作平面上の点Pを、カメラから見て高さyTにある点へ射影し直す (視差補正) */
  function groundPoint(P, yT) {
    const C = stage3.camera.position;
    const s = (yT - C.y) / (P.y - C.y);
    return new THREE.Vector3(C.x + (P.x - C.x) * s, yT, C.z + (P.z - C.z) * s);
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#e8e0d2', '#f2ece0', '#c2b49c');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1600, 1300), shadowSpan: 1000, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xe0d6c4, roughness: 0.7 }), 0, 700, -400);

    /* --- 本体 --- */
    makerG = new THREE.Group();
    makerG.position.set(MAK_X, 0, MAK_Z);
    scene.add(makerG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0x3a3e44, roughness: 0.35, clearcoat: 0.4 });
    /* 台座 (ヒータープレート) */
    const base = G3.add(makerG, new THREE.BoxGeometry(360, 60, 300), shellM, 0, 30, 0);
    base.castShadow = true;
    G3.add(makerG, new THREE.CylinderGeometry(110, 110, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x666a70, metalness: 0.6, roughness: 0.4 }), 40, 64, 30);
    /* 背中のタワー (水タンク・断面) */
    const tower = G3.add(makerG, new THREE.BoxGeometry(150, 620, 300), shellM, -160, 370, 0);
    tower.castShadow = true;
    /* 水タンク (タワーの上・スケスケ) */
    G3.add(makerG, new THREE.BoxGeometry(120, 320, 240),
      new THREE.MeshPhysicalMaterial({ color: 0xdaeaf2, roughness: 0.12, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      -160, 520, 0);
    tankWater = G3.add(makerG, new THREE.BoxGeometry(112, 1, 232),
      new THREE.MeshPhysicalMaterial({ color: 0x9ecce6, roughness: 0.2, transparent: true, opacity: 0.65 }), -160, 366, 0);
    tankWater.visible = false;
    /* ヒーターU字管 (台座の中・断面で見える) */
    heater = new THREE.Mesh(new THREE.TorusGeometry(60, 12, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8a5a30, metalness: 0.7, roughness: 0.4, emissive: 0x000000 }));
    heater.rotation.z = Math.PI;
    heater.position.set(-100, 60, 130);
    makerG.add(heater);
    /* のぼる管 (タワー前面) */
    G3.add(makerG, new THREE.CylinderGeometry(9, 9, 560, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, roughness: 0.2, transparent: true, opacity: 0.5 }), -80, 350, 130);
    /* 上のアーム + シャワーヘッド */
    G3.add(makerG, new THREE.BoxGeometry(280, 50, 120), shellM, 0, 660, 30).castShadow = true;
    G3.add(makerG, new THREE.CylinderGeometry(52, 64, 30, 14),
      new THREE.MeshStandardMaterial({ color: 0x666a70, metalness: 0.5, roughness: 0.4 }), 40, 620, 30);

    /* --- フィルター (引き出し式・粉を入れる) --- */
    filterG = new THREE.Group();
    filterG.position.set(40, 540, 30);
    makerG.add(filterG);
    const filtM = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6, side: THREE.DoubleSide });
    G3.add(filterG, new THREE.CylinderGeometry(78, 52, 80, 14, 1, true), filtM);
    G3.add(filterG, new THREE.CylinderGeometry(52, 52, 8, 14), filtM, 0, -38, 0);
    filterPowder = G3.add(filterG, new THREE.CylinderGeometry(62, 50, 1, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 }), 0, -30, 0);
    filterPowder.visible = false;
    window.__pts.filter = filterG;

    /* --- ポット (カラフェ) --- */
    carafe = new THREE.Group();
    carafe.position.set(MAK_X + 40, 72, MAK_Z + 30);
    scene.add(carafe);
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xdce8ee, roughness: 0.08, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    G3.add(carafe, new THREE.CylinderGeometry(96, 108, 210, 18, 1, true), glassM, 0, 110, 0);
    G3.add(carafe, new THREE.CylinderGeometry(108, 108, 10, 18), glassM, 0, 8, 0);
    G3.add(carafe, new THREE.BoxGeometry(20, 130, 26), mats.darkPlastic, 118, 120, 0);
    carafeCoffee = G3.add(carafe, new THREE.CylinderGeometry(100, 104, 1, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x38200e, roughness: 0.2, transparent: true, opacity: 0.92 }), 0, 14, 0);
    carafeCoffee.visible = false;
    window.__pts.carafe = carafe;

    /* --- スイッチ --- */
    sw = G3.add(scene, new THREE.BoxGeometry(60, 46, 30),
      new THREE.MeshPhysicalMaterial({ color: 0xd85a40, roughness: 0.3, clearcoat: 0.5 }), MAK_X + 130, 60, MAK_Z + 152);
    swLamp = G3.add(scene, new THREE.SphereGeometry(12, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x333, emissive: 0x000000 }), MAK_X + 130, 100, MAK_Z + 152);
    window.__pts.sw = sw;

    /* --- 泡としずく --- */
    riserBubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(6, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 24);
    riserBubbles.frustumCulled = false;
    scene.add(riserBubbles);
    bubbleState = [];
    for (let i = 0; i < 24; i++) bubbleState.push({ on: false, y: 0, v: 0 });
    drops = new THREE.InstancedMesh(new THREE.SphereGeometry(8, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x4a2c14, transparent: true, opacity: 0.85 }), 20);
    drops.frustumCulled = false;
    scene.add(drops);
    dropState = [];
    for (let i = 0; i < 20; i++) dropState.push({ on: false, y: 0, v: 0, x: 0, z: 0 });
    dummy = new THREE.Object3D();

    /* --- 手回しミル --- */
    mill = new THREE.Group();
    mill.position.set(MILL_X, 0, MILL_Z);
    scene.add(mill);
    const woodM = new THREE.MeshStandardMaterial({ color: 0x9a6f42, roughness: 0.55 });
    const box = G3.add(mill, new THREE.BoxGeometry(180, 160, 180), woodM, 0, 80, 0);
    box.castShadow = true;
    /* ホッパー (豆が見える) */
    const hopM = new THREE.MeshPhysicalMaterial({ color: 0xd8e4ea, roughness: 0.15, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    G3.add(mill, new THREE.CylinderGeometry(75, 40, 90, 12, 1, true), hopM, 0, 205, 0);
    millBeans = G3.add(mill, new THREE.CylinderGeometry(58, 40, 1, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 }), 0, 175, 0);
    millBeans.visible = false;
    /* 臼歯 (断面でチラ見え) */
    G3.add(mill, new THREE.ConeGeometry(34, 50, 10), mats.steel, 0, 172, 0).rotation.x = Math.PI;
    /* クランクハンドル */
    crank = new THREE.Group();
    crank.position.set(0, 255, 0);
    mill.add(crank);
    G3.add(crank, new THREE.CylinderGeometry(9, 9, 26, 8), mats.steel, 0, 0, 0);
    G3.add(crank, new THREE.BoxGeometry(120, 14, 14), mats.steel, 52, 16, 0);
    G3.add(crank, new THREE.CylinderGeometry(13, 13, 60, 8), woodM, 112, 48, 0);
    window.__pts.crank = crank;
    /* 引き出し (粉がたまる) */
    drawer = new THREE.Group();
    drawer.position.set(0, 42, 96);
    mill.add(drawer);
    G3.add(drawer, new THREE.BoxGeometry(150, 70, 30), woodM, 0, 0, 0);
    G3.add(drawer, new THREE.SphereGeometry(12, 8, 6), mats.brass, 0, 0, 20);
    drawerPowder = G3.add(drawer, new THREE.BoxGeometry(130, 1, 20),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 }), 0, 20, 0);
    drawerPowder.visible = false;
    window.__pts.drawer = drawer;

    /* --- 豆のビン --- */
    beansJar = new THREE.Group();
    beansJar.position.set(170, 90, 240);
    scene.add(beansJar);
    G3.add(beansJar, new THREE.CylinderGeometry(60, 60, 150, 14, 1, true), hopM).material.side = THREE.DoubleSide;
    G3.add(beansJar, new THREE.CylinderGeometry(60, 60, 10, 14), hopM, 0, -72, 0);
    G3.add(beansJar, new THREE.CylinderGeometry(54, 54, 90, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 }), 0, -20, 0);
    G3.add(beansJar, new THREE.CylinderGeometry(62, 62, 18, 14), woodM, 0, 84, 0);
    window.__pts.beans = beansJar;

    /* --- 水さし --- */
    const pitcher = new THREE.Group();
    pitcher.position.set(140, 100, 420);
    scene.add(pitcher);
    const pitM = new THREE.MeshPhysicalMaterial({ color: 0xcfe4f0, roughness: 0.12, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    G3.add(pitcher, new THREE.CylinderGeometry(52, 46, 130, 14, 1, true), pitM);
    G3.add(pitcher, new THREE.CylinderGeometry(46, 46, 8, 14), pitM, 0, -62, 0);
    G3.add(pitcher, new THREE.CylinderGeometry(48, 42, 90, 14),
      new THREE.MeshPhysicalMaterial({ color: 0x9ecce6, roughness: 0.2, transparent: true, opacity: 0.7 }), 0, -16, 0);
    G3.add(pitcher, new THREE.BoxGeometry(14, 80, 12), mats.whitePlastic, 60, 6, 0);
    window.__pts.pitcher = pitcher;
    pitcher.userData.home = pitcher.position.clone();
    window.__pitcher = pitcher;

    /* --- カップ --- */
    cup = new THREE.Group();
    cup.position.set(360, 70, 430);
    scene.add(cup);
    const cupM = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f6, roughness: 0.2, clearcoat: 0.5, side: THREE.DoubleSide });
    G3.add(cup, new THREE.CylinderGeometry(56, 44, 90, 14, 1, true), cupM);
    G3.add(cup, new THREE.CylinderGeometry(44, 44, 8, 14), cupM, 0, -42, 0);
    G3.add(cup, new THREE.TorusGeometry(26, 8, 6, 10, Math.PI), cupM, 62, 0, 0).rotation.z = -Math.PI / 2;
    cupCoffee = G3.add(cup, new THREE.CylinderGeometry(50, 44, 1, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x38200e, roughness: 0.2, opacity: 0.95, transparent: true }), 0, -36, 0);
    cupCoffee.visible = false;
    window.__pts.cup = cup;
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
    if (near(crank, 110, 30)) {
      dragObj = 'crank';
      dragId = e.pointerId;
      const cv = new THREE.Vector3();
      mill.getWorldPosition(cv);
      cv.y += 255;
      cv.project(stage3.camera);
      const r = stage3.renderer.domElement.getBoundingClientRect();
      crank.userData.cx = r.left + (cv.x + 1) / 2 * r.width;
      crank.userData.cy = r.top + (1 - (cv.y + 1) / 2) * r.height;
      crankA0 = Math.atan2(e.clientY - crank.userData.cy, e.clientX - crank.userData.cx);
      return;
    }
    if (near(drawer, 100)) {
      dragObj = 'drawer';
      dragId = e.pointerId;
      S.plip(1.2);
      return;
    }
    if (near(beansJar, 100)) {
      /* ビンをタップ → 豆がミルへ */
      if (beansIn < 3) {
        beansIn = Math.min(3, beansIn + 1);
        S.plip(0.8);
        S.pop(0.4);
      } else {
        S.clickReal(0.3);
      }
      return;
    }
    if (near(window.__pitcher, 120)) {
      dragObj = 'pitcher';
      dragId = e.pointerId;
      S.plip(1);
      return;
    }
    if (near(carafe, 150, 100)) {
      if (!brewing) {
        dragObj = 'carafe';
        dragId = e.pointerId;
        S.plip(1.4);
      } else {
        S.buzz();
      }
      return;
    }
    if (near(sw, 75)) {
      if (!brewing && powderN > 0.2 && waterN > 0.2 && carafe.userData.docked) {
        brewing = true;
        brewT = 0;
        strength = U.clamp(powderN / Math.max(0.5, waterN), 0.25, 2.2);
        swLamp.material.emissive.setRGB(1, 0.4, 0.1);
        S.clickReal(0.9);
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj === 'crank') {
        const a = Math.atan2(e.clientY - crank.userData.cy, e.clientX - crank.userData.cx);
        let da = a - crankA0;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        crankA0 = a;
        if (Math.abs(da) > 0.003) {
          crank.rotation.y -= da;
          if (beansIn > 0.05) {
            const g = Math.abs(da) * 0.09;
            beansIn = Math.max(0, beansIn - g);
            groundN = Math.min(3, groundN + g);
            if (grind) grind.set(0.5);
          } else if (grind) {
            grind.set(0.12);
          }
        }
      } else {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (400 - o.y) / d.y;
        if (t > 0) {
          const p = new THREE.Vector3(o.x + d.x * t, 400, o.z + d.z * t);
          const obj = dragObj === 'drawer' ? drawer : dragObj === 'pitcher' ? window.__pitcher : carafe;
          if (dragObj === 'carafe') carafe.userData.docked = false;
          obj.position.set(p.x, 400, p.z);
          if (dragObj !== 'drawer') {
            const tx = dragObj === 'pitcher' ? MAK_X - 160 : cup.userData.home.x;
            const tz = dragObj === 'pitcher' ? MAK_Z : cup.userData.home.z;
            const ty = dragObj === 'pitcher' ? 640 : 140;
            const q = groundPoint(p, ty);
            obj.rotation.z = Math.hypot(q.x - tx, q.z - tz) < 210 ? 1.7 : 0;
          }
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.78, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj === 'drawer') {
        /* フィルターの上ではなす → 粉を移す */
        const fv = new THREE.Vector3();
        filterG.getWorldPosition(fv);
        const q = groundPoint(drawer.position, fv.y);
        if (groundN > 0.1 && Math.hypot(q.x - fv.x, q.z - fv.z) < 190) {
          powderN = Math.min(3, powderN + groundN);
          groundN = 0;
          S.squishReal(0.5);
        }
        drawer.position.copy(drawer.userData.home);
      } else if (dragObj === 'pitcher') {
        window.__pitcher.rotation.z = 0;
        window.__pitcher.position.copy(window.__pitcher.userData.home);
      } else if (dragObj === 'carafe') {
        carafe.rotation.z = 0;
        /* 台座に戻す or カップのそば */
        carafe.position.copy(carafe.userData.home);
        carafe.userData.docked = true;
      }
      dragObj = null;
      dragId = null;
      if (grind) grind.set(0);
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* そそぐ (水さしを傾けている間) */
    if (dragObj === 'pitcher' && window.__pitcher.rotation.z > 1 && waterN < 3) {
      waterN = Math.min(3, waterN + dt * 1);
      pourT += dt;
      if (pourT > 0.4) { pourT = 0; S.glug(); }
    }
    /* カラフェを傾けてカップへ */
    if (dragObj === 'carafe' && carafe.rotation.z > 1 && carafeN > 0.05) {
      const cv = new THREE.Vector3();
      cup.getWorldPosition(cv);
      const q = groundPoint(carafe.position, cv.y + 70);
      if (Math.hypot(q.x - cv.x, q.z - cv.z) < 210) {
        carafeN = Math.max(0, carafeN - dt * 0.8);
        cup.userData.fill = Math.min(1, (cup.userData.fill || 0) + dt * 0.45);
        pourT += dt;
        if (pourT > 0.35) { pourT = 0; S.glug(); }
        if (cup.userData.fill >= 1 && !cup.userData.did) {
          cup.userData.did = true;
          S.yay();
        }
      }
    }

    /* 抽出 */
    if (brewing) {
      brewT += dt;
      heater.material.emissive.setRGB(0.85, 0.2, 0.03);
      if (hum) hum.set(0.4);
      /* 泡が管をのぼる */
      bubbleState.forEach(b => {
        if (!b.on && Math.random() < dt * 7 && brewT > 1.2) {
          b.on = true;
          b.y = 80;
          b.v = 240 + Math.random() * 140;
        }
      });
      /* しずく (シャワー→フィルター、フィルター→ポット) */
      if (brewT > 2.2) {
        waterN = Math.max(0, waterN - dt * 0.28);
        carafeN = Math.min(3, carafeN + dt * 0.26);
        dropState.forEach(d => {
          if (!d.on && Math.random() < dt * 8) {
            d.on = true;
            d.x = MAK_X + 40 + (Math.random() - 0.5) * 70;
            d.z = MAK_Z + 30 + (Math.random() - 0.5) * 50;
            d.y = 480;
            d.v = 0;
          }
        });
        if (Math.floor(time * 3) % 3 === 0 && Math.random() < dt * 8) S.drip();
      }
      if (waterN <= 0.02) {
        brewing = false;
        heater.material.emissive.setRGB(0.15, 0.03, 0);
        swLamp.material.emissive.setRGB(0.1, 0.5, 0.1);
        if (hum) hum.set(0.1);
        S.ding();
      }
    }

    /* 見た目の更新 */
    tankWater.visible = waterN > 0.05;
    tankWater.scale.y = Math.max(1, waterN * 100);
    tankWater.position.y = 366 + waterN * 50;
    millBeans.visible = beansIn > 0.05;
    millBeans.scale.y = Math.max(1, beansIn * 24);
    millBeans.position.y = 175 + beansIn * 12;
    drawerPowder.visible = groundN > 0.05;
    drawerPowder.scale.y = Math.max(1, groundN * 18);
    drawerPowder.position.y = 20 + groundN * 9 - 27;
    filterPowder.visible = powderN > 0.05;
    filterPowder.scale.y = Math.max(1, powderN * 16);
    filterPowder.position.y = -30 + powderN * 8;
    const cofCol = new THREE.Color().setHSL(0.07, 0.55, U.clamp(0.36 - strength * 0.13, 0.06, 0.34));
    carafeCoffee.visible = carafeN > 0.03;
    carafeCoffee.scale.y = Math.max(1, carafeN * 55);
    carafeCoffee.position.y = 14 + carafeN * 27;
    carafeCoffee.material.color.copy(cofCol);
    if (cup.userData.fill > 0.03) {
      cupCoffee.visible = true;
      cupCoffee.scale.y = Math.max(1, cup.userData.fill * 60);
      cupCoffee.position.y = -36 + cup.userData.fill * 30;
      cupCoffee.material.color.copy(cofCol);
    }

    /* 泡・しずく */
    bubbleState.forEach((b, i) => {
      if (b.on) {
        b.y += b.v * dt;
        if (b.y > 620) b.on = false;
        dummy.position.set(MAK_X - 80, b.y, MAK_Z + 130);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      riserBubbles.setMatrixAt(i, dummy.matrix);
    });
    riserBubbles.instanceMatrix.needsUpdate = true;
    dropState.forEach((d, i) => {
      if (d.on) {
        d.v += 900 * dt;
        d.y -= d.v * dt;
        if (d.y < 90) d.on = false;
        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;

    if (window.__dbgCF) window.__dbgCF({
      beans: +beansIn.toFixed(1), ground: +groundN.toFixed(1), powder: +powderN.toFixed(1),
      water: +waterN.toFixed(1), brewing, carafe: +carafeN.toFixed(1),
      strength: +strength.toFixed(2), cup: +(cup.userData.fill || 0).toFixed(2),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      beansIn = 0; groundN = 0; powderN = 0; waterN = 0;
      brewing = false; brewT = 0; carafeN = 0; strength = 1; pourT = 0;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(40, 330, 100),
        radius: 1250, radiusPortraitBase: 1550, radiusMaxPortrait: 2500,
        az: 0.12, po: 1.06,
      });
      build();
      drawer.userData.home = drawer.position.clone();
      carafe.userData.home = carafe.position.clone();
      carafe.userData.docked = true;
      cup.userData.home = cup.position.clone();
      cup.userData.fill = 0;
      hum = S.humLoop();
      hum.set(0.08);
      grind = S.scratchLoop();
      grind.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: 豆 → ハンドル → 粉を移す → 水 → スイッチ → カラフェをカップへ */
      GUIDE.start(stage3, [
        {
          kind: 'tap', at: () => beansJar,
          when: () => beansIn < 0.5 && groundN < 0.1 && powderN < 0.1,
          done: () => beansIn >= 0.5,
        },
        {
          kind: 'turn', at: () => crank, r: 120,
          when: () => beansIn > 0.1 && groundN < 0.8 && powderN < 0.1,
          done: () => groundN >= 0.8,
        },
        {
          kind: 'drag', at: () => drawer, to: () => filterG,
          when: () => groundN >= 0.5 && powderN < 0.1,
          done: () => powderN >= 0.1,
        },
        {
          kind: 'drag', at: () => window.__pitcher, to: () => new THREE.Vector3(MAK_X - 160, 500, MAK_Z),
          when: () => powderN >= 0.1 && waterN < 0.4 && !brewing,
          done: () => waterN >= 0.4,
        },
        {
          kind: 'tap', at: () => sw,
          when: () => powderN >= 0.1 && waterN >= 0.4 && !brewing && carafeN < 0.1,
          done: () => brewing,
        },
        {
          kind: 'drag', at: () => carafe, to: () => cup,
          when: () => !brewing && carafeN > 0.3,
          done: () => (cup.userData.fill || 0) > 0.5,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (hum) hum.stop();
      if (grind) grind.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
