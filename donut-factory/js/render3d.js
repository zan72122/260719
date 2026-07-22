'use strict';
/* ============================================================
 * render3d.js — Three.js シーン全体（ガチ機械工場エディション）
 *  カメラ: 固定の斜め見下ろし（縦画面では 90° 回した方向から見る）
 *  ビジュアル: パステル×メカ。歯車・ピストン・タンク・アームが常時稼働し、
 *  ドーナツ通過時に大アクション。画面揺れ・ズームバウンス・閃光つき。
 * ============================================================ */

const Render3D = (() => {
  const T = window.THREE;
  let renderer = null, scene = null, camera = null;
  let hemiLight, dirLight, gradientTex;
  let levelGroup = null;
  let levelGC = [];                    // レベルごとに破棄するリソース
  const tileViews = [];
  let beltTex = null;
  let guideRing = null, guideFinger = null;
  let vw = 1, vh = 1;
  const raycaster = new T.Raycaster();
  const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), -BELT_TOP);
  const _v3 = new T.Vector3();

  // ---- カメラFX ----
  const camFX = {
    basePos: new T.Vector3(),
    shakeAmp: 0,
    punchP: 0, punchV: 0,
  };
  // ---- 閃光プール ----
  const flashPool = [];

  // 共有ジオメトリ（レベルをまたいで使い回す・破棄しない）
  const geoCache = new Map();
  function cachedGeo(key, maker) {
    if (!geoCache.has(key)) geoCache.set(key, maker());
    return geoCache.get(key);
  }

  /* ============================ 基本セットアップ ============================ */

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(46, 1, 50, 6000);
    scene.add(camera);

    // トゥーン用グラデーション（3段）
    gradientTex = new T.DataTexture(new Uint8Array([130, 200, 255]), 3, 1, T.RedFormat);
    gradientTex.minFilter = T.NearestFilter;
    gradientTex.magFilter = T.NearestFilter;
    gradientTex.needsUpdate = true;

    hemiLight = new T.HemisphereLight(0xfff5fa, 0xffe3c8, 0.62);
    scene.add(hemiLight);
    dirLight = new T.DirectionalLight(0xfff4e2, 0.46);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.radius = 7;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    scene.add(dirLight.target);

    Donut3D.init(T, scene, gradientTex);
    Particles.initScene(T, scene);

    beltTex = makeBeltTexture();

    // 閃光スプライト（加算合成）
    const flashTex = makeRadialTexture();
    for (let i = 0; i < 5; i++) {
      const m = new T.SpriteMaterial({
        map: flashTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      });
      const sp = new T.Sprite(m);
      sp.visible = false;
      scene.add(sp);
      flashPool.push({ sprite: sp, life: 0, maxLife: 0.3, size: 100 });
    }

    // おてほんガイド
    guideRing = new T.Mesh(
      new T.TorusGeometry(56, 5, 10, 36).rotateX(Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0xffd642, transparent: true, opacity: 0.9, depthWrite: false })
    );
    guideRing.visible = false;
    scene.add(guideRing);
    guideFinger = textSprite('👆', 88, { permanent: true });
    guideFinger.visible = false;
    scene.add(guideFinger);
  }

  function makeBeltTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#f4eef7';
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#cfc2df';
    c.lineWidth = 9;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const bx = 20 + i * 43;
      c.beginPath();
      c.moveTo(bx - 11, 26);
      c.lineTo(bx + 11, 64);
      c.lineTo(bx - 11, 102);
      c.stroke();
    }
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  function makeRadialTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(cv);
  }

  /* ============================ ど派手FX API ============================ */

  // 画面揺れ（strength はワールド単位。10〜16 でズシン）
  function shake(strength) {
    camFX.shakeAmp = Math.max(camFX.shakeAmp, strength);
  }

  // ズームバウンス（0.3〜1.0）
  function punch(strength) {
    camFX.punchV += strength * 1.6;
  }

  // 閃光（ワールド座標 x, z）
  function flash(x, z, color, size) {
    for (const f of flashPool) {
      if (f.life <= 0) {
        f.life = f.maxLife;
        f.size = size || 120;
        f.sprite.material.color.set(color || '#ffffff');
        f.sprite.position.set(x, 46, z);
        f.sprite.visible = true;
        return;
      }
    }
  }

  function updateFX(dt) {
    // shake: はやい減衰
    if (camFX.shakeAmp > 0.05) {
      camFX.shakeAmp *= Math.pow(0.0004, dt);
      const a = camFX.shakeAmp;
      // カメラのローカル右/上方向にランダムオフセット
      _v3.setFromMatrixColumn(camera.matrix, 0);   // right
      const ox = (Math.random() - 0.5) * 2 * a;
      const oy = (Math.random() - 0.5) * 2 * a;
      camera.position.copy(camFX.basePos)
        .addScaledVector(_v3, ox);
      _v3.setFromMatrixColumn(camera.matrix, 1);   // up
      camera.position.addScaledVector(_v3, oy);
    } else if (camFX.shakeAmp !== 0) {
      camFX.shakeAmp = 0;
      camera.position.copy(camFX.basePos);
    }
    // punch: ばねで戻るズーム
    if (Math.abs(camFX.punchP) > 0.0004 || Math.abs(camFX.punchV) > 0.0004) {
      camFX.punchV += (-170 * camFX.punchP - 13 * camFX.punchV) * dt;
      camFX.punchP += camFX.punchV * dt;
      camera.zoom = 1 + clamp(camFX.punchP, -0.25, 0.3);
      camera.updateProjectionMatrix();
    } else if (camera.zoom !== 1) {
      camera.zoom = 1;
      camFX.punchP = camFX.punchV = 0;
      camera.updateProjectionMatrix();
    }
    // flash
    for (const f of flashPool) {
      if (f.life > 0) {
        f.life -= dt;
        const k = Math.max(0, f.life / f.maxLife);
        f.sprite.scale.set(f.size * (1.6 - k * 0.6), f.size * (1.6 - k * 0.6), 1);
        f.sprite.material.opacity = k * 0.85;
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
  }

  /* ============================ 素材ヘルパー ============================ */

  const mat = (hex, opts) => Donut3D.toonMat(hex, opts);
  const METAL = '#a89fb8';       // 機械のジョイント色
  const METAL_DARK = '#8f87a3';
  const BOLT = '#cdc6dc';

  function mkBox(w, h, d, hex, shadow) {
    const g = cachedGeo(`box:${w}:${h}:${d}`, () => new T.BoxGeometry(w, h, d));
    const m = new T.Mesh(g, mat(hex));
    if (shadow) m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function mkCyl(rTop, rBottom, h, hex, seg = 12, shadow) {
    const g = cachedGeo(`cyl:${rTop}:${rBottom}:${h}:${seg}`, () => new T.CylinderGeometry(rTop, rBottom, h, seg));
    const m = new T.Mesh(g, mat(hex));
    if (shadow) m.castShadow = true;
    return m;
  }

  function mkSphere(r, hex, seg = 10, shadow) {
    const g = cachedGeo(`sph:${r}:${seg}`, () => new T.SphereGeometry(r, seg, Math.max(6, seg - 2)));
    const m = new T.Mesh(g, mat(hex));
    if (shadow) m.castShadow = true;
    return m;
  }

  function textSprite(text, worldSize, opts = {}) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    drawSpriteText(c, text, opts);
    const tex = new T.CanvasTexture(cv);
    const sm = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new T.Sprite(sm);
    sp.scale.set(worldSize, worldSize, 1);
    sp.userData = { cv, c, tex, text };
    if (!opts.permanent) { levelGC.push(tex); levelGC.push(sm); }
    return sp;
  }

  function drawSpriteText(c, text, opts = {}) {
    c.clearRect(0, 0, 128, 128);
    c.font = `bold ${opts.px || 92}px -apple-system, "Segoe UI Emoji", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (opts.bubble) {
      c.fillStyle = opts.bubble;
      c.beginPath();
      c.arc(64, 64, 58, 0, TAU);
      c.fill();
    }
    if (opts.strokeStyle) {
      c.lineWidth = 10;
      c.strokeStyle = opts.strokeStyle;
      c.strokeText(text, 64, 68);
    }
    c.fillStyle = opts.color || '#ffffff';
    c.fillText(text, 64, 68);
  }

  function updateSpriteText(sp, text, opts) {
    if (sp.userData.text === text) return;
    sp.userData.text = text;
    drawSpriteText(sp.userData.c, text, opts);
    sp.userData.tex.needsUpdate = true;
  }

  /* ============================ 機械部品ライブラリ ============================ */

  // 歯車ジオメトリ（XY平面・z軸まわりに回す）
  function gearGeo(r, teeth, depth) {
    return cachedGeo(`gear:${r}:${teeth}:${depth}`, () => {
      const s = new T.Shape();
      const ri = r * 0.8, ro = r;
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * TAU;
        const a1 = ((i + 0.35) / teeth) * TAU;
        const a2 = ((i + 0.5) / teeth) * TAU;
        const a3 = ((i + 0.85) / teeth) * TAU;
        if (i === 0) s.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
        else s.lineTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
        s.lineTo(Math.cos(a1) * ro, Math.sin(a1) * ro);
        s.lineTo(Math.cos(a2) * ro, Math.sin(a2) * ro);
        s.lineTo(Math.cos(a3) * ri, Math.sin(a3) * ri);
      }
      s.closePath();
      const hole = new T.Path();
      hole.absarc(0, 0, r * 0.28, 0, TAU, true);
      s.holes.push(hole);
      const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
      g.translate(0, 0, -depth / 2);
      return g;
    });
  }

  // 歯車メッシュ + 常時回転の登録
  function addGear(view, parent, r, teeth, hex, speed, opts = {}) {
    const gm = new T.Mesh(gearGeo(r, teeth, opts.depth || 5), mat(hex));
    gm.castShadow = true;
    if (opts.flat) gm.rotation.x = -Math.PI / 2;   // 水平に寝かせる
    if (opts.x !== undefined) gm.position.set(opts.x, opts.y || 0, opts.z || 0);
    parent.add(gm);
    view.spinners.push({ obj: gm, axis: opts.flat ? 'y' : 'z', speed, flat: opts.flat });
    return gm;
  }

  // タンク（円筒 + ドーム + まど + リベット）
  function makeTank(r, h, hex, windowHex) {
    const g = new T.Group();
    const body = mkCyl(r, r, h, hex, 14, true);
    body.position.y = h / 2;
    g.add(body);
    const dome = mkSphere(r, hex, 14, true);
    dome.scale.set(1, 0.55, 1);
    dome.position.y = h;
    g.add(dome);
    if (windowHex) {
      const win = mkBox(r * 1.1, h * 0.45, r * 0.55, windowHex);
      win.position.set(0, h * 0.45, r * 0.55);
      g.add(win);
    }
    for (let i = 0; i < 4; i++) {
      const b = mkCyl(2.2, 2.2, 3, BOLT, 6);
      const a = (i / 4) * TAU + 0.4;
      b.position.set(Math.cos(a) * r * 0.8, h + r * 0.35, Math.sin(a) * r * 0.8);
      g.add(b);
    }
    return g;
  }

  // ピストン（ハウジング + 動くロッド）。rod を返すので y を動かす
  function makePiston(g, x, y, z, hex) {
    const housing = mkCyl(7, 8, 14, METAL, 10, true);
    housing.position.set(x, y, z);
    g.add(housing);
    const rod = new T.Group();
    const shaft = mkCyl(3, 3, 18, BOLT, 8);
    shaft.position.y = 9;
    rod.add(shaft);
    const cap = mkCyl(6, 6, 5, hex || '#ff9ec7', 10, true);
    cap.position.y = 19;
    rod.add(cap);
    rod.position.set(x, y, z);
    g.add(rod);
    return rod;
  }

  // 支柱つきガントリー（門型フレーム）。バー中心 y=62
  function makeGantry(hexBody, hexEdge) {
    const g = new T.Group();
    for (const s of [-1, 1]) {
      const leg = mkBox(18, 62, 14, hexEdge, true);
      leg.position.set(0, 31, s * (LANE_W / 2 + 12));
      g.add(leg);
      const foot = mkBox(26, 8, 20, METAL);
      foot.position.set(0, 4, s * (LANE_W / 2 + 12));
      g.add(foot);
      for (const bx of [-8, 8]) {
        const bolt = mkCyl(2.4, 2.4, 3, BOLT, 6);
        bolt.position.set(bx, 9, s * (LANE_W / 2 + 12));
        g.add(bolt);
      }
    }
    const bar = new T.Mesh(cachedGeo('gantrybar', () => new T.BoxGeometry(26, 18, LANE_W + 38)), mat(hexBody));
    bar.castShadow = true;
    bar.position.y = 62;
    g.add(bar);
    g.userData.bar = bar;
    return g;
  }

  // 機械の土台（ボルトつきの分厚いプラットフォーム）
  function makeBase(hex) {
    const g = new T.Group();
    const p = mkBox(94, 10, 94, hex);
    p.position.y = 5;
    p.receiveShadow = true;
    g.add(p);
    for (const [x, z] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
      const b = mkCyl(3, 3, 4, BOLT, 6);
      b.position.set(x, 11, z);
      g.add(b);
    }
    return g;
  }

  function arrowGeo(scale = 1, depth = 9) {
    return cachedGeo(`arrow:${scale}:${depth}`, () => {
      const s = new T.Shape();
      const pts = [[-16, -10], [6, -10], [6, -20], [30, 0], [6, 20], [6, 10], [-16, 10]];
      s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0] * scale, pts[i][1] * scale);
      s.closePath();
      const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2, bevelSegments: 2 });
      g.rotateX(Math.PI / 2);
      return g;
    });
  }

  function makeSpringGeo(coils = 3, r = 14, h = 26, tube = 2.6) {
    return cachedGeo(`spring:${coils}:${r}:${h}:${tube}`, () => {
      class Helix extends T.Curve {
        getPoint(t) {
          const a = t * TAU * coils;
          return new T.Vector3(Math.cos(a) * r, t * h + 2, Math.sin(a) * r);
        }
      }
      return new T.TubeGeometry(new Helix(), 16 * coils, tube, 6, false);
    });
  }

  function makeStripeTexture() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 8;
    const c = cv.getContext('2d');
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 === 0 ? '#ff6f6f' : '#ffffff';
      c.fillRect(i * 8, 0, 8, 8);
    }
    return new T.CanvasTexture(cv);
  }

  function makeDrumTexture(colors) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = colors[i % colors.length];
      c.save();
      c.translate(8 + (i % 4) * 16, 8 + Math.floor(i / 4) * 22);
      c.rotate(i * 1.2);
      c.fillRect(-6, -2.4, 12, 4.8);
      c.restore();
    }
    return new T.CanvasTexture(cv);
  }

  /* ============================ ベルトレーン ============================ */

  const yawOf = dir => -DIR_ANGLE[dir];

  // 立体コンベア: 脚 + フレーム + 端ドラム + 駆動歯車 + 流れるシェブロン
  function makeLane(view, withChevron, len = CELL, xOff = 0) {
    const g = new T.Group();
    // 脚
    for (const [lx, lz] of [[-36, -26], [36, -26], [-36, 26], [36, 26]]) {
      const leg = mkBox(9, 7, 9, METAL_DARK);
      leg.position.set(xOff + lx * (len / CELL), 3.5, lz);
      g.add(leg);
    }
    // ベッド（ベルトの土台）
    const bed = mkBox(len - 2, 7, LANE_W, '#e4dcee');
    bed.position.set(xOff, 10.5, 0);
    bed.castShadow = true;
    g.add(bed);
    // サイドフレーム
    for (const s of [-1, 1]) {
      const rail = mkBox(len, 9, 7, '#cfc4e0');
      rail.position.set(xOff, 11.5, s * (LANE_W / 2 + 4.5));
      rail.castShadow = true;
      g.add(rail);
    }
    // 端ドラム（ローラー）
    for (const e of [-1, 1]) {
      const drum = mkCyl(6, 6, LANE_W - 2, '#c4b8d8', 10);
      drum.rotation.x = Math.PI / 2;
      drum.position.set(xOff + e * (len / 2 - 5), 11, 0);
      g.add(drum);
      const capA = mkCyl(3.4, 3.4, 4, BOLT, 6);
      capA.rotation.x = Math.PI / 2;
      capA.position.set(xOff + e * (len / 2 - 5), 11, LANE_W / 2 + 1);
      g.add(capA);
    }
    // 駆動歯車（外側で常時回転）
    if (view) {
      addGear(view, g, 6.5, 10, '#b9aed0', 3.2, { x: xOff + len * 0.24, y: 10, z: LANE_W / 2 + 9, depth: 4 });
    }
    // ベルト面（流れるシェブロン）
    if (withChevron) {
      const pg = cachedGeo(`lane:${len}`, () => new T.PlaneGeometry(len - 4, LANE_W - 4));
      const pm = new T.MeshToonMaterial({ map: beltTex, gradientMap: gradientTex });
      levelGC.push(pm);
      const p = new T.Mesh(pg, pm);
      p.rotation.x = -Math.PI / 2;
      p.position.set(xOff, BELT_TOP + 0.4, 0);
      p.receiveShadow = true;
      g.add(p);
    }
    return g;
  }

  function makeHalfLane(view, dir) {
    const g = new T.Group();
    g.rotation.y = yawOf(dir);
    g.add(makeLane(view, true, CELL / 2 + 6, CELL / 4 + 6));
    return g;
  }

  /* ============================ タイルビュー ============================ */

  function buildTileView(tile, theme) {
    const g = new T.Group();
    g.position.set((tile.x + 0.5) * CELL, 0, (tile.y + 0.5) * CELL);
    const view = { tile, group: g, update: null, spinners: [] };
    const B = BUILDERS[tile.type] || BUILDERS.belt;
    B(view, tile, theme);
    const inner = view.popTarget || g;
    const baseUpdate = view.update;
    view.update = (dt, time, game) => {
      // pop でバウンス + 設置時の「ぽこっ」
      let s = 1 + 0.13 * Math.sin(Math.min(1, tile.pop) * Math.PI);
      if (tile.spawnAnim > 0) {
        tile.spawnAnim = Math.max(0, tile.spawnAnim - dt * 3.2);
        s *= Math.max(0.05, easeOutBack(1 - tile.spawnAnim));
      }
      inner.scale.set(s, s, s);
      // 常時回転（pop で加速・停電で停止）
      const flow = game.flow ? game.flow() : game.speed;
      const boost = 1 + tile.pop * 2.5;
      for (const sp of view.spinners) {
        sp.obj.rotation[sp.axis] += sp.speed * dt * flow * boost;
      }
      if (baseUpdate) baseUpdate(dt, time, game);
    };
    return view;
  }

  // ユーザー設置タイルの動的追加/削除
  function addTileView(tile) {
    const v = buildTileView(tile, Game.level.theme);
    levelGroup.add(v.group);
    tileViews.push(v);
  }
  function removeTileView(tile) {
    const i = tileViews.findIndex(v => v.tile === tile);
    if (i >= 0) {
      levelGroup.remove(tileViews[i].group);
      tileViews.splice(i, 1);
    }
  }

  /* ---- 17種の装置ビルダーは builders 部で BUILDERS に登録 ---- */
  const BUILDERS = {};

  /* ============================ レベル構築 ============================ */

  function buildLevel(game) {
    if (levelGroup) {
      scene.remove(levelGroup);
      for (const r of levelGC) { try { r.dispose(); } catch (e) {} }
      levelGC = [];
    }
    tileViews.length = 0;
    Donut3D.clear();
    Particles.clear();
    camFX.shakeAmp = 0; camFX.punchP = 0; camFX.punchV = 0;

    const theme = game.level.theme;
    scene.background = new T.Color(theme.bg);
    env.baseBg.set(theme.bg);
    env.dark = 0; env.rain = 0;

    levelGroup = new T.Group();
    scene.add(levelGroup);

    const bw = game.cols * CELL, bh = game.rows * CELL;

    // ボードパネル（角丸）
    const panelShape = new T.Shape();
    const px = -16, py = -16, pw = bw + 32, ph = bh + 32, pr = 30;
    panelShape.moveTo(px + pr, py);
    panelShape.lineTo(px + pw - pr, py);
    panelShape.quadraticCurveTo(px + pw, py, px + pw, py + pr);
    panelShape.lineTo(px + pw, py + ph - pr);
    panelShape.quadraticCurveTo(px + pw, py + ph, px + pw - pr, py + ph);
    panelShape.lineTo(px + pr, py + ph);
    panelShape.quadraticCurveTo(px, py + ph, px, py + ph - pr);
    panelShape.lineTo(px, py + pr);
    panelShape.quadraticCurveTo(px, py, px + pr, py);
    const panelGeo = new T.ExtrudeGeometry(panelShape, { depth: 18, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 2 });
    panelGeo.rotateX(Math.PI / 2);
    levelGC.push(panelGeo);
    const panel = new T.Mesh(panelGeo, mat(theme.floorA));
    panel.receiveShadow = true;
    levelGroup.add(panel);

    // チェッカーゆか + かざり
    const cellGeo = cachedGeo('floorcell', () => {
      const g = new T.PlaneGeometry(CELL, CELL);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const cellCol = new T.Color(theme.floorB).multiplyScalar(0.93);
    const cellMat = mat('#' + cellCol.getHexString());
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        if ((x + y) % 2 === 1) {
          const cm = new T.Mesh(cellGeo, cellMat);
          cm.position.set((x + 0.5) * CELL, 4.6, (y + 0.5) * CELL);
          cm.receiveShadow = true;
          levelGroup.add(cm);
        }
        if (!game.tiles[y][x]) {
          const rng = mulberry32(x * 73 + y * 131 + game.levelIndex * 17);
          if (rng() < 0.16) addFloorDeco(levelGroup, x, y, rng);
        }
      }
    }

    for (const tile of game.tileList) {
      const v = buildTileView(tile, theme);
      levelGroup.add(v.group);
      tileViews.push(v);
    }

    dirLight.position.set(bw / 2 - 380, 950, bh / 2 + 430);
    dirLight.target.position.set(bw / 2, 0, bh / 2);
    const sr = Math.max(bw, bh) * 0.72 + 160;
    dirLight.shadow.camera.left = -sr;
    dirLight.shadow.camera.right = sr;
    dirLight.shadow.camera.top = sr;
    dirLight.shadow.camera.bottom = -sr;
    dirLight.shadow.camera.near = 200;
    dirLight.shadow.camera.far = 2400;
    dirLight.shadow.camera.updateProjectionMatrix();

    fitCamera(game);
  }

  function addFloorDeco(parent, x, y, rng) {
    const g = new T.Group();
    g.position.set((x + 0.5) * CELL, 6, (y + 0.5) * CELL);
    g.rotation.y = rng() * TAU;
    const kind = Math.floor(rng() * 3);
    const white = mat('#ffffff');
    const petalGeo = cachedGeo('petal', () => new T.SphereGeometry(7, 8, 6));
    if (kind === 0) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const p = new T.Mesh(petalGeo, white);
        p.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
        p.scale.set(1, 0.35, 1);
        g.add(p);
      }
      const c = new T.Mesh(petalGeo, mat('#ffd94d'));
      c.scale.set(0.8, 0.4, 0.8);
      g.add(c);
    } else if (kind === 1) {
      const s = new T.Mesh(cachedGeo('deco-star', () => new T.OctahedronGeometry(11)), white);
      s.scale.set(1, 0.25, 1);
      g.add(s);
    } else {
      for (let i = 0; i < 3; i++) {
        const p = new T.Mesh(petalGeo, white);
        p.position.set(-8 + i * 8, 0, (i % 2) * 7 - 3);
        const sc = 0.7 - i * 0.15;
        p.scale.set(sc, sc * 0.4, sc);
        g.add(p);
      }
    }
    parent.add(g);
  }

  /* ============================ カメラ ============================ */

  function fitCamera(game) {
    if (!game || !game.level) return;
    const bw = game.cols * CELL, bh = game.rows * CELL;
    const landscapeBoard = bw >= bh;
    const landscapeScreen = vw >= vh;
    const rotated = landscapeBoard !== landscapeScreen;
    const cx = bw / 2, cz = bh / 2;
    const elev = Math.PI / 4;          // 45° 見下ろし
    const aspect = vw / Math.max(1, vh);
    camera.aspect = aspect;

    // 視線方向（縦画面では 90° 回した方位から）
    const ey = Math.sin(elev), eh = Math.cos(elev);
    const u = rotated ? new T.Vector3(eh, ey, 0) : new T.Vector3(0, ey, eh);

    // 仮距離でビュー座標系を作り、全コーナーが収まる最小距離を閉形式で求める
    const D0 = 1000;
    camera.position.set(cx + u.x * D0, u.y * D0, cz + u.z * D0);
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld(true);
    const inv = camera.matrixWorldInverse;

    const tanV = Math.tan((camera.fov * Math.PI / 180) / 2);
    const tanH = tanV * aspect;
    let D = 400;
    for (const x of [-28, bw + 28]) {
      for (const z of [-28, bh + 28]) {
        for (const y of [-10, 150]) {
          _v3.set(x, y, z).applyMatrix4(inv);
          const qx = _v3.x, qy = _v3.y, qz = _v3.z + D0;
          D = Math.max(D, qz + Math.abs(qy) * 1.03 / tanV);
          D = Math.max(D, qz + Math.abs(qx) * 1.02 / tanH);
        }
      }
    }

    camera.position.set(cx + u.x * D, u.y * D, cz + u.z * D);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld(true);
    camFX.basePos.copy(camera.position);
    camera.near = Math.max(40, D * 0.18);
    camera.far = D * 3 + 1500;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
  }

  function resize(w, h, dpr, game) {
    vw = w; vh = h;
    renderer.setPixelRatio(Math.min(2, dpr || 1));
    renderer.setSize(w, h, false);
    fitCamera(game);
  }

  /* ============================ 入力 ============================ */

  function screenToWorld(sx, sy) {
    const ndc = { x: (sx / vw) * 2 - 1, y: -(sy / vh) * 2 + 1 };
    raycaster.setFromCamera(ndc, camera);
    const out = new T.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, out)) {
      return { x: out.x, y: out.z };
    }
    return { x: -9999, y: -9999 };
  }

  function worldToScreen(wx, wy) {
    _v3.set(wx, BELT_TOP, wy).project(camera);
    return { x: (_v3.x + 1) / 2 * vw, y: (1 - _v3.y) / 2 * vh };
  }

  /* ============================ 環境（あめ・ていでん） ============================ */

  const env = {
    dark: 0, rain: 0,
    baseBg: new T.Color('#ffd9ec'),
    darkBg: new T.Color('#2a2440'),
    rainBg: new T.Color('#b9c6dc'),
    tmp: new T.Color(),
  };

  function updateEnvironment(game, dt) {
    const ev = game.event;
    let tDark = 0, tRain = 0;
    if (ev) {
      if (ev.type === 'blackout') tDark = 1 - (ev.data.restore || 0);
      if (ev.type === 'rain') tRain = 1;
    }
    env.dark += (tDark - env.dark) * Math.min(1, dt * 3);
    env.rain += (tRain - env.rain) * Math.min(1, dt * 2);
    hemiLight.intensity = 0.62 * (1 - env.dark * 0.92) * (1 - env.rain * 0.15);
    dirLight.intensity = 0.46 * (1 - env.dark * 0.96);
    env.tmp.copy(env.baseBg);
    if (env.rain > 0.01) env.tmp.lerp(env.rainBg, env.rain * 0.55);
    if (env.dark > 0.01) env.tmp.lerp(env.darkBg, env.dark);
    if (scene.background && scene.background.isColor) scene.background.copy(env.tmp);
    // あめつぶ
    if (env.rain > 0.4) {
      for (let i = 0; i < 3; i++) {
        Particles.spawn({
          kind: 'drop',
          x: rand(-40, game.cols * CELL + 40), z: rand(-40, game.rows * CELL + 40),
          h: 175, vx: 6, vz: 4, vh: -420, g: 0,
          maxLife: 0.45, size: 6, color: '#9ec8f0',
        });
      }
    }
  }

  /* ============================ 毎フレーム ============================ */

  function render(game, dt) {
    beltTex.offset.x -= dt * (game.flow ? game.flow() : game.speed) * 0.9;

    for (const v of tileViews) v.update(dt, game.time, game);

    Donut3D.sync(game, game.time);
    Particles.sync();
    updateFX(dt);
    updateEnvironment(game, dt);

    if (game.guide) {
      const c = tileCenter(game.guide.tile);
      const t = game.time - game.guide.t0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      guideRing.visible = true;
      guideRing.position.set(c.x, 24, c.y);
      const rs = 1 + pulse * 0.18;
      guideRing.scale.set(rs, 1, rs);
      guideRing.material.opacity = 0.55 + pulse * 0.4;
      const tap = Math.max(0, Math.sin(t * 5));
      guideFinger.visible = true;
      guideFinger.position.set(c.x + 34, 72 - tap * 18, c.y + 40);
    } else {
      guideRing.visible = false;
      guideFinger.visible = false;
    }

    renderer.render(scene, camera);
  }

  return {
    init, buildLevel, fitCamera, resize, render, screenToWorld, worldToScreen,
    shake, punch, flash, addTileView, removeTileView,
    // builders 部（render3d-machines.js）が使う内部API
    _internals: {
      get T() { return T; },
      mat, mkBox, mkCyl, mkSphere, textSprite, updateSpriteText,
      addGear, gearGeo, makeTank, makePiston, makeGantry, makeBase,
      arrowGeo, makeSpringGeo, makeStripeTexture, makeDrumTexture, makeRadialTexture,
      makeLane, makeHalfLane, yawOf, cachedGeo,
      BUILDERS,
      gc: (r) => levelGC.push(r),
      // 縦画面（90°回した方位から見ている）かどうか
      isRotated: () => {
        const g = window.Game;
        if (!g || !g.level) return false;
        return (g.cols >= g.rows) !== (vw >= vh);
      },
      METAL, METAL_DARK, BOLT,
      get gradientTex() { return gradientTex; },
    },
  };
})();
