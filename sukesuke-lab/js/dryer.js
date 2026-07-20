/* ドライヤーの中身 — 写実3D版 (Three.js)
 *
 * 半透明ハウジングの中に軸流ファン・モーター・ニクロムヒーターが見える。
 * 空気の流れは小さな流線パーティクルで可視化 (冷風=青 / 温風=オレンジ)。
 * 外の結果: スタンドに掛かったリボンが風でなびき、軽い発泡スチロール球が
 * 吹き飛ばされて転がる。
 * 単位は mm。ドライヤーの回転中心 (持ち手上端) がピボット。
 */
window.GAMES.dryer = (() => {
  const PIVOT = new THREE.Vector3(0, 170, 0);
  const NOZZLE_X = 135;      // ふきだし口 (ローカルX)
  const AIR_N = 110;
  const RIB_SEGS = 9;        // リボンの節数
  const SEG_LEN = 24;

  let stage3, scene, raf, prev, time;
  let dryerG, fanG, heaterMats, heatLight, powerKnob, heatKnob, heatDotR, heatDotB;
  let aimHit, powerHit, heatHit;
  let aim, level, hot, windEff, sndLevel;
  let dryerX, dryerXT;
  let airMesh, airState, dummy;
  let ribbons, ribbonMeshes, balls, confetti, pinwheel, feather;
  let aimId, aimFrom, orbitId, orbitFrom;
  let windSnd, humSnd, whirrSnd, thudT;
  let mats;

  /* ---------------- 組み立て ---------------- */

  function counterTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#d8d4ca';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const v = (172 + Math.random() * 48) | 0;
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 8},0.5)`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.7, 1.7);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();

    const counter = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshStandardMaterial({ map: counterTexture(), roughness: 0.5 })
    );
    counter.rotation.x = -Math.PI / 2;
    counter.receiveShadow = true;
    scene.add(counter);

    scene.background = G3.bgGradient('#f0ede7', '#e2ddd4', '#bdb6a9');
    G3.addLights(scene, { pos: new THREE.Vector3(400, 800, 500), shadowSpan: 520 });

    /* --- ドライヤー本体 (ねらい用グループ) --- */
    dryerG = new THREE.Group();
    dryerG.position.copy(PIVOT);
    scene.add(dryerG);

    const addX = (parent, geo, mat, x, y, z) => {
      const m = G3.add(parent, geo, mat, x, y, z);
      m.rotation.z = Math.PI / 2;   /* シリンダーをX軸向きに */
      return m;
    };

    /* ファン (7枚羽の軸流インペラ) */
    fanG = new THREE.Group();
    fanG.position.x = -55;
    dryerG.add(fanG);
    addX(fanG, new THREE.CylinderGeometry(9, 9, 12, 20), mats.darkPlastic, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const bg = new THREE.Group();
      bg.rotation.x = (i / 7) * Math.PI * 2;
      fanG.add(bg);
      const blade = G3.add(bg, new THREE.BoxGeometry(2.2, 24, 13), mats.darkPlastic, 0, 21, 0);
      blade.rotation.y = 0.55;   /* 羽根のピッチ角 */
    }

    /* モーター */
    addX(dryerG, new THREE.CylinderGeometry(15, 15, 28, 24), mats.brass, -24, 0, 0);
    addX(dryerG, new THREE.CylinderGeometry(6, 6, 10, 12), mats.steel, -6, 0, 0);

    /* ヒーター (マイカ枠 + ニクロム線コイル) */
    const mica = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.8 });
    G3.add(dryerG, new THREE.BoxGeometry(48, 56, 1.6), mica, 46, 0, 0);
    G3.add(dryerG, new THREE.BoxGeometry(48, 1.6, 56), mica, 46, 0, 0);
    heaterMats = [];
    [[26, 10], [17, 8]].forEach(([cr, coils]) => {
      const hm = new THREE.MeshStandardMaterial({
        color: 0x6b4438, emissive: 0xff3a00, emissiveIntensity: 0, roughness: 0.5,
      });
      heaterMats.push(hm);
      const coil = new THREE.Mesh(
        new THREE.TubeGeometry(new G3.Helix(0, 46, coils, cr), coils * 22, 0.9, 6, false), hm);
      const cg = new THREE.Group();
      cg.position.x = 23;
      cg.rotation.z = -Math.PI / 2;   /* ローカルY→ワールドX */
      cg.add(coil);
      dryerG.add(cg);
    });
    heatLight = new THREE.PointLight(0xff5a20, 0, 260);
    heatLight.position.set(46, 0, 0);
    dryerG.add(heatLight);

    /* 半透明ハウジング (中が見える) */
    addX(dryerG, new THREE.CylinderGeometry(38, 38, 160, 40, 1, true), mats.glass, 0, 0, 0);
    addX(dryerG, new THREE.CylinderGeometry(20, 38, 55, 40, 1, true), mats.glass, 107, 0, 0);
    addX(dryerG, new THREE.CylinderGeometry(38, 27, 26, 40, 1, true), mats.glass, -93, 0, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(20, 2.2, 10, 28), mats.chrome);
    ring.position.x = NOZZLE_X;
    ring.rotation.y = Math.PI / 2;
    dryerG.add(ring);
    /* 吸気グリル */
    const grill = new THREE.Mesh(new THREE.CircleGeometry(26, 24),
      new THREE.MeshStandardMaterial({ color: 0x30333a, roughness: 0.7 }));
    grill.position.x = -106;
    grill.rotation.y = -Math.PI / 2;
    dryerG.add(grill);
    for (let i = -2; i <= 2; i++) {
      G3.add(dryerG, new THREE.BoxGeometry(1.6, 3, 50), mats.darkPlastic, -106, i * 10, 0);
    }

    /* 持ち手とスイッチ */
    const handle = G3.add(dryerG, new THREE.CylinderGeometry(13, 12, 115, 20), mats.navy, -22, -88, 0);
    handle.rotation.z = 0.12;
    G3.add(dryerG, new THREE.BoxGeometry(4, 46, 11), mats.darkPlastic, -9, -70, 0);
    powerKnob = G3.add(dryerG, new THREE.BoxGeometry(6, 10, 9), mats.whitePlastic, -7, -84, 0);
    G3.add(dryerG, new THREE.BoxGeometry(4, 24, 11), mats.darkPlastic, -13.5, -122, 0);
    heatKnob = G3.add(dryerG, new THREE.BoxGeometry(6, 8, 9), mats.whitePlastic.clone(), -11.5, -127, 0);
    heatDotB = G3.add(dryerG, new THREE.CylinderGeometry(1.8, 1.8, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0x2277ff }), -12.5, -112, 7);
    heatDotB.rotation.x = Math.PI / 2;
    heatDotR = G3.add(dryerG, new THREE.CylinderGeometry(1.8, 1.8, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3322 }), -13.8, -132, 7);
    heatDotR.rotation.x = Math.PI / 2;

    /* あたり判定 (不可視・大きめ) */
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    aimHit = addX(dryerG, new THREE.CylinderGeometry(62, 62, 280, 10, 1, true), hitMat, 10, 0, 0);
    /* 持ち手の上半分=風量 / 下半分=温度 (子どもの指でも押しやすい) */
    powerHit = G3.add(dryerG, new THREE.BoxGeometry(64, 64, 58), hitMat, -12, -72, 0);
    heatHit = G3.add(dryerG, new THREE.BoxGeometry(68, 66, 58), hitMat, -20, -134, 0);

    /* --- 空気の流線 (インスタンス描画) --- */
    const airGeo = new THREE.SphereGeometry(3.1, 6, 5);
    airGeo.scale(4.2, 1, 1);
    airMesh = new THREE.InstancedMesh(airGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), AIR_N);
    airMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    airMesh.frustumCulled = false;   /* インスタンスは原点から遠くへ飛ぶため */
    scene.add(airMesh);
    dummy = new THREE.Object3D();
    airState = [];
    for (let i = 0; i < AIR_N; i++) airState.push({ on: false, world: false, x: 0, y: 0, z: 0, v: 0, vx: 0, vy: 0, vz: 0, age: 0 });

    /* --- リボンスタンド --- */
    const rodY = 300, rodX = 360;
    addRod(rodX, rodY);
    ribbons = [];
    ribbonMeshes = [];
    [-60, 0, 60].forEach(z0 => {
      const pts = [];
      for (let i = 0; i <= RIB_SEGS; i++) {
        pts.push({ x: rodX, y: rodY - 8 - i * SEG_LEN, px: rodX, py: rodY - 8 - i * SEG_LEN });
      }
      ribbons.push({ pts, z: z0 });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RIB_SEGS + 1) * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < RIB_SEGS; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0xc22548, roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.4,
      }));
      m.castShadow = true;
      scene.add(m);
      ribbonMeshes.push(m);
    });

    /* --- 発泡スチロール球 --- */
    const foam = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.9 });
    balls = [];
    [[180, -70], [240, 10], [200, 85]].forEach(([x, z]) => {
      const m = G3.add(scene, new THREE.SphereGeometry(16, 24, 18), foam, x, 16, z);
      balls.push({ m, x, y: 16, z, vx: 0, vy: 0, vz: 0 });
    });

    /* --- 紙吹雪 (軽い紙片。温風なら舞い上がり、冷風なら押し流される) --- */
    const confCols = [0xd94b57, 0xe8a33b, 0x4d9e6a, 0x4a7fc9, 0xb56bb0];
    confetti = [];
    for (let i = 0; i < 14; i++) {
      const cm = new THREE.MeshStandardMaterial({
        color: confCols[i % confCols.length], roughness: 0.75,
        side: THREE.DoubleSide, envMapIntensity: 0.3,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), cm);
      const x = 220 + (i % 5) * 26, z = -110 + Math.floor(i / 5) * 74 + (i % 3) * 12;
      m.position.set(x, 0.8, z);
      m.rotation.x = -Math.PI / 2;
      m.castShadow = true;
      scene.add(m);
      confetti.push({ m, x, y: 0.8, z, vx: 0, vy: 0, vz: 0, wx: 0, wz: 0, ph: i * 1.7 });
    }

    /* --- 風車 (風を受けた回転が蓄積し、慣性でゆっくり減速) --- */
    pinwheel = { spinVel: 0 };
    const pwX = 390, pwZ = 120;
    G3.add(scene, new THREE.CylinderGeometry(3.5, 3.5, 250, 12), mats.chrome, pwX, 125, pwZ);
    G3.add(scene, new THREE.BoxGeometry(56, 6, 30), mats.darkPlastic, pwX, 3, pwZ);
    const pwG = new THREE.Group();
    pwG.position.set(pwX, 255, pwZ);
    pwG.rotation.y = 0.5;   /* すこしカメラへ向ける (風も受かる角度) */
    scene.add(pwG);
    G3.add(pwG, new THREE.SphereGeometry(5, 12, 10), mats.chrome, 0, 0, 0);
    pinwheel.wheel = new THREE.Group();
    pwG.add(pinwheel.wheel);
    for (let i = 0; i < 6; i++) {
      const bm = new THREE.MeshStandardMaterial({
        color: confCols[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 3],
        roughness: 0.6, side: THREE.DoubleSide, envMapIntensity: 0.35,
      });
      const bg = new THREE.Group();
      bg.rotation.x = (i / 6) * Math.PI * 2;
      pinwheel.wheel.add(bg);
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(30, 44), bm);
      blade.position.set(0, 36, 0);
      blade.rotation.y = 0.6;   /* 羽根のひねり */
      blade.castShadow = true;
      bg.add(blade);
    }
    pinwheel.pos = new THREE.Vector3(pwX, 255, pwZ);

    /* --- 羽根 (超軽量: 風でどこまでも飛ぶ) --- */
    const fGeo = new THREE.SphereGeometry(9, 10, 8);
    fGeo.scale(2.6, 0.22, 1);
    feather = {
      m: new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.85, side: THREE.DoubleSide })),
      x: 320, y: 30, z: 110, vx: 0, vy: 0, vz: 0,
    };
    feather.m.castShadow = true;
    scene.add(feather.m);
  }

  function addRod(rodX, rodY) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 210, 14), mats.chrome);
    rod.position.set(rodX, rodY, 0);
    rod.rotation.x = Math.PI / 2;
    rod.castShadow = true;
    scene.add(rod);
    [-90, 90].forEach(z => {
      G3.add(scene, new THREE.CylinderGeometry(4, 4, rodY, 14), mats.chrome, rodX, rodY / 2, z);
      G3.add(scene, new THREE.BoxGeometry(50, 6, 24), mats.darkPlastic, rodX, 3, z);
    });
  }

  /* ---------------- 風 ---------------- */

  function nozzleWorld() {
    const a = aim.p;
    return {
      ox: dryerG.position.x + Math.cos(a) * NOZZLE_X,
      oy: dryerG.position.y + Math.sin(a) * NOZZLE_X,
      dx: Math.cos(a),
      dy: Math.sin(a),
    };
  }

  function windForceAt(px, py, pz) {
    if (windEff < 0.03) return 0;
    const n = nozzleWorld();
    const rx = px - n.ox, ry = py - n.oy;
    const t = rx * n.dx + ry * n.dy;
    if (t < 0) return 0;
    const perp = Math.hypot(rx * -n.dy + ry * n.dx, pz);
    const width = 58 + t * 0.5;
    return (windEff / 2) * Math.max(0, 1 - perp / width) * Math.max(0, 1 - t / 950);
  }

  /* ---------------- 入力 ---------------- */

  function setPower(n) {
    level = n;
    S.clickReal(0.8);
    if (level > 0) S.whoosh(level / 2);
    /* 風量そのものはファンのスプール (windEff) がゆっくり追従する */
  }

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (ray.intersectObject(powerHit, false).length) { setPower((level + 1) % 3); return; }
    if (ray.intersectObject(heatHit, false).length) { hot = !hot; S.clickReal(0.7); return; }
    if (aimId === null && ray.intersectObject(aimHit, false).length) {
      aimId = e.pointerId;
      aimFrom = { y: e.clientY, a: aim.t, x: e.clientX, px: dryerXT };
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === aimId) {
      const r = stage3.renderer.domElement.getBoundingClientRect();
      /* 上下=ねらいの角度、左右=前後の距離 */
      aim.t = U.clamp(aimFrom.a - ((e.clientY - aimFrom.y) / r.height) * 1.6, -0.3, 0.55);
      dryerXT = U.clamp(aimFrom.px + ((e.clientX - aimFrom.x) / r.width) * 520, -140, 190);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.55, 1.25);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.8, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === aimId) aimId = null;
    else if (e.pointerId === orbitId) orbitId = null;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;
    if (thudT > 0) thudT -= dt;

    U.stepSpring(aim, dt, 170, 13);
    dryerG.rotation.z = aim.p;
    /* 左右ドラッグでドライヤーが前後する */
    dryerX += (dryerXT - dryerX) * Math.min(1, dt * 8);
    dryerG.position.x = dryerX;

    /* ファンのスプール: スイッチを入れても風はゆっくり立ち上がる。
       スイッチを刻むと風のパルスが作れる */
    windEff += (level - windEff) * Math.min(1, dt * 1.6);
    if (Math.abs(windEff / 2 - sndLevel) > 0.02) {
      sndLevel = windEff / 2;
      windSnd.set(sndLevel);
      humSnd.set(sndLevel);
    }

    /* ファンとヒーター */
    fanG.rotation.x -= (windEff * 14 + (windEff > 0.05 ? 4 : 0)) * dt;
    const glow = hot && level > 0 ? 1 : 0;
    heaterMats.forEach(hm => {
      hm.emissiveIntensity += (glow * (1.1 + 0.15 * Math.sin(time * 7)) - hm.emissiveIntensity) * Math.min(1, dt * 5);
    });
    heatLight.intensity += (glow * 0.55 - heatLight.intensity) * Math.min(1, dt * 5);
    /* スイッチのノブ位置 */
    powerKnob.position.y += ((-84 + level * 13) - powerKnob.position.y) * Math.min(1, dt * 16);
    heatKnob.position.y += ((hot ? -132 : -122) - heatKnob.position.y) * Math.min(1, dt * 16);
    heatKnob.material.color.lerp(new THREE.Color(hot ? 0xe05540 : 0xeceae2), Math.min(1, dt * 8));

    /* --- 空気の流線 --- */
    const a = aim.p, ca = Math.cos(a), sa = Math.sin(a);
    const spawnN = windEff > 0.05 ? Math.floor(windEff * 40 * dt + Math.random()) : 0;
    let spawned = 0;
    const cold = new THREE.Color(0x2f8fe8), warm = new THREE.Color(0xf06a10), gray = new THREE.Color(0x8a9daa);
    for (let i = 0; i < AIR_N; i++) {
      const p = airState[i];
      if (!p.on) {
        if (spawned < spawnN) {
          spawned++;
          p.on = true; p.world = false;
          p.x = -102; p.y = U.rand(-24, 24); p.z = U.rand(-24, 24);
          p.v = 260 + windEff * 190;
          p.age = 0;
          airMesh.setColorAt(i, gray);
        } else {
          dummy.position.set(0, -4000, 0);
          dummy.updateMatrix();
          airMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
      }
      if (!p.world) {
        p.v = Math.min(p.v + 1300 * dt, 380 + windEff * 320);
        p.x += p.v * dt;
        p.y *= 1 - dt * 2.2;
        p.z *= 1 - dt * 2.2;
        if (p.x > 30) airMesh.setColorAt(i, hot ? warm : cold);
        if (p.x > NOZZLE_X) {
          p.world = true;
          airMesh.setColorAt(i, hot ? warm : cold);
          const wx = dryerG.position.x + p.x * ca - p.y * sa;
          const wy = dryerG.position.y + p.x * sa + p.y * ca;
          const sp = p.v * U.rand(1, 1.25);
          const wob = U.rand(-40, 40);
          p.x = wx; p.y = wy;
          p.vx = sp * ca - wob * sa;
          p.vy = sp * sa + wob * ca;
          p.vz = U.rand(-30, 30);
        }
        const wx = dryerG.position.x + p.x * ca - p.y * sa;
        const wy = dryerG.position.y + p.x * sa + p.y * ca;
        dummy.position.set(wx, wy, p.z);
        dummy.rotation.set(0, 0, a);
      } else {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.age > 1.3 || p.x > 900 || p.y < 4) p.on = false;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, Math.atan2(p.vy, p.vx));
      }
      dummy.updateMatrix();
      airMesh.setMatrixAt(i, dummy.matrix);
    }
    airMesh.instanceMatrix.needsUpdate = true;
    if (airMesh.instanceColor) airMesh.instanceColor.needsUpdate = true;

    /* --- リボン (バーレット物理) --- */
    const n = nozzleWorld();
    ribbons.forEach((rb, ri) => {
      const pts = rb.pts;
      for (let i = 1; i <= RIB_SEGS; i++) {
        const p = pts[i];
        const f = windForceAt(p.x, p.y, rb.z);
        const turb = Math.sin(time * 11 + i * 1.7 + ri * 2.3) * f * 600;
        const ax = f * 2600 * n.dx;
        const ay = -1100 + f * 2600 * n.dy + turb;
        const nx = p.x + (p.x - p.px) * 0.94 + ax * dt * dt;
        const ny = p.y + (p.y - p.py) * 0.94 + ay * dt * dt;
        p.px = p.x; p.py = p.y;
        p.x = nx; p.y = Math.max(6, ny);
      }
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < RIB_SEGS; i++) {
          const p0 = pts[i], p1 = pts[i + 1];
          const dx = p1.x - p0.x, dy = p1.y - p0.y;
          const d = Math.hypot(dx, dy) || 1;
          const diff = (d - SEG_LEN) / d;
          if (i === 0) {
            p1.x -= dx * diff;
            p1.y -= dy * diff;
          } else {
            p0.x += dx * diff * 0.5;
            p0.y += dy * diff * 0.5;
            p1.x -= dx * diff * 0.5;
            p1.y -= dy * diff * 0.5;
          }
        }
      }
      /* 帯として描く */
      const arr = ribbonMeshes[ri].geometry.attributes.position.array;
      let k = 0;
      for (let i = 0; i <= RIB_SEGS; i++) {
        const sway = Math.sin(time * 9 + i + ri) * windForceAt(pts[i].x, pts[i].y, rb.z) * 10;
        arr[k++] = pts[i].x; arr[k++] = pts[i].y; arr[k++] = rb.z - 9 + sway;
        arr[k++] = pts[i].x; arr[k++] = pts[i].y; arr[k++] = rb.z + 9 + sway;
      }
      ribbonMeshes[ri].geometry.attributes.position.needsUpdate = true;
      ribbonMeshes[ri].geometry.computeVertexNormals();
    });

    /* --- 発泡スチロール球 --- */
    balls.forEach(b => {
      const f = windForceAt(b.x, b.y, b.z);
      b.vx += f * 2800 * n.dx * dt;
      b.vy += (f * 2800 * n.dy - 3800) * dt;
      b.vz += f * 300 * Math.sin(time * 5 + b.z) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y < 16) {
        b.y = 16;
        if (b.vy < -140 && thudT <= 0) { thudT = 0.12; S.thunk(); }
        b.vy *= -0.35;
        b.vx *= 1 - Math.min(1, dt * 3);
        b.vz *= 1 - Math.min(1, dt * 3);
      }
      if (b.x < -140) { b.x = -140; b.vx *= -0.5; }
      if (b.x > 780) { b.x = 780; b.vx *= -0.5; }
      if (Math.abs(b.z) > 320) { b.z = Math.sign(b.z) * 320; b.vz *= -0.5; }
      b.m.position.set(b.x, b.y, b.z);
      b.m.rotation.z -= (b.vx / 16) * dt;
      b.m.rotation.x += (b.vz / 16) * dt;
    });

    /* 球どうしの衝突 (弾性反発) */
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const A = balls[i], B = balls[j];
        const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.01 && d < 32) {
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const push = (32 - d) / 2;
          A.x -= nx * push; A.y = Math.max(16, A.y - ny * push); A.z -= nz * push;
          B.x += nx * push; B.y = Math.max(16, B.y + ny * push); B.z += nz * push;
          const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny + (B.vz - A.vz) * nz;
          if (rel < 0) {
            const imp = -rel * 0.9;
            A.vx -= nx * imp; A.vy -= ny * imp; A.vz -= nz * imp;
            B.vx += nx * imp; B.vy += ny * imp; B.vz += nz * imp;
            if (imp > 90 && thudT <= 0) { thudT = 0.15; S.thunk(); }
          }
        }
      }
    }

    /* --- 紙吹雪: 温風で舞い上がり、冷風で押し流され、球にも弾かれる --- */
    confetti.forEach(c => {
      const f = windForceAt(c.x, c.y, c.z);
      const lift = hot ? f * 3000 : 0;
      c.vx += f * 4600 * n.dx * dt + Math.sin(time * 7 + c.ph) * f * 500 * dt;
      c.vy += (f * 4600 * n.dy + lift - 2600) * dt;
      c.vz += Math.cos(time * 5 + c.ph) * (f + 0.04) * 420 * dt;
      const drag = Math.exp(-dt * 2.4);
      c.vx *= drag; c.vy *= drag; c.vz *= drag;
      /* 球に弾かれる */
      for (const b of balls) {
        const d = Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z);
        const bs = Math.hypot(b.vx, b.vz);
        if (d < 28 && bs > 60) {
          c.vx += b.vx * 0.7;
          c.vz += b.vz * 0.7;
          c.vy += 90;
        }
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y < 0.8) {
        c.y = 0.8;
        c.vy = 0;
        if (f < 0.1) { c.vx *= Math.exp(-dt * 6); c.vz *= Math.exp(-dt * 6); }
      }
      if (c.x < -140) { c.x = -140; c.vx = Math.abs(c.vx) * 0.3; }
      if (c.x > 810) { c.x = 810; c.vx = -Math.abs(c.vx) * 0.3; }
      if (Math.abs(c.z) > 330) { c.z = Math.sign(c.z) * 330; c.vz *= -0.3; }
      c.m.position.set(c.x, c.y, c.z);
      if (c.y > 2) {
        /* 空中ではひらひら舞う */
        c.wx += (Math.hypot(c.vx, c.vy, c.vz) * 0.02 - c.wx) * dt * 3;
        c.m.rotation.x += c.wx * dt + Math.sin(time * 9 + c.ph) * 2.4 * dt;
        c.m.rotation.z += Math.cos(time * 8 + c.ph) * 2 * dt;
      } else {
        c.m.rotation.x += (-Math.PI / 2 - (c.m.rotation.x % (Math.PI * 2))) * Math.min(1, dt * 5);
      }
    });

    /* --- 風車: 風で回転が蓄積し、慣性でゆっくり減速 --- */
    const pf = windForceAt(pinwheel.pos.x, pinwheel.pos.y, pinwheel.pos.z);
    pinwheel.spinVel += pf * 17 * dt * Math.cos(0.5);
    pinwheel.spinVel *= Math.exp(-dt * 0.25);
    pinwheel.wheel.rotation.x -= pinwheel.spinVel * dt;
    whirrSnd.set(U.clamp(pinwheel.spinVel / 22, 0, 1));

    /* --- 羽根: 超軽量。ゆっくり落ち、風と熱でどこまでも --- */
    {
      const f = windForceAt(feather.x, feather.y, feather.z);
      const lift = hot ? f * 3400 : 0;
      feather.vx += f * 5200 * n.dx * dt;
      feather.vy += (f * 5200 * n.dy + lift - 1500) * dt;
      feather.vz += Math.sin(time * 3.2) * (f + 0.03) * 300 * dt;
      const drag = Math.exp(-dt * 3.2);
      feather.vx *= drag; feather.vy *= drag; feather.vz *= drag;
      feather.x += feather.vx * dt;
      feather.y += (feather.vy - 26) * dt;   /* ふわふわ沈む */
      feather.z += feather.vz * dt;
      if (feather.y < 2.2) { feather.y = 2.2; feather.vy = 0; }
      if (feather.x > 860 || Math.abs(feather.z) > 360) {
        feather.x = 250; feather.y = 230; feather.z = 100;
        feather.vx = feather.vy = feather.vz = 0;
      }
      feather.m.position.set(feather.x, feather.y, feather.z);
      feather.m.rotation.z = Math.sin(time * 2.6) * 0.5;
      feather.m.rotation.y = Math.sin(time * 1.7) * 0.6;
    }

    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      aim = U.spring(0);
      level = 0; hot = false; windEff = 0; sndLevel = 0;
      dryerX = PIVOT.x; dryerXT = PIVOT.x;
      aimId = null; orbitId = null; thudT = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(200, 150, 0),
        radius: 880, radiusPortraitBase: 720, radiusMaxPortrait: 1250,
        az: 0.35, po: 1.32,
      });
      build();
      windSnd = S.wind();
      humSnd = S.humLoop();
      whirrSnd = S.whirrLoop();

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
      if (windSnd) windSnd.stop();
      if (humSnd) humSnd.stop();
      if (whirrSnd) whirrSnd.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
