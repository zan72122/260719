/* 炊飯器 — 写実3D (断面)
 *
 * 毎朝のごはんがどうやって炊けるのか、フタの中は見えない。
 * 正面を断面にして、内釜・ヒーター・対流・蒸気弁を見せる。
 * 連鎖: お米を入れる → 水を注ぐ → フタを閉める → ボタン → ヒーターが赤くなる →
 *       水が対流してお米が踊る → 沸騰の泡 → 蒸気弁からシューッ → チン!で保温ランプ →
 *       フタをあけて湯気 → しゃもじでお茶碗によそう
 * 分岐: お米の量 × 水加減 (少ない=こげ / 多い=べちゃ / ぴったり=ふっくら) × よそった茶碗はたまる。
 */
window.GAMES.suihanki = (() => {
  let stage3, scene, raf, prev, time;
  let bodyG, lid, potRice, potWater, heater, lampCv, lampTex;
  let bubbles, bubbleState, steamParts, steamState, dummy;
  let cup, pitcher, shamoji, bowlsG, bowls;
  let riceN, waterN, lidA, cooking, cookT, doneKind, keepWarm, scooped;
  let dragObj, dragId, orbitId, orbitFrom, pourT;
  let hum, slosh, mats;

  const POT_X = -120, POT_Z = 40;

  /* 操作平面上の点Pを、カメラから見て高さyTにある点へ射影し直す (視差補正) */
  function groundPoint(P, yT) {
    const C = stage3.camera.position;
    const s = (yT - C.y) / (P.y - C.y);
    return new THREE.Vector3(C.x + (P.x - C.x) * s, yT, C.z + (P.z - C.z) * s);
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#efe8dc', '#f4efe4', '#c9bda8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb9a684, roughness: 0.65 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1600, 1300), shadowSpan: 1100, intensity: 0.95 });
    /* キッチンの壁とカウンター */
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xe6ddca, roughness: 0.7 }), 0, 700, -420);
    const counter = G3.add(scene, new THREE.BoxGeometry(1500, 180, 700),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.55 }), 60, 90, 60);
    counter.castShadow = true;
    counter.receiveShadow = true;

    /* --- 本体 (正面が断面) --- */
    bodyG = new THREE.Group();
    bodyG.position.set(POT_X, 180, POT_Z);
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.25, clearcoat: 0.6 });
    /* 外殻: 後半分だけのシェル (前は断面あき) */
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(210, 210, 300, 28, 1, true, Math.PI * 0.06, Math.PI * 0.88),
      new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide }));
    shell.position.y = 150;
    shell.rotation.y = Math.PI / 2;
    shell.castShadow = true;
    bodyG.add(shell);
    G3.add(bodyG, new THREE.CylinderGeometry(210, 210, 26, 28), shellM, 0, 8, 0).castShadow = true;
    /* 断面リング (上端) */
    G3.add(bodyG, new THREE.TorusGeometry(200, 12, 8, 28), mats.darkPlastic, 0, 300, 0).rotation.x = Math.PI / 2;
    /* 内釜 (うしろ半分) */
    const potM = new THREE.MeshStandardMaterial({ color: 0x4c4f54, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(170, 150, 250, 24, 1, true, Math.PI * 0.02, Math.PI * 0.96),
      potM);
    pot.position.y = 165;
    pot.rotation.y = Math.PI / 2;
    bodyG.add(pot);
    G3.add(bodyG, new THREE.CylinderGeometry(150, 150, 14, 24), potM, 0, 45, 0);
    /* ヒーター板 (釜の下・赤熱する) */
    heater = G3.add(bodyG, new THREE.CylinderGeometry(140, 140, 18, 24),
      new THREE.MeshStandardMaterial({ color: 0x5a4038, roughness: 0.5, emissive: 0x000000 }), 0, 30, 0);
    /* お米と水 (半円柱・断面側は平面) */
    const halfCyl = (r, col, op) => new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 1, 20, 1, false, 0, Math.PI),
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.55, transparent: op < 1, opacity: op }));
    potRice = halfCyl(145, 0xf4f1e6, 1);
    potRice.rotation.y = Math.PI;
    potRice.position.set(0, 52, 0);
    bodyG.add(potRice);
    potRice.visible = false;
    potWater = halfCyl(146, 0xbcd8e8, 0.55);
    potWater.rotation.y = Math.PI;
    potWater.position.set(0, 52, 0);
    bodyG.add(potWater);
    potWater.visible = false;

    /* --- フタ (うしろヒンジ・蒸気弁つき) --- */
    lid = new THREE.Group();
    lid.position.set(0, 310, -170);
    bodyG.add(lid);
    const lidTop = G3.add(lid, new THREE.CylinderGeometry(205, 205, 40, 28), shellM, 0, 20, 170);
    lidTop.castShadow = true;
    G3.add(lid, new THREE.CylinderGeometry(24, 30, 34, 12), mats.darkPlastic, 60, 55, 240);
    window.__pts.lid = lid;

    /* --- 操作パネル (ボタン+ランプ) --- */
    const panel = G3.add(bodyG, new THREE.BoxGeometry(150, 90, 26),
      new THREE.MeshStandardMaterial({ color: 0xe3e6ea, roughness: 0.4 }), 0, 120, 208);
    panel.rotation.x = -0.25;
    const btn = G3.add(scene, new THREE.CylinderGeometry(34, 38, 20, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xd85a40, roughness: 0.3, clearcoat: 0.5 }), POT_X, 310, POT_Z + 245);
    btn.rotation.x = 0.35;
    window.__pts.btn = btn;
    lampCv = document.createElement('canvas');
    lampCv.width = 128;
    lampCv.height = 48;
    lampTex = new THREE.CanvasTexture(lampCv);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(130, 48), new THREE.MeshBasicMaterial({ map: lampTex, transparent: true }));
    lamp.position.set(POT_X, 285, POT_Z + 218);
    lamp.rotation.x = -0.25;
    scene.add(lamp);

    /* --- 対流の泡 --- */
    bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(8, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), 40);
    bubbles.frustumCulled = false;
    scene.add(bubbles);
    bubbleState = [];
    for (let i = 0; i < 40; i++) bubbleState.push({ on: false, a: 0, r: 0, y: 0, v: 0 });
    /* --- 蒸気 --- */
    steamParts = new THREE.InstancedMesh(new THREE.SphereGeometry(13, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf4f8fa, transparent: true, opacity: 0.5 }), 40);
    steamParts.frustumCulled = false;
    scene.add(steamParts);
    steamState = [];
    for (let i = 0; i < 40; i++) steamState.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, age: 0 });
    dummy = new THREE.Object3D();

    /* --- 計量カップ (お米入り) --- */
    cup = new THREE.Group();
    cup.position.set(300, 200, 320);
    scene.add(cup);
    const cupM = new THREE.MeshPhysicalMaterial({ color: 0xdce8ee, roughness: 0.15, transparent: true, opacity: 0.55 });
    G3.add(cup, new THREE.CylinderGeometry(52, 44, 110, 14, 1, true), cupM).material.side = THREE.DoubleSide;
    G3.add(cup, new THREE.CylinderGeometry(44, 44, 8, 14), cupM, 0, -52, 0);
    G3.add(cup, new THREE.CylinderGeometry(46, 40, 70, 14),
      new THREE.MeshStandardMaterial({ color: 0xf6f3e8, roughness: 0.8 }), 0, -14, 0);
    window.__pts.cup = cup;

    /* --- 水さし --- */
    pitcher = new THREE.Group();
    pitcher.position.set(430, 220, 240);
    scene.add(pitcher);
    const pitM = new THREE.MeshPhysicalMaterial({ color: 0xcfe4f0, roughness: 0.12, transparent: true, opacity: 0.5 });
    G3.add(pitcher, new THREE.CylinderGeometry(58, 50, 150, 14, 1, true), pitM).material.side = THREE.DoubleSide;
    G3.add(pitcher, new THREE.CylinderGeometry(50, 50, 8, 14), pitM, 0, -72, 0);
    G3.add(pitcher, new THREE.CylinderGeometry(52, 46, 100, 14),
      new THREE.MeshPhysicalMaterial({ color: 0x9ecce6, roughness: 0.2, transparent: true, opacity: 0.7 }), 0, -20, 0);
    G3.add(pitcher, new THREE.BoxGeometry(16, 90, 14), mats.whitePlastic, 66, 10, 0);
    window.__pts.pitcher = pitcher;

    /* --- しゃもじとお茶碗 --- */
    shamoji = new THREE.Group();
    shamoji.position.set(150, 200, 400);
    scene.add(shamoji);
    const shamM = new THREE.MeshStandardMaterial({ color: 0xf8f8f4, roughness: 0.5 });
    G3.add(shamoji, new THREE.BoxGeometry(24, 90, 12), shamM, 0, -40, 0);
    const paddle = G3.add(shamoji, new THREE.SphereGeometry(42, 12, 9), shamM, 0, 30, 0);
    paddle.scale.set(1, 1.25, 0.35);
    window.__pts.shamoji = shamoji;
    bowlsG = new THREE.Group();
    bowlsG.position.set(380, 180, 430);
    scene.add(bowlsG);
    bowls = [];
    mkBowl();
    window.__pts.pot = bodyG;
  }

  function mkBowl() {
    const g = new THREE.Group();
    const i = bowls.length;
    g.position.set((i % 3) * -130, 0, Math.floor(i / 3) * -110);
    const m = new THREE.MeshPhysicalMaterial({ color: 0xd8e2e8, roughness: 0.3, clearcoat: 0.4 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(62, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), m);
    b.material.side = THREE.DoubleSide;
    b.scale.y = 1.15;
    b.position.y = 56;
    g.add(b);
    G3.add(g, new THREE.CylinderGeometry(26, 26, 10, 12), m, 0, 2, 0);
    const rice = G3.add(g, new THREE.SphereGeometry(46, 10, 7),
      new THREE.MeshStandardMaterial({ color: 0xf6f3e8, roughness: 0.85 }), 0, 48, 0);
    rice.scale.set(1, 0.55, 1);
    rice.visible = false;
    g.userData.rice = rice;
    bowlsG.add(g);
    bowls.push(g);
    window.__pts.bowl = g;
    return g;
  }

  function drawLamp() {
    const c = lampCv.getContext('2d');
    c.clearRect(0, 0, 128, 48);
    c.textAlign = 'center';
    c.font = 'bold 20px sans-serif';
    if (cooking) {
      c.fillStyle = '#ff7040';
      c.fillText('たいてます', 64, 30);
    } else if (keepWarm) {
      c.fillStyle = '#ffb020';
      c.fillText('ほおん', 64, 30);
    } else {
      c.fillStyle = '#9aa2aa';
      c.fillText('おやすみ', 64, 30);
    }
    lampTex.needsUpdate = true;
  }

  /* 水加減の判定: 炊きはじめた時点の比率で決まる (蒸発前) */
  let cookRatio = 1;
  function judge() {
    if (cookRatio < 0.75) return 'koge';
    if (cookRatio > 1.9) return 'becha';
    return 'fukkura';
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
    /* カップ・水さし・しゃもじは近いもの勝ち (判定の重なり対策) */
    const grabbables = [['cup', cup, 130], ['pitcher', pitcher, 140], ['shamoji', shamoji, 120]];
    let best = null, bestD = 1;
    for (const [name, obj, rad] of grabbables) {
      obj.getWorldPosition(v);
      const d = ray.ray.distanceToPoint(v) / rad;
      if (d < 1 && d < bestD) { best = name; bestD = d; }
    }
    if (best) { dragObj = best; dragId = e.pointerId; S.plip(1.2); return; }
    if (near(window.__pts.btn, 80)) {
      if (!cooking && !keepWarm && lidA < 0.15 && riceN > 0.3) {
        cooking = true;
        cookT = 0;
        doneKind = null;
        cookRatio = waterN / Math.max(0.4, riceN);
        S.clickReal(0.9);
        S.ding();
        drawLamp();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(lid, 240, 40)) {
      /* フタの開閉 (調理中はあかない) */
      if (!cooking) {
        lid.userData.target = lidA > 0.5 ? 0 : 1;
        S.kachi();
        if (keepWarm && lid.userData.target === 1) S.whoosh(1.4);
      } else {
        S.buzz();
      }
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
      const t = (420 - o.y) / d.y;
      if (t > 0) {
        const p = new THREE.Vector3(o.x + d.x * t, 420, o.z + d.z * t);
        const obj = dragObj === 'cup' ? cup : dragObj === 'pitcher' ? pitcher : shamoji;
        obj.position.set(p.x, 420, p.z);
        const overPot = Math.hypot(p.x - POT_X, p.z - POT_Z) < 200;
        if (dragObj !== 'shamoji') obj.rotation.z = overPot ? 1.9 : 0;
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.55, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.75, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      const obj = dragObj === 'cup' ? cup : dragObj === 'pitcher' ? pitcher : shamoji;
      if (dragObj === 'shamoji') {
        /* お茶碗の上ではなす → よそう */
        const bowl = bowls[bowls.length - 1];
        const bv = new THREE.Vector3();
        bowl.getWorldPosition(bv);
        const q = groundPoint(obj.position, bv.y + 60);
        if (keepWarm && lidA > 0.6 && scooped && Math.hypot(q.x - bv.x, q.z - bv.z) < 190) {
          bowl.userData.rice.visible = true;
          bowl.userData.rice.material = new THREE.MeshStandardMaterial({
            color: doneKind === 'koge' ? 0xb98a52 : doneKind === 'becha' ? 0xe4e6da : 0xf6f3e8,
            roughness: doneKind === 'becha' ? 0.35 : 0.85,
          });
          scooped = false;
          riceN = Math.max(0, riceN - 1);
          if (riceN <= 0.3) { keepWarm = false; drawLamp(); }
          S.squishReal(0.5);
          S.yay();
          mkBowl();
        }
      }
      obj.rotation.z = 0;
      obj.position.copy(obj.userData.home);
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

    /* フタ */
    lidA += ((lid.userData.target || 0) - lidA) * Math.min(1, dt * 5);
    lid.rotation.x = -lidA * 1.9;

    /* そそぐ (傾けている間) */
    if (dragObj === 'cup' && cup.rotation.z > 1 && lidA > 0.6 && riceN < 3) {
      riceN = Math.min(3, riceN + dt * 0.9);
      if (Math.floor(time * 6) % 2 === 0) S.plip(0.7 + riceN * 0.2);
    }
    if (dragObj === 'pitcher' && pitcher.rotation.z > 1 && lidA > 0.6 && waterN < 5) {
      waterN = Math.min(5, waterN + dt * 1.1);
      pourT += dt;
      if (pourT > 0.4) { pourT = 0; S.glug(); }
    }
    /* 釜の中の見た目 */
    const riceH = riceN * 55;
    const waterH = Math.max(0, waterN * 42 - riceH * 0.25);
    potRice.visible = riceN > 0.05;
    potRice.scale.y = Math.max(1, riceH);
    potRice.position.y = 52 + riceH / 2;
    potWater.visible = waterN > 0.05 && !keepWarm;
    potWater.scale.y = Math.max(1, waterH);
    potWater.position.y = 52 + riceH * 0.75 + waterH / 2;

    /* 炊飯 */
    if (cooking) {
      cookT += dt;
      const heat = Math.min(1, cookT / 3);
      heater.material.emissive.setRGB(heat * 0.9, heat * 0.15, 0.02);
      if (slosh) slosh.set(cookT > 3 ? 0.7 : 0.2);
      if (hum) hum.set(0.3 + heat * 0.3);
      /* 対流の泡 */
      if (cookT > 2.5) {
        bubbleState.forEach(b => {
          if (!b.on && Math.random() < dt * 4) {
            b.on = true;
            b.a = Math.random() * Math.PI;
            b.r = 30 + Math.random() * 100;
            b.y = 60;
            b.v = 60 + Math.random() * 90;
          }
        });
      }
      /* 蒸気 (沸騰後・弁から) */
      if (cookT > 5) {
        waterN = Math.max(0, waterN - dt * 0.25);
        steamState.forEach(s => {
          if (!s.on && Math.random() < dt * 5) {
            s.on = true;
            s.x = POT_X + 60;
            s.y = 560;
            s.z = POT_Z + 70;
            s.vx = (Math.random() - 0.5) * 30;
            s.vy = 160 + Math.random() * 120;
            s.age = 0;
          }
        });
      }
      if (cookT > 11) {
        cooking = false;
        keepWarm = true;
        doneKind = judge();
        heater.material.emissive.setRGB(0.1, 0.02, 0);
        /* 炊きあがりの色 */
        potRice.material.color.set(doneKind === 'koge' ? 0xcfa268 : doneKind === 'becha' ? 0xe8ead8 : 0xf8f5ea);
        potRice.scale.y = Math.max(1, riceH * (doneKind === 'becha' ? 1.05 : 1.3));
        potRice.position.y = 52 + (riceH * (doneKind === 'becha' ? 1.05 : 1.3)) / 2;
        scooped = false;
        if (slosh) slosh.set(0);
        if (hum) hum.set(0.15);
        S.ding();
        S.doorChime();
        drawLamp();
      }
    }
    /* 保温中: フタをあけたらしゃもじですくえる */
    if (keepWarm && lidA > 0.6 && dragObj === 'shamoji') {
      const sv = shamoji.position;
      if (Math.hypot(sv.x - POT_X, sv.z - POT_Z) < 190) scooped = true;
    }

    /* 泡の更新 */
    bubbleState.forEach((b, i) => {
      if (b.on) {
        b.y += b.v * dt;
        b.a += dt * 2;
        const top = 60 + riceN * 55 + waterN * 40;
        if (b.y > top + 180) b.on = false;
        dummy.position.set(POT_X + Math.cos(b.a) * b.r * 0.6, 180 + b.y, POT_Z + 60 + Math.sin(b.a) * 18);
        dummy.scale.setScalar(1);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
    });
    bubbles.instanceMatrix.needsUpdate = true;
    /* 蒸気の更新 */
    steamState.forEach((s, i) => {
      if (s.on) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.age > 1.3) s.on = false;
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.setScalar(1 + s.age * 2);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      steamParts.setMatrixAt(i, dummy.matrix);
    });
    steamParts.instanceMatrix.needsUpdate = true;

    if (window.__dbgSU) window.__dbgSU({
      drag: dragObj || null,
      rice: +riceN.toFixed(1), water: +waterN.toFixed(1), lid: +lidA.toFixed(2),
      cooking, cookT: +cookT.toFixed(1), done: doneKind, warm: keepWarm,
      bowls: bowls.filter(b => b.userData.rice.visible).length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      riceN = 0; waterN = 0; lidA = 1; cooking = false; cookT = 0;
      doneKind = null; keepWarm = false; scooped = false; pourT = 0;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(40, 330, 60),
        radius: 1250, radiusPortraitBase: 1500, radiusMaxPortrait: 2400,
        az: 0.15, po: 1.08,
      });
      build();
      lid.userData.target = 1;
      cup.userData.home = cup.position.clone();
      pitcher.userData.home = pitcher.position.clone();
      shamoji.userData.home = shamoji.position.clone();
      drawLamp();
      hum = S.humLoop();
      hum.set(0.1);
      slosh = S.sloshLoop();
      slosh.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: お米 → 水 → フタ → ボタン → (炊けたら)フタ → しゃもじ */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => cup, to: () => new THREE.Vector3(POT_X, 420, POT_Z),
          when: () => riceN < 0.5 && lidA > 0.6 && !cooking && !keepWarm,
          done: () => riceN >= 0.5,
        },
        {
          kind: 'drag', at: () => pitcher, to: () => new THREE.Vector3(POT_X, 420, POT_Z),
          when: () => riceN >= 0.5 && waterN < 0.6 && lidA > 0.6 && !cooking,
          done: () => waterN >= 0.6,
        },
        {
          kind: 'tap', at: () => lid,
          when: () => riceN >= 0.5 && waterN >= 0.6 && lidA > 0.5 && !cooking && !keepWarm,
          done: () => lidA < 0.3,
        },
        {
          kind: 'tap', at: () => window.__pts.btn,
          when: () => riceN >= 0.5 && waterN >= 0.6 && lidA < 0.3 && !cooking && !keepWarm,
          done: () => cooking || keepWarm,
        },
        {
          kind: 'tap', at: () => lid,
          when: () => keepWarm && lidA < 0.5,
          done: () => lidA > 0.6,
        },
        {
          kind: 'drag', at: () => shamoji, to: () => new THREE.Vector3(POT_X, 420, POT_Z),
          when: () => keepWarm && lidA > 0.6,
          done: () => bowls.some(b => b.userData.rice.visible),
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (hum) hum.stop();
      if (slosh) slosh.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
