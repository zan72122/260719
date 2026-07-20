/* 消火器 — 写実3D
 *
 * 絶対に練習できない一発勝負の機械。
 * 連鎖: 安全ピンを引き抜く → レバーを握る → ボンベの圧力がホースへ →
 *       ノズルから粉末噴射 → 当たった場所の炎が消える → 熾火が残ると再燃 →
 *       完全に消えると蒸気と煙だけが立ちのぼる
 * 分岐: ねらい × 距離 × 噴射の配分(連続かパルスか) × 火の広がり方 × 残圧
 */
window.GAMES.extinguisher = (() => {
  const TANK = new THREE.Vector3(-300, 0, 180);
  const CELLS = [
    [180, 40], [260, 10], [340, 50], [230, 110], [310, 120], [400, 100], [280, -60],
  ];

  let stage3, scene, raf, prev, time;
  let pin, pinHit, lever, leverHit, tankHit, needle, nozzleG, matchHit;
  let cells, sprayMesh, sprayState, dummy, smoke, smokeState;
  let pinOut, squeezing, pressure, aim, aimId, pinDragId, pinDragX;
  let orbitId, orbitFrom, spraySnd, fireSnd, allOutT;
  let mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#b8c8d8', '#c8d2d8', '#a8a89a');

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1500, 900), shadowSpan: 900, intensity: 0.85 });

    /* --- 消火器 --- */
    const red = new THREE.MeshPhysicalMaterial({ color: 0xb02020, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 0.6 });
    const tank = G3.add(scene, new THREE.CylinderGeometry(62, 62, 260, 24), red, TANK.x, 150, TANK.z);
    tank.castShadow = true;
    G3.add(scene, new THREE.SphereGeometry(62, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, TANK.x, 280, TANK.z);
    G3.add(scene, new THREE.CylinderGeometry(16, 20, 40, 12), mats.steel, TANK.x, 320, TANK.z);
    /* 圧力計 */
    G3.add(scene, new THREE.CylinderGeometry(26, 26, 8, 16), mats.chrome, TANK.x - 40, 330, TANK.z + 20)
      .rotation.x = Math.PI / 2;
    needle = G3.add(scene, new THREE.BoxGeometry(3, 20, 3),
      new THREE.MeshBasicMaterial({ color: 0x202020 }), TANK.x - 40, 332, TANK.z + 26);
    /* ハンドル2枚 (下=固定 上=レバー) */
    G3.add(scene, new THREE.BoxGeometry(110, 12, 26), mats.steel, TANK.x + 20, 330, TANK.z);
    lever = G3.add(scene, new THREE.BoxGeometry(110, 10, 26), mats.steel, TANK.x + 20, 356, TANK.z);
    leverHit = new THREE.Mesh(new THREE.BoxGeometry(190, 130, 120), new THREE.MeshBasicMaterial({ visible: false }));
    leverHit.position.set(TANK.x + 25, 355, TANK.z);
    scene.add(leverHit);
    /* 安全ピン (黄色いリング) */
    pin = new THREE.Group();
    pin.position.set(TANK.x + 60, 342, TANK.z + 10);
    scene.add(pin);
    const yellow = new THREE.MeshPhysicalMaterial({ color: 0xe8c020, roughness: 0.35, clearcoat: 0.5 });
    G3.add(pin, new THREE.TorusGeometry(26, 6, 10, 20), yellow, 34, 0, 0).rotation.y = Math.PI / 2;
    G3.add(pin, new THREE.CylinderGeometry(4, 4, 46, 8), yellow, 0, -8, 0);
    pinHit = new THREE.Mesh(new THREE.SphereGeometry(60, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pinHit.position.copy(pin.position).add(new THREE.Vector3(40, 0, 0));
    scene.add(pinHit);
    /* ホースとノズル (ねらいに追従) */
    nozzleG = new THREE.Group();
    nozzleG.position.set(TANK.x + 120, 180, TANK.z + 60);
    scene.add(nozzleG);
    G3.add(nozzleG, new THREE.CylinderGeometry(14, 22, 70, 12), mats.darkPlastic, 0, 0, 0);
    tankHit = new THREE.Mesh(new THREE.CylinderGeometry(85, 85, 300, 10), new THREE.MeshBasicMaterial({ visible: false }));
    tankHit.position.set(TANK.x, 150, TANK.z);
    scene.add(tankHit);

    /* --- 焚き火 --- */
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
    cells = CELLS.map(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      scene.add(g);
      const log = G3.add(g, new THREE.CylinderGeometry(16, 16, 130, 8), logMat, 0, 16, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * 0.9;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(38, 120, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.85, depthWrite: false }));
      outer.position.y = 80;
      g.add(outer);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(20, 78, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.9, depthWrite: false }));
      inner.position.y = 66;
      g.add(inner);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(20, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff4400 }));
      ember.position.y = 12;
      g.add(ember);
      return { g, outer, inner, ember, x, z, fire: 1, heat: 1, ph: i * 1.3 };
    });
    const fireLight = new THREE.PointLight(0xff7a20, 1.6, 900);
    fireLight.position.set(290, 120, 60);
    scene.add(fireLight);
    cells.light = fireLight;

    /* マッチ (もう一度火をつける) */
    const match = new THREE.Group();
    match.position.set(520, 0, 300);
    scene.add(match);
    G3.add(match, new THREE.CylinderGeometry(5, 5, 110, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8b880, roughness: 0.8 }), 0, 55, 0);
    G3.add(match, new THREE.SphereGeometry(11, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.6 }), 0, 115, 0);
    matchHit = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 180, 8), new THREE.MeshBasicMaterial({ visible: false }));
    matchHit.position.set(520, 90, 300);
    scene.add(matchHit);

    /* 噴射の粉と煙 */
    sprayMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(9, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.8, depthWrite: false }), 110);
    sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sprayMesh.frustumCulled = false;
    scene.add(sprayMesh);
    sprayState = [];
    for (let i = 0; i < 110; i++) sprayState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0 });
    smoke = new THREE.InstancedMesh(new THREE.SphereGeometry(20, 7, 5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }), 50);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = false;
    scene.add(smoke);
    smokeState = [];
    for (let i = 0; i < 50; i++) smokeState.push({ on: false, x: 0, y: 0, z: 0, age: 0, life: 1, white: 0.5 });
    dummy = new THREE.Object3D();

    window.__pts.pin = pinHit;
    window.__pts.lever = leverHit;
    window.__pts.tank = tankHit;
    window.__pts.match = matchHit;
    window.__pts.fire = cells[1].g;
  }

  function spawnSmoke(x, y, z, white) {
    const s = smokeState.find(q => !q.on);
    if (!s) return;
    s.on = true; s.x = x; s.y = y; s.z = z;
    s.age = 0; s.life = U.rand(1, 1.8); s.white = white;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (!pinOut && ray.intersectObject(pinHit, false).length) {
      pinDragId = e.pointerId;
      pinDragX = e.clientX;
      return;
    }
    if (ray.intersectObject(leverHit, false).length) {
      squeezing = true;
      if (!pinOut) S.buzz();               /* ピンを抜かないと握れない */
      else if (pressure <= 0.02) S.sputter();
      else S.clickReal(0.6);
      return;
    }
    if (pressure <= 0.02 && ray.intersectObject(tankHit, false).length) {
      /* 使い切ったボンベを新品に交換 (ピンも刺さった状態に戻る) */
      pressure = 1;
      pinOut = false;
      pin.visible = true;
      pin.position.set(TANK.x + 60, 342, TANK.z + 10);
      S.thunk();
      S.clickReal(0.7, 0.15);
      return;
    }
    if (ray.intersectObject(matchHit, false).length) {
      /* マッチでもう一度点火 */
      const c = cells[Math.floor(cells.length / 2)];
      c.fire = Math.max(c.fire, 0.6);
      c.heat = 1;
      S.clickReal(0.5);
      S.whoosh(0.4);
      return;
    }
    if (aimId === null) {
      aimId = e.pointerId;
      moveAim(e);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function moveAim(e) {
    const ray = stage3.setRay(e);
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = (20 - o.y) / d.y;
    if (t > 0) {
      aim.x = U.clamp(o.x + d.x * t, -100, 800);
      aim.z = U.clamp(o.z + d.z * t, -400, 500);
    }
  }

  function onMove(e) {
    if (e.pointerId === pinDragId) {
      if (Math.abs(e.clientX - pinDragX) > 46) {
        pinOut = true;
        pinDragId = null;
        pin.visible = false;
        S.ratchet(1);
        S.clickReal(0.9, 0.06);
      }
    } else if (e.pointerId === aimId) {
      moveAim(e);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.2);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.8, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === pinDragId) pinDragId = null;
    else if (e.pointerId === aimId) aimId = null;
    else if (e.pointerId === orbitId) orbitId = null;
    if (squeezing) squeezing = false;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    const spraying = squeezing && pinOut && pressure > 0.02;
    /* レバーの見た目 */
    lever.rotation.z += ((squeezing && pinOut ? -0.24 : 0) - lever.rotation.z) * Math.min(1, dt * 14);
    lever.position.y = 356 + lever.rotation.z * 40;

    /* ノズルはねらいの方向を向く */
    const dirX = aim.x - nozzleG.position.x, dirZ = aim.z - nozzleG.position.z;
    const dl = Math.hypot(dirX, 160, dirZ);
    nozzleG.rotation.z = -Math.atan2(Math.hypot(dirX, dirZ), 160) * 0.9;
    nozzleG.rotation.y = Math.atan2(-dirZ, dirX) * 0.4;

    if (spraying) {
      pressure = Math.max(0, pressure - dt * 0.09);
      spraySnd.set(0.8);
      /* 粉の粒を飛ばす */
      for (let n = 0; n < 3; n++) {
        const s = sprayState.find(q => !q.on);
        if (!s) break;
        s.on = true;
        s.x = nozzleG.position.x; s.y = nozzleG.position.y; s.z = nozzleG.position.z;
        const spd = U.rand(0.85, 1.05);
        s.vx = dirX * spd * 0.95;
        s.vy = 110;
        s.vz = dirZ * spd * 0.95;
        s.age = 0;
      }
      if (pressure <= 0.02) S.sputter();
    } else {
      spraySnd.set(0);
    }
    needle.rotation.z = U.lerp(1.4, -1.4, pressure);

    /* 粉の粒: 落ちて、火に当たると消していく */
    let k = 0;
    for (const s of sprayState) {
      if (s.on) {
        s.age += dt;
        s.vy -= 620 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        if (s.y < 6 || s.age > 1.6) {
          /* 着地: 近くの炎を消し、熾火を冷ます */
          for (const c of cells) {
            const d = Math.hypot(c.x - s.x, c.z - s.z);
            if (d < 105) {
              c.fire = Math.max(0, c.fire - 0.2);
              c.heat = Math.max(0, c.heat - 0.12);
              spawnSmoke(c.x, 60, c.z, 0.85);
            }
          }
          s.on = false;
        }
      }
      dummy.position.set(s.x, s.on ? s.y : -9000, s.z);
      dummy.scale.setScalar(s.on ? 1 + s.age * 1.6 : 0.001);
      dummy.updateMatrix();
      sprayMesh.setMatrixAt(k++, dummy.matrix);
    }
    sprayMesh.instanceMatrix.needsUpdate = true;

    /* 炎: となりが燃えていると再び燃え広がる。熾火が残ると再燃する */
    let total = 0;
    for (const c of cells) {
      let neighborFire = 0;
      for (const o of cells) {
        if (o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 130) neighborFire = Math.max(neighborFire, o.fire);
      }
      if (c.heat > 0.15 && (c.fire > 0.03 || neighborFire > 0.5)) {
        c.fire = Math.min(1, c.fire + dt * 0.16 * c.heat);
      }
      c.fire = Math.max(0, c.fire - dt * 0.008);
      total += c.fire;
      const fl = c.fire * (0.85 + 0.3 * Math.sin(time * 11 + c.ph));
      c.outer.scale.set(Math.max(0.001, fl), Math.max(0.001, fl * (1 + 0.2 * Math.sin(time * 7 + c.ph))), Math.max(0.001, fl));
      c.inner.scale.copy(c.outer.scale);
      c.ember.material.color.setHSL(0.03, 1, 0.1 + c.heat * 0.25 + c.fire * 0.1);
      if (c.fire > 0.25 && Math.random() < 0.05) spawnSmoke(c.x, 120, c.z, 0.25);
      if (c.fire < 0.15 && c.heat > 0.3 && Math.random() < 0.04) spawnSmoke(c.x, 40, c.z, 0.6);
    }
    cells.light.intensity = U.clamp(total * 0.4, 0, 2) * (0.9 + 0.2 * Math.sin(time * 13));
    fireSnd.set(U.clamp(total * 0.14, 0, 0.6));
    if (total < 0.05 && cells.every(c => c.heat < 0.15)) {
      if (allOutT === 0) S.sparkle();   /* 完全鎮火 */
      allOutT += dt;
    } else {
      allOutT = 0;
    }

    /* 煙 */
    k = 0;
    for (const s of smokeState) {
      if (s.on) {
        s.age += dt;
        if (s.age >= s.life) s.on = false;
        s.y += 130 * dt;
        s.x += Math.sin(time * 2 + s.z) * 16 * dt;
      }
      dummy.position.set(s.x, s.on ? s.y : -9000, s.z);
      dummy.scale.setScalar(s.on ? (0.5 + s.age * 1.4) * (1 - s.age / s.life * 0.4) : 0.001);
      dummy.updateMatrix();
      smoke.setMatrixAt(k, dummy.matrix);
      smoke.setColorAt(k, new THREE.Color().setScalar(0.3 + s.white * 0.7));
      k++;
    }
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;

    if (window.__dbgEX) window.__dbgEX({ pin: pinOut, p: +pressure.toFixed(2), fire: +total.toFixed(2) });
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      pinOut = false; squeezing = false; pressure = 1;
      aim = { x: 280, z: 60 };
      aimId = null; pinDragId = null; orbitId = null;
      allOutT = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(40, 220, 100),
        radius: 1500, radiusPortraitBase: 1300, radiusMaxPortrait: 2100,
        az: 0.35, po: 1.22,
      });
      build();
      spraySnd = S.wind();
      fireSnd = S.fuseLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      if (spraySnd) spraySnd.stop();
      if (fireSnd) fireSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
