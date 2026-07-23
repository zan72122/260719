/* ミキサー — 写実3D (断面)
 *
 * 果物がジュースになる瞬間は、フタの上からしか見えない。
 * ガラスのジャーをスケスケにして、刃の回転・果物のダンス・渦を見せる。
 * 連鎖: フタをあける → 果物をジャーへ → フタを閉める → ボタンをおしている間だけ →
 *       モーター → カップリング → 刃が回る → 果物がはねて小さくなる → 色が混ざって
 *       ジュースに → コップへそそぐ
 * 分岐: 果物の組合せで色と味が変わる × 回す長さでツブツブ⇔なめらか × コップはたまる。
 */
window.GAMES.mixer = (() => {
  let stage3, scene, raf, prev, time;
  let baseG, jar, jarG, lid, blades, motor, btn, juice, glassG, glasses;
  let fruits, inJar, lidOn, blend, liquid, juiceCol, spinV;
  let dragObj, dragId, orbitId, orbitFrom, pressing, pourT;
  let whirr, mats;

  const JAR_X = -120, JAR_Z = 0;

  /* 操作平面上の点Pを、カメラから見て高さyTにある点へ射影し直す (視差補正) */
  function groundPoint(P, yT) {
    const C = stage3.camera.position;
    const s = (yT - C.y) / (P.y - C.y);
    return new THREE.Vector3(C.x + (P.x - C.x) * s, yT, C.z + (P.z - C.z) * s);
  }
  const FRUIT_DEFS = [
    { col: 0xd83a4a, name: 'いちご', r: 34 },
    { col: 0xf0c832, name: 'バナナ', r: 38 },
    { col: 0x5a5aa8, name: 'ブルーベリー', r: 26 },
    { col: 0x50b060, name: 'メロン', r: 40 },
  ];

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#f0e6da', '#f6efe2', '#c8b8a0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb9a684, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1500, 1300), shadowSpan: 1000, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xe8dfd0, roughness: 0.7 }), 0, 700, -400);
    G3.add(scene, new THREE.BoxGeometry(1600, 120, 700),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.55 }), 40, 60, 60).receiveShadow = true;

    /* --- モーター台座 (断面でモーターとカップリングが見える) --- */
    baseG = new THREE.Group();
    baseG.position.set(JAR_X, 120, JAR_Z);
    scene.add(baseG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8503a, roughness: 0.3, clearcoat: 0.6 });
    /* 外殻は後ろ半分 (前が断面) */
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(150, 170, 220, 24, 1, true, Math.PI * 0.05, Math.PI * 0.9),
      new THREE.MeshPhysicalMaterial({ color: 0xe8503a, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide }));
    shell.position.y = 110;
    shell.rotation.y = Math.PI / 2;
    shell.castShadow = true;
    baseG.add(shell);
    G3.add(baseG, new THREE.CylinderGeometry(170, 170, 24, 24), shellM, 0, 6, 0).castShadow = true;
    /* モーター (銅コイル) */
    motor = new THREE.Group();
    motor.position.set(0, 110, -20);
    baseG.add(motor);
    G3.add(motor, new THREE.CylinderGeometry(62, 62, 110, 14),
      new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.35 }), 0, 0, 0);
    G3.add(motor, new THREE.CylinderGeometry(16, 16, 190, 10), mats.steel, 0, 20, 0);
    /* カップリング */
    G3.add(baseG, new THREE.CylinderGeometry(34, 40, 26, 8), mats.steel, 0, 218, -20);

    /* --- ジャー (スケスケ) --- */
    jarG = new THREE.Group();
    jarG.position.set(JAR_X, 240, JAR_Z - 20);
    scene.add(jarG);
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xe4f0f4, roughness: 0.06, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    });
    jar = G3.add(jarG, new THREE.CylinderGeometry(150, 110, 340, 18, 1, true), glassM, 0, 170, 0);
    G3.add(jarG, new THREE.CylinderGeometry(110, 110, 14, 18), glassM, 0, 2, 0);
    G3.add(jarG, new THREE.BoxGeometry(26, 200, 40), glassM, 168, 160, 0);
    /* 刃 */
    blades = new THREE.Group();
    blades.position.set(0, 34, 0);
    jarG.add(blades);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.25 });
    for (let i = 0; i < 4; i++) {
      const b = G3.add(blades, new THREE.BoxGeometry(95, 8, 22), bladeM, 0, 0, 0);
      b.rotation.y = i * Math.PI / 2;
      b.rotation.z = (i % 2 ? 0.5 : -0.35);
      b.position.x = Math.cos(i * Math.PI / 2) * 40;
      b.position.z = -Math.sin(i * Math.PI / 2) * 40;
    }
    G3.add(blades, new THREE.CylinderGeometry(12, 12, 50, 8), bladeM, 0, -14, 0);
    /* ジュース (半透明の液) */
    juice = G3.add(jarG, new THREE.CylinderGeometry(140, 112, 1, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xf0c0c0, roughness: 0.25, transparent: true, opacity: 0.85 }), 0, 30, 0);
    juice.visible = false;
    window.__pts.jar = jarG;

    /* --- フタ --- */
    lid = new THREE.Group();
    lid.position.set(0, 585, JAR_Z - 20);
    lid.position.x = 0;
    jarG.add(lid);
    lid.position.set(0, 355, 0);
    G3.add(lid, new THREE.CylinderGeometry(152, 148, 34, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x3a3e44, roughness: 0.35, clearcoat: 0.4 }), 0, 0, 0).castShadow = true;
    G3.add(lid, new THREE.CylinderGeometry(40, 44, 26, 12), mats.whitePlastic, 0, 28, 0);
    window.__pts.lid = lid;

    /* --- ボタン --- */
    btn = G3.add(scene, new THREE.CylinderGeometry(38, 44, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x2f8ed0, roughness: 0.3, clearcoat: 0.5 }), JAR_X, 140, JAR_Z + 165);
    btn.rotation.x = 0.5;
    window.__pts.btn = btn;

    /* --- 果物 (テーブルの上・2個ずつ) --- */
    fruits = [];
    FRUIT_DEFS.forEach((def, k) => {
      for (let j = 0; j < 2; j++) {
        const g = new THREE.Group();
        const m = new THREE.MeshPhysicalMaterial({ color: def.col, roughness: 0.45, clearcoat: 0.3 });
        let mesh;
        if (def.name === 'バナナ') {
          mesh = new THREE.Mesh(new THREE.TorusGeometry(30, 13, 8, 10, Math.PI * 0.9), m);
          mesh.rotation.z = 0.6;
          g.add(mesh);
        } else {
          mesh = G3.add(g, new THREE.SphereGeometry(def.r, 12, 9), m, 0, 0, 0);
          if (def.name === 'いちご') {
            mesh.scale.y = 1.2;
            G3.add(g, new THREE.ConeGeometry(12, 16, 6),
              new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.6 }), 0, def.r + 8, 0);
          }
        }
        mesh.castShadow = true;
        g.position.set(220 + (k % 2) * 120, 140 + def.r * 0.5, 230 + Math.floor(k / 2) * 130 + j * 60);
        scene.add(g);
        const f = { g, def, state: 'table', home: g.position.clone(), size: 1, ang: Math.random() * 7 };
        fruits.push(f);
        if (j === 0) window.__pts['fruit' + k] = g;
      }
    });

    /* --- コップ --- */
    glassG = new THREE.Group();
    glassG.position.set(380, 120, 430);
    scene.add(glassG);
    glasses = [];
    mkGlass();
  }

  function mkGlass() {
    const g = new THREE.Group();
    const i = glasses.length;
    g.position.set((i % 3) * -120, 0, Math.floor(i / 3) * -110);
    const gm = new THREE.MeshPhysicalMaterial({ color: 0xe8f2f6, roughness: 0.06, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    G3.add(g, new THREE.CylinderGeometry(52, 44, 130, 14, 1, true), gm, 0, 65, 0);
    G3.add(g, new THREE.CylinderGeometry(44, 44, 10, 14), gm, 0, 5, 0);
    const j = G3.add(g, new THREE.CylinderGeometry(48, 44, 1, 12),
      new THREE.MeshPhysicalMaterial({ color: 0xf0c0c0, roughness: 0.25, transparent: true, opacity: 0.9 }), 0, 12, 0);
    j.visible = false;
    g.userData.juice = j;
    g.userData.fill = 0;
    glassG.add(g);
    glasses.push(g);
    window.__pts.glass = g;
    return g;
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
    for (const f of fruits) {
      if (f.state === 'table' && near(f.g, 90)) {
        dragObj = f;
        dragId = e.pointerId;
        S.plip(1.1 + Math.random() * 0.4);
        return;
      }
    }
    if (near(btn, 85)) {
      pressing = true;
      dragId = e.pointerId;
      S.clickReal(0.8);
      return;
    }
    if (near(lid, 190, 20)) {
      lidOn = !lidOn;
      S.kachi();
      return;
    }
    if (near(jarG, 200, 200)) {
      /* ジャーをつかんで注ぐ */
      if (liquid > 0.05 && spinV < 1) {
        dragObj = 'jar';
        dragId = e.pointerId;
        S.plip(1.4);
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj && dragObj !== true) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (430 - o.y) / d.y;
      if (t > 0) {
        const p = new THREE.Vector3(o.x + d.x * t, 430, o.z + d.z * t);
        if (dragObj === 'jar') {
          jarG.position.set(p.x, Math.max(280, p.y - 100), p.z);
          /* コップの上にいるかはポインタのレイで判定 (視差の影響なし) */
          const gv = new THREE.Vector3();
          glasses[glasses.length - 1].getWorldPosition(gv);
          gv.y += 90;
          jarG.userData.nearGlass = ray.ray.distanceToPoint(gv) < 200;
          jarG.rotation.z = jarG.userData.nearGlass ? 1.5 : 0;
        } else {
          dragObj.g.position.copy(p);
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.78, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (pressing) pressing = false;
      if (dragObj === 'jar') {
        jarG.rotation.z = 0;
        jarG.position.set(JAR_X, 240, JAR_Z - 20);
      } else if (dragObj) {
        const f = dragObj;
        const p = groundPoint(f.g.position, 560);
        if (!lidOn && Math.hypot(p.x - JAR_X, p.z - (JAR_Z - 20)) < 200) {
          f.state = 'jar';
          inJar.push(f);
          f.g.position.set(JAR_X + (Math.random() - 0.5) * 120, 300 + inJar.length * 46, JAR_Z - 20 + (Math.random() - 0.5) * 80);
          S.thunk();
        } else {
          f.g.position.copy(f.home);
        }
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

    /* フタの見た目 */
    lid.visible = true;
    lid.position.y = lidOn ? 355 : 430;
    lid.position.x = lidOn ? 0 : 260;

    /* 回転 (ボタンをおしている間・フタと果物が必要) */
    const canSpin = pressing && lidOn && (inJar.length > 0 || liquid > 0.05);
    spinV += ((canSpin ? 26 : 0) - spinV) * Math.min(1, dt * (canSpin ? 6 : 3));
    blades.rotation.y += spinV * dt;
    motor.rotation.y += spinV * dt;
    if (whirr) whirr.set(U.clamp(spinV / 26, 0, 1) * 0.75);

    if (canSpin && inJar.length > 0) {
      blend = Math.min(1, blend + dt * 0.22);
      /* 果物がはねて小さくなる */
      inJar.forEach(f => {
        f.ang += dt * (8 + Math.random() * 6);
        f.size = Math.max(0.12, f.size - dt * 0.3);
        const r = 60 * f.size + 20;
        f.g.position.set(
          JAR_X + Math.cos(f.ang) * r,
          300 + 40 + Math.abs(Math.sin(f.ang * 1.7)) * 130 * f.size,
          JAR_Z - 20 + Math.sin(f.ang) * r * 0.8);
        f.g.scale.setScalar(f.size);
        f.g.rotation.x += dt * 9;
        f.g.rotation.z += dt * 7;
      });
      if (Math.random() < dt * 5) S.squishReal(0.25);
      /* 液が増える・色が混ざる */
      const target = new THREE.Color(0, 0, 0);
      let tot = 0;
      inJar.forEach(f => { target.add(new THREE.Color(f.def.col)); tot++; });
      if (tot > 0) {
        target.multiplyScalar(1 / tot);
        juiceCol.lerp(target, dt * 1.2);
      }
      liquid = Math.min(1, liquid + dt * 0.18 * inJar.length * 0.5);
      /* 小さくなりきった果物は液に消える */
      inJar = inJar.filter(f => {
        if (f.size <= 0.13) {
          f.g.visible = false;
          f.state = 'gone';
          return false;
        }
        return true;
      });
    }

    /* 注ぐ */
    if (dragObj === 'jar' && jarG.rotation.z > 1 && liquid > 0.02) {
      const glass = glasses[glasses.length - 1];
      if (jarG.userData.nearGlass) {
        liquid = Math.max(0, liquid - dt * 0.4);
        glass.userData.fill = Math.min(1, glass.userData.fill + dt * 0.5);
        glass.userData.juice.material.color.copy(juiceCol);
        glass.userData.smooth = blend;
        pourT += dt;
        if (pourT > 0.35) { pourT = 0; S.glug(); }
        if (glass.userData.fill >= 1 && !glass.userData.did) {
          glass.userData.did = true;
          S.yay();
          mkGlass();
        }
      }
    }

    /* 液の見た目 (回転中は渦で盛り上がる・ツブツブ感) */
    juice.visible = liquid > 0.02;
    const h = liquid * 240;
    juice.scale.y = Math.max(1, h);
    juice.position.y = 30 + h / 2;
    juice.material.color.copy(juiceCol);
    juice.material.roughness = 0.55 - blend * 0.35;
    juice.scale.x = juice.scale.z = 1 + (spinV > 4 ? Math.sin(time * 20) * 0.03 : 0);
    glasses.forEach(g => {
      const f = g.userData.fill;
      g.userData.juice.visible = f > 0.02;
      g.userData.juice.scale.y = Math.max(1, f * 105);
      g.userData.juice.position.y = 12 + f * 52;
    });

    if (window.__dbgMX) window.__dbgMX({
      inJar: inJar.length, lid: lidOn, blend: +blend.toFixed(2),
      liquid: +liquid.toFixed(2), spin: +spinV.toFixed(1),
      col: juiceCol.getHexString(),
      glass: +(glasses[glasses.length - 1].userData.fill || 0).toFixed(2),
      glasses: glasses.filter(g => g.userData.did).length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      inJar = []; lidOn = false; blend = 0; liquid = 0; spinV = 0; pourT = 0;
      juiceCol = new THREE.Color(0xf0d0c0);
      dragObj = null; dragId = null; pressing = false; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 320, 80),
        radius: 1250, radiusPortraitBase: 1550, radiusMaxPortrait: 2500,
        az: 0.12, po: 1.05,
      });
      build();
      whirr = S.whirrLoop();
      whirr.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: 果物 → もう1つ → フタ → ボタン長おし → ジャーをコップへ */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.fruit0, to: () => new THREE.Vector3(JAR_X, 430, JAR_Z - 20),
          when: () => inJar.length === 0 && !lidOn && liquid < 0.05,
          done: () => inJar.length >= 1,
        },
        {
          kind: 'drag', at: () => window.__pts.fruit1, to: () => new THREE.Vector3(JAR_X, 430, JAR_Z - 20),
          when: () => inJar.length === 1 && !lidOn,
          done: () => inJar.length >= 2,
        },
        {
          kind: 'tap', at: () => lid,
          when: () => inJar.length >= 2 && !lidOn,
          done: () => lidOn,
        },
        {
          kind: 'hold', at: () => btn,
          when: () => inJar.length > 0 && lidOn,
          done: () => liquid > 0.4 && inJar.length === 0,
        },
        {
          kind: 'tap', at: () => lid,
          when: () => liquid > 0.4 && inJar.length === 0 && lidOn && spinV < 1,
          done: () => !lidOn,
        },
        {
          kind: 'drag', at: () => jarG, to: () => glasses[glasses.length - 1],
          when: () => liquid > 0.3 && !lidOn && spinV < 1,
          done: () => glasses.some(g => g.userData.did),
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
