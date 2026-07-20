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
  let headHit, dishHit, bottleHit, dishPos, dishMeshes;
  let stroke, pressing, pressId, pressY0, pressT0, pressMoved, fullPump, orbitId, orbitFrom;
  let dishDragId, grabOff, bottleHoldId, glugT;
  let level, charge, emitT, suckPlayed, inletOpen, outletOpen, pressure, sputterN;
  let blobs, pile, splats, bubbles, liquidMat, foamMat;
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

    /* --- 石けんを受ける白い陶器の皿 (指でドラッグして動かせる) --- */
    dishPos = new THREE.Vector3(54, 0, 0);
    const dish = G3.add(scene, new THREE.CylinderGeometry(21, 17, 5, 36), mats.ceramic, dishPos.x, 2.5, dishPos.z);
    dish.receiveShadow = true;
    const dishIn = G3.add(scene, new THREE.CylinderGeometry(17.5, 17.5, 1.2, 36),
      new THREE.MeshPhysicalMaterial({ color: 0xe9e7e0, roughness: 0.2, clearcoat: 0.8 }), dishPos.x, 5.1, dishPos.z);
    dishIn.receiveShadow = true;
    dishHit = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 30, 26, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    dishHit.position.set(dishPos.x, 12, dishPos.z);
    scene.add(dishHit);
    dishMeshes = [dish, dishIn, dishHit];

    /* ボトル胴体のあたり判定 (長押しでつめかえ) */
    bottleHit = new THREE.Mesh(
      new THREE.CylinderGeometry(33, 33, 106, 12, 1, true),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    bottleHit.position.y = 58;
    scene.add(bottleHit);

    /* 泡まじり用の白い石けん */
    foamMat = new THREE.MeshPhysicalMaterial({
      color: 0xf6ecd8, metalness: 0, roughness: 0.35, clearcoat: 0.5, envMapIntensity: 0.4,
    });
  }

  /* ---------------- 入力 ---------------- */

  /* レイとカウンター面 (y=0) の交点 */
  function rayOnCounter(ray) {
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    const t = -o.y / d.y;
    if (t < 0) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  function onDown(e) {
    const ray = stage3.setRay(e);
    if (pressId === null) {
      const hit = ray.intersectObject(headHit, false);
      if (hit.length) {
        pressId = e.pointerId;
        pressY0 = e.clientY;
        pressT0 = performance.now();
        pressMoved = 0;
        pressing = true;
        fullPump = false;
        stroke.t = 1.5;   /* 触れると少し沈む。押す速さは指で決まる */
        S.squishReal(0.35);
        return;
      }
    }
    if (dishDragId === null && ray.intersectObject(dishHit, false).length) {
      const p = rayOnCounter(ray);
      if (p) {
        dishDragId = e.pointerId;
        grabOff = { x: dishPos.x - p.x, z: dishPos.z - p.z };
        return;
      }
    }
    if (bottleHoldId === null && ray.intersectObject(bottleHit, false).length) {
      bottleHoldId = e.pointerId;   /* 長押しでつめかえ */
      glugT = 0.25;
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === pressId) {
      /* 指の位置に押し込み量が追従: ゆっくり押せばゆっくり、強く押せば勢いよく */
      pressMoved = Math.max(pressMoved, Math.abs(e.clientY - pressY0));
      const r = stage3.renderer.domElement.getBoundingClientRect();
      const dy = ((e.clientY - pressY0) / r.height) * 160;
      stroke.t = U.clamp(1.5 + dy, 0, STROKE_MAX);
    } else if (e.pointerId === dishDragId) {
      const p = rayOnCounter(stage3.setRay(e));
      if (p) {
        const nx = U.clamp(p.x + grabOff.x, 26, 170);
        const nz = U.clamp(p.z + grabOff.z, -95, 95);
        const dx = nx - dishPos.x, dz = nz - dishPos.z;
        dishPos.x = nx; dishPos.z = nz;
        dishMeshes.forEach(m => { m.position.x += dx; m.position.z += dz; });
        pile.forEach(q => { q.m.position.x += dx; q.m.position.z += dz; });
      }
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.5, 1.25);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.72, 1.5);
    }
  }

  function onUp(e) {
    if (e.pointerId === pressId) {
      pressId = null;
      pressing = false;
      /* 素早いタップ = フルポンプ1回ぶん (押し切ってから戻る) */
      if (performance.now() - pressT0 < 190 && pressMoved < 14) {
        fullPump = true;
        stroke.t = STROKE_MAX;
      } else {
        stroke.t = 0;
      }
      suckPlayed = false;
    } else if (e.pointerId === dishDragId) {
      dishDragId = null;
    } else if (e.pointerId === bottleHoldId) {
      bottleHoldId = null;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- 石けんの粒 ---------------- */

  /* ボトルの液中をのぼる気泡 */
  function spawnBubble() {
    if (bubbles.length >= 6) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), foamMat);
    m.position.set(U.rand(-8, 8), 14, U.rand(-8, 8));
    scene.add(m);
    bubbles.push({ m });
  }

  /* 押す速さ (+残圧) → 圧力。飛距離・音・出かたがすべて連続的に変わる */
  function pressNorm() {
    return U.clamp(stroke.v / 55, 0.1, 1.6) * (1 + pressure * 0.5);
  }

  function spawnBlob() {
    const vn = pressNorm();
    const r = 3 + vn * 1.8;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), liquidMat);
    m.castShadow = true;
    m.position.set(EXIT.x, EXIT.y - stroke.p, 0);
    scene.add(m);
    if (vn < 0.28) {
      /* ゆっくり押すと、しずくがノズル先にぶら下がってから落ちる */
      blobs.push({ m, r, vx: 2, vy: 0, vz: 0, cling: 0.45 });
    } else {
      blobs.push({ m, r, vx: 4 + 55 * vn * vn, vy: -50 - vn * 60, vz: (vn - 0.6) * 3, cling: 0 });
    }
    S.squishReal(0.35 + vn * 0.45);
    /* 残圧が乗っていると泡まじりになる */
    if (pressure > 0.45) {
      for (let i = 0; i < 2; i++) {
        const fm = new THREE.Mesh(new THREE.SphereGeometry(1.6 + i * 0.5, 10, 8), foamMat);
        fm.position.copy(m.position);
        scene.add(fm);
        blobs.push({ m: fm, r: 1.8, vx: 6 + 60 * vn * vn + i * 14, vy: -40 - vn * 50 - i * 20, vz: (i - 0.5) * 8, cling: 0 });
      }
    }
  }

  function landBlob(b) {
    /* 近くの石けんと合体して育つ。なければ新しく積もる */
    let best = null, bd = 1e9;
    for (const q of pile) {
      const d = Math.hypot(q.m.position.x - b.m.position.x, q.m.position.z - b.m.position.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (best && bd < 11) {
      best.s = Math.min(2.5, best.s + b.r * 0.1);
      best.m.scale.set(best.s * 1.3, best.s * 0.5, best.s * 1.3);
      best.m.position.y = 4.5 + best.s * 2;
      scene.remove(b.m);
      b.m.geometry.dispose();
      S.plip(U.clamp(1.25 - best.s * 0.3, 0.5, 1.2));
    } else {
      const px = U.clamp(b.m.position.x, dishPos.x - 14, dishPos.x + 14);
      const pz = U.clamp(b.m.position.z, dishPos.z - 14, dishPos.z + 14);
      b.m.position.set(px, 4.5 + b.r * 0.5, pz);
      b.m.scale.set(1.3, 0.5, 1.3);
      pile.push({ m: b.m, s: 1, runoff: false });
      S.plip();
    }
    /* 皿がいっぱいになると、いちばん古い石けんが縁からあふれて垂れる */
    const mass = pile.reduce((a, q) => a + q.s * q.s, 0);
    if (mass > 15 && pile.length && !pile[0].runoff) pile[0].runoff = true;
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    /* タップのフルポンプは押し切ってから自動で戻る */
    if (fullPump && stroke.p > STROKE_MAX - 1) {
      fullPump = false;
      stroke.t = 0;
    }

    U.stepSpring(stroke, dt, 300, 22);   /* 実物のポンプらしい、ぬるっとしたストローク */
    headG.position.y = -stroke.p;

    /* 連続で全力ポンプすると残圧が乗る (1発ごとに強くなる) */
    pressure *= Math.exp(-dt * 0.7);

    /* 押し下げ → 吐出 */
    const pushing = stroke.v > 4 && stroke.p > 1;
    if (pushing && stroke.p > 10) pressure = Math.min(1, pressure + dt * 2.4);
    if (pushing && charge > 0) {
      emitT -= dt;
      if (emitT <= 0) {
        emitT = 0.07;
        sputterN++;
        if (level < 0.2 && sputterN % 2 === 0) {
          /* 残りわずか: 管が空気を吸ってスパスパいう */
          S.sputter();
          spawnBubble();
        } else {
          spawnBlob();
        }
        charge = Math.max(0, charge - 0.14);
      }
    }
    outletOpen += ((pushing && charge > 0 ? 1 : 0) - outletOpen) * Math.min(1, dt * 14);
    outletBall.position.x = 12 + outletOpen * 3.5;

    /* 戻り → 吸い上げ (残量が少ないほど補充が遅い) */
    const suckRate = 1.7 * U.clamp((level - 0.13) / 0.25, 0.12, 1);
    const sucking = stroke.v < -4 && charge < 1 && level > 0.14;
    if (sucking) {
      charge = Math.min(1, charge + dt * suckRate);
      level = Math.max(0.13, level - dt * 0.02);
      if (!suckPlayed) { suckPlayed = true; S.glug(); }
    }

    /* ボトル長押しでつめかえ */
    if (bottleHoldId !== null && level < 1) {
      level = Math.min(1, level + dt * 0.3);
      glugT -= dt;
      if (glugT <= 0) {
        glugT = 0.4;
        S.glug();
        spawnBubble();
      }
    }

    /* ボトル内をのぼる気泡 */
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const bb = bubbles[i];
      bb.m.position.y += 90 * dt;
      bb.m.position.x += Math.sin(time * 6 + i) * 6 * dt;
      if (bb.m.position.y > 5 + level * 100 - 4) {
        scene.remove(bb.m);
        bb.m.geometry.dispose();
        bubbles.splice(i, 1);
      }
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
      if (b.cling > 0) {
        /* ノズル先にぶら下がって育つしずく */
        b.cling -= dt;
        b.m.position.set(EXIT.x + 1, EXIT.y - stroke.p - b.r * 0.4, 0);
        const g = 1 - b.cling / 0.45;
        b.m.scale.set(0.6 + g * 0.5, 0.7 + g * 0.65, 0.6 + g * 0.5);
        continue;
      }
      b.vy -= 3000 * dt;
      b.m.position.x += b.vx * dt;
      b.m.position.y += b.vy * dt;
      b.m.position.z += b.vz * dt;
      /* 落下中はしずく形にのびる */
      const st = U.clamp(1 - b.vy / 900, 1, 1.6);
      b.m.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
      const p = b.m.position;
      const overDish = Math.hypot(p.x - dishPos.x, p.z - dishPos.z) < 19;
      if (overDish && p.y < 9) {
        blobs.splice(i, 1);
        landBlob(b);
      } else if (p.y < b.r * 0.4 + 1) {
        /* カウンターに落ちたぶんは平たく残り、だんだん乾いて色が濃くなる */
        blobs.splice(i, 1);
        b.m.position.y = 1.2;
        b.m.scale.set(1.9, 0.16, 1.9);
        b.m.material = b.m.material.clone();
        splats.push({ m: b.m, age: 0 });
        S.plip(0.8);
      }
    }

    /* 皿からあふれた石けんが縁を伝ってカウンターへ垂れる */
    for (let i = pile.length - 1; i >= 0; i--) {
      const q = pile[i];
      if (!q.runoff) continue;
      let dx = q.m.position.x - dishPos.x, dz = q.m.position.z - dishPos.z;
      const dl = Math.hypot(dx, dz);
      if (dl < 0.5) { dx = 1; dz = 0; }
      else { dx /= dl; dz /= dl; }
      q.m.position.x += dx * 26 * dt;
      q.m.position.z += dz * 26 * dt;
      q.m.position.y = Math.max(1.4, q.m.position.y - 14 * dt);
      if (Math.hypot(q.m.position.x - dishPos.x, q.m.position.z - dishPos.z) > 21) {
        pile.splice(i, 1);
        q.m.position.y = 1.2;
        q.m.scale.set(q.s * 1.8, 0.18, q.s * 1.8);
        q.m.material = q.m.material.clone();
        splats.push({ m: q.m, age: 0 });
        S.plip(0.55);
      }
    }

    /* カウンターの液だまり: 乾いて色が濃くツヤが消えて残る (多すぎたら古い順に消える) */
    const dryCol = new THREE.Color(0x9c5c0a);
    const over = splats.length - 20;
    for (let i = splats.length - 1; i >= 0; i--) {
      const q = splats[i];
      q.age += dt;
      if (q.age < 7) {
        q.m.material.color.lerp(dryCol, dt * 0.22);
        q.m.material.roughness = Math.min(0.68, q.m.material.roughness + dt * 0.07);
        if (q.m.material.clearcoat !== undefined) {
          q.m.material.clearcoat = Math.max(0, q.m.material.clearcoat - dt * 0.1);
        }
      }
      if (over > 0 && i < over) {
        q.m.scale.multiplyScalar(1 - dt * 1.5);
        if (q.m.scale.x < 0.05) {
          scene.remove(q.m);
          q.m.geometry.dispose();
          q.m.material.dispose();
          splats.splice(i, 1);
        }
      }
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
      stroke = U.spring(0);
      pressing = false; pressId = null; orbitId = null;
      pressT0 = 0; pressMoved = 0; fullPump = false;
      dishDragId = null; bottleHoldId = null; glugT = 0;
      level = 0.8; charge = 1; emitT = 0; suckPlayed = false;
      inletOpen = 0; outletOpen = 0; pressure = 0; sputterN = 0;
      blobs = []; pile = []; splats = []; bubbles = [];

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

      /* 4歳向けガイド: ヘッドを押す */
      GUIDE.start(stage3, [
        { kind: 'hold', at: () => headHit, done: () => pile.length > 0 || splats.length > 0 },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
