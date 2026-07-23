/* ガソリンスタンド — 写実3D (断面)
 *
 * 親のとなりでいつも見ている給油。地面の下まで断面にして、
 * 地下タンクからポンプで吸い上げられる道のりを見せる。
 * 連鎖: ノズルを車のタンクへ → レバーをにぎる → ポンプが回る →
 *       地下タンクから吸い上げ → 流量計がぐるぐる回って数字が増える →
 *       ホースの中を燃料が流れる → 車のタンクが満ちる → カチッと自動ストップ →
 *       ノズルをもどす → 車が出発して次の車が来る
 * 分岐: どこまで入れるか (途中でやめてもいい) × 車ごとのタンク残量 ×
 *       地下タンクが減ったらタンクローリーで補充。
 */
window.GAMES.gasstand = (() => {
  const FILLER = new THREE.Vector3(430, 190, 60);

  let stage3, scene, raf, prev, time;
  let standG, nozzleG, nozzleHome, hosePts, hoseMesh, meterWheel, dispCv, dispTex;
  let carG, carTank, carWheels, undergroundTank, ugFuel, pumpRotor, leverBtn, tankerBtn;
  let nozzleAt, squeezing, carFuel, carCap, ugLevel, price, carAnim, carCount, tankerAnim;
  let dragMode, dragId, orbitId, orbitFrom;
  let hum, mats;

  const hash = i => {
    const x = Math.sin(i * 91.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#c0d8e8', '#dce8f0', '#90a8bc');

    /* 地面 (右半分) と断面の土 (左下) */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.85 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -800;
    ground.receiveShadow = true;
    scene.add(ground);
    /* 手前は地面を切って地下が見える */
    G3.add(scene, new THREE.BoxGeometry(2600, 16, 1200),
      new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.85 }), 0, -8, 600 - 400 + 400);
    const dirtM = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 500, 60), dirtM, 0, -266, -180);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1400), shadowSpan: 1500, intensity: 0.95 });

    /* キャノピー (屋根) */
    [[-500], [340]].forEach(([x]) => {
      G3.add(scene, new THREE.CylinderGeometry(22, 26, 800, 10), mats.steel, x, 400, -240).castShadow = true;
    });
    G3.add(scene, new THREE.BoxGeometry(1500, 40, 700),
      new THREE.MeshPhysicalMaterial({ color: 0xe8e6e0, roughness: 0.3, clearcoat: 0.5 }), -80, 820, -100).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(1500, 60, 30),
      new THREE.MeshPhysicalMaterial({ color: 0xd84a3a, roughness: 0.35, clearcoat: 0.5 }), -80, 790, 250);

    /* --- 地下タンクと配管 (断面) --- */
    undergroundTank = G3.add(scene, new THREE.CylinderGeometry(160, 160, 500, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a7a52, metalness: 0.6, roughness: 0.4 }), -400, -290, -180);
    undergroundTank.rotation.z = Math.PI / 2;
    undergroundTank.castShadow = true;
    ugFuel = G3.add(scene, new THREE.CylinderGeometry(150, 150, 480, 18),
      new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.3 }), -400, -300, -180);
    ugFuel.rotation.z = Math.PI / 2;
    /* 吸い上げ管 */
    G3.add(scene, new THREE.CylinderGeometry(14, 14, 480, 8), mats.steel, -180, -50, -180);

    /* --- 計量機 (断面: ポンプと流量計) --- */
    standG = new THREE.Group();
    standG.position.set(-180, 0, -160);
    scene.add(standG);
    const stM = new THREE.MeshPhysicalMaterial({ color: 0xe8e6e0, roughness: 0.3, clearcoat: 0.5 });
    G3.add(standG, new THREE.BoxGeometry(220, 30, 160), stM, 0, 545, 0).castShadow = true;
    G3.add(standG, new THREE.BoxGeometry(220, 540, 30), stM, 0, 270, -65);
    G3.add(standG, new THREE.BoxGeometry(30, 540, 160), stM, -95, 270, 0).castShadow = true;
    G3.add(standG, new THREE.BoxGeometry(220, 60, 160),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 }), 0, 30, 0);
    /* ポンプ */
    pumpRotor = G3.add(standG, new THREE.CylinderGeometry(36, 36, 70, 12), mats.steel, 10, 120, 0);
    pumpRotor.rotation.x = Math.PI / 2;
    pumpRotor.castShadow = true;
    G3.add(standG, new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshStandardMaterial({ color: 0x9a4030, roughness: 0.5 }), 70, 120, 0);
    /* 流量計 (回る円盤) */
    meterWheel = G3.add(standG, new THREE.CylinderGeometry(44, 44, 20, 16), mats.brass, 10, 260, 20);
    meterWheel.rotation.x = Math.PI / 2;
    meterWheel.castShadow = true;
    G3.add(standG, new THREE.BoxGeometry(12, 44, 6), mats.darkPlastic, 10, 260, 34);
    /* 数字の画面 */
    dispCv = document.createElement('canvas');
    dispCv.width = 192;
    dispCv.height = 80;
    dispTex = new THREE.CanvasTexture(dispCv);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(180, 76),
      new THREE.MeshBasicMaterial({ map: dispTex }));
    disp.position.set(0, 430, 84);
    standG.add(disp);

    /* --- ノズルとホース --- */
    nozzleG = new THREE.Group();
    nozzleHome = new THREE.Vector3(-60, 380, -60);
    nozzleG.position.copy(nozzleHome);
    scene.add(nozzleG);
    const nzM = new THREE.MeshStandardMaterial({ color: 0x1a5c2a, roughness: 0.4 });
    G3.add(nozzleG, new THREE.BoxGeometry(36, 70, 30), nzM, 0, 0, 0).castShadow = true;
    const spout = G3.add(nozzleG, new THREE.CylinderGeometry(10, 8, 90, 8), mats.steel, 30, -30, 0);
    spout.rotation.z = 1.1;
    G3.add(nozzleG, new THREE.BoxGeometry(10, 40, 20), nzM, -6, -40, 0);
    window.__pts.nozzle = nozzleG;
    /* ホース (毎フレーム張り直すチューブ) */
    hoseMesh = new THREE.Mesh(new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.7 }));
    scene.add(hoseMesh);

    /* にぎりレバー (ボタン) */
    leverBtn = G3.add(scene, new THREE.CylinderGeometry(40, 44, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.35, clearcoat: 0.5 }), -350, 200, 220);
    leverBtn.rotation.x = 0.4;
    window.__pts.lever = leverBtn;
    G3.add(scene, new THREE.BoxGeometry(90, 180, 70),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5 }), -350, 90, 190);

    /* タンクローリー呼びボタン */
    tankerBtn = G3.add(scene, new THREE.CylinderGeometry(30, 34, 20, 14),
      new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.35, clearcoat: 0.5 }), -560, 200, 220);
    tankerBtn.rotation.x = 0.4;
    window.__pts.tanker = tankerBtn;
    G3.add(scene, new THREE.BoxGeometry(80, 180, 60),
      new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5 }), -560, 90, 190);

    /* --- 車 (給油口とタンクが断面で見える) --- */
    carG = new THREE.Group();
    scene.add(carG);
    buildCar();
    window.__pts.car = carG;
    window.__pts.filler = { getWorldPosition: v => v.copy(FILLER).add(carG.position) };
  }

  function buildCar() {
    while (carG.children.length) carG.remove(carG.children[0]);
    const col = [0x4a86d8, 0xd85a4a, 0x50b060, 0xd8b83a][carCount % 4];
    const carM = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.7 });
    G3.add(carG, new THREE.BoxGeometry(340, 90, 150), carM, 0, 90, 0).castShadow = true;
    G3.add(carG, new THREE.BoxGeometry(190, 80, 140), carM, -15, 170, 0).castShadow = true;
    G3.add(carG, new THREE.BoxGeometry(140, 60, 130),
      new THREE.MeshPhysicalMaterial({ color: 0xa8c8d8, roughness: 0.1, transparent: true, opacity: 0.55 }), -15, 175, 0);
    carWheels = [];
    [[-110], [110]].forEach(([x]) => {
      [-1, 1].forEach(s => {
        const w = G3.add(carG, new THREE.CylinderGeometry(40, 40, 28, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 }), x, 42, s * 78);
        w.rotation.x = Math.PI / 2;
        carWheels.push(w);
      });
    });
    /* 断面の燃料タンク */
    G3.add(carG, new THREE.BoxGeometry(130, 70, 20),
      new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.8, roughness: 0.4 }), 90, 60, 78);
    carTank = G3.add(carG, new THREE.BoxGeometry(120, 60, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.3 }), 90, 60, 80);
    /* 給油口 */
    G3.add(carG, new THREE.CylinderGeometry(16, 16, 20, 10), mats.chrome, 145, 120, 62).rotation.z = 1.1;
  }

  function drawMeter() {
    const c = dispCv.getContext('2d');
    c.fillStyle = '#101418';
    c.fillRect(0, 0, 192, 80);
    c.fillStyle = '#ffd040';
    c.textAlign = 'center';
    c.font = 'bold 40px monospace';
    c.fillText('¥' + Math.floor(price), 96, 52);
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
    if (near(nozzleG, 110)) {
      dragMode = 'nozzle';
      dragId = e.pointerId;
      if (nozzleAt === 'car') {
        nozzleAt = 'held';
        squeezing = false;
        nozzleG.rotation.z = 0;
      }
      S.clickReal(0.5);
      return;
    }
    if (near(leverBtn, 80)) {
      if (nozzleAt === 'car') {
        dragMode = 'lever';
        dragId = e.pointerId;
        squeezing = true;
        S.clickReal(0.9);
      } else {
        S.buzz();
      }
      return;
    }
    if (near(tankerBtn, 70)) {
      if (ugLevel < 0.35 && tankerAnim === 0) {
        tankerAnim = 0.001;
        S.whoosh(0.5);
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (carAnim === 0 && carFuel >= carCap - 0.01 && nozzleAt !== 'car' && near(carG, 260, 100)) {
      carAnim = 0.001;
      S.whoosh(0.6);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'nozzle') {
        const ray = stage3.setRay(e);
        const o = ray.ray.origin, d = ray.ray.direction;
        const t = (240 - o.y) / d.y;
        if (t > 0) {
          nozzleG.position.set(o.x + d.x * t, 240, U.clamp(o.z + d.z * t, -160, 300));
          const fv = new THREE.Vector3();
          window.__pts.filler.getWorldPosition(fv);
          if (nozzleG.position.distanceTo(fv) < 110) {
            nozzleAt = 'car';
            nozzleG.position.copy(fv).add(new THREE.Vector3(-20, 30, 20));
            nozzleG.rotation.z = -0.5;
            dragMode = null;
            dragId = null;
            S.thunk();
          }
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.42);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'nozzle' && nozzleAt !== 'car') {
        /* もどしたか */
        if (nozzleG.position.distanceTo(nozzleHome) < 900) {
          nozzleG.position.copy(nozzleHome);
          nozzleG.rotation.z = 0;
          nozzleAt = 'home';
        }
      }
      if (dragMode === 'lever') squeezing = false;
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

    /* 給油 */
    const filling = squeezing && nozzleAt === 'car' && carFuel < carCap && ugLevel > 0.02;
    if (filling) {
      carFuel = Math.min(carCap, carFuel + dt * 0.12);
      ugLevel = Math.max(0, ugLevel - dt * 0.022);
      price += dt * 320;
      meterWheel.rotation.z += dt * 9;
      pumpRotor.rotation.z += dt * 14;
      if (hum) hum.set(0.6);
      if (Math.random() < dt * 3) S.glug();
      drawMeter();
      /* 満タンで自動ストップ */
      if (carFuel >= carCap - 0.001) {
        squeezing = false;
        S.kachi();
        S.thunk();
      }
    } else if (hum) hum.set(0.08);

    /* 車のタンク表示 */
    carTank.scale.y = Math.max(0.05, carFuel);
    carTank.position.y = 60 - (1 - Math.max(0.05, carFuel)) * 28;
    /* 地下タンク表示 */
    ugFuel.scale.x = 1;
    ugFuel.scale.y = Math.max(0.06, ugLevel);
    ugFuel.position.y = -300 - (1 - Math.max(0.06, ugLevel)) * 70;

    /* ホースを張る */
    const a = new THREE.Vector3(-120, 500, -160);
    const b = nozzleG.position.clone();
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.min(a.y, b.y) - 120;
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    hoseMesh.geometry.dispose();
    hoseMesh.geometry = new THREE.TubeGeometry(curve, 20, 9, 6, false);

    /* 車の入れ替わり */
    if (carAnim > 0) {
      carAnim += dt;
      if (carAnim < 1.6) {
        carG.position.x = carAnim / 1.6 * 900;
        carWheels.forEach(w => { w.rotation.z -= dt * 12; });
      } else if (carAnim < 2.0) {
        carCount++;
        carCap = 0.75 + hash(carCount) * 0.25;
        carFuel = 0.12 + hash(carCount + 7) * 0.3;
        price = 0;
        buildCar();
        carG.position.x = -900;
        carAnim = 2.001;
      } else if (carAnim < 3.6) {
        carG.position.x = U.lerp(-900, 0, (carAnim - 2) / 1.6);
        carWheels.forEach(w => { w.rotation.z -= dt * 12; });
      } else {
        carG.position.x = 0;
        carAnim = 0;
        drawMeter();
        S.ding();
      }
    }

    /* タンクローリー補充 */
    if (tankerAnim > 0) {
      tankerAnim += dt;
      if (tankerAnim > 1 && tankerAnim < 3.5) {
        ugLevel = Math.min(1, ugLevel + dt * 0.35);
        if (Math.random() < dt * 4) S.glug();
      }
      if (tankerAnim > 3.6) {
        tankerAnim = 0;
        S.ding();
      }
    }

    if (window.__dbgGS) window.__dbgGS({
      at: nozzleAt, squeezing, fuel: +carFuel.toFixed(2), cap: +carCap.toFixed(2),
      ug: +ugLevel.toFixed(2), price: price | 0, carAnim: +carAnim.toFixed(1),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      nozzleAt = 'home'; squeezing = false;
      carCount = 0; carCap = 0.9; carFuel = 0.2; ugLevel = 0.85; price = 0;
      carAnim = 0; tankerAnim = 0;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 230, 0),
        radius: 1800, radiusPortraitBase: 2300, radiusMaxPortrait: 3700,
        az: 0.2, po: 1.08,
      });
      build();
      drawMeter();
      hum = S.humLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ノズルを車へ → レバー長押し → 満タンでノズルをもどす */
      let gdBack = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => nozzleG, to: () => window.__pts.filler,
          when: () => nozzleAt === 'home' && carAnim === 0, done: () => nozzleAt === 'car',
        },
        {
          kind: 'hold', at: () => leverBtn,
          when: () => nozzleAt === 'car' && carFuel < carCap,
          done: () => carFuel >= carCap - 0.01,
        },
        {
          kind: 'drag', at: () => nozzleG, to: () => new THREE.Vector3(-60, 400, -60),
          when: () => nozzleAt === 'car' && carFuel >= carCap - 0.01,
          done: () => (gdBack = gdBack || (nozzleAt === 'home' && carCount >= 0 && carFuel >= carCap - 0.01)),
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
