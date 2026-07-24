/* 打ち上げ花火 — 写実3D
 *
 * 一発勝負の機械。作業台で花火玉に星(色の火薬粒)を自分の手で詰める。
 * 詰めた配置がそのまま夜空で開く形になる — 同じ玉は二度と作れない。
 * 連鎖: 星詰め → フタ閉じ → 筒へ装填 → 導火線に点火 → 火花が這う →
 *       発射 → 上昇 → 時限で炸裂 → 詰めた配置どおりに星が飛ぶ → 残り火
 * 分岐: 星の位置と色 (無限) × 導火線の長さ=炸裂高度 × 風
 */
window.GAMES.hanabi = (() => {
  const COLS = [0xff5040, 0xffc040, 0x50e070, 0x5090ff, 0xc060ff];
  const BOWL = new THREE.Vector3(390, 172, 300);  // 玉の下半分 (お椀) の球心 (机の上に接地)
  const TUBE = new THREE.Vector3(-60, 0, 0);      // 打ち上げ筒
  const MAX_STARS = 44;
  const TRAIL = 5;

  let stage3, scene, raf, prev, time;
  let bowlG, lidMesh, packed, stars, dragStar, dragId, orbitId, orbitFrom;
  let fuseCurve, fuseMesh, sparkMesh, fuseEndHit, fuseLen, fuseDragId;
  let torchG, torchFlame, lidHit, trayHits;
  let phase; // 'pack' | 'loaded' | 'burning' | 'flying' | 'burst'
  let burnT, shellMesh, shellV, burstDelay, windX;
  let fx, fxState, flashLight, fuseSnd, launchGlow;
  let mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#1a2338', '#0f1626', '#05070e');

    /* 夜の野原 */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x1a2016, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    /* 月あかり */
    const key = G3.addLights(scene, {
      pos: new THREE.Vector3(-900, 1800, 900), intensity: 0.32, color: 0xbdd0ee,
      sky: 0x36415e, groundCol: 0x11150e, hemi: 0.35, shadowSpan: 900,
    });
    key.shadow.camera.far = 6000;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xf2ecd8 }));
    moon.position.set(-1400, 1900, -1800);
    scene.add(moon);

    /* --- 打ち上げ筒 --- */
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.45 });
    G3.add(scene, new THREE.CylinderGeometry(95, 95, 320, 28, 1, true), steel, TUBE.x, 160, TUBE.z);
    G3.add(scene, new THREE.CylinderGeometry(120, 130, 16, 28), steel, TUBE.x, 8, TUBE.z);
    G3.add(scene, new THREE.TorusGeometry(95, 7, 10, 28), mats.chrome, TUBE.x, 320, TUBE.z)
      .rotation.x = Math.PI / 2;

    /* 導火線: 筒の縁から垂れる。端をドラッグして長さを変える */
    fuseMesh = new THREE.Mesh(new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.9 }));
    scene.add(fuseMesh);
    fuseEndHit = new THREE.Mesh(new THREE.SphereGeometry(55, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(fuseEndHit);
    sparkMesh = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 }));
    sparkMesh.visible = false;
    scene.add(sparkMesh);
    updateFuse();

    /* --- 作業台 --- */
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4e34, roughness: 0.8 });
    G3.add(scene, new THREE.BoxGeometry(740, 36, 460), wood, 390, 42, 320);
    [[60, 140], [720, 140], [60, 500], [720, 500]].forEach(([x, z]) => {
      G3.add(scene, new THREE.CylinderGeometry(14, 14, 60, 10), wood, x, 12, z);
    });

    /* 玉の下半分 (お椀) */
    bowlG = new THREE.Group();
    bowlG.position.copy(BOWL);
    scene.add(bowlG);
    const paper = new THREE.MeshStandardMaterial({
      color: 0x8a6a4a, roughness: 0.85, side: THREE.DoubleSide,
    });
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(112, 26, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), paper);
    bowl.castShadow = true;
    bowlG.add(bowl);
    /* フタ (上半分)。タップで閉じる */
    lidMesh = new THREE.Mesh(
      new THREE.SphereGeometry(112, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), paper.clone());
    lidMesh.position.set(30, 0, 620);    /* 地面の手前に伏せて置いてある */
    lidMesh.castShadow = true;
    scene.add(lidMesh);
    lidHit = new THREE.Mesh(new THREE.SphereGeometry(135, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }));
    lidHit.position.set(30, 70, 620);
    scene.add(lidHit);

    /* 星のトレイ (5色) */
    trayHits = [];
    COLS.forEach((c, i) => {
      const x = 130 + i * 105, z = 430;
      G3.add(scene, new THREE.CylinderGeometry(48, 52, 10, 18),
        new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.6 }), x, 66, z);
      const pileMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.12 });
      for (let k = 0; k < 7; k++) {
        G3.add(scene, new THREE.SphereGeometry(13, 10, 8), pileMat,
          x + Math.cos(k * 2.4) * 20, 78 + (k > 3 ? 16 : 0), z + Math.sin(k * 2.4) * 20);
      }
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 90, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 100, z);
      hit.userData.col = i;
      scene.add(hit);
      trayHits.push(hit);
    });

    /* 風向きの旗 */
    const pole = G3.add(scene, new THREE.CylinderGeometry(5, 5, 420, 8), mats.chrome, -420, 210, 340);
    pole.castShadow = true;
    fxState = { flag: new THREE.Mesh(new THREE.PlaneGeometry(120, 60),
      new THREE.MeshStandardMaterial({ color: 0xcc7733, side: THREE.DoubleSide, roughness: 0.8 })) };
    fxState.flag.position.set(-420 + 62, 390, 340);
    scene.add(fxState.flag);

    /* 点火トーチ */
    torchG = new THREE.Group();
    torchG.position.set(-220, 0, 470);
    scene.add(torchG);
    G3.add(torchG, new THREE.CylinderGeometry(10, 12, 160, 10), mats.brass, 0, 80, 0);
    torchFlame = new THREE.Mesh(new THREE.ConeGeometry(16, 44, 10),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 }));
    torchFlame.position.y = 185;
    torchFlame.visible = false;
    torchG.add(torchFlame);
    const torchHit = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 240, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    torchHit.position.y = 110;
    torchG.add(torchHit);
    torchG.userData.hit = torchHit;

    /* 打ち上げ玉と星のインスタンス */
    shellMesh = new THREE.Mesh(new THREE.SphereGeometry(60, 14, 10), paper.clone());
    shellMesh.visible = false;
    scene.add(shellMesh);
    launchGlow = new THREE.Mesh(new THREE.SphereGeometry(16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc77 }));
    launchGlow.visible = false;
    scene.add(launchGlow);

    const starGeo = new THREE.SphereGeometry(9, 6, 5);
    stars = new THREE.InstancedMesh(starGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
      MAX_STARS * (1 + TRAIL));
    stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stars.frustumCulled = false;
    stars.visible = false;
    scene.add(stars);

    flashLight = new THREE.PointLight(0xfff2cc, 0, 5000);
    scene.add(flashLight);
    fx = { bursts: [] };
  }

  /* 導火線カーブ: 筒の縁 → 外側へ垂れて端が下がる */
  function updateFuse() {
    const top = new THREE.Vector3(TUBE.x + 95, 320, TUBE.z + 40);
    const end = new THREE.Vector3(TUBE.x + 150 + fuseLen * 130, 320 - fuseLen * 240, TUBE.z + 90);
    fuseCurve = new THREE.CatmullRomCurve3([
      top,
      new THREE.Vector3(TUBE.x + 130, 300 - fuseLen * 60, TUBE.z + 70),
      end,
    ]);
    const geo = new THREE.TubeGeometry(fuseCurve, 24, 4.5, 6, false);
    fuseMesh.geometry.dispose();
    fuseMesh.geometry = geo;
    fuseEndHit.position.copy(end);
  }

  /* ---------------- 入力 ---------------- */

  function planePoint(ray, y) {
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = (y - o.y) / d.y;
    return t > 0 ? new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t) : null;
  }

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (window.__dbgDown) window.__dbgDown(e.clientX, e.clientY, ray.intersectObjects(trayHits, false).length, phase);

    if (phase === 'pack') {
      /* トレイから星をつまむ */
      for (const h of trayHits) {
        if (ray.intersectObject(h, false).length) {
          const col = COLS[h.userData.col];
          const m = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 10),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.15 }));
          scene.add(m);
          dragStar = { m, col: h.userData.col };
          dragId = e.pointerId;
          S.ratchet(0.6);
          return;
        }
      }
      /* フタを閉じる (星が1個以上) */
      if (packed.length > 0 && ray.intersectObject(lidHit, false).length) {
        closeAndLoad();
        return;
      }
      /* 導火線の長さ調整 */
      if (ray.intersectObject(fuseEndHit, false).length) {
        fuseDragId = e.pointerId;
        return;
      }
    }
    if (phase === 'loaded') {
      if (ray.intersectObject(fuseEndHit, false).length) {
        fuseDragId = e.pointerId;
        return;
      }
      /* トーチで点火 */
      if (ray.intersectObject(torchG.userData.hit, false).length) {
        torchFlame.visible = true;
        phase = 'burning';
        burnT = 0;
        fuseSnd = S.fuseLoop();
        fuseSnd.set(0.8);
        sparkMesh.visible = true;
        S.clickReal(0.6);
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragStar) {
      const p = planePoint(stage3.setRay(e), BOWL.y + 30);
      if (p) dragStar.m.position.copy(p);
    } else if (e.pointerId === fuseDragId) {
      const p = planePoint(stage3.setRay(e), 120);
      if (p) fuseLen = U.clamp((p.x - TUBE.x - 150) / 130, 0.15, 1.5);
      updateFuse();
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.2);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragStar) {
      dragId = null;
      const p = dragStar.m.position;
      const dx = p.x - BOWL.x, dz = p.z - BOWL.z;
      const rd = Math.hypot(dx, dz);
      if (window.__dbgDrop) window.__dbgDrop(p.x, p.z, rd);
      if (rd < 100 && packed.length < MAX_STARS) {
        /* お椀の内面に詰まる。近くに積むほど高く盛れる */
        const near = packed.filter(q => Math.hypot(q.lx - dx, q.lz - dz) < 34).length;
        const surfY = BOWL.y - Math.sqrt(Math.max(0, 112 * 112 - rd * rd));
        const y = surfY + 15 + near * 21;
        dragStar.m.position.set(BOWL.x + dx, y, BOWL.z + dz);
        packed.push({ m: dragStar.m, lx: dx, ly: y - BOWL.y, lz: dz, col: dragStar.col });
        S.plip(1.3);
      } else {
        scene.remove(dragStar.m);
        dragStar.m.geometry.dispose();
        dragStar.m.material.dispose();
      }
      dragStar = null;
    } else if (e.pointerId === fuseDragId) {
      fuseDragId = null;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* フタを閉じて筒へ装填 */
  function closeAndLoad() {
    phase = 'loaded';
    S.thunk();
    lidMesh.position.copy(BOWL);
    /* 玉が筒へ (見た目はシンプルに: 星とお椀を隠して筒の中へ) */
    packed.forEach(q => { q.m.visible = false; });
    bowlG.visible = false;
    lidMesh.visible = false;
    S.glug();
  }

  /* 発射 */
  function launch() {
    phase = 'flying';
    if (fuseSnd) { fuseSnd.stop(); fuseSnd = null; }
    sparkMesh.visible = false;
    torchFlame.visible = false;
    S.boom(0.55);
    flashLight.position.set(TUBE.x, 340, TUBE.z);
    flashLight.intensity = 3;
    launchGlow.visible = true;
    launchGlow.position.set(TUBE.x, 340, TUBE.z);
    shellV = new THREE.Vector3(windX * 0.12, 1350, 0);
    burstDelay = 0.55 + fuseLen * 1.15;   /* 導火線が長いほど高く上がって開く */
    /* ヒューという上昇音 */
    S.whoosh(0.8);
  }

  /* 炸裂: 詰めた配置がそのまま飛散方向になる */
  function burst() {
    phase = 'burst';
    S.boom(1);
    S.crackleBurst(10, 0.3);
    flashLight.position.copy(launchGlow.position);
    flashLight.intensity = 6;
    stars.visible = true;
    const center = launchGlow.position.clone();
    fx.bursts = packed.map(q => {
      /* お椀の中央に詰めた星ほど真上へ、縁に詰めた星ほど横へ開く */
      const dir = new THREE.Vector3(q.lx, -q.ly - 26, q.lz);
      if (dir.length() < 5) dir.set(0, 1, 0);
      dir.normalize();
      return {
        p: center.clone(), v: dir.multiplyScalar(880).add(shellV.clone().multiplyScalar(0.25)),
        col: new THREE.Color(COLS[q.col]), life: 2.4, age: 0,
        trail: [],
      };
    });
    launchGlow.visible = false;
    /* 詰めた星の実体はもう戻らない (一発勝負) */
    packed.forEach(q => { scene.remove(q.m); q.m.geometry.dispose(); q.m.material.dispose(); });
    packed = [];
  }

  /* 新しい玉の準備 */
  function resetBench() {
    phase = 'pack';
    bowlG.visible = true;
    lidMesh.visible = true;
    lidMesh.position.set(30, 0, 620);
    shellMesh.visible = false;
    stars.visible = false;
  }

  /* ---------------- メインループ ---------------- */

  const dummy = new THREE.Object3D();

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    windX = Math.sin(time * 0.13) * 130 + Math.sin(time * 0.041) * 70;
    /* 旗が風になびく */
    fxState.flag.rotation.y = U.clamp(-windX * 0.004, -1.2, 1.2);
    fxState.flag.rotation.z = Math.sin(time * 6) * 0.06 * Math.min(1, Math.abs(windX) / 80);

    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 9);

    if (phase === 'burning') {
      burnT += dt / (0.8 + fuseLen * 1.6);   /* 長い導火線ほどゆっくり */
      const p = fuseCurve.getPoint(U.clamp(1 - burnT, 0, 1));
      sparkMesh.position.copy(p);
      sparkMesh.scale.setScalar(1 + Math.sin(time * 40) * 0.35);
      if (burnT >= 1) launch();
    }

    if (phase === 'flying') {
      shellV.y -= 700 * dt;
      shellV.x += (windX - shellV.x * 0.5) * dt * 0.4;
      launchGlow.position.addScaledVector(shellV, dt);
      launchGlow.scale.setScalar(1 + Math.sin(time * 60) * 0.3);
      burstDelay -= dt;
      if (burstDelay <= 0) burst();
    }

    if (phase === 'burst') {
      let alive = 0;
      let k = 0;
      for (const s of fx.bursts) {
        s.age += dt;
        if (s.age < s.life) {
          alive++;
          s.v.multiplyScalar(Math.exp(-dt * 1.1));
          s.v.y -= 260 * dt;
          s.v.x += windX * 0.25 * dt;
          s.p.addScaledVector(s.v, dt);
          if (!s.lastT || time - s.lastT > 0.045) {
            s.lastT = time;
            s.trail.unshift(s.p.clone());
            if (s.trail.length > TRAIL) s.trail.pop();
          }
        }
        const fade = U.clamp(1 - s.age / s.life, 0, 1);
        const flick = 0.7 + 0.3 * Math.sin(time * 30 + s.p.x);
        /* 本体 + 尾 */
        for (let ti = 0; ti <= TRAIL; ti++) {
          const pos = ti === 0 ? s.p : (s.trail[ti - 1] || s.p);
          dummy.position.copy(pos);
          const sc = fade * flick * (ti === 0 ? 1.6 : 1.2 - ti * 0.18);
          dummy.scale.setScalar(Math.max(0.001, sc));
          dummy.updateMatrix();
          stars.setMatrixAt(k, dummy.matrix);
          stars.setColorAt(k, s.col);
          k++;
        }
      }
      for (; k < stars.count; k++) {
        dummy.position.set(0, -9000, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        stars.setMatrixAt(k, dummy.matrix);
      }
      stars.instanceMatrix.needsUpdate = true;
      if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
      if (alive === 0) resetBench();
    }

    /* 打ち上げ中はカメラが玉を追う */
    let camY = 340;
    if (phase === 'flying') camY = 340 + launchGlow.position.y * 0.6;
    else if (phase === 'burst' && fx.bursts.length) camY = 340 + fx.bursts[0].p.y * 0.5;
    stage3.orbit.target.y += (camY - stage3.orbit.target.y) * Math.min(1, dt * 2.2);

    if (window.__dbgHB) window.__dbgHB(phase, packed.length);
    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      packed = [];
      dragStar = null; dragId = null; fuseDragId = null; orbitId = null;
      fuseLen = 0.7;
      phase = 'pack';
      burnT = 0; windX = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(90, 340, 140),
        radius: 2000, radiusPortraitBase: 1700, radiusMaxPortrait: 2800,
        az: 0.3, po: 1.13, exposure: 1.0,
      });
      build();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 星を詰める → 蓋 → 点火 */
      GUIDE.start(stage3, [
        {
          /* to はドラッグ平面 (y = BOWL.y + 30) 上のお椀の真上に置く。平面より高い点を
             指すと、スクリーン投影→平面レイキャストの視差で着地が手前にずれてお椀を外す */
          kind: 'drag', at: () => trayHits[0], to: () => new THREE.Vector3(BOWL.x, BOWL.y + 30, BOWL.z),
          when: () => phase === 'pack', done: () => packed.length > 2,
        },
        {
          kind: 'tap', at: () => lidHit,
          when: () => phase === 'pack' && packed.length > 2, done: () => phase !== 'pack',
        },
        {
          kind: 'tap', at: () => torchG.userData.hit,
          when: () => phase === 'loaded', done: () => phase === 'burning' || phase === 'flying' || phase === 'burst',
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (fuseSnd) fuseSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
