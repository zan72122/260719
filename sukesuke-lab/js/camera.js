/* フィルムカメラ — 写実3D (断面一眼レフ)
 *
 * まきもどしまで1本勝負。フィルムの残りかずに重みがある機械。
 * ボディの右側面を切り欠いて、ミラー・シャッター幕・フィルム送りを見せる。
 * 連鎖: 巻き上げレバー → スプロケットが回ってフィルム1コマ送り → シャッターが
 *       チャージされる → シャッターボタン → ミラーが跳ね上がる → 幕が走る →
 *       そのしゅんかんの景色がフィルムに写る → 8まいで巻き止まり →
 *       巻き戻しクランク → 現像 → プリントが机にならぶ
 * 分岐: カメラの向き (構図) × シャッターをおすしゅんかん (鳥や風車の位置) ×
 *       シャッター速度 (速い=止まる/おそい=流れる+明るい) × 8まいのつかいかた。
 *       同じ写真は二度と撮れない。
 */
window.GAMES.camera = (() => {
  const SPEEDS = [30, 60, 125, 250, 500];   /* 1/n 秒 */
  const MAXSHOT = 8;
  const CAPW = 256, CAPH = 192;

  let stage3, scene, raf, prev, time;
  let camG, capCam, target, mirror, curtainA, curtainB, counterCv, counterTex;
  let leverG, dialG, crankG, shutterBtn, spoolL, spoolR, sprocket, filmStrip;
  let windBlades, bird, birdWingL, birdWingR, cloudG, printsG;
  let aim, cocked, count, speedIdx, firing, fireT, leverT, leverAnim;
  let rewindA, rewinding, developQ, developT, shots, printCount;
  let dragMode, dragId, dragFrom, orbitId, orbitFrom;
  let whirr, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#aecbe8', '#cfe2f2', '#7fa8cc');

    /* 床 (机がのる部屋) */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: 0x9a8468, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1800, 1300), shadowSpan: 1300, intensity: 0.95 });

    /* --- 机 --- */
    const woodM = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.55 });
    G3.add(scene, new THREE.BoxGeometry(1500, 30, 900), woodM, 0, 165, 150).receiveShadow = true;
    [[-680, 480], [680, 480], [-680, -180], [680, -180]].forEach(([x, z]) => {
      G3.add(scene, new THREE.CylinderGeometry(20, 16, 150, 12), woodM, x, 75, z);
    });

    /* --- ジオラマ (窓のむこうの景色) --- */
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(2600, 2800, 300, 40),
      new THREE.MeshStandardMaterial({ color: 0x6fa552, roughness: 0.9 }));
    hill.position.set(1450, -150, -1700);
    scene.add(hill);
    /* 風車 */
    const towerM = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 });
    const tower = G3.add(scene, new THREE.CylinderGeometry(60, 110, 620, 16), towerM, 1750, 310, -1650);
    tower.castShadow = true;
    G3.add(scene, new THREE.ConeGeometry(80, 120, 16),
      new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.6 }), 1750, 680, -1650);
    windBlades = new THREE.Group();
    windBlades.position.set(1750, 600, -1560);
    scene.add(windBlades);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.5, side: THREE.DoubleSide });
    const tipM = new THREE.MeshStandardMaterial({ color: 0xc84838, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const b = G3.add(windBlades, new THREE.BoxGeometry(60, 300, 6), bladeM, 0, 0, 0);
      b.position.set(Math.cos(i * Math.PI / 2) * 170, Math.sin(i * Math.PI / 2) * 170, 0);
      b.rotation.z = i * Math.PI / 2;
      b.castShadow = true;
      const t = G3.add(windBlades, new THREE.BoxGeometry(64, 50, 8), tipM, 0, 0, 0);
      t.position.set(Math.cos(i * Math.PI / 2) * 300, Math.sin(i * Math.PI / 2) * 300, 0);
      t.rotation.z = i * Math.PI / 2;
    }
    /* 鳥 (円をえがいて飛ぶ) */
    bird = new THREE.Group();
    scene.add(bird);
    const birdM = new THREE.MeshStandardMaterial({ color: 0x384048, roughness: 0.5 });
    G3.add(bird, new THREE.SphereGeometry(26, 14, 10), birdM, 0, 0, 0).scale.set(1.7, 0.8, 0.8);
    const wingG = new THREE.BoxGeometry(70, 4, 44);
    birdWingL = G3.add(bird, wingG, birdM, 0, 6, -40);
    birdWingR = G3.add(bird, wingG, birdM, 0, 6, 40);
    /* 太陽と雲 */
    G3.add(scene, new THREE.SphereGeometry(120, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), 2200, 1500, -2600);
    cloudG = new THREE.Group();
    scene.add(cloudG);
    const cloudM = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        G3.add(c, new THREE.SphereGeometry(90 - k * 18, 12, 8), cloudM, k * 100 - 100, (k % 2) * 30, 0)
          .scale.set(1.4, 0.8, 1);
      }
      c.position.set(-800 + i * 700, 1100 + i * 120, -2900);
      cloudG.add(c);
    }

    /* --- 一眼レフ本体 (右側面が断面) --- */
    camG = new THREE.Group();
    camG.position.set(0, 345, 0);
    scene.add(camG);
    window.__pts.body = camG;

    const bodyM = new THREE.MeshPhysicalMaterial({ color: 0x24262a, roughness: 0.42, clearcoat: 0.3 });
    const leatherM = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 });
    /* 外殻: 左半分 + 天板/底板 (右側面はあけて中を見せる) */
    G3.add(camG, new THREE.BoxGeometry(480, 26, 220), bodyM, 0, 148, 0).castShadow = true;
    G3.add(camG, new THREE.BoxGeometry(480, 26, 220), bodyM, 0, -148, 0);
    G3.add(camG, new THREE.BoxGeometry(200, 270, 220), leatherM, -140, 0, 0).castShadow = true;
    G3.add(camG, new THREE.BoxGeometry(480, 270, 24), leatherM, 0, 0, 98);
    /* ペンタプリズム部 */
    const prism = G3.add(camG, new THREE.CylinderGeometry(70, 95, 90, 4),
      new THREE.MeshPhysicalMaterial({ color: 0xcad2dc, metalness: 0.6, roughness: 0.2 }), 0, 205, -20);
    prism.rotation.y = Math.PI / 4;
    prism.castShadow = true;

    /* レンズ鏡筒 + レンズ玉 */
    const barrel = G3.add(camG, new THREE.CylinderGeometry(95, 105, 200, 32), bodyM, 0, 0, -210);
    barrel.rotation.x = Math.PI / 2;
    barrel.castShadow = true;
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0x8899bb, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 20, ior: 1.5,
    });
    [[-150, 72], [-230, 60], [-300, 80]].forEach(([z, r]) => {
      const g = G3.add(camG, new THREE.CylinderGeometry(r, r, 16, 28), glassM, 0, 0, z);
      g.rotation.x = Math.PI / 2;
    });
    G3.add(camG, new THREE.TorusGeometry(100, 8, 12, 32), mats.chrome, 0, 0, -308).rotation.x = 0;

    /* --- 断面の中身 --- */
    /* ミラー (45° → 撮影時に跳ね上がる) */
    mirror = G3.add(camG, new THREE.BoxGeometry(150, 4, 130),
      new THREE.MeshStandardMaterial({ color: 0xdce4ee, metalness: 1, roughness: 0.05 }), 0, -10, -30);
    mirror.rotation.x = -Math.PI / 4;
    /* シャッター幕 2枚 (フィルムの前を縦に走る) */
    const curtM = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.9, side: THREE.DoubleSide });
    curtainA = G3.add(camG, new THREE.BoxGeometry(150, 90, 3), curtM, 0, 0, 62);
    curtainB = G3.add(camG, new THREE.BoxGeometry(150, 90, 3), curtM, 0, 95, 62);
    /* フィルム: パトローネ(左)→ゲート→スプロケット→巻き取り(右) */
    const canM = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.8, roughness: 0.35 });
    spoolL = G3.add(camG, new THREE.CylinderGeometry(52, 52, 130, 20), canM, -180, 0, 60);
    spoolR = G3.add(camG, new THREE.CylinderGeometry(40, 40, 130, 20),
      new THREE.MeshStandardMaterial({ color: 0x6a4324, roughness: 0.5 }), 185, 0, 60);
    sprocket = G3.add(camG, new THREE.CylinderGeometry(26, 26, 120, 8), mats.brass, 120, 0, 60);
    [spoolL, spoolR, sprocket].forEach(s => { s.rotation.x = 0; });
    /* フィルム帯 (背面ぞい) */
    const filmCv = document.createElement('canvas');
    filmCv.width = 256; filmCv.height = 32;
    const fc = filmCv.getContext('2d');
    fc.fillStyle = '#5a4126'; fc.fillRect(0, 0, 256, 32);
    fc.fillStyle = '#14100a';
    for (let i = 0; i < 16; i++) { fc.fillRect(i * 16 + 5, 2, 7, 5); fc.fillRect(i * 16 + 5, 25, 7, 5); }
    const filmTex = new THREE.CanvasTexture(filmCv);
    filmTex.wrapS = THREE.RepeatWrapping;
    filmTex.repeat.set(2.4, 1);
    filmStrip = new THREE.Mesh(new THREE.PlaneGeometry(360, 128),
      new THREE.MeshStandardMaterial({ map: filmTex, roughness: 0.5, side: THREE.DoubleSide }));
    filmStrip.position.set(0, 0, 72);
    filmStrip.rotation.y = Math.PI;
    camG.add(filmStrip);

    /* --- 操作部 (天板) --- */
    /* 巻き上げレバー */
    leverG = new THREE.Group();
    leverG.position.set(150, 168, 55);
    camG.add(leverG);
    const lv = G3.add(leverG, new THREE.BoxGeometry(110, 10, 26), mats.chrome, -48, 0, 0);
    lv.castShadow = true;
    G3.add(leverG, new THREE.CylinderGeometry(22, 22, 18, 20), mats.chrome, 0, 0, 0);
    window.__pts.lever = leverG;
    /* シャッターボタン */
    shutterBtn = G3.add(camG, new THREE.CylinderGeometry(20, 20, 18, 20),
      new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.35, metalness: 0.3 }), 70, 170, 55);
    window.__pts.shutterBtn = shutterBtn;
    /* シャッター速度ダイヤル (目盛りつき) */
    dialG = new THREE.Group();
    dialG.position.set(-95, 168, 40);
    camG.add(dialG);
    const dcv = document.createElement('canvas');
    dcv.width = dcv.height = 128;
    const dc = dcv.getContext('2d');
    dc.fillStyle = '#d8d8d8'; dc.beginPath(); dc.arc(64, 64, 62, 0, Math.PI * 2); dc.fill();
    dc.fillStyle = '#111'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.font = 'bold 17px sans-serif';
    SPEEDS.forEach((s, i) => {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / SPEEDS.length);
      dc.fillText(String(s), 64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    });
    const dtop = new THREE.Mesh(new THREE.CircleGeometry(42, 32),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(dcv), roughness: 0.4 }));
    dtop.rotation.x = -Math.PI / 2;
    dtop.position.y = 13;
    const dbody = G3.add(dialG, new THREE.CylinderGeometry(42, 46, 24, 28), mats.chrome, 0, 0, 0);
    dbody.castShadow = true;
    dialG.add(dtop);
    window.__pts.dial = dialG;
    G3.add(camG, new THREE.ConeGeometry(6, 14, 4),
      new THREE.MeshStandardMaterial({ color: 0xc03030 }), -95, 172, -14).rotation.x = Math.PI;
    /* 巻き戻しクランク */
    crankG = new THREE.Group();
    crankG.position.set(-180, 168, 60);
    camG.add(crankG);
    G3.add(crankG, new THREE.CylinderGeometry(16, 16, 20, 16), mats.chrome, 0, 0, 0);
    const arm = G3.add(crankG, new THREE.BoxGeometry(52, 8, 14), mats.chrome, 22, 10, 0);
    G3.add(crankG, new THREE.CylinderGeometry(7, 7, 26, 10), mats.darkPlastic, 44, 22, 0);
    window.__pts.crank = crankG;
    /* コマ数窓 */
    counterCv = document.createElement('canvas');
    counterCv.width = 64; counterCv.height = 40;
    counterTex = new THREE.CanvasTexture(counterCv);
    const cwin = new THREE.Mesh(new THREE.PlaneGeometry(56, 34),
      new THREE.MeshBasicMaterial({ map: counterTex }));
    cwin.position.set(210, 168.5, 20);
    cwin.rotation.x = -Math.PI / 2;
    camG.add(cwin);
    drawCounter();

    /* --- 撮影用カメラ + 写る範囲の線 --- */
    capCam = new THREE.PerspectiveCamera(34, CAPW / CAPH, 10, 20000);
    capCam.position.set(0, 0, -320);
    capCam.rotation.y = Math.PI;      /* -z を向く */
    camG.add(capCam);
    const fr = new THREE.Group();
    const d = 1900;
    const hh = Math.tan(34 / 2 * Math.PI / 180) * d;
    const hw = hh * CAPW / CAPH;
    const pts = [];
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([x, y]) => {
      pts.push(new THREE.Vector3(0, 0, -320), new THREE.Vector3(x, y, -320 - d));
    });
    const frame = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }));
    camG.add(frame);

    /* プリント置き場 */
    printsG = new THREE.Group();
    scene.add(printsG);
  }

  function drawCounter() {
    const c = counterCv.getContext('2d');
    c.fillStyle = '#0c0e10'; c.fillRect(0, 0, 64, 40);
    c.fillStyle = count >= MAXSHOT ? '#e05a4a' : '#e8e4d8';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 26px sans-serif';
    c.fillText(count + '/' + MAXSHOT, 32, 21);
    counterTex.needsUpdate = true;
  }

  /* --- ジオラマを dt ぶん動かす (露光シミュレーションでも使う) --- */
  function tickWorld(dt) {
    time += dt;
    windBlades.rotation.z += dt * (0.9 + Math.sin(time * 0.23) * 0.55);
    const ba = time * 0.55;
    bird.position.set(1250 + Math.cos(ba) * 420, 760 + Math.sin(ba * 1.7) * 90, -1550 + Math.sin(ba) * 260);
    bird.rotation.y = -ba + Math.PI / 2;
    const flap = Math.sin(time * 9) * 0.7;
    birdWingL.rotation.x = flap;
    birdWingR.rotation.x = -flap;
    cloudG.children.forEach((c, i) => {
      c.position.x += dt * (14 + i * 6);
      if (c.position.x > 1500) c.position.x = -1600;
    });
  }

  /* --- 実撮影: レンダーターゲットに写して読み出す --- */
  function capture() {
    const rt = new THREE.WebGLRenderTarget(CAPW, CAPH);
    const cv = document.createElement('canvas');
    cv.width = CAPW; cv.height = CAPH;
    const c = cv.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = CAPW; tmp.height = CAPH;
    const tc = tmp.getContext('2d');
    const buf = new Uint8Array(CAPW * CAPH * 4);
    const img = tc.createImageData(CAPW, CAPH);

    const sub = speedIdx === 0 ? 4 : speedIdx === 1 ? 3 : speedIdx === 2 ? 2 : 1;
    const expT = 14 / SPEEDS[speedIdx];     /* ブレが見えるよう誇張した露光時間 */
    camG.visible = false;
    printsG.visible = false;
    capCam.updateMatrixWorld(true);
    for (let s = 0; s < sub; s++) {
      if (s > 0) tickWorld(expT / (sub - 1));
      stage3.renderer.setRenderTarget(rt);
      stage3.renderer.render(scene, capCam);
      stage3.renderer.readRenderTargetPixels(rt, 0, 0, CAPW, CAPH, buf);
      /* 上下反転して ImageData へ */
      for (let y = 0; y < CAPH; y++) {
        const src = (CAPH - 1 - y) * CAPW * 4;
        for (let x = 0; x < CAPW * 4; x++) img.data[y * CAPW * 4 + x] = buf[src + x];
      }
      tc.putImageData(img, 0, 0);
      c.globalAlpha = s === 0 ? 1 : 1 / (s + 1);
      c.drawImage(tmp, 0, 0);
    }
    c.globalAlpha = 1;
    /* 露出: おそい=明るい / 速い=暗い */
    const exp = [0.16, 0.06, 0, 0.14, 0.3][speedIdx];
    if (speedIdx < 2) { c.fillStyle = `rgba(255,250,235,${exp})`; c.fillRect(0, 0, CAPW, CAPH); }
    if (speedIdx > 2) { c.fillStyle = `rgba(6,8,14,${exp})`; c.fillRect(0, 0, CAPW, CAPH); }
    camG.visible = true;
    printsG.visible = true;
    stage3.renderer.setRenderTarget(null);
    rt.dispose();
    shots.push(cv);
  }

  /* --- 現像: プリントを机にならべる --- */
  function addPrint(cv) {
    const i = printCount++;
    const g = new THREE.Group();
    const col = i % 4, row = Math.floor(i / 4) % 3;
    g.position.set(-480 + col * 240 + (row % 2) * 40, 181 + Math.floor(i / 12) * 0.5, 300 + row * 130);
    g.rotation.y = ((i * 37) % 10 - 5) * 0.03;
    const card = new THREE.Mesh(new THREE.BoxGeometry(210, 2, 168),
      new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.6 }));
    card.castShadow = true;
    g.add(card);
    const photoM = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(cv), roughness: 0.45, color: 0x000000,
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(190, 142), photoM);
    photo.rotation.x = -Math.PI / 2;
    photo.position.y = 1.2;
    g.add(photo);
    printsG.add(g);
    if (i === 0) window.__pts.print0 = g;
    /* 現像: 黒からじわっと浮かびあがる */
    g.userData.dev = 0;
    g.userData.photoM = photoM;
    S.plip(1.3 + (i % 3) * 0.2);
  }

  function hitOf(e) {
    const r = stage3.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(p, stage3.camera);
    /* いちばん近い操作部を選ぶ (ダイヤルとクランクが並んでいるため) */
    const cand = [
      ['shutter', shutterBtn, 60], ['lever', leverG, 70], ['dial', dialG, 62],
      ['crank', crankG, 66], ['aim', camG, 330],
    ];
    let best = null, bestScore = 1;
    const v = new THREE.Vector3();
    for (const [name, obj, rad] of cand) {
      obj.getWorldPosition(v);
      const score = rc.ray.distanceToPoint(v) / rad;
      if (score < bestScore) { bestScore = score; best = name; }
    }
    return best;
  }

  function fireShutter() {
    if (firing || rewinding) return;
    if (!cocked) { S.clickReal(0.4); return; }
    if (count >= MAXSHOT) { S.buzz(); return; }
    cocked = false;
    firing = true;
    fireT = 0;
    count++;
    drawCounter();
  }

  function onDown(e) {
    const hit = hitOf(e);
    if (hit === 'shutter') {
      shutterBtn.position.y = 164;
      setTimeout(() => { if (shutterBtn) shutterBtn.position.y = 170; }, 140);
      fireShutter();
    } else if (hit === 'lever') {
      dragMode = 'lever'; dragId = e.pointerId; dragFrom = e.clientX;
    } else if (hit === 'dial') {
      dragMode = 'dial'; dragId = e.pointerId; dragFrom = e.clientX;
    } else if (hit === 'crank') {
      dragMode = 'crank'; dragId = e.pointerId;
      dragFrom = pointerAngle(crankG, e);
    } else if (hit === 'aim') {
      dragMode = 'aim'; dragId = e.pointerId;
      dragFrom = { x: e.clientX, y: e.clientY, yaw: aim.yaw, pitch: aim.pitch };
    } else if (orbitId == null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function pointerAngle(obj, e) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.project(stage3.camera);
    const r = stage3.renderer.domElement.getBoundingClientRect();
    const cx = r.left + (v.x + 1) / 2 * r.width;
    const cy = r.top + (1 - (v.y + 1) / 2) * r.height;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  function onMove(e) {
    if (dragMode && e.pointerId === dragId) {
      if (dragMode === 'lever') {
        const d = (e.clientX - dragFrom) / 150;
        dragFrom = e.clientX;
        const before = leverT;
        leverT = U.clamp(leverT + d, 0, 1);
        if (leverT > before && !cocked && count < MAXSHOT && !rewinding) {
          if (Math.floor(leverT * 6) > Math.floor(before * 6)) S.ratchet(0.5);
        } else if (leverT > before && (count >= MAXSHOT || cocked)) {
          if (count >= MAXSHOT && leverT > 0.3 && before <= 0.3) S.buzz();
        }
      } else if (dragMode === 'dial') {
        const d = e.clientX - dragFrom;
        if (Math.abs(d) > 34) {
          dragFrom = e.clientX;
          const next = U.clamp(speedIdx + (d > 0 ? 1 : -1), 0, SPEEDS.length - 1);
          if (next !== speedIdx) { speedIdx = next; S.clickReal(0.6); }
        }
      } else if (dragMode === 'crank') {
        const a = pointerAngle(crankG, e);
        let dd = a - dragFrom;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        dragFrom = a;
        if (dd > 0 && count > 0) {
          rewindA += dd;
          rewinding = true;
          if (whirr) whirr.set(0.4);
          if (rewindA > Math.PI * 1.5) {
            rewindA = 0;
            count--;
            drawCounter();
            S.ratchet(0.4);
            if (count === 0) {
              /* 全部巻き取った → 現像へ */
              rewinding = false;
              if (whirr) whirr.set(0);
              developQ = shots.slice();
              shots = [];
              developT = 0;
              cocked = false;
              S.ding();
            }
          }
        }
      } else if (dragMode === 'aim') {
        aim.yaw = U.clamp(dragFrom.yaw + (e.clientX - dragFrom.x) * 0.0022, -0.55, 0.55);
        aim.pitch = U.clamp(dragFrom.pitch + (e.clientY - dragFrom.y) * 0.0016, -0.12, 0.3);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004;
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.55, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'lever') {
        if (leverT > 0.85 && !cocked && count < MAXSHOT && !rewinding) {
          cocked = true;
          leverAnim = 1;        /* フィルム送りアニメ */
          S.kachi();
        }
        leverT = 0;
      }
      if (dragMode === 'crank') { rewinding = count === 0 ? false : rewinding; if (whirr) whirr.set(0); }
      dragMode = null; dragId = null;
    }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    tickWorld(dt);

    /* カメラの向き (基本姿勢: レンズはやや左奥 = 断面の右側面が手前を向く) */
    camG.rotation.y = -0.75 + aim.yaw;
    camG.rotation.x = aim.pitch;

    /* 巻き上げレバーとフィルム送り */
    leverG.rotation.y = -leverT * 2.2 - (leverAnim > 0 ? 0 : 0);
    if (leverAnim > 0) {
      const step = Math.min(leverAnim, dt * 2.6);
      leverAnim -= step;
      spoolR.rotation.y += step * 5;
      spoolL.rotation.y += step * 3.4;
      sprocket.rotation.y += step * 4;
      filmStrip.material.map.offset.x -= step * 0.5;
    }
    if (rewinding) {
      crankG.rotation.y = -rewindA * 2;
      spoolL.rotation.y -= dt * 9;
      filmStrip.material.map.offset.x += dt * 0.8;
    }

    /* シャッターの連鎖 (ミラー↑ → 幕が走る+露光 → ミラー↓) */
    if (firing) {
      fireT += dt;
      if (fireT < 0.12) {
        mirror.rotation.x = -Math.PI / 4 + (fireT / 0.12) * (Math.PI / 4 + 0.1);
      } else if (fireT < 0.3) {
        const t = (fireT - 0.12) / 0.18;
        curtainA.position.y = -t * 100;
        if (fireT - dt < 0.2 && fireT >= 0.2) {
          S.shutterClack();
          capture();
        }
      } else if (fireT < 0.46) {
        const t = (fireT - 0.3) / 0.16;
        curtainB.position.y = 95 - t * 95;
      } else if (fireT < 0.62) {
        mirror.rotation.x = -0.1 - ((fireT - 0.46) / 0.16) * (Math.PI / 4 - 0.1);
      } else {
        firing = false;
        mirror.rotation.x = -Math.PI / 4;
        curtainA.position.y = 0;
        curtainB.position.y = 95;
      }
    }

    /* 現像キュー: 1枚ずつ机へ */
    if (developQ && developQ.length) {
      developT += dt;
      if (developT > 0.7) {
        developT = 0;
        addPrint(developQ.shift());
        if (!developQ.length) { developQ = null; S.sparkle(); }
      }
    }
    /* プリントの現像フェード (黒→フルカラー) */
    printsG.children.forEach(g => {
      if (g.userData.dev < 1) {
        g.userData.dev = Math.min(1, g.userData.dev + dt * 0.5);
        const v = g.userData.dev;
        g.userData.photoM.color.setRGB(v, v, v);
      }
    });

    if (window.__dbgCM) window.__dbgCM({
      cocked, count, speedIdx, firing, leverT, leverAnim,
      aim: { yaw: aim.yaw, pitch: aim.pitch },
      shots: shots.length, prints: printCount,
      rewinding, rewindA, developing: developQ ? developQ.length : 0,
    });

    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      aim = { yaw: 0, pitch: 0.04 };
      cocked = false; count = 0; speedIdx = 2;
      firing = false; fireT = 0; leverT = 0; leverAnim = 0;
      rewindA = 0; rewinding = false; developQ = null; developT = 0;
      shots = []; printCount = 0;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 330, -100),
        radius: 1500, radiusPortraitBase: 1350, radiusMaxPortrait: 2400,
        az: 0.62, po: 1.12,
      });
      build();
      whirr = S.whirrLoop();

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
      if (whirr) whirr.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
