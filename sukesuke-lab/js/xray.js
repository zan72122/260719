/* レントゲン — 写実3D
 *
 * 病院で「はい、うごかないでね」の機械。中身 (ほね) がスケスケに写る。
 * 連鎖: 人形を台に寝かせる → 位置をあわせる → ボタン → チャージ音 →
 *       カシャッと照射 → フィルムが現像されてほねの写真が出てくる →
 *       シャウカステン (光る掲示板) にはって光る
 * 分岐: 人形の位置で写る部位が変わる (あたま/むね/あし) × おもちゃのカギを
 *       ポケットに入れると写真に写りこむ × 写真はどんどんたまる。
 */
window.GAMES.xray = (() => {
  let stage3, scene, raf, prev, time;
  let tableG, tubeG, tubeLamp, doll, toy, toyOnDoll, consoleBtn, lightbox, films;
  let charging, chargeT, flashT, shotsN, filmOut, filmMesh;
  let dragObj, dragId, orbitId, orbitFrom;
  let hum, mats;

  const TABLE_Y = 260;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#dfe8ea', '#eef4f4', '#a8bcc0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshStandardMaterial({ color: 0xc8d0d2, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(800, 1800, 1400), shadowSpan: 1400, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2800, 1500, 30),
      new THREE.MeshStandardMaterial({ color: 0xdce8e4, roughness: 0.7 }), 0, 750, -520);

    /* --- 撮影台 --- */
    tableG = new THREE.Group();
    tableG.position.set(-60, 0, -60);
    scene.add(tableG);
    const tm = new THREE.MeshPhysicalMaterial({ color: 0xe8ecf0, roughness: 0.3, clearcoat: 0.4 });
    G3.add(tableG, new THREE.BoxGeometry(760, 40, 300), tm, 0, TABLE_Y, 0).castShadow = true;
    G3.add(tableG, new THREE.BoxGeometry(160, TABLE_Y, 200),
      new THREE.MeshStandardMaterial({ color: 0xb8c2c8, roughness: 0.5 }), 0, TABLE_Y / 2, 0);
    /* 台の下のフィルムカセット (断面でチラ見え) */
    G3.add(tableG, new THREE.BoxGeometry(300, 24, 240), mats.darkPlastic, 0, TABLE_Y - 40, 0);

    /* --- X線管ヘッド (上から吊り) --- */
    tubeG = new THREE.Group();
    tubeG.position.set(-60, 0, -60);
    scene.add(tubeG);
    G3.add(tubeG, new THREE.CylinderGeometry(18, 18, 560, 10), mats.steel, 0, 830, 0);
    const head = new THREE.Group();
    head.position.y = 560;
    tubeG.add(head);
    G3.add(head, new THREE.BoxGeometry(220, 150, 190),
      new THREE.MeshPhysicalMaterial({ color: 0xd8dde4, roughness: 0.3, clearcoat: 0.4 }), 0, 0, 0).castShadow = true;
    G3.add(head, new THREE.CylinderGeometry(70, 90, 70, 14),
      new THREE.MeshStandardMaterial({ color: 0x3c4248, roughness: 0.5 }), 0, -100, 0);
    tubeLamp = G3.add(head, new THREE.CylinderGeometry(56, 74, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x303438, emissive: 0x000000 }), 0, -140, 0);
    /* X印マーク */
    const xm = new THREE.MeshStandardMaterial({ color: 0xd84040, roughness: 0.5 });
    G3.add(head, new THREE.BoxGeometry(90, 14, 14), xm, 0, 80, 100).rotation.z = 0.6;
    G3.add(head, new THREE.BoxGeometry(90, 14, 14), xm, 0, 80, 100).rotation.z = -0.6;

    /* --- 人形 (寝かせる) --- */
    doll = G3.doll({ shirt: 0x4a9ad8 });
    doll.g.position.set(340, 0, 330);
    scene.add(doll.g);
    window.__pts.xdoll = doll.g;

    /* --- おもちゃのカギ --- */
    toy = new THREE.Group();
    toy.position.set(160, 30, 420);
    scene.add(toy);
    G3.add(toy, new THREE.TorusGeometry(22, 9, 8, 12), mats.brass, 0, 0, 0);
    G3.add(toy, new THREE.BoxGeometry(60, 12, 8), mats.brass, 44, 0, 0);
    G3.add(toy, new THREE.BoxGeometry(14, 22, 8), mats.brass, 62, -12, 0);
    window.__pts.toy = toy;

    /* --- コンソール (ボタン) --- */
    const con = new THREE.Group();
    con.position.set(-430, 0, 300);
    scene.add(con);
    G3.add(con, new THREE.BoxGeometry(200, 240, 160),
      new THREE.MeshStandardMaterial({ color: 0x7a8890, roughness: 0.5 }), 0, 120, 0).castShadow = true;
    const conTop = G3.add(con, new THREE.BoxGeometry(210, 30, 170),
      new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.5 }), 0, 255, 0);
    conTop.rotation.x = -0.3;
    consoleBtn = G3.add(con, new THREE.CylinderGeometry(40, 46, 26, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xe8b020, roughness: 0.3, clearcoat: 0.6 }), 0, 285, 10);
    consoleBtn.rotation.x = -0.3;
    window.__pts.shoot = consoleBtn;

    /* --- シャウカステン (光る掲示板) --- */
    lightbox = new THREE.Group();
    lightbox.position.set(330, 620, -500);
    scene.add(lightbox);
    G3.add(lightbox, new THREE.BoxGeometry(560, 420, 30),
      new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.5 }), 0, 0, 0);
    G3.add(lightbox, new THREE.PlaneGeometry(520, 380),
      new THREE.MeshBasicMaterial({ color: 0xdfe8f0 })).position.z = 17;
    window.__pts.lightbox = lightbox;
    films = new THREE.Group();
    scene.add(films);
  }

  /* ほねの写真を描く: 人形の位置から写る部位を決める */
  function renderXray() {
    const cv = document.createElement('canvas');
    cv.width = 220;
    cv.height = 300;
    const c = cv.getContext('2d');
    c.fillStyle = '#0c1420';
    c.fillRect(0, 0, 220, 300);
    /* 台の中心と人形の位置ずれ → 写る部位 (dx=長軸方向) */
    const dx = doll.g.position.x - (-60);
    const dz = doll.g.position.z - (-60);
    /* 人形は仰向け (頭が -x 側)。中心のずれで頭〜足のどこが写るか */
    const center = U.clamp(dx / 90, -2, 2); /* -2=頭側 2=あし側 */
    const oz = U.clamp(-dz * 1.2, -80, 80);
    c.save();
    c.translate(110 + oz, 150 - center * 95);
    c.strokeStyle = '#cfe0ea';
    c.fillStyle = '#cfe0ea';
    c.lineWidth = 7;
    c.lineCap = 'round';
    /* 頭がい骨 */
    c.beginPath();
    c.arc(0, -120, 38, 0, Math.PI * 2);
    c.stroke();
    c.fillRect(-12, -92, 24, 18);
    /* 背骨 */
    for (let i = 0; i < 7; i++) c.fillRect(-8, -62 + i * 22, 16, 13);
    /* ろっ骨 */
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(0, -40 + i * 20, 46 - i * 3, 12, 0, 0, Math.PI * 2);
      c.stroke();
    }
    /* うで */
    c.beginPath(); c.moveTo(-46, -50); c.lineTo(-72, 30); c.stroke();
    c.beginPath(); c.moveTo(46, -50); c.lineTo(72, 30); c.stroke();
    /* こし */
    c.beginPath();
    c.ellipse(0, 96, 40, 22, 0, 0, Math.PI);
    c.stroke();
    /* あし */
    c.beginPath(); c.moveTo(-22, 112); c.lineTo(-26, 210); c.stroke();
    c.beginPath(); c.moveTo(22, 112); c.lineTo(26, 210); c.stroke();
    /* おもちゃのカギ (ポケットの中) */
    if (toyOnDoll) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(28, 40, 12, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.fillRect(38, 36, 30, 7);
      c.fillRect(60, 40, 7, 12);
    }
    c.restore();
    /* ふちどり */
    c.strokeStyle = '#3a4a5a';
    c.lineWidth = 8;
    c.strokeRect(4, 4, 212, 292);
    return cv;
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
    if (near(consoleBtn, 90)) {
      const onTable = Math.abs(doll.g.position.x + 60) < 340 && Math.abs(doll.g.position.z + 60) < 160 && doll.g.userData.lying;
      if (!charging && flashT <= 0 && onTable) {
        charging = true;
        chargeT = 0;
        S.clickReal(0.9);
      } else if (!onTable) {
        S.buzz();
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (filmOut && near(filmMesh, 150)) {
      dragObj = 'film';
      dragId = e.pointerId;
      S.plip(1.5);
      return;
    }
    if (near(toy, 90, 10)) {
      dragObj = 'toy';
      dragId = e.pointerId;
      toyOnDoll = false;
      S.plip(1.7);
      return;
    }
    if (near(doll.g, 130, 60)) {
      dragObj = 'doll';
      dragId = e.pointerId;
      S.plip(1.3);
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
      const t = ((dragObj === 'film' ? 500 : 320) - o.y) / d.y;
      if (t > 0) {
        const p = new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t);
        if (dragObj === 'doll') {
          doll.g.position.set(U.clamp(p.x, -520, 520), doll.g.position.y, U.clamp(p.z, -420, 520));
        } else if (dragObj === 'toy') {
          toy.position.set(p.x, 40, p.z);
        } else if (dragObj === 'film') {
          filmMesh.position.set(p.x, 500, p.z);
        }
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.8, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId && dragObj) {
      if (dragObj === 'doll') {
        const p = doll.g.position;
        const overTable = Math.abs(p.x + 60) < 380 && Math.abs(p.z + 60) < 180;
        if (overTable) {
          /* 台の上に寝かせる */
          doll.g.position.y = TABLE_Y + 40;
          doll.g.rotation.x = -Math.PI / 2;
          doll.g.userData.lying = true;
          S.squishReal(0.4);
        } else {
          doll.g.position.y = 0;
          doll.g.rotation.x = 0;
          doll.g.userData.lying = false;
        }
      } else if (dragObj === 'toy') {
        const dv = doll.g.position;
        if (Math.hypot(toy.position.x - dv.x, toy.position.z - dv.z) < 150) {
          toyOnDoll = true;
          toy.position.set(dv.x + 30, doll.g.userData.lying ? TABLE_Y + 62 : 90, dv.z + 20);
          S.kachi();
        }
      } else if (dragObj === 'film') {
        const lv = new THREE.Vector3();
        lightbox.getWorldPosition(lv);
        if (Math.hypot(filmMesh.position.x - lv.x, filmMesh.position.z - lv.z) < 320) {
          /* シャウカステンにはる */
          const i = films.children.length;
          filmMesh.position.set(lv.x - 160 + (i % 3) * 160, lv.y + (i % 2) * -40, lv.z + 40 + i * 2);
          filmMesh.rotation.set(0, 0, ((i * 31) % 8 - 4) * 0.03);
          films.add(filmMesh);
          filmOut = false;
          filmMesh = null;
          S.kachi();
          S.sparkle();
          S.yay();
        }
      }
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

    if (charging) {
      chargeT += dt;
      if (hum) hum.set(0.2 + chargeT * 0.3);
      tubeLamp.material.emissive.setRGB(chargeT * 0.3, chargeT * 0.15, 0);
      if (Math.floor(chargeT * 6) !== Math.floor((chargeT - dt) * 6)) S.tick();
      if (chargeT > 1.8) {
        charging = false;
        flashT = 0.4;
        shotsN++;
        S.shutterClack();
        S.beepScan();
        if (hum) hum.set(0.05);
        /* フィルムが台の下から出てくる */
        const cv = renderXray();
        filmMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 330),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
        filmMesh.rotation.x = -Math.PI / 2 + 0.15;
        filmMesh.position.set(-60, TABLE_Y - 60, 220);
        scene.add(filmMesh);
        filmOut = true;
        window.__pts.film = filmMesh;
        S.printFeed(0.8);
      }
    }
    if (flashT > 0) {
      flashT -= dt;
      tubeLamp.material.emissive.setRGB(flashT > 0.2 ? 2 : 0.3, flashT > 0.2 ? 1.6 : 0.15, flashT > 0.2 ? 1.2 : 0);
    } else if (!charging) {
      tubeLamp.material.emissive.setRGB(0, 0, 0);
    }

    if (window.__dbgXR) window.__dbgXR({
      lying: !!doll.g.userData.lying, dollX: doll.g.position.x | 0, dollZ: doll.g.position.z | 0,
      toy: toyOnDoll, charging, shots: shotsN, filmOut, films: films.children.length,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      charging = false; chargeT = 0; flashT = 0; shotsN = 0;
      filmOut = false; filmMesh = null; toyOnDoll = false;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-30, 380, -40),
        radius: 1550, radiusPortraitBase: 1800, radiusMaxPortrait: 2950,
        az: 0.14, po: 1.05,
      });
      build();
      doll.g.userData.lying = false;
      hum = S.humLoop();
      hum.set(0.05);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: 人形を台へ → ボタン → フィルムをシャウカステンへ */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => doll.g, to: () => new THREE.Vector3(-60, TABLE_Y + 60, -60),
          when: () => !doll.g.userData.lying && !filmOut,
          done: () => !!doll.g.userData.lying,
        },
        {
          kind: 'tap', at: () => consoleBtn,
          when: () => !!doll.g.userData.lying && !charging && !filmOut,
          done: () => charging || filmOut,
        },
        {
          kind: 'drag', at: () => (filmMesh || lightbox), to: () => lightbox,
          when: () => filmOut,
          done: () => !filmOut && films.children.length > 0,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (hum) hum.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
