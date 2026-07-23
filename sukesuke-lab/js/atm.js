/* ATM — 写実3D (断面)
 *
 * 親のうしろからいつも見ている「お金が出てくる機械」。
 * 側面を断面にして、カードを吸い込むローラーと、お札が金庫カセットから
 * ベルトで数えられながら運ばれてくる道を見せる。
 * 連鎖: カードを入れる → ローラーが吸い込む → 暗証番号ボタン4回 →
 *       金額ボタン → カセットからお札が1枚ずつ繰り出されてベルトで搬送 →
 *       カウンターの数字が増える → シャッターが開いてお札が出る → 取る →
 *       カードがもどってくる
 * 分岐: 金額 (枚数) × カセットの残り × さいふのお札はたまっていく。
 *       カセットが空になったら補充ボタン。
 */
window.GAMES.atm = (() => {
  let stage3, scene, raf, prev, time;
  let atmG, cardMesh, cardHome, rollers, dispCv, dispTex, shutter, padBtns, amtBtns;
  let cassette, cassetteBills, pathBills, outBills, walletStack, refillBtn;
  let state, pin, count, countTarget, wallet, cassetteN, billAnim;
  let dragMode, dragId, orbitId, orbitFrom;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d8e0dc', '#e8ece8', '#a8b4ac');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1100, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2400, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xe0dcd0, roughness: 0.7 }), 0, 700, -400);

    /* --- ATM本体 (右側面が断面) --- */
    atmG = new THREE.Group();
    atmG.position.set(-80, 0, 0);
    scene.add(atmG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, roughness: 0.3, clearcoat: 0.5 });
    G3.add(atmG, new THREE.BoxGeometry(480, 30, 400), shellM, 0, 985, -40).castShadow = true;
    G3.add(atmG, new THREE.BoxGeometry(480, 980, 30), shellM, 0, 490, -230);
    G3.add(atmG, new THREE.BoxGeometry(30, 980, 400), shellM, -225, 490, -40).castShadow = true;
    /* 前面: ななめの操作面 */
    const face = G3.add(atmG, new THREE.BoxGeometry(480, 340, 26), shellM, 0, 560, 130);
    face.rotation.x = -0.5;
    face.castShadow = true;
    G3.add(atmG, new THREE.BoxGeometry(480, 420, 200), shellM, 0, 210, 60);

    /* 画面 */
    dispCv = document.createElement('canvas');
    dispCv.width = 256;
    dispCv.height = 160;
    dispTex = new THREE.CanvasTexture(dispCv);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(300, 190),
      new THREE.MeshBasicMaterial({ map: dispTex }));
    disp.position.set(-60, 700, 92);
    disp.rotation.x = -0.25;
    atmG.add(disp);

    /* カード口 (ローラーが断面で見える) */
    G3.add(atmG, new THREE.BoxGeometry(120, 16, 40),
      new THREE.MeshStandardMaterial({ color: 0x1a5c8a, roughness: 0.4 }), 150, 700, 100);
    rollers = [];
    for (let i = 0; i < 3; i++) {
      const r = G3.add(atmG, new THREE.CylinderGeometry(16, 16, 90, 10),
        new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 }), 150, 690 - i * 8, 60 - i * 45);
      r.rotation.z = Math.PI / 2;
      rollers.push(r);
    }

    /* 暗証ボタン4つと金額ボタン2つ (ななめ面の上) */
    padBtns = [];
    const padCols = [0xd85a4a, 0xe8b23a, 0x4ab26a, 0x4a86d8];
    padCols.forEach((c, i) => {
      const b = G3.add(atmG, new THREE.CylinderGeometry(30, 33, 20, 14),
        new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.5 }),
        -140 + i * 90, 555, 170);
      b.rotation.x = -0.5;
      padBtns.push(b);
      window.__pts['pad' + i] = b;
    });
    amtBtns = [];
    [[0xe8e4dc, '1'], [0xc8b458, '3']].forEach(([c, t], i) => {
      const b = G3.add(atmG, new THREE.BoxGeometry(110, 20, 60),
        new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 0.4 }),
        -90 + i * 180, 480, 205);
      b.rotation.x = -0.5;
      b.userData.n = i === 0 ? 1 : 3;
      amtBtns.push(b);
      window.__pts['amt' + i] = b;
    });

    /* お札の出口とシャッター */
    G3.add(atmG, new THREE.BoxGeometry(220, 20, 60),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }), 0, 380, 165);
    shutter = G3.add(atmG, new THREE.BoxGeometry(200, 12, 44), mats.steel, 0, 382, 165);
    window.__pts.billslot = shutter;

    /* --- 断面の中: カセットとお札の道 --- */
    cassette = G3.add(atmG, new THREE.BoxGeometry(260, 160, 160),
      new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.5 }), -40, 130, -80);
    cassette.castShadow = true;
    window.__pts.cassette = cassette;
    /* 中のお札の束 */
    cassetteBills = G3.add(atmG, new THREE.BoxGeometry(180, 120, 90),
      new THREE.MeshStandardMaterial({ color: 0xd8e0c8, roughness: 0.7 }), -40, 130, -80);
    /* 搬送ベルト (ななめ上へ) */
    const beltM = new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.7 });
    const belt = G3.add(atmG, new THREE.BoxGeometry(24, 340, 8), beltM, 60, 300, -40);
    belt.rotation.x = 0.35;
    for (let i = 0; i < 3; i++) {
      const r = G3.add(atmG, new THREE.CylinderGeometry(14, 14, 60, 10), mats.brass, 60, 180 + i * 110, -80 + i * 40);
      r.rotation.z = Math.PI / 2;
    }
    /* 飛んでいくお札 (アニメ用) */
    pathBills = [];
    for (let i = 0; i < 3; i++) {
      const b = G3.add(atmG, new THREE.BoxGeometry(90, 4, 50),
        new THREE.MeshStandardMaterial({ color: 0xe8ecd8, roughness: 0.6 }), 0, 0, 0);
      b.visible = false;
      pathBills.push(b);
    }
    outBills = [];

    /* 補充ボタン */
    refillBtn = G3.add(scene, new THREE.CylinderGeometry(26, 30, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x505860, roughness: 0.4 }), -380, 140, 100);
    refillBtn.rotation.z = Math.PI / 2;
    window.__pts.refill = refillBtn;

    /* --- カードとさいふ (台の上) --- */
    G3.add(scene, new THREE.BoxGeometry(300, 90, 200),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), 420, 45, 300).castShadow = true;
    const walletM = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(180, 30, 120), walletM, 420, 105, 300).castShadow = true;
    walletStack = new THREE.Group();
    walletStack.position.set(420, 122, 300);
    scene.add(walletStack);
    cardMesh = G3.add(scene, new THREE.BoxGeometry(90, 6, 60),
      new THREE.MeshPhysicalMaterial({ color: 0x2a6ad8, roughness: 0.3, clearcoat: 0.6 }), 350, 128, 240);
    cardMesh.castShadow = true;
    cardHome = cardMesh.position.clone();
    window.__pts.card = cardMesh;
  }

  function drawScreen() {
    const c = dispCv.getContext('2d');
    c.fillStyle = '#10305a';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#d8e8ff';
    c.textAlign = 'center';
    c.font = 'bold 24px sans-serif';
    if (state === 'idle') c.fillText('カードを どうぞ', 128, 60);
    else if (state === 'pin') {
      c.fillText('あんしょうばんごう', 128, 50);
      c.font = 'bold 44px sans-serif';
      c.fillText('●'.repeat(pin) + '○'.repeat(4 - pin), 128, 110);
    } else if (state === 'amount') c.fillText('なんまい だす？', 128, 60);
    else if (state === 'count') {
      c.fillText('かぞえています…', 128, 50);
      c.font = 'bold 56px sans-serif';
      c.fillText(String(count), 128, 120);
    } else if (state === 'take') c.fillText('おさつを どうぞ', 128, 60);
    else if (state === 'card') c.fillText('カードを おとりください', 128, 60);
    else if (state === 'empty') {
      c.fillStyle = '#ff8080';
      c.fillText('おさつが ありません', 128, 60);
      c.fillText('ほじゅうしてね', 128, 100);
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
    if (state === 'idle' && near(cardMesh, 90)) {
      dragMode = 'card';
      dragId = e.pointerId;
      return;
    }
    if (state === 'pin') {
      for (const b of padBtns) {
        if (near(b, 60)) {
          pin++;
          S.beepScan();
          drawScreen();
          if (pin >= 4) {
            state = 'amount';
            drawScreen();
          }
          return;
        }
      }
    }
    if (state === 'amount') {
      for (const b of amtBtns) {
        if (near(b, 80)) {
          const n = b.userData.n;
          if (cassetteN >= n) {
            countTarget = n;
            count = 0;
            state = 'count';
            billAnim = 0.001;
            S.clickReal(1);
          } else {
            state = 'empty';
            S.buzz();
          }
          drawScreen();
          return;
        }
      }
    }
    if (state === 'take' && near(shutter, 130, 40)) {
      /* お札を取る → さいふへ */
      outBills.forEach(b => scene.remove(b));
      outBills = [];
      for (let i = 0; i < countTarget; i++) {
        const b = G3.add(walletStack, new THREE.BoxGeometry(90, 4, 50),
          new THREE.MeshStandardMaterial({ color: 0xe8ecd8, roughness: 0.6 }), 0, wallet * 5 + i * 5, 0);
        b.rotation.y = (wallet + i) * 0.12;
      }
      wallet += countTarget;
      state = 'card';
      cardMesh.position.set(70, 705, 150);   /* カードが押し出される */
      S.ratchet(0.7);
      drawScreen();
      S.plip(1.8);
      return;
    }
    if (state === 'card' && near(cardMesh, 110)) {
      cardMesh.position.copy(cardHome);
      state = 'idle';
      drawScreen();
      S.plip(1.4);
      return;
    }
    if ((state === 'empty' || cassetteN === 0) && near(refillBtn, 70)) {
      cassetteN = 12;
      state = state === 'empty' ? 'amount' : state;
      drawScreen();
      S.thunk();
      S.ding();
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragMode === 'card' && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (700 - o.y) / d.y;
      if (t > 0) {
        cardMesh.position.set(o.x + d.x * t, 700, Math.max(80, o.z + d.z * t));
        /* カード口へ */
        if (Math.hypot(cardMesh.position.x - 70, cardMesh.position.z - 100) < 90) {
          state = 'insert';
          billAnim = 0.001;
          dragMode = null;
          dragId = null;
          S.ratchet(0.8);
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'card' && state === 'idle') cardMesh.position.copy(cardHome);
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

    /* カード吸い込み */
    if (state === 'insert') {
      billAnim += dt;
      rollers.forEach(r => { r.rotation.x += dt * 9; });
      cardMesh.position.z = Math.max(20, cardMesh.position.z - dt * 160);
      if (servo) servo.set(0.4);
      if (billAnim > 0.9) {
        state = 'pin';
        pin = 0;
        drawScreen();
        if (servo) servo.set(0.1);
      }
    }

    /* お札のカウントと搬送 */
    if (state === 'count') {
      billAnim += dt;
      rollers.forEach(r => { r.rotation.x += dt * 6; });
      if (servo) servo.set(0.5);
      const per = 0.7;
      const idx = Math.floor(billAnim / per);
      const f = (billAnim % per) / per;
      pathBills.forEach((b, i) => {
        if (i === idx % 3 && idx < countTarget) {
          b.visible = true;
          b.position.set(60 - f * 30, U.lerp(180, 380, f), U.lerp(-80, 140, f));
          b.rotation.x = f * 1.2;
        } else if (i !== idx % 3) {
          b.visible = false;
        }
      });
      if (idx > count && count < countTarget) {
        count = Math.min(countTarget, idx);
        cassetteN--;
        S.printFeed(0.12);
        drawScreen();
      }
      if (billAnim > per * countTarget + 0.4) {
        state = 'take';
        pathBills.forEach(b => { b.visible = false; });
        /* シャッターが開いてお札が出る */
        for (let i = 0; i < countTarget; i++) {
          const b = G3.add(scene, new THREE.BoxGeometry(90, 4, 50),
            new THREE.MeshStandardMaterial({ color: 0xe8ecd8, roughness: 0.6 }),
            -80 + i * 30, 400 + i * 6, 150);
          b.rotation.z = -0.15 + i * 0.12;
          b.castShadow = true;
          outBills.push(b);
        }
        drawScreen();
        S.snapBack();
        if (servo) servo.set(0.1);
      }
    }
    shutter.position.z = state === 'take' ? 120 : 165;

    /* カセットの残り表示 */
    cassetteBills.scale.y = Math.max(0.05, cassetteN / 12);
    cassetteBills.position.y = 130 - (1 - Math.max(0.05, cassetteN / 12)) * 55;

    if (window.__dbgAT) window.__dbgAT({
      state, pin, count, target: countTarget, wallet, cassette: cassetteN,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      state = 'idle'; pin = 0; count = 0; countTarget = 0; wallet = 0; cassetteN = 12; billAnim = 0;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 460, 60),
        radius: 1450, radiusPortraitBase: 1800, radiusMaxPortrait: 2900,
        az: 0.3, po: 1.05,
      });
      build();
      drawScreen();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: カード → ボタン4回 → 金額 → お札を取る */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => cardMesh, to: () => new THREE.Vector3(-10, 700, 100),
          when: () => state === 'idle', done: () => state !== 'idle',
        },
        {
          kind: 'tap', at: () => padBtns[pin % 4] || padBtns[0],
          when: () => state === 'pin', done: () => state === 'amount' || state === 'count' || state === 'take',
        },
        {
          kind: 'tap', at: () => amtBtns[0],
          when: () => state === 'amount', done: () => state === 'count' || state === 'take',
        },
        {
          kind: 'tap', at: () => shutter,
          when: () => state === 'take', done: () => wallet > 0,
        },
        {
          kind: 'tap', at: () => cardMesh,
          when: () => state === 'card', done: () => state === 'idle' && wallet > 0,
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
