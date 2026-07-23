/* 食器洗い機 — 写実3D (断面)
 *
 * とびらを閉めたら中で何が起きているのか見えない。正面を断面にして、
 * 回転スプレーアーム・水ジェット・ヒーターを見せる。
 * 連鎖: よごれたお皿をラックへ → 洗剤タブレットをポケットへ → とびらを閉める →
 *       スタート → ポンプ → スプレーアームがぐるぐる水を噴く → 当たったよごれが落ちる →
 *       すすぎ → ヒーターで乾燥 (湯気) → チン! → ピカピカのお皿
 * 分岐: お皿の並べ方 × 洗剤を入れたか (なし=よごれが残る) × カレーなべでまたよごせる。
 */
window.GAMES.dishwasher = (() => {
  let stage3, scene, raf, prev, time;
  let boxG, door, sprayArm, heaterCoil, jets, jetState, steam, steamState, dummy;
  let dishes, slots, tab, tabIn, washTab, pocket, pot, startBtn, lampCv, lampTex;
  let doorA, phase, phaseT, armSpin;
  let dragObj, dragId, orbitId, orbitFrom;
  let pump, mats;

  const BOX_X = -140, BOX_Z = -40;

  /* 操作平面上の点Pを、カメラから見て高さyTにある点へ射影し直す (視差補正) */
  function groundPoint(P, yT) {
    const C = stage3.camera.position;
    const s = (yT - C.y) / (P.y - C.y);
    return new THREE.Vector3(C.x + (P.x - C.x) * s, yT, C.z + (P.z - C.z) * s);
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#e2e8ea', '#eef2f2', '#b4bec2');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xc2b696, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(800, 1600, 1300), shadowSpan: 1200, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1500, 30),
      new THREE.MeshStandardMaterial({ color: 0xdfe5e2, roughness: 0.7 }), 0, 750, -440);

    /* --- 本体 (キッチンビルトイン・正面断面) --- */
    boxG = new THREE.Group();
    boxG.position.set(BOX_X, 0, BOX_Z);
    scene.add(boxG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xd8dde2, roughness: 0.3, clearcoat: 0.4 });
    const innerM = new THREE.MeshStandardMaterial({ color: 0x8e979e, metalness: 0.6, roughness: 0.4 });
    /* 外箱 (前面あき) */
    G3.add(boxG, new THREE.BoxGeometry(560, 30, 460), shellM, 0, 785, 0).castShadow = true;
    G3.add(boxG, new THREE.BoxGeometry(560, 30, 460), shellM, 0, 95, 0);
    G3.add(boxG, new THREE.BoxGeometry(30, 720, 460), shellM, -280, 440, 0).castShadow = true;
    G3.add(boxG, new THREE.BoxGeometry(30, 720, 460), shellM, 280, 440, 0);
    G3.add(boxG, new THREE.BoxGeometry(560, 720, 26), innerM, 0, 440, -220);
    /* カウンター天板 */
    G3.add(scene, new THREE.BoxGeometry(1800, 70, 620),
      new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.5 }), 0, 838, -60).castShadow = true;

    /* --- ラック (ワイヤーかご) --- */
    const wireM = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.7, roughness: 0.35 });
    const mkRack = (y) => {
      const g = new THREE.Group();
      g.position.set(0, y, 0);
      boxG.add(g);
      for (let i = 0; i < 7; i++) {
        G3.add(g, new THREE.BoxGeometry(8, 8, 380), wireM, -240 + i * 80, 0, 0);
      }
      G3.add(g, new THREE.BoxGeometry(490, 8, 8), wireM, 0, 0, -186);
      G3.add(g, new THREE.BoxGeometry(490, 8, 8), wireM, 0, 0, 186);
      return g;
    };
    mkRack(560);
    mkRack(330);

    /* --- スプレーアーム (下段の下・回転) --- */
    sprayArm = new THREE.Group();
    sprayArm.position.set(0, 200, 0);
    boxG.add(sprayArm);
    const armM = new THREE.MeshStandardMaterial({ color: 0x9aa8b2, metalness: 0.5, roughness: 0.4 });
    const arm = G3.add(sprayArm, new THREE.BoxGeometry(420, 22, 60), armM, 0, 0, 0);
    arm.castShadow = true;
    for (let i = -2; i <= 2; i++) {
      G3.add(sprayArm, new THREE.CylinderGeometry(8, 12, 18, 8), mats.chrome, i * 90, 16, 0);
    }
    G3.add(boxG, new THREE.CylinderGeometry(26, 32, 40, 12), armM, 0, 175, 0);

    /* --- ヒーターコイル (底) --- */
    heaterCoil = new THREE.Mesh(
      new THREE.TorusGeometry(190, 9, 8, 24, Math.PI * 1.7),
      new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, emissive: 0x000000 }));
    heaterCoil.rotation.x = Math.PI / 2;
    heaterCoil.position.set(0, 135, 0);
    boxG.add(heaterCoil);

    /* --- とびら (下ヒンジ・手前にたおれる) + 洗剤ポケット --- */
    door = new THREE.Group();
    door.position.set(0, 110, 232);
    boxG.add(door);
    const doorPanel = G3.add(door, new THREE.BoxGeometry(556, 700, 26), shellM, 0, 350, 0);
    doorPanel.castShadow = true;
    window.__pts.door = door;
    /* 洗剤ポケット (庫内左壁・断面からとどく) */
    pocket = G3.add(boxG, new THREE.BoxGeometry(30, 90, 120),
      new THREE.MeshStandardMaterial({ color: 0x5a636b, roughness: 0.4 }), -250, 500, 140);
    G3.add(boxG, new THREE.BoxGeometry(34, 12, 110), mats.chrome, -248, 540, 140);
    window.__pts.pocket = pocket;

    /* --- スタートボタン + ランプ (天板の上) --- */
    startBtn = G3.add(scene, new THREE.CylinderGeometry(36, 40, 22, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x2f8ed0, roughness: 0.3, clearcoat: 0.5 }), BOX_X + 360, 890, BOX_Z + 160);
    window.__pts.sbtn = startBtn;
    lampCv = document.createElement('canvas');
    lampCv.width = 160;
    lampCv.height = 48;
    lampTex = new THREE.CanvasTexture(lampCv);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(180, 54), new THREE.MeshBasicMaterial({ map: lampTex, transparent: true }));
    lamp.position.set(BOX_X + 170, 905, BOX_Z + 200);
    lamp.rotation.x = -0.5;
    scene.add(lamp);

    /* --- 水ジェットと湯気 --- */
    jets = new THREE.InstancedMesh(new THREE.SphereGeometry(7, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xbfe4f4, transparent: true, opacity: 0.65 }), 60);
    jets.frustumCulled = false;
    scene.add(jets);
    jetState = [];
    for (let i = 0; i < 60; i++) jetState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    steam = new THREE.InstancedMesh(new THREE.SphereGeometry(12, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf0f6f8, transparent: true, opacity: 0.45 }), 30);
    steam.frustumCulled = false;
    scene.add(steam);
    steamState = [];
    for (let i = 0; i < 30; i++) steamState.push({ on: false, x: 0, y: 0, z: 0, vy: 0, age: 0 });
    dummy = new THREE.Object3D();

    /* --- お皿3枚 (よごれつき) と スロット --- */
    slots = [
      { x: -150, y: 355, taken: -1 }, { x: 0, y: 355, taken: -1 }, { x: 150, y: 355, taken: -1 },
    ];
    dishes = [];
    [0xf2f4f6, 0xf6efe2, 0xe8f0f4].forEach((col, i) => {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(85, 60, 16, 20),
        new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.5 }));
      plate.castShadow = true;
      g.add(plate);
      const dirt = new THREE.Mesh(new THREE.CylinderGeometry(62, 62, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0x9a6a2e, roughness: 0.9, transparent: true, opacity: 0.9 }));
      dirt.scale.y = 0.35;
      dirt.position.y = 6;
      g.add(dirt);
      g.position.set(320 + (i % 2) * 115, 885, 240 + Math.floor(i / 2) * 140);
      scene.add(g);
      dishes.push({ g, dirt, dirty: 1, slot: -1, home: g.position.clone() });
      window.__pts['dish' + i] = g;
    });

    /* --- 洗剤タブレット --- */
    tab = new THREE.Group();
    tab.position.set(160, 890, 380);
    scene.add(tab);
    G3.add(tab, new THREE.BoxGeometry(70, 34, 52),
      new THREE.MeshPhysicalMaterial({ color: 0xf0f2f4, roughness: 0.3, clearcoat: 0.6 }), 0, 0, 0).castShadow = true;
    G3.add(tab, new THREE.SphereGeometry(16, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xd04040, roughness: 0.25, clearcoat: 0.7 }), 0, 22, 0);
    window.__pts.tab = tab;

    /* --- カレーなべ (またよごす用) --- */
    pot = new THREE.Group();
    pot.position.set(460, 880, 60);
    scene.add(pot);
    const potM = new THREE.MeshStandardMaterial({ color: 0xc84838, metalness: 0.3, roughness: 0.35 });
    G3.add(pot, new THREE.CylinderGeometry(90, 80, 80, 18, 1, true), potM).material.side = THREE.DoubleSide;
    G3.add(pot, new THREE.CylinderGeometry(80, 80, 10, 18), potM, 0, -38, 0);
    G3.add(pot, new THREE.CylinderGeometry(72, 72, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x8a5a24, roughness: 0.85 }), 0, 0, 0);
    window.__pts.pot = pot;
  }

  function drawLamp() {
    const c = lampCv.getContext('2d');
    c.clearRect(0, 0, 160, 48);
    c.textAlign = 'center';
    c.font = 'bold 20px sans-serif';
    const label = phase === 'wash' ? ['あらってます', '#40a8e0']
      : phase === 'rinse' ? ['すすぎ', '#40c8a0']
      : phase === 'dry' ? ['かんそう', '#f0a030']
      : phase === 'done' ? ['ピカピカ!', '#50c860'] : ['', '#888'];
    c.fillStyle = label[1];
    c.fillText(label[0], 80, 30);
    lampTex.needsUpdate = true;
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
    for (const d of dishes) {
      if (phase === 'idle' && near(d.g, 110)) {
        if (d.slot >= 0) { slots[d.slot].taken = -1; d.slot = -1; }
        dragObj = d;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (phase === 'idle' && !tabIn && near(tab, 90)) {
      dragObj = 'tab';
      dragId = e.pointerId;
      S.plip(1.5);
      return;
    }
    if (near(startBtn, 85)) {
      if (phase === 'idle' && doorA < 0.15 && dishes.some(d => d.slot >= 0)) {
        phase = 'wash';
        phaseT = 0;
        washTab = tabIn;   /* このサイクルで洗剤を使ったか */
        S.clickReal(0.9);
        drawLamp();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(door, 320, 320)) {
      if (phase === 'idle' || phase === 'done') {
        door.userData.target = doorA > 0.5 ? 0 : 1;
        if (phase === 'done' && door.userData.target === 1) {
          phase = 'idle';
          tab.visible = true;
          tab.position.copy(tab.userData.home);
          S.sparkle();
          drawLamp();
        }
        S.kachi();
      } else {
        S.buzz();
      }
      return;
    }
    if (near(pot, 120)) {
      /* カレー! 外にあるお皿がまたよごれる */
      let n = 0;
      dishes.forEach(d => {
        if (d.slot < 0 && d.dirty < 0.4) { d.dirty = 1; n++; }
      });
      if (n > 0) S.squishReal(0.6);
      else S.clickReal(0.3);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (500 - o.y) / d.y;
      if (t > 0) {
        const p = new THREE.Vector3(o.x + d.x * t, 500, o.z + d.z * t);
        (dragObj === 'tab' ? tab : dragObj.g).position.copy(p);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.8, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj === 'tab') {
        const pv = new THREE.Vector3();
        pocket.getWorldPosition(pv);
        const tq = groundPoint(tab.position, pv.y);
        if (doorA > 0.5 && Math.hypot(tq.x - pv.x, tq.z - pv.z) < 170) {
          tabIn = true;
          tab.visible = false;
          S.kachi();
        } else {
          tab.position.copy(tab.userData.home);
        }
      } else {
        const d = dragObj;
        const q = groundPoint(d.g.position, 360);
        let put = false;
        if (doorA > 0.5) {
          /* いちばん近いあいたスロットへ (視差補正済み) */
          let bs = null, bd = 200;
          for (const s of slots) {
            const dd = Math.hypot(q.x - (BOX_X + s.x), q.z - BOX_Z);
            if (s.taken < 0 && dd < bd) { bs = s; bd = dd; }
          }
          if (bs) {
            bs.taken = dishes.indexOf(d);
            d.slot = slots.indexOf(bs);
            d.g.position.set(BOX_X + bs.x, bs.y, BOX_Z);
            d.g.rotation.z = 0.12;
            S.kachi();
            put = true;
          }
        }
        if (!put) {
          d.g.position.copy(d.home);
          d.g.rotation.z = 0;
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

    doorA += ((door.userData.target || 0) - doorA) * Math.min(1, dt * 5);
    door.rotation.x = doorA * 1.45;

    const washing = phase === 'wash' || phase === 'rinse';
    if (washing) {
      phaseT += dt;
      armSpin += dt * 9;
      sprayArm.rotation.y = armSpin;
      if (pump) pump.set(0.55);
      /* ジェット噴射 */
      jetState.forEach(j => {
        if (!j.on && Math.random() < dt * 22) {
          const nozzle = (Math.random() * 5 | 0) - 2;
          const a = armSpin;
          j.on = true;
          j.x = BOX_X + Math.cos(a) * nozzle * 90;
          j.z = BOX_Z - Math.sin(a) * nozzle * 90;
          j.y = 220;
          j.vx = (Math.random() - 0.5) * 80;
          j.vz = (Math.random() - 0.5) * 80;
          j.vy = 380 + Math.random() * 200;
        }
      });
      /* よごれが落ちる (ラックのお皿だけ・洗剤で速く/なしだと洗い残し) */
      const rate = phase === 'wash' ? (washTab ? 0.16 : 0.05) : 0.04;
      const fl = washTab ? 0 : 0.45;
      dishes.forEach(d => {
        if (d.slot >= 0 && d.dirty > fl) d.dirty = Math.max(fl, d.dirty - dt * rate);
      });
      if (phase === 'wash' && phaseT > 7) {
        phase = 'rinse';
        phaseT = 0;
        tabIn = false;
        S.glug();
        drawLamp();
      } else if (phase === 'rinse' && phaseT > 4) {
        phase = 'dry';
        phaseT = 0;
        if (pump) pump.set(0.15);
        drawLamp();
      }
    } else if (phase === 'dry') {
      phaseT += dt;
      heaterCoil.material.emissive.setRGB(0.8, 0.15, 0.02);
      steamState.forEach(s => {
        if (!s.on && Math.random() < dt * 6) {
          s.on = true;
          s.x = BOX_X + (Math.random() - 0.5) * 400;
          s.y = 200;
          s.z = BOX_Z + (Math.random() - 0.5) * 200;
          s.vy = 120 + Math.random() * 80;
          s.age = 0;
        }
      });
      if (phaseT > 4) {
        phase = 'done';
        heaterCoil.material.emissive.setRGB(0, 0, 0);
        if (pump) pump.set(0);
        S.ding();
        S.doorChime();
        drawLamp();
      }
    } else if (pump) {
      pump.set(0);
    }

    /* ジェット更新 */
    jetState.forEach((j, i) => {
      if (j.on) {
        j.vy -= 900 * dt;
        j.x += j.vx * dt;
        j.y += j.vy * dt;
        j.z += j.vz * dt;
        if (j.y < 160 || j.y > 800) j.on = false;
        dummy.position.set(j.x, j.y, j.z);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      jets.setMatrixAt(i, dummy.matrix);
    });
    jets.instanceMatrix.needsUpdate = true;
    steamState.forEach((s, i) => {
      if (s.on) {
        s.age += dt;
        s.y += s.vy * dt;
        if (s.age > 1.4) s.on = false;
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.setScalar(1 + s.age * 1.6);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      steam.setMatrixAt(i, dummy.matrix);
    });
    steam.instanceMatrix.needsUpdate = true;

    /* よごれの見た目 */
    dishes.forEach(d => {
      d.dirt.material.opacity = d.dirty * 0.9;
      d.dirt.visible = d.dirty > 0.03;
    });

    if (window.__dbgDW) window.__dbgDW({
      dirt: dishes.map(d => +d.dirty.toFixed(2)), slots: dishes.map(d => d.slot),
      tab: tabIn, door: +doorA.toFixed(2), phase, t: +phaseT.toFixed(1),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      doorA = 1; phase = 'idle'; phaseT = 0; armSpin = 0; tabIn = false; washTab = false;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(30, 480, 0),
        radius: 1500, radiusPortraitBase: 1750, radiusMaxPortrait: 2800,
        az: 0.18, po: 1.12,
      });
      build();
      door.userData.target = 1;
      tab.userData.home = tab.position.clone();
      drawLamp();
      pump = S.whirrLoop();
      pump.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: お皿 → 洗剤 → とびら → スタート → (おわったら)とびら */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.dish0, to: () => new THREE.Vector3(BOX_X - 150, 500, BOX_Z),
          when: () => phase === 'idle' && doorA > 0.5 && dishes.every(d => d.slot < 0),
          done: () => dishes.some(d => d.slot >= 0),
        },
        {
          kind: 'drag', at: () => tab, to: () => pocket,
          when: () => phase === 'idle' && doorA > 0.5 && dishes.some(d => d.slot >= 0) && !tabIn && tab.visible,
          done: () => tabIn,
        },
        {
          kind: 'tap', at: () => door,
          when: () => phase === 'idle' && doorA > 0.5 && dishes.some(d => d.slot >= 0) && tabIn,
          done: () => doorA < 0.3,
        },
        {
          kind: 'tap', at: () => startBtn,
          when: () => phase === 'idle' && doorA < 0.3 && dishes.some(d => d.slot >= 0),
          done: () => phase !== 'idle',
        },
        {
          kind: 'tap', at: () => door,
          when: () => phase === 'done' && doorA < 0.3,
          done: () => doorA > 0.5,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (pump) pump.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
