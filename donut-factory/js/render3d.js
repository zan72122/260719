'use strict';
/* ============================================================
 * render3d.js — Three.js シーン全体
 *  カメラ: 固定の斜め見下ろし（縦画面では 90° 回した方向から見る）
 *  ビジュアル: パステルおもちゃ風トゥーン
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

  /* ============================ 基本セットアップ ============================ */

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 10, 5000);
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

    // ベルトのシェブロン模様（全レーン共有・offset で流す）
    beltTex = makeBeltTexture();

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

  const mat = (hex, opts) => Donut3D.toonMat(hex, opts);

  function mkBox(w, h, d, hex, shadow) {
    const g = new T.BoxGeometry(w, h, d);
    levelGC.push(g);
    const m = new T.Mesh(g, mat(hex));
    if (shadow) m.castShadow = true;
    m.receiveShadow = true;
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

  /* ============================ レーン部品 ============================ */

  const yawOf = dir => -DIR_ANGLE[dir];

  // レーン（ベルト面）: +x 方向に流れる。laneGroup ごと回して向きを出す
  function makeLane(withChevron, len = CELL, xOff = 0) {
    const g = new T.Group();
    const base = mkBox(len, BELT_TOP, LANE_W + 4, '#e7e0ee');
    base.position.set(xOff, BELT_TOP / 2, 0);
    g.add(base);
    if (withChevron) {
      const pg = new T.PlaneGeometry(len - 4, LANE_W - 4);
      levelGC.push(pg);
      const pm = new T.MeshToonMaterial({ map: beltTex, gradientMap: gradientTex });
      levelGC.push(pm);
      const p = new T.Mesh(pg, pm);
      p.rotation.x = -Math.PI / 2;
      p.position.set(xOff, BELT_TOP + 0.4, 0);
      p.receiveShadow = true;
      g.add(p);
    }
    // 両サイドのレール
    for (const s of [-1, 1]) {
      const rail = mkBox(len, 11, 7, '#d5c9e2');
      rail.position.set(xOff, 5.5, s * (LANE_W / 2 + 5));
      g.add(rail);
    }
    return g;
  }

  function makeHalfLane(dir) {
    const g = new T.Group();
    g.rotation.y = yawOf(dir);
    g.add(makeLane(true, CELL / 2 + 6, CELL / 4 + 6));
    return g;
  }

  function makePlate(hex) {
    const p = mkBox(93, 7, 93, hex);
    p.position.y = 3.5;
    p.receiveShadow = true;
    return p;
  }

  // アーチ（門型マシン）: laneGroup 内に置く
  function makeArch(hex, edgeHex) {
    const g = new T.Group();
    for (const s of [-1, 1]) {
      const post = mkBox(20, 52, 16, edgeHex, true);
      post.position.set(0, 26, s * (LANE_W / 2 + 10));
      g.add(post);
    }
    const bar = new T.Mesh(new T.BoxGeometry(38, 24, LANE_W + 34), mat(hex));
    levelGC.push(bar.geometry);
    bar.castShadow = true;
    bar.position.y = 56;
    g.add(bar);
    g.userData.bar = bar;
    return g;
  }

  function arrowGeo(scale = 1, depth = 9) {
    const s = new T.Shape();
    const pts = [[-16, -10], [6, -10], [6, -20], [30, 0], [6, 20], [6, 10], [-16, 10]];
    s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0] * scale, pts[i][1] * scale);
    s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2, bevelSegments: 2 });
    g.rotateX(Math.PI / 2);
    levelGC.push(g);
    return g;
  }

  /* ============================ タイルビュー ============================ */

  function buildTileView(tile, theme) {
    const g = new T.Group();
    g.position.set((tile.x + 0.5) * CELL, 0, (tile.y + 0.5) * CELL);
    const view = { tile, group: g, update: null };
    const B = BUILDERS[tile.type] || BUILDERS.belt;
    B(view, tile, theme);
    // 共通: pop でバウンス
    const inner = view.popTarget || g;
    const baseUpdate = view.update;
    view.update = (dt, time, game) => {
      const s = 1 + 0.13 * Math.sin(Math.min(1, tile.pop) * Math.PI);
      inner.scale.set(s, s, s);
      if (baseUpdate) baseUpdate(dt, time, game);
    };
    return view;
  }

  const BUILDERS = {

    belt(view, tile) {
      const lane = makeLane(true);
      view.group.add(lane);
      view.update = () => {
        lane.rotation.y = yawOf(tile.dir) + tile.rotAnim * (Math.PI / 2);
      };
    },

    spawner(view, tile) {
      const g = view.group;
      g.add(makePlate('#ffe0ef'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      // しぼり袋のマシン
      const bag = new T.Group();
      const body = new T.Mesh(new T.SphereGeometry(26, 16, 14), mat('#ff9ec7'));
      levelGC.push(body.geometry);
      body.scale.set(1, 1.15, 1);
      body.castShadow = true;
      body.position.y = 52;
      bag.add(body);
      const tip = new T.Mesh(new T.CylinderGeometry(8, 12, 16, 10), mat('#ffd7e8'));
      levelGC.push(tip.geometry);
      tip.position.y = 24;
      bag.add(tip);
      const face = textSprite('😊', 34, { px: 96 });
      face.position.set(0, 58, 0);
      bag.add(face);
      g.add(bag);
      view.popTarget = bag;
      view.update = (dt, time) => {
        bag.position.y = Math.sin(time * 2.4 + tile.x) * 2;
        lane.rotation.y = yawOf(tile.dir);
      };
    },

    box(view, tile) {
      const g = view.group;
      g.add(makePlate('#ffd9b0'));
      const bx = new T.Group();
      // 箱（そこ + 4かべ + リボン）
      const bottom = mkBox(70, 6, 70, '#ff9ec7', true);
      bottom.position.y = 6;
      bx.add(bottom);
      for (const [x, z, w, d] of [[0, -33, 70, 8], [0, 33, 70, 8], [-33, 0, 8, 70], [33, 0, 8, 70]]) {
        const wall = mkBox(w, 30, d, '#ff9ec7', true);
        wall.position.set(x, 20, z);
        bx.add(wall);
      }
      const ribbon = mkBox(74, 8, 12, '#ff6f9c');
      ribbon.position.y = 34;
      bx.add(ribbon);
      // なかのミニドーナツ
      const minis = [];
      const miniGeo = new T.TorusGeometry(9, 5.5, 8, 14).rotateX(Math.PI / 2);
      levelGC.push(miniGeo);
      const miniCols = ['#ff9ec7', '#8a5a3b', '#9edcff'];
      for (let i = 0; i < 3; i++) {
        const md = new T.Mesh(miniGeo, mat(miniCols[i]));
        md.position.set(-16 + i * 16, 14, 6);
        md.visible = false;
        bx.add(md);
        minis.push(md);
      }
      // カウント
      const label = textSprite('0', 56, { color: '#b2557f', strokeStyle: '#ffffff' });
      label.position.y = 66;
      bx.add(label);
      g.add(bx);
      view.popTarget = bx;
      view.update = () => {
        const shipK = tile.shipT > 0 ? Math.max(0.05, easeOutBack(1 - tile.shipT)) : 1;
        bx.scale.set(shipK, shipK, shipK);
        updateSpriteText(label, String(tile.count), { color: '#b2557f', strokeStyle: '#ffffff' });
        for (let i = 0; i < 3; i++) minis[i].visible = i < Math.min(3, tile.count);
      };
    },

    froster(view, tile) {
      const g = view.group;
      g.add(makePlate('#fdeaf4'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const barMat = new T.MeshToonMaterial({ color: new T.Color(FROST_COLORS[tile.color].fill), gradientMap: gradientTex });
      levelGC.push(barMat);
      const arch = makeArch('#ffffff', '#e8b8d2');
      arch.userData.bar.material = barMat;
      lane.add(arch);
      // したたるフロスティング
      const drips = [];
      const dripMat = new T.MeshToonMaterial({ color: new T.Color(FROST_COLORS[tile.color].edge), gradientMap: gradientTex });
      levelGC.push(dripMat);
      const dripGeo = new T.SphereGeometry(6, 8, 7);
      levelGC.push(dripGeo);
      for (let i = -1; i <= 1; i++) {
        const dr = new T.Mesh(dripGeo, dripMat);
        dr.position.set(0, 38, i * 16);
        dr.scale.set(0.8, 1.4, 0.8);
        lane.add(dr);
        drips.push(dr);
      }
      let lastColor = tile.color;
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        if (lastColor !== tile.color) {
          lastColor = tile.color;
          barMat.color.set(FROST_COLORS[tile.color].fill);
          dripMat.color.set(FROST_COLORS[tile.color].edge);
        }
        drips.forEach((dr, i) => {
          dr.position.y = 38 - Math.max(0, Math.sin(time * 2.2 + i * 2.1 + tile.x)) * 7;
        });
      };
    },

    sprinkler(view, tile) {
      const g = view.group;
      g.add(makePlate('#fdf6e0'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const arch = makeArch('#ffe9b8', '#e0c070');
      lane.add(arch);
      // シェーカー
      const shaker = new T.Group();
      const cup = mkBox(26, 24, 26, '#ffffff', true);
      shaker.add(cup);
      const bits = new T.Group();
      shaker.add(bits);
      shaker.position.y = 74;
      lane.add(shaker);
      let lastStyle = null;
      const bitGeo = new T.BoxGeometry(8, 3, 3);
      levelGC.push(bitGeo);
      const rebuildBits = () => {
        lastStyle = tile.style;
        while (bits.children.length) bits.remove(bits.children[0]);
        const style = SPRINKLE_STYLES[tile.style];
        for (let i = 0; i < 5; i++) {
          const b = new T.Mesh(bitGeo, mat(style.colors[i % style.colors.length]));
          b.position.set(-8 + (i % 3) * 8, 13, -6 + Math.floor(i / 3) * 9);
          b.rotation.y = i * 1.1;
          bits.add(b);
        }
      };
      rebuildBits();
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        if (lastStyle !== tile.style) rebuildBits();
        shaker.rotation.x = Math.sin(time * 10 + tile.x) * 0.1;
        shaker.position.y = 74 + Math.sin(time * 10 + tile.x + 1) * 1.6;
      };
    },

    creamer(view, tile) {
      const g = view.group;
      g.add(makePlate('#eaf6fc'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const arch = makeArch('#dff2fb', '#a8cede');
      lane.add(arch);
      // ソフトクリームぐるぐるアイコン
      const swirl = new T.Group();
      const sg = new T.SphereGeometry(9, 10, 8);
      levelGC.push(sg);
      for (let i = 0; i < 3; i++) {
        const s = new T.Mesh(sg, mat('#fffdf6'));
        s.scale.set(1.5 - i * 0.35, 0.62, 1.5 - i * 0.35);
        s.position.y = 66 + i * 8;
        s.castShadow = true;
        swirl.add(s);
      }
      const tip = new T.Mesh(new T.ConeGeometry(4.5, 9, 8), mat('#fffdf6'));
      levelGC.push(tip.geometry);
      tip.position.y = 90;
      tip.rotation.z = 0.3;
      swirl.add(tip);
      lane.add(swirl);
      view.update = () => { lane.rotation.y = yawOf(tile.dir); };
    },

    topper(view, tile) {
      const g = view.group;
      g.add(makePlate('#ffe9ec'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const arch = makeArch('#ffd7dc', '#e898a5');
      lane.add(arch);
      let iconHolder = new T.Group();
      iconHolder.position.y = 74;
      lane.add(iconHolder);
      let lastKind = null;
      const rebuild = () => {
        lastKind = tile.kind;
        while (iconHolder.children.length) iconHolder.remove(iconHolder.children[0]);
        const icon = Donut3D.buildTopper(tile.kind);
        icon.scale.set(1.7, 1.7, 1.7);
        iconHolder.add(icon);
      };
      rebuild();
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        if (lastKind !== tile.kind) rebuild();
        iconHolder.rotation.y = time * 1.2;
      };
    },

    glazer(view, tile) {
      const g = view.group;
      g.add(makePlate('#fdf4e2'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const arch = makeArch('#ffeacb', '#e0c080');
      lane.add(arch);
      // グレーズの滝（半透明カーテン）
      const cg = new T.PlaneGeometry(LANE_W + 14, 38);
      levelGC.push(cg);
      const cm = new T.MeshPhongMaterial({
        color: 0xfff0d8, transparent: true, opacity: 0.5,
        side: T.DoubleSide, depthWrite: false, shininess: 120,
      });
      levelGC.push(cm);
      const curtain = new T.Mesh(cg, cm);
      curtain.rotation.y = Math.PI / 2;
      curtain.position.y = 27;
      lane.add(curtain);
      const spark = textSprite('✨', 30);
      spark.position.y = 68;
      lane.add(spark);
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        cm.opacity = 0.42 + Math.sin(time * 4 + tile.y) * 0.1;
        curtain.scale.y = 1 + Math.sin(time * 6 + tile.x) * 0.04;
      };
    },

    stamper(view, tile) {
      const g = view.group;
      g.add(makePlate('#efe8fc'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      // プレスヘッド
      const head = new T.Group();
      const block = mkBox(58, 30, 58, '#c9b3ef', true);
      head.add(block);
      const shapeIcon = textSprite('⭐', 40, { px: 84 });
      shapeIcon.position.y = 26;
      head.add(shapeIcon);
      head.position.y = 70;
      g.add(head);
      const SHAPE_EMOJI = { star: '⭐', heart: '💗', flower: '🌸', ring: '⭕' };
      view.update = () => {
        lane.rotation.y = yawOf(tile.dir);
        const press = Math.sin(Math.min(1, tile.pressT) * Math.PI);
        head.position.y = 70 - press * 34;
        updateSpriteText(shapeIcon, SHAPE_EMOJI[tile.shape] || '⭐', { px: 84 });
      };
    },

    splitter(view, tile) {
      const g = view.group;
      for (const d of tile.outs) g.add(makeHalfLane(d));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      g.add(makePlate('#e3f2fc'));
      // ゆびさきパドル
      const paddle = new T.Mesh(arrowGeo(0.85, 8), mat('#5cabdf'));
      paddle.castShadow = true;
      paddle.position.y = 14;
      g.add(paddle);
      view.update = (dt, time) => {
        const target = yawOf(tile.outs[tile.flip]);
        const wig = Math.sin(tile.paddleAnim * Math.PI) * 0.5;
        paddle.rotation.y = target + wig;
      };
    },

    switcher(view, tile) {
      const g = view.group;
      for (const d of tile.outs) g.add(makeHalfLane(d));
      g.add(makePlate('#fff1d2'));
      // おおきな矢印レバー
      const am = new T.MeshToonMaterial({
        color: new T.Color('#ffb840'), gradientMap: gradientTex,
        emissive: new T.Color('#ff9500'), emissiveIntensity: 0.25,
      });
      levelGC.push(am);
      const arrow = new T.Mesh(arrowGeo(1.05, 12), am);
      arrow.castShadow = true;
      arrow.position.y = 16;
      g.add(arrow);
      view.update = (dt, time) => {
        const target = yawOf(tile.outs[tile.idx]);
        const wig = Math.sin(tile.paddleAnim * Math.PI) * 0.6;
        arrow.rotation.y = target + wig;
        am.emissiveIntensity = 0.18 + 0.16 * Math.sin(time * 3);
        arrow.position.y = 16 + Math.sin(time * 3) * 1.5;
      };
    },

    cloner(view, tile) {
      const g = view.group;
      g.add(makeHalfLane(tile.side));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      g.add(makePlate('#e2f6e2'));
      const arch = makeArch('#c9efc9', '#8ec98e');
      lane.add(arch);
      // ふたごドーナツのアイコン
      const iconG = new T.Group();
      const mg = new T.TorusGeometry(10, 6, 8, 16).rotateX(Math.PI / 2);
      levelGC.push(mg);
      for (const s of [-1, 1]) {
        const md = new T.Mesh(mg, mat('#ff9ec7'));
        md.position.set(0, 70, s * 11);
        iconG.add(md);
      }
      const x2 = textSprite('×2', 34, { color: '#3f8f3f', strokeStyle: '#ffffff' });
      x2.position.y = 88;
      iconG.add(x2);
      lane.add(iconG);
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        iconG.position.y = Math.sin(time * 2.6) * 2.5;
      };
    },

    random(view, tile) {
      const g = view.group;
      g.add(makePlate('#f8e6fc'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      const arch = makeArch('#f3c9fb', '#cf8fdf');
      lane.add(arch);
      const q = textSprite('?', 46, { color: '#8f3fa5', strokeStyle: '#ffffff' });
      q.position.y = 76;
      lane.add(q);
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        q.material.rotation = tile.spinAnim * TAU * 2;
        q.position.y = 76 + Math.sin(time * 3 + tile.x) * 3;
      };
    },

    wild(view, tile) {
      const g = view.group;
      g.add(makePlate('#e6e2fa'));
      const lane = makeLane(false);
      g.add(lane);
      // ぐるぐる回る4方向の矢印
      const spinner = new T.Group();
      const cone = new T.ConeGeometry(9, 18, 5);
      levelGC.push(cone);
      const cols = ['#ff9ec7', '#9edcff', '#a8d878', '#ffd94d'];
      for (let d = 0; d < 4; d++) {
        const c = new T.Mesh(cone, mat(cols[d]));
        c.rotation.z = -Math.PI / 2;
        c.rotation.y = 0;
        const holder = new T.Group();
        holder.rotation.y = -d * Math.PI / 2;
        c.position.set(34, 14, 0);
        holder.add(c);
        spinner.add(holder);
      }
      g.add(spinner);
      const q = textSprite('?', 42, { color: '#5f55b0', strokeStyle: '#ffffff' });
      q.position.y = 40;
      g.add(q);
      view.update = (dt, time) => {
        spinner.rotation.y = time * 1.5 + tile.spinAnim * 10;
        q.position.y = 40 + Math.sin(time * 4) * 3;
      };
    },

    tele(view, tile) {
      const g = view.group;
      const col = TELE_COLORS[tile.pair % TELE_COLORS.length];
      g.add(makePlate('#f1edfc'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      // うずまきポータル
      const rg = new T.TorusGeometry(27, 4.5, 8, 28, TAU * 0.78).rotateX(Math.PI / 2);
      levelGC.push(rg);
      const ring1 = new T.Mesh(rg, mat(col));
      ring1.position.y = 13;
      g.add(ring1);
      const ring2 = new T.Mesh(rg, mat(col));
      ring2.position.y = 17;
      ring2.scale.set(0.65, 1, 0.65);
      g.add(ring2);
      const dg = new T.CylinderGeometry(24, 24, 2, 20);
      levelGC.push(dg);
      const dm = new T.MeshBasicMaterial({ color: new T.Color(col), transparent: true, opacity: 0.3, depthWrite: false });
      levelGC.push(dm);
      const disc = new T.Mesh(dg, dm);
      disc.position.y = 10;
      g.add(disc);
      view.update = (dt, time) => {
        lane.rotation.y = yawOf(tile.dir);
        ring1.rotation.y = time * 2.4;
        ring2.rotation.y = -time * 3.2;
        dm.opacity = 0.22 + 0.14 * Math.sin(time * 4);
      };
    },

    jump(view, tile) {
      const g = view.group;
      g.add(makePlate('#ffedd9'));
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      // ばね + 発射だい
      const springG = new T.Group();
      const coil = new T.Mesh(makeSpringGeo(), mat('#d6884a'));
      coil.castShadow = true;
      springG.add(coil);
      const pad = mkBox(50, 9, 50, '#ffb840', true);
      pad.position.y = 34;
      springG.add(pad);
      springG.position.y = BELT_TOP;
      g.add(springG);
      // とぶ方向の矢印
      const arr = new T.Mesh(arrowGeo(0.5, 6), mat('#d68f1e'));
      arr.position.set(36, 12, 0);
      lane.add(arr);
      view.update = () => {
        lane.rotation.y = yawOf(tile.dir);
        const sq = 1 - 0.45 * Math.sin(Math.min(1, tile.pop) * Math.PI);
        springG.scale.y = sq;
      };
    },

    gate(view, tile) {
      const g = view.group;
      const lane = makeLane(true);
      lane.rotation.y = yawOf(tile.dir);
      g.add(lane);
      // しんごうき（レーン脇）
      const pole = new T.Mesh(new T.CylinderGeometry(4.5, 5.5, 46, 8), mat('#8f8fa5'));
      levelGC.push(pole.geometry);
      pole.position.set(6, 23, -(LANE_W / 2 + 14));
      pole.castShadow = true;
      lane.add(pole);
      const lampGeo = new T.SphereGeometry(6, 10, 8);
      levelGC.push(lampGeo);
      const greenM = new T.MeshBasicMaterial({ color: 0x57d957 });
      const redM = new T.MeshBasicMaterial({ color: 0xff5c5c });
      const offM = new T.MeshBasicMaterial({ color: 0xe0e0ea });
      levelGC.push(greenM, redM, offM);
      const lampTop = new T.Mesh(lampGeo, greenM);
      lampTop.position.set(6, 46, -(LANE_W / 2 + 14));
      lane.add(lampTop);
      const lampBottom = new T.Mesh(lampGeo, offM);
      lampBottom.position.set(6, 32, -(LANE_W / 2 + 14));
      lane.add(lampBottom);
      // しゃだんバー（しましま）
      const pivot = new T.Group();
      pivot.position.set(10, 26, -(LANE_W / 2 + 6));
      const armTex = makeStripeTexture();
      const armM = new T.MeshToonMaterial({ map: armTex, gradientMap: gradientTex });
      levelGC.push(armM, armTex);
      const armGeo = new T.BoxGeometry(9, 9, LANE_W + 22);
      levelGC.push(armGeo);
      const arm = new T.Mesh(armGeo, armM);
      arm.position.z = (LANE_W + 22) / 2;
      arm.castShadow = true;
      pivot.add(arm);
      const hub = new T.Mesh(new T.SphereGeometry(8, 10, 8), mat('#8f8fa5'));
      levelGC.push(hub.geometry);
      pivot.add(hub);
      lane.add(pivot);
      view.update = () => {
        lane.rotation.y = yawOf(tile.dir);
        pivot.rotation.x = -tile.armT * 1.3;   // ひらくと持ち上がる
        lampTop.material = tile.open ? greenM : offM;
        lampBottom.material = tile.open ? offM : redM;
      };
    },
  };

  function makeSpringGeo() {
    // らせんチューブのばね
    class Helix extends T.Curve {
      getPoint(t) {
        const a = t * TAU * 3;
        return new T.Vector3(Math.cos(a) * 14, t * 26 + 2, Math.sin(a) * 14);
      }
    }
    const g = new T.TubeGeometry(new Helix(), 48, 2.6, 6, false);
    levelGC.push(g);
    return g;
  }

  function makeStripeTexture() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 8;
    const c = cv.getContext('2d');
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 === 0 ? '#ff6f6f' : '#ffffff';
      c.fillRect(i * 8, 0, 8, 8);
    }
    const tex = new T.CanvasTexture(cv);
    return tex;
  }

  /* ============================ レベル構築 ============================ */

  function buildLevel(game) {
    // まえのレベルを破棄
    if (levelGroup) {
      scene.remove(levelGroup);
      for (const r of levelGC) { try { r.dispose(); } catch (e) {} }
      levelGC = [];
    }
    tileViews.length = 0;
    Donut3D.clear();
    Particles.clear();

    const theme = game.level.theme;
    scene.background = new T.Color(theme.bg);

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
    const cellGeo = new T.PlaneGeometry(CELL, CELL);
    cellGeo.rotateX(-Math.PI / 2);
    levelGC.push(cellGeo);
    // チェッカーが見えるよう floorB をすこし濃く
    const cellCol = new T.Color(theme.floorB).multiplyScalar(0.93);
    const cellMat = mat('#' + cellCol.getHexString());
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        if ((x + y) % 2 === 1) {
          const cm = new T.Mesh(cellGeo, cellMat);
          // パネルのベベル上面(≈y+4)より上に置く
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

    // タイル
    for (const tile of game.tileList) {
      const v = buildTileView(tile, theme);
      levelGroup.add(v.group);
      tileViews.push(v);
    }

    // ライト位置
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
    const petalGeo = new T.SphereGeometry(7, 8, 6);
    levelGC.push(petalGeo);
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
      const s = new T.Mesh(new T.OctahedronGeometry(11), white);
      levelGC.push(s.geometry);
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
    const elev = 0.99;   // 見下ろし角 ≈ 57°
    const D = 1700;
    const ey = Math.sin(elev) * D;
    const eh = Math.cos(elev) * D;
    if (!rotated) camera.position.set(cx, ey, cz + eh);
    else camera.position.set(cx + eh, ey, cz);
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld(true);

    // ボード角の投影範囲からフラスタムを決める
    const inv = camera.matrixWorldInverse;
    let maxX = 1, maxY = 1;
    for (const x of [-40, bw + 40]) {
      for (const z of [-40, bh + 40]) {
        for (const y of [-20, 180]) {
          _v3.set(x, y, z).applyMatrix4(inv);
          maxX = Math.max(maxX, Math.abs(_v3.x));
          maxY = Math.max(maxY, Math.abs(_v3.y));
        }
      }
    }
    const aspect = vw / Math.max(1, vh);
    let hw = maxX * 1.03, hh = maxY * 1.05;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    camera.left = -hw; camera.right = hw;
    camera.top = hh; camera.bottom = -hh;
    camera.near = 10; camera.far = 5000;
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

  /* ============================ 毎フレーム ============================ */

  function render(game, dt) {
    beltTex.offset.x -= dt * game.speed * 0.9;

    for (const v of tileViews) v.update(dt, game.time, game);

    Donut3D.sync(game, game.time);
    Particles.sync();

    // おてほんガイド
    if (game.guide) {
      const c = tileCenter(game.guide.tile);
      const t = game.time - game.guide.t0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      guideRing.visible = true;
      guideRing.position.set(c.x, 20, c.y);
      const rs = 1 + pulse * 0.18;
      guideRing.scale.set(rs, 1, rs);
      guideRing.material.opacity = 0.55 + pulse * 0.4;
      const tap = Math.max(0, Math.sin(t * 5));
      guideFinger.visible = true;
      guideFinger.position.set(c.x + 34, 66 - tap * 18, c.y + 40);
    } else {
      guideRing.visible = false;
      guideFinger.visible = false;
    }

    renderer.render(scene, camera);
  }

  return { init, buildLevel, fitCamera, resize, render, screenToWorld, worldToScreen };
})();
