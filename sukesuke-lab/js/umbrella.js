/* 傘の中身 — 写実3D版 (Three.js)
 *
 * ワンタッチ開閉傘。透明シャフトの中のバネがランナーを押し上げて骨が開く。
 * 外の結果: 雨がアスファルトをだんだん濡らして黒くしていくが、
 * 開いた傘の下だけは乾いたまま丸く残る。強風で傘は本当に裏返る。
 * 単位は mm。傘の石突き(接地点)がワールド原点。
 */
window.GAMES.umbrella = (() => {
  const HUB_Y = 880;        // 骨の付け根 (上ろくろ) の高さ
  const RIB_LEN = 560;      // 骨のながさ
  const SECTORS = 8;        // 骨の本数
  const ANG_SUB = 4;        // セクターあたりの角度分割
  const RINGS = 8;          // 半径方向の分割
  const DROPS = 260;

  let stage3, scene, raf, prev, time;
  let umb, canopyMesh, canopyGeo, ribs, stretchers, runner, springCtl, btnHit, shaftHit;
  let open, flip, tilt;
  let openShown, thunked;
  let rainPts, rainPos, rainVel, groundTex, groundCtx, dryFadeT;
  let wind, gustT, gustPower, nextGust, flipDelay;
  let btnId, btnT0, holdDir;
  let tiltId, tiltFrom, tiltTrack, orbitId, orbitFrom;
  let spinVel, spinAngle, flingT;
  let canopyWet, dripT, dripIdx, drops3d, dropMat;
  let wetGrid, puddleSndT;
  let rainSnd, patterT;
  let mats;

  /* ---------------- 地面 (濡れていくアスファルト) ---------------- */

  function asphaltCanvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#8d8d8a';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const v = (95 + Math.random() * 80) | 0;
      ctx.fillStyle = `rgba(${v},${v},${v - 3},0.6)`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.7, 1.7);
    }
    return { cv, ctx };
  }

  /* ---------------- かさ生地 (パラメトリック曲面) ---------------- */

  function buildCanopyGeo() {
    const around = SECTORS * ANG_SUB;
    const verts = (around + 1) * (RINGS + 1);
    const pos = new Float32Array(verts * 3);
    const idx = [];
    for (let j = 0; j < RINGS; j++) {
      for (let i = 0; i < around; i++) {
        const a = j * (around + 1) + i;
        const b = a + around + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  function updateCanopy(alpha) {
    const around = SECTORS * ANG_SUB;
    const pos = canopyGeo.attributes.position.array;
    let k = 0;
    for (let j = 0; j <= RINGS; j++) {
      const t = j / RINGS;
      const rho = RIB_LEN * t;
      /* 生地は骨よりわずかに浅い角度で張る (中央がふくらむ) */
      const th = alpha * (0.78 + 0.22 * t);
      for (let i = 0; i <= around; i++) {
        const phi = (i / around) * Math.PI * 2;
        /* 骨と骨のあいだで生地がたわむスカラップ */
        const frac = (i % ANG_SUB) / ANG_SUB;
        const sag = Math.sin(Math.PI * frac) * t * t;
        const r = Math.sin(th) * rho * (1 - 0.045 * sag);
        const y = HUB_Y - Math.cos(th) * rho + sag * 26 * Math.sign(Math.cos(th));
        pos[k++] = Math.cos(phi) * r;
        pos[k++] = y - sag * 22;
        pos[k++] = Math.sin(phi) * r;
      }
    }
    canopyGeo.attributes.position.needsUpdate = true;
    canopyGeo.computeVertexNormals();
  }

  /* 骨とツユ先の位置 (updateCanopyと同じ角度定義) */
  function ribTip(alpha, phi) {
    return new THREE.Vector3(
      Math.cos(phi) * Math.sin(alpha) * RIB_LEN,
      HUB_Y - Math.cos(alpha) * RIB_LEN,
      Math.sin(phi) * Math.sin(alpha) * RIB_LEN
    );
  }

  function orientRod(mesh, from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  /* ---------------- 組み立て ---------------- */

  function build() {
    scene = stage3.scene;
    mats = G3.materials();

    /* 地面 */
    const g = asphaltCanvas();
    groundCtx = g.ctx;
    groundTex = new THREE.CanvasTexture(g.cv);
    groundTex.encoding = THREE.sRGBEncoding;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    scene.background = G3.bgGradient('#b9c2cb', '#a7b1bc', '#7d8894');
    G3.addLights(scene, {
      pos: new THREE.Vector3(900, 1700, 900), intensity: 0.72,
      color: 0xe8eef4, sky: 0xb9c3cd, groundCol: 0x5c6167, hemi: 0.55, shadowSpan: 1400,
    });

    /* --- 傘ぜんたい (かたむけ用グループ) --- */
    umb = new THREE.Group();
    scene.add(umb);

    /* シャフト: 透明でバネが見える */
    G3.add(umb, new THREE.CylinderGeometry(8, 8, 790, 24, 1, true), mats.glass, 0, 485, 0);
    /* 石突きと持ち手 */
    G3.add(umb, new THREE.CylinderGeometry(3, 6, 90, 16), mats.chrome, 0, 45, 0);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(50, 10, 14, 28, Math.PI), mats.darkPlastic);
    hook.position.set(50, 92, 0);
    hook.rotation.z = Math.PI;
    hook.castShadow = true;
    umb.add(hook);
    G3.add(umb, new THREE.CylinderGeometry(10, 10, 40, 16), mats.darkPlastic, 100, 112, 0);
    /* 上ろくろとトップ */
    G3.add(umb, new THREE.CylinderGeometry(11, 11, 30, 20), mats.pom, 0, HUB_Y, 0);
    G3.add(umb, new THREE.CylinderGeometry(4, 4, 90, 12), mats.chrome, 0, 930, 0);
    G3.add(umb, new THREE.CylinderGeometry(0.8, 5, 26, 12), mats.chrome, 0, 988, 0);

    /* 開閉ボタン */
    const btn = G3.add(umb, new THREE.CylinderGeometry(5.5, 5.5, 10, 16), mats.darkPlastic, 0, 228, 12);
    btn.rotation.x = Math.PI / 2;
    btnHit = new THREE.Mesh(new THREE.SphereGeometry(30, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    btnHit.position.set(0, 228, 8);
    umb.add(btnHit);
    /* シャフトのあたり判定 (かたむけ用・太め) */
    shaftHit = new THREE.Mesh(
      new THREE.CylinderGeometry(45, 45, 700, 8, 1, true),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    shaftHit.position.y = 500;
    umb.add(shaftHit);

    /* ランナーとバネ */
    runner = G3.add(umb, new THREE.CylinderGeometry(10.5, 10.5, 24, 20), mats.pom, 0, 430, 0);
    G3.add(umb, new THREE.CylinderGeometry(10, 10, 8, 16), mats.chrome, 0, 296, 0); /* バネ受け */
    springCtl = G3.springMesh(umb, mats.steel, 12, 11, 1.1);

    /* かさ生地 */
    canopyGeo = buildCanopyGeo();
    canopyMesh = new THREE.Mesh(canopyGeo, new THREE.MeshPhysicalMaterial({
      color: 0x8c1420, metalness: 0, roughness: 0.55,
      clearcoat: 0.12, clearcoatRoughness: 0.5,
      side: THREE.DoubleSide, envMapIntensity: 0.5,
    }));
    canopyMesh.castShadow = true;
    umb.add(canopyMesh);

    /* 骨と受け骨 */
    ribs = [];
    stretchers = [];
    for (let i = 0; i < SECTORS; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1, 8), mats.steel);
      r.castShadow = true;
      umb.add(r);
      ribs.push(r);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1, 8), mats.steel);
      st.castShadow = true;
      umb.add(st);
      stretchers.push(st);
    }

    /* --- 雨 --- */
    const spr = document.createElement('canvas');
    spr.width = 10;
    spr.height = 30;
    const sctx = spr.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 30);
    grad.addColorStop(0, 'rgba(190,210,228,0)');
    grad.addColorStop(0.5, 'rgba(190,210,228,0.85)');
    grad.addColorStop(1, 'rgba(190,210,228,0.1)');
    sctx.fillStyle = grad;
    sctx.fillRect(3, 0, 4, 30);
    const rainTex = new THREE.CanvasTexture(spr);
    rainPos = new Float32Array(DROPS * 3);
    rainVel = new Float32Array(DROPS * 2); /* vy, vx */
    for (let i = 0; i < DROPS; i++) resetDrop(i, true);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainPts = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      size: 26, map: rainTex, transparent: true, opacity: 0.5,
      color: 0xcfe0ee, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(rainPts);

    /* 3D水滴の共通マテリアル */
    dropMat = new THREE.MeshStandardMaterial({ color: 0x7fb2dd, roughness: 0.25, envMapIntensity: 0.6 });
  }

  function resetDrop(i, randomY) {
    rainPos[i * 3] = U.rand(-1100, 1100);
    rainPos[i * 3 + 1] = randomY ? U.rand(0, 1500) : U.rand(1350, 1550);
    rainPos[i * 3 + 2] = U.rand(-1100, 1100);
    rainVel[i * 2] = -U.rand(1150, 1500);
    rainVel[i * 2 + 1] = 0;
  }

  /* 地面をぬらす。濡れが蓄積した場所は水たまりになり、着水で波紋が立つ */
  function wetGround(x, z, big) {
    const u = ((x + 1200) / 2400) * 512;
    const v = ((z + 1200) / 2400) * 512;
    groundCtx.fillStyle = 'rgba(38,42,48,0.18)';
    groundCtx.beginPath();
    groundCtx.arc(u, v, big ? 6 : 3.5, 0, Math.PI * 2);
    groundCtx.fill();

    const gx = U.clamp(Math.floor((x + 1200) / 2400 * 32), 0, 31);
    const gz = U.clamp(Math.floor((z + 1200) / 2400 * 32), 0, 31);
    const gi = gz * 32 + gx;
    const was = wetGrid[gi];
    wetGrid[gi] = Math.min(30, was + (big ? 2 : 1));
    if (was < 12 && wetGrid[gi] >= 12) {
      /* 水たまりが生まれる */
      groundCtx.fillStyle = 'rgba(66,84,108,0.24)';
      groundCtx.beginPath();
      groundCtx.arc(u, v, 15, 0, Math.PI * 2);
      groundCtx.fill();
    } else if (was >= 12) {
      /* 水たまりへの着水: 波紋 */
      groundCtx.strokeStyle = 'rgba(150,175,200,0.3)';
      groundCtx.lineWidth = 1.4;
      groundCtx.beginPath();
      groundCtx.arc(u, v, 6, 0, Math.PI * 2);
      groundCtx.stroke();
      groundCtx.beginPath();
      groundCtx.arc(u, v, 11, 0, Math.PI * 2);
      groundCtx.stroke();
      if (puddleSndT <= 0) { puddleSndT = 0.3; S.plip(0.5); }
    }
    groundTex.needsUpdate = true;
  }

  /* 3Dの水滴 (骨先の滴り・遠心力のしぶき) */
  function spawnDrop3d(x, y, z, vx, vy, vz) {
    if (drops3d.length >= 30) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), dropMat);
    m.position.set(x, y, z);
    scene.add(m);
    drops3d.push({ m, vx, vy, vz });
  }

  /* いまの開き角での骨先ワールド位置 (かたむき・回転こみ) */
  function ribTipWorld(alpha, i) {
    const phi = (i / SECTORS) * Math.PI * 2 + spinAngle;
    const p = ribTip(alpha, phi);
    p.applyAxisAngle(new THREE.Vector3(0, 0, 1), umb.rotation.z);
    return p;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);

    /* ボタン: 短いタップ=バネで一気に / 長押し=押している時間ぶんだけゆっくり動く */
    if (btnId === null && ray.intersectObject(btnHit, false).length) {
      btnId = e.pointerId;
      btnT0 = performance.now();
      holdDir = open.t < 0.5 ? 1 : -1;
      S.clickReal(0.5);
      return;
    }
    /* うらがえった生地をタップしてなおす */
    if (flip.t > 0.5 && ray.intersectObject(canopyMesh, false).length) {
      flip.t = 0;
      S.thunk();
      S.flap();
      return;
    }
    /* 傘(生地かシャフト)からのドラッグ → かたむけ。フリックで回転 */
    if (tiltId === null &&
        (ray.intersectObject(canopyMesh, false).length || ray.intersectObject(shaftHit, false).length)) {
      tiltId = e.pointerId;
      tiltFrom = { x: e.clientX, rz: tilt.t };
      tiltTrack.reset();
      tiltTrack.push(e.clientX, e.clientY, performance.now());
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === tiltId) {
      tilt.t = U.clamp(tiltFrom.rz - (e.clientX - tiltFrom.x) * 0.0022, -0.42, 0.42);
      tiltTrack.push(e.clientX, e.clientY, performance.now());
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.6, 1.3);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === btnId) {
      btnId = null;
      if (performance.now() - btnT0 < 220) toggleOpen();
    } else if (e.pointerId === tiltId) {
      tiltId = null;
      /* 速い横フリックで傘がくるくる回る */
      const v = tiltTrack.vel();
      if (Math.abs(v.x) > 500) spinVel = U.clamp(spinVel + v.x * 0.006, -14, 14);
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  function toggleOpen() {
    if (open.t < 0.5) {
      open.t = 1;
      thunked = false;
      S.clickReal(0.8);
      S.whoosh(0.9);
    } else {
      closeUmbrella();
    }
  }

  function closeUmbrella() {
    open.t = 0;
    flip.t = 0;
    S.clickReal(0.7);
    S.flap();
    /* 濡れた傘を閉じると溜まった水がバサッとこぼれる */
    if (canopyWet > 0.1) {
      const alpha = U.lerp(0.1, 1.35, U.clamp(open.p, 0, 1.1));
      for (let i = 0; i < SECTORS; i++) {
        const p = ribTipWorld(alpha, i);
        spawnDrop3d(p.x, p.y, p.z, p.x * 0.4, -80, p.z * 0.4);
      }
      canopyWet = 0;
    }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(open, dt, 70, 5.5);
    U.stepSpring(flip, dt, 150, 8);
    U.stepSpring(tilt, dt, 160, 11);

    /* 開ききった瞬間の音 */
    if (!thunked && open.t === 1 && open.p > 0.97) {
      thunked = true;
      S.thunk();
      S.flap();
    }

    /* ボタン長押し: 押している時間ぶんだけゆっくり開閉 (途中で止められる) */
    if (btnId !== null && performance.now() - btnT0 >= 220) {
      open.t = U.clamp(open.t + holdDir * dt * 0.5, 0, 1);
      if (open.t > 0.3) thunked = true;   /* 手動のときは開き切り音を出さない */
    }

    /* 突風: 強さは時刻の連続量。傾けて構えていれば裏返らない */
    nextGust -= dt;
    if (nextGust <= 0) {
      nextGust = U.rand(7, 13);
      gustPower = 480 + 340 * Math.abs(Math.sin(time * 0.73));
      gustT = 1.6;
      S.whoosh(U.clamp(gustPower / 800, 0.4, 1));
      if (open.p > 0.7 && flip.t < 0.5 && gustPower > 560) flipDelay = 0.4;
    }
    if (gustT > 0) {
      gustT -= dt;
      wind += (gustPower * 1.25 - wind) * Math.min(1, dt * 2.5);
    } else {
      wind *= Math.exp(-dt * 1.4);
    }
    if (flipDelay >= 0) {
      flipDelay -= dt;
      if (flipDelay < 0 && open.p > 0.7) {
        if (umb.rotation.z > 0.12) {
          /* 風上へ傾けて構えていた → 耐えた! 雨と風だけが流れる */
          S.flap();
        } else {
          flip.t = 1;
          S.flap();
        }
      }
    }

    /* かたむき + フリックの回転 (慣性つき) */
    spinAngle += spinVel * dt;
    spinVel *= Math.exp(-dt * 0.9);
    umb.rotation.y = spinAngle;
    umb.rotation.z = tilt.p + Math.sin(time * 0.7) * 0.012 + wind * 0.00006;

    /* 骨の角度と各部品 */
    const o = U.clamp(open.p, -0.05, 1.12);
    const alpha = U.lerp(0.1, 1.35, o) + flip.p * 0.55;
    if (Math.abs(o - openShown) > 0.0025 || flip.v !== 0 || flip.p > 0.001) {
      openShown = o;
      updateCanopy(alpha);
    }
    const runnerY = U.lerp(420, 690, U.clamp(o, 0, 1.05));
    runner.position.y = runnerY;
    springCtl.update(302, runnerY - 314);
    const hub = new THREE.Vector3(0, HUB_Y, 0);
    for (let i = 0; i < SECTORS; i++) {
      const phi = (i / SECTORS) * Math.PI * 2;
      const tip = ribTip(alpha, phi);
      orientRod(ribs[i], hub, tip);
      const mid = hub.clone().lerp(tip, 0.45);
      orientRod(stretchers[i], new THREE.Vector3(0, runnerY, 0), mid);
    }

    /* --- 雨 --- */
    const canOpen = open.p > 0.3 && flip.p < 0.35;   /* 半開きでも半径ぶんだけ守れる */
    const spanR = Math.sin(alpha) * RIB_LEN;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -umb.rotation.z);
    const tmp = new THREE.Vector3();
    let landedWet = false;
    for (let i = 0; i < DROPS; i++) {
      rainVel[i * 2 + 1] += (wind * 0.9 - rainVel[i * 2 + 1]) * Math.min(1, dt * 2);
      rainPos[i * 3] += rainVel[i * 2 + 1] * dt;
      rainPos[i * 3 + 1] += rainVel[i * 2] * dt;
      const x = rainPos[i * 3], y = rainPos[i * 3 + 1], z = rainPos[i * 3 + 2];

      if (canOpen && y < HUB_Y + 60 && y > HUB_Y - RIB_LEN) {
        /* 傘ローカル系に直して生地との当たりをみる */
        tmp.set(x, y, z).applyQuaternion(q);
        const rd = Math.hypot(tmp.x, tmp.z);
        if (rd < spanR * 0.97) {
          const t = rd / spanR;
          const th = alpha * (0.78 + 0.22 * t);
          const surfY = HUB_Y - Math.cos(th) * RIB_LEN * t;
          if (tmp.y < surfY + 30 && tmp.y > surfY - 45) {
            resetDrop(i);
            canopyWet = Math.min(1, canopyWet + 0.015);   /* 生地が濡れていく */
            if (patterT <= 0) { S.tick(); patterT = 0.09; }
            continue;
          }
        }
      }
      if (y < 2) {
        if (Math.abs(x) < 1150 && Math.abs(z) < 1150) {
          wetGround(x, z);
          landedWet = true;
        }
        resetDrop(i);
      }
    }
    rainPts.geometry.attributes.position.needsUpdate = true;
    if (patterT > 0) patterT -= dt;
    if (puddleSndT > 0) puddleSndT -= dt;

    /* 濡れた生地: 骨先から滴りが垂れる。回すと遠心力でしぶきが飛ぶ */
    if (canopyWet > 0.08 && open.p > 0.5 && flip.p < 0.35) {
      dripT -= dt * (0.4 + canopyWet * 2.2);
      if (dripT <= 0) {
        dripT = 1;
        dripIdx = (dripIdx + 1) % SECTORS;
        const p = ribTipWorld(alpha, dripIdx);
        spawnDrop3d(p.x, p.y - 6, p.z, 0, -40, 0);
        canopyWet = Math.max(0, canopyWet - 0.012);
        S.drip();
      }
    }
    if (canopyWet > 0.05 && Math.abs(spinVel) > 2.5) {
      flingT -= dt;
      if (flingT <= 0) {
        flingT = 0.06;
        const i = Math.floor(((spinAngle * 3) % SECTORS + SECTORS)) % SECTORS;
        const p = ribTipWorld(alpha, i);
        const r = Math.hypot(p.x, p.z) || 1;
        /* 接線方向 + すこし外向きに飛ぶ */
        const tx = -p.z / r, tz = p.x / r;
        const sp = spinVel * r * 0.35;
        spawnDrop3d(p.x, p.y, p.z, tx * sp + p.x * 0.5, 20, tz * sp + p.z * 0.5);
        canopyWet = Math.max(0, canopyWet - 0.02);
      }
    }

    /* 3D水滴の落下 */
    for (let i = drops3d.length - 1; i >= 0; i--) {
      const d = drops3d[i];
      d.vy -= 2600 * dt;
      d.m.position.x += d.vx * dt;
      d.m.position.y += d.vy * dt;
      d.m.position.z += d.vz * dt;
      if (d.m.position.y < 2) {
        wetGround(d.m.position.x, d.m.position.z, true);
        landedWet = true;
        scene.remove(d.m);
        d.m.geometry.dispose();
        drops3d.splice(i, 1);
      }
    }

    /* 地面と水たまりはゆっくり乾く */
    dryFadeT -= dt;
    if (dryFadeT <= 0) {
      dryFadeT = 0.3;
      groundCtx.fillStyle = 'rgba(141,141,138,0.02)';
      groundCtx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1024; i++) wetGrid[i] = Math.max(0, wetGrid[i] - 0.12);
      if (!landedWet) groundTex.needsUpdate = true;
    }

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      open = U.spring(0);
      flip = U.spring(0);
      tilt = U.spring(0);
      openShown = -1;
      thunked = true;
      wind = 0; gustT = 0; gustPower = 600; nextGust = 6; flipDelay = -1;
      btnId = null; tiltId = null; orbitId = null;
      tiltTrack = U.velTracker();
      spinVel = 0; spinAngle = 0; flingT = 0;
      canopyWet = 0; dripT = 1; dripIdx = 0; drops3d = [];
      wetGrid = new Float32Array(1024); puddleSndT = 0;
      patterT = 0; dryFadeT = 0.3;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 470, 0),
        radius: 1500, radiusPortraitBase: 1200, radiusMaxPortrait: 2100,
        az: 0.3, po: 1.25, exposure: 1.0,
      });
      build();
      updateCanopy(0.1);
      rainSnd = S.rainLoop();
      rainSnd.set(0.8);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ボタンで開く → かたむける */
      GUIDE.start(stage3, [
        { kind: 'tap', at: () => btnHit, done: () => open.p > 0.5 },
        { kind: 'drag', at: () => shaftHit, to: () => {
          const v = new THREE.Vector3();
          shaftHit.getWorldPosition(v);
          v.x -= 90;
          return v;
        }, done: () => Math.abs(tilt.t) > 0.12 },
        {
          kind: 'tap', at: () => btnHit,
          when: () => Math.abs(tilt.t) > 0.12,
          done: () => open.p < 0.15,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (rainSnd) rainSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
