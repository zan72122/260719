/* 駅の券売機 — 写実3D (断面)
 *
 * かいさつの相棒。コインを入れると切符が出てくる箱の中を見せる。
 * 連鎖: きんがくボタン → コインを入れる → 断面のレールをコロコロ転がって
 *       大きさで選別されて筒にたまる → 足りたらロール紙がジジッと印刷 →
 *       カッターがチョキン → 切符がポンと出る → おつりがチャリンと落ちる
 * 分岐: どのきっぷ × コインの組み合わせ (100/50/10) × 多めに入れるとおつり。
 *       とったきっぷとおつりは手もとにたまる。
 */
window.GAMES.kenbaiki = (() => {
  const FARES = [
    { label: 'ちかく', price: 150, col: 0xe8b23a },
    { label: 'となり', price: 200, col: 0x4ab26a },
    { label: 'とおく', price: 260, col: 0x4a86d8 },
  ];
  const COIN_DEF = [
    { v: 100, r: 32, col: 0xc8c8d0 },
    { v: 50, r: 27, col: 0xd8d8dc },
    { v: 10, r: 30, col: 0xb87333 },
  ];

  let stage3, scene, raf, prev, time;
  let bodyG, fareBtns, dispCv, dispTex, slotMesh, printerRoll, cutterMesh, ticketOut;
  let coins, tubes, cupG, changeCoins, ticketTray, tickets;
  let fareSel, inserted, printing, coinAnim;
  let dragCoin, dragId, orbitId, orbitFrom;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d4dce4', '#e4e8ec', '#a0acb8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1100, intensity: 0.95 });
    /* 駅の壁と路線図 */
    G3.add(scene, new THREE.BoxGeometry(2400, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xdcd8cc, roughness: 0.7 }), 0, 700, -400);
    G3.add(scene, new THREE.BoxGeometry(700, 200, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.5 }), 0, 1000, -382);

    /* --- 券売機本体 (右側面が断面) --- */
    bodyG = new THREE.Group();
    bodyG.position.set(-60, 0, 0);
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe4e6ea, roughness: 0.3, clearcoat: 0.5 });
    G3.add(bodyG, new THREE.BoxGeometry(460, 30, 360), shellM, 0, 985, -40).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(460, 980, 30), shellM, 0, 490, -210);
    G3.add(bodyG, new THREE.BoxGeometry(30, 980, 360), shellM, -215, 490, -40).castShadow = true;
    const face = G3.add(bodyG, new THREE.BoxGeometry(460, 500, 26), shellM, 0, 700, 120);
    face.rotation.x = -0.18;
    face.castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(460, 440, 170), shellM, 0, 220, 40);

    /* きんがくボタン3つ */
    fareBtns = [];
    FARES.forEach((f, i) => {
      const b = G3.add(bodyG, new THREE.BoxGeometry(110, 22, 70),
        new THREE.MeshPhysicalMaterial({ color: f.col, roughness: 0.35, clearcoat: 0.5 }),
        -130 + i * 130, 810, 148);
      b.rotation.x = -0.18;
      fareBtns.push(b);
      window.__pts['fare' + i] = b;
    });

    /* 画面 */
    dispCv = document.createElement('canvas');
    dispCv.width = 256;
    dispCv.height = 96;
    dispTex = new THREE.CanvasTexture(dispCv);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(280, 105),
      new THREE.MeshBasicMaterial({ map: dispTex }));
    disp.position.set(-30, 920, 122);
    disp.rotation.x = -0.18;
    bodyG.add(disp);

    /* コイン投入口 */
    slotMesh = G3.add(bodyG, new THREE.BoxGeometry(14, 60, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 }), 165, 700, 145);
    window.__pts.slot = slotMesh;

    /* --- 断面の中: コインレールと選別筒 --- */
    const railM = new THREE.MeshStandardMaterial({ color: 0x8a929a, metalness: 0.8, roughness: 0.35 });
    const rail = G3.add(bodyG, new THREE.BoxGeometry(10, 320, 16), railM, 150, 540, 40);
    rail.rotation.z = 1.05;
    tubes = [];
    COIN_DEF.forEach((cd, i) => {
      const t = G3.add(bodyG, new THREE.CylinderGeometry(cd.r + 8, cd.r + 8, 200, 12,
        1, true), new THREE.MeshPhysicalMaterial({
        color: 0xb8c4cc, roughness: 0.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      }), 20 - i * 90, 300, 40);
      tubes.push({ mesh: t, n: 2, cd, x: 20 - i * 90 });
    });
    /* 筒の中の初期コイン */
    tubes.forEach(tb => {
      tb.stack = [];
      for (let k = 0; k < tb.n; k++) {
        const c = G3.add(bodyG, new THREE.CylinderGeometry(tb.cd.r, tb.cd.r, 7, 14),
          new THREE.MeshStandardMaterial({ color: tb.cd.col, metalness: 0.9, roughness: 0.35 }),
          tb.x, 210 + k * 9, 40);
        tb.stack.push(c);
      }
    });

    /* --- ロール紙プリンターとカッター --- */
    printerRoll = G3.add(bodyG, new THREE.CylinderGeometry(46, 46, 60, 14), mats.whitePlastic, -100, 560, -60);
    printerRoll.rotation.z = Math.PI / 2;
    printerRoll.castShadow = true;
    G3.add(bodyG, new THREE.CylinderGeometry(12, 12, 60, 8), mats.steel, -30, 520, -60).rotation.z = Math.PI / 2;
    cutterMesh = G3.add(bodyG, new THREE.BoxGeometry(50, 30, 8), mats.chrome, 20, 520, -60);
    /* 切符の出口 */
    G3.add(bodyG, new THREE.BoxGeometry(90, 16, 40),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 }), -50, 610, 148);
    ticketOut = G3.add(scene, new THREE.BoxGeometry(60, 4, 34),
      new THREE.MeshStandardMaterial({ color: 0xfff4d8, roughness: 0.6 }), -110, 615, 120);
    ticketOut.visible = false;
    window.__pts.ticketOut = ticketOut;

    /* おつりの受け皿 */
    cupG = new THREE.Group();
    cupG.position.set(100, 420, 130);
    bodyG.add(cupG);
    G3.add(cupG, new THREE.BoxGeometry(150, 16, 80),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }), 0, 0, 0);
    G3.add(cupG, new THREE.BoxGeometry(150, 60, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }), 0, 24, -40);
    changeCoins = [];
    window.__pts.cup = cupG;

    /* --- 手もとのコイントレイ --- */
    G3.add(scene, new THREE.BoxGeometry(320, 60, 200),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), 460, 30, 320).castShadow = true;
    coins = [];
    let ci = 0;
    COIN_DEF.forEach((cd, t) => {
      for (let k = 0; k < 3; k++) {
        const c = G3.add(scene, new THREE.CylinderGeometry(cd.r, cd.r, 7, 16),
          new THREE.MeshStandardMaterial({ color: cd.col, metalness: 0.9, roughness: 0.35 }),
          380 + t * 80, 68 + k * 9, 270 + (k % 2) * 70);
        c.castShadow = true;
        c.userData = { v: cd.v, home: c.position.clone(), used: false, type: t };
        coins.push(c);
        window.__pts['coin' + ci] = c;
        ci++;
      }
    });

    /* とった切符のトレイ */
    ticketTray = new THREE.Group();
    ticketTray.position.set(560, 65, 200);
    scene.add(ticketTray);
    tickets = 0;
  }

  function drawScreen() {
    const c = dispCv.getContext('2d');
    c.fillStyle = '#0a2818';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#50e888';
    c.textAlign = 'center';
    c.font = 'bold 22px sans-serif';
    if (fareSel < 0) {
      c.fillText('きっぷを えらんでね', 128, 55);
    } else {
      c.fillText(FARES[fareSel].label + '  ¥' + FARES[fareSel].price, 128, 36);
      c.font = 'bold 30px sans-serif';
      c.fillText('いま ¥' + inserted, 128, 76);
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
    for (let i = 0; i < FARES.length; i++) {
      if (near(fareBtns[i], 75)) {
        fareSel = i;
        S.clickReal(0.8);
        drawScreen();
        return;
      }
    }
    for (const c of coins) {
      if (!c.userData.used && near(c, 70)) {
        dragCoin = c;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (ticketOut.visible && near(ticketOut, 90)) {
      /* 切符をとる */
      ticketOut.visible = false;
      const t = G3.add(ticketTray, new THREE.BoxGeometry(60, 4, 34),
        new THREE.MeshStandardMaterial({ color: 0xfff4d8, roughness: 0.6 }), 0, tickets * 6, 0);
      t.rotation.y = tickets * 0.15;
      tickets++;
      S.plip(1.9);
      return;
    }
    if (changeCoins.length && near(cupG, 130, 20)) {
      /* おつりをとる → トレイにもどる */
      changeCoins.forEach(cc => {
        cupG.remove(cc.mesh);
        const orig = coins.find(o => o.userData.type === cc.type && o.userData.used);
        if (orig) {
          orig.userData.used = false;
          orig.visible = true;
          orig.position.copy(orig.userData.home);
        }
      });
      changeCoins = [];
      S.coin();
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragCoin && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (700 - o.y) / d.y;
      if (t > 0) {
        dragCoin.position.set(o.x + d.x * t, 700, Math.max(100, o.z + d.z * t));
        dragCoin.rotation.x = Math.PI / 2;
        /* 投入口へ */
        const sv = new THREE.Vector3();
        slotMesh.getWorldPosition(sv);
        if (fareSel >= 0 && dragCoin.position.distanceTo(sv) < 80) {
          insertCoin(dragCoin);
          dragCoin = null;
          dragId = null;
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.4);
    }
  }

  function insertCoin(c) {
    c.userData.used = true;
    c.visible = false;
    inserted += c.userData.v;
    const tb = tubes[c.userData.type];
    coinAnim = { t: 0, type: c.userData.type };
    S.coin();
    drawScreen();
    /* 足りたら印刷 */
    if (inserted >= FARES[fareSel].price && !printing) {
      printing = 0.001;
    }
  }

  function onUp(e) {
    if (dragCoin && e.pointerId === dragId) {
      dragCoin.position.copy(dragCoin.userData.home);
      dragCoin.rotation.x = 0;
      dragCoin = null;
      dragId = null;
      if (fareSel < 0) S.buzz();
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* コインがレールを転がって筒へ */
    if (coinAnim) {
      coinAnim.t += dt * 1.6;
      const tb = tubes[coinAnim.type];
      if (coinAnim.t >= 1) {
        const c = G3.add(bodyG, new THREE.CylinderGeometry(tb.cd.r, tb.cd.r, 7, 14),
          new THREE.MeshStandardMaterial({ color: tb.cd.col, metalness: 0.9, roughness: 0.35 }),
          tb.x, 210 + tb.stack.length * 9, 40);
        tb.stack.push(c);
        S.plip(0.8 + coinAnim.type * 0.25);
        coinAnim = null;
      }
    }

    /* 印刷 → カット → 切符が出る → おつり */
    if (printing) {
      printing += dt;
      printerRoll.rotation.x += dt * 5;
      if (servo) servo.set(0.5);
      if (printing > 0.2 && printing < 0.35) S.printFeed(0.3);
      if (printing > 1.1 && printing < 1.25) {
        cutterMesh.position.y = 500;
        S.kachi();
      }
      if (printing > 1.4) {
        cutterMesh.position.y = 520;
        ticketOut.visible = true;
        /* おつり */
        const change = inserted - FARES[fareSel].price;
        if (change > 0) {
          /* 10円玉でおつりを出す (見た目) */
          const n = Math.min(4, Math.round(change / 10 / 3) + 1);
          for (let i = 0; i < n; i++) {
            const cd = COIN_DEF[2];
            const cc = G3.add(cupG, new THREE.CylinderGeometry(cd.r, cd.r, 7, 14),
              new THREE.MeshStandardMaterial({ color: cd.col, metalness: 0.9, roughness: 0.35 }),
              -40 + i * 26, 14, 6);
            changeCoins.push({ mesh: cc, type: 2 });
          }
          S.coin();
          S.coin();
        }
        inserted = 0;
        fareSel = -1;
        printing = 0;
        drawScreen();
        S.ding();
        if (servo) servo.set(0.1);
      }
    }

    if (window.__dbgKB) window.__dbgKB({
      fare: fareSel, inserted, tickets, printing: +(!!printing),
      change: changeCoins.length,
      trayCoins: coins.filter(c => !c.userData.used).length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      fareSel = -1; inserted = 0; printing = 0; coinAnim = null;
      dragCoin = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(80, 480, 60),
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

      /* 4歳向けガイド: ボタン → コイン → 切符をとる */
      GUIDE.start(stage3, [
        {
          kind: 'tap', at: () => fareBtns[0],
          when: () => fareSel < 0 && !ticketOut.visible, done: () => fareSel >= 0,
        },
        {
          kind: 'drag', at: () => coins.find(c => !c.userData.used) || coins[0], to: () => slotMesh,
          when: () => fareSel >= 0 && !printing && !ticketOut.visible,
          done: () => inserted >= (fareSel >= 0 ? FARES[fareSel].price : 9999) || printing > 0 || ticketOut.visible,
        },
        {
          kind: 'tap', at: () => ticketOut,
          when: () => ticketOut.visible, done: () => tickets > 0,
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
