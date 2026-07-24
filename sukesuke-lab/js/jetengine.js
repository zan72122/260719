/* ジェットエンジン — 写実3D (断面・テストスタンド)
 *
 * 飛行機の下についている大きな筒の中身。空港では絶対にさわれない。
 * 断面: ファン → 圧縮機の羽根列 → 燃焼室 → タービン → ノズル。
 * 連鎖: スターターボタン → ファンがゆっくり回りだす → 燃料バルブをひねる →
 *       スロットルレバーを上げる → 燃焼室に炎 → タービンが回って加速 →
 *       ノズルから熱風 → 推力計が上がり、うしろの旗や葉っぱがふきとぶ
 * 分岐: バルブ開度 × スロットルの上げ方 (急にしぼると炎が消える=フレームアウト →
 *       もう一度スターターから) × 推力でスタンドがしなる。
 */
window.GAMES.jetengine = (() => {
  let stage3, scene, raf, prev, time;
  let engineG, fan, comps, turbine, flameMesh, nozzleGlow, exhaust, exhaustState, dummy;
  let throttle, throttleLever, valve, valveKnob, starterBtn, gaugeCv, gaugeTex;
  let rpm, fuel, flame, thrust, started, flameoutT, leaves;
  let dragObj, dragId, valveA0, orbitId, orbitFrom;
  let spool, windS, mats;

  const ENG_Y = 330;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#cddcE8', '#e6eef2', '#98acb8');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(900, 1900, 1500), shadowSpan: 1600, intensity: 1.0 });

    /* --- テストスタンド --- */
    const standM = new THREE.MeshStandardMaterial({ color: 0xd8b83a, roughness: 0.5 });
    G3.add(scene, new THREE.BoxGeometry(60, 420, 60), standM, -220, 210, -160).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(60, 420, 60), standM, 220, 210, -160).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(560, 50, 60), standM, 0, 430, -160).castShadow = true;

    /* --- エンジン本体 (手前半分が断面) --- */
    engineG = new THREE.Group();
    engineG.position.set(0, ENG_Y, -60);
    scene.add(engineG);
    /* ナセル外殻 (うしろ半分だけ) */
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(230, 190, 900, 26, 1, true, Math.PI * 0.02, Math.PI * 0.96),
      new THREE.MeshPhysicalMaterial({ color: 0xdfe4e8, roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide }));
    shell.rotation.z = Math.PI / 2;
    shell.rotation.x = Math.PI / 2;
    shell.castShadow = true;
    engineG.add(shell);
    /* 中心シャフト */
    G3.add(engineG, new THREE.CylinderGeometry(26, 26, 880, 10), mats.steel, 0, 0, 0).rotation.z = Math.PI / 2;
    /* ファン (前・大きい) */
    fan = new THREE.Group();
    fan.position.x = -430;
    engineG.add(fan);
    const fanM = new THREE.MeshStandardMaterial({ color: 0x3c4248, metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 12; i++) {
      const b = G3.add(fan, new THREE.BoxGeometry(10, 170, 44), fanM, 0, 0, 0);
      b.rotation.x = i / 12 * Math.PI * 2;
      b.rotation.y = 0.5;
      b.position.y = Math.cos(i / 12 * Math.PI * 2) * 105;
      b.position.z = Math.sin(i / 12 * Math.PI * 2) * 105;
    }
    G3.add(fan, new THREE.SphereGeometry(52, 12, 9), fanM, -16, 0, 0).scale.x = 1.6;
    /* 圧縮機の羽根列 (小さくなっていく円盤) */
    comps = [];
    for (let s = 0; s < 5; s++) {
      const disc = new THREE.Group();
      disc.position.x = -280 + s * 70;
      engineG.add(disc);
      const r = 150 - s * 18;
      for (let i = 0; i < 10; i++) {
        const b = G3.add(disc, new THREE.BoxGeometry(8, 60, 26),
          new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.8, roughness: 0.3 }), 0, 0, 0);
        b.rotation.x = i / 10 * Math.PI * 2 + s;
        b.position.y = Math.cos(i / 10 * Math.PI * 2 + s) * (r - 24);
        b.position.z = Math.sin(i / 10 * Math.PI * 2 + s) * (r - 24);
      }
      comps.push(disc);
    }
    /* 燃焼室 (リング) */
    const combM = new THREE.MeshStandardMaterial({ color: 0x8a6248, metalness: 0.6, roughness: 0.4 });
    const comb = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 150, 18, 1, true, Math.PI * 0.02, Math.PI * 0.96), combM);
    comb.rotation.z = Math.PI / 2;
    comb.rotation.x = Math.PI / 2;
    comb.position.x = 120;
    engineG.add(comb);
    /* 炎 (燃焼室の中) */
    flameMesh = new THREE.Mesh(new THREE.ConeGeometry(60, 220, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9030, transparent: true, opacity: 0 }));
    flameMesh.rotation.z = -Math.PI / 2;
    flameMesh.position.x = 190;
    engineG.add(flameMesh);
    /* タービン */
    turbine = new THREE.Group();
    turbine.position.x = 280;
    engineG.add(turbine);
    for (let i = 0; i < 10; i++) {
      const b = G3.add(turbine, new THREE.BoxGeometry(8, 70, 30),
        new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.8, roughness: 0.35 }), 0, 0, 0);
      b.rotation.x = i / 10 * Math.PI * 2;
      b.position.y = Math.cos(i / 10 * Math.PI * 2) * 75;
      b.position.z = Math.sin(i / 10 * Math.PI * 2) * 75;
    }
    /* ノズル */
    nozzleGlow = new THREE.Mesh(new THREE.CylinderGeometry(96, 130, 190, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x5a5e64, metalness: 0.7, roughness: 0.35, emissive: 0x000000, side: THREE.DoubleSide }));
    nozzleGlow.rotation.z = Math.PI / 2;
    nozzleGlow.position.x = 460;
    engineG.add(nozzleGlow);

    /* --- 排気パーティクル --- */
    exhaust = new THREE.InstancedMesh(new THREE.SphereGeometry(14, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0.5 }), 50);
    exhaust.frustumCulled = false;
    scene.add(exhaust);
    exhaustState = [];
    for (let i = 0; i < 50; i++) exhaustState.push({ on: false, x: 0, y: 0, z: 0, v: 0, age: 0 });
    dummy = new THREE.Object3D();

    /* --- 葉っぱ (推力でふきとぶ・もどってくる) --- */
    leaves = [];
    for (let i = 0; i < 8; i++) {
      const leaf = G3.add(scene, new THREE.BoxGeometry(36, 4, 26),
        new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.8 }), 620 + (i % 4) * 80, 6, -220 + (i % 3) * 130);
      leaf.rotation.y = i;
      leaves.push({ m: leaf, home: leaf.position.clone(), v: 0 });
    }

    /* --- コントロール台 --- */
    const consoleG = new THREE.Group();
    consoleG.position.set(0, 0, 330);
    scene.add(consoleG);
    const conM = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.5 });
    const top = G3.add(consoleG, new THREE.BoxGeometry(620, 40, 220), conM, 0, 190, 0);
    top.rotation.x = -0.35;
    top.castShadow = true;
    G3.add(consoleG, new THREE.BoxGeometry(620, 180, 200), conM, 0, 90, 30);
    /* スロットルレバー (スライド) */
    throttleLever = new THREE.Group();
    throttleLever.position.set(-180, 210, 0);
    consoleG.add(throttleLever);
    G3.add(consoleG, new THREE.BoxGeometry(30, 12, 170),
      new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6 }), -180, 212, -8).rotation.x = -0.35;
    G3.add(throttleLever, new THREE.CylinderGeometry(10, 10, 90, 8), mats.steel, 0, 40, 0);
    G3.add(throttleLever, new THREE.SphereGeometry(28, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xd83a3a, roughness: 0.3, clearcoat: 0.6 }), 0, 90, 0);
    window.__pts.throttle = throttleLever;
    /* 燃料バルブ (回すコック) */
    valveKnob = new THREE.Group();
    valveKnob.position.set(40, 230, -20);
    consoleG.add(valveKnob);
    const vm = new THREE.MeshPhysicalMaterial({ color: 0xe8a020, roughness: 0.3, clearcoat: 0.5 });
    G3.add(valveKnob, new THREE.CylinderGeometry(16, 16, 40, 8), mats.brass, 0, 0, 0);
    G3.add(valveKnob, new THREE.BoxGeometry(110, 18, 24), vm, 0, 24, 0);
    window.__pts.valve = valveKnob;
    /* スターターボタン */
    starterBtn = G3.add(consoleG, new THREE.CylinderGeometry(36, 40, 24, 14),
      new THREE.MeshPhysicalMaterial({ color: 0x2f9e4f, roughness: 0.3, clearcoat: 0.6 }), 210, 230, -20);
    starterBtn.rotation.x = -0.35;
    window.__pts.starter = starterBtn;
    /* 推力計 */
    gaugeCv = document.createElement('canvas');
    gaugeCv.width = 160;
    gaugeCv.height = 120;
    gaugeTex = new THREE.CanvasTexture(gaugeCv);
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(190, 140), new THREE.MeshBasicMaterial({ map: gaugeTex, transparent: true }));
    gauge.position.set(0, 380, 260);
    scene.add(gauge);
  }

  function drawGauge() {
    const c = gaugeCv.getContext('2d');
    c.clearRect(0, 0, 160, 120);
    c.fillStyle = '#14181c';
    c.beginPath();
    c.arc(80, 80, 66, Math.PI, 0);
    c.lineTo(146, 96);
    c.lineTo(14, 96);
    c.fill();
    c.strokeStyle = '#c8d0d8';
    c.lineWidth = 4;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + i / 8 * Math.PI;
      c.beginPath();
      c.moveTo(80 + Math.cos(a) * 52, 80 + Math.sin(a) * 52);
      c.lineTo(80 + Math.cos(a) * 62, 80 + Math.sin(a) * 62);
      c.stroke();
    }
    const a = Math.PI + U.clamp(thrust, 0, 1) * Math.PI;
    c.strokeStyle = '#ff7040';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(80, 80);
    c.lineTo(80 + Math.cos(a) * 56, 80 + Math.sin(a) * 56);
    c.stroke();
    gaugeTex.needsUpdate = true;
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
    if (near(starterBtn, 80)) {
      if (!started && rpm < 0.1) {
        started = true;
        S.clickReal(0.9);
      } else {
        S.clickReal(0.4);
      }
      return;
    }
    if (near(throttleLever, 90, 70)) {
      dragObj = 'throttle';
      dragId = e.pointerId;
      throttleLever.userData.y0 = e.clientY;
      throttleLever.userData.v0 = throttle;
      return;
    }
    if (near(valveKnob, 90, 20)) {
      dragObj = 'valve';
      dragId = e.pointerId;
      const cv = new THREE.Vector3();
      valveKnob.getWorldPosition(cv);
      cv.project(stage3.camera);
      const r = stage3.renderer.domElement.getBoundingClientRect();
      valveKnob.userData.cx = r.left + (cv.x + 1) / 2 * r.width;
      valveKnob.userData.cy = r.top + (1 - (cv.y + 1) / 2) * r.height;
      valveA0 = Math.atan2(e.clientY - valveKnob.userData.cy, e.clientX - valveKnob.userData.cx);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId && dragObj === 'throttle') {
      const d = throttleLever.userData;
      throttle = U.clamp(d.v0 + (d.y0 - e.clientY) / 260, 0, 1);
    } else if (e.pointerId === dragId && dragObj === 'valve') {
      const a = Math.atan2(e.clientY - valveKnob.userData.cy, e.clientX - valveKnob.userData.cx);
      let da = a - valveA0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      valveA0 = a;
      valve = U.clamp(valve + da * 0.45, 0, 1);
      valveKnob.rotation.y = -valve * Math.PI * 0.8;
      if (Math.abs(da) > 0.02) S.ratchet(0.15);
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.55, 0.55);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.35);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) { dragObj = null; dragId = null; }
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* 燃料の流れ */
    fuel = valve * (0.25 + throttle * 0.75);

    /* 点火と炎 */
    if (started && rpm > 0.25 && fuel > 0.12 && flame <= 0) {
      flame = 0.3;
      S.boom(0.2);
    }
    if (flame > 0) {
      /* 燃料が急になくなる/少なすぎ → フレームアウト */
      if (fuel < 0.06 || rpm < 0.12) {
        flame = 0;
        started = false;
        flameoutT = 1.2;
        S.sputter();
        S.buzz();
      } else {
        flame += (U.clamp(fuel * 1.4, 0.2, 1.3) - flame) * Math.min(1, dt * 3);
      }
    }
    if (flameoutT > 0) flameoutT -= dt;

    /* 回転数: スターター + 炎のエネルギー */
    const target = flame > 0 ? U.clamp(0.3 + flame * 0.75, 0, 1.1) : (started ? 0.32 : 0);
    rpm += (target - rpm) * Math.min(1, dt * (flame > 0 ? 0.9 : 0.5));
    thrust = U.clamp((rpm - 0.3) * 1.35 * (flame > 0 ? 1 : 0.1), 0, 1);

    /* 回転する部品 */
    const spin = rpm * 34;
    fan.rotation.x += spin * dt;
    comps.forEach(c2 => { c2.rotation.x += spin * 1.4 * dt; });
    turbine.rotation.x += spin * 1.4 * dt;
    /* 炎とノズルの色 */
    flameMesh.material.opacity = U.clamp(flame, 0, 0.9);
    flameMesh.scale.setScalar(0.6 + flame * 0.7 + Math.sin(time * 30) * 0.05 * flame);
    const rich = fuel > 0.75;
    flameMesh.material.color.set(rich ? 0xff7020 : flame > 0.7 ? 0x60a8ff : 0xffa040);
    nozzleGlow.material.emissive.setRGB(thrust * 0.7, thrust * 0.25, thrust * 0.08);
    /* エンジンが推力でしなる */
    engineG.position.x = -thrust * 26 + Math.sin(time * 40) * thrust * 2.5;
    /* 音 */
    if (spool) spool.set(U.clamp(rpm, 0, 1) * 0.85);
    if (windS) windS.set(thrust * 0.9);

    /* 排気 */
    if (thrust > 0.08) {
      exhaustState.forEach(s => {
        if (!s.on && Math.random() < dt * thrust * 26) {
          s.on = true;
          s.x = 560;
          s.y = ENG_Y + (Math.random() - 0.5) * 120;
          s.z = -60 + (Math.random() - 0.5) * 120;
          s.v = 900 + thrust * 1400;
          s.age = 0;
        }
      });
    }
    exhaustState.forEach((s, i) => {
      if (s.on) {
        s.age += dt;
        s.x += s.v * dt;
        if (s.age > 0.9) s.on = false;
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.setScalar(1 + s.age * 3);
      } else {
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      exhaust.setMatrixAt(i, dummy.matrix);
    });
    exhaust.instanceMatrix.needsUpdate = true;
    /* 葉っぱがふきとぶ */
    leaves.forEach(lf => {
      if (thrust > 0.25 && lf.m.position.x < 2400) {
        lf.v += thrust * 900 * dt;
        lf.m.position.x += lf.v * dt;
        lf.m.position.y = 6 + Math.sin(lf.m.position.x * 0.02) * 40 * thrust;
        lf.m.rotation.y += dt * 8;
      } else if (thrust < 0.1 && lf.m.position.x > lf.home.x) {
        lf.v = 0;
        lf.m.position.x = Math.max(lf.home.x, lf.m.position.x - dt * 500);
        lf.m.position.y = 6;
      }
    });
    /* スロットルレバーの見た目 */
    throttleLever.position.z = -throttle * 120 + 40;
    if (Math.floor(time * 5) % 2 === 0) drawGauge();

    if (window.__dbgJT) window.__dbgJT({
      rpm: +rpm.toFixed(2), fuel: +fuel.toFixed(2), throttle: +throttle.toFixed(2),
      valve: +valve.toFixed(2), flame: +flame.toFixed(2), thrust: +thrust.toFixed(2),
      started,
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      throttle = 0; valve = 0; rpm = 0; fuel = 0; flame = 0; thrust = 0;
      started = false; flameoutT = 0;
      dragObj = null; dragId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 300, 30),
        radius: 1600, radiusPortraitBase: 1850, radiusMaxPortrait: 3000,
        az: 0.12, po: 1.02,
      });
      build();
      drawGauge();
      spool = S.whirrLoop();
      spool.set(0);
      windS = S.wind();
      windS.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: スターター → バルブを回す → スロットルを上げる */
      GUIDE.start(stage3, [
        {
          kind: 'tap', at: () => starterBtn,
          when: () => !started && rpm < 0.1,
          done: () => started,
        },
        {
          kind: 'turn', at: () => valveKnob, r: 100,
          when: () => started && valve < 0.3,
          done: () => valve >= 0.3,
        },
        {
          kind: 'drag', at: () => throttleLever, to: () => {
            const v = new THREE.Vector3();
            throttleLever.getWorldPosition(v);
            v.y += 60;
            v.z -= 160;
            return v;
          },
          when: () => started && valve >= 0.3 && throttle < 0.5,
          done: () => thrust > 0.5,
        },
      ]);

      prev = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(raf);
      GUIDE.stop();
      if (spool) spool.stop();
      if (windS) windS.stop();
      stage3.dispose();
      stage3 = null;
      scene = null;
    },
  };
})();
