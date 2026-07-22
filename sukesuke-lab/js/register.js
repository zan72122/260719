/* スーパーのレジ — 写実3D (断面)
 *
 * お母さんお父さんの後ろからいつも見ている機械を自分で操作する。
 * スキャナーの中の赤いレーザーと、引き出しのバネを断面で見せる。
 * 連鎖: 商品をベルトにのせる → ベルトが運ぶ → スキャナーの赤い光を通ると
 *       ピッ！ → 画面に値段が出て合計が増える → 商品は袋づめ台へ →
 *       合計ボタン → 引き出しがバネでチーン！と開く → レシートがジジジと出てくる →
 *       ちぎる → つぎのお客さんへ
 * 分岐: どの商品をどの順番でいくつ流すか × ベルトのタイミング × レシートの長さ。
 */
window.GAMES.register = (() => {
  const ITEMS = [
    { name: 'ぎゅうにゅう', col: 0xf0f0f4, price: 240, w: 70, h: 130, d: 70 },
    { name: 'りんご', col: 0xd84a3a, price: 150, w: 80, h: 80, d: 80 },
    { name: 'クッキー', col: 0xc89050, price: 320, w: 110, h: 60, d: 80 },
    { name: 'ジュース', col: 0x50a850, price: 180, w: 60, h: 140, d: 60 },
  ];
  const BELT_Y = 260;

  let stage3, scene, raf, prev, time;
  let items, beltMarks, scanLaser, scanLamp, dispCv, dispTex, total, scanned;
  let drawerG, drawerOpen, drawerSpring, receiptMesh, receiptLen, receiptOut;
  let totalBtn, dragObj, dragId, orbitId, orbitFrom;
  let servo, mats, dummy;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#dfe4e8', '#eceef0', '#b0b8c0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xc0bcb0, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1200, intensity: 0.95 });

    /* --- レジ台 + ベルト --- */
    const deskM = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 });
    G3.add(scene, new THREE.BoxGeometry(1400, 240, 360), deskM, 0, 120, 0).castShadow = true;
    const beltM = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.75 });
    G3.add(scene, new THREE.BoxGeometry(620, 16, 300), beltM, -340, BELT_Y - 12, 0);
    beltMarks = [];
    for (let i = 0; i < 6; i++) {
      const m = G3.add(scene, new THREE.BoxGeometry(10, 4, 290),
        new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6 }), 0, BELT_Y - 2, 0);
      beltMarks.push(m);
    }
    /* 袋づめ台 */
    G3.add(scene, new THREE.BoxGeometry(360, 20, 340),
      new THREE.MeshStandardMaterial({ color: 0xb09468, roughness: 0.55 }), 500, BELT_Y - 14, 0);

    /* --- スキャナーアーチ (断面: 赤いレーザーが見える) --- */
    const archM = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.45 });
    G3.add(scene, new THREE.BoxGeometry(80, 300, 40), archM, 60, BELT_Y + 130, -160).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(80, 26, 340), archM, 60, BELT_Y + 290, 0);
    /* レーザーの扇 */
    scanLaser = new THREE.Mesh(new THREE.PlaneGeometry(6, 300),
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    scanLaser.position.set(60, BELT_Y + 130, 0);
    scanLaser.rotation.x = 0;
    scene.add(scanLaser);
    scanLamp = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x403838 }));
    scanLamp.position.set(60, BELT_Y + 275, 40);
    scene.add(scanLamp);

    /* --- 客側ディスプレイ --- */
    dispCv = document.createElement('canvas');
    dispCv.width = 256;
    dispCv.height = 128;
    dispTex = new THREE.CanvasTexture(dispCv);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(260, 130),
      new THREE.MeshBasicMaterial({ map: dispTex }));
    disp.position.set(-130, BELT_Y + 260, -140);
    disp.rotation.y = 0.25;
    scene.add(disp);
    G3.add(scene, new THREE.BoxGeometry(280, 150, 20), archM, -132, BELT_Y + 258, -152).rotation.y = 0.25;
    G3.add(scene, new THREE.CylinderGeometry(12, 16, 120, 8), archM, -130, BELT_Y + 160, -150);
    drawDisplay('いらっしゃいませ');

    /* --- 引き出し (断面: バネが見える) --- */
    drawerG = new THREE.Group();
    drawerG.position.set(-40, 150, 180);
    scene.add(drawerG);
    const dw = G3.add(drawerG, new THREE.BoxGeometry(380, 90, 240),
      new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.4 }), 0, 0, 0);
    dw.castShadow = true;
    /* コイントレイ */
    for (let i = 0; i < 4; i++) {
      G3.add(drawerG, new THREE.CylinderGeometry(28, 28, 8, 12),
        [mats.brass, mats.chrome, mats.brass, mats.chrome][i], -130 + i * 85, 50, -40);
      G3.add(drawerG, new THREE.BoxGeometry(70, 6, 90),
        new THREE.MeshStandardMaterial({ color: [0x8a6ad8, 0x50a850, 0xd8a03a, 0xd85a4a][i], roughness: 0.6 }),
        -130 + i * 85, 48, 60);
    }
    drawerSpring = G3.springMesh(scene, mats.steel, 6, 18, 3.5);
    window.__pts.drawer = drawerG;

    /* --- 合計ボタンとレシート --- */
    totalBtn = G3.add(scene, new THREE.CylinderGeometry(42, 46, 24, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.3, clearcoat: 0.5 }), 250, BELT_Y + 40, 200);
    window.__pts.totalBtn = totalBtn;
    G3.add(scene, new THREE.BoxGeometry(140, 90, 120), archM, 250, BELT_Y + 40, 280).castShadow = true;
    /* レシートプリンタ (スリット) */
    G3.add(scene, new THREE.BoxGeometry(120, 14, 40),
      new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.5 }), 250, BELT_Y + 92, 250);
    receiptMesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
    receiptMesh.position.set(250, BELT_Y + 100, 252);
    receiptMesh.rotation.x = -0.4;
    scene.add(receiptMesh);
    window.__pts.receipt = receiptMesh;

    /* --- 商品 (手前のカゴ) --- */
    G3.add(scene, new THREE.BoxGeometry(340, 110, 240),
      new THREE.MeshPhysicalMaterial({ color: 0xc84050, roughness: 0.5, transparent: true, opacity: 0.55 }),
      -560, BELT_Y + 40, 320);
    items = [];
    ITEMS.forEach((it, i) => {
      const g = new THREE.Group();
      const m = new THREE.MeshPhysicalMaterial({ color: it.col, roughness: 0.4, clearcoat: 0.3 });
      const box = G3.add(g, it.name === 'りんご'
        ? new THREE.SphereGeometry(it.w / 2, 14, 10)
        : new THREE.BoxGeometry(it.w, it.h, it.d), m, 0, 0, 0);
      box.castShadow = true;
      /* バーコード */
      if (it.name !== 'りんご') {
        G3.add(g, new THREE.BoxGeometry(Math.min(50, it.w * 0.6), 26, 2),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 0, -it.h / 4, it.d / 2 + 1);
      }
      g.position.set(-640 + (i % 2) * 130, BELT_Y + 110 + it.h / 2 - 40, 280 + Math.floor(i / 2) * 90);
      scene.add(g);
      items.push({ g, it, state: 'basket', scannedAt: -9 });
      window.__pts['item' + i] = g;
    });

    dummy = new THREE.Object3D();
  }

  function drawDisplay(msg, price) {
    const c = dispCv.getContext('2d');
    c.fillStyle = '#0a2818';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#50e888';
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center';
    c.fillText(msg, 128, 46);
    if (price != null) {
      c.font = 'bold 44px sans-serif';
      c.fillText('¥' + price, 128, 100);
    }
    dispTex.needsUpdate = true;
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
    for (const item of items) {
      if ((item.state === 'basket' || item.state === 'bag') && near(item.g, 100)) {
        dragObj = item;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (near(totalBtn, 70)) {
      if (scanned > 0 && !drawerOpen) {
        drawerOpen = true;
        receiptOut = true;
        receiptLen = 20 + scanned * 40;
        S.clickReal(1);
        S.ding();
        S.printFeed(Math.min(1.2, scanned * 0.25));
        drawDisplay('ありがとうございました', total);
      } else {
        S.buzz();
      }
      return;
    }
    if (drawerOpen && near(drawerG, 220)) {
      /* 引き出しを閉める → つぎのお客さん */
      drawerOpen = false;
      receiptOut = false;
      receiptLen = 0;
      total = 0;
      scanned = 0;
      items.forEach((item, i) => {
        item.state = 'basket';
        item.g.position.set(-640 + (i % 2) * 130, BELT_Y + 110 + item.it.h / 2 - 40, 280 + Math.floor(i / 2) * 90);
      });
      drawDisplay('いらっしゃいませ');
      S.thunk();
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
      const t = (BELT_Y + 60 - o.y) / d.y;
      if (t > 0) {
        dragObj.g.position.set(o.x + d.x * t, BELT_Y + 60, U.clamp(o.z + d.z * t, -120, 380));
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.65, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      const p = dragObj.g.position;
      /* ベルトの上に置いたら流れはじめる */
      if (p.x > -660 && p.x < -60 && Math.abs(p.z) < 150) {
        dragObj.state = 'belt';
        p.y = BELT_Y + dragObj.it.h / 2;
        p.z = U.clamp(p.z, -80, 80);
        S.squishReal(0.4);
      } else if (dragObj.state !== 'bag') {
        dragObj.state = 'basket';
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

    /* ベルト */
    let moving = false;
    beltMarks.forEach((m, i) => {
      m.position.x = -640 + ((i * 105 + time * 90) % 610);
    });
    items.forEach(item => {
      if (item.state === 'belt' && dragObj !== item) {
        moving = true;
        item.g.position.x += 90 * dt;
        /* スキャナー通過 */
        if (item.g.position.x > 40 && item.g.position.x < 80 && time - item.scannedAt > 1) {
          item.scannedAt = time;
          total += item.it.price;
          scanned++;
          S.beepScan();
          drawDisplay(item.it.name, total);
          scanLamp.material.color.set(0x50e070);
        }
        /* 袋づめ台に到着 */
        if (item.g.position.x > 400) {
          item.state = 'bag';
          item.g.position.set(430 + Math.random() * 130, BELT_Y + item.it.h / 2, -60 + Math.random() * 140);
          S.thunk();
        }
      }
    });
    if (servo) servo.set(moving ? 0.4 : 0.12);
    if (time % 1 > 0.5) scanLamp.material.color.lerp(new THREE.Color(0x403838), 0.1);

    /* レーザーのちらつき */
    scanLaser.material.opacity = 0.3 + Math.abs(Math.sin(time * 17)) * 0.35;
    scanLaser.rotation.z = Math.sin(time * 9) * 0.5;

    /* 引き出しとバネ (バネは机の奥から引き出しの背中へ伸びる) */
    const dz = drawerOpen ? 190 : 0;
    drawerG.position.z += (180 + dz - drawerG.position.z) * Math.min(1, dt * (drawerOpen ? 14 : 6));
    drawerSpring.update(0, 150);
    if (drawerSpring.mesh) {
      drawerSpring.mesh.position.set(-40, 150, 20);
      drawerSpring.mesh.rotation.x = Math.PI / 2;
      drawerSpring.mesh.scale.y = Math.max(0.25, (drawerG.position.z - 140) / 150);
    }

    /* レシート */
    if (receiptOut && receiptMesh.scale.y < receiptLen / 10) {
      receiptMesh.scale.y = Math.min(receiptLen / 10, receiptMesh.scale.y + dt * 14);
      receiptMesh.position.y = BELT_Y + 100 + receiptMesh.scale.y * 5 * 0.8;
    }
    if (!receiptOut) {
      receiptMesh.scale.y = Math.max(0.01, receiptMesh.scale.y - dt * 30);
      receiptMesh.position.y = BELT_Y + 100 + receiptMesh.scale.y * 5 * 0.8;
    }

    if (window.__dbgRG) window.__dbgRG({
      total, scanned, drawer: drawerOpen,
      states: items.map(i => i.state),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      total = 0; scanned = 0; drawerOpen = false; receiptLen = 0; receiptOut = false;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-20, 320, 0),
        radius: 1500, radiusPortraitBase: 1900, radiusMaxPortrait: 3000,
        az: 0.2, po: 1.05,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 商品をベルトへ → 合計ボタン → 引き出しを閉める */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.item0, to: () => new THREE.Vector3(-400, BELT_Y + 60, 0),
          when: () => !drawerOpen, done: () => scanned > 0,
        },
        {
          kind: 'tap', at: () => totalBtn,
          when: () => scanned > 0 && !drawerOpen && items.every(i => i.state !== 'belt'),
          done: () => drawerOpen,
        },
        {
          kind: 'tap', at: () => drawerG,
          when: () => drawerOpen, done: () => !drawerOpen,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (servo) servo.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
