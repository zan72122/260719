/* メリーゴーランド — 写実3D (断面)
 *
 * 回っているのは見えるのに、木馬がどうして上下するのかは見えない。
 * 屋根のスカートと中心柱のカバーを一部外して、駆動のからくりを見せる。
 * 連鎖: レバー → 土台のモーター → かさ歯車 → 中心シャフト → 回転台が回る →
 *       屋根裏のクランク円盤がポールを順番に押し引き → 木馬がなめらかに上下 →
 *       オルゴールの音楽はスピードに合わせて速くなる
 * 分岐: 速さ × どの木馬に乗せるか × 回っている最中の乗り降り。
 *       速すぎると人形が外側にかたむく。
 */
window.GAMES.carousel = (() => {
  const N_HORSE = 6;
  const R_HORSE = 340;
  /* きらきら星 */
  const TUNE = [523, 523, 784, 784, 880, 880, 784, 0, 698, 698, 659, 659, 587, 587, 523, 0];

  let stage3, scene, raf, prev, time;
  let platG, horses, canopyCranks, motorRotor, bevelA, bevelB, leverG;
  let dolls, dragDoll, dragId, orbitId, orbitFrom;
  let lever, speed, angle, noteT, noteI;
  let hum, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#a8d0e8', '#d4e6f0', '#6e9cc4');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x86a86a, roughness: 0.85 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(1100, 2200, 1500), shadowSpan: 1400, intensity: 1 });

    /* --- 土台と駆動室 (断面) --- */
    const baseM = new THREE.MeshPhysicalMaterial({ color: 0xc8556a, roughness: 0.4, clearcoat: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(500, 520, 70, 36, 1, false, Math.PI * 0.25, Math.PI * 1.5), baseM);
    base.position.y = 35;
    base.castShadow = true;
    scene.add(base);
    /* 断面窓から見える駆動 */
    motorRotor = G3.add(scene, new THREE.CylinderGeometry(44, 44, 110, 16), mats.steel, 150, 60, 260);
    motorRotor.rotation.z = Math.PI / 2;
    motorRotor.castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(80, 80, 90),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), 240, 60, 260);
    bevelA = G3.add(scene, new THREE.CylinderGeometry(48, 60, 30, 16), mats.brass, 60, 60, 260);
    bevelA.rotation.z = Math.PI / 2;
    bevelB = G3.add(scene, new THREE.CylinderGeometry(60, 48, 30, 16), mats.brass, 0, 110, 260);

    /* 中心柱 (下半分は断面でシャフトが見える) */
    const shaft = G3.add(scene, new THREE.CylinderGeometry(26, 26, 760, 14), mats.chrome, 0, 420, 0);
    shaft.castShadow = true;
    const colM = new THREE.MeshPhysicalMaterial({ color: 0xe8d8b0, roughness: 0.35, clearcoat: 0.6 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(90, 110, 560, 24, 1, true, Math.PI * 0.2, Math.PI * 1.6), colM);
    col.position.y = 480;
    col.castShadow = true;
    scene.add(col);

    /* --- 回転部 --- */
    platG = new THREE.Group();
    scene.add(platG);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(430, 430, 26, 36),
      new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.55 }));
    deck.position.y = 84;
    deck.castShadow = true;
    deck.receiveShadow = true;
    platG.add(deck);
    /* ふち飾り */
    const trim = new THREE.Mesh(new THREE.TorusGeometry(430, 12, 8, 36),
      new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.8, roughness: 0.3 }));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 96;
    platG.add(trim);

    /* 屋根 (一部あけてクランクが見える) */
    const roof = new THREE.Mesh(new THREE.ConeGeometry(500, 180, 36, 1, false, Math.PI * 0.25, Math.PI * 1.5),
      new THREE.MeshPhysicalMaterial({ color: 0xc8556a, roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }));
    roof.position.y = 850;
    roof.castShadow = true;
    platG.add(roof);
    const ceil = new THREE.Mesh(new THREE.CylinderGeometry(470, 470, 16, 36),
      new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.6 }));
    ceil.position.y = 760;
    platG.add(ceil);

    /* --- 木馬とポールと屋根裏クランク --- */
    horses = [];
    canopyCranks = [];
    const horseCols = [0xf0f0f0, 0x8a5a3a, 0x3a3a42, 0xd8a03a, 0xb05a6a, 0x5a7ab0];
    for (let i = 0; i < N_HORSE; i++) {
      const a = i / N_HORSE * Math.PI * 2;
      const hx = Math.cos(a) * R_HORSE, hz = Math.sin(a) * R_HORSE;
      const pole = G3.add(platG, new THREE.CylinderGeometry(9, 9, 700, 10), mats.brass, hx, 430, hz);
      pole.castShadow = true;
      /* クランク円盤 (屋根裏) + コンロッド */
      const crank = new THREE.Group();
      crank.position.set(hx, 745, hz);
      platG.add(crank);
      const disc = G3.add(crank, new THREE.CylinderGeometry(46, 46, 14, 14), mats.steel, 0, 0, 0);
      disc.rotation.x = Math.PI / 2;
      const pin = G3.add(crank, new THREE.CylinderGeometry(8, 8, 26, 8), mats.brass, 30, 0, 0);
      pin.rotation.x = Math.PI / 2;
      canopyCranks.push({ g: crank, pin });
      /* 木馬 (箱と円柱の素朴な木彫り風) */
      const horse = new THREE.Group();
      const hm = new THREE.MeshStandardMaterial({ color: horseCols[i], roughness: 0.45 });
      const body = G3.add(horse, new THREE.CapsuleGeometry(38, 90, 6, 12), hm, 0, 0, 0);
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      const neck = G3.add(horse, new THREE.CylinderGeometry(20, 26, 70, 10), hm, 52, 45, 0);
      neck.rotation.z = -0.5;
      G3.add(horse, new THREE.BoxGeometry(52, 30, 26), hm, 78, 82, 0).castShadow = true;
      G3.add(horse, new THREE.ConeGeometry(9, 22, 6), hm, 60, 100, 0);
      /* たてがみとサドル */
      G3.add(horse, new THREE.BoxGeometry(10, 60, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.7 }), 40, 55, 0);
      G3.add(horse, new THREE.BoxGeometry(56, 12, 46),
        new THREE.MeshStandardMaterial({ color: 0xc03040, roughness: 0.5 }), -6, 38, 0);
      [[-30, -1], [30, -1], [-30, 1], [30, 1]].forEach(([lx, s]) => {
        const leg = G3.add(horse, new THREE.CylinderGeometry(8, 7, 70, 8), hm, lx, -60, s * 18);
        leg.rotation.x = s * 0.15;
      });
      horse.position.set(hx, 260, hz);
      horse.rotation.y = -a + Math.PI;   /* 進行方向を向く */
      platG.add(horse);
      horses.push({ g: horse, rider: -1, phase: i * 1.3, baseA: a });
    }

    /* --- レバー台 --- */
    const cons = G3.add(scene, new THREE.BoxGeometry(110, 150, 90),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.45 }), -280, 75, 620);
    cons.castShadow = true;
    leverG = new THREE.Group();
    leverG.position.set(-280, 150, 620);
    scene.add(leverG);
    G3.add(leverG, new THREE.BoxGeometry(14, 100, 12), mats.steel, 0, 40, 0);
    G3.add(leverG, new THREE.SphereGeometry(17, 12, 10), mats.darkPlastic, 0, 92, 0);
    window.__pts.lever = leverG;

    /* --- 人形 --- */
    dolls = [];
    [[0xd85a4a, 350, 600], [0x4a9ad8, 180, 680]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 0, z);
      scene.add(d.g);
      dolls.push({ ...d, state: 'free', horse: -1 });
      window.__pts['doll' + i] = d.g;
    });
  }

  function nearestHorse(pos) {
    let best = -1, bd = 1e9;
    horses.forEach((h, i) => {
      if (h.rider >= 0) return;
      const v = new THREE.Vector3();
      h.g.getWorldPosition(v);
      const dd = Math.hypot(pos.x - v.x, pos.y + 80 - v.y, pos.z - v.z);
      if (dd < bd) { bd = dd; best = i; }
    });
    return bd < 220 ? best : -1;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    for (const d of dolls) {
      if (d.state === 'ride') {
        /* 乗っている人形をタップで降ろす (止まっているとき) */
        d.g.getWorldPosition(v);
        if (speed < 0.03 && ray.ray.distanceToPoint(v) < 110) {
          horses[d.horse].rider = -1;
          d.state = 'free';
          d.horse = -1;
          d.g.position.set(420, 0, 560);
          d.g.rotation.set(0, 0, 0);
          S.plip(2);
          return;
        }
        continue;
      }
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
        /* 水平面 y=250 (木馬の高さ) に投影 */
        const t = (250 - o.y) / d.y;
        if (t > 0) dragDoll.g.position.set(o.x + d.x * t, 150, o.z + d.z * t);
      } else if (leverG.userData.drag) {
        const dr = leverG.userData.drag;
        lever = U.clamp(dr.v0 + (dr.y0 - e.clientY) / 300, 0, 1);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.8, 0.8);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.65, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragDoll) {
        const idx = nearestHorse(dragDoll.g.position);
        if (idx >= 0) {
          dragDoll.state = 'ride';
          dragDoll.horse = idx;
          horses[idx].rider = dolls.indexOf(dragDoll);
          S.plip(1.9);
        } else {
          dragDoll.state = 'free';
          dragDoll.g.position.y = 0;
          const p = dragDoll.g.position;
          const r = Math.hypot(p.x, p.z);
          if (r < 540) {
            p.x = p.x / r * 580;
            p.z = p.z / r * 580;
          }
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

    speed += (lever * 0.9 - speed) * Math.min(1, dt * 0.9);
    angle += speed * dt;
    platG.rotation.y = angle;
    if (hum) hum.set(speed * 0.7);

    /* 駆動機械 */
    motorRotor.rotation.x += speed * dt * 20;
    bevelA.rotation.x += speed * dt * 20;
    bevelB.rotation.y += speed * dt * 8;

    /* 木馬の上下 (クランク駆動: 回転角と連動) */
    horses.forEach((h, i) => {
      const crankA = angle * 3 + h.phase;
      const dy = Math.sin(crankA) * 55;
      h.g.position.y = 260 + dy;
      canopyCranks[i].g.rotation.z = crankA;
      /* ギャロップの前後ゆれ */
      h.g.rotation.x = Math.cos(crankA) * 0.08 * Math.min(1, speed * 3);
      if (h.rider >= 0) {
        const d = dolls[h.rider];
        const v = new THREE.Vector3();
        h.g.getWorldPosition(v);
        d.g.position.set(v.x, v.y + 26, v.z);
        /* 速すぎると外側にかたむく */
        const cf = speed * speed * R_HORSE / 900;
        d.g.rotation.set(0, -angle + Math.PI - h.baseA, -Math.min(0.45, cf));
      }
    });

    /* オルゴール */
    if (speed > 0.08) {
      noteT += dt * (0.8 + speed * 3.2);
      if (noteT > 1) {
        noteT = 0;
        const f = TUNE[noteI % TUNE.length];
        if (f) S.boxNote(f, 0.1);
        noteI++;
      }
    }

    leverG.rotation.x = -lever * 0.7;

    if (window.__dbgCS) window.__dbgCS({
      lever: +lever.toFixed(2), speed: +speed.toFixed(3),
      riders: horses.map(h => h.rider),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      lever = 0; speed = 0; angle = 0; noteT = 0; noteI = 0;
      dragDoll = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 420, 0),
        radius: 2100, radiusPortraitBase: 1900, radiusMaxPortrait: 3200,
        az: 0.25, po: 1.1,
      });
      build();
      hum = S.humLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 人形を木馬へ → レバー */
      let gdRide = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.doll0,
          to: () => {
            const v = new THREE.Vector3();
            horses[0].g.getWorldPosition(v);
            return v;
          },
          done: () => (gdRide = gdRide || horses.some(h => h.rider >= 0)),
        },
        {
          kind: 'drag', at: () => leverG,
          to: () => {
            const v = new THREE.Vector3();
            leverG.getWorldPosition(v);
            v.y += 160;
            return v;
          },
          done: () => speed > 0.15,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (hum) hum.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
