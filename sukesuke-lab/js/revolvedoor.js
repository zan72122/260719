/* かいてんドア — 写実3D
 *
 * ホテルの入口でくるくる回るガラスの扉。タイミングが楽しい。
 * 連鎖: 羽根を押して回す (または自動ボタン) → 4枚の羽根が回る → 人形を部屋の
 *       すきまに入れる → いっしょにくるり → 中のロビーへ出る
 * 分岐: 回す速さ × 入るタイミング × はさまりそうになるとセンサーで急停止+ブザー。
 */
window.GAMES.revolvedoor = (() => {
  let stage3, scene, raf, prev, time;
  let doorG, wings, angle, angVel, motorOn, motorBtn, safetyT;
  let dolls, lobbyMat;
  let dragDoll, dragId, spinId, spinA0, orbitId, orbitFrom;
  let servo, mats;

  const DOOR_R = 240;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#dce4ea', '#eef2f4', '#a8b6c0');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(800, 1800, 1400), shadowSpan: 1400, intensity: 1.0 });

    /* --- ホテルの壁 (ドアの左右) --- */
    const wallM = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.6 });
    G3.add(scene, new THREE.BoxGeometry(900, 700, 60), wallM, -690, 350, 0).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(900, 700, 60), wallM, 690, 350, 0).castShadow = true;
    G3.add(scene, new THREE.BoxGeometry(2280, 90, 70), wallM, 0, 745, 0);
    /* ロビーの床 (中側) */
    G3.add(scene, new THREE.BoxGeometry(2100, 8, 1200),
      new THREE.MeshPhysicalMaterial({ color: 0x9a4838, roughness: 0.3, clearcoat: 0.5 }), 0, 4, -640);
    lobbyMat = G3.add(scene, new THREE.BoxGeometry(420, 10, 260),
      new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.8 }), 0, 7, -420);
    /* 植木 */
    [-420, 420].forEach(x => {
      const p = new THREE.Group();
      p.position.set(x, 0, -520);
      scene.add(p);
      G3.add(p, new THREE.CylinderGeometry(60, 70, 90, 12),
        new THREE.MeshStandardMaterial({ color: 0xa86038, roughness: 0.6 }), 0, 45, 0).castShadow = true;
      G3.add(p, new THREE.SphereGeometry(90, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.8 }), 0, 170, 0).castShadow = true;
    });

    /* --- 回転ドアの筒 (ガラスの外周・前後があいている) --- */
    const glassM = new THREE.MeshPhysicalMaterial({
      color: 0xcfe0e8, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    });
    [[Math.PI * 0.22, Math.PI * 0.56], [Math.PI * 1.22, Math.PI * 0.56]].forEach(([start, len]) => {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(DOOR_R + 20, DOOR_R + 20, 620, 24, 1, true, start, len), glassM);
      seg.position.y = 310;
      scene.add(seg);
    });
    G3.add(scene, new THREE.CylinderGeometry(DOOR_R + 34, DOOR_R + 34, 40, 24),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.6, roughness: 0.35 }), 0, 660, 0).castShadow = true;

    /* --- 回る羽根4枚 --- */
    doorG = new THREE.Group();
    scene.add(doorG);
    G3.add(doorG, new THREE.CylinderGeometry(22, 22, 640, 12), mats.chrome, 0, 320, 0);
    wings = [];
    const wingGlass = new THREE.MeshPhysicalMaterial({
      color: 0xd8e8f0, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Group();
      w.rotation.y = i * Math.PI / 2;
      doorG.add(w);
      const pane = G3.add(w, new THREE.BoxGeometry(DOOR_R - 30, 560, 10), wingGlass, (DOOR_R - 30) / 2 + 22, 320, 0);
      G3.add(w, new THREE.BoxGeometry(DOOR_R - 30, 26, 22), mats.darkPlastic, (DOOR_R - 30) / 2 + 22, 620, 0);
      G3.add(w, new THREE.BoxGeometry(DOOR_R - 30, 26, 22), mats.darkPlastic, (DOOR_R - 30) / 2 + 22, 30, 0);
      G3.add(w, new THREE.BoxGeometry(20, 560, 24),
        new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.5 }), DOOR_R - 18, 320, 0);
      wings.push(w);
    }
    window.__pts.door = doorG;

    /* --- 自動ボタン --- */
    const post = new THREE.Group();
    post.position.set(400, 0, 320);
    scene.add(post);
    G3.add(post, new THREE.CylinderGeometry(16, 20, 240, 10),
      new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.5 }), 0, 120, 0).castShadow = true;
    motorBtn = G3.add(post, new THREE.CylinderGeometry(34, 38, 22, 14),
      new THREE.MeshPhysicalMaterial({ color: 0x2f8ed0, roughness: 0.3, clearcoat: 0.6 }), 0, 255, 0);
    window.__pts.motor = motorBtn;

    /* --- 人形2体 (外側で待つ) --- */
    dolls = [];
    [[0xd85a4a, -140, 430], [0x3a7ce0, 150, 470]].forEach(([col, x, z], i) => {
      const d = G3.doll({ shirt: col });
      d.g.position.set(x, 0, z);
      scene.add(d.g);
      dolls.push({ ...d, state: 'out', ang: 0 });
      window.__pts['rdoll' + i] = d.g;
    });
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
    if (near(motorBtn, 80)) {
      motorOn = !motorOn;
      S.clickReal(0.8);
      if (motorOn) S.doorChime();
      return;
    }
    for (const d of dolls) {
      if (d.state !== 'ride' && near(d.g, 120, 80)) {
        dragDoll = d;
        dragId = e.pointerId;
        S.plip(1.3);
        return;
      }
    }
    /* 羽根を押す (ドア中心のまわりの円ドラッグ) */
    const hits = ray.ray.distanceToPoint(new THREE.Vector3(0, 320, 0));
    if (hits < DOOR_R + 60) {
      spinId = e.pointerId;
      const cv = new THREE.Vector3(0, 320, 0);
      cv.project(stage3.camera);
      const r = stage3.renderer.domElement.getBoundingClientRect();
      doorG.userData.cx = r.left + (cv.x + 1) / 2 * r.width;
      doorG.userData.cy = r.top + (1 - (cv.y + 1) / 2) * r.height;
      spinA0 = Math.atan2(e.clientY - doorG.userData.cy, e.clientX - doorG.userData.cx);
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (dragDoll && e.pointerId === dragId) {
      const ray = stage3.setRay(e);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = (140 - o.y) / d.y;
      if (t > 0) {
        const nx = U.clamp(o.x + d.x * t, -640, 640);
        const nz = U.clamp(o.z + d.z * t, -620, 600);
        dragDoll.g.position.set(nx, 0, nz);
      }
    } else if (e.pointerId === spinId) {
      const a = Math.atan2(e.clientY - doorG.userData.cy, e.clientX - doorG.userData.cx);
      let da = a - spinA0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      spinA0 = a;
      angVel = U.clamp(angVel + da * 1.6, -2.6, 2.6);
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.5, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.85, 1.35);
    }
  }

  function onUp(e) {
    if (dragDoll && e.pointerId === dragId) {
      const d = dragDoll;
      const p = d.g.position;
      const rr = Math.hypot(p.x, p.z);
      if (rr < DOOR_R - 20) {
        /* ドアの部屋に入った → いっしょに回る */
        d.state = 'ride';
        d.ang = Math.atan2(p.z, p.x) - angle;
        S.squishReal(0.4);
      } else if (p.z < -200) {
        if (d.state !== 'in') {
          d.state = 'in';
          S.yay();
        }
      } else {
        d.state = 'out';
      }
      dragDoll = null;
      dragId = null;
    }
    if (e.pointerId === spinId) spinId = null;
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* 安全センサー: はやすぎ+人形が羽根のそば → 急停止 */
    if (safetyT > 0) {
      safetyT -= dt;
      angVel *= Math.pow(0.001, dt);
    } else {
      if (motorOn) angVel += (0.9 - angVel) * Math.min(1, dt * 2);
      else angVel *= Math.pow(0.25, dt);
      const riders = dolls.filter(d => d.state === 'ride');
      if (Math.abs(angVel) > 1.9 && riders.length > 0) {
        safetyT = 1.4;
        S.buzz();
        S.snapBack();
      }
    }
    angle += angVel * dt;
    doorG.rotation.y = angle;
    if (servo) servo.set(U.clamp(Math.abs(angVel) / 2.6, 0, 1) * 0.5);

    /* 乗っている人形はドアと一緒に回る */
    dolls.forEach(d => {
      if (d.state === 'ride' && dragDoll !== d) {
        const a = d.ang + angle;
        const rr = DOOR_R * 0.62;
        d.g.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        d.g.rotation.y = -a;
        /* 中側 (z<0, 開口部) に来たら降りて中へ歩く */
        const zdir = Math.sin(a);
        if (zdir < -0.85) {
          d.state = 'in';
          d.g.position.set(d.g.position.x * 1.2, 0, -330 - Math.random() * 60);
          d.g.rotation.y = 0;
          S.plip(1.8);
          S.yay();
        }
      }
    });

    if (window.__dbgRV) window.__dbgRV({
      ang: +angle.toFixed(2), v: +angVel.toFixed(2), motor: motorOn,
      safety: +safetyT.toFixed(1),
      dolls: dolls.map(d => d.state),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      angle = 0; angVel = 0; motorOn = false; safetyT = 0;
      dragDoll = null; dragId = null; spinId = null; orbitId = null; orbitFrom = null;

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(0, 300, 0),
        radius: 1550, radiusPortraitBase: 1800, radiusMaxPortrait: 3000,
        az: 0.1, po: 1.0,
      });
      build();
      servo = S.servoLoop();
      servo.set(0);

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: ドアを回す → 人形をドアへ → (中に着いたら) もう1人 */
      GUIDE.start(stage3, [
        {
          kind: 'drag', at: () => new THREE.Vector3(DOOR_R - 40, 320, 120), to: () => new THREE.Vector3(-DOOR_R + 40, 320, 120),
          when: () => Math.abs(angVel) < 0.3 && dolls.every(d => d.state === 'out'),
          done: () => Math.abs(angVel) > 0.5 || motorOn,
        },
        {
          kind: 'drag', at: () => dolls[0].g, to: () => new THREE.Vector3(0, 140, DOOR_R * 0.55),
          when: () => dolls[0].state === 'out' && (Math.abs(angVel) > 0.2 || motorOn),
          done: () => dolls[0].state !== 'out',
        },
        {
          kind: 'drag', at: () => dolls[1].g, to: () => new THREE.Vector3(0, 140, DOOR_R * 0.55),
          when: () => dolls[0].state === 'in' && dolls[1].state === 'out',
          done: () => dolls[1].state !== 'out',
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
