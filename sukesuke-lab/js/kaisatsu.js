/* 自動改札機 — 写実3D (断面)
 *
 * 毎日通るのに中は絶対に見られない機械。左の筐体を断面にして、
 * 切符が中を走り抜けるようすを見せる。
 * 連鎖: 切符を差す → ローラーが吸い込む → ベルトで高速搬送 →
 *       ひっくり返し機構で向きが揃う → スタンプがガチャン → 出口から飛び出す →
 *       フラップが開く → スーツケースが通り抜ける
 * 分岐: どの切符か (期限切れは警告して突き返される) × 投入タイミング ×
 *       連続投入で中を切符が追いかけっこ
 */
window.GAMES.kaisatsu = (() => {
  /* 搬送パス (筐体ローカル: x=進行方向, y=高さ) */
  const PATH = [
    [-150, 250], [-150, 190], [-100, 160], [100, 160], [150, 190], [150, 250],
  ];

  let stage3, scene, raf, prev, time;
  let bodyG, rollers, stampG, flapL, flapR, lampMat, tickets, suitcase;
  let dragTicket, dragId, orbitId, orbitFrom;
  let flapOpen, alarmT, caseT, servo, mats, dummy;

  function pathPoint(t) {
    /* t: 0..1 をパスに沿って補間 */
    const seg = t * (PATH.length - 1);
    const i = Math.min(PATH.length - 2, Math.floor(seg));
    const f = seg - i;
    return {
      x: U.lerp(PATH[i][0], PATH[i + 1][0], f),
      y: U.lerp(PATH[i][1], PATH[i + 1][1], f),
    };
  }

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#d0d8dc', '#dce2e4', '#b0b4b8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0xc8c4b8, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(600, 1500, 900), shadowSpan: 900, intensity: 0.9 });

    /* --- 改札の筐体2本 (左は断面) --- */
    const shell = new THREE.MeshPhysicalMaterial({ color: 0xe8e6e0, roughness: 0.35, clearcoat: 0.4 });
    bodyG = new THREE.Group();
    bodyG.position.set(0, 0, -40);
    scene.add(bodyG);
    /* 左筐体: 奥半分だけの箱 (手前が切れて中が見える) */
    G3.add(bodyG, new THREE.BoxGeometry(420, 16, 60), shell, 0, 292, -30).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(420, 280, 12), shell, 0, 150, -60);
    G3.add(bodyG, new THREE.BoxGeometry(16, 280, 60), shell, -210, 150, -30);
    G3.add(bodyG, new THREE.BoxGeometry(16, 280, 60), shell, 210, 150, -30);
    /* スロット (入口/出口) */
    const slotM = new THREE.MeshStandardMaterial({ color: 0x303438, roughness: 0.6 });
    G3.add(bodyG, new THREE.BoxGeometry(70, 10, 30), slotM, -150, 296, -20);
    G3.add(bodyG, new THREE.BoxGeometry(70, 10, 30), slotM, 150, 296, -20);
    /* 右の相方筐体 (閉じたまま) */
    G3.add(scene, new THREE.BoxGeometry(420, 300, 70), shell, 0, 150, 210).castShadow = true;
    /* 案内ランプ */
    lampMat = new THREE.MeshBasicMaterial({ color: 0x30c060 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 6, 12), lampMat);
    lamp.position.set(-180, 300, -20);
    lamp.rotation.x = Math.PI / 2;
    bodyG.add(lamp);

    /* ベルトとローラー */
    const beltM = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.8 });
    G3.add(bodyG, new THREE.BoxGeometry(210, 8, 40), beltM, 0, 150, -30);
    rollers = [];
    for (let i = 0; i < 6; i++) {
      const r = G3.add(bodyG, new THREE.CylinderGeometry(16, 16, 40, 12), mats.chrome, -125 + i * 50, 172, -30);
      r.rotation.x = Math.PI / 2;
      rollers.push(r);
    }
    /* スタンプ */
    stampG = new THREE.Group();
    stampG.position.set(60, 226, -30);
    bodyG.add(stampG);
    G3.add(stampG, new THREE.CylinderGeometry(14, 14, 44, 10), mats.steel, 0, 0, 0);
    G3.add(stampG, new THREE.BoxGeometry(36, 12, 30), mats.darkPlastic, 0, -28, 0);

    /* フラップドア (左右の筐体から通路の中央へ) */
    const flapM = new THREE.MeshPhysicalMaterial({ color: 0x30b860, roughness: 0.4, clearcoat: 0.4 });
    flapL = G3.add(scene, new THREE.BoxGeometry(14, 120, 100), flapM, 190, 190, 10);
    flapR = G3.add(scene, new THREE.BoxGeometry(14, 120, 100), flapM, 190, 190, 125);
    flapL.castShadow = true;
    flapR.castShadow = true;

    /* --- 中の細部: 制御基板・モーター・ガイドレール・センサー --- */
    const pcb = G3.add(bodyG, new THREE.BoxGeometry(120, 80, 6),
      new THREE.MeshStandardMaterial({ color: 0x1d6b3c, roughness: 0.6 }), -100, 80, -56);
    for (let i = 0; i < 6; i++) {
      G3.add(bodyG, new THREE.BoxGeometry(14, 10, 5),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x222 : 0x888, roughness: 0.5 }),
        -140 + i * 18, 70 + (i % 3) * 22, -52);
    }
    const motor = G3.add(bodyG, new THREE.CylinderGeometry(28, 28, 70, 16), mats.steel, 120, 90, -30);
    motor.rotation.z = Math.PI / 2;
    G3.add(bodyG, new THREE.CylinderGeometry(8, 8, 60, 10), mats.brass, 120, 130, -30);
    /* ガイドレール2本 (切符の通り道を挟む) */
    const railM = new THREE.MeshStandardMaterial({ color: 0x9098a0, metalness: 0.8, roughness: 0.3 });
    G3.add(bodyG, new THREE.BoxGeometry(200, 4, 34), railM, 0, 140, -30);
    G3.add(bodyG, new THREE.BoxGeometry(200, 4, 34), railM, 0, 186, -30);
    /* 期限チェックのセンサー (赤い光) */
    G3.add(bodyG, new THREE.BoxGeometry(10, 26, 34),
      new THREE.MeshBasicMaterial({ color: 0xd83030 }), 28, 200, -30);

    /* --- 外装のアクセント (青緑の帯と黒い天面) --- */
    const accentM = new THREE.MeshPhysicalMaterial({ color: 0x00867d, roughness: 0.3, clearcoat: 0.5 });
    const topM = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.4 });
    G3.add(bodyG, new THREE.BoxGeometry(420, 40, 4), accentM, 0, 60, 1);
    G3.add(scene, new THREE.BoxGeometry(420, 40, 4), accentM, 0, 60, 173);
    G3.add(scene, new THREE.BoxGeometry(420, 14, 66), topM, 0, 307, 210);
    /* IC タッチ部 (青く光る) */
    G3.add(scene, new THREE.CylinderGeometry(34, 38, 8, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x2a6ad8, roughness: 0.25, clearcoat: 0.6 }), 60, 310, 210);

    /* --- 切符2枚 (ふつう / 期限切れ) --- */
    tickets = [];
    [[0xfff8e8, false, -120], [0xd8d0c0, true, 0]].forEach(([col, expired, x]) => {
      const g = new THREE.Group();
      const t = G3.add(g, new THREE.BoxGeometry(80, 3, 50),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }), 0, 0, 0);
      t.castShadow = true;
      G3.add(g, new THREE.BoxGeometry(80, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: expired ? 0xc04040 : 0xe88030, roughness: 0.7 }), 0, 0.4, -16);
      g.position.set(x, 84, 360);
      scene.add(g);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(g.position);
      scene.add(hit);
      tickets.push({ g, hit, expired, home: g.position.clone(), state: 'tray', t: 0, dir: 1 });
    });
    /* 台 */
    G3.add(scene, new THREE.BoxGeometry(320, 70, 140),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.8 }), -60, 40, 360);

    /* スーツケース */
    suitcase = new THREE.Group();
    suitcase.position.set(-320, 0, 80);
    scene.add(suitcase);
    G3.add(suitcase, new THREE.BoxGeometry(90, 130, 50),
      new THREE.MeshPhysicalMaterial({ color: 0xb04870, roughness: 0.4, clearcoat: 0.5 }), 0, 100, 0).castShadow = true;
    G3.add(suitcase, new THREE.BoxGeometry(10, 40, 8), mats.chrome, 0, 180, 0);
    [[-30], [30]].forEach(([x]) => {
      G3.add(suitcase, new THREE.CylinderGeometry(12, 12, 10, 10), mats.darkPlastic, x, 14, 20).rotation.x = Math.PI / 2;
    });

    dummy = new THREE.Object3D();
    window.__pts.ticket0 = tickets[0].hit;
    window.__pts.ticket1 = tickets[1].hit;
    window.__pts.slotIn = { getWorldPosition: v => v.set(-150, 300, -60) };
  }

  /* ---------------- 入力 ---------------- */

  function onDown(e) {
    const ray = stage3.setRay(e);
    for (const t of tickets) {
      if (t.state === 'tray' && dragTicket === null && ray.intersectObject(t.hit, false).length) {
        dragTicket = t;
        dragId = e.pointerId;
        return;
      }
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragTicket && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (300 - o.y) / d.y;
      if (t > 0) {
        dragTicket.g.position.set(o.x + d.x * t, 300, o.z + d.z * t);
        /* 入口スロットへ */
        if (Math.hypot(dragTicket.g.position.x + 150, dragTicket.g.position.z + 20) < 70) {
          dragTicket.state = 'in';
          dragTicket.t = 0;
          dragTicket.dir = 1;
          S.ratchet(0.9);
          servo.set(0.6);
          dragTicket = null;
          dragId = null;
        }
      }
    } else if (e.pointerId === orbitId) {
      stage3.orbit.az = U.clamp(orbitFrom.az - (e.clientX - orbitFrom.x) * 0.005, -0.6, 1.1);
      stage3.orbit.po = U.clamp(orbitFrom.po - (e.clientY - orbitFrom.y) * 0.003, 0.6, 1.4);
    }
  }

  function onUp(e) {
    if (dragTicket && e.pointerId === dragId) {
      dragTicket.g.position.copy(dragTicket.home);
      dragTicket = null;
      dragId = null;
    } else if (e.pointerId === orbitId) {
      orbitId = null;
    }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.033);
    prev = now;
    time += dt;

    let transporting = false;
    for (const tk of tickets) {
      if (tk.state !== 'in') continue;
      transporting = true;
      /* 前の切符と間隔を保つ */
      let ahead = 1e9;
      for (const o of tickets) {
        if (o !== tk && o.state === 'in' && o.t > tk.t) ahead = Math.min(ahead, o.t - tk.t);
      }
      const speed = ahead < 0.12 ? 0.05 : 0.45;
      tk.t += speed * dt * tk.dir;

      /* 期限切れはセンサーで弾かれて逆走 */
      if (tk.expired && tk.dir > 0 && tk.t > 0.42) {
        tk.dir = -1;
        alarmT = 1.2;
        S.buzz();
      }
      /* スタンプ位置 */
      if (!tk.expired && !tk.stamped && tk.t > 0.62) {
        tk.stamped = true;
        stampG.userData.hitT = 1;
        S.stamp();
      }
      if (tk.t >= 1) {
        /* 出口スロットから頭を出して止まる (実物と同じ受け取り) */
        tk.state = 'tray';
        tk.stamped = false;
        tk.g.position.set(150, 305, -55);
        tk.g.rotation.set(0, 0, 0);
        tk.hit.position.copy(tk.g.position);
        tk.home = tk.g.position.clone();
        flapOpen = 2.6;
        caseT = 0.01;   /* スーツケースが通る */
        S.whoosh(0.5);
        S.ding();
        continue;
      }
      if (tk.t <= 0) {
        /* 突き返し: 入口スロットに戻ってくる */
        tk.state = 'tray';
        tk.g.position.set(-150, 305, -55);
        tk.hit.position.copy(tk.g.position);
        tk.home = tk.g.position.clone();
        continue;
      }
      const p = pathPoint(tk.t);
      tk.g.position.set(p.x, p.y, -70);
      /* ひっくり返し機構: 中間で1回転して向きが揃う */
      tk.g.rotation.z = tk.t > 0.3 && tk.t < 0.55 ? (tk.t - 0.3) / 0.25 * Math.PI : (tk.t >= 0.55 ? Math.PI : 0);
      tk.g.rotation.x = 0.15;
      tk.hit.position.copy(tk.g.position);
    }
    if (!transporting) servo.set(0);
    rollers.forEach(r => { r.rotation.y += (transporting ? 9 : 0) * dt; });

    /* スタンプの動き */
    stampG.userData.hitT = Math.max(0, (stampG.userData.hitT || 0) - dt * 4);
    stampG.position.y = 226 - (stampG.userData.hitT || 0) * 40;

    /* フラップとスーツケース */
    flapOpen = Math.max(0, flapOpen - dt);
    const fo = flapOpen > 0 ? 1 : 0;
    flapL.rotation.y += ((fo ? 1.3 : 0) - flapL.rotation.y) * Math.min(1, dt * 6);
    flapR.rotation.y += ((fo ? -1.3 : 0) - flapR.rotation.y) * Math.min(1, dt * 6);
    if (caseT > 0) {
      caseT += dt * 0.5;
      suitcase.position.x = U.lerp(-320, 420, Math.min(1, caseT));
      suitcase.position.z = 80;
      suitcase.children[0].rotation.z = Math.sin(time * 9) * 0.02;
      if (caseT >= 1.6) {
        caseT = 0;
        suitcase.position.x = -320;
      }
    }

    /* 警告ランプ */
    if (alarmT > 0) {
      alarmT -= dt;
      lampMat.color.set(Math.floor(time * 8) % 2 ? 0xd83030 : 0x702020);
    } else {
      lampMat.color.set(0x30c060);
    }

    if (window.__dbgKS) window.__dbgKS({
      t0: +tickets[0].t.toFixed(2), s0: tickets[0].state,
      t1: +tickets[1].t.toFixed(2), s1: tickets[1].state, flap: flapOpen > 0,
    });
    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 起動と後始末 ---------------- */

  return {
    start(el) {
      time = 0;
      dragTicket = null; dragId = null; orbitId = null;
      flapOpen = 0; alarmT = 0; caseT = 0;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-20, 150, 60),
        radius: 1350, radiusPortraitBase: 1200, radiusMaxPortrait: 2000,
        az: 0.35, po: 0.88,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: 切符をスロットへ */
      let gdIn = false;
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => tickets[0].hit, to: () => window.__pts.slotIn,
          when: () => tickets[0].state === 'tray',
          done: () => (gdIn = gdIn || tickets.some(t => t.state === 'in')),
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (servo) servo.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
