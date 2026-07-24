/* 証明写真機 — 写実3D (断面)
 *
 * 駅前のカーテンの箱。中でなにが起きているのか、側面を断面にして
 * カメラとフラッシュとプリンターを見せる。
 * 連鎖: 人形をイスへ → イスをくるくる回して高さを合わせる (顔が枠に入るように) →
 *       ボタン → 3・2・1 のカウントダウン → フラッシュ！ →
 *       中のプリンターがジジジ → 写真がスリットから出てくる →
 *       写真にはそのしゅんかんの人形が本当に写っている
 * 分岐: イスの高さ × 人形の向き × シャッターのしゅんかん。
 *       撮った写真はトレイにたまっていく。
 */
window.GAMES.photobooth = (() => {
  const CAPW = 200, CAPH = 250;

  let stage3, scene, raf, prev, time;
  let boothG, stool, stoolH, curtain, camBox, flashPanel, frameLines, capCam;
  let btnG, prints, printCount, doll, dollOn;
  let countdown, flashT, printing, printMesh;
  let dragMode, dragId, dragA0, orbitId, orbitFrom;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d4dce4', '#e4e8ec', '#a0acb8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb0aca0, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1200, intensity: 0.95 });

    /* --- ボックス (手前が断面であいている) --- */
    boothG = new THREE.Group();
    scene.add(boothG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8e8ec, roughness: 0.3, clearcoat: 0.4 });
    G3.add(boothG, new THREE.BoxGeometry(700, 30, 500), shellM, 0, 985, -30).castShadow = true;
    G3.add(boothG, new THREE.BoxGeometry(700, 980, 30), shellM, 0, 490, -270);
    G3.add(boothG, new THREE.BoxGeometry(30, 980, 500), shellM, -335, 490, -30).castShadow = true;
    /* 右側は機械室の壁 */
    G3.add(boothG, new THREE.BoxGeometry(30, 980, 500), shellM, 250, 490, -30);
    /* カーテン (手前・半分あいている) */
    curtain = new THREE.Mesh(new THREE.PlaneGeometry(260, 700, 12, 1),
      new THREE.MeshStandardMaterial({ color: 0x3a5a9a, roughness: 0.85, side: THREE.DoubleSide }));
    const pos = curtain.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 0.08) * 18);
    }
    curtain.position.set(-200, 560, 210);
    scene.add(curtain);
    G3.add(scene, new THREE.CylinderGeometry(6, 6, 660, 8), mats.chrome, -30, 920, 210).rotation.z = Math.PI / 2;

    /* --- イス (回すと高さが変わる) --- */
    stool = new THREE.Group();
    stool.position.set(-60, 0, -60);
    scene.add(stool);
    G3.add(stool, new THREE.CylinderGeometry(90, 110, 20, 16), mats.darkPlastic, 0, 10, 0);
    G3.add(stool, new THREE.CylinderGeometry(16, 16, 200, 10), mats.chrome, 0, 110, 0);
    const seat = G3.add(stool, new THREE.CylinderGeometry(100, 100, 34, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x8a3a5a, roughness: 0.5, clearcoat: 0.4 }), 0, 220, 0);
    seat.castShadow = true;
    stool.userData.seat = seat;
    window.__pts.stool = stool;

    /* --- 機械室 (右・断面で見える) --- */
    /* カメラ */
    camBox = new THREE.Group();
    camBox.position.set(180, 480, -60);
    boothG.add(camBox);
    G3.add(camBox, new THREE.BoxGeometry(90, 90, 90), mats.darkPlastic, 0, 0, 0).castShadow = true;
    const lens = G3.add(camBox, new THREE.CylinderGeometry(28, 32, 50, 14), mats.chrome, -60, 0, 0);
    lens.rotation.z = Math.PI / 2;
    /* フラッシュパネル */
    flashPanel = G3.add(boothG, new THREE.BoxGeometry(16, 260, 200),
      new THREE.MeshBasicMaterial({ color: 0x888888 }), 180, 480, 140);
    /* プリンター */
    G3.add(boothG, new THREE.BoxGeometry(150, 120, 180),
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5 }), 160, 260, -60).castShadow = true;
    G3.add(boothG, new THREE.CylinderGeometry(30, 30, 100, 12), mats.whitePlastic, 130, 300, -60).rotation.x = Math.PI / 2;
    /* 写真の出口スリット (外側) */
    G3.add(scene, new THREE.BoxGeometry(20, 14, 130),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 }), 262, 300, 120);

    /* ねらいの枠 (顔がここに入ればOK) */
    const frameG = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-60, 440, -130), new THREE.Vector3(-60, 440, 10),
      new THREE.Vector3(-60, 440, 10), new THREE.Vector3(-60, 520, 10),
      new THREE.Vector3(-60, 520, 10), new THREE.Vector3(-60, 520, -130),
      new THREE.Vector3(-60, 520, -130), new THREE.Vector3(-60, 440, -130),
    ]);
    frameLines = new THREE.LineSegments(frameG,
      new THREE.LineBasicMaterial({ color: 0x50e070, transparent: true, opacity: 0.6 }));
    scene.add(frameLines);

    /* --- ボタン --- */
    btnG = G3.add(scene, new THREE.CylinderGeometry(34, 38, 22, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.3, clearcoat: 0.5 }), 130, 460, 190);
    btnG.rotation.x = 0.5;
    window.__pts.btn = btnG;
    G3.add(scene, new THREE.BoxGeometry(90, 130, 60),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5 }), 130, 400, 160);

    /* --- 人形 --- */
    const d = G3.doll({ shirt: 0xd85a4a });
    d.g.position.set(-480, 0, 300);
    scene.add(d.g);
    doll = d;
    window.__pts.doll = d.g;

    /* プリントのトレイ */
    G3.add(scene, new THREE.BoxGeometry(220, 20, 160),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), 420, 150, 200).castShadow = true;
    prints = new THREE.Group();
    prints.position.set(420, 165, 200);
    scene.add(prints);
    window.__pts.prints = prints;

    /* 撮影カメラ */
    capCam = new THREE.PerspectiveCamera(30, CAPW / CAPH, 10, 5000);
    capCam.position.set(150, 480, -60);
    capCam.lookAt(-60, 450, -60);
    scene.add(capCam);
  }

  /* 実撮影 → プリント */
  function capture() {
    const rt = new THREE.WebGLRenderTarget(CAPW, CAPH);
    const cv = document.createElement('canvas');
    cv.width = CAPW;
    cv.height = CAPH;
    const c = cv.getContext('2d');
    const buf = new Uint8Array(CAPW * CAPH * 4);
    const img = c.createImageData(CAPW, CAPH);
    curtain.visible = false;
    frameLines.visible = false;
    capCam.updateMatrixWorld(true);
    stage3.renderer.setRenderTarget(rt);
    stage3.renderer.render(scene, capCam);
    stage3.renderer.readRenderTargetPixels(rt, 0, 0, CAPW, CAPH, buf);
    for (let y = 0; y < CAPH; y++) {
      const src = (CAPH - 1 - y) * CAPW * 4;
      for (let x = 0; x < CAPW * 4; x++) img.data[y * CAPW * 4 + x] = buf[src + x];
    }
    c.putImageData(img, 0, 0);
    stage3.renderer.setRenderTarget(null);
    rt.dispose();
    curtain.visible = true;
    frameLines.visible = true;
    return cv;
  }

  function addPrint(cv) {
    const i = printCount++;
    const g = new THREE.Group();
    g.position.set((i % 3) * 30 - 30, i * 3, (i % 2) * 20 - 10);
    g.rotation.y = ((i * 41) % 10 - 5) * 0.05;
    const card = G3.add(g, new THREE.BoxGeometry(110, 2, 140),
      new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.6 }), 0, 0, 0);
    card.castShadow = true;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(96, 120),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.45 }));
    photo.rotation.x = -Math.PI / 2;
    photo.position.y = 1.2;
    g.add(photo);
    prints.add(g);
    S.plip(1.7);
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
    const grabDoll = () => {
      dragMode = 'doll';
      dragId = e.pointerId;
      dollOn = false;
      S.plip(1.3);
    };
    /* すわっている間はイス回しが優先 (人形は頭のあたりでつかめる) */
    if (!dollOn && near(doll.g, 120, 80)) { grabDoll(); return; }
    if (near(btnG, 70)) {
      if (countdown === 0 && !printing && flashT === 0) {
        countdown = 3.6;
        S.clickReal(0.9);
      }
      return;
    }
    if (near(stool, 170, 240)) {
      /* イスを回す (画面上の円ドラッグ) */
      dragMode = 'stool';
      dragId = e.pointerId;
      const sv = new THREE.Vector3();
      stool.getWorldPosition(sv);
      sv.project(stage3.camera);
      const r = stage3.renderer.domElement.getBoundingClientRect();
      stool.userData.cx = r.left + (sv.x + 1) / 2 * r.width;
      stool.userData.cy = r.top + (1 - (sv.y + 1) / 2) * r.height;
      dragA0 = Math.atan2(e.clientY - stool.userData.cy, e.clientX - stool.userData.cx);
      return;
    }
    if (dollOn && near(doll.g, 120, 80)) { grabDoll(); return; }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'doll') {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (200 - o.y) / d.y;
        if (t > 0) doll.g.position.set(o.x + d.x * t, 90, o.z + d.z * t);
      } else if (dragMode === 'stool') {
        const a = Math.atan2(e.clientY - stool.userData.cy, e.clientX - stool.userData.cx);
        let da = a - dragA0;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        dragA0 = a;
        stoolH = U.clamp(stoolH + da * 40, 0, 160);
        stool.userData.seat.rotation.y -= da;
        if (Math.abs(da) > 0.02) S.ratchet(0.2);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'doll') {
        /* イスの上に置いたか */
        const p = doll.g.position;
        const sv = new THREE.Vector3();
        stool.getWorldPosition(sv);
        if (Math.hypot(p.x - sv.x, p.z - sv.z) < 150) {
          dollOn = true;
          S.squishReal(0.4);
        } else {
          doll.g.position.y = 0;
        }
      }
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

    /* イスと人形 */
    stool.userData.seat.position.y = 220 + stoolH;
    if (dollOn && dragMode !== 'doll') {
      const sv = new THREE.Vector3();
      stool.getWorldPosition(sv);
      doll.g.position.set(sv.x, 240 + stoolH, sv.z);
      doll.g.rotation.y = stool.userData.seat.rotation.y * 0.3;
    }
    /* 顔が枠に入っているか (緑/赤) */
    const faceY = doll.g.position.y + 122;
    const inFrame = dollOn && faceY > 440 && faceY < 520;
    frameLines.material.color.set(inFrame ? 0x50e070 : 0xd84040);

    /* カウントダウン → フラッシュ → 撮影 → 印刷 */
    if (countdown > 0) {
      const before = Math.ceil(countdown);
      countdown -= dt;
      if (Math.ceil(countdown) < before && countdown > 0) S.beepScan();
      if (countdown <= 0) {
        countdown = 0;
        flashT = 0.35;
        S.boom(0.15);
        const cv = capture();
        printing = 2.2;
        printMesh = cv;
        S.printFeed(1);
      }
    }
    flashT = Math.max(0, flashT - dt);
    flashPanel.material.color.set(flashT > 0 ? 0xffffff : 0x888888);
    if (flashT > 0.2) {
      flashPanel.scale.set(1, 1.6, 1.6);
    } else {
      flashPanel.scale.set(1, 1, 1);
    }

    if (printing > 0) {
      printing -= dt;
      if (servo) servo.set(0.4);
      if (printing <= 0) {
        addPrint(printMesh);
        printMesh = null;
        if (servo) servo.set(0.1);
        S.ding();
      }
    }

    if (window.__dbgPB) window.__dbgPB({
      dollOn, stoolH: stoolH | 0, inFrame,
      countdown: +countdown.toFixed(1), printing: +printing.toFixed(1),
      prints: printCount,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      stoolH = 40; dollOn = false; countdown = 0; flashT = 0; printing = 0; printCount = 0;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 460, 0),
        radius: 1550, radiusPortraitBase: 1950, radiusMaxPortrait: 3100,
        az: 0.3, po: 1.1,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 人形をイスへ → イスを回して枠に合わせる → ボタン */
      GUIDE.start(stage3, [
        {
          /* 人形は y=200 平面上を動き、座らせた判定はスツールとのXZ距離。
             to はスツール原点 (床) ではなく平面上の真上を指す */
          kind: 'drag', at: () => doll.g, to: () => {
            const v = new THREE.Vector3();
            stool.getWorldPosition(v);
            v.y = 200;
            return v;
          },
          when: () => !dollOn, done: () => dollOn,
        },
        {
          kind: 'turn', at: () => stool, turnDir: 1,
          when: () => dollOn && !(doll.g.position.y + 122 > 440 && doll.g.position.y + 122 < 520),
          done: () => dollOn && doll.g.position.y + 122 > 440 && doll.g.position.y + 122 < 520,
        },
        {
          kind: 'tap', at: () => btnG,
          when: () => dollOn && countdown === 0 && printing <= 0,
          done: () => printCount > 0,
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
