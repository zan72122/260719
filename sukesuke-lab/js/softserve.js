/* ソフトクリームマシン — 写実3D (断面)
 *
 * お店の人しかさわれないレバーを自分で引ける。
 * 連鎖: ホッパーのミックス → 冷却シリンダー (かきとり羽根が回っている) →
 *       レバーを下げるとノズルからにゅるにゅる出てくる →
 *       コーンを自分で動かして受ける → 動かしかたがそのまま形になる →
 *       スプリンクルをかけて → スタンドにかざる
 * 分岐: コーンの動かしかた (回す速さ×中心からのずれ×高さ) が無限の形をつくる。
 *       出しすぎるとコーンからたれる。作ったソフトはスタンドに残る。
 */
window.GAMES.softserve = (() => {
  const NOZZLE = new THREE.Vector3(0, 560, 230);
  const MAX_BLOB = 130;

  let stage3, scene, raf, prev, time;
  let bodyG, hopperMix, dasher, leverG, coneG, creamG, blobs, standG, shaker;
  let pulling, dragMode, dragId, orbitId, orbitFrom;
  let blobCount, mixLevel, coneAngle, conePrev, doneCones, overflow;
  let whirr, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#f0e0d0', '#f6ece0', '#c8b0a0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb0a08c, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1100, intensity: 0.95 });

    /* カウンター */
    G3.add(scene, new THREE.BoxGeometry(1300, 260, 700),
      new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.55 }), 0, 130 - 130, -80).receiveShadow = true;

    /* --- 本体 (手前半分は断面) --- */
    bodyG = new THREE.Group();
    bodyG.position.set(0, 0, -120);
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.3, clearcoat: 0.5 });
    G3.add(bodyG, new THREE.BoxGeometry(520, 620, 300), shellM, 0, 570, -160).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(520, 300, 200), shellM, 0, 410, 40).castShadow = true;

    /* ホッパー (上・ミックスの水面が見える) */
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xe8f0f4, roughness: 0.05, transmission: 0.88, thickness: 8, transparent: true, opacity: 0.4,
    });
    G3.add(bodyG, new THREE.CylinderGeometry(130, 110, 200, 20, 1, true), glassM, 0, 970, -160);
    hopperMix = G3.add(bodyG, new THREE.CylinderGeometry(124, 108, 160, 20),
      new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.4 }), 0, 950, -160);
    /* パイプ */
    G3.add(bodyG, new THREE.CylinderGeometry(26, 26, 220, 12), mats.steel, 0, 770, -160);

    /* 冷却シリンダー (断面: 中のかきとり羽根が見える) */
    const cylM = new THREE.MeshStandardMaterial({ color: 0x8a929a, metalness: 0.85, roughness: 0.3 });
    const half = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 340, 22, 1, true, Math.PI * 0.9, Math.PI * 1.2), cylM);
    half.rotation.z = Math.PI / 2;
    half.position.set(0, 560, 40);
    bodyG.add(half);
    const inner = G3.add(bodyG, new THREE.CylinderGeometry(72, 72, 330, 18),
      new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.5 }), 0, 560, 40);
    inner.rotation.z = Math.PI / 2;
    dasher = new THREE.Group();
    dasher.position.set(0, 560, 40);
    dasher.rotation.z = Math.PI / 2;
    bodyG.add(dasher);
    const helix = new THREE.Mesh(
      new THREE.TubeGeometry(new G3.Helix(-150, 300, 5, 58), 100, 9, 8, false),
      mats.chrome);
    dasher.add(helix);

    /* ノズルとレバー */
    G3.add(scene, new THREE.CylinderGeometry(36, 22, 90, 8), mats.chrome, NOZZLE.x, NOZZLE.y + 30, NOZZLE.z).castShadow = true;
    leverG = new THREE.Group();
    leverG.position.set(0, 660, 260);
    scene.add(leverG);
    const lv = G3.add(leverG, new THREE.BoxGeometry(26, 130, 24), mats.darkPlastic, 0, -20, 30);
    lv.rotation.x = 0.3;
    lv.castShadow = true;
    G3.add(leverG, new THREE.SphereGeometry(22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc84050, roughness: 0.4 }), 0, -80, 60);
    window.__pts.lever = leverG;

    /* --- コーン (ドラッグで動かす) --- */
    coneG = new THREE.Group();
    coneG.position.set(0, 330, 230);
    scene.add(coneG);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(52, 150, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8a05a, roughness: 0.75 }));
    cone.rotation.x = Math.PI;
    cone.position.y = -75;
    cone.castShadow = true;
    coneG.add(cone);
    creamG = new THREE.Group();
    coneG.add(creamG);
    window.__pts.cone = coneG;

    /* クリームのインスタンス */
    blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfaf4e6, roughness: 0.55 }), MAX_BLOB);
    blobs.frustumCulled = false;
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    creamG.add(blobs);
    hideBlobsFrom(0);

    /* --- スプリンクル --- */
    shaker = new THREE.Group();
    shaker.position.set(-360, 320, 260);
    scene.add(shaker);
    G3.add(shaker, new THREE.CylinderGeometry(34, 34, 100, 12), glassM, 0, 0, 0);
    G3.add(shaker, new THREE.CylinderGeometry(35, 35, 20, 12), mats.chrome, 0, 56, 0);
    G3.add(shaker, new THREE.CylinderGeometry(30, 30, 50, 12),
      new THREE.MeshStandardMaterial({ color: 0xe86a8a, roughness: 0.5 }), 0, -20, 0);
    window.__pts.shaker = shaker;

    /* --- できあがりスタンド --- */
    standG = new THREE.Group();
    standG.position.set(430, 260, 220);
    scene.add(standG);
    G3.add(standG, new THREE.BoxGeometry(260, 30, 160),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.6 }), 0, 0, 0).castShadow = true;
    for (let i = 0; i < 4; i++) {
      G3.add(standG, new THREE.CylinderGeometry(40, 34, 40, 10, 1, true),
        mats.chrome, -90 + (i % 2) * 180, 35, -40 + Math.floor(i / 2) * 80);
    }
    window.__pts.stand = standG;
    doneCones = [];
  }

  function hideBlobsFrom(n) {
    const d = new THREE.Object3D();
    d.scale.setScalar(0.0001);
    d.updateMatrix();
    for (let i = n; i < MAX_BLOB; i++) blobs.setMatrixAt(i, d.matrix);
    blobs.instanceMatrix.needsUpdate = true;
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
    if (near(leverG, 110, -60)) {
      pulling = true;
      dragId = e.pointerId;
      dragMode = 'lever';
      S.clickReal(0.7);
      return;
    }
    if (near(coneG, 130, -40)) {
      dragMode = 'cone';
      dragId = e.pointerId;
      return;
    }
    if (near(shaker, 90)) {
      /* スプリンクルをふりかける */
      if (blobCount > 3) {
        sprinkleTop();
        S.ratchet(0.5);
      } else {
        S.buzz();
      }
      return;
    }
    if (near(standG, 170, 40)) {
      /* できたソフトをスタンドへ */
      if (blobCount > 5) finishCone();
      else S.buzz();
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function sprinkleTop() {
    /* いちばん上のブロブ付近に色つぶ */
    let topY = -1e9, tx = 0, tz = 0;
    creamG.userData.pts.forEach(p => {
      if (p.y > topY) { topY = p.y; tx = p.x; tz = p.z; }
    });
    const cols = [0xe84a5a, 0x4a9ad8, 0x50c060, 0xe8c040, 0xa86ad8];
    for (let i = 0; i < 10; i++) {
      const s = G3.add(creamG, new THREE.SphereGeometry(5, 6, 4),
        new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.4 }),
        tx + (Math.random() - 0.5) * 60, topY + 14 + Math.random() * 14, tz + (Math.random() - 0.5) * 60);
      s.userData.sprinkle = true;
    }
  }

  function finishCone() {
    /* いまのソフトをスタンドの空きへ移す */
    const slot = doneCones.length % 4;
    const done = coneG;
    done.userData.done = true;
    done.position.set(430 + (-90 + (slot % 2) * 180), 300, 220 + (-40 + Math.floor(slot / 2) * 80));
    if (doneCones[slot]) scene.remove(doneCones[slot]);
    doneCones[slot] = done;
    window.__pts['done' + slot] = done;
    S.ding();
    /* あたらしいコーンを用意 (ブロブは作りなおし) */
    buildFreshCone();
  }

  function buildFreshCone() {
    coneG = new THREE.Group();
    coneG.position.set(0, 330, 230);
    scene.add(coneG);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(52, 150, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8a05a, roughness: 0.75 }));
    cone.rotation.x = Math.PI;
    cone.position.y = -75;
    cone.castShadow = true;
    coneG.add(cone);
    creamG = new THREE.Group();
    coneG.add(creamG);
    blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfaf4e6, roughness: 0.55 }), MAX_BLOB);
    blobs.frustumCulled = false;
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    creamG.add(blobs);
    creamG.userData.pts = [];
    blobCount = 0;
    overflow = 0;
    window.__pts.cone = coneG;
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'cone') {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (330 - o.y) / d.y;
        if (t > 0) {
          const nx = U.clamp(o.x + d.x * t, -240, 470);
          const nz = U.clamp(o.z + d.z * t, 100, 420);
          conePrev.copy(coneG.position);
          coneG.position.x = nx;
          coneG.position.z = nz;
          /* まわす操作: ノズル中心のまわりの角度変化を追う */
          const a1 = Math.atan2(conePrev.z - NOZZLE.z, conePrev.x - NOZZLE.x);
          const a2 = Math.atan2(nz - NOZZLE.z, nx - NOZZLE.x);
          let da = a2 - a1;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          coneAngle += da;
          coneG.rotation.y = coneAngle;
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'lever') pulling = false;
      if (dragMode === 'cone' && coneG.position.x > 330 && blobCount > 5) finishCone();
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

    /* レバーとかきとり羽根 */
    leverG.rotation.x = pulling ? 0.55 : 0;
    dasher.rotation.x += (pulling ? 6 : 1.2) * dt;
    if (whirr) whirr.set(pulling ? 0.55 : 0.15);

    /* 押出し: レバーを引いているあいだ、ノズル直下の位置 (コーンローカル) にブロブを積む */
    if (pulling && mixLevel > 0.02 && blobCount < MAX_BLOB) {
      creamG.userData.emitT = (creamG.userData.emitT || 0) + dt;
      if (creamG.userData.emitT > 0.07) {
        creamG.userData.emitT = 0;
        /* ノズル位置をコーンのローカルへ */
        const local = coneG.worldToLocal(new THREE.Vector3(NOZZLE.x, NOZZLE.y - 60, NOZZLE.z));
        /* コーンの上にたまった高さぶん、下から積む */
        const h = Math.min(210, blobCount * 4.5);
        local.y = 10 + h * 0.55;
        const r = Math.hypot(local.x, local.z);
        if (r > 60) {
          /* コーンから外れている: たれる */
          overflow += 1;
          local.y = -40;
          S.squishReal(0.25);
        }
        creamG.userData.pts.push({ x: local.x, y: local.y, z: local.z });
        blobCount++;
        mixLevel = Math.max(0, mixLevel - 0.004);
        S.squishReal(0.12);
        /* 描画 */
        const d = new THREE.Object3D();
        creamG.userData.pts.forEach((p, i) => {
          d.position.set(p.x, p.y, p.z);
          d.scale.setScalar(1 - Math.min(0.5, i * 0.002));
          d.updateMatrix();
          blobs.setMatrixAt(i, d.matrix);
        });
        blobs.instanceMatrix.needsUpdate = true;
      }
    }

    /* ホッパーのミックス水面 */
    hopperMix.scale.y = Math.max(0.05, mixLevel);
    hopperMix.position.y = 950 - (1 - Math.max(0.05, mixLevel)) * 80;

    if (window.__dbgSS) window.__dbgSS({
      pulling, blobs: blobCount, mix: +mixLevel.toFixed(2),
      overflow, done: doneCones.filter(Boolean).length,
      cone: [coneG.position.x | 0, coneG.position.z | 0],
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      pulling = false; blobCount = 0; mixLevel = 1; coneAngle = 0; overflow = 0;
      conePrev = new THREE.Vector3();
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 470, 60),
        radius: 1500, radiusPortraitBase: 1800, radiusMaxPortrait: 2900,
        az: 0.15, po: 1.12,
      });
      build();
      creamG.userData.pts = [];
      whirr = S.whirrLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: レバーを引く → コーンをまわす → スタンドへ */
      GUIDE.start(stage3, [
        { kind: 'hold', at: () => leverG, done: () => blobCount > 4 },
        {
          kind: 'turn', at: () => coneG, turnDir: 1,
          when: () => blobCount > 4, done: () => Math.abs(coneAngle) > 2.5,
        },
        {
          kind: 'drag', at: () => coneG, to: () => standG,
          when: () => blobCount > 20, done: () => doneCones.filter(Boolean).length > 0,
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
