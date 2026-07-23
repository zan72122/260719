/* プリンター — 写実3D (断面)
 *
 * おうちで「ウィーン、カタカタ」動く箱の中は見えない。上を断面にして、
 * 給紙ローラー・キャリッジレール・インクヘッドの往復を見せる。
 * 連鎖: パッドにお絵かき → 印刷ボタン → 給紙ローラーが紙を1枚吸い込む →
 *       ヘッドが左右に走りながら1段ずつ絵が現れる → 排紙トレイへ →
 *       描いた絵がそのまま印刷されて出てくる
 * 分岐: 描く絵そのもの (無限) × 色 × インクは減っていき、カートリッジ交換。
 */
window.GAMES.printer = (() => {
  let stage3, scene, raf, prev, time;
  let bodyG, feedRoller, carriage, headG, inkTanks, padG, padMesh, padCv, padTex;
  let paperMesh, paperCv, paperTex, outPapers, printBtn, colorBtns, inkGauge;
  let drawing, drawnAny, curCol, ink, printing, printProg, paperY, printsN;
  let dragId, orbitId, orbitFrom;
  let servo, mats;

  const COLORS = ['#d8443a', '#3a6ad8', '#3aa84a'];
  const PR_X = -140, PR_Z = -60;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#e4e6ea', '#f0f1f4', '#b8bcc4');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb0a088, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1500, 1300), shadowSpan: 1000, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.7 }), 0, 700, -420);
    /* つくえ */
    G3.add(scene, new THREE.BoxGeometry(1600, 90, 760),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.55 }), 0, 45, 60).receiveShadow = true;

    /* --- プリンター本体 (上面が断面・中が見える) --- */
    bodyG = new THREE.Group();
    bodyG.position.set(PR_X, 90, PR_Z);
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8eaec, roughness: 0.3, clearcoat: 0.4 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.5 });
    G3.add(bodyG, new THREE.BoxGeometry(560, 30, 380), darkM, 0, 15, 0);
    G3.add(bodyG, new THREE.BoxGeometry(560, 180, 30), shellM, 0, 105, -175).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(30, 180, 380), shellM, -265, 105, 0).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(30, 180, 380), shellM, 265, 105, 0);
    G3.add(bodyG, new THREE.BoxGeometry(560, 60, 30), shellM, 0, 75, 175);
    /* うしろの給紙トレイ (紙の束) */
    const tray = G3.add(bodyG, new THREE.BoxGeometry(360, 20, 200), shellM, 0, 220, -220);
    tray.rotation.x = 0.5;
    const stack = G3.add(bodyG, new THREE.BoxGeometry(320, 26, 180),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9 }), 0, 248, -228);
    stack.rotation.x = 0.5;
    /* 給紙ローラー */
    feedRoller = G3.add(bodyG, new THREE.CylinderGeometry(34, 34, 340, 12),
      new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.6 }), 0, 130, -120);
    feedRoller.rotation.z = Math.PI / 2;
    /* キャリッジレール + ヘッド */
    G3.add(bodyG, new THREE.CylinderGeometry(10, 10, 500, 8), mats.chrome, 0, 150, 20).rotation.z = Math.PI / 2;
    carriage = new THREE.Group();
    carriage.position.set(-180, 150, 20);
    bodyG.add(carriage);
    headG = G3.add(carriage, new THREE.BoxGeometry(90, 80, 70), darkM, 0, -10, 0);
    headG.castShadow = true;
    /* インクタンク (3色・ヘッドの上) */
    inkTanks = [];
    COLORS.forEach((c, i) => {
      const t = G3.add(carriage, new THREE.BoxGeometry(24, 40, 30),
        new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c), roughness: 0.3, transparent: true, opacity: 0.85 }),
        -26 + i * 26, 40, 0);
      inkTanks.push(t);
    });

    /* --- 紙 (印刷中に動く・CanvasTexture) --- */
    paperCv = document.createElement('canvas');
    paperCv.width = 256;
    paperCv.height = 340;
    paperTex = new THREE.CanvasTexture(paperCv);
    paperMesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 400),
      new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.85, side: THREE.DoubleSide }));
    paperMesh.visible = false;
    scene.add(paperMesh);

    /* --- 排紙たまり --- */
    outPapers = new THREE.Group();
    outPapers.position.set(PR_X, 100, PR_Z + 330);
    scene.add(outPapers);

    /* --- お絵かきパッド (たてかけたタブレット) --- */
    padG = new THREE.Group();
    padG.position.set(320, 260, 230);
    padG.rotation.x = -0.5;
    padG.rotation.y = -0.25;
    scene.add(padG);
    G3.add(padG, new THREE.BoxGeometry(360, 470, 26), darkM, 0, 0, -16).castShadow = true;
    padCv = document.createElement('canvas');
    padCv.width = 256;
    padCv.height = 340;
    padTex = new THREE.CanvasTexture(padCv);
    padMesh = new THREE.Mesh(new THREE.PlaneGeometry(330, 440),
      new THREE.MeshBasicMaterial({ map: padTex }));
    padG.add(padMesh);
    window.__pts.pad = padG;
    clearPad();

    /* --- 色ボタン3つ + 消すボタン --- */
    colorBtns = [];
    COLORS.forEach((c, i) => {
      const b = G3.add(scene, new THREE.CylinderGeometry(30, 34, 18, 14),
        new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c), roughness: 0.25, clearcoat: 0.6 }),
        130 + i * 85, 108, 460);
      colorBtns.push(b);
      window.__pts['col' + i] = b;
    });
    const eraseBtn = G3.add(scene, new THREE.CylinderGeometry(30, 34, 18, 14),
      new THREE.MeshPhysicalMaterial({ color: 0xf0f0f0, roughness: 0.25, clearcoat: 0.6 }), 385, 108, 460);
    window.__pts.erase = eraseBtn;
    colorBtns.push(eraseBtn);

    /* --- 印刷ボタン + インク残量 --- */
    printBtn = G3.add(scene, new THREE.CylinderGeometry(40, 46, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x2f8ed0, roughness: 0.25, clearcoat: 0.6 }), PR_X + 200, 200, PR_Z + 190);
    printBtn.rotation.x = 0.4;
    window.__pts.pbtn = printBtn;
    inkGauge = G3.add(scene, new THREE.BoxGeometry(20, 90, 20),
      new THREE.MeshPhysicalMaterial({ color: 0x3a6ad8, roughness: 0.3, transparent: true, opacity: 0.8 }),
      PR_X - 220, 235, PR_Z + 190);
    /* インクの予備カートリッジ (交換用) */
    const spare = new THREE.Group();
    spare.position.set(-380, 130, 200);
    scene.add(spare);
    COLORS.forEach((c, i) => {
      G3.add(spare, new THREE.BoxGeometry(40, 70, 46),
        new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c), roughness: 0.3, transparent: true, opacity: 0.9 }),
        (i - 1) * 52, 0, 0).castShadow = true;
    });
    window.__pts.spare = spare;
  }

  function clearPad() {
    const c = padCv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 340);
    c.strokeStyle = '#d8dce2';
    c.lineWidth = 4;
    c.strokeRect(4, 4, 248, 332);
    padTex.needsUpdate = true;
    drawnAny = false;
  }

  /* ---------------- 入力 ---------------- */

  function padDraw(e, isDown) {
    const ray = stage3.setRay(e);
    const hits = ray.intersectObject(padMesh);
    if (hits.length === 0) return false;
    const uv = hits[0].uv;
    const x = uv.x * 256, y = (1 - uv.y) * 340;
    const c = padCv.getContext('2d');
    c.strokeStyle = c.fillStyle = COLORS[curCol];
    c.lineWidth = 14;
    c.lineCap = 'round';
    if (isDown || !padG.userData.lx) {
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(padG.userData.lx, padG.userData.ly);
      c.lineTo(x, y);
      c.stroke();
    }
    padG.userData.lx = x;
    padG.userData.ly = y;
    padTex.needsUpdate = true;
    drawnAny = true;
    return true;
  }

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    const near = (obj, rad, dy) => {
      obj.getWorldPosition(v);
      v.y += dy || 0;
      return ray.ray.distanceToPoint(v) < rad;
    };
    for (let i = 0; i < colorBtns.length; i++) {
      if (near(colorBtns[i], 55)) {
        if (i === 3) {
          clearPad();
          S.snapBack();
        } else {
          curCol = i;
          S.clickReal(0.6 + i * 0.15);
        }
        return;
      }
    }
    if (near(printBtn, 90)) {
      if (!printing && drawnAny && ink > 0.12) {
        printing = true;
        printProg = 0;
        paperY = 0;
        preparePaper();
        S.clickReal(0.9);
        S.printFeed(1.2);
      } else if (ink <= 0.12) {
        S.buzz();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(window.__pts.spare, 120)) {
      if (ink < 0.9) {
        ink = 1;
        S.kachi();
        S.ding();
      } else {
        S.clickReal(0.3);
      }
      return;
    }
    if (padDraw(e, true)) {
      drawing = true;
      dragId = e.pointerId;
      S.plip(1.6);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (drawing && e.pointerId === dragId) {
      padDraw(e, false);
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.55, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.32);
    }
  }

  function onUp(e) {
    if (drawing && e.pointerId === dragId) {
      drawing = false;
      dragId = null;
      padG.userData.lx = null;
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* 印刷用の紙を白紙で用意 */
  function preparePaper() {
    const c = paperCv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 340);
    paperTex.needsUpdate = true;
    paperMesh.visible = true;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    if (printing) {
      printProg = Math.min(1, printProg + dt * 0.16);
      feedRoller.rotation.x += dt * 6;
      /* ヘッドが左右に走る */
      const sweep = Math.sin(printProg * Math.PI * 12);
      carriage.position.x = sweep * 190;
      if (servo) servo.set(0.5);
      /* 紙が手前に送られながら、描いた絵が上から現れる */
      const c = paperCv.getContext('2d');
      const rows = Math.floor(printProg * 340);
      c.drawImage(padCv, 0, 0, 256, rows, 0, 0, 256, rows);
      paperTex.needsUpdate = true;
      const wy = 90 + 150;
      paperMesh.rotation.x = -Math.PI / 2 + 0.1;
      paperMesh.position.set(PR_X, 165, PR_Z - 120 + printProg * 400);
      ink = Math.max(0, ink - dt * 0.035);
      if (Math.floor(time * 6) % 3 === 0 && Math.random() < dt * 10) S.tick();
      if (printProg >= 1) {
        printing = false;
        printsN++;
        if (servo) servo.set(0.05);
        /* 排紙トレイに固定コピーを置く */
        const cv2 = document.createElement('canvas');
        cv2.width = 256;
        cv2.height = 340;
        cv2.getContext('2d').drawImage(paperCv, 0, 0);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(300, 400),
          new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv2), roughness: 0.85, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2 + 0.08;
        m.position.set((printsN % 3) * 24 - 24, printsN * 3, 60 + (printsN % 2) * 30);
        m.rotation.z = ((printsN * 37) % 10 - 5) * 0.04;
        outPapers.add(m);
        paperMesh.visible = false;
        S.ding();
        S.flipPage();
      }
    } else if (servo) {
      servo.set(0);
    }
    /* インク残量ゲージとタンクのへり */
    inkGauge.scale.y = Math.max(0.05, ink);
    inkGauge.position.y = 235 - (1 - Math.max(0.05, ink)) * 45;
    inkTanks.forEach(t => { t.material.opacity = 0.25 + ink * 0.65; });

    if (window.__dbgPT) window.__dbgPT({
      drawn: drawnAny, col: curCol, ink: +ink.toFixed(2),
      printing, prog: +printProg.toFixed(2), prints: printsN,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      drawing = false; drawnAny = false; curCol = 0; ink = 1;
      printing = false; printProg = 0; printsN = 0;
      dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 280, 100),
        radius: 1300, radiusPortraitBase: 1600, radiusMaxPortrait: 2600,
        az: 0.1, po: 1.0,
      });
      build();
      servo = S.servoLoop();
      servo.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: パッドに描く → 印刷ボタン */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => padG, to: () => {
            const v = new THREE.Vector3();
            padG.getWorldPosition(v);
            v.x += 100;
            v.y += 120;
            return v;
          },
          when: () => !drawnAny && !printing,
          done: () => drawnAny,
        },
        {
          kind: 'tap', at: () => printBtn,
          when: () => drawnAny && !printing && printsN === 0,
          done: () => printing || printsN > 0,
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
