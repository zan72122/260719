/* 冷蔵庫 — 写実3D (断面)
 *
 * 毎日あけるのに、どうして冷えるのかは見えない。
 * 右側面を断面にして、コンプレッサー・冷媒パイプ・冷気の流れ・製氷機を見せる。
 * 連鎖: コンプレッサーがブーン → 冷媒がパイプをめぐる → ファンが冷気を送る →
 *       庫内が冷える → 製氷機が氷をポロポロ落とす。ドアをあけると冷気がこぼれ、
 *       あけっぱなしだと温度計が上がってピーピー警告 → コンプレッサーが全力運転
 * 分岐: ドアのあけかた × 食べ物の出し入れ × あけっぱなし時間 × 氷はたまり続ける。
 */
window.GAMES.fridge = (() => {
  let stage3, scene, raf, prev, time;
  let bodyG, doorTop, doorBot, compressor, fanBlades, coldParts, coldState, dummy;
  let tempCv, tempTex, iceBin, iceCubes, iceT, foods, alarmT;
  let doorTopA, doorBotA, temp, compSpeed;
  let dragObj, dragId, orbitId, orbitFrom;
  let hum, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#e0e4e0', '#eceee8', '#b0b8b0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1700, 1300), shadowSpan: 1100, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2400, 1500, 30),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.7 }), 0, 750, -400);

    /* --- 本体 (右側面が断面) --- */
    bodyG = new THREE.Group();
    bodyG.position.set(-100, 0, 0);
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8eaec, roughness: 0.25, clearcoat: 0.6 });
    G3.add(bodyG, new THREE.BoxGeometry(440, 30, 380), shellM, 0, 1215, -40).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(440, 1200, 30), shellM, 0, 615, -215);
    G3.add(bodyG, new THREE.BoxGeometry(30, 1200, 380), shellM, -205, 615, -40).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(440, 30, 380), shellM, 0, 30, -40);
    /* 中の仕切り (冷蔵室/冷凍室) */
    const innerM = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 });
    G3.add(bodyG, new THREE.BoxGeometry(400, 20, 340), innerM, 0, 500, -40);
    G3.add(bodyG, new THREE.BoxGeometry(400, 16, 340), innerM, 0, 860, -40);
    G3.add(bodyG, new THREE.BoxGeometry(400, 16, 340), innerM, 0, 1050, -40);

    /* --- 断面の機械 --- */
    /* コンプレッサー (下の後ろ) */
    compressor = G3.add(scene, new THREE.SphereGeometry(85, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.4 }), 40, 110, -140);
    compressor.scale.set(1.3, 1, 1);
    compressor.castShadow = true;
    /* 冷媒パイプ (背面をジグザグ) */
    const pipePts = [];
    for (let i = 0; i <= 8; i++) {
      pipePts.push(new THREE.Vector3(100, 160 + i * 120, i % 2 ? -160 : -60));
    }
    const pipe = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePts), 60, 7, 6, false),
      new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.35 }));
    scene.add(pipe);
    /* 冷凍室のファン */
    const fanG = new THREE.Group();
    fanG.position.set(-40, 1140, -160);
    scene.add(fanG);
    fanBlades = new THREE.Group();
    fanG.add(fanBlades);
    for (let i = 0; i < 5; i++) {
      const b = G3.add(fanBlades, new THREE.BoxGeometry(14, 60, 4), mats.whitePlastic, 0, 0, 0);
      b.position.set(Math.cos(i / 5 * Math.PI * 2) * 32, Math.sin(i / 5 * Math.PI * 2) * 32, 0);
      b.rotation.z = i / 5 * Math.PI * 2;
    }

    /* 冷気パーティクル */
    coldParts = new THREE.InstancedMesh(new THREE.SphereGeometry(9, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.4 }), 50);
    coldParts.frustumCulled = false;
    scene.add(coldParts);
    coldState = [];
    for (let i = 0; i < 50; i++) coldState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0 });
    dummy = new THREE.Object3D();

    /* --- 製氷機と氷 --- */
    G3.add(scene, new THREE.BoxGeometry(160, 40, 120),
      new THREE.MeshStandardMaterial({ color: 0x9ab8d0, roughness: 0.4 }), -150, 1120, -40).castShadow = true;
    iceBin = new THREE.Group();
    iceBin.position.set(-150, 920, -40);
    scene.add(iceBin);
    G3.add(iceBin, new THREE.BoxGeometry(180, 90, 140),
      new THREE.MeshPhysicalMaterial({ color: 0xd8e8f0, roughness: 0.2, transparent: true, opacity: 0.5 }), 0, 0, 0);
    iceCubes = [];

    /* --- 温度計 --- */
    tempCv = document.createElement('canvas');
    tempCv.width = 96;
    tempCv.height = 64;
    tempTex = new THREE.CanvasTexture(tempCv);
    const td = new THREE.Mesh(new THREE.PlaneGeometry(110, 74),
      new THREE.MeshBasicMaterial({ map: tempTex }));
    td.position.set(-100, 1250, 160);
    scene.add(td);

    /* --- ドア2枚 (上=冷凍/下=冷蔵) --- */
    const mkDoor = (y, h) => {
      const g = new THREE.Group();
      g.position.set(-210, y, 155);
      scene.add(g);
      G3.add(g, new THREE.BoxGeometry(430, h, 40), shellM, 215, 0, 20).castShadow = true;
      G3.add(g, new THREE.BoxGeometry(24, h * 0.5, 24), mats.chrome, 420, 0, 46);
      return g;
    };
    doorTop = mkDoor(1050, 330);
    doorBot = mkDoor(490, 700);
    window.__pts.doorTop = doorTop;
    window.__pts.doorBot = doorBot;

    /* --- 食べ物 (台の上と庫内) --- */
    G3.add(scene, new THREE.BoxGeometry(300, 90, 220),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.7 }), 430, 45, 300).castShadow = true;
    foods = [];
    [[0xf0f0f4, 'milk', 50, 110], [0xe8b23a, 'pudding', 55, 60], [0x50b060, 'melon', 70, 70]].forEach(([c, n, w, h], i) => {
      const g = new THREE.Group();
      const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.3 });
      const mesh = n === 'melon'
        ? G3.add(g, new THREE.SphereGeometry(w / 2 + 8, 14, 10), m, 0, (w + 16) / 2, 0)
        : G3.add(g, new THREE.BoxGeometry(w, h, w), m, 0, h / 2, 0);
      mesh.castShadow = true;
      g.position.set(340 + i * 90, 90, 260 + (i % 2) * 80);
      scene.add(g);
      foods.push({ g, home: g.position.clone(), inside: false });
      window.__pts['food' + i] = g;
    });
  }

  function drawTemp() {
    const c = tempCv.getContext('2d');
    c.fillStyle = '#101418';
    c.fillRect(0, 0, 96, 64);
    c.fillStyle = temp > 8 ? '#ff6050' : '#50c8ff';
    c.textAlign = 'center';
    c.font = 'bold 34px monospace';
    c.fillText(Math.round(temp) + '°', 48, 44);
    tempTex.needsUpdate = true;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    const v = new THREE.Vector3();
    const near = (obj, rad, dy, dx) => {
      obj.getWorldPosition(v);
      v.y += dy || 0;
      v.x += dx || 0;
      return ray.ray.distanceToPoint(v) < rad;
    };
    for (const f of foods) {
      if (near(f.g, 90, 40)) {
        dragObj = f;
        dragId = e.pointerId;
        S.plip(1.2);
        return;
      }
    }
    if (near(doorTop, 220, 0, 420)) {
      dragObj = 'doorTop';
      dragId = e.pointerId;
      doorTop.userData.d = { x0: e.clientX, v0: doorTopA };
      return;
    }
    if (near(doorBot, 280, 0, 420)) {
      dragObj = 'doorBot';
      dragId = e.pointerId;
      doorBot.userData.d = { x0: e.clientX, v0: doorBotA };
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj === 'doorTop' && doorTop.userData.d) {
        const d = doorTop.userData.d;
        doorTopA = U.clamp(d.v0 - (e.clientX - d.x0) / 200, 0, 1.6);
      } else if (dragObj === 'doorBot' && doorBot.userData.d) {
        const d = doorBot.userData.d;
        doorBotA = U.clamp(d.v0 - (e.clientX - d.x0) / 200, 0, 1.6);
      } else if (dragObj.g) {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, dd = ray.ray.direction;
        const t = (300 - o.y) / dd.y;
        if (t > 0) dragObj.g.position.set(o.x + dd.x * t, 300, Math.max(-20, o.z + dd.z * t));
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.4, 0.7);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj.g) {
        /* 冷蔵室に入れたか (ドアがあいていれば) */
        const p = dragObj.g.position;
        const inFridge = p.x > -300 && p.x < 100 && Math.abs(p.z + 40) < 200;
        if (inFridge && doorBotA > 0.5) {
          dragObj.inside = true;
          const shelfY = [340, 540, 700][Math.floor(Math.random() * 3)];
          dragObj.g.position.set(-100 + (Math.random() - 0.5) * 160, shelfY, -40 + (Math.random() - 0.5) * 100);
          S.thunk();
        } else if (inFridge) {
          /* ドアが閉まってる */
          dragObj.g.position.copy(dragObj.home);
          S.buzz();
        } else {
          dragObj.inside = false;
          dragObj.g.position.set(dragObj.home.x, dragObj.home.y, dragObj.home.z);
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

    doorTop.rotation.y = -doorTopA;
    doorBot.rotation.y = -doorBotA;

    /* 温度: ドアがあいていると上がる */
    const openAmt = Math.max(doorTopA, doorBotA) / 1.6;
    temp += openAmt * dt * 2.2;
    /* コンプレッサーは温度に応じて回転 */
    compSpeed = U.clamp(2 + (temp - 4) * 1.2, 1, 8);
    temp = Math.max(3, temp - dt * compSpeed * 0.16 * (1 - openAmt));
    compressor.position.y = 110 + Math.sin(time * compSpeed * 4) * 1.6;
    fanBlades.rotation.z += dt * compSpeed * 3;
    if (hum) hum.set(0.15 + compSpeed * 0.06);
    if (Math.floor(time * 2) % 2 === 0) drawTemp();

    /* あけっぱなし警告 */
    if (temp > 9) {
      alarmT += dt;
      if (alarmT > 0.8) {
        alarmT = 0;
        S.beepScan();
        S.beepScan();
      }
    }

    /* 冷気パーティクル: ファンから下へ、ドアがあいていると外へこぼれる */
    coldState.forEach((s, i) => {
      if (!s.on && Math.random() < dt * compSpeed * 0.8) {
        s.on = true;
        s.x = -140 + Math.random() * 120;
        s.y = 1110;
        s.z = -100 + Math.random() * 60;
        s.vx = (Math.random() - 0.5) * 30;
        s.vy = -80 - Math.random() * 60;
        s.vz = openAmt > 0.3 ? 90 + Math.random() * 90 : (Math.random() - 0.5) * 30;
        s.age = 0;
      }
      if (s.on) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt * (openAmt > 0.3 ? 1 : 0.3);
        if (s.age > 2.4 || s.y < 100) s.on = false;
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(s.on ? 0.6 + s.age * 0.5 : 0.0001);
      dummy.updateMatrix();
      coldParts.setMatrixAt(i, dummy.matrix);
    });
    coldParts.instanceMatrix.needsUpdate = true;

    /* 製氷: ときどき氷が落ちる */
    iceT += dt;
    if (iceT > 7 && iceCubes.length < 16 && temp < 8) {
      iceT = 0;
      const c = G3.add(iceBin, new THREE.BoxGeometry(26, 26, 26),
        new THREE.MeshPhysicalMaterial({ color: 0xdff0f8, roughness: 0.1, transparent: true, opacity: 0.8 }),
        (Math.random() - 0.5) * 130, 90, (Math.random() - 0.5) * 90);
      c.userData.vy = 0;
      c.rotation.set(Math.random(), Math.random(), 0);
      iceCubes.push(c);
      S.plip(2.2);
    }
    iceCubes.forEach(c => {
      if (c.position.y > -28 + iceCubes.indexOf(c) % 3 * 10) {
        c.userData.vy -= 900 * dt;
        c.position.y = Math.max(-28 + iceCubes.indexOf(c) % 3 * 10, c.position.y + c.userData.vy * dt);
        if (c.position.y <= -28 + iceCubes.indexOf(c) % 3 * 10 + 1 && c.userData.vy < -50) {
          c.userData.vy = 0;
          S.clickReal(0.3);
        }
      }
    });

    if (window.__dbgFR) window.__dbgFR({
      temp: +temp.toFixed(1), comp: +compSpeed.toFixed(1),
      top: +doorTopA.toFixed(2), bot: +doorBotA.toFixed(2),
      ice: iceCubes.length, inside: foods.filter(f => f.inside).length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      doorTopA = 0; doorBotA = 0; temp = 4; compSpeed = 2; iceT = 0; alarmT = 0;
      iceCubes = [];
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(60, 620, 60),
        radius: 1600, radiusPortraitBase: 2000, radiusMaxPortrait: 3200,
        az: 0.35, po: 1.1,
      });
      build();
      drawTemp();
      hum = S.humLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ドアをあける → 食べ物を入れる → ドアを閉める */
      let gdIn = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => window.__pts.doorBot, to: () => {
            const v = new THREE.Vector3();
            doorBot.getWorldPosition(v);
            v.x += 300;
            v.z += 300;
            return v;
          },
          when: () => doorBotA < 0.5, done: () => doorBotA > 0.6,
        },
        {
          kind: 'drag', at: () => window.__pts.food0, to: () => new THREE.Vector3(-100, 500, -40),
          when: () => doorBotA > 0.5,
          done: () => (gdIn = gdIn || foods.some(f => f.inside)),
        },
        {
          kind: 'drag', at: () => window.__pts.doorBot, to: () => new THREE.Vector3(200, 490, 200),
          when: () => foods.some(f => f.inside) && doorBotA > 0.5,
          done: () => doorBotA < 0.2,
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
