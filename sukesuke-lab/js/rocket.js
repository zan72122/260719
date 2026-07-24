/* ロケット打ち上げ — 写実3D
 *
 * 断面ロケット。燃料と酸化剤のバルブ開度(アナログ)が混合比になり、
 * 点火の成否・炎の色・推力がすべて連続的に変わる。
 * 連鎖: バルブ開 → ターボポンプ回転 → カウントダウン → 点火 →
 *       推力 > 重量で離昇 → タンクが減って軽くなる → 加速 →
 *       タップで段切り離し → 燃え尽きたら慣性上昇 → 落下 → 新しい機体
 * 分岐: 2バルブの開度 × 点火タイミング × 切り離しタイミング。失敗も結果。
 */
window.GAMES.rocket = (() => {
  const R = 60;             // 機体半径
  const PAD_Y = 90;         // 発射台上の機体底

  let stage3, scene, raf, prev, time;
  let rocketG, stage1G, flame, flameLight, pumpDisc, fuelMesh, loxMesh, fairL, fairR;
  let fuelLever, loxLever, ignBtn, leverHits, btnHit, rocketHit, altFill, bestMark;
  let smoke, smokeState, stars, dummy;
  let fuelV, loxV, dragLever, orbitId, orbitFrom;
  let phase; // idle | count | fly | coast | fall
  let countT, beepN, alt, vy, fuelAmt, loxAmt, sep, fairing, bestAlt, debris;
  let rumble, skyCol;
  let mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    skyCol = new THREE.Color(0x8fb8e2);
    scene.background = skyCol;

    /* 射場 */
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(500, 520, 40, 28),
      new THREE.MeshStandardMaterial({ color: 0x9a978e, roughness: 0.85 }));
    pad.position.y = 20;
    pad.receiveShadow = true;
    scene.add(pad);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: 0x7a8a5e, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(1200, 2400, 1400), shadowSpan: 1200, intensity: 0.95 });
    /* 発射塔 */
    const truss = new THREE.MeshStandardMaterial({ color: 0xb33e28, metalness: 0.4, roughness: 0.6 });
    for (let i = 0; i < 8; i++) {
      G3.add(scene, new THREE.BoxGeometry(26, 26, 26), truss, -200, 80 + i * 110, -140).visible = false;
    }
    G3.add(scene, new THREE.BoxGeometry(26, 880, 26), truss, -340, 440, -240);
    G3.add(scene, new THREE.BoxGeometry(26, 880, 26), truss, -460, 440, -140);
    for (let i = 0; i < 6; i++) {
      const bar = G3.add(scene, new THREE.BoxGeometry(160, 14, 14), truss, -400, 120 + i * 140, -190);
      bar.rotation.y = 0.68;
    }

    /* 宇宙の星 (高高度でフェードイン) */
    const sp = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      sp[i * 3] = U.rand(-4000, 4000);
      sp[i * 3 + 1] = U.rand(500, 9000);
      sp[i * 3 + 2] = U.rand(-4000, 1000);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sgeo, new THREE.PointsMaterial({
      size: 10, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    }));
    scene.add(stars);

    /* --- 断面ロケット --- */
    rocketG = new THREE.Group();
    scene.add(rocketG);
    stage1G = new THREE.Group();
    rocketG.add(stage1G);
    const shell = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide });
    const half = (r0, r1, h, y, parent) => {
      /* カメラ側が開いた半筒 */
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 24, 1, true, 0, Math.PI), shell);
      m.position.y = y;
      m.rotation.y = 2.1;   /* 開口をカメラ側へ */
      m.castShadow = true;
      (parent || rocketG).add(m);
      return m;
    };
    /* 1段目: 燃料タンク(下)+液体酸素タンク(上)+エンジン */
    half(R, R, 340, PAD_Y + 170, stage1G);
    fuelMesh = G3.add(stage1G, new THREE.CylinderGeometry(R - 14, R - 14, 1, 18),
      new THREE.MeshStandardMaterial({ color: 0xcf8a2a, roughness: 0.3 }), 0, 0, 0);
    loxMesh = G3.add(stage1G, new THREE.CylinderGeometry(R - 14, R - 14, 1, 18),
      new THREE.MeshStandardMaterial({ color: 0xa8d8f0, roughness: 0.25 }), 0, 0, 0);
    /* 配管とターボポンプ */
    G3.add(stage1G, new THREE.CylinderGeometry(6, 6, 120, 8), mats.chrome, 20, PAD_Y + 40, 20);
    G3.add(stage1G, new THREE.CylinderGeometry(6, 6, 160, 8), mats.chrome, -20, PAD_Y + 60, 20);
    pumpDisc = G3.add(stage1G, new THREE.CylinderGeometry(24, 24, 14, 16), mats.brass, 0, PAD_Y + 8, 14);
    for (let i = 0; i < 6; i++) {
      const b = G3.add(pumpDisc, new THREE.BoxGeometry(4, 12, 16), mats.brass, 0, 0, 0);
      b.position.set(Math.cos(i * Math.PI / 3) * 16, 0, Math.sin(i * Math.PI / 3) * 16);
      b.rotation.y = -i * Math.PI / 3 + 0.5;
    }
    /* 燃焼室とノズル */
    G3.add(stage1G, new THREE.CylinderGeometry(26, 34, 46, 16), mats.steel, 0, PAD_Y - 24, 0);
    const bell = G3.add(stage1G, new THREE.CylinderGeometry(34, 62, 70, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x5a5148, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }), 0, PAD_Y - 76, 0);
    bell.castShadow = true;
    /* 2段目 + フェアリング */
    half(R, R, 130, PAD_Y + 410);
    fuelMesh.userData = { y0: PAD_Y + 30, h: 200 };
    loxMesh.userData = { y0: PAD_Y + 240, h: 100 };
    fairL = new THREE.Mesh(new THREE.ConeGeometry(R, 150, 20, 1, false, 0, Math.PI), shell.clone());
    fairL.position.y = PAD_Y + 550;
    fairL.castShadow = true;
    rocketG.add(fairL);
    fairR = fairL.clone();
    fairR.rotation.y = Math.PI;
    rocketG.add(fairR);

    /* 炎 */
    flame = new THREE.Mesh(new THREE.ConeGeometry(30, 160, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    flame.rotation.x = Math.PI;
    flame.position.y = PAD_Y - 160;
    flame.visible = false;
    rocketG.add(flame);
    flameLight = new THREE.PointLight(0xffcc88, 0, 900);
    flameLight.position.y = PAD_Y - 140;
    rocketG.add(flameLight);

    rocketHit = new THREE.Mesh(new THREE.CylinderGeometry(140, 140, 700, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    rocketHit.position.y = PAD_Y + 300;
    rocketG.add(rocketHit);

    /* --- 管制コンソール --- */
    const cons = new THREE.Group();
    cons.position.set(320, 0, 560);
    cons.rotation.y = -0.35;
    scene.add(cons);
    G3.add(cons, new THREE.BoxGeometry(360, 30, 200), mats.darkPlastic, 0, 120, 0)
      .rotation.x = -0.5;
    G3.add(cons, new THREE.BoxGeometry(360, 120, 140), mats.whitePlastic, 0, 55, -20);
    /* レバー2本 (燃料=オレンジ / 酸素=水色) */
    leverHits = [];
    [[-100, 0xcf8a2a], [-20, 0x77c4ea]].forEach(([x, col], i) => {
      G3.add(cons, new THREE.BoxGeometry(14, 6, 120), mats.darkPlastic, x, 138, 8).rotation.x = -0.5;
      const lever = new THREE.Group();
      lever.position.set(x, 138, 8);
      lever.rotation.x = -0.5;
      cons.add(lever);
      const knob = G3.add(lever, new THREE.SphereGeometry(16, 12, 10),
        new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 0.6 }), 0, 6, -50);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(70, 90, 170), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 10, 0);
      lever.add(hit);
      leverHits.push({ lever, knob, hit, idx: i });
    });
    /* 点火ボタン */
    ignBtn = G3.add(cons, new THREE.CylinderGeometry(30, 32, 16, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xd03030, roughness: 0.35, clearcoat: 0.7 }), 110, 142, 10);
    ignBtn.rotation.x = -0.5;
    btnHit = new THREE.Mesh(new THREE.SphereGeometry(55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    btnHit.position.set(110, 150, 10);
    cons.add(btnHit);
    /* 高度計 (バー) */
    G3.add(cons, new THREE.BoxGeometry(26, 150, 14), mats.darkPlastic, 165, 75, -14);
    altFill = G3.add(cons, new THREE.BoxGeometry(16, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0x50e070 }), 165, 4, -6);
    bestMark = G3.add(cons, new THREE.BoxGeometry(24, 4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc40 }), 165, 4, -8);
    bestMark.visible = false;

    /* 煙 (インスタンス) */
    const sm = new THREE.SphereGeometry(26, 8, 6);
    smoke = new THREE.InstancedMesh(sm,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.36, depthWrite: false, color: 0xffffff }), 90);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = false;
    scene.add(smoke);
    smokeState = [];
    for (let i = 0; i < 90; i++) smokeState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, dark: 0 });
    dummy = new THREE.Object3D();
    debris = [];

    window.__pts.lever1 = leverHits[0].knob;
    window.__pts.lever2 = leverHits[1].knob;
    window.__pts.ignBtn = ignBtn;
    window.__pts.rocket = rocketHit;
  }

  function spawnSmoke(x, y, z, dark, vx, vy) {
    const s = smokeState.find(q => !q.on);
    if (!s) return;
    s.on = true;
    s.x = x; s.y = y; s.z = z;
    s.vx = (vx || 0) + U.rand(-70, 70);
    s.vy = vy == null ? U.rand(30, 90) : vy;
    s.vz = U.rand(-70, 70);
    s.age = 0;
    s.life = U.rand(1.2, 2.4);
    s.dark = dark;
  }

  function mixture() {
    const total = fuelV.p + loxV.p;
    const ratio = loxV.p / (fuelV.p + 0.001);
    const q = U.clamp(1 - Math.abs(ratio - 1.2) * 1.05, 0, 1) * U.clamp(total / 1.1, 0, 1);
    return { total, ratio, q };
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    for (const L of leverHits) {
      if (dragLever === null && ray.intersectObject(L.hit, false).length) {
        dragLever = { idx: L.idx, id: e.pointerId, y0: e.clientY, v0: L.idx === 0 ? fuelV.t : loxV.t };
        S.ratchet(0.5);
        return;
      }
    }
    if (ray.intersectObject(btnHit, false).length) {
      if (phase === 'idle') {
        phase = 'count';
        countT = 0; beepN = 0;
        S.clickReal(0.9);
      }
      return;
    }
    /* 飛行中に機体タップ → 段切り離し */
    if (phase === 'fly' && !sep && ray.intersectObject(rocketHit, false).length) {
      separate();
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragLever && e.pointerId === dragLever.id) {
      const r = stage3.renderer.domElement.getBoundingClientRect();
      const v = U.clamp(dragLever.v0 + (dragLever.y0 - e.clientY) / r.height * 4.2, 0, 1);
      if (dragLever.idx === 0) fuelV.t = v; else loxV.t = v;
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.4, 1.3);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.52);
    }
  }

  function onUp(e) {
    if (dragLever && e.pointerId === dragLever.id) dragLever = null;
    else if (e.pointerId === orbitId) orbitId = null;
  }

  function separate() {
    sep = true;
    S.boom(0.4);
    /* 1段目が落ちていく */
    const d = stage1G;
    rocketG.remove(d);
    scene.add(d);
    d.position.y = rocketG.position.y;
    debris.push({ g: d, vy: vy * 0.6, spin: 0.6 });
    flame.position.y = PAD_Y + 340;
    flameLight.position.y = PAD_Y + 320;
  }

  function resetRocket() {
    phase = 'idle';
    sep = false;
    fairing = false;
    rocketG.position.set(0, 0, 0);
    if (!stage1G.parent || stage1G.parent !== rocketG) {
      scene.remove(stage1G);
      rocketG.add(stage1G);
      stage1G.position.y = 0;
      stage1G.rotation.z = 0;
    }
    debris = [];
    fairL.visible = true;
    fairR.visible = true;
    fairL.position.set(0, PAD_Y + 550, 0);
    fairR.position.set(0, PAD_Y + 550, 0);
    flame.visible = false;
    flame.position.y = PAD_Y - 160;
    flameLight.position.y = PAD_Y - 140;
    fuelAmt = 1; loxAmt = 1;
    alt = 0; vy = 0;
    S.thunk();
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(fuelV, dt, 300, 24);
    U.stepSpring(loxV, dt, 300, 24);
    /* レバーとタンク表示 */
    leverHits[0].knob.position.z = -50 + fuelV.p * 100;
    leverHits[1].knob.position.z = -50 + loxV.p * 100;
    const fm = fuelMesh.userData, lm = loxMesh.userData;
    fuelMesh.scale.y = Math.max(0.01, fuelAmt * fm.h);
    fuelMesh.position.y = fm.y0 + fuelAmt * fm.h / 2;
    loxMesh.scale.y = Math.max(0.01, loxAmt * lm.h);
    loxMesh.position.y = lm.y0 + loxAmt * lm.h / 2;

    const mix = mixture();
    /* ターボポンプはバルブ開度で回る */
    pumpDisc.rotation.y += mix.total * (phase === 'fly' ? 30 : 8) * dt;

    if (phase === 'count') {
      countT += dt;
      if (countT > beepN * 0.8) {
        beepN++;
        if (beepN <= 3) S.clickReal(0.4, 0);
      }
      if (countT > 2.4) {
        /* 点火判定: 混合が悪いと不発 */
        if (mix.q < 0.15) {
          phase = 'idle';
          S.sputter();
          S.sputter();
          for (let i = 0; i < 6; i++) spawnSmoke(0, PAD_Y - 120, 0, 0.75);
        } else {
          phase = 'fly';
          S.boom(0.8);
          rumble.set(mix.q);
          flame.visible = true;
        }
      }
    }

    if (phase === 'fly' || phase === 'coast') {
      const burning = phase === 'fly' && fuelAmt > 0 && loxAmt > 0;
      let thrust = 0;
      if (burning) {
        thrust = mix.q * mix.total * 4500000;
        fuelAmt = Math.max(0, fuelAmt - fuelV.p * dt * 0.055);
        loxAmt = Math.max(0, loxAmt - loxV.p * dt * 0.065);
        rumble.set(U.clamp(mix.q * mix.total, 0.2, 1));
        /* 炎の見た目は混合比で変わる */
        const rich = mix.ratio < 1.0;
        flame.material.color.set(rich ? 0xff9a40 : mix.ratio > 1.45 ? 0x86b8ff : 0xbfe8ff);
        flame.scale.set(1 + mix.q * 0.4, 0.5 + mix.q * 1.3 + Math.sin(time * 47) * 0.12, 1 + mix.q * 0.4);
        flameLight.intensity = 1.2 + mix.q * 1.6;
        /* 煙: リッチ燃焼ほど黒い */
        if (Math.random() < (alt < 400 ? 0.9 : 0.35)) {
          spawnSmoke(rocketG.position.x + U.rand(-40, 40), Math.max(30, rocketG.position.y + (sep ? PAD_Y + 300 : PAD_Y - 140)), U.rand(-40, 40),
            rich ? 0.65 : 0.15, 0, alt < 300 ? U.rand(40, 130) : -80);
        }
        if (fuelAmt <= 0 || loxAmt <= 0) {
          phase = 'coast';
          flame.visible = false;
          flameLight.intensity = 0;
          rumble.set(0);
        }
      }
      const mass = 8000 + (sep ? 0 : 5000) + (fuelAmt + loxAmt) * 5000;
      vy += (thrust / mass - 9.8 * 28) * dt;
      alt = Math.max(0, alt + vy * dt);
      rocketG.position.y = alt;
      bestAlt = Math.max(bestAlt, alt);
      /* フェアリング分離 */
      if (!fairing && alt > 5200) {
        fairing = true;
        S.whoosh(0.7);
        [fairL, fairR].forEach((f, i) => {
          rocketG.remove(f);
          scene.add(f);
          f.position.set(rocketG.position.x, rocketG.position.y + PAD_Y + 550, 0);
          debris.push({ g: f, vy: vy * 0.8, vx: (i ? 1 : -1) * 220, spin: (i ? 1 : -1) * 1.4 });
        });
      }
      if (alt <= 0 && vy < 0) {
        S.boom(0.6);
        for (let i = 0; i < 10; i++) spawnSmoke(U.rand(-80, 80), 60, U.rand(-80, 80), 0.4);
        resetRocket();
      }
    }

    /* 切り離した部品の落下 */
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy -= 9.8 * 28 * dt;
      d.g.position.y += d.vy * dt;
      d.g.position.x += (d.vx || 0) * dt;
      d.g.rotation.z += d.spin * dt;
      if (d.g.position.y < -600) {
        if (d.g !== stage1G) d.g.visible = false;
        debris.splice(i, 1);
      }
    }

    /* 煙 */
    let k = 0;
    for (const s of smokeState) {
      if (s.on) {
        s.age += dt;
        if (s.age >= s.life) s.on = false;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vy += 26 * dt;
      }
      dummy.position.set(s.x, s.on ? s.y : -9000, s.z);
      const g = s.on ? (0.7 + s.age * 1.1) * (1 - s.age / s.life * 0.4) : 0.001;
      dummy.scale.setScalar(Math.max(0.001, g));
      dummy.updateMatrix();
      smoke.setMatrixAt(k, dummy.matrix);
      smoke.setColorAt(k, new THREE.Color().setScalar(s.on ? 1 - s.dark : 1));
      k++;
    }
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;

    /* 高度計と空の色 */
    altFill.scale.y = Math.max(0.01, U.clamp(alt / 9000, 0, 1) * 140);
    altFill.position.y = 4 + altFill.scale.y / 2;
    if (bestAlt > 50) {
      bestMark.visible = true;
      bestMark.position.y = 4 + U.clamp(bestAlt / 9000, 0, 1) * 140;
    }
    const spaceK = U.clamp(alt / 7000, 0, 1);
    skyCol.setRGB(U.lerp(0.56, 0.02, spaceK), U.lerp(0.72, 0.03, spaceK), U.lerp(0.89, 0.07, spaceK));
    stars.material.opacity = U.clamp((alt - 2500) / 4000, 0, 1);

    if (window.__dbgRK) window.__dbgRK({ f: +fuelV.t.toFixed(2), l: +loxV.t.toFixed(2), phase, alt: alt | 0 });

    /* カメラはロケットを追う */
    const targetY = 420 + Math.max(0, alt);
    stage3.orbit.target.y += (targetY - stage3.orbit.target.y) * Math.min(1, dt * 3);

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      fuelV = U.spring(0);
      loxV = U.spring(0);
      dragLever = null; orbitId = null;
      phase = 'idle';
      alt = 0; vy = 0; fuelAmt = 1; loxAmt = 1;
      sep = false; fairing = false; bestAlt = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(50, 400, 100),
        radius: 1900, radiusPortraitBase: 1650, radiusMaxPortrait: 2700,
        az: 0.5, po: 1.22,
      });
      build();
      rumble = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: レバー2本 → 点火 → 切り離し */
      const up = (obj, dy) => () => {
        const v = new THREE.Vector3();
        obj().getWorldPosition(v);
        v.y += dy;
        return v;
      };
      GUIDE.start(stage3, [
        /* 離陸には推力 > 重力が必要 (mixture() の q×total > 1.4)。レバー半開では
           点火しても浮かばないので、ほぼ全開までがガイドの完了条件 */
        { kind: 'drag', at: () => leverHits[0].knob, to: up(() => leverHits[0].knob, 150), done: () => fuelV.p > 0.9 },
        { kind: 'drag', at: () => leverHits[1].knob, to: up(() => leverHits[1].knob, 150), done: () => loxV.p > 0.9 },
        { kind: 'tap', at: () => ignBtn, when: () => phase === 'idle', done: () => phase !== 'idle' },
        { kind: 'tap', at: () => rocketHit, when: () => phase === 'fly' && !sep && alt > 600, done: () => sep },
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
