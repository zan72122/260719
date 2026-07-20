/* クレーンゲーム — 写実3D
 *
 * 1回ごとにお金がかかる機械。
 * 連鎖: コイン投入 → ジョイスティックでガントリー移動 → ボタンでアーム降下 →
 *       3本爪が閉じる (掴んだ位置で保持力が決まる) → 持ち上げ → 揺れながら搬送 →
 *       落とし口の上で開く → 景品がすべり出てくる
 * 分岐: 位置決め精度 × 降下タイミング × 揺れ × 保持力。
 *       掴み損ねるたびに景品の山が崩れて次の挑戦の地形が変わる。
 */
window.GAMES.crane = (() => {
  const PIT = { x0: -280, x1: 280, z0: -220, z1: 200, floor: 30 };
  const CHUTE = { x: -200, z: 260, r: 80 };

  let stage3, scene, raf, prev, time;
  let gantryX, gantryZ, clawG, cableMesh, fingers, prizes, heldPrize;
  let stick, stickBase, stickHit, btnHit, coinMesh, coinHit, coinHome, flap;
  let credits, phase; // idle | play | drop | grab | lift | carry | release | return
  let stickVec, stickId, coinDragId, clawY, clawClose, grabQ, swing, phT;
  let servo, orbitId, orbitFrom, mats, dummy;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d8c8e8', '#c8b8dc', '#9a8cb0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x8a8494, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(500, 1500, 900), shadowSpan: 900, intensity: 0.9 });

    /* --- 筐体 --- */
    const pink = new THREE.MeshPhysicalMaterial({ color: 0xd85a8a, roughness: 0.4, clearcoat: 0.5 });
    G3.add(scene, new THREE.BoxGeometry(680, 60, 560), pink, 0, PIT.floor - 30, 0).receiveShadow = true;
    const pitFloor = G3.add(scene, new THREE.BoxGeometry(620, 8, 480),
      new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.8 }), 0, PIT.floor, -10);
    pitFloor.receiveShadow = true;
    /* コーナー柱とガラス */
    [[-330, -270], [330, -270], [-330, 250], [330, 250]].forEach(([x, z]) => {
      G3.add(scene, new THREE.BoxGeometry(28, 520, 28), pink, x, 260, z);
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xeaf4ff, transparent: true, opacity: 0.12, roughness: 0.05, side: THREE.DoubleSide,
    });
    G3.add(scene, new THREE.PlaneGeometry(660, 460), glass, 0, 280, -270);
    G3.add(scene, new THREE.PlaneGeometry(540, 460), glass, -330, 280, -10).rotation.y = Math.PI / 2;
    G3.add(scene, new THREE.PlaneGeometry(540, 460), glass, 330, 280, -10).rotation.y = Math.PI / 2;
    /* 天井レール */
    G3.add(scene, new THREE.BoxGeometry(660, 20, 26), mats.chrome, 0, 520, -180);
    G3.add(scene, new THREE.BoxGeometry(660, 20, 26), mats.chrome, 0, 520, 140);

    /* 落とし口 (穴と受け取りフラップ) */
    G3.add(scene, new THREE.CylinderGeometry(CHUTE.r, CHUTE.r, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x221a26, roughness: 0.9 }), CHUTE.x, PIT.floor + 4, CHUTE.z - 60);
    flap = G3.add(scene, new THREE.BoxGeometry(150, 110, 10),
      new THREE.MeshPhysicalMaterial({ color: 0xe8b830, roughness: 0.4, clearcoat: 0.4 }), CHUTE.x, 90, 290);
    flap.rotation.x = 0;

    /* --- ガントリーと爪 --- */
    clawG = new THREE.Group();
    scene.add(clawG);
    const trolley = G3.add(clawG, new THREE.BoxGeometry(110, 40, 360), mats.chrome, 0, 520, -20);
    cableMesh = G3.add(clawG, new THREE.CylinderGeometry(4, 4, 1, 8), mats.darkPlastic, 0, 0, 0);
    const clawHead = G3.add(clawG, new THREE.SphereGeometry(30, 12, 8), mats.chrome, 0, 0, 0);
    clawHead.name = 'head';
    fingers = [];
    for (let i = 0; i < 3; i++) {
      const fg = new THREE.Group();
      fg.rotation.y = (i / 3) * Math.PI * 2;
      clawHead.add(fg);
      const f = G3.add(fg, new THREE.BoxGeometry(10, 90, 22), mats.chrome, 36, -40, 0);
      f.rotation.z = 0.5;
      fingers.push(fg);
    }
    clawG.userData.head = clawHead;

    /* --- 景品の山 --- */
    prizes = [];
    const cols = [0xe86048, 0x48a0e8, 0x58c868, 0xe8c040, 0xb070d8, 0xf090b0];
    for (let i = 0; i < 8; i++) {
      const kind = i % 3;
      let m, r;
      const mat = new THREE.MeshPhysicalMaterial({ color: cols[i % 6], roughness: 0.5, clearcoat: 0.3 });
      if (kind === 0) { r = 46; m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); }
      else if (kind === 1) { r = 42; m = new THREE.Mesh(new THREE.BoxGeometry(72, 72, 72), mat); }
      else {
        r = 40;
        m = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(32, 40, 6, 12) : new THREE.SphereGeometry(40, 12, 8), mat);
      }
      m.castShadow = true;
      scene.add(m);
      const px = -160 + (i % 3) * 130 + (i % 2) * 40;
      const pz = -140 + Math.floor(i / 3) * 110;
      prizes.push({ m, r, x: px, y: PIT.floor + r + (i > 5 ? 90 : 0), z: pz, vx: 0, vy: 0, vz: 0, held: false, won: false });
    }

    /* --- 操作パネル (手前) --- */
    const panel = G3.add(scene, new THREE.BoxGeometry(680, 70, 150), pink, 0, 100, 350);
    panel.rotation.x = -0.25;
    stickBase = G3.add(scene, new THREE.CylinderGeometry(40, 46, 24, 16), mats.darkPlastic, -120, 140, 360);
    stick = new THREE.Group();
    stick.position.set(-120, 145, 360);
    scene.add(stick);
    G3.add(stick, new THREE.CylinderGeometry(9, 9, 90, 10), mats.chrome, 0, 45, 0);
    G3.add(stick, new THREE.SphereGeometry(26, 14, 10),
      new THREE.MeshPhysicalMaterial({ color: 0x3050c8, roughness: 0.3, clearcoat: 0.7 }), 0, 96, 0);
    stickHit = new THREE.Mesh(new THREE.SphereGeometry(90, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    stickHit.position.set(-120, 220, 360);
    scene.add(stickHit);
    const btn = G3.add(scene, new THREE.CylinderGeometry(34, 38, 20, 18),
      new THREE.MeshPhysicalMaterial({ color: 0xd83030, roughness: 0.3, clearcoat: 0.7 }), 80, 142, 360);
    btnHit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    btnHit.position.set(80, 150, 360);
    scene.add(btnHit);

    /* コイン */
    coinHome = new THREE.Vector3(280, 130, 420);
    coinMesh = G3.add(scene, new THREE.CylinderGeometry(30, 30, 7, 18), mats.brass, coinHome.x, coinHome.y, coinHome.z);
    coinHit = new THREE.Mesh(new THREE.SphereGeometry(65, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    coinHit.position.copy(coinHome);
    scene.add(coinHit);
    G3.add(scene, new THREE.BoxGeometry(8, 40, 5), mats.darkPlastic, 190, 150, 400);

    dummy = new THREE.Object3D();
    window.__pts.stick = stickHit;
    window.__pts.btn = btnHit;
    window.__pts.coin = coinHit;
    window.__pts.slot = { getWorldPosition: v => v.set(190, 150, 400) };
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (coinDragId === null && ray.intersectObject(coinHit, false).length) {
      coinDragId = e.pointerId;
      return;
    }
    if (stickId === null && ray.intersectObject(stickHit, false).length) {
      if (credits <= 0) { S.buzz(); return; }
      stickId = e.pointerId;
      stickVec.x0 = e.clientX;
      stickVec.y0 = e.clientY;
      return;
    }
    if (ray.intersectObject(btnHit, false).length) {
      if (credits <= 0) { S.buzz(); return; }
      if (phase === 'play') {
        phase = 'drop';
        phT = 0;
        credits--;
        S.clickReal(0.8);
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === coinDragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (150 - o.y) / d.y;
      if (t > 0) {
        coinMesh.position.set(o.x + d.x * t, 150, o.z + d.z * t);
        if (Math.hypot(coinMesh.position.x - 190, coinMesh.position.z - 400) < 60) {
          coinDragId = null;
          coinMesh.position.copy(coinHome);
          credits++;
          if (phase === 'idle') phase = 'play';
          S.coin();
        }
      }
    } else if (e.pointerId === stickId) {
      stickVec.x = U.clamp((e.clientX - stickVec.x0) / 90, -1, 1);
      stickVec.y = U.clamp((e.clientY - stickVec.y0) / 90, -1, 1);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.2);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.8, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === coinDragId) {
      coinDragId = null;
      coinMesh.position.copy(coinHome);
    } else if (e.pointerId === stickId) {
      stickId = null;
      stickVec.x = 0;
      stickVec.y = 0;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    /* ジョイスティック → ガントリー移動 (押している間だけ動く) */
    stick.rotation.z = -stickVec.x * 0.4;
    stick.rotation.x = stickVec.y * 0.4;
    if (phase === 'play' && stickId !== null) {
      gantryX = U.clamp(gantryX + stickVec.x * 220 * dt, PIT.x0, PIT.x1);
      gantryZ = U.clamp(gantryZ + stickVec.y * 220 * dt, PIT.z0, PIT.z1);
      servo.set(0.3 + Math.hypot(stickVec.x, stickVec.y) * 0.4);
    } else if (phase === 'carry' || phase === 'return') {
      servo.set(0.5);
    } else {
      servo.set(0);
    }

    /* フェーズ進行 */
    const head = clawG.userData.head;
    if (phase === 'drop') {
      clawY = Math.max(PIT.floor + 60, clawY - 240 * dt);
      swing.t = 0;
      if (clawY <= PIT.floor + 60) { phase = 'grab'; phT = 0; }
    } else if (phase === 'grab') {
      phT += dt;
      clawClose = Math.min(1, phT * 2.2);
      if (phT > 0.55) {
        /* つかみ判定: 爪の中心にどれだけ近いか */
        let best = null, bd = 1e9;
        for (const p of prizes) {
          if (p.won) continue;
          const d = Math.hypot(p.x - gantryX, p.z - gantryZ);
          if (d < bd) { bd = d; best = p; }
        }
        if (best && bd < 70) {
          grabQ = 1 - bd / 90;
          heldPrize = best;
          best.held = true;
          S.thunk();
        } else {
          S.ratchet(0.5);
        }
        phase = 'lift';
      }
    } else if (phase === 'lift') {
      clawY = Math.min(430, clawY + 200 * dt);
      if (clawY >= 430) phase = 'carry';
    } else if (phase === 'carry') {
      const dx = CHUTE.x - gantryX, dz = (CHUTE.z - 60) - gantryZ;
      const dl = Math.hypot(dx, dz);
      gantryX += (dx / (dl || 1)) * 180 * dt;
      gantryZ += (dz / (dl || 1)) * 180 * dt;
      swing.t = U.clamp(-(dx) * 0.0016, -0.5, 0.5);
      /* 保持力が弱いと揺れで落ちる */
      if (heldPrize && Math.abs(swing.p) * (1 - grabQ) > 0.16) {
        heldPrize.held = false;
        heldPrize.vx = swing.v * 60;
        heldPrize = null;
        S.thunk();
      }
      if (dl < 16) { phase = 'release'; phT = 0; }
    } else if (phase === 'release') {
      phT += dt;
      clawClose = Math.max(0, 1 - phT * 3);
      if (heldPrize && clawClose < 0.4) {
        heldPrize.held = false;
        heldPrize.vy = -30;
        heldPrize = null;
      }
      if (phT > 0.8) phase = 'return';
    } else if (phase === 'return') {
      const dx = 0 - gantryX, dz = -20 - gantryZ;
      const dl = Math.hypot(dx, dz);
      gantryX += (dx / (dl || 1)) * 200 * dt;
      gantryZ += (dz / (dl || 1)) * 200 * dt;
      clawY = Math.min(430, clawY + 100 * dt);
      clawClose = 0;
      if (dl < 14) phase = credits > 0 ? 'play' : 'idle';
    }

    U.stepSpring(swing, dt, 30, 1.6);
    if (phase === 'play' || phase === 'idle') swing.t = 0;

    /* ガントリーの見た目 */
    clawG.position.set(gantryX, 0, gantryZ);
    head.position.set(Math.sin(swing.p) * (520 - clawY) * 0.5, clawY, 0);
    cableMesh.position.set(head.position.x * 0.5, (520 + clawY) / 2, 0);
    cableMesh.scale.y = Math.max(1, 520 - clawY);
    cableMesh.rotation.z = Math.sin(swing.p) * 0.4;
    fingers.forEach(fg => { fg.children[0].rotation.z = 0.5 - clawClose * 0.62; });

    /* 景品の物理 */
    for (const p of prizes) {
      if (p.won) continue;
      if (p.held) {
        p.x = gantryX + head.position.x;
        p.y = clawY - 60;
        p.z = gantryZ;
        p.vx = 0; p.vy = 0; p.vz = 0;
        continue;
      }
      p.vy -= 1600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      /* 落とし口に入ったら獲得 */
      if (Math.hypot(p.x - CHUTE.x, p.z - (CHUTE.z - 60)) < CHUTE.r && p.y < PIT.floor + p.r + 14) {
        p.won = true;
        S.ding();
        S.sparkle();
        flap.userData.openT = 1;
        /* 取り出し口の外へ */
        p.x = CHUTE.x;
        p.y = 60;
        p.z = 360;
        p.vx = 0; p.vy = 0; p.vz = 0;
        p.m.position.set(p.x, p.y, p.z);
        continue;
      }
      if (p.y < PIT.floor + p.r) {
        p.y = PIT.floor + p.r;
        if (p.vy < -120) S.thunk();
        p.vy *= -0.25;
        p.vx *= Math.exp(-dt * 4);
        p.vz *= Math.exp(-dt * 4);
      }
      if (p.x < PIT.x0 - 20) { p.x = PIT.x0 - 20; p.vx *= -0.4; }
      if (p.x > PIT.x1 + 20) { p.x = PIT.x1 + 20; p.vx *= -0.4; }
      if (p.z < PIT.z0 - 20) { p.z = PIT.z0 - 20; p.vz *= -0.4; }
      if (p.z > PIT.z1 + 40) { p.z = PIT.z1 + 40; p.vz *= -0.4; }
    }
    /* 景品どうしの押しのけ */
    for (let i = 0; i < prizes.length; i++) {
      for (let j = i + 1; j < prizes.length; j++) {
        const A = prizes[i], B = prizes[j];
        if (A.won || B.won || A.held || B.held) continue;
        const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
        const rr = A.r + B.r;
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.01 && d < rr) {
          const push = (rr - d) / 2;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          A.x -= nx * push; A.y -= ny * push * 0.4; A.z -= nz * push;
          B.x += nx * push; B.y += ny * push * 0.4; B.z += nz * push;
        }
      }
    }
    for (const p of prizes) {
      p.m.position.set(p.x, p.y, p.z);
      if (!p.held && !p.won && Math.abs(p.vx) + Math.abs(p.vz) > 6) {
        p.m.rotation.z -= p.vx * 0.004;
        p.m.rotation.x += p.vz * 0.004;
      }
    }

    /* 受け取りフラップ */
    flap.userData.openT = Math.max(0, (flap.userData.openT || 0) - dt);
    flap.rotation.x = -(flap.userData.openT || 0) * 0.9;

    if (window.__dbgCR) window.__dbgCR({ phase, credits, x: gantryX | 0, z: gantryZ | 0, won: prizes.filter(p => p.won).length });
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      gantryX = 0; gantryZ = -20;
      clawY = 430; clawClose = 0; grabQ = 0;
      swing = U.spring(0);
      stickVec = { x: 0, y: 0, x0: 0, y0: 0 };
      credits = 0;
      phase = 'idle';
      heldPrize = null;
      stickId = null; coinDragId = null; orbitId = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 260, 0),
        radius: 1500, radiusPortraitBase: 1350, radiusMaxPortrait: 2200,
        az: 0.15, po: 1.25,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      if (servo) servo.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
