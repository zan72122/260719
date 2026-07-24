/* オルゴール — 写実3D (手回し・紙テープ式)
 *
 * 穴あきの紙テープをハンドルで送ると、スターホイールが穴を読んで
 * くしの歯をはじき、本当にメロディが鳴る。
 * 連鎖: ハンドルを回す → ローラーが紙テープを送る → 穴が読み取り車にかかる →
 *       くしの歯がはじかれてビーン → 音が鳴る (回す速さ=テンポ)
 * 分岐: テープの穴は指でポチポチ編集できる → 自分だけのメロディが無限に作れる。
 *       最初は「きらきらぼし」入り。
 */
window.GAMES.orgel = (() => {
  let stage3, scene, raf, prev, time;
  let boxG, crank, rollerA, rollerB, teeth, tapeMesh, tapeCv, tapeTex;
  let holes, tapePos, lastCol, playedN;
  let dragId, orbitId, orbitFrom, crankA0, turnV;
  let mats;

  const COLS = 24, ROWS = 8;
  const FREQS = [523, 587, 659, 698, 784, 880, 988, 1047];
  const NOTE_COLS = ['#e05a4a', '#e8923a', '#e8c83a', '#7ab84a', '#3aa8a0', '#3a7ce0', '#7a5ae0', '#c84ab8'];
  /* きらきらぼし: ドドソソララソ ファファミミレレド */
  const STAR = [0, 0, 4, 4, 5, 5, 4, -1, 3, 3, 2, 2, 1, 1, 0, -1];

  const BOX_X = -60, BOX_Z = 0;
  const TAPE_W = 1000, TAPE_H = 230, TAPE_Y = 330;

  function build() {
    scene = stage3.scene;
    mats = G3.materials();
    scene.background = G3.bgGradient('#ece2d0', '#f4ecdc', '#c4b49a');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x9a7f54, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    G3.addLights(scene, { pos: new THREE.Vector3(600, 1500, 1300), shadowSpan: 900, intensity: 0.95 });
    G3.add(scene, new THREE.BoxGeometry(2600, 1400, 30),
      new THREE.MeshStandardMaterial({ color: 0xe4d8c2, roughness: 0.7 }), 0, 700, -420);
    /* テーブル */
    G3.add(scene, new THREE.BoxGeometry(1500, 90, 700),
      new THREE.MeshStandardMaterial({ color: 0x7a5f3e, roughness: 0.5 }), 0, 45, 80).receiveShadow = true;

    /* --- 本体 (木の箱・上があいていて機構が見える) --- */
    boxG = new THREE.Group();
    boxG.position.set(BOX_X, 90, BOX_Z);
    scene.add(boxG);
    const woodM = new THREE.MeshStandardMaterial({ color: 0xa87848 , roughness: 0.5 });
    const wood2 = new THREE.MeshStandardMaterial({ color: 0x8a5f38, roughness: 0.55 });
    G3.add(boxG, new THREE.BoxGeometry(420, 30, 320), wood2, 0, 15, 0).castShadow = true;
    G3.add(boxG, new THREE.BoxGeometry(420, 190, 26), woodM, 0, 125, -147).castShadow = true;
    G3.add(boxG, new THREE.BoxGeometry(420, 90, 26), woodM, 0, 75, 147);
    G3.add(boxG, new THREE.BoxGeometry(26, 190, 320), woodM, -197, 125, 0).castShadow = true;
    G3.add(boxG, new THREE.BoxGeometry(26, 190, 320), woodM, 197, 125, 0);

    /* --- 送りローラー2本 --- */
    const rollM = new THREE.MeshStandardMaterial({ color: 0xd8b890, roughness: 0.55 });
    rollerA = G3.add(boxG, new THREE.CylinderGeometry(42, 42, 300, 14), rollM, -110, 240, 0);
    rollerA.rotation.x = Math.PI / 2;
    rollerB = G3.add(boxG, new THREE.CylinderGeometry(42, 42, 300, 14), rollM, 110, 240, 0);
    rollerB.rotation.x = Math.PI / 2;

    /* --- くし (8枚の歯・音ごとに色) と スターホイール --- */
    teeth = [];
    const combBase = G3.add(boxG, new THREE.BoxGeometry(30, 40, 300), mats.steel, 0, 130, 0);
    for (let r = 0; r < ROWS; r++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(90 - r * 6, 8, 22),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(NOTE_COLS[r]), metalness: 0.75, roughness: 0.3 }));
      t.position.set(-40 - (90 - r * 6) / 2 + 14, 155, -122 + r * 35);
      boxG.add(t);
      teeth.push(t);
      /* スターホイール (読み取りの星車) */
      const star = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 10, 5),
        new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.3 }));
      star.rotation.x = Math.PI / 2;
      star.position.set(4, 210, -122 + r * 35);
      boxG.add(star);
    }

    /* --- ハンドル --- */
    crank = new THREE.Group();
    crank.position.set(230, 240, 0);
    boxG.add(crank);
    G3.add(crank, new THREE.CylinderGeometry(12, 12, 90, 8), mats.steel, 0, 0, 0).rotation.z = Math.PI / 2;
    const arm = G3.add(crank, new THREE.BoxGeometry(16, 110, 16), woodM, 55, -40, 0);
    G3.add(crank, new THREE.CylinderGeometry(15, 15, 70, 8), wood2, 55, -95, 0).rotation.x = 0;
    window.__pts.crank = crank;

    /* --- 紙テープ (穴の編集もここで) --- */
    tapeCv = document.createElement('canvas');
    tapeCv.width = 1440;
    tapeCv.height = 330;
    tapeTex = new THREE.CanvasTexture(tapeCv);
    tapeMesh = new THREE.Mesh(new THREE.PlaneGeometry(TAPE_W, TAPE_H),
      new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.8, side: THREE.DoubleSide }));
    tapeMesh.rotation.x = -Math.PI / 2 + 0.12;
    tapeMesh.position.set(BOX_X, TAPE_Y, BOX_Z);
    scene.add(tapeMesh);
    window.__pts.tape = tapeMesh;
    drawTape();
  }

  function drawTape() {
    const c = tapeCv.getContext('2d');
    c.fillStyle = '#f2ecd8';
    c.fillRect(0, 0, 1440, 330);
    const colW = 1440 / COLS;
    const rowH = 330 / (ROWS + 2);
    /* うすいガイド線 */
    c.strokeStyle = 'rgba(140,120,90,0.25)';
    c.lineWidth = 2;
    for (let i = 0; i <= COLS; i++) {
      c.beginPath();
      c.moveTo(i * colW, 0);
      c.lineTo(i * colW, 330);
      c.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      c.beginPath();
      c.moveTo(0, (r + 1) * rowH);
      c.lineTo(1440, (r + 1) * rowH);
      c.stroke();
    }
    /* いま読んでいる列 (中央の読み取り線) */
    const readCol = Math.floor(tapePos) % COLS;
    c.fillStyle = 'rgba(230,160,60,0.28)';
    c.fillRect(((readCol - tapePos % 1 + COLS) % COLS) * colW, 0, colW, 330);
    /* 穴 */
    for (let col = 0; col < COLS; col++) {
      for (let r = 0; r < ROWS; r++) {
        const x = ((col - tapePos + COLS * 10.5) % COLS) * colW + colW / 2;
        const y = (r + 1) * rowH + rowH / 2;
        if (holes[col][r]) {
          c.fillStyle = NOTE_COLS[r];
          c.beginPath();
          c.arc(x, y, rowH * 0.34, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(40,30,20,0.85)';
          c.beginPath();
          c.arc(x, y, rowH * 0.2, 0, Math.PI * 2);
          c.fill();
        } else {
          c.fillStyle = 'rgba(140,120,90,0.15)';
          c.beginPath();
          c.arc(x, y, rowH * 0.1, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    tapeTex.needsUpdate = true;
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
    if (near(crank, 130, -60)) {
      dragId = e.pointerId;
      const cv = new THREE.Vector3();
      crank.getWorldPosition(cv);
      cv.project(stage3.camera);
      const r = stage3.renderer.domElement.getBoundingClientRect();
      crank.userData.cx = r.left + (cv.x + 1) / 2 * r.width;
      crank.userData.cy = r.top + (1 - (cv.y + 1) / 2) * r.height;
      crankA0 = Math.atan2(e.clientY - crank.userData.cy, e.clientX - crank.userData.cx);
      return;
    }
    /* 紙テープの穴をポチポチ編集 */
    const hits = ray.intersectObject(tapeMesh);
    if (hits.length > 0) {
      const uv = hits[0].uv;
      const col = Math.floor(((uv.x * COLS) + tapePos + COLS * 10.5) % COLS);
      const rowH = 1 / (ROWS + 2);
      const r = Math.floor((1 - uv.y - rowH) / rowH);
      if (r >= 0 && r < ROWS) {
        holes[col][r] = !holes[col][r];
        drawTape();
        if (holes[col][r]) S.boxNote(FREQS[r], 0.1);
        else S.clickReal(0.3);
      }
      return;
    }
    if (orbitId === null) {
      orbitId = e.pointerId;
      orbitFrom = { x: e.clientX, y: e.clientY, az: stage3.orbit.az, po: stage3.orbit.po };
    }
  }

  function onMove(e) {
    if (e.pointerId === dragId) {
      const a = Math.atan2(e.clientY - crank.userData.cy, e.clientX - crank.userData.cx);
      let da = a - crankA0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      crankA0 = a;
      turnV = U.clamp(turnV + da * 0.7, -0.4, 2.4);
    } else if (e.pointerId === orbitId && orbitFrom) {
      stage3.orbit.az = U.clamp(orbitFrom.az + (e.clientX - orbitFrom.x) * 0.004, -0.45, 0.5);
      stage3.orbit.po = U.clamp(orbitFrom.po + (e.clientY - orbitFrom.y) * 0.003, 0.7, 1.3);
    }
  }

  function onUp(e) {
    if (e.pointerId === dragId) dragId = null;
    if (e.pointerId === orbitId) { orbitId = null; orbitFrom = null; }
  }

  /* ---------------- メインループ ---------------- */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;

    /* テープ送り (ハンドルの勢い) */
    turnV *= Math.pow(0.12, dt);
    const adv = turnV * dt * 2.2;
    if (Math.abs(adv) > 0.00001) {
      tapePos = (tapePos + adv + COLS) % COLS;
      crank.rotation.x += adv * 2.6;
      rollerA.rotation.y += adv * 2.4;
      rollerB.rotation.y += adv * 2.4;
      drawTape();
    }
    /* 読み取り: 列をまたいだら鳴らす */
    const col = Math.floor(tapePos);
    if (col !== lastCol && adv > 0) {
      for (let r = 0; r < ROWS; r++) {
        if (holes[col][r]) {
          S.boxNote(FREQS[r], 0.14);
          teeth[r].userData.t = 0.22;
          playedN++;
        }
      }
      lastCol = col;
    } else if (adv <= 0) {
      lastCol = col;
    }
    /* 歯のはじけアニメ */
    teeth.forEach(t => {
      if (t.userData.t > 0) {
        t.userData.t -= dt;
        t.rotation.z = Math.sin(t.userData.t * 40) * 0.18 * (t.userData.t / 0.22);
      } else {
        t.rotation.z = 0;
      }
    });

    if (window.__dbgOR) window.__dbgOR({
      pos: +tapePos.toFixed(2), col, played: playedN,
      holes: holes.flat().filter(Boolean).length, v: +turnV.toFixed(2),
    });

    GUIDE.tick(dt);
    stage3.applyCamera();
    stage3.renderer.render(scene, stage3.camera);
  }

  return {
    start(el) {
      time = 0;
      tapePos = 0; lastCol = 0; playedN = 0; turnV = 0;
      dragId = null; orbitId = null; orbitFrom = null;
      holes = [];
      for (let c = 0; c < COLS; c++) {
        holes.push(new Array(ROWS).fill(false));
        if (c < STAR.length && STAR[c] >= 0) holes[c][STAR[c]] = true;
      }

      stage3 = G3.createStage(el, {
        target: new THREE.Vector3(-40, 260, 40),
        radius: 1100, radiusPortraitBase: 1400, radiusMaxPortrait: 2300,
        az: 0.1, po: 0.92,
      });
      build();

      const dom = stage3.renderer.domElement;
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);

      /* ガイド: ハンドルをぐるぐる → (曲が鳴ったら) テープをポチポチ */
      GUIDE.start(stage3, [
        {
          kind: 'turn', at: () => crank, r: 110,
          when: () => playedN < 8,
          done: () => playedN >= 8,
        },
        {
          kind: 'tap', at: () => tapeMesh,
          when: () => playedN >= 8 && Math.abs(turnV) < 0.15,
          done: () => holes.flat().filter(Boolean).length !== 14,
        },
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
