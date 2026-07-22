'use strict';
/* ============================================================
 * donut3d.js — ドーナツの3D表示
 *  Donut（状態）→ Three.js メッシュ群への同期。
 *  decorRev が変わったときだけデコを組み立て直す。
 * ============================================================ */

const BELT_TOP = 14;                // ベルト面の高さ（脚つきコンベア）
const DONUT_BASE_Y = BELT_TOP + 13; // ドーナツ中心の高さ

const Donut3D = (() => {
  let T = null, scene = null, gradientTex = null;
  const views = new Map();
  const geoCache = {};
  const matCache = {};

  function init(THREE_, scene_, gradientTex_) {
    T = THREE_;
    scene = scene_;
    gradientTex = gradientTex_;
  }

  /* ---------- マテリアル ---------- */
  function toonMat(hex, opts = {}) {
    const key = 'toon:' + hex + ':' + JSON.stringify(opts);
    if (!matCache[key]) {
      const m = new T.MeshToonMaterial(Object.assign({ color: new T.Color(hex), gradientMap: gradientTex }, opts));
      matCache[key] = m;
    }
    return matCache[key];
  }
  function shinyMat(hex) {
    const key = 'shiny:' + hex;
    if (!matCache[key]) {
      matCache[key] = new T.MeshPhongMaterial({ color: new T.Color(hex), shininess: 90, specular: new T.Color('#ffffff') });
    }
    return matCache[key];
  }

  /* ---------- ジオメトリ ---------- */
  function doughGeo(shape) {
    const key = 'dough:' + shape;
    if (geoCache[key]) return geoCache[key];
    let g;
    if (shape === 'ring') {
      g = new T.TorusGeometry(21, 13, 14, 30);
      g.rotateX(Math.PI / 2);
    } else {
      g = extrudeDonut(shape, 32, 9, 6.5);
    }
    geoCache[key] = g;
    return g;
  }

  function frostGeo(shape) {
    const key = 'frost:' + shape;
    if (geoCache[key]) return geoCache[key];
    let g;
    if (shape === 'ring') {
      g = new T.TorusGeometry(21, 14.2, 14, 30);
      g.rotateX(Math.PI / 2);
    } else {
      g = extrudeDonut(shape, 33.5, 7, 6);
    }
    geoCache[key] = g;
    return g;
  }

  function glazeGeo(shape) {
    const key = 'glaze:' + shape;
    if (geoCache[key]) return geoCache[key];
    let g;
    if (shape === 'ring') {
      g = new T.TorusGeometry(21, 14.9, 12, 26);
      g.rotateX(Math.PI / 2);
    } else {
      g = extrudeDonut(shape, 34.5, 7.5, 6.2);
    }
    geoCache[key] = g;
    return g;
  }

  // star / heart / flower：穴あき押し出しドーナツ
  function extrudeDonut(shape, R, depth, bevel) {
    const s = new T.Shape();
    if (shape === 'heart') {
      s.moveTo(0, -0.30 * R);
      for (const b of DonutShapes.HEART_BEZIERS) {
        s.bezierCurveTo(b[0] * R, b[1] * R, b[2] * R, b[3] * R, b[4] * R, b[5] * R);
      }
    } else {
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const r = DonutShapes.polarRadius(shape, a) * R;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
    }
    const holeR = 0.22 * R;
    const holeY = shape === 'heart' ? 0.12 * R : 0;
    const hole = new T.Path();
    hole.absarc(0, holeY, holeR, 0, TAU, true);
    s.holes.push(hole);
    const g = new T.ExtrudeGeometry(s, {
      depth, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel * 0.9,
      bevelSegments: 3, curveSegments: 20, steps: 1,
    });
    // XY平面の押し出し → 水平に寝かせる（2Dの +y を 3Dの +z に）
    g.rotateX(Math.PI / 2);
    g.center();
    return g;
  }

  function sprinkleGeo() {
    if (!geoCache.sprinkle) geoCache.sprinkle = new T.BoxGeometry(7.6, 2.8, 2.8);
    return geoCache.sprinkle;
  }
  function starBitGeo() {
    if (!geoCache.starBit) geoCache.starBit = new T.OctahedronGeometry(3.4);
    return geoCache.starBit;
  }
  function creamGeo() {
    if (!geoCache.cream) geoCache.cream = new T.SphereGeometry(6.6, 8, 6);
    return geoCache.cream;
  }

  /* ---------- トッパー ---------- */
  function buildTopper(kind) {
    const g = new T.Group();
    if (kind === 'cherry') {
      const body = new T.Mesh(new T.SphereGeometry(7.5, 12, 10), toonMat('#e73f56'));
      g.add(body);
      const stem = new T.Mesh(new T.TorusGeometry(6.5, 1.2, 5, 10, 1.7), toonMat('#7c9b46'));
      stem.position.set(1, 6, 0);
      stem.rotation.z = 0.5;
      g.add(stem);
    } else if (kind === 'strawberry') {
      const body = new T.Mesh(new T.SphereGeometry(7.5, 12, 10), toonMat('#ee4d68'));
      body.scale.set(0.85, 1.15, 0.85);
      g.add(body);
      const leaf = new T.Mesh(new T.ConeGeometry(6, 3.6, 6), toonMat('#7cbf4e'));
      leaf.position.y = 8.6;
      g.add(leaf);
      // つぶつぶ
      const seedM = toonMat('#ffe1a8');
      for (let i = 0; i < 5; i++) {
        const sd = new T.Mesh(new T.SphereGeometry(0.9, 5, 4), seedM);
        const a = (i / 5) * TAU;
        sd.position.set(Math.cos(a) * 6.4, 1 + Math.sin(i * 2.1) * 3, Math.sin(a) * 6.4);
        g.add(sd);
      }
    } else {   // candy
      const c = new T.Mesh(new T.OctahedronGeometry(7), toonMat('#ffd94d'));
      c.scale.y = 0.6;
      g.add(c);
      const c2 = new T.Mesh(new T.OctahedronGeometry(5), toonMat('#ffee88'));
      c2.rotation.y = Math.PI / 4;
      c2.scale.y = 0.7;
      c2.position.y = 1.5;
      g.add(c2);
    }
    return g;
  }

  /* ---------- やさいの組み立て ---------- */
  function buildVeggie(body, seed) {
    if (seed % 2 === 0) {
      // ブロッコリー
      const stem = new T.Mesh(new T.CylinderGeometry(6, 8, 15, 8), toonMat('#cfe8b0'));
      stem.position.y = -4;
      stem.castShadow = true;
      body.add(stem);
      const rng = mulberry32(seed);
      for (let i = 0; i < 6; i++) {
        const fl = new T.Mesh(new T.SphereGeometry(9 + rng() * 4, 8, 6), toonMat('#4e9b4e'));
        const a = rng() * TAU;
        const r = 6 + rng() * 7;
        fl.position.set(Math.cos(a) * r, 8 + rng() * 8, Math.sin(a) * r);
        fl.castShadow = true;
        body.add(fl);
      }
    } else {
      // にんじん（ねっころがってる）
      const carrot = new T.Mesh(new T.ConeGeometry(11, 40, 9), toonMat('#f28c3a'));
      carrot.rotation.z = -Math.PI / 2;
      carrot.position.y = 0;
      carrot.castShadow = true;
      body.add(carrot);
      for (let i = 0; i < 3; i++) {
        const leaf = new T.Mesh(new T.ConeGeometry(3.5, 14, 5), toonMat('#5cae52'));
        leaf.position.set(-22, 4, (i - 1) * 5);
        leaf.rotation.z = 0.9 + i * 0.25;
        body.add(leaf);
      }
    }
  }

  /* ---------- デコの組み立て ---------- */
  function rebuildDecor(view) {
    const d = view.donut;
    const body = view.body;
    // 既存をぜんぶ外す
    for (let i = body.children.length - 1; i >= 0; i--) {
      const ch = body.children[i];
      body.remove(ch);
      if (ch.isInstancedMesh) ch.dispose();
    }

    // やさいモード
    if (d.isVeggie) {
      buildVeggie(body, d.seed);
      view.decorRev = d.decorRev;
      return;
    }

    const shape = d.decor.shape;

    // 生地
    const dough = new T.Mesh(doughGeo(shape), toonMat('#f4bd76'));
    dough.castShadow = true;
    body.add(dough);

    // フロスティング
    if (d.decor.frost) {
      const col = FROST_COLORS[d.decor.frost] || FROST_COLORS.pink;
      const m = d.decor.glaze ? shinyMat(col.fill) : toonMat(col.fill);
      const frost = new T.Mesh(frostGeo(shape), m);
      frost.scale.set(1.0, 0.58, 1.0);
      frost.position.y = 5.5;
      frost.castShadow = true;
      body.add(frost);
    }

    // グレーズ（つやつやの半透明コート）
    if (d.decor.glaze) {
      const gm = new T.MeshPhongMaterial({
        color: new T.Color('#ffffff'), shininess: 120,
        transparent: true, opacity: 0.28, depthWrite: false,
      });
      const gl = new T.Mesh(glazeGeo(shape), gm);
      gl.scale.set(1.0, 0.55, 1.0);
      gl.position.y = 6.5;
      body.add(gl);
    }

    // スプリンクル（インスタンス描画）
    if (d.sprinklePts && d.sprinklePts.length) {
      const style = SPRINKLE_STYLES[d.decor.sprinkles] || SPRINKLE_STYLES.rainbow;
      const geo = (style.star || style.heart) ? starBitGeo() : sprinkleGeo();
      const im = new T.InstancedMesh(geo, toonMat('#ffffff'), d.sprinklePts.length);
      im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(d.sprinklePts.length * 3), 3);
      const dummy = new T.Object3D();
      const col = new T.Color();
      const RR = 30;
      d.sprinklePts.forEach((p, i) => {
        dummy.position.set(p.x * RR, 12.5 + Math.sin(p.a) * 1.2, p.y * RR);
        dummy.rotation.set(0, p.a, 0.15);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        col.set(style.colors[p.c % style.colors.length]);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      body.add(im);
    }

    // ホイップクリーム（もこもこリング）
    if (d.decor.cream) {
      const n = 9;
      const im = new T.InstancedMesh(creamGeo(), toonMat('#fffdf6'), n);
      const dummy = new T.Object3D();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.3;
        const rr = 0.52 * DONUT_R * DonutShapes.polarRadius(shape, a);
        dummy.position.set(Math.cos(a) * rr, 13.5, Math.sin(a) * rr);
        const s = 0.9 + 0.25 * Math.sin(i * 2.7);
        dummy.scale.set(s, s * 0.85, s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      body.add(im);
    }

    // トッパー
    if (d.decor.topper) {
      const tp = buildTopper(d.decor.topper);
      const tz = shape === 'heart' ? -0.28 : -0.5;
      tp.position.set(0, 17, tz * DONUT_R);
      body.add(tp);
    }

    view.decorRev = d.decorRev;
  }

  /* ---------- ビュー管理 ---------- */
  function ensure(d) {
    let v = views.get(d.id);
    if (!v) {
      const group = new T.Group();
      const body = new T.Group();
      group.add(body);
      scene.add(group);
      v = { donut: d, group, body, decorRev: -1 };
      views.set(d.id, v);
      rebuildDecor(v);
    }
    return v;
  }

  function sync(game, time) {
    const alive = new Set();
    for (const d of game.donuts) {
      alive.add(d.id);
      const v = ensure(d);
      if (v.decorRev !== d.decorRev) rebuildDecor(v);

      v.group.visible = !d.hidden;
      v.group.position.set(d.x, DONUT_BASE_Y + d.z, d.y);

      // スケール（squish + じたばた + かみなりのビリビリ + おしくらまんじゅう）
      let sq = Math.sin(time * 5 + d.wobble) * 0.02;
      if (d.stopped || d.jammed) sq += Math.sin(time * 16 + d.wobble) * 0.045;
      if (game.stunT > 0) sq += Math.sin(time * 40 + d.wobble) * 0.06;
      const a = d.alpha;
      // 押されると横にちぢんで、たてにむにゅっとふくらむ
      const ov = d.overlapS || 0;
      const ovXZ = 1 - ov * 0.16;
      const ovY = 1 + ov * 0.36;
      v.body.scale.set(
        d.sx * (1 + sq) * ovXZ * a,
        Math.max(0.02, d.sy * (1 - sq) * ovY) * a,
        d.sx * (1 + sq) * ovXZ * a);

      // 回転（状態ごと）
      v.body.rotation.set(0, Math.sin(time * 2.2 + d.wobble) * 0.06, 0);
      if (d.state === 'jump' || d.state === 'fall') {
        const dir = d.state === 'jump' ? d.aux.dir : d.aux.dir;
        if (DX[dir] !== 0) v.body.rotation.z = -DX[dir] * d.spin;
        else v.body.rotation.x = DY[dir] * d.spin;
      } else if (d.state === 'teleOut' || d.state === 'teleIn') {
        v.body.rotation.y = d.spin;
      } else if (d.state === 'carried') {
        v.body.rotation.z = Math.sin(time * 6) * 0.12;
      } else if (d.state === 'riding') {
        // おんぶされてゆらゆら
        v.body.rotation.z = Math.sin(time * 3.4 + d.wobble) * 0.14;
        v.body.rotation.x = Math.sin(time * 2.7 + d.wobble) * 0.1;
      }
    }
    // 消えたドーナツのビューを片づけ
    for (const [id, v] of views) {
      if (!alive.has(id)) {
        scene.remove(v.group);
        for (const ch of v.body.children) { if (ch.isInstancedMesh) ch.dispose(); }
        views.delete(id);
      }
    }
  }

  function clear() {
    for (const [, v] of views) {
      scene.remove(v.group);
      for (const ch of v.body.children) { if (ch.isInstancedMesh) ch.dispose(); }
    }
    views.clear();
  }

  return { init, sync, clear, toonMat, shinyMat, buildTopper, doughGeo };
})();
