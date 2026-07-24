/* ミシン — 写実3D (断面)
 *
 * おかあさん・おばあちゃんの魔法の機械。針の下でなにが起きているのか、
 * ふところとボビンケースを断面にして「上糸と下糸が絡む瞬間」を見せる。
 * 連鎖: 布をおさえの下へ → ペダルを踏む(長押し) → はずみ車が回る →
 *       クランクが針棒を上下 → 針が布を貫く → 下の釜がくるっと回って
 *       上糸の輪をつかまえる → 送り歯が布を進める → 縫い目が1針ずつ増える
 * 分岐: 布をドラッグで左右にあやつる → 縫い目の線がそのままカーブする ×
 *       速さ × 糸の色。縫った布はテーブルに残る。
 */
window.GAMES.mishin = (() => {
  let stage3, scene, raf, prev, time;
  let bodyG, needleBar, presser, flywheel, hookG, feedDog, pedalBtn, spools;
  let clothG, clothCv, clothCtx, clothTex, threadCol;
  let sewing, needlePhase, clothX, clothZoff, stitchCount, lastStitchUV;
  let dragMode, dragId, orbitId, orbitFrom;
  let servo, mats;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#ecdfd4', '#f4ece2', '#c0ac98');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xb09a78, roughness: 0.65 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -300;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(700, 1600, 1200), shadowSpan: 1000, intensity: 0.95 });

    /* 作業テーブル */
    G3.add(scene, new THREE.BoxGeometry(1500, 40, 900),
      new THREE.MeshStandardMaterial({ color: 0xd8c4a0, roughness: 0.5 }), 0, -20, 100).receiveShadow = true;

    /* --- ミシン本体 (コの字) --- */
    bodyG = new THREE.Group();
    scene.add(bodyG);
    const shellM = new THREE.MeshPhysicalMaterial({ color: 0xe8e6f0, roughness: 0.25, clearcoat: 0.6 });
    /* ベッド (下) */
    G3.add(bodyG, new THREE.BoxGeometry(620, 70, 260), shellM, 0, 35, 0).castShadow = true;
    /* 柱 (右) とアーム (上) */
    G3.add(bodyG, new THREE.BoxGeometry(150, 380, 220), shellM, 240, 260, 0).castShadow = true;
    G3.add(bodyG, new THREE.BoxGeometry(500, 130, 200), shellM, 0, 420, 0).castShadow = true;
    /* 頭 (針棒側) */
    G3.add(bodyG, new THREE.BoxGeometry(130, 200, 210), shellM, -220, 380, 0).castShadow = true;

    /* はずみ車 */
    flywheel = G3.add(bodyG, new THREE.CylinderGeometry(70, 70, 30, 20), mats.chrome, 330, 420, 0);
    flywheel.rotation.z = Math.PI / 2;
    flywheel.castShadow = true;
    /* 糸立て2本 */
    spools = [];
    [[0xd84a3a, 60], [0x4a86d8, 130]].forEach(([c, x], i) => {
      G3.add(bodyG, new THREE.CylinderGeometry(6, 6, 70, 8), mats.steel, x, 520, -60);
      const sp = G3.add(bodyG, new THREE.CylinderGeometry(26, 26, 50, 12),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), x, 525, -60);
      sp.userData.col = c;
      spools.push(sp);
      window.__pts['spool' + i] = sp;
    });

    /* 針棒とおさえ */
    needleBar = new THREE.Group();
    needleBar.position.set(-220, 320, 40);
    bodyG.add(needleBar);
    G3.add(needleBar, new THREE.CylinderGeometry(7, 7, 160, 8), mats.chrome, 0, 0, 0);
    G3.add(needleBar, new THREE.CylinderGeometry(2.4, 0.8, 55, 6), mats.steel, 0, -100, 0);
    presser = G3.add(bodyG, new THREE.BoxGeometry(34, 8, 46), mats.steel, -220, 84, 40);
    /* 針板と送り歯 */
    G3.add(bodyG, new THREE.BoxGeometry(160, 10, 120), mats.chrome, -220, 72, 40);
    feedDog = G3.add(bodyG, new THREE.BoxGeometry(40, 8, 30),
      new THREE.MeshStandardMaterial({ color: 0x8a6f3c, metalness: 0.8, roughness: 0.4 }), -220, 70, 40);

    /* --- ふところの断面: 釜 (下糸のボビン) --- */
    const cutM = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.6 });
    G3.add(bodyG, new THREE.BoxGeometry(200, 60, 8), cutM, -220, 35, 130);
    hookG = new THREE.Group();
    hookG.position.set(-220, 30, 60);
    bodyG.add(hookG);
    const hookRing = G3.add(hookG, new THREE.TorusGeometry(34, 6, 8, 20, Math.PI * 1.6), mats.chrome, 0, 0, 0);
    hookRing.castShadow = true;
    G3.add(hookG, new THREE.CylinderGeometry(20, 20, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.5 }), 0, 0, 0).rotation.x = Math.PI / 2;
    /* クランクと連動軸 */
    G3.add(bodyG, new THREE.CylinderGeometry(9, 9, 480, 8), mats.steel, 40, 30, 60).rotation.z = Math.PI / 2;

    /* --- ペダル --- */
    pedalBtn = G3.add(scene, new THREE.BoxGeometry(180, 30, 120),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }), 60, -240, 480);
    pedalBtn.rotation.x = 0.3;
    pedalBtn.castShadow = true;
    window.__pts.pedal = pedalBtn;

    /* --- 布 (CanvasTexture に縫い目を描く) --- */
    clothCv = document.createElement('canvas');
    clothCv.width = 512;
    clothCv.height = 256;
    clothCtx = clothCv.getContext('2d');
    clothCtx.fillStyle = '#f7e9c8';
    clothCtx.fillRect(0, 0, 512, 256);
    /* 布のチェック柄 */
    clothCtx.strokeStyle = 'rgba(200,120,90,0.25)';
    clothCtx.lineWidth = 8;
    for (let i = 0; i < 8; i++) {
      clothCtx.beginPath();
      clothCtx.moveTo(i * 70, 0);
      clothCtx.lineTo(i * 70, 256);
      clothCtx.stroke();
      clothCtx.beginPath();
      clothCtx.moveTo(0, i * 40);
      clothCtx.lineTo(512, i * 40);
      clothCtx.stroke();
    }
    clothTex = new THREE.CanvasTexture(clothCv);
    clothG = new THREE.Mesh(new THREE.PlaneGeometry(560, 280),
      new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.85, side: THREE.DoubleSide }));
    clothG.rotation.x = -Math.PI / 2;
    clothG.position.set(-100, 79, 40);
    scene.add(clothG);
    window.__pts.cloth = clothG;
  }

  /* 布上の針の位置 (UV) に1針描く */
  function stitch() {
    /* 針は世界の (-220, ・, 40)。布ローカルへ */
    const lx = -220 - clothG.position.x;
    const lz = 40 - clothG.position.z;
    const u = (lx / 560 + 0.5) * 512;
    const vv = (lz / 280 + 0.5) * 256;
    if (u < 4 || u > 508 || vv < 4 || vv > 252) return;
    clothCtx.strokeStyle = '#' + threadCol.toString(16).padStart(6, '0');
    clothCtx.lineWidth = 5;
    clothCtx.lineCap = 'round';
    if (lastStitchUV) {
      clothCtx.beginPath();
      clothCtx.moveTo(lastStitchUV[0], lastStitchUV[1]);
      clothCtx.lineTo(u, vv);
      clothCtx.stroke();
      /* 縫い目らしい点々 */
      clothCtx.fillStyle = 'rgba(0,0,0,0.15)';
      clothCtx.fillRect(u - 1, vv - 1, 3, 3);
    }
    lastStitchUV = [u, vv];
    clothTex.needsUpdate = true;
    stitchCount++;
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
    for (const sp of spools) {
      if (near(sp, 60)) {
        threadCol = sp.userData.col;
        S.plip(1.5);
        return;
      }
    }
    if (near(pedalBtn, 130)) {
      sewing = true;
      dragMode = 'pedal';
      dragId = e.pointerId;
      S.clickReal(0.7);
      return;
    }
    if (near(clothG, 320)) {
      dragMode = 'cloth';
      dragId = e.pointerId;
      clothG.userData.d = { x0: e.clientX, z0: e.clientY, px: clothG.position.x, pz: clothG.position.z };
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'cloth' && clothG.userData.d) {
        const d = clothG.userData.d;
        clothG.position.x = U.clamp(d.px + (e.clientX - d.x0) * 0.8, -420, 200);
        clothG.position.z = U.clamp(d.pz + (e.clientY - d.z0) * 0.8, -80, 180);
      }
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.6);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.4);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      if (dragMode === 'pedal') sewing = false;
      dragMode = null;
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

    /* 縫い: ペダルを踏んでいるあいだ針が上下し布が送られる */
    if (sewing) {
      const prevPhase = needlePhase;
      needlePhase += dt * 7;
      flywheel.rotation.x += dt * 7;
      hookG.rotation.z -= dt * 14;   /* 釜は倍速で回る (実機構) */
      feedDog.position.x = -220 + Math.sin(needlePhase) * 10;
      feedDog.position.y = 70 + Math.max(0, Math.cos(needlePhase)) * 5;
      /* 布の自動送り (針が上がっているとき) */
      if (Math.sin(needlePhase) > 0) {
        clothG.position.x -= dt * 42;
      }
      if (servo) servo.set(0.6);
      /* 針が下死点を通ったら1針 */
      if (Math.floor(needlePhase / Math.PI) > Math.floor(prevPhase / Math.PI) &&
          Math.sin(needlePhase) < 0.1) {
        stitch();
        S.clickReal(0.35);
      }
    } else {
      if (servo) servo.set(0.05);
    }
    needleBar.position.y = 320 + (sewing ? Math.sin(needlePhase) * 55 - 55 : 0);
    pedalBtn.position.y = sewing ? -252 : -240;

    if (window.__dbgMS) window.__dbgMS({
      sewing, stitches: stitchCount,
      cloth: [clothG.position.x | 0, clothG.position.z | 0],
      col: threadCol.toString(16),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      sewing = false; needlePhase = 0; stitchCount = 0; lastStitchUV = null;
      threadCol = 0xd84a3a;
      dragMode = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 220, 60),
        radius: 1350, radiusPortraitBase: 1700, radiusMaxPortrait: 2700,
        az: 0.25, po: 1.1,
      });
      build();
      servo = S.servoLoop();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* 4歳向けガイド: ペダル長押し → 布を動かして曲げる → 曲げたまま縫う → 片付け */
      let gdSewed = false, gdCurve = false;
      GUIDE.start(stage3, [
        {
          kind: 'hold', at: () => pedalBtn,
          done: () => (gdSewed = gdSewed || stitchCount > 5),
        },
        {
          kind: 'drag', at: () => clothG, to: () => {
            const v = new THREE.Vector3();
            clothG.getWorldPosition(v);
            v.z += 140;
            return v;
          },
          when: () => stitchCount > 5,
          done: () => Math.abs(clothG.position.z - 40) > 60,
        },
        {
          kind: 'hold', at: () => pedalBtn,
          when: () => Math.abs(clothG.position.z - 40) > 60,
          done: () => (gdCurve = gdCurve || stitchCount > 14),
        },
        {
          kind: 'drag', at: () => clothG, to: () => new THREE.Vector3(-100, 79, 40),
          when: () => gdCurve,
          done: () => {
            const dx = clothG.position.x + 100, dz = clothG.position.z - 40;
            return Math.sqrt(dx * dx + dz * dz) < 40;
          },
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
