/* ごみ収集車 — 写実3D (断面)
 *
 * 収集のおにいさんしかさわれない、あの後ろの回る機械。
 * 荷箱の横を断面にして、回転板と押込み板とたまっていくゴミを見せる。
 * 連鎖: ゴミ袋を投入口へ → ボタン → 回転板がぐるんとかきこむ →
 *       押込み板がギュッと奥へ押し固める → 荷箱のゴミが増えていく →
 *       いっぱいになったら運転席をタップ → 荷箱が上がってダンプ → 空っぽに
 * 分岐: 袋を入れる順番と数 × いつ回すか × 満杯のタイミング。
 *       ゴミは本当に圧縮されて層になってたまる。
 */
window.GAMES.garbagetruck = (() => {
  const HOPPER = new THREE.Vector3(430, 160, 0);
  const MAX_FILL = 6;

  let stage3, scene, raf, prev, time;
  let truckG, bodyBox, rotPlate, pushPlate, tailG, fillBlocks, wheels;
  let bags, dragBag, dragId, orbitId, orbitFrom;
  let cycle, fill, dumpAnim, btnG, hopperBags;
  let rumble, mats;

  const BAG_COLS = [0x50a850, 0xe8c040, 0x4a86d8, 0xd85a4a, 0xa86ad8];

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#c8d8d0', '#e0e8e0', '#98aca0');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.8 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1400), shadowSpan: 1400, intensity: 0.95 });

    /* まちなみ: ブロックべいと電柱 */
    G3.add(scene, new THREE.BoxGeometry(2400, 200, 30),
      new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.8 }), 0, 100, -420);
    G3.add(scene, new THREE.CylinderGeometry(16, 18, 900, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.8 }), -640, 450, -380);

    /* --- 収集車 --- */
    truckG = new THREE.Group();
    scene.add(truckG);
    const cabM = new THREE.MeshPhysicalMaterial({ color: 0x3aa858, roughness: 0.3, clearcoat: 0.6 });
    /* キャブ */
    const cab = G3.add(truckG, new THREE.BoxGeometry(180, 190, 220), cabM, -390, 165, 0);
    cab.castShadow = true;
    G3.add(truckG, new THREE.BoxGeometry(150, 90, 200),
      new THREE.MeshPhysicalMaterial({ color: 0xa8c8d8, roughness: 0.1, transparent: true, opacity: 0.5 }),
      -390, 240, 0);
    window.__pts.cab = cab;
    /* 荷箱 (手前側面が断面) */
    bodyBox = new THREE.Group();
    truckG.add(bodyBox);
    const boxM = new THREE.MeshPhysicalMaterial({ color: 0x3aa858, roughness: 0.35, clearcoat: 0.5 });
    G3.add(bodyBox, new THREE.BoxGeometry(560, 16, 240), boxM, -10, 340, 0).castShadow = true;   /* 天 */
    G3.add(bodyBox, new THREE.BoxGeometry(560, 260, 14), boxM, -10, 210, -120);                  /* 奥板 */
    G3.add(bodyBox, new THREE.BoxGeometry(16, 260, 240), boxM, -290, 210, 0);                    /* 前板 */
    G3.add(bodyBox, new THREE.BoxGeometry(560, 16, 240), mats.steel, -10, 88, 0);                /* 床 */
    /* たまるゴミの層 */
    fillBlocks = [];
    for (let i = 0; i < MAX_FILL; i++) {
      const b = G3.add(bodyBox, new THREE.BoxGeometry(80, 220, 200),
        new THREE.MeshStandardMaterial({ color: 0x8a9060, roughness: 0.95 }), -240 + i * 88, 208, 0);
      b.scale.x = 0.01;
      fillBlocks.push(b);
    }

    /* --- テールゲート (投入口と機構・断面) --- */
    tailG = new THREE.Group();
    tailG.position.set(270, 0, 0);
    truckG.add(tailG);
    const tailM = new THREE.MeshStandardMaterial({ color: 0x2f8748, roughness: 0.4 });
    G3.add(tailG, new THREE.BoxGeometry(240, 60, 240), tailM, 90, 330, 0).castShadow = true;
    G3.add(tailG, new THREE.BoxGeometry(220, 280, 14), tailM, 100, 200, -120);
    /* 投入口の受け */
    G3.add(tailG, new THREE.BoxGeometry(200, 16, 220), mats.steel, 110, 70, 0);
    G3.add(tailG, new THREE.BoxGeometry(16, 120, 220), tailM, 205, 120, 0);
    /* 回転板 (ぐるんとかきこむ) */
    rotPlate = new THREE.Group();
    rotPlate.position.set(90, 190, 0);
    tailG.add(rotPlate);
    const rp = G3.add(rotPlate, new THREE.BoxGeometry(24, 150, 210), mats.steel, 0, -75, 0);
    rp.castShadow = true;
    /* 押込み板 */
    pushPlate = G3.add(tailG, new THREE.BoxGeometry(20, 200, 210), mats.chrome, 30, 200, 0);
    pushPlate.castShadow = true;

    /* --- 車輪 --- */
    wheels = [];
    [[-380], [-100], [140]].forEach(([x]) => {
      [-1, 1].forEach(s => {
        const w = G3.add(truckG, new THREE.CylinderGeometry(52, 52, 34, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), x, 54, s * 118);
        w.rotation.x = Math.PI / 2;
        wheels.push(w);
      });
    });

    /* --- 操作ボタン --- */
    btnG = G3.add(scene, new THREE.CylinderGeometry(36, 40, 22, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.35, clearcoat: 0.5 }), 620, 200, 130);
    btnG.rotation.x = 0.5;
    window.__pts.btn = btnG;
    G3.add(scene, new THREE.BoxGeometry(80, 180, 60),
      new THREE.MeshStandardMaterial({ color: 0x2f8748, roughness: 0.5 }), 620, 100, 100);

    /* --- ゴミ袋 (道ばた) --- */
    bags = [];
    BAG_COLS.forEach((c, i) => {
      const g = new THREE.Group();
      const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.3, transparent: true, opacity: 0.85 });
      const body = G3.add(g, new THREE.SphereGeometry(52, 12, 10), m, 0, 46, 0);
      body.scale.set(1, 0.92, 1);
      body.castShadow = true;
      G3.add(g, new THREE.SphereGeometry(16, 8, 6), m, 6, 96, 0);
      g.position.set(-440 + (i % 3) * 125, 0, 390 + Math.floor(i / 3) * 120);
      scene.add(g);
      bags.push({ g, state: 'street', home: g.position.clone() });
      window.__pts['bag' + i] = g;
    });
    hopperBags = [];
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
    for (const b of bags) {
      if (b.state === 'street' && near(b.g, 100, 40)) {
        dragBag = b;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (near(btnG, 80)) {
      if (cycle === 0 && hopperBags.length > 0) {
        cycle = 0.001;
        S.clickReal(1);
      } else if (hopperBags.length === 0) {
        S.buzz();
      }
      return;
    }
    const cab = window.__pts.cab;
    if (near(cab, 200, 60)) {
      if (fill >= MAX_FILL - 0.5 && dumpAnim === 0) {
        dumpAnim = 0.001;
        S.whoosh(0.6);
      } else if (dumpAnim === 0) {
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
    if (dragBag && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (140 - o.y) / d.y;
      if (t > 0) {
        dragBag.g.position.set(o.x + d.x * t, 140, U.clamp(o.z + d.z * t, -100, 520));
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (dragBag && e.pointerId === dragId) {
      /* 投入口に入れたか */
      const p = dragBag.g.position;
      if (p.x > 560 && p.x < 800 && Math.abs(p.z) < 140) {
        dragBag.state = 'hopper';
        dragBag.g.position.set(650 + hopperBags.length * 8, 110, (Math.random() - 0.5) * 60);
        hopperBags.push(dragBag);
        S.squishReal(0.5);
      } else {
        dragBag.g.position.copy(dragBag.home);
      }
      dragBag = null;
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

    if (rumble) rumble.set(0.18 + (cycle > 0 ? 0.35 : 0) + (dumpAnim > 0 ? 0.3 : 0));

    /* かきこみサイクル: 回転板が1回転 → 押込み板が押す */
    if (cycle > 0) {
      cycle += dt;
      if (cycle < 1.6) {
        rotPlate.rotation.z = -cycle / 1.6 * Math.PI * 2;
        /* 袋が板について中へ */
        hopperBags.forEach(b => {
          if (cycle > 0.5 && b.state === 'hopper') {
            b.state = 'in';
            b.g.visible = false;
            S.squishReal(0.7);
          }
        });
      } else if (cycle < 2.6) {
        const t = (cycle - 1.6) / 1;
        pushPlate.position.x = 30 - Math.sin(t * Math.PI) * 90;
        if (t > 0.45 && hopperBags.length) {
          fill = Math.min(MAX_FILL, fill + hopperBags.length * 1.2);
          hopperBags = [];
          S.thunk();
        }
      } else {
        cycle = 0;
        rotPlate.rotation.z = 0;
        pushPlate.position.x = 30;
      }
    }

    /* ゴミの層 */
    fillBlocks.forEach((b, i) => {
      const f = U.clamp(fill - i, 0, 1);
      b.scale.x = Math.max(0.01, f);
    });

    /* ダンプ: 荷箱が上がってゲートが開き、中身が出る */
    if (dumpAnim > 0) {
      dumpAnim += dt;
      if (dumpAnim < 1.6) {
        bodyBox.rotation.z = -dumpAnim / 1.6 * 0.7;
        tailG.rotation.z = -dumpAnim / 1.6 * 0.7;
        tailG.position.y = Math.sin(dumpAnim / 1.6 * Math.PI / 2) * 180;
      } else if (dumpAnim < 3) {
        fill = Math.max(0, fill - dt * 4);
      } else if (dumpAnim < 4.4) {
        const t = (4.4 - dumpAnim) / 1.4;
        bodyBox.rotation.z = -t * 0.7;
        tailG.rotation.z = -t * 0.7;
        tailG.position.y = Math.sin(t * Math.PI / 2) * 180;
      } else {
        dumpAnim = 0;
        bodyBox.rotation.z = 0;
        tailG.rotation.z = 0;
        tailG.position.y = 0;
        /* 袋を道にもどす (つぎの回収へ) */
        bags.forEach(b => {
          b.state = 'street';
          b.g.visible = true;
          b.g.position.copy(b.home);
        });
        S.ding();
      }
    }

    if (window.__dbgGT) window.__dbgGT({
      hopper: hopperBags.length, fill: +fill.toFixed(1),
      cycle: +cycle.toFixed(1), dump: +dumpAnim.toFixed(1),
      street: bags.filter(b => b.state === 'street').length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      cycle = 0; fill = 0; dumpAnim = 0;
      dragBag = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 220, 0),
        radius: 1800, radiusPortraitBase: 2400, radiusMaxPortrait: 3800,
        az: 0.2, po: 1.1,
      });
      build();
      rumble = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 袋を投入口へ → ボタン → 満杯で運転席 */
      GUIDE.start(stage3, [
        {
          /* 荷箱が満タン (排出できる量) になるまで、袋入れ→プレスを繰り返す:
             プレスで done が後戻りし、ガイドが自然に次の袋を指す */
          kind: 'drag', at: () => (bags.find(b => b.state === 'street') || bags[0]).g,
          to: () => new THREE.Vector3(660, 160, 0),
          when: () => bags.some(b => b.state === 'street') && hopperBags.length === 0 && cycle === 0 && dumpAnim === 0,
          done: () => hopperBags.length > 0 || fill >= MAX_FILL - 0.5,
        },
        {
          kind: 'tap', at: () => btnG,
          when: () => hopperBags.length > 0 && cycle === 0,
          done: () => hopperBags.length === 0,
        },
        {
          kind: 'tap', at: () => window.__pts.cab,
          when: () => fill >= MAX_FILL - 0.5 && dumpAnim === 0,
          done: () => dumpAnim > 0,
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
