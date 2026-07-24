/* ショベルカー — 写実3D (断面)
 *
 * 工事現場で毎日見上げる憧れの機械を、自分の手で動かす。
 * ブームとアームの油圧シリンダーが実際に伸び縮みするのが見える。
 * 連鎖: レバー1でブームが上下 → レバー2でアームが曲がる → バケットの先が
 *       土の山を通ると土がすくえる → トラックの荷台の上でタップ → ザーッと積む →
 *       いっぱいになったらトラックが運んで行ってもどってくる
 * 分岐: 2本のレバーの操作 × キャタピラで前後移動 × どこをどれだけ掘るか。
 *       土の山は掘ったぶんだけ本当に減り、形が変わり続ける。
 */
window.GAMES.excavator = (() => {
  const N_COL = 14;          /* 土の山の柱の数 */
  const COL_W = 40;
  const DIRT_X0 = 40;

  let stage3, scene, raf, prev, time;
  let baseG, houseG, boomG, armG, bucketG, bucketDirt, tracksWheels;
  let cylBoom, cylArm, dirtCols, dirtH, truckG, truckDirt, truckLoad, truckAnim;
  let lever1G, lever2G, beta, gamma, baseX, load;
  let dragMode, dragId, orbitId, orbitFrom;
  let rumble, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#b8d0e0', '#d8e4ec', '#8aa4b8');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0xb09a72, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 2000, 1400), shadowSpan: 1400, intensity: 1 });

    /* 工事現場の飾り: カラーコーンとフェンス */
    for (let i = 0; i < 4; i++) {
      G3.add(scene, new THREE.ConeGeometry(30, 80, 10),
        new THREE.MeshStandardMaterial({ color: 0xe86020, roughness: 0.5 }), -650 + i * 120, 40, 480);
    }
    for (let i = 0; i < 5; i++) {
      G3.add(scene, new THREE.BoxGeometry(200, 120, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, transparent: true, opacity: 0.8 }),
        -600 + i * 220, 60, -560);
    }

    /* --- ショベルカー --- */
    baseG = new THREE.Group();
    scene.add(baseG);
    /* キャタピラ */
    const trackM = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.8 });
    G3.add(baseG, new THREE.BoxGeometry(320, 90, 90), trackM, 0, 60, -95).castShadow = true;
    G3.add(baseG, new THREE.BoxGeometry(320, 90, 90), trackM, 0, 60, 95).castShadow = true;
    tracksWheels = [];
    [-1, 1].forEach(s => {
      for (let i = 0; i < 4; i++) {
        const w = G3.add(baseG, new THREE.CylinderGeometry(32, 32, 96, 12), mats.steel, -120 + i * 80, 50, s * 95);
        w.rotation.x = Math.PI / 2;
        tracksWheels.push(w);
      }
    });
    /* 旋回体 (キャブ + エンジン) */
    houseG = new THREE.Group();
    houseG.position.y = 130;
    baseG.add(houseG);
    const bodyM = new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.35, clearcoat: 0.5 });
    G3.add(houseG, new THREE.BoxGeometry(360, 130, 220), bodyM, -40, 70, 0).castShadow = true;
    /* キャブ (ガラス) */
    G3.add(houseG, new THREE.BoxGeometry(140, 160, 130), bodyM, 60, 210, -40).castShadow = true;
    G3.add(houseG, new THREE.BoxGeometry(110, 100, 110),
      new THREE.MeshPhysicalMaterial({ color: 0xa8c8d8, roughness: 0.1, transparent: true, opacity: 0.5 }),
      60, 230, -40);
    /* カウンターウェイト */
    G3.add(houseG, new THREE.BoxGeometry(120, 110, 200),
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6 }), -190, 70, 0).castShadow = true;

    /* --- ブーム・アーム・バケット --- */
    boomG = new THREE.Group();
    boomG.position.set(90, 200, 40);
    houseG.add(boomG);
    const boomM = new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.4, clearcoat: 0.4 });
    const boomBar = G3.add(boomG, new THREE.BoxGeometry(420, 70, 56), boomM, 210, 0, 0);
    boomBar.castShadow = true;
    armG = new THREE.Group();
    armG.position.set(420, 0, 0);
    boomG.add(armG);
    const armBar = G3.add(armG, new THREE.BoxGeometry(330, 50, 44), boomM, 165, 0, 0);
    armBar.castShadow = true;
    bucketG = new THREE.Group();
    bucketG.position.set(330, 0, 0);
    armG.add(bucketG);
    /* バケット (すくう口があいた箱) */
    const bkM = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
    G3.add(bucketG, new THREE.BoxGeometry(110, 14, 120), bkM, 55, -60, 0).castShadow = true;
    G3.add(bucketG, new THREE.BoxGeometry(14, 70, 120), bkM, 8, -30, 0);
    G3.add(bucketG, new THREE.BoxGeometry(110, 70, 12), bkM, 55, -30, -55);
    G3.add(bucketG, new THREE.BoxGeometry(110, 70, 12), bkM, 55, -30, 55);
    /* 爪 */
    for (let i = 0; i < 4; i++) {
      G3.add(bucketG, new THREE.ConeGeometry(9, 30, 4), bkM, 115, -62, -45 + i * 30).rotation.z = -1.2;
    }
    bucketDirt = G3.add(bucketG, new THREE.SphereGeometry(46, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a6f46, roughness: 0.95 }), 55, -34, 0);
    bucketDirt.scale.setScalar(0.01);
    window.__pts.bucket = bucketG;

    /* 油圧シリンダー (ブーム用・アーム用): barrel + rod を毎フレーム張る */
    const mkCyl = () => {
      const barrel = G3.add(scene, new THREE.CylinderGeometry(20, 20, 10, 10), mats.steel, 0, 0, 0);
      const rod = G3.add(scene, new THREE.CylinderGeometry(10, 10, 10, 8), mats.chrome, 0, 0, 0);
      barrel.castShadow = true;
      return { barrel, rod };
    };
    cylBoom = mkCyl();
    cylArm = mkCyl();

    /* --- 土の山 --- */
    dirtCols = [];
    dirtH = [];
    const dirtM = new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 0.95 });
    for (let i = 0; i < N_COL; i++) {
      const x = DIRT_X0 + i * COL_W;
      const h = Math.max(0, 200 * Math.exp(-Math.pow((x - 330) / 190, 2)));
      dirtH.push(h);
      const c = G3.add(scene, new THREE.BoxGeometry(COL_W, 1, 260), dirtM, x, 0, 0);
      c.castShadow = true;
      dirtCols.push(c);
    }

    /* --- トラック --- */
    truckG = new THREE.Group();
    truckG.position.set(660, 0, 0);
    scene.add(truckG);
    const tBodyM = new THREE.MeshPhysicalMaterial({ color: 0x3a6ad8, roughness: 0.35, clearcoat: 0.5 });
    G3.add(truckG, new THREE.BoxGeometry(130, 130, 180), tBodyM, 155, 130, 0).castShadow = true;
    G3.add(truckG, new THREE.BoxGeometry(90, 70, 160),
      new THREE.MeshPhysicalMaterial({ color: 0xa8c8d8, roughness: 0.1, transparent: true, opacity: 0.5 }),
      140, 220, 0);
    /* 荷台 */
    const bedM = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    G3.add(truckG, new THREE.BoxGeometry(240, 16, 190), bedM, -60, 90, 0);
    G3.add(truckG, new THREE.BoxGeometry(240, 80, 12), bedM, -60, 135, -95);
    G3.add(truckG, new THREE.BoxGeometry(240, 80, 12), bedM, -60, 135, 95);
    G3.add(truckG, new THREE.BoxGeometry(12, 80, 190), bedM, -180, 135, 0);
    G3.add(truckG, new THREE.BoxGeometry(12, 80, 190), bedM, 60, 135, 0);
    [[-130], [-10], [130]].forEach(([x]) => {
      const w = G3.add(truckG, new THREE.CylinderGeometry(40, 40, 30, 14), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), x, 42, -95);
      w.rotation.x = Math.PI / 2;
      const w2 = w.clone();
      w2.position.z = 95;
      truckG.add(w2);
    });
    truckDirt = G3.add(truckG, new THREE.BoxGeometry(220, 60, 170),
      new THREE.MeshStandardMaterial({ color: 0x8a6f46, roughness: 0.95 }), -60, 120, 0);
    truckDirt.scale.y = 0.01;
    window.__pts.truck = truckG;

    /* --- レバー2本 --- */
    const consM = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.45 });
    G3.add(scene, new THREE.BoxGeometry(260, 110, 90), consM, -420, 55, 400).castShadow = true;
    const mkLever = (x, col) => {
      const g = new THREE.Group();
      g.position.set(x, 110, 400);
      scene.add(g);
      G3.add(g, new THREE.BoxGeometry(14, 100, 12), mats.steel, 0, 40, 0);
      G3.add(g, new THREE.SphereGeometry(18, 12, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }), 0, 92, 0);
      return g;
    };
    lever1G = mkLever(-480, 0xd84a3a);
    lever2G = mkLever(-360, 0x3a6ad8);
    window.__pts.lever1 = lever1G;
    window.__pts.lever2 = lever2G;
  }

  function groundH(x) {
    const i = Math.round((x - DIRT_X0) / COL_W);
    if (i < 0 || i >= N_COL) return 0;
    return dirtH[i];
  }

  function digAt(x, depth) {
    const i = Math.round((x - DIRT_X0) / COL_W);
    if (i < 0 || i >= N_COL) return 0;
    const take = Math.min(dirtH[i], depth);
    dirtH[i] -= take;
    /* まわりも少しくずれる */
    if (i > 0) dirtH[i - 1] = Math.max(0, dirtH[i - 1] - take * 0.3);
    if (i < N_COL - 1) dirtH[i + 1] = Math.max(0, dirtH[i + 1] - take * 0.3);
    return take;
  }

  function tipWorld() {
    const v = new THREE.Vector3(110, -55, 0);
    bucketG.localToWorld(v);
    return v;
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
    if (near(lever1G, 90, 60)) {
      dragMode = 'l1';
      dragId = e.pointerId;
      lever1G.userData.d = { y0: e.clientY, v0: beta };
      return;
    }
    if (near(lever2G, 90, 60)) {
      dragMode = 'l2';
      dragId = e.pointerId;
      lever2G.userData.d = { y0: e.clientY, v0: gamma };
      return;
    }
    if (near(bucketG, 150)) {
      /* バケットをタップ → 積み下ろし */
      if (load > 0.05) {
        const tip = tipWorld();
        const overTruck = truckAnim === 0 && Math.abs(tip.x - (truckG.position.x - 60)) < 150 && Math.abs(tip.z) < 140;
        if (overTruck) {
          truckLoad = Math.min(1, truckLoad + load * 0.34);
          S.squishReal(0.8);
          S.thunk();
        } else {
          /* 地面にもどす */
          const i = Math.round((tip.x - DIRT_X0) / COL_W);
          if (i >= 0 && i < N_COL) dirtH[i] = Math.min(240, dirtH[i] + load * 120);
          S.squishReal(0.5);
        }
        load = 0;
      }
      return;
    }
    if (near(baseG, 260, 100)) {
      dragMode = 'drive';
      dragId = e.pointerId;
      baseG.userData.d = { x0: e.clientX, v0: baseX };
      return;
    }
    if (truckLoad > 0.9 && near(truckG, 260, 120)) {
      if (truckAnim === 0) {
        truckAnim = 0.001;
        S.whoosh(0.6);
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
      if (dragMode === 'l1' && lever1G.userData.d) {
        const d = lever1G.userData.d;
        beta = U.clamp(d.v0 + (d.y0 - e.clientY) / 260, 0.12, 1.0);
      } else if (dragMode === 'l2' && lever2G.userData.d) {
        const d = lever2G.userData.d;
        gamma = U.clamp(d.v0 + (d.y0 - e.clientY) / 220, 1.05, 2.7);
      } else if (dragMode === 'drive' && baseG.userData.d) {
        const d = baseG.userData.d;
        baseX = U.clamp(d.v0 + (e.clientX - d.x0) * 1.6, -430, -80);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
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

    /* 位置と姿勢 */
    const prevX = baseG.position.x;
    baseG.position.x += (baseX - baseG.position.x) * Math.min(1, dt * 4);
    const drove = Math.abs(baseG.position.x - prevX);
    tracksWheels.forEach(w => { w.rotation.z -= drove / 32; });
    boomG.rotation.z = beta;
    armG.rotation.z = -(Math.PI - gamma);
    bucketG.rotation.z = -(gamma - beta) * 0.4 - 0.5;
    if (rumble) rumble.set(0.25 + drove * 0.02 + (dragMode === 'l1' || dragMode === 'l2' ? 0.2 : 0));

    /* 油圧シリンダーを張る (ブーム: 旋回体→ブーム中腹 / アーム: ブーム中腹→アーム根元) */
    const span = (cyl, aW, bW) => {
      const mid = aW.clone().lerp(bW, 0.5);
      const len = aW.distanceTo(bW);
      const dir = bW.clone().sub(aW).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cyl.barrel.position.copy(aW.clone().lerp(bW, 0.3));
      cyl.barrel.quaternion.copy(quat);
      cyl.barrel.scale.set(1, len * 0.05, 1);
      cyl.rod.position.copy(mid.clone().lerp(bW, 0.5));
      cyl.rod.quaternion.copy(quat);
      cyl.rod.scale.set(1, len * 0.05, 1);
    };
    const houseAnchor = new THREE.Vector3(120, 120, 40);
    houseG.localToWorld(houseAnchor);
    const boomMid = new THREE.Vector3(230, 30, 0);
    boomG.localToWorld(boomMid);
    span(cylBoom, houseAnchor, boomMid);
    const boomTop = new THREE.Vector3(300, 35, 0);
    boomG.localToWorld(boomTop);
    const armRoot = new THREE.Vector3(60, 25, 0);
    armG.localToWorld(armRoot);
    span(cylArm, boomTop, armRoot);

    /* すくい: バケットの先が山より低いところを通ると土が入る */
    const tip = tipWorld();
    const gh = groundH(tip.x);
    if (tip.y < gh && load < 1) {
      const take = digAt(tip.x, 100 * dt);
      if (take > 0.5) {
        load = Math.min(1, load + take / 260);
        if (Math.random() < dt * 8) S.squishReal(0.3);
      }
    }
    /* バケットが地面より下には行かない見た目の補正はせずに素朴に */
    bucketDirt.scale.setScalar(Math.max(0.01, load));

    /* 土の柱の描画 */
    dirtCols.forEach((c, i) => {
      const h = Math.max(1, dirtH[i]);
      c.scale.y = h;
      c.position.y = h / 2;
    });

    /* トラック */
    truckDirt.scale.y = Math.max(0.01, truckLoad);
    if (truckAnim > 0) {
      truckAnim += dt;
      if (truckAnim < 2) {
        truckG.position.x = 660 + truckAnim * 700;
      } else if (truckAnim < 3.2) {
        truckLoad = 0;
      } else if (truckAnim < 5) {
        truckG.position.x = U.lerp(1360, 660, (truckAnim - 3.2) / 1.8);
      } else {
        truckAnim = 0;
        truckG.position.x = 660;
        S.ding();
      }
    }

    /* レバーの見た目 */
    lever1G.rotation.x = -(beta - 0.55) * 0.9;
    lever2G.rotation.x = -(gamma - 1.85) * 0.5;

    if (window.__dbgSH) window.__dbgSH({
      beta: +beta.toFixed(2), gamma: +gamma.toFixed(2), baseX: baseX | 0,
      load: +load.toFixed(2), truck: +truckLoad.toFixed(2), anim: +truckAnim.toFixed(1),
      tip: [tip.x | 0, tip.y | 0], dirt: dirtH.reduce((a, b) => a + b, 0) | 0,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      beta = 0.55; gamma = 1.85; baseX = -260; load = 0;
      truckLoad = 0; truckAnim = 0;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 260, 0),
        radius: 1800, radiusPortraitBase: 2500, radiusMaxPortrait: 4000,
        az: 0.15, po: 1.12,
      });
      build();
      baseG.position.x = baseX;
      rumble = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: レバー1 → レバー2で掘る → トラックへ */
      let gdDug = false, gdLoaded = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => lever1G, to: () => {
            const v = new THREE.Vector3();
            lever1G.getWorldPosition(v);
            v.y -= 140;
            return v;
          },
          done: () => beta < 0.35,
        },
        {
          /* すくいは「アームを土に通す往復」で少しずつたまる。腕を伸ばし直してから
             すくい上げる2段構え (すくいで gamma が上がるとこのステップが後戻りし、
             土が入るまで自然に往復する) */
          kind: 'drag', at: () => lever2G, to: () => {
            const v = new THREE.Vector3();
            lever2G.getWorldPosition(v);
            v.y -= 170;
            return v;
          },
          when: () => beta < 0.5,
          done: () => gdDug || gamma < 1.25,
        },
        {
          kind: 'drag', at: () => lever2G, to: () => {
            const v = new THREE.Vector3();
            lever2G.getWorldPosition(v);
            v.y += 170;
            return v;
          },
          when: () => beta < 0.5 && gamma < 1.4,
          done: () => (gdDug = gdDug || load > 0.25),
        },
        {
          kind: 'tap', at: () => bucketG,
          when: () => load > 0.25,
          done: () => (gdLoaded = gdLoaded || truckLoad > 0.05),
        },
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
