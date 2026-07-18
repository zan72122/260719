/* 石けんポンプの中身 — 写実3D版 (Three.js)
 *
 * 透明ボトルのソープディスペンサー。中の機構は実物準拠:
 *   ヘッドを押す → ピストンが下がりチャンバーを加圧 → 吐出弁ボールが開いて
 *   ノズルから石けんが出る → 離すとバネで戻り、吸入弁ボールが開いて
 *   吸い上げ管から液がチャンバーへ補充される (ボトルの液面が下がる)
 * 単位は mm。ボトル中心軸がローカル原点。
 */
window.GAMES.pump = (() => {
  const STROKE_MAX = 12;    // ヘッドの最大押し込み量
  const EXIT = { x: 48, y: 167 };   // ノズル開口 (ヘッド静止時)

  let stage3, scene, raf, prev, time;
  let headG, piston, springCtl, inletBall, outletBall, liquidMesh, flowDots;
  let headHit, dishPos;
  let stroke, pressing, pressId, pressY0, orbitId, orbitFrom;
  let level, charge, emitT, suckPlayed, inletOpen, outletOpen;
  let blobs, pile, splats, liquidMat;
  let mats;

  /* ---------------- 質感 ---------------- */

  function counterTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#dfdfda';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      const v = (180 + Math.random() * 50) | 0;
      ctx.fillStyle = `rgba(${v},${v},${v - 4},0.5)`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---------------- 組み立て ---------------- */

  function build() {
    const s = stage3;
    scene = s.scene;
    mats = G3.materials();

    /* 濃い蜂蜜状の液。透明ボトルの transmission 越しに見えるよう不透明にする
       (three.js の transmission パスは他の透過マテリアルを映さないため) */
    liquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xc97a10, metalness: 0, roughness: 0.18,
      clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.5,
    });

    /* 洗面カウンター */
    const counter = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ map: counterTexture(), roughness: 0.4 })
    );
    counter.rotation.x = -Math.PI / 2;
    counter.receiveShadow = true;
    scene.add(counter);

    scene.background = G3.bgGradient('#eef3f6', '#dde6ec', '#b9c4cd');
    G3.addLights(scene, { pos: new THREE.Vector3(300, 620, 420), shadowSpan: 320 });

    /* --- ボトルの液体 (先に描いてボトル越しに見せる) --- */
    liquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(27.5, 27.5, 1, 32), liquidMat);
    scene.add(liquidMesh);

    /* --- 吸い上げ管と吸入弁 ---
       ボトル(transmission)越しに見えるよう、内部の部品はすべて不透明にする */
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xeeece2, roughness: 0.5, envMapIntensity: 0.4 });
    G3.add(scene, new THREE.CylinderGeometry(3, 3, 112, 16), tubeMat, 0, 64, 0);
    /* チャンバーは上下のリングで輪郭だけ示し、中のピストンとバネを見せる */
    G3.add(scene, new THREE.CylinderGeometry(8.6, 8.6, 3, 24, 1, true), tubeMat, 0, 119, 0);
    G3.add(scene, new THREE.CylinderGeometry(8.6, 8.6, 3, 24, 1, true), tubeMat, 0, 152, 0);
    inletBall = G3.add(scene, new THREE.SphereGeometry(3.5, 20, 14), mats.steel, 0, 123, 0);

    /* チャンバー内のバネ */
    springCtl = G3.springMesh(scene, mats.steel, 6, 5, 0.5);

    /* すいこみ中に管をのぼる液 (管を包むふくらみとして見せる) */
    flowDots = [];
    for (let i = 0; i < 4; i++) {
      const d = G3.add(scene, new THREE.SphereGeometry(4.3, 14, 10), liquidMat, 0, 20 + i * 26, 0);
      d.scale.set(1, 1.6, 1);
      d.visible = false;
      flowDots.push(d);
    }

    /* --- 透明ボトル --- */
    G3.add(scene, new THREE.CylinderGeometry(30, 30, 110, 48, 1, true), mats.glass, 0, 59, 0);
    G3.add(scene, new THREE.CylinderGeometry(29.5, 29.5, 4, 48), mats.glass, 0, 2, 0);
    G3.add(scene, new THREE.CylinderGeometry(11, 30, 20, 48, 1, true), mats.glass, 0, 124, 0);
    G3.add(scene, new THREE.CylinderGeometry(11, 11, 12, 32, 1, true), mats.glass, 0, 140, 0);
    /* 白いキャップ (ねじ込みカラー) */
    G3.add(scene, new THREE.CylinderGeometry(13, 13, 12, 32), mats.whitePlastic, 0, 152, 0);

    /* --- 動くヘッド (透明で中の弁が見える) --- */
    headG = new THREE.Group();
    scene.add(headG);
    piston = G3.add(headG, new THREE.CylinderGeometry(7, 7, 5, 24), mats.darkPlastic, 0, 149, 0);
    G3.add(headG, new THREE.CylinderGeometry(2.5, 2.5, 17, 16), mats.whitePlastic, 0, 159.5, 0);
    G3.add(headG, new THREE.CylinderGeometry(14, 14, 18, 32), mats.glass, 0, 177, 0);
    /* ノズルアーム (横向きの透明管) */
    const arm = G3.add(headG, new THREE.CylinderGeometry(5.5, 5.5, 42, 24), mats.glass, 29, 178, 0);
    arm.rotation.z = Math.PI / 2;
    G3.add(headG, new THREE.CylinderGeometry(4.5, 4, 10, 20), mats.glass, 48, 172, 0);
    /* 吐出弁ボール (押すと開く) */
    outletBall = G3.add(headG, new THREE.SphereGeometry(2.5, 16, 12), mats.steel, 12, 178, 0);

    /* ヘッドのあたり判定 (大きめ・不可視) */
    headHit = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 30, 64, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    headHit.position.y = 178;
    headG.add(headHit);

    /* --- 石けんを受ける白い陶器の皿 --- */
    dishPos = new THREE.Vector3(54, 0, 0);
    const dish = G3.add(scene, new THREE.CylinderGeometry(21, 17, 5, 36), mats.ceramic, dishPos.x, 2.5, dishPos.z);
    dish.receiveShadow = true;
    const dishIn = G3.add(scene, new THREE.CylinderGeometry(17.5, 17.5, 1.2, 36),
      new THREE.MeshPhysicalMaterial({ color: 0xe9e7e0, roughness: 0.2, clearcoat: 0.8 }), dishPos.x, 5.1, dishPos.z);
    dishIn.receiveShadow = true;
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (pressId === null) {
      const hit = ray.intersectObject(headHit, false);
      if (hit.length) {
        pressId = e.pointerId;
        pressY0 = e.clientY;
        pressing = true;
        stroke.t = STROKE_MAX;   /* タップでも必ず押し切れる */
        S.squishReal(1);
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === pressId) {
      const r = stage3.renderer.domElement.getBoundingClientRect();
      const dy = ((e.clientY - pressY0) / r.height) * 140;
      stroke.t = U.clamp(STROKE_MAX + Math.min(0, dy), 0, STROKE_MAX);
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.25);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.72, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === pressId) {
      pressId = null;
      pressing = false;
      stroke.t = 0;
      suckPlayed = false;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- 石けんの粒 ---------------- */

  function spawnBlob() {
    const r = U.rand(3.4, 5.4);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), liquidMat);
    m.castShadow = true;
    m.position.set(EXIT.x + U.rand(-1, 1), EXIT.y - stroke.p, U.rand(-1, 1));
    scene.add(m);
    blobs.push({ m, r, vx: U.rand(2, 10), vy: -60, vz: U.rand(-4, 4) });
  }

  function landBlob(b) {
    /* 皿の上に積もる。ぷにっと潰れる */
    const px = U.clamp(b.m.position.x + U.rand(-11, 11), dishPos.x - 14, dishPos.x + 14);
    const pz = U.clamp(b.m.position.z + U.rand(-11, 11), -14, 14);
    b.m.position.set(px, 4.5 + pile.length * 1.9 + b.r * 0.5, pz);
    b.m.scale.set(1.3, 0.5, 1.3);
    pile.push({ m: b.m, life: 1 });
    S.plip();
    /* 積もりすぎた分は古いものから静かに沈んで消える */
    if (pile.length > 30) pile[0].life = Math.min(pile[0].life, 0.35);
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    U.stepSpring(stroke, dt, 300, 22);   /* 実物のポンプらしい、ぬるっとしたストローク */
    headG.position.y = -stroke.p;

    /* 押し下げ → 吐出 */
    const pushing = stroke.v > 4 && stroke.p > 1;
    if (pushing && charge > 0) {
      emitT -= dt;
      if (emitT <= 0) {
        emitT = 0.07;
        spawnBlob();
        charge = Math.max(0, charge - 0.14);
      }
    }
    outletOpen += ((pushing && charge > 0 ? 1 : 0) - outletOpen) * Math.min(1, dt * 14);
    outletBall.position.x = 12 + outletOpen * 3.5;

    /* 戻り → 吸い上げ */
    const sucking = stroke.v < -4 && charge < 1 && level > 0.15;
    if (sucking) {
      charge = Math.min(1, charge + dt * 1.7);
      level = Math.max(0.15, level - dt * 0.02);
      if (!suckPlayed) { suckPlayed = true; S.glug(); }
    }
    inletOpen += ((sucking ? 1 : 0) - inletOpen) * Math.min(1, dt * 12);
    inletBall.position.y = 123 + inletOpen * 5;

    /* 管をのぼる液 */
    flowDots.forEach((d, i) => {
      d.visible = inletOpen > 0.25;
      if (d.visible) {
        let y = d.position.y + dt * 220;
        if (y > 118) y = 16 + (i % 2) * 8;
        d.position.y = y;
      }
    });

    /* チャンバー内バネ: ピストンが下がると縮む */
    springCtl.update(120, 26.5 - stroke.p);

    /* ボトルの液面 */
    liquidMesh.scale.y = level * 100;
    liquidMesh.position.y = 5 + level * 50;

    /* 落ちる石けん */
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      b.vy -= 3000 * dt;
      b.m.position.x += b.vx * dt;
      b.m.position.y += b.vy * dt;
      b.m.position.z += b.vz * dt;
      /* 落下中はしずく形にのびる */
      const st = U.clamp(1 - b.vy / 900, 1, 1.6);
      b.m.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
      const p = b.m.position;
      const overDish = Math.hypot(p.x - dishPos.x, p.z - dishPos.z) < 19;
      if (overDish && p.y < 7 + pile.length * 1.9) {
        blobs.splice(i, 1);
        landBlob(b);
      } else if (p.y < b.r * 0.4 + 1) {
        /* カウンターに落ちたぶんは平たく残ってゆっくり消える */
        blobs.splice(i, 1);
        b.m.position.y = 1.2;
        b.m.scale.set(1.9, 0.16, 1.9);
        splats.push({ m: b.m, life: 4 });
        S.plip();
      }
    }

    /* 皿の上の石けん: 古いものから沈んで消える */
    for (let i = pile.length - 1; i >= 0; i--) {
      const q = pile[i];
      if (q.life < 1) {
        q.life -= dt * 0.5;
        q.m.scale.multiplyScalar(Math.max(0.0001, 1 - dt * 1.2));
        q.m.position.y -= dt * 3;
        if (q.life <= 0) {
          scene.remove(q.m);
          q.m.geometry.dispose();
          pile.splice(i, 1);
          pile.forEach(o => { o.m.position.y = Math.max(4.5, o.m.position.y - 1.9); });
        }
      }
    }

    /* カウンターの液だまり */
    for (let i = splats.length - 1; i >= 0; i--) {
      const q = splats[i];
      q.life -= dt;
      if (q.life < 1.2) {
        q.m.scale.x *= 1 - dt * 0.3;
        q.m.scale.z *= 1 - dt * 0.3;
        q.m.scale.y *= 1 - dt * 0.6;
      }
      if (q.life <= 0) {
        scene.remove(q.m);
        q.m.geometry.dispose();
        splats.splice(i, 1);
      }
    }

    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      stroke = U.spring(0);
      pressing = false; pressId = null; orbitId = null;
      level = 0.8; charge = 1; emitT = 0; suckPlayed = false;
      inletOpen = 0; outletOpen = 0;
      blobs = []; pile = []; splats = [];

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(22, 88, 0),
        radius: 400, radiusPortraitBase: 300, radiusMaxPortrait: 560,
        az: 0.45, po: 1.2,
      });
      build();

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
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
