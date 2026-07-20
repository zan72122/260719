/* ノック式ボールペンの中身 — 写実3D版 (Three.js)
 *
 * 実在の透明軸ノック式ボールペンをマクロ撮影したような画を目標にする。
 * 機構は実物準拠の回転カム式ラッチ:
 *   ノック → バネ圧縮 → 最下点でカムが回転(カチッ) → 芯が係合位置で固定
 *   もう一度ノック → カムがさらに回転 → バネが芯を押し戻す
 * 単位は mm。ペンはローカル +Y 軸沿い、ペン先端がローカル原点。
 */
window.GAMES.pen = (() => {
  const PRESS_MAX = 8;      // ノックの最大押し込み量
  const TIP_OUT = 5;        // 係合時に芯が繰り出される量
  const CLICK_DEPTH = 6;    // カムが回るストローク位置 (余裕をもたせる)
  const ENGAGED_REST = 4;   // 芯が出ている間、ノックボタンが沈んで止まる位置 (実物挙動)

  let stage, renderer, scene, camera, raf, prev, time;
  let penRoot, plungerG, refillG, camG, springMesh, knockHit, bodyHit, inkMesh;
  let paperMesh, paperCtx, paperTex;
  let plunger, refill, camAngle, camVel;
  let engaged, clicked, pendingRelease, pressId, pressY0, pressT0, pressMoved;
  let drawId, lastUV, scratch, scratchLevel, lastMoveT, blotR;
  let inkLevel, inkUse, swapT, swapDone;
  let flipId, flipFrom, archives;
  let orbitId, orbit, orbitFrom;
  let penPose; // 'home' | 'draw'
  let drawPoint, resizeHandler;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* ---------------- 素材 ---------------- */

  function makeMaterials() {
    return {
      /* 透明ボディ: 実屈折するクリア樹脂 */
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xf4fbff, metalness: 0, roughness: 0.06,
        transmission: 0.96, thickness: 1.6, ior: 1.5,
        clearcoat: 1, clearcoatRoughness: 0.08,
        side: THREE.DoubleSide,
      }),
      /* 紺色のABS樹脂 (ノックボタン・クリップ) */
      navy: new THREE.MeshPhysicalMaterial({
        color: 0x122a5e, metalness: 0, roughness: 0.42,
        clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.45,
      }),
      /* 乳白色のPOM (カム・回転子) */
      pom: new THREE.MeshStandardMaterial({ color: 0xded8c8, roughness: 0.5, envMapIntensity: 0.45 }),
      /* バネ鋼 */
      steel: new THREE.MeshStandardMaterial({ color: 0x8f959e, metalness: 0.95, roughness: 0.36, envMapIntensity: 0.85 }),
      /* 真鍮のペン先 */
      brass: new THREE.MeshStandardMaterial({ color: 0xb8903e, metalness: 1, roughness: 0.3, envMapIntensity: 0.9 }),
      /* クロームの締めリング */
      chrome: new THREE.MeshStandardMaterial({ color: 0xdadde2, metalness: 1, roughness: 0.15, envMapIntensity: 0.9 }),
      /* 半透明ポリプロピレンのリフィル管 */
      tube: new THREE.MeshPhysicalMaterial({
        color: 0xf5f4ee, metalness: 0, roughness: 0.55,
        transmission: 0.5, thickness: 1, ior: 1.45, envMapIntensity: 0.4,
      }),
      /* インク */
      ink: new THREE.MeshStandardMaterial({ color: 0x0c1436, roughness: 0.42, envMapIntensity: 0.18 }),
    };
  }

  /* ---------------- テクスチャ ---------------- */

  function woodTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    for (let plank = 0; plank < 4; plank++) {
      const y0 = plank * 128;
      const base = 92 + (plank % 2) * 10 + Math.random() * 8;
      ctx.fillStyle = `rgb(${(base + 52) | 0},${(base + 12) | 0},${(base - 26) | 0})`;
      ctx.fillRect(0, y0, 512, 128);
      /* 木目 */
      for (let i = 0; i < 46; i++) {
        const gy = y0 + Math.random() * 128;
        const dark = Math.random() * 0.13 + 0.03;
        ctx.strokeStyle = `rgba(58,36,18,${dark.toFixed(3)})`;
        ctx.lineWidth = Math.random() * 2.2 + 0.4;
        ctx.beginPath();
        const amp = Math.random() * 3 + 1;
        const ph = Math.random() * 7;
        ctx.moveTo(0, gy);
        for (let x = 0; x <= 512; x += 16) {
          ctx.lineTo(x, gy + Math.sin(x * 0.02 + ph) * amp);
        }
        ctx.stroke();
      }
      /* 板の継ぎ目 */
      ctx.fillStyle = 'rgba(40,24,12,0.55)';
      ctx.fillRect(0, y0 + 126, 512, 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function makePaperCanvas() {
    const cv = document.createElement('canvas');
    cv.width = 768;
    cv.height = 1024;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, cv.width, cv.height);
    /* 紙の繊維ノイズ */
    for (let i = 0; i < 9000; i++) {
      const g = (225 + Math.random() * 30) | 0;
      ctx.fillStyle = `rgba(${g},${g - 3},${g - 8},0.25)`;
      ctx.fillRect(Math.random() * cv.width, Math.random() * cv.height, 1.4, 1);
    }
    /* 薄い罫線 */
    ctx.strokeStyle = 'rgba(150,168,192,0.45)';
    ctx.lineWidth = 1.6;
    for (let y = 120; y < cv.height - 30; y += 82) {
      ctx.beginPath();
      ctx.moveTo(46, y);
      ctx.lineTo(cv.width - 46, y);
      ctx.stroke();
    }
    return { cv, ctx };
  }

  function gradientBG() {
    const cv = document.createElement('canvas');
    cv.width = 2;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#efece5');
    g.addColorStop(0.55, '#ddd7cc');
    g.addColorStop(1, '#b8b0a2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---------------- ばね (実ヘリックス) ---------------- */

  class Helix extends THREE.Curve {
    constructor(y0, len, coils, r) {
      super();
      this.y0 = y0; this.len = len; this.coils = coils; this.r = r;
    }
    getPoint(t, target) {
      const p = target || new THREE.Vector3();
      const a = t * this.coils * Math.PI * 2;
      return p.set(Math.cos(a) * this.r, this.y0 + t * this.len, Math.sin(a) * this.r);
    }
  }

  let springLenShown = -1;
  function updateSpring() {
    const top = 38.8 + refill.p;
    const len = top - 15.5;
    if (Math.abs(len - springLenShown) < 0.04) return;
    springLenShown = len;
    const geo = new THREE.TubeGeometry(new Helix(15.5, len, 7, 3.1), 210, 0.42, 8, false);
    if (springMesh) {
      springMesh.geometry.dispose();
      springMesh.geometry = geo;
    } else {
      springMesh = new THREE.Mesh(geo, materialsRef.steel);
      springMesh.castShadow = true;
      penRoot.add(springMesh);
    }
  }

  /* ---------------- 組み立て ---------------- */

  function buildPen(mats) {
    penRoot = new THREE.Group();
    scene.add(penRoot);

    const add = (parent, geo, mat, y, pos) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], y, pos[1]);
      else m.position.y = y;
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    /* --- 透明ボディ --- */
    add(penRoot, new THREE.CylinderGeometry(5.6, 2.3, 22, 48, 1, true), mats.glass, 11);
    add(penRoot, new THREE.CylinderGeometry(5.6, 5.6, 96, 48, 1, true), mats.glass, 70);
    add(penRoot, new THREE.CylinderGeometry(4.0, 5.6, 6, 48, 1, true), mats.glass, 121);
    add(penRoot, new THREE.CylinderGeometry(5.75, 5.75, 3.6, 48), mats.chrome, 117);

    /* クリップ */
    add(penRoot, new THREE.BoxGeometry(2.6, 36, 1.5), mats.navy, 97, [0, 6.9]);
    add(penRoot, new THREE.BoxGeometry(2.6, 2.2, 3.4), mats.navy, 114.5, [0, 5.9]);

    /* --- ノックボタン --- */
    plungerG = new THREE.Group();
    penRoot.add(plungerG);
    add(plungerG, new THREE.CylinderGeometry(3.4, 3.4, 11, 32), mats.navy, 128.5);
    add(plungerG, new THREE.SphereGeometry(3.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.navy, 134);
    add(plungerG, new THREE.CylinderGeometry(2.7, 2.7, 16, 24), mats.pom, 115);

    /* ノック用のあたり判定 (不可視・指よりだいぶ大きめ) */
    knockHit = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 22, 70, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    knockHit.position.y = 116;
    penRoot.add(knockHit);

    /* ボディのあたり判定 (インク切れ時のリフィル交換用) */
    bodyHit = new THREE.Mesh(
      new THREE.CylinderGeometry(17, 17, 78, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    bodyHit.position.y = 62;
    penRoot.add(bodyHit);

    /* --- リフィル (芯) --- */
    refillG = new THREE.Group();
    penRoot.add(refillG);
    add(refillG, new THREE.CylinderGeometry(1.7, 0.85, 9, 24), mats.brass, 6.5);
    add(refillG, new THREE.SphereGeometry(0.6, 16, 12), mats.steel, 1.8);
    add(refillG, new THREE.CylinderGeometry(1.55, 1.55, 88, 20), mats.tube, 55);
    inkMesh = add(refillG, new THREE.CylinderGeometry(1.16, 1.16, 58, 16), mats.ink, 40);
    add(refillG, new THREE.CylinderGeometry(2.7, 2.7, 2.4, 24), mats.pom, 39.5);

    /* 回転カム (ラッチ機構の心臓部) */
    camG = new THREE.Group();
    camG.position.y = 101;
    refillG.add(camG);
    add(camG, new THREE.CylinderGeometry(2.8, 2.8, 6, 24), mats.pom, 0);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.2, 1.5), mats.pom);
      const a = (i / 6) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 2.5, 1.2, Math.sin(a) * 2.5);
      tooth.rotation.y = -a;
      tooth.castShadow = true;
      camG.add(tooth);
    }
  }

  function buildScene() {
    /* 机 */
    const desk = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 })
    );
    desk.rotation.x = -Math.PI / 2;
    desk.receiveShadow = true;
    scene.add(desk);

    /* メモ用紙 (書ける) */
    const paper = makePaperCanvas();
    paperCtx = paper.ctx;
    paperTex = new THREE.CanvasTexture(paper.cv);
    paperTex.encoding = THREE.sRGBEncoding;
    paperTex.anisotropy = 8;
    paperMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 200),
      new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.88 })
    );
    paperMesh.rotation.x = -Math.PI / 2;
    paperMesh.rotation.z = -0.1;
    paperMesh.position.set(88, 2.3, 8);
    paperMesh.receiveShadow = true;
    scene.add(paperMesh);

    /* メモ帳の厚み */
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(150, 2.2, 200),
      new THREE.MeshStandardMaterial({ color: 0xece7da, roughness: 0.9 })
    );
    pad.rotation.y = -0.1;
    pad.position.set(88, 1.1, 8);
    pad.castShadow = true;
    pad.receiveShadow = true;
    scene.add(pad);

    /* ライティング */
    const key = new THREE.DirectionalLight(0xfff4e4, 1.05);
    key.position.set(130, 260, 170);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -180;
    key.shadow.camera.right = 180;
    key.shadow.camera.top = 180;
    key.shadow.camera.bottom = -180;
    key.shadow.camera.far = 700;
    key.shadow.bias = -0.0004;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x8a7a64, 0.4));

    /* 環境マップ (映り込み) */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    scene.background = gradientBG();
  }

  /* ---------------- 入力 ---------------- */

  function pointerNDC(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return ndc;
  }

  function onDown(e) {
    raycaster.setFromCamera(pointerNDC(e), camera);

    if (pressId === null) {
      const hit = raycaster.intersectObject(knockHit, false);
      if (hit.length) {
        pressId = e.pointerId;
        pressY0 = e.clientY;
        pressT0 = performance.now();
        pressMoved = 0;
        pendingRelease = false;
        /* 触れると少し沈む。素早いタップは onUp でフルストロークに、
           ゆっくり押し込むと深さが指に追従する (半ノックで芯が途中まで出せる) */
        plunger.t = (engaged ? ENGAGED_REST : 0) + 1.5;
        return;
      }
    }
    /* インク切れのときにボディをタップ → リフィル交換 */
    if (inkLevel <= 0 && swapT <= 0 && raycaster.intersectObject(bodyHit, false).length) {
      swapT = 1;
      swapDone = false;
      S.kachi();
      return;
    }
    if (drawId === null && flipId === null) {
      const hit = raycaster.intersectObject(paperMesh, false);
      if (hit.length) {
        const uv = hit[0].uv;
        /* 紙の手前右の角からのスワイプでページをめくる (ワールド座標で判定) */
        const hp = hit[0].point;
        if (hp.x - 88 > 38 && hp.z - 8 > 52) {
          flipId = e.pointerId;
          flipFrom = { x: e.clientX, y: e.clientY };
          return;
        }
        drawId = e.pointerId;
        penPose = 'draw';
        drawPoint.copy(hit[0].point);
        lastUV = uv.clone();
        lastMoveT = performance.now();
        blotR = 0;
        if (engaged) scratchStart();
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: orbit.az, po: orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === pressId) {
      /* 押し込みの深さが指の位置にそのまま追従する */
      pressMoved = Math.max(pressMoved, Math.abs(e.clientY - pressY0));
      const r = renderer.domElement.getBoundingClientRect();
      const dy = ((e.clientY - pressY0) / r.height) * 130;
      plunger.t = U.clamp((engaged ? ENGAGED_REST : 0) + 1.5 + dy, 0, PRESS_MAX);
    } else if (e.pointerId === flipId) {
      if (Math.hypot(e.clientX - flipFrom.x, e.clientY - flipFrom.y) > 55) {
        flipId = null;
        doFlip();
      }
    } else if (e.pointerId === drawId) {
      raycaster.setFromCamera(pointerNDC(e), camera);
      const hit = raycaster.intersectObject(paperMesh, false);
      if (hit.length) {
        drawPoint.copy(hit[0].point);
        const uv = hit[0].uv;
        if (engaged && lastUV) {
          drawStroke(lastUV, uv);
          const d = Math.hypot(uv.x - lastUV.x, uv.y - lastUV.y);
          scratchLevel = Math.min(1, scratchLevel + d * 30);
          if (d > 0.003) { lastMoveT = performance.now(); blotR = 0; }
        }
        lastUV = uv.clone();
      }
    } else if (e.pointerId === orbitId) {
      orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.25);
      orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.72, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === pressId) {
      pressId = null;
      /* 素早いタップ = フルストローク保証。押し込んだままなら現状維持で戻り判定へ */
      if (performance.now() - pressT0 < 190 && pressMoved < 14) plunger.t = PRESS_MAX;
      pendingRelease = true;   /* ラッチの確定はプランジャーの戻り行程で行う */
    } else if (e.pointerId === flipId) {
      flipId = null;
    } else if (e.pointerId === drawId) {
      drawId = null;
      lastUV = null;
      penPose = 'home';
      scratchStop();
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- 筆記 ---------------- */

  function drawStroke(uv0, uv1) {
    const W = 768, H = 1024;
    const x0 = uv0.x * W, y0 = (1 - uv0.y) * H;
    const x1 = uv1.x * W, y1 = (1 - uv1.y) * H;
    const speed = Math.hypot(x1 - x0, y1 - y0);
    paperCtx.lineCap = 'round';
    paperCtx.lineJoin = 'round';
    if (inkLevel <= 0) {
      /* インク切れ: 無色のひっかき跡だけが残る */
      paperCtx.strokeStyle = 'rgba(126,126,132,0.15)';
      paperCtx.lineWidth = 1.4;
    } else {
      /* 速度で線の太さと濃さが連続的に変わる。残量が少ないとかすれる */
      const inkK = U.clamp(inkLevel / 0.15, 0.3, 1);
      const alpha = U.clamp(0.95 - speed * 0.013, 0.28, 0.95) * inkK;
      paperCtx.strokeStyle = `rgba(23,32,88,${alpha.toFixed(2)})`;
      paperCtx.lineWidth = U.clamp(4.9 - speed * 0.09, 1.3, 4.9);
      /* 速筆やインク切れ間際は線が途切れる */
      if (speed > 34 || inkLevel < 0.1) {
        paperCtx.setLineDash([7, 3 + Math.max(0, speed - 30) * 0.45 + (inkLevel < 0.1 ? 6 : 0)]);
      }
    }
    paperCtx.beginPath();
    paperCtx.moveTo(x0, y0);
    paperCtx.lineTo(x1, y1);
    paperCtx.stroke();
    paperCtx.setLineDash([]);
    if (inkLevel > 0) {
      inkUse += speed;
      inkLevel = Math.max(0, 1 - inkUse / 22000);
      updateInkMesh();
    }
    paperTex.needsUpdate = true;
  }

  function updateInkMesh() {
    const k = Math.max(0.02, inkLevel);
    inkMesh.scale.y = k;
    inkMesh.position.y = 11 + 29 * k;
  }

  /* ページをめくる: いまの紙を机の脇へ滑らせ、新しい紙を出す */
  function doFlip() {
    S.flipPage();
    const n = archives.length;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(150, 200), paperMesh.material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(88, 2.6, 8);
    plane.rotation.z = -0.1;
    scene.add(plane);
    archives.push({
      m: plane, t: 0,
      from: { x: 88, y: 2.6, z: 8, rz: -0.1 },
      to: { x: -112 - (n % 3) * 7, y: 0.6 + n * 0.35, z: 128 + (n % 4) * 16, rz: -0.55 + n * 0.23 },
    });
    if (archives.length > 8) {
      const old = archives.shift();
      scene.remove(old.m);
      old.m.geometry.dispose();
      if (old.m.material.map) old.m.material.map.dispose();
      old.m.material.dispose();
    }
    /* 新しい紙 */
    const paper = makePaperCanvas();
    paperCtx = paper.ctx;
    paperTex = new THREE.CanvasTexture(paper.cv);
    paperTex.encoding = THREE.sRGBEncoding;
    paperTex.anisotropy = 8;
    paperMesh.material = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.88 });
  }

  function scratchStart() {
    if (!scratch) scratch = S.scratchLoop();
  }
  function scratchStop() {
    if (scratch) { scratch.stop(); scratch = null; }
    scratchLevel = 0;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    /* 指を離しても、押し切ったストロークは最下点まで進んでから戻る */
    if (pendingRelease) {
      if (clicked) plunger.t = 0;
      else if (plunger.t < CLICK_DEPTH) plunger.t = engaged ? ENGAGED_REST : 0;
    }

    /* ノック: 押し込みは機械的に固く、戻りはバネらしく */
    U.stepSpring(plunger, dt, 1600, 34);
    /* 最下点付近でカムが1歯回る (押し行程)。回転は慣性つき:
       リズムよく連打すると勢いが乗ってカムが回り続ける */
    if (plunger.p >= CLICK_DEPTH && !clicked) {
      clicked = true;
      camVel += 11;
      S.clickReal(1);
    }
    /* 戻り行程でラッチが確定する (実物と同じ順序) */
    if (pendingRelease && clicked && plunger.p <= CLICK_DEPTH - 1.2 && plunger.v < 0) {
      pendingRelease = false;
      clicked = false;
      engaged = !engaged;
      /* 係合中はボタンが半分沈んだ位置で止まる (本物のノックペンと同じ) */
      plunger.t = engaged ? ENGAGED_REST : 0;
      if (engaged) {
        S.clickReal(0.85, 0.03);      /* 芯が係合して固定される音 */
      } else {
        S.snapBack();                  /* バネが芯をはね戻す */
        camVel += 8;                   /* 戻りでカムがもう1歯すべる */
      }
    }
    plungerG.position.y = -plunger.p;

    /* 芯: 休止位置より深く押した分だけさらに押し込まれ、
       離すと係合位置またはゼロ位置へバネで戻る */
    const pressExtra = Math.max(0, plunger.p - (engaged ? ENGAGED_REST : 0));
    refill.t = (engaged ? -TIP_OUT : 0) - pressExtra * 0.5;
    U.stepSpring(refill, dt, engaged ? 1400 : 620, engaged ? 30 : 15);

    /* リフィル交換アニメ (上へ抜けて新品が入る) */
    let swapOff = 0;
    if (swapT > 0) {
      swapT = Math.max(0, swapT - dt);
      if (swapT > 0.5) {
        swapOff = (1 - swapT) * 2 * 240;
      } else {
        if (!swapDone) {
          swapDone = true;
          inkLevel = 1;
          inkUse = 0;
          updateInkMesh();
          S.kachi();
        }
        swapOff = swapT * 2 * 240;
        if (swapT === 0) S.clickReal(0.8);
      }
    }
    refillG.position.y = refill.p + swapOff;

    /* カムの回転 (角速度 + 減衰) */
    camVel *= Math.exp(-dt * 5);
    camAngle += camVel * dt;
    camG.rotation.y = camAngle;

    /* 指を止めているとインクだまりがにじむ */
    if (drawId !== null && engaged && lastUV && inkLevel > 0 &&
        performance.now() - lastMoveT > 350) {
      blotR = Math.min(24, blotR + dt * 9);
      const bx = lastUV.x * 768, by = (1 - lastUV.y) * 1024;
      paperCtx.fillStyle = 'rgba(23,32,88,0.09)';
      paperCtx.beginPath();
      paperCtx.arc(bx, by, blotR, 0, Math.PI * 2);
      paperCtx.fill();
      paperTex.needsUpdate = true;
      inkUse += dt * 260;
      inkLevel = Math.max(0, 1 - inkUse / 22000);
      updateInkMesh();
    }

    /* めくった紙が机の脇へすべっていく */
    for (const a of archives) {
      if (a.t < 1) {
        a.t = Math.min(1, a.t + dt * 2.2);
        const e2 = 1 - (1 - a.t) * (1 - a.t);
        a.m.position.set(
          U.lerp(a.from.x, a.to.x, e2),
          U.lerp(a.from.y, a.to.y, e2),
          U.lerp(a.from.z, a.to.z, e2)
        );
        a.m.rotation.z = U.lerp(a.from.rz, a.to.rz, e2);
      }
    }

    updateSpring();

    /* ペンの姿勢: 定位置 ⇄ 紙の上 */
    const target = penPose === 'draw'
      ? { x: drawPoint.x, y: 2.6, z: drawPoint.z, rz: 0.3, ry: -0.4 }
      : { x: 0, y: 1.2, z: 0, rz: 0, ry: 0 };
    const k = Math.min(1, dt * (penPose === 'draw' ? 14 : 7));
    penRoot.position.x += (target.x - penRoot.position.x) * k;
    penRoot.position.y += (target.y - penRoot.position.y) * k;
    penRoot.position.z += (target.z - penRoot.position.z) * k;
    penRoot.rotation.z += (target.rz - penRoot.rotation.z) * k;
    penRoot.rotation.y += (target.ry - penRoot.rotation.y) * k;

    /* 紙をこする音は速度で減衰 */
    scratchLevel = Math.max(0, scratchLevel - dt * 6);
    if (scratch) scratch.set(scratchLevel);

    /* カメラ */
    const sp = new THREE.Spherical(orbit.radius, orbit.po, orbit.az);
    camera.position.setFromSpherical(sp).add(orbit.target);
    camera.lookAt(orbit.target);

    GUIDE.tick(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  let materialsRef;

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const aspect = w / h;
    orbit.radius = aspect >= 1 ? 335 : Math.min(430, 250 / aspect);
  }

  return {
    start(el) {
      stage = el;
      time = 0;
      THREE.ColorManagement.legacyMode = false;   /* 16進カラーをsRGBとして正しく扱う */
      engaged = false; clicked = false; pendingRelease = false;
      pressId = null; drawId = null; orbitId = null; flipId = null;
      plunger = U.spring(0);
      refill = U.spring(0);
      camAngle = 0; camVel = 0;
      pressMoved = 0; pressT0 = 0; scratch = null; scratchLevel = 0;
      inkLevel = 1; inkUse = 0; swapT = 0; swapDone = false;
      lastMoveT = 0; blotR = 0;
      archives = [];
      springLenShown = -1; springMesh = null;
      penPose = 'home';
      drawPoint = new THREE.Vector3();
      lastUV = null;

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      stage.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
      orbit = { az: 0.5, po: 1.15, radius: 250, target: new THREE.Vector3(34, 48, 0) };

      materialsRef = makeMaterials();
      buildScene();
      buildPen(materialsRef);
      updateSpring();

      resizeHandler = () => resize();
      window.addEventListener('resize', resizeHandler);
      resize();

      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ノック → 紙に書く */
      GUIDE.start({ scene, camera, orbit, renderer }, [
        { kind: 'tap', at: () => knockHit, r: 16, done: () => engaged },
        {
          kind: 'drag', r: 13,
          at: () => new THREE.Vector3(60, 6, 35),
          to: () => new THREE.Vector3(115, 6, -12),
          done: () => inkUse > 60,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      scratchStop();
      window.removeEventListener('resize', resizeHandler);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => {
            for (const key in m) {
              if (m[key] && m[key].isTexture) m[key].dispose();
            }
            m.dispose();
          });
        }
      });
      if (scene.background && scene.background.isTexture) scene.background.dispose();
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      renderer = null;
      scene = null;
    },
  };
})();
