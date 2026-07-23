/* 路線バスのとびら — 写実3D (断面)
 *
 * 4歳の憧れ「降りますボタン」。バスの車内を断面にして、
 * 折り戸をうごかすエアシリンダーを見せる。
 * 連鎖: 人形をICリーダーへ → ピッ！ → 席にすわる → バスが走る (景色が流れる) →
 *       黄色いボタンをおす → ピンポーン♪「つぎとまります」が光る →
 *       バス停でバスが止まる → エアシリンダーがプシューと折り戸をあける →
 *       人形が降りる → とびらが閉まってバスは走っていく
 * 分岐: ボタンをおすタイミング (おさないと停留所を通過！) × どの席 ×
 *       何人乗せるか。
 */
window.GAMES.busdoor = (() => {
  let stage3, scene, raf, prev, time;
  let busG, doorA1, doorA2, cylRod, icReader, icLamp, stopBtns, signCv, signTex;
  let sceneryG, stops, dolls, seats;
  let busSpeed, stopRequested, doorOpen, nextStopT, atStop, sceneryX;
  let dragDoll, dragId, orbitId, orbitFrom;
  let rumble, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#bcd8ec', '#dcecf4', '#8cb0cc');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.85 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1400), shadowSpan: 1500, intensity: 0.95 });

    /* --- 流れる景色 (家と木のループ) --- */
    sceneryG = new THREE.Group();
    scene.add(sceneryG);
    for (let i = 0; i < 6; i++) {
      const x = -1800 + i * 700;
      const h = 260 + (i % 3) * 90;
      G3.add(sceneryG, new THREE.BoxGeometry(320, h, 200),
        new THREE.MeshStandardMaterial({ color: [0xd8c8a8, 0xc8b8d0, 0xb8ccb0][i % 3], roughness: 0.7 }),
        x, h / 2, -700).castShadow = true;
      G3.add(sceneryG, new THREE.ConeGeometry(90, 180, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a8a4a, roughness: 0.8 }), x + 260, 220, -650);
      G3.add(sceneryG, new THREE.CylinderGeometry(14, 16, 140, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 }), x + 260, 70, -650);
    }
    /* バス停 (景色と一緒に流れる) */
    stops = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      G3.add(g, new THREE.CylinderGeometry(8, 8, 320, 8), mats.steel, 0, 160, 0);
      G3.add(g, new THREE.CylinderGeometry(52, 52, 10, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a6ad8, roughness: 0.4 }), 0, 330, 0);
      g.position.set(-2100 - i * 2100, 0, -520);
      sceneryG.add(g);
      stops.push(g);
    }

    /* --- バス (手前側面が断面 = 車内が見える) --- */
    busG = new THREE.Group();
    scene.add(busG);
    const busM = new THREE.MeshPhysicalMaterial({ color: 0x3a9ad8, roughness: 0.3, clearcoat: 0.6 });
    /* 床・天井・奥壁・前後 */
    G3.add(busG, new THREE.BoxGeometry(1300, 24, 260), mats.steel, 0, 120, 0);
    G3.add(busG, new THREE.BoxGeometry(1300, 24, 260), busM, 0, 620, 0).castShadow = true;
    const backWall = G3.add(busG, new THREE.BoxGeometry(1300, 500, 20), busM, 0, 370, -130);
    /* 奥側の窓 */
    for (let i = 0; i < 5; i++) {
      G3.add(busG, new THREE.BoxGeometry(190, 200, 8),
        new THREE.MeshPhysicalMaterial({ color: 0xd8ecf4, roughness: 0.05, transparent: true, opacity: 0.4 }),
        -520 + i * 240, 440, -128);
    }
    G3.add(busG, new THREE.BoxGeometry(20, 500, 260), busM, -650, 370, 0);
    G3.add(busG, new THREE.BoxGeometry(20, 500, 260), busM, 650, 370, 0);
    /* 手前は下半分だけの帯 (断面) */
    G3.add(busG, new THREE.BoxGeometry(1300, 110, 16), busM, 0, 175, 128).castShadow = true;
    /* 車輪 */
    [[-420], [400]].forEach(([x]) => {
      const w = G3.add(busG, new THREE.CylinderGeometry(70, 70, 40, 16),
        new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), x, 70, 120);
      w.rotation.x = Math.PI / 2;
    });
    /* 運転席 */
    G3.add(busG, new THREE.CylinderGeometry(34, 34, 10, 14), mats.darkPlastic, -560, 330, -40).rotation.x = 1.2;
    const driver = G3.doll({ shirt: 0x3a4a6a });
    driver.g.scale.setScalar(0.9);
    driver.g.position.set(-560, 140, -60);
    busG.add(driver.g);

    /* --- 座席 --- */
    seats = [];
    const seatM = new THREE.MeshStandardMaterial({ color: 0x8a3a5a, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const x = -260 + i * 200;
      G3.add(busG, new THREE.BoxGeometry(110, 30, 110), seatM, x, 220, -60).castShadow = true;
      G3.add(busG, new THREE.BoxGeometry(110, 130, 26), seatM, x, 290, -110);
      seats.push({ x, taken: -1 });
    }

    /* --- ICリーダー (乗車口・前) --- */
    icReader = G3.add(busG, new THREE.BoxGeometry(60, 40, 60),
      new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.4 }), -480, 300, 60);
    icReader.rotation.x = 0.4;
    icLamp = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x333a33 }));
    icLamp.position.set(-480, 330, 70);
    busG.add(icLamp);
    window.__pts.ic = icReader;

    /* --- 降車ボタン (ポール2本に黄色いボタン) --- */
    stopBtns = [];
    [[-100], [300]].forEach(([x], i) => {
      G3.add(busG, new THREE.CylinderGeometry(7, 7, 480, 8), mats.chrome, x, 370, 40);
      const btn = G3.add(busG, new THREE.BoxGeometry(40, 56, 26),
        new THREE.MeshStandardMaterial({ color: 0xf4f4ec, roughness: 0.5 }), x, 380, 52);
      const yellow = G3.add(busG, new THREE.CylinderGeometry(13, 14, 10, 12),
        new THREE.MeshPhysicalMaterial({ color: 0xe8c020, roughness: 0.3, clearcoat: 0.5 }), x, 380, 68);
      yellow.rotation.x = Math.PI / 2;
      stopBtns.push(yellow);
      window.__pts['btn' + i] = yellow;
    });

    /* 「つぎとまります」表示 */
    signCv = document.createElement('canvas');
    signCv.width = 256;
    signCv.height = 64;
    signTex = new THREE.CanvasTexture(signCv);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(300, 76),
      new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(-360, 560, 120);
    busG.add(sign);
    drawSign();

    /* --- 折り戸 (中扉) とエアシリンダー --- */
    const doorM = new THREE.MeshPhysicalMaterial({
      color: 0xd8ecf4, roughness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    doorA1 = new THREE.Group();
    doorA1.position.set(120, 130, 122);
    busG.add(doorA1);
    G3.add(doorA1, new THREE.BoxGeometry(90, 440, 10), doorM, 45, 220, 0).castShadow = true;
    doorA2 = new THREE.Group();
    doorA2.position.set(90, 0, 0);
    doorA1.add(doorA2);
    G3.add(doorA2, new THREE.BoxGeometry(90, 440, 10), doorM, 45, 220, 0);
    window.__pts.door = doorA1;
    /* エアシリンダー (上に見える) */
    G3.add(busG, new THREE.CylinderGeometry(13, 13, 120, 10), mats.steel, 130, 590, 100).rotation.z = Math.PI / 2;
    cylRod = G3.add(busG, new THREE.CylinderGeometry(7, 7, 100, 8), mats.chrome, 210, 590, 100);
    cylRod.rotation.z = Math.PI / 2;

    /* --- 人形2体 (バス停側で待っている) --- */
    dolls = [];
    [[0xd85a4a, 320, 320], [0xe8b83a, 460, 400]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 0, z);
      scene.add(d.g);
      dolls.push({ ...d, state: 'street', seat: -1, tapped: false });
      window.__pts['doll' + i] = d.g;
    });
  }

  function drawSign(on) {
    const c = signCv.getContext('2d');
    c.fillStyle = '#181410';
    c.fillRect(0, 0, 256, 64);
    if (on) {
      c.fillStyle = '#ff8030';
      c.textAlign = 'center';
      c.font = 'bold 26px sans-serif';
      c.fillText('つぎ とまります', 128, 42);
    }
    signTex.needsUpdate = true;
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
    for (const b of stopBtns) {
      if (near(b, 55)) {
        if (busSpeed > 0.1 && !stopRequested) {
          stopRequested = true;
          drawSign(true);
          S.doorChime();
        } else {
          S.clickReal(0.4);
        }
        return;
      }
    }
    for (const d of dolls) {
      if ((d.state === 'street' || d.state === 'in') && near(d.g, 110, 80)) {
        dragDoll = d;
        d.state = d.state === 'in' ? 'inHeld' : 'held';
        dragId = e.pointerId;
        S.plip(1.3);
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragDoll && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (220 - o.y) / d.y;
      if (t > 0) {
        dragDoll.g.position.set(o.x + d.x * t, Math.max(0, 220 - 120), o.z + d.z * t);
        dragDoll.g.position.y = 130;
        /* ICリーダーにかざした？ */
        const iv = new THREE.Vector3();
        icReader.getWorldPosition(iv);
        const icDist = Math.hypot(dragDoll.g.position.x - iv.x, dragDoll.g.position.z - iv.z);
        if (!dragDoll.tapped && icDist < 130 && doorOpen > 0.5) {
          dragDoll.tapped = true;
          icLamp.material.color.set(0x50e070);
          S.beepScan();
          setTimeout(() => icLamp.material.color.set(0x333a33), 600);
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.4);
    }
  }

  function onUp(e) {
    if (dragDoll && e.pointerId === dragId) {
      const p = dragDoll.g.position;
      const inBus = p.x > -620 && p.x < 620 && p.z > -120 && p.z < 120;
      if (inBus && doorOpen > 0.5 && (dragDoll.tapped || dragDoll.state === 'inHeld')) {
        /* あいた席へ */
        const free = seats.find(s => s.taken < 0);
        if (free) {
          free.taken = dolls.indexOf(dragDoll);
          dragDoll.state = 'in';
          dragDoll.seat = seats.indexOf(free);
          dragDoll.g.position.set(free.x, 150, -60);
          S.squishReal(0.4);
        } else {
          dragDoll.state = 'in';
          dragDoll.g.position.set(0, 130, 20);
        }
      } else if (inBus && doorOpen > 0.5 && !dragDoll.tapped) {
        /* ICをタッチしていない → ブザーで外へ */
        S.buzz();
        dragDoll.state = 'street';
        dragDoll.g.position.set(300, 0, 350);
      } else if (!inBus) {
        if (dragDoll.state === 'inHeld') {
          /* 降りた！ */
          if (dragDoll.seat >= 0) seats[dragDoll.seat].taken = -1;
          dragDoll.seat = -1;
          dragDoll.tapped = false;
          dragDoll.state = 'street';
          dragDoll.g.position.y = 0;
          S.plip(2);
        } else {
          dragDoll.state = 'street';
          dragDoll.g.position.y = 0;
        }
      } else {
        /* とびらが閉まっている */
        dragDoll.state = dragDoll.state === 'inHeld' ? 'in' : 'street';
        if (dragDoll.state === 'in' && dragDoll.seat >= 0) {
          dragDoll.g.position.set(seats[dragDoll.seat].x, 150, -60);
        } else if (dragDoll.state === 'street') {
          dragDoll.g.position.set(320, 0, 350);
          S.thunk();
        }
      }
      dragDoll = null;
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

    /* バスの走行 (バスは止まったまま、景色が流れる) */
    const anyAboard = dolls.some(d => d.state === 'in' || d.state === 'inHeld');
    if (atStop) {
      nextStopT -= dt;
      busSpeed += (0 - busSpeed) * Math.min(1, dt * 4);
      if (nextStopT <= 0 && doorOpen < 0.1) {
        atStop = false;
        stopRequested = false;
        drawSign(false);
      }
    } else {
      busSpeed += ((anyAboard || dolls.every(d => d.state !== 'street') ? 1 : 0.35) - busSpeed) * Math.min(1, dt * 0.8);
    }
    sceneryX += busSpeed * 260 * dt;
    sceneryG.position.x = ((sceneryX % 4200));

    /* バス停の通過チェック: 停留所が扉の前 (x≈120) に来たとき */
    stops.forEach(st => {
      const wx = st.position.x + sceneryG.position.x;
      if (wx > 60 && wx < 180 && busSpeed > 0.1) {
        if (stopRequested) {
          atStop = true;
          nextStopT = 6;
        }
        /* おしていなければ通過 (なにも起きない) */
      }
    });

    /* とびら: 停車中だけあく (エアシリンダー) */
    const doorTarget = (atStop && busSpeed < 0.08 && nextStopT > 0) ? 1 : 0;
    const before = doorOpen;
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 3);
    if (before < 0.1 && doorOpen >= 0.1) S.flap();
    if (before > 0.9 && doorOpen <= 0.9) S.flap();
    doorA1.rotation.y = doorOpen * 1.5;
    doorA2.rotation.y = -doorOpen * 2.6;
    cylRod.position.x = 210 - doorOpen * 70;
    if (rumble) rumble.set(0.1 + busSpeed * 0.5);

    /* 乗客のゆれ */
    dolls.forEach(d => {
      if (d.state === 'in' && d.seat >= 0) {
        d.g.rotation.z = Math.sin(time * 2.2) * 0.03 * busSpeed;
      }
    });

    if (window.__dbgBS) window.__dbgBS({
      speed: +busSpeed.toFixed(2), req: stopRequested, atStop,
      door: +doorOpen.toFixed(2),
      dolls: dolls.map(d => d.state), tapped: dolls.map(d => d.tapped),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      busSpeed = 0; stopRequested = false; doorOpen = 1; nextStopT = 5; atStop = true; sceneryX = 0;
      dragDoll = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 320, 0),
        radius: 1900, radiusPortraitBase: 2500, radiusMaxPortrait: 4000,
        az: 0.1, po: 1.15,
      });
      build();
      rumble = S.rumbleLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 人形をICへ → 席へ → 走ったらボタン → とまったら降りる */
      let gdOff = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.doll0, to: () => icReader,
          when: () => doorOpen > 0.5 && dolls[0].state === 'street',
          done: () => dolls.some(d => d.tapped),
        },
        {
          kind: 'drag', at: () => window.__pts.doll0, to: () => new THREE.Vector3(-260, 260, -60),
          when: () => doorOpen > 0.5 && dolls.some(d => d.tapped && d.state !== 'in'),
          done: () => dolls.some(d => d.state === 'in'),
        },
        {
          kind: 'tap', at: () => stopBtns[0],
          when: () => busSpeed > 0.3 && !stopRequested && dolls.some(d => d.state === 'in'),
          done: () => stopRequested,
        },
        {
          kind: 'drag', at: () => {
            const d = dolls.find(dd => dd.state === 'in');
            return d ? d.g : null;
          },
          to: () => new THREE.Vector3(340, 100, 340),
          when: () => atStop && doorOpen > 0.5 && dolls.some(d => d.state === 'in'),
          done: () => (gdOff = gdOff || (dolls.some(d => d.state === 'street' && !d.tapped) && sceneryX > 500)),
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
