/* 駐車場のゲート — 写実3D (断面)
 *
 * お父さんお母さんの車でくぐる、あのバーが上がる機械。
 * 発券機とゲートの頭を断面にして、印刷機とバーを回すモーターを見せる。
 * 連鎖: 車を前へ → 地面のループセンサーが光る → 発券機がジジッと切符を印刷 →
 *       にゅっと出てくる → 切符を取る → モーターがバーをくるっと上げる →
 *       車が通ると自動でバーが下りる → 出るときは精算機にコインでもう一度
 * 分岐: 車の進みかた × 切符を取るタイミング × 入場→精算の一巡。
 */
window.GAMES.parkgate = (() => {
  let stage3, scene, raf, prev, time;
  let carG, carWheels, gateArm, gateMotor, loopLampIn, printerRoll, ticketMesh;
  let coinMesh, coinHome, paySlot, exitArm, exitMotor, loopLampOut;
  let carX, carDragId, ticketOut, hasTicket, gateOpen, exitOpen, paid;
  let dragMode, dragId, orbitId, orbitFrom;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#c8d4e0', '#dce4ec', '#98a8b8');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: 0x74767c, roughness: 0.85 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1400), shadowSpan: 1500, intensity: 0.95 });

    /* 車路の白線と駐車ます */
    const lineM = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.7 });
    G3.add(scene, new THREE.BoxGeometry(2600, 2, 14), lineM, 0, 1, -170);
    G3.add(scene, new THREE.BoxGeometry(2600, 2, 14), lineM, 0, 1, 170);
    for (let i = 0; i < 3; i++) {
      G3.add(scene, new THREE.BoxGeometry(14, 2, 300), lineM, -200 + i * 260, 1, -480);
    }
    /* 地面のループセンサー (入口/出口) */
    loopLampIn = G3.add(scene, new THREE.BoxGeometry(180, 3, 240),
      new THREE.MeshBasicMaterial({ color: 0x2a3a2a }), -380, 2, 0);
    loopLampOut = G3.add(scene, new THREE.BoxGeometry(180, 3, 240),
      new THREE.MeshBasicMaterial({ color: 0x2a3a2a }), 620, 2, 0);

    /* --- 発券機 (断面: 印刷ロールとカッター) --- */
    const boxM = new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.3, clearcoat: 0.5 });
    const kiosk = G3.add(scene, new THREE.BoxGeometry(150, 300, 120), boxM, -240, 150, 260);
    kiosk.castShadow = true;
    /* 断面窓: ロール紙と送りローラー */
    G3.add(scene, new THREE.BoxGeometry(120, 160, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 }), -240, 190, 322);
    printerRoll = G3.add(scene, new THREE.CylinderGeometry(34, 34, 40, 14), mats.whitePlastic, -262, 230, 322);
    printerRoll.rotation.x = Math.PI / 2;
    G3.add(scene, new THREE.CylinderGeometry(12, 12, 40, 10), mats.steel, -218, 180, 322).rotation.x = Math.PI / 2;
    /* 切符 (出てくる) */
    ticketMesh = G3.add(scene, new THREE.BoxGeometry(56, 4, 30),
      new THREE.MeshStandardMaterial({ color: 0xfff8e0, roughness: 0.6 }), -218, 150, 330);
    ticketMesh.visible = false;
    window.__pts.ticket = ticketMesh;

    /* --- 入口ゲート (断面頭: モーターとバネ) --- */
    const head = G3.add(scene, new THREE.BoxGeometry(120, 130, 100), boxM, -150, 320, 260);
    head.castShadow = true;
    gateMotor = G3.add(scene, new THREE.CylinderGeometry(26, 26, 60, 12), mats.steel, -150, 320, 300);
    gateMotor.rotation.x = Math.PI / 2;
    G3.add(scene, new THREE.BoxGeometry(60, 260, 80), boxM, -150, 130, 260);
    gateArm = new THREE.Group();
    gateArm.position.set(-150, 330, 230);
    scene.add(gateArm);
    const armBar = G3.add(gateArm, new THREE.CylinderGeometry(13, 13, 480, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 }), 0, 0, -240);
    armBar.rotation.x = Math.PI / 2;
    armBar.castShadow = true;
    for (let i = 0; i < 3; i++) {
      const stripe = G3.add(gateArm, new THREE.CylinderGeometry(13.5, 13.5, 60, 10),
        new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.5 }), 0, 0, -90 - i * 140);
      stripe.rotation.x = Math.PI / 2;
    }

    /* --- 出口: 精算機と出口ゲート --- */
    const payM = new THREE.MeshPhysicalMaterial({ color: 0x4a86d8, roughness: 0.3, clearcoat: 0.5 });
    const pay = G3.add(scene, new THREE.BoxGeometry(150, 320, 120), payM, 480, 160, 260);
    pay.castShadow = true;
    paySlot = G3.add(scene, new THREE.BoxGeometry(60, 12, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 }), 480, 260, 322);
    window.__pts.paySlot = paySlot;
    const head2 = G3.add(scene, new THREE.BoxGeometry(120, 130, 100), payM, 580, 320, 260);
    head2.castShadow = true;
    exitMotor = G3.add(scene, new THREE.CylinderGeometry(26, 26, 60, 12), mats.steel, 580, 320, 300);
    exitMotor.rotation.x = Math.PI / 2;
    G3.add(scene, new THREE.BoxGeometry(60, 260, 80), payM, 580, 130, 260);
    exitArm = new THREE.Group();
    exitArm.position.set(580, 330, 230);
    scene.add(exitArm);
    const armBar2 = armBar.clone();
    exitArm.add(armBar2);
    for (let i = 0; i < 3; i++) {
      const stripe = G3.add(exitArm, new THREE.CylinderGeometry(13.5, 13.5, 60, 10),
        new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.5 }), 0, 0, -90 - i * 140);
      stripe.rotation.x = Math.PI / 2;
    }

    /* --- コイン --- */
    coinMesh = G3.add(scene, new THREE.CylinderGeometry(34, 34, 8, 18), mats.brass, 300, 40, 480);
    coinMesh.castShadow = true;
    coinHome = coinMesh.position.clone();
    G3.add(scene, new THREE.CylinderGeometry(52, 56, 30, 14),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), 300, 15, 480);
    window.__pts.coin = coinMesh;

    /* --- 車 --- */
    carG = new THREE.Group();
    scene.add(carG);
    const carM = new THREE.MeshPhysicalMaterial({ color: 0xd85a4a, roughness: 0.25, clearcoat: 0.7 });
    G3.add(carG, new THREE.BoxGeometry(300, 80, 150), carM, 0, 80, 0).castShadow = true;
    G3.add(carG, new THREE.BoxGeometry(170, 70, 140), carM, -10, 150, 0).castShadow = true;
    G3.add(carG, new THREE.BoxGeometry(120, 55, 130),
      new THREE.MeshPhysicalMaterial({ color: 0xa8c8d8, roughness: 0.1, transparent: true, opacity: 0.55 }), -10, 155, 0);
    carWheels = [];
    [[-95], [95]].forEach(([x]) => {
      [-1, 1].forEach(s => {
        const w = G3.add(carG, new THREE.CylinderGeometry(36, 36, 26, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), x, 38, s * 78);
        w.rotation.x = Math.PI / 2;
        carWheels.push(w);
      });
    });
    window.__pts.car = carG;
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
    if (ticketOut && near(ticketMesh, 90)) {
      /* 切符を取る */
      hasTicket = true;
      ticketOut = false;
      ticketMesh.visible = false;
      gateOpen = 1;
      S.plip(1.8);
      S.clickReal(0.8);
      return;
    }
    if (near(coinMesh, 90)) {
      dragMode = 'coin';
      dragId = e.pointerId;
      return;
    }
    if (near(carG, 220, 80)) {
      dragMode = 'car';
      dragId = e.pointerId;
      carG.userData.d = { x0: e.clientX, v0: carX };
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'car' && carG.userData.d) {
        const d = carG.userData.d;
        let nx = U.clamp(d.v0 + (e.clientX - d.x0) * 2.2, -640, 980);
        /* バーが閉まっていたら通れない */
        if (gateOpen < 0.7 && carX < -160 && nx >= -160) { nx = -160; S.thunk(); }
        if (exitOpen < 0.7 && carX < 570 && nx >= 570) { nx = 570; S.thunk(); }
        carX = nx;
      } else if (dragMode === 'coin') {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (260 - o.y) / d.y;
        if (t > 0) coinMesh.position.set(o.x + d.x * t, 260, o.z + d.z * t);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'coin') {
        /* 精算機に入れたか */
        const p = coinMesh.position;
        if (hasTicket && Math.hypot(p.x - 480, p.z - 322) < 110) {
          paid = true;
          exitOpen = 1;
          coinMesh.visible = false;
          S.coin();
          S.ding();
        } else {
          if (!hasTicket && Math.hypot(p.x - 480, p.z - 322) < 110) S.buzz();
          coinMesh.position.copy(coinHome);
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

    /* 車 */
    const prevX = carG.position.x;
    carG.position.x += (carX - carG.position.x) * Math.min(1, dt * 6);
    const moved = carG.position.x - prevX;
    carWheels.forEach(w => { w.rotation.z -= moved / 36; });

    /* 入口ループセンサー → 発券 */
    const onLoopIn = Math.abs(carG.position.x + 380) < 130;
    loopLampIn.material.color.set(onLoopIn ? 0x50e070 : 0x2a3a2a);
    if (onLoopIn && !hasTicket && !ticketOut && !gateOpen) {
      ticketOut = true;
      ticketMesh.visible = true;
      ticketMesh.position.set(-218, 150, 330);
      S.printFeed(0.5);
    }
    if (ticketOut) {
      printerRoll.rotation.z += dt * 6;
      ticketMesh.position.z = Math.min(360, ticketMesh.position.z + dt * 60);
    }

    /* 入口バー: 切符を取ると開き、車が通過すると閉じる */
    const inTarget = gateOpen ? -Math.PI / 2 : 0;
    gateArm.rotation.z += (inTarget - gateArm.rotation.z) * Math.min(1, dt * 4);
    if (Math.abs(gateArm.rotation.z - inTarget) > 0.02) {
      gateMotor.rotation.z += dt * 8;
      if (servo) servo.set(0.5);
    } else if (servo) servo.set(0.12);
    if (gateOpen && carG.position.x > 40) {
      gateOpen = 0;
      S.snapBack();
    }

    /* 出口ループとバー */
    const onLoopOut = Math.abs(carG.position.x - 620) < 130;
    loopLampOut.material.color.set(onLoopOut ? 0x50e070 : 0x2a3a2a);
    const outTarget = exitOpen ? -Math.PI / 2 : 0;
    exitArm.rotation.z += (outTarget - exitArm.rotation.z) * Math.min(1, dt * 4);
    if (Math.abs(exitArm.rotation.z - outTarget) > 0.02) exitMotor.rotation.z += dt * 8;
    if (exitOpen && carG.position.x > 800) {
      exitOpen = 0;
      S.snapBack();
      /* 一巡完了 → リセット (つぎのドライブ) */
      setTimeout(() => {
        carX = -600;
        hasTicket = false;
        paid = false;
        coinMesh.visible = true;
        coinMesh.position.copy(coinHome);
        S.ding();
      }, 1200);
    }

    if (window.__dbgPG) window.__dbgPG({
      carX: carG.position.x | 0, ticketOut, hasTicket, paid,
      gate: +gateArm.rotation.z.toFixed(2), exit: +exitArm.rotation.z.toFixed(2),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      carX = -600; ticketOut = false; hasTicket = false; gateOpen = 0; exitOpen = 0; paid = false;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 200, 100),
        radius: 1900, radiusPortraitBase: 2700, radiusMaxPortrait: 4200,
        az: 0.15, po: 1.05,
      });
      build();
      carG.position.x = carX;
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 車を前へ → 切符を取る → ゲートをくぐって精算 */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => carG, to: () => new THREE.Vector3(-380, 120, 0),
          when: () => !hasTicket && !ticketOut, done: () => ticketOut || hasTicket,
        },
        {
          kind: 'tap', at: () => ticketMesh,
          when: () => ticketOut, done: () => hasTicket,
        },
        {
          kind: 'drag', at: () => carG, to: () => new THREE.Vector3(450, 120, 0),
          when: () => hasTicket && !paid && carG.position.x < 350,
          done: () => carG.position.x > 380 || paid,
        },
        {
          kind: 'drag', at: () => coinMesh, to: () => paySlot,
          when: () => hasTicket && !paid && carG.position.x > 300, done: () => paid,
        },
        {
          kind: 'drag', at: () => carG, to: () => new THREE.Vector3(880, 120, 0),
          when: () => paid, done: () => carG.position.x > 820,
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
