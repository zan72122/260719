/* 銀行の金庫 — 写実3D (断面ダイヤル錠)
 *
 * だれもが知っているのに、絶対にさわらせてもらえない機械。
 * 扉の前板を切り欠いて、ダイヤル錠のタンブラー円盤3枚と
 * ボルトのリンク機構をまるごと見せる。
 * 連鎖: ダイヤルを回す → ドライブピンが円盤を1枚ずつ拾って回す →
 *       切り欠きが上に揃うとフェンスが落ちる → ハンドルが回せる →
 *       クランクがキャリッジを引いてボルト4本が引っこむ → 重い扉が開く →
 *       金塊がきらり
 * 分岐: 回す向き・量・順序で3枚の円盤の位置が全て変わる (ピン拾いの実機構)。
 *       組合せはセッションごとに変わり、開けかたは毎回ちがう手順になる。
 */
window.GAMES.vault = (() => {
  const GATE = Math.PI / 2;          /* フェンスの位置 = 真上 */
  const TOL = 0.11;                  /* 切り欠きが揃ったとみなす角度 */
  const SLACK = Math.PI * 2 - 0.42;  /* ドライブピンの遊び (ほぼ1回転) */
  const HANDLE_MAX = Math.PI / 2;
  const DIAL = { x: -55, y: 70 };    /* 扉ローカルのダイヤル中心 */
  const HANDLE = { x: 168, y: -80 };

  let stage3, scene, raf, prev, time;
  let doorPivot, dialMesh, discMeshes, fenceG, fenceSpring, fenceSpringG, handleG, carriage, bolts, crankPin, crankRod;
  let doorA, fenceY, fenceDropped, boltT, glowLight, barsG;
  let dial, discs, notch, relLo, handleA, opened;
  let dragMode, dragId, dragA0, orbitId, orbitFrom, tickAcc, lastPass;
  let servo, rumble, mats;

  /* --- 角度ユーティリティ --- */
  const wrapPi = a => {
    a = a % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  /* 円盤の見た目の角度 (切り欠きの向き) */
  const discVis = i => discs[i] + notch[i];
  const alignedDisc = i => Math.abs(wrapPi(discVis(i) - GATE)) < TOL;
  const allAligned = () => alignedDisc(0) && alignedDisc(1) && alignedDisc(2);

  /* --- 切り欠き付き円盤ジオメトリ --- */
  function discGeo(R, depth) {
    const w = 0.15;                        /* 切り欠きの開き角 */
    const s = new THREE.Shape();
    s.absarc(0, 0, R, w / 2, Math.PI * 2 - w / 2, false);
    s.lineTo((R - 26) * Math.cos(0), (R - 26) * Math.sin(0));
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 20, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#c9cdd4', '#d8dade', '#a8acb4');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshStandardMaterial({ color: 0x8a8e96, roughness: 0.55, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1600, 1100), shadowSpan: 1100, intensity: 0.95 });

    /* --- 金庫室の壁 (扉の開口を囲う4枚) --- */
    const wallM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(2400, 900, 100), wallM, 0, 1130, -60);
    G3.add(scene, new THREE.BoxGeometry(940, 680, 100), wallM, -790, 340, -60);
    G3.add(scene, new THREE.BoxGeometry(940, 680, 100), wallM, 790, 340, -60);
    /* 開口のふち (ステンレス枠) */
    const rimM = mats.steel;
    G3.add(scene, new THREE.BoxGeometry(660, 26, 130), rimM, 0, 667, -55).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(26, 680, 130), rimM, -317, 340, -55).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(26, 680, 130), rimM, 317, 340, -55).castShadow = true;

    /* --- 金庫の中 (扉があくと見える) --- */
    const inner = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.8 });
    G3.add(scene, new THREE.BoxGeometry(600, 660, 12), inner, 0, 330, -430);
    G3.add(scene, new THREE.BoxGeometry(12, 660, 340), inner, -300, 330, -260);
    G3.add(scene, new THREE.BoxGeometry(12, 660, 340), inner, 300, 330, -260);
    G3.add(scene, new THREE.BoxGeometry(600, 12, 340), inner, 0, 660, -260);
    G3.add(scene, new THREE.BoxGeometry(600, 12, 340), inner, 0, 8, -260);
    /* 棚と金塊 */
    const shelfM = new THREE.MeshStandardMaterial({ color: 0x565c66, roughness: 0.5, metalness: 0.4 });
    G3.add(scene, new THREE.BoxGeometry(560, 14, 220), shelfM, 0, 250, -300);
    const goldM = new THREE.MeshStandardMaterial({ color: 0xe8b923, metalness: 1, roughness: 0.22 });
    barsG = new THREE.Group();
    scene.add(barsG);
    let bi = 0;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 5 - row; k++) {
        const bar = G3.add(barsG, new THREE.BoxGeometry(96, 34, 52), goldM,
          -190 + k * 95 + row * 47, 274 + row * 35, -300 + (row ? 8 : 0));
        bar.rotation.y = (k * 7 + row * 13) % 5 * 0.02 - 0.05;
        bar.castShadow = true;
        window.__pts['gold' + bi] = bar;
        bi++;
      }
    }
    G3.add(scene, new THREE.BoxGeometry(200, 90, 140),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.6 }), 180, 80, -300).castShadow = true;
    /* 中をてらす電球 (扉があくまで消えている) */
    glowLight = new THREE.PointLight(0xffd890, 0, 900, 2);
    glowLight.position.set(0, 520, -260);
    scene.add(glowLight);

    /* --- 扉 (左ヒンジで開く) --- */
    doorPivot = new THREE.Group();
    doorPivot.position.set(-300, 330, 10);
    scene.add(doorPivot);
    const doorG = new THREE.Group();
    doorG.position.set(300, 0, 0);       /* 扉中心 = ピボットから右へ */
    doorPivot.add(doorG);

    const doorM = new THREE.MeshPhysicalMaterial({ color: 0x7c828c, metalness: 0.85, roughness: 0.32, clearcoat: 0.5 });
    /* 背板 + まわりの厚み枠 (中央は機構がみえる空洞) */
    G3.add(doorG, new THREE.BoxGeometry(580, 640, 20), doorM, 0, 0, -34).castShadow = true;
    G3.add(doorG, new THREE.BoxGeometry(580, 70, 70), doorM, 0, 285, 11).castShadow = true;
    G3.add(doorG, new THREE.BoxGeometry(580, 70, 70), doorM, 0, -285, 11);
    G3.add(doorG, new THREE.BoxGeometry(60, 500, 70), doorM, -260, 0, 11);
    G3.add(doorG, new THREE.BoxGeometry(60, 500, 70), doorM, 260, 0, 11);

    /* 前板: 丸い窓 (円盤) と四角い窓 (ボルト機構) を切り抜いた1枚 */
    const fp = new THREE.Shape();
    fp.moveTo(-290, -320); fp.lineTo(290, -320); fp.lineTo(290, 320); fp.lineTo(-290, 320);
    fp.closePath();
    const winA = new THREE.Path();
    winA.absarc(DIAL.x, DIAL.y, 150, 0, Math.PI * 2, true);
    fp.holes.push(winA);
    const winB = new THREE.Path();
    winB.moveTo(120, -230); winB.lineTo(258, -230); winB.lineTo(258, 230); winB.lineTo(120, 230);
    winB.closePath();
    fp.holes.push(winB);
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(fp, { depth: 14, bevelEnabled: false }), doorM);
    plate.position.z = 40;
    plate.castShadow = true;
    doorG.add(plate);

    /* --- タンブラー円盤 3枚 (手前ほど小さい → 3枚とも見える) --- */
    const discM = [
      new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.9, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.9, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x8a6f3c, metalness: 0.9, roughness: 0.4 }),
    ];
    const R = [78, 104, 130];
    discMeshes = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(discGeo(R[i], 15), discM[i]);
      m.position.set(DIAL.x, DIAL.y, 20 - i * 22);
      m.castShadow = true;
      doorG.add(m);
      discMeshes.push(m);
    }
    /* スピンドル */
    const spin = G3.add(doorG, new THREE.CylinderGeometry(16, 16, 110, 20), mats.steel, DIAL.x, DIAL.y, 0);
    spin.rotation.x = Math.PI / 2;

    /* --- フェンス (3本の指が円盤のふちに乗っている) --- */
    fenceG = new THREE.Group();
    fenceG.position.set(DIAL.x, DIAL.y + 158, 0);
    doorG.add(fenceG);
    G3.add(fenceG, new THREE.BoxGeometry(30, 14, 70), mats.chrome, 0, 6, -2).castShadow = true;
    for (let i = 0; i < 3; i++) {
      /* 指の長さ = その円盤の半径にとどく分 */
      const len = 158 - R[i] + 24;
      G3.add(fenceG, new THREE.BoxGeometry(12, len, 13), mats.chrome, 0, -len / 2 + 2, 20 - i * 22);
    }
    /* フェンスを押し下げるばね (扉側に固定して毎フレーム伸縮) */
    fenceSpringG = new THREE.Group();
    fenceSpringG.position.set(DIAL.x, 0, -2);
    doorG.add(fenceSpringG);
    fenceSpring = G3.springMesh(fenceSpringG, mats.steel, 5, 11, 2.4);
    G3.add(doorG, new THREE.BoxGeometry(60, 14, 40), doorM, DIAL.x, DIAL.y + 236, 0);

    /* --- ダイヤル --- */
    const dialG = new THREE.Group();
    dialG.position.set(DIAL.x, DIAL.y, 56);
    doorG.add(dialG);
    const knurl = G3.add(dialG, new THREE.CylinderGeometry(62, 66, 26, 48), mats.chrome, 0, 0, 0);
    knurl.rotation.x = Math.PI / 2;
    knurl.castShadow = true;
    /* 目盛りテクスチャの文字盤 */
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#16181c'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e8e8e8'; c.fillStyle = '#e8e8e8';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 22px sans-serif';
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * Math.PI * 2 - Math.PI / 2;
      const big = i % 10 === 0;
      c.lineWidth = big ? 3 : 1.5;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * (big ? 100 : 112), 128 + Math.sin(a) * (big ? 100 : 112));
      c.lineTo(128 + Math.cos(a) * 122, 128 + Math.sin(a) * 122);
      c.stroke();
      if (big) c.fillText(String(i), 128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
    }
    const face = new THREE.Mesh(new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.4, metalness: 0.2 }));
    face.position.z = 14;
    dialG.add(face);
    dialMesh = dialG;
    window.__pts.dial = dialG;
    /* 指標マーク (前板側・固定) */
    const mark = G3.add(doorG, new THREE.ConeGeometry(10, 22, 4),
      new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.4 }), DIAL.x, DIAL.y + 92, 52);
    mark.rotation.z = Math.PI;

    /* --- ハンドル (3本スポークの舵輪) --- */
    handleG = new THREE.Group();
    handleG.position.set(HANDLE.x, HANDLE.y, 58);
    doorG.add(handleG);
    const ring = G3.add(handleG, new THREE.TorusGeometry(84, 11, 14, 40), mats.chrome, 0, 0, 0);
    ring.castShadow = true;
    for (let i = 0; i < 3; i++) {
      const sp = G3.add(handleG, new THREE.CylinderGeometry(7, 7, 160, 12), mats.chrome, 0, 0, 0);
      sp.rotation.z = i * Math.PI / 3;
    }
    G3.add(handleG, new THREE.SphereGeometry(20, 20, 14), mats.brass, 0, 0, 4);
    window.__pts.handle = handleG;

    /* --- ボルトとキャリッジ (右の窓の中) --- */
    carriage = new THREE.Group();
    doorG.add(carriage);
    G3.add(carriage, new THREE.BoxGeometry(20, 430, 24), mats.steel, 190, 0, 14).castShadow = true;
    bolts = [];
    for (let i = 0; i < 4; i++) {
      const y = -195 + i * 130;
      const b = G3.add(carriage, new THREE.CylinderGeometry(20, 20, 150, 18), mats.chrome, 250, y, 14);
      b.rotation.z = Math.PI / 2;
      b.castShadow = true;
      bolts.push(b);
    }
    /* ハンドル軸のクランク → キャリッジへのリンク棒 */
    crankPin = G3.add(doorG, new THREE.CylinderGeometry(8, 8, 30, 10), mats.brass, HANDLE.x, HANDLE.y + 52, 30);
    crankPin.rotation.x = Math.PI / 2;
    crankRod = G3.add(doorG, new THREE.BoxGeometry(10, 10, 10), mats.steel, 0, 0, 0);
    crankRod.castShadow = true;

    /* 扉のふちのとって (あけるときにつかむ) */
    const grip = G3.add(doorG, new THREE.BoxGeometry(18, 160, 30), mats.darkPlastic, 296, 60, 30);
    grip.castShadow = true;
    window.__pts.doorEdge = grip;
  }

  /* --- ドライブピンの拾い: 連続角のまま遊びの範囲にクランプ --- */
  function propagate() {
    /* dial → disc0 → disc1 → disc2 */
    let drv = dial;
    for (let i = 0; i < 3; i++) {
      const rel = drv - discs[i];
      if (rel < relLo[i]) discs[i] = drv - relLo[i];
      else if (rel > relLo[i] + SLACK) discs[i] = drv - relLo[i] - SLACK;
      drv = discs[i];
    }
  }

  /* --- 画面上のある点を中心にした指の角度 (ダイヤル/ハンドル回し用) --- */
  function pointerAngle(obj, e) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.project(stage3.camera);
    const r = stage3.renderer.domElement.getBoundingClientRect();
    const cx = r.left + (v.x + 1) / 2 * r.width;
    const cy = r.top + (1 - (v.y + 1) / 2) * r.height;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  function hitOf(e) {
    const r = stage3.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(p, stage3.camera);
    const test = (obj, rad) => {
      const v = new THREE.Vector3();
      obj.getWorldPosition(v);
      return rc.ray.distanceToPoint(v) < rad;
    };
    if (test(dialMesh, 120)) return 'dial';
    if (test(handleG, 130)) return 'handle';
    if (test(window.__pts.doorEdge, 150)) return 'door';
    for (let i = 0; i < 9; i++) {
      if (window.__pts['gold' + i] && test(window.__pts['gold' + i], 70)) return 'gold' + i;
    }
    return null;
  }

  function onDown(e) {
    const hit = hitOf(e);
    if (hit === 'dial' && boltT < 0.05) {
      dragMode = 'dial'; dragId = e.pointerId;
      dragA0 = pointerAngle(dialMesh, e);
    } else if (hit === 'handle') {
      dragMode = 'handle'; dragId = e.pointerId;
      dragA0 = pointerAngle(handleG, e);
    } else if (hit === 'door' && boltT > 0.9) {
      dragMode = 'door'; dragId = e.pointerId;
      dragA0 = e.clientX;
      rumble = rumble || S.rumbleLoop();
    } else if (hit && hit.startsWith('gold')) {
      S.sparkle();
      const bar = window.__pts[hit];
      bar.position.y += 6;
      setTimeout(() => { if (bar) bar.position.y -= 6; }, 160);
    } else if (orbitId == null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragMode && e.pointerId === dragId) {
      if (dragMode === 'dial') {
        const a = pointerAngle(dialMesh, e);
        let d = wrapPi(a - dragA0);
        dragA0 = a;
        /* 画面の時計回り = ダイヤルの時計回り (角度系は反転) */
        dial -= d;
        tickAcc += Math.abs(d);
        if (tickAcc > Math.PI / 10) { tickAcc = 0; S.clickReal(0.35); }
        propagate();
      } else if (dragMode === 'handle') {
        const a = pointerAngle(handleG, e);
        let d = wrapPi(a - dragA0);
        dragA0 = a;
        const want = handleA + d;
        const fenceDown = fenceY > 18;
        const lim = fenceDown ? HANDLE_MAX : 0.14;
        const next = U.clamp(want, 0, lim);
        if (want > lim + 0.08 && handleA >= lim - 0.01 && !fenceDown) S.thunk();
        if (Math.abs(next - handleA) > 0.002 && servo) servo.set(0.5);
        handleA = next;
      } else if (dragMode === 'door') {
        const d = (e.clientX - dragA0) / 240;
        dragA0 = e.clientX;
        doorA.t = U.clamp(doorA.t + d, 0, 1.75);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004;
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.5, 1.45);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) { dragMode = null; dragId = null; if (servo) servo.set(0); }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* 円盤の描画 */
    for (let i = 0; i < 3; i++) discMeshes[i].rotation.z = discVis(i);

    /* 切り欠きが指標を通過したら音で知らせる (円盤ごとに音程がちがう) */
    for (let i = 0; i < 3; i++) {
      const off = wrapPi(discVis(i) - GATE);
      if (lastPass[i] * off < 0 && Math.abs(off) < 0.5) S.plip(1 + i * 0.35);
      if (off !== 0) lastPass[i] = off;
    }

    /* フェンス: 全部揃えば落ちる。ボルトが動いたら固定 */
    const wantDrop = allAligned() || boltT > 0.1;
    if (wantDrop && !fenceDropped) { fenceDropped = true; S.thunk(); }
    else if (!wantDrop && fenceDropped) { fenceDropped = false; S.snapBack(); }
    fenceY = U.lerp(fenceY, fenceDropped ? 26 : 0, 1 - Math.exp(-14 * dt));
    fenceG.position.y = DIAL.y + 158 - fenceY;
    fenceSpring.update(fenceG.position.y + 14, DIAL.y + 229 - (fenceG.position.y + 14));

    /* ハンドル: フェンスが上がっているときは手をはなすと戻る */
    if (dragMode !== 'handle' && !fenceDropped && handleA > 0) {
      handleA = Math.max(0, handleA - dt * 1.6);
    }
    handleG.rotation.z = -handleA;
    const bt = handleA / HANDLE_MAX;
    if (Math.abs(bt - boltT) > 0.0005) {
      if ((boltT < 0.97 && bt >= 0.97) || (boltT > 0.03 && bt <= 0.03)) S.thunk();
    }
    boltT = bt;
    carriage.position.x = -boltT * 66;
    /* クランクピンとリンク棒 */
    crankPin.position.set(HANDLE.x + Math.sin(0.5 - handleA) * 52, HANDLE.y + Math.cos(0.5 - handleA) * 52, 30);
    const tx = 190 - boltT * 66;
    const dx = tx - crankPin.position.x, dy = -20 - crankPin.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    crankRod.position.set((crankPin.position.x + tx) / 2, (crankPin.position.y - 20) / 2, 30);
    crankRod.rotation.z = Math.atan2(dy, dx);
    crankRod.scale.set(len / 10, 1, 1);

    /* 扉 (重さ = ゆっくり追従 + きしみ) */
    const beforeD = doorPivot.rotation.y;
    doorPivot.rotation.y = U.lerp(doorPivot.rotation.y, -doorA.t, 1 - Math.exp(-3.2 * dt));
    const vel = Math.abs(doorPivot.rotation.y - beforeD) / Math.max(dt, 0.001);
    if (rumble) rumble.set(U.clamp(vel * 1.6, 0, 0.7));
    const openness = -doorPivot.rotation.y;
    glowLight.intensity = U.clamp(openness * 2.2, 0, 1.6);
    if (!opened && openness > 0.9) { opened = true; S.ding(); S.sparkle(); }
    if (opened && openness < 0.15) opened = false;

    if (window.__dbgVL) window.__dbgVL({
      dial, discs: discs.slice(), notch: notch.slice(),
      off: [0, 1, 2].map(i => wrapPi(discVis(i) - GATE)),
      aligned: [0, 1, 2].map(alignedDisc), fenceY, handleA, boltT,
      doorA: doorA.t, openness,
    });

    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0; tickAcc = 0; opened = false;
      dial = 0;
      /* 組合せ: 切り欠きのオフセットは毎回ちがう */
      notch = [0, 1, 2].map(() => Math.random() * Math.PI * 2);
      discs = [0, 1, 2].map(() => Math.random() * Math.PI * 2 - Math.PI);
      relLo = [0, 1, 2].map((i) => {
        /* いまの位置関係が遊びの中に入るように下限を決める */
        const drv = i === 0 ? dial : discs[i - 1];
        return drv - discs[i] - Math.random() * SLACK;
      });
      fenceY = 0; fenceDropped = false; handleA = 0; boltT = 0;
      doorA = { t: 0 };
      lastPass = [1, 1, 1];
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 330, 0),
        radius: 1250, radiusPortraitBase: 1150, radiusMaxPortrait: 2100,
        az: -0.25, po: 1.18,
      });
      build();
      propagate();
      servo = S.servoLoop();
      rumble = null;

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
      if (servo) servo.stop();
      if (rumble) rumble.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
