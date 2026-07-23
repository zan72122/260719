/* すごろくの ばん・4つの くに・かざりを つくる */
const World = (() => {

  const TILE_COUNT = 48;               /* 0=スタート, 47=ゴール */
  const T = {
    START: 'start', GOAL: 'goal', STAR: 'star', PRESENT: 'present',
    BANANA: 'banana', ROCKET: 'rocket', MUSIC: 'music', CAKE: 'cake', RAINBOW: 'rainbow',
  };

  const SPECIALS = {
    5: T.PRESENT, 16: T.PRESENT, 28: T.PRESENT, 40: T.PRESENT,
    7: T.ROCKET, 26: T.ROCKET,
    9: T.MUSIC, 21: T.MUSIC, 34: T.MUSIC,
    12: T.BANANA, 30: T.BANANA, 42: T.BANANA,
    14: T.CAKE, 37: T.CAKE,
    19: T.RAINBOW, 44: T.RAINBOW,
  };

  const TYPE_EMOJI = {
    [T.START]: '🏁', [T.GOAL]: '👑', [T.PRESENT]: '🎁', [T.BANANA]: '🍌',
    [T.ROCKET]: '🚀', [T.MUSIC]: '🎵', [T.CAKE]: '🎂', [T.RAINBOW]: '🌈',
  };

  /* 4つの くに：はなばたけ → うみ → おかしのくに → ゆきのくに */
  const ZONES = [
    { name: 'はなばたけ',   ground: 0xa8e06e, sky: 0xaee9ff, fog: 0xcdeeff },
    { name: 'うみべ',       ground: 0xffe6a3, sky: 0x8fd8ff, fog: 0xc0e8ff },
    { name: 'おかしのくに', ground: 0xffd1ec, sky: 0xffd9f0, fog: 0xffe4f4 },
    { name: 'ゆきのくに',   ground: 0xf0f6ff, sky: 0xd7e6ff, fog: 0xe8f0ff },
  ];

  const TILE_COLORS = [0xff7b7b, 0xffb056, 0xffe066, 0x8ce99a, 0x74c0fc, 0xc79bff];

  function zoneOf(i) { return U.clamp(Math.floor(i / (TILE_COUNT / 4)), 0, 3); }

  /* ---------- 小さい ぶひん ---------- */

  function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }

  function blobShadow(r) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 20),
      new THREE.MeshBasicMaterial({ color: 0x3a5a30, transparent: true, opacity: 0.18, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.055;
    return m;
  }

  function tree(scale, leafColor) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.4, 8), lambert(0x9c6b3f));
    trunk.position.y = 0.7;
    g.add(trunk);
    const cols = [leafColor || 0x59c15e, 0x6fd97e, 0x4cae57];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.95 - i * 0.16, 12, 10), lambert(cols[i % cols.length]));
      s.position.set(U.rand(-0.3, 0.3), 1.7 + i * 0.62, U.rand(-0.3, 0.3));
      g.add(s);
    }
    g.add(blobShadow(1.1));
    g.scale.setScalar(scale || 1);
    return g;
  }

  function flower(color) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), lambert(0x4cae57));
    stem.position.y = 0.35;
    g.add(stem);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), lambert(0xffe066));
    core.position.y = 0.78;
    g.add(core);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), lambert(color));
      const a = i / 6 * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.26, 0.78, Math.sin(a) * 0.26);
      p.scale.set(1, 0.5, 1);
      g.add(p);
    }
    return g;
  }

  function palm() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 8), lambert(0xb98a52));
    trunk.position.y = 1.3;
    trunk.rotation.z = U.rand(-0.12, 0.12);
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.0, 6), lambert(0x3fbf62));
      const a = i / 6 * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.85, 2.65, Math.sin(a) * 0.85);
      leaf.rotation.z = Math.cos(a) * 1.25;
      leaf.rotation.x = -Math.sin(a) * 1.25;
      g.add(leaf);
    }
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), lambert(0x8a5a30));
    coco.position.set(0.25, 2.5, 0.15);
    g.add(coco);
    g.add(blobShadow(0.9));
    return g;
  }

  function lollipop(color) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), lambert(0xffffff));
    stick.position.y = 1.1;
    g.add(stick);
    const candy = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.3, 12, 24), lambert(color));
    candy.position.y = 2.5;
    g.add(candy);
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), lambert(0xffffff));
    mid.position.y = 2.5;
    g.add(mid);
    g.add(blobShadow(0.8));
    g.userData.spin = U.rand(0.3, 0.8);
    return g;
  }

  function cupcake() {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.8, 12), lambert(0xff9fbf));
    cup.position.y = 0.4;
    g.add(cup);
    const cream = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), lambert(0xfff3e0));
    cream.position.y = 1.0;
    cream.scale.y = 0.75;
    g.add(cream);
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), lambert(0xff4d6d));
    cherry.position.y = 1.62;
    g.add(cherry);
    g.add(blobShadow(0.85));
    return g;
  }

  function candyCane() {
    const g = new THREE.Group();
    const mat = lambert(0xff5d6d);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 10), mat);
    pole.position.y = 1.0;
    g.add(pole);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 10, 16, Math.PI), mat);
    hook.position.y = 2.0;
    hook.position.x = 0.42;
    g.add(hook);
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 12), lambert(0xffffff));
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = 0.3 + i * 0.45;
      g.add(stripe);
    }
    return g;
  }

  function snowman() {
    const g = new THREE.Group();
    const white = lambert(0xffffff);
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), white); b1.position.y = 0.72;
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), white); b2.position.y = 1.75;
    g.add(b1, b2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), lambert(0xff8c42));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.8, 0.6);
    g.add(nose);
    for (const sx of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), lambert(0x333333));
      eye.position.set(sx, 1.95, 0.45);
      g.add(eye);
    }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), lambert(0xff5d8f));
    hat.position.y = 2.3;
    g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 12), lambert(0xff5d8f));
    brim.position.y = 2.12;
    g.add(brim);
    g.add(blobShadow(0.9));
    return g;
  }

  function pineSnow() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.9, 8), lambert(0x8a6642));
    trunk.position.y = 0.45;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15 - i * 0.3, 1.0, 10), lambert(0x2f9e5f));
      cone.position.y = 1.2 + i * 0.7;
      g.add(cone);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(1.17 - i * 0.3, 0.35, 10), lambert(0xffffff));
      snow.position.y = 1.55 + i * 0.7;
      g.add(snow);
    }
    g.add(blobShadow(1.0));
    return g;
  }

  function mushroom() {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), lambert(0xfff3e0));
    stem.position.y = 0.3;
    g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xff5d6d));
    cap.position.y = 0.55;
    g.add(cap);
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), lambert(0xffffff));
      const a = U.rand(0, Math.PI * 2);
      dot.position.set(Math.cos(a) * 0.32, 0.85, Math.sin(a) * 0.32);
      g.add(dot);
    }
    return g;
  }

  function iceCrystal() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 });
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), mat);
    c.position.y = 1.0;
    c.scale.y = 1.6;
    g.add(c);
    g.userData.spin = U.rand(0.4, 1.0);
    return g;
  }

  function boat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 0.6, 12, 1), lambert(0xff8c42));
    hull.scale.z = 0.55;
    hull.position.y = 0.3;
    g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), lambert(0x8a6642));
    mast.position.y = 1.4;
    g.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(1.2, 0); sailShape.lineTo(0, 1.7); sailShape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape),
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    sail.position.set(0.06, 0.75, 0);
    g.add(sail);
    return g;
  }

  /* ゴールの おしろ */
  function castle() {
    const g = new THREE.Group();
    const stone = lambert(0xfff0f6);
    const roofM = lambert(0xff5d8f);
    function tower(x, z, h, r) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 12), stone);
      t.position.set(x, h / 2, z);
      g.add(t);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, r * 2.3, 12), roofM);
      roof.position.set(x, h + r * 1.15, z);
      g.add(roof);
      const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), lambert(0xffffff));
      flagPole.position.set(x, h + r * 2.3 + 0.5, z);
      g.add(flagPole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45),
        new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide }));
      flag.position.set(x + 0.4, h + r * 2.3 + 0.85, z);
      flag.userData.flag = true;
      g.add(flag);
    }
    tower(-2.6, 0, 4.2, 1.0);
    tower(2.6, 0, 4.2, 1.0);
    tower(0, -1.8, 5.6, 1.25);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.6, 1.6), stone);
    wall.position.set(0, 1.3, 0);
    g.add(wall);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16, 1, false, 0, Math.PI),
      lambert(0xb98a52));
    door.rotation.x = Math.PI / 2;
    door.rotation.z = Math.PI / 2;
    door.position.set(0, 0.9, 0.75);
    g.add(door);
    g.add(blobShadow(4.2));
    return g;
  }

  /* にじの アーチ */
  function rainbowArch(radius) {
    const g = new THREE.Group();
    const cols = [0xff5d5d, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc];
    cols.forEach((c, i) => {
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(radius - i * 0.42, 0.2, 8, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c })
      );
      g.add(t);
    });
    return g;
  }

  /* スタートゲート */
  function startGate() {
    const g = new THREE.Group();
    const mat = lambert(0xffffff);
    for (const sx of [-3, 3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 4.6, 10), mat);
      pole.position.set(sx, 2.3, 0);
      g.add(pole);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), lambert(0xffe066));
      ball.position.set(sx, 4.7, 0);
      g.add(ball);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.75, 0.5), lambert(0xff5d8f));
    beam.position.y = 4.2;
    g.add(beam);
    /* はた ガーランド */
    const cols = [0xffe066, 0x8ce99a, 0x74c0fc, 0xffa94d, 0xff8fb1];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4),
        new THREE.MeshBasicMaterial({ color: cols[i % cols.length] }));
      f.position.set(-2.4 + i * 0.8, 3.55, 0.1);
      f.rotation.x = Math.PI;
      g.add(f);
    }
    return g;
  }

  /* ---------- ばんの こみち ---------- */

  function makeCurve() {
    /* うねうねした みち（スタート手前 → 4つの くにを ぬけて ゴール） */
    const pts = [
      [0, 78],   [8, 68],  [14, 56],  [8, 46],   [-6, 42],  [-16, 34],
      [-14, 22], [-2, 18], [10, 14],  [18, 4],   [12, -8],  [0, -12],
      [-12, -16],[-20, -26],[-14, -38],[-2, -42], [10, -46], [18, -56],
      [12, -68], [0, -72], [-8, -80],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  }

  /* ---------- くみたて ---------- */

  function build(scene) {
    const world = { tiles: [], anims: [], zoneOf, TILE_COUNT, T, ZONES };

    /* ひかり */
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c9b0, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4d6, 0.75);
    sun.position.set(24, 40, 18);
    scene.add(sun);

    /* じめん：くにごとに 色が まざる おおきな のっぱら */
    const groundGeo = new THREE.PlaneGeometry(320, 340, 48, 52);
    groundGeo.rotateX(-Math.PI / 2);
    const zoneCenters = [
      new THREE.Vector3(2, 0, 52), new THREE.Vector3(2, 0, 8),
      new THREE.Vector3(-8, 0, -28), new THREE.Vector3(2, 0, -66),
    ];
    const zoneCols = ZONES.map(z => new THREE.Color(z.ground));
    const pos = groundGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let wsum = 0; tmp.setRGB(0, 0, 0);
      for (let zi = 0; zi < 4; zi++) {
        const d = Math.hypot(x - zoneCenters[zi].x, z - zoneCenters[zi].z) + 6;
        const w = 1 / (d * d);
        wsum += w;
        tmp.r += zoneCols[zi].r * w; tmp.g += zoneCols[zi].g * w; tmp.b += zoneCols[zi].b * w;
      }
      colors[i * 3] = tmp.r / wsum; colors[i * 3 + 1] = tmp.g / wsum; colors[i * 3 + 2] = tmp.b / wsum;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.name = 'ground';
    scene.add(ground);
    world.ground = ground;

    /* うみ：うみべゾーンの よこに おおきな みずたまり */
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(26, 40),
      new THREE.MeshLambertMaterial({ color: 0x5fc9f7, transparent: true, opacity: 0.9 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(38, 0.05, 2);
    scene.add(sea);
    world.anims.push(t => { sea.scale.setScalar(1 + Math.sin(t * 0.9) * 0.012); });

    const seaBoat = boat();
    seaBoat.position.set(32, 0.15, 6);
    scene.add(seaBoat);
    world.anims.push(t => {
      seaBoat.position.y = 0.15 + Math.sin(t * 1.3) * 0.12;
      seaBoat.rotation.z = Math.sin(t * 1.1) * 0.06;
      seaBoat.rotation.y = t * 0.05;
      seaBoat.position.x = 32 + Math.cos(t * 0.05) * 3;
      seaBoat.position.z = 6 + Math.sin(t * 0.05) * 3;
    });

    /* こみち */
    const curve = makeCurve();
    world.curve = curve;

    /* みちの リボン（つながって みえる おび） */
    const ribbonPts = curve.getSpacedPoints(240);
    const ribbonGeo = new THREE.BufferGeometry();
    const rv = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < ribbonPts.length - 1; i++) {
      const p = ribbonPts[i], q = ribbonPts[i + 1];
      const dir = q.clone().sub(p).normalize();
      const side = dir.clone().cross(up).normalize().multiplyScalar(1.35);
      const a = p.clone().add(side), b = p.clone().sub(side);
      const c = q.clone().add(side), d = q.clone().sub(side);
      rv.push(a.x, 0.07, a.z, b.x, 0.07, b.z, c.x, 0.07, c.z);
      rv.push(b.x, 0.07, b.z, d.x, 0.07, d.z, c.x, 0.07, c.z);
    }
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rv), 3));
    ribbonGeo.computeVertexNormals();
    const ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshLambertMaterial({ color: 0xfff6e0 }));
    scene.add(ribbon);

    /* マス */
    const iconTex = {};
    for (const k in TYPE_EMOJI) iconTex[k] = U.emojiTexture(TYPE_EMOJI[k], 128);
    const starIconTex = U.emojiTexture('⭐', 128);

    for (let i = 0; i < TILE_COUNT; i++) {
      const u = i / (TILE_COUNT - 1);
      const p = curve.getPointAt(u);
      const type = i === 0 ? T.START : i === TILE_COUNT - 1 ? T.GOAL : (SPECIALS[i] || T.STAR);
      const zone = zoneOf(i);

      let color;
      if (type === T.START) color = 0xffffff;
      else if (type === T.GOAL) color = 0xffe066;
      else if (type === T.BANANA) color = 0xfff3b0;
      else if (type === T.ROCKET) color = 0xa5d8ff;
      else if (type === T.PRESENT) color = 0xffc9de;
      else if (type === T.CAKE) color = 0xffdcc2;
      else if (type === T.MUSIC) color = 0xd0bfff;
      else if (type === T.RAINBOW) color = 0xc3fae8;
      else color = TILE_COLORS[i % TILE_COLORS.length];

      const big = (type === T.START || type === T.GOAL);
      const r = big ? 2.6 : 1.85;
      const tileMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.12, 0.5, 22),
        lambert(color)
      );
      tileMesh.position.set(p.x, 0.25, p.z);
      scene.add(tileMesh);

      /* ふち */
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.98, 0.09, 8, 26),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(p.x, 0.51, p.z);
      scene.add(rim);

      /* アイコン */
      const tex = type === T.STAR ? (i % 3 === 1 ? starIconTex : null) : iconTex[type];
      if (tex) {
        const icon = new THREE.Mesh(
          new THREE.CircleGeometry(r * 0.62, 20),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        icon.rotation.x = -Math.PI / 2;
        icon.rotation.z = U.rand(-0.3, 0.3);
        icon.position.set(p.x, 0.52, p.z);
        scene.add(icon);
      }

      world.tiles.push({ index: i, pos: p.clone().setY(0.5), type, zone, mesh: tileMesh });
    }

    /* スタートゲートと ゴールの おしろ */
    const t0 = world.tiles[0], tG = world.tiles[TILE_COUNT - 1];
    const gate = startGate();
    gate.position.copy(t0.pos).setY(0);
    const dir0 = curve.getTangentAt(0);
    gate.rotation.y = Math.atan2(dir0.x, dir0.z);
    scene.add(gate);
    world.gate = gate;

    const cas = castle();
    const dirG = curve.getTangentAt(1);
    cas.position.set(tG.pos.x + dirG.x * 7, 0, tG.pos.z + dirG.z * 7);
    cas.rotation.y = Math.atan2(-dirG.x, -dirG.z);
    scene.add(cas);
    world.castle = cas;

    const rb = rainbowArch(7.5);
    rb.position.copy(cas.position).add(new THREE.Vector3(0, 0, 0));
    rb.rotation.y = cas.rotation.y;
    rb.position.y = 0.3;
    scene.add(rb);

    /* ---------- くにごとの かざり ---------- */
    const decoParent = new THREE.Group();
    scene.add(decoParent);

    const tilePts = world.tiles.map(t => t.pos);
    function freeSpot(center, spread) {
      for (let tryN = 0; tryN < 14; tryN++) {
        const x = center.x + U.rand(-spread, spread);
        const z = center.z + U.rand(-spread, spread);
        let ok = true;
        for (const tp of tilePts) {
          if (Math.hypot(tp.x - x, tp.z - z) < 4.6) { ok = false; break; }
        }
        if (Math.hypot(x - sea.position.x, z - sea.position.z) < 27) ok = false;
        if (Math.hypot(x - cas.position.x, z - cas.position.z) < 8) ok = false;
        if (ok) return new THREE.Vector3(x, 0, z);
      }
      return null;
    }

    function scatter(zone, makers, count, spread) {
      const zoneTiles = world.tiles.filter(t => t.zone === zone);
      for (let i = 0; i < count; i++) {
        const near = U.pick(zoneTiles).pos;
        const spot = freeSpot(near, spread);
        if (!spot) continue;
        const obj = U.pick(makers)();
        obj.position.copy(spot);
        obj.rotation.y = U.rand(0, Math.PI * 2);
        const s = U.rand(0.8, 1.25);
        obj.scale.multiplyScalar(s);
        decoParent.add(obj);
        if (obj.userData.spin) {
          world.anims.push(t => { obj.rotation.y = t * obj.userData.spin; });
        }
      }
    }

    scatter(0, [() => tree(1), () => flower(0xff8fb1), () => flower(0xffa94d), () => flower(0xc79bff), mushroom], 26, 13);
    scatter(1, [palm, () => flower(0xff8c42), mushroom], 14, 12);
    scatter(2, [() => lollipop(0xff5d8f), () => lollipop(0x74c0fc), () => lollipop(0x8ce99a), cupcake, candyCane], 20, 12);
    scatter(3, [snowman, pineSnow, iceCrystal], 20, 13);

    /* ---------- そらの にぎやかし ---------- */

    /* くも */
    function cloud() {
      const g = new THREE.Group();
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(U.rand(1.0, 1.9), 10, 8), m);
        s.position.set(i * 1.5 - 2.2, U.rand(-0.3, 0.4), U.rand(-0.5, 0.5));
        s.scale.y = 0.62;
        g.add(s);
      }
      return g;
    }
    for (let i = 0; i < 9; i++) {
      const c = cloud();
      const cx = U.rand(-60, 60), cz = U.rand(-85, 85);
      c.position.set(cx, U.rand(16, 26), cz);
      const speed = U.rand(0.25, 0.7);
      scene.add(c);
      world.anims.push(t => {
        c.position.x = ((cx + t * speed + 70) % 140) - 70;
      });
    }

    /* ききゅう */
    const balloonCols = [0xff5d8f, 0x74c0fc, 0xffe066];
    balloonCols.forEach((col, i) => {
      const g = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 12), lambert(col));
      env.scale.y = 1.15;
      g.add(env);
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.72, 14, 12, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.14), lambert(0xffffff));
      stripe.scale.y = 1.15;
      g.add(stripe);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), lambert(0xb98a52));
      basket.position.y = -2.6;
      g.add(basket);
      for (const [rx, rz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4), lambert(0xdddddd));
        rope.position.set(rx, -1.85, rz);
        g.add(rope);
      }
      const bx = U.rand(-45, 45), bz = -30 + i * 42, by = U.rand(13, 19);
      scene.add(g);
      world.anims.push(t => {
        g.position.set(
          bx + Math.sin(t * 0.11 + i * 2.1) * 14,
          by + Math.sin(t * 0.5 + i) * 1.2,
          bz + Math.cos(t * 0.09 + i * 1.4) * 8
        );
      });
    });

    /* とり */
    for (let i = 0; i < 4; i++) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lambert([0x74c0fc, 0xffe066, 0xff8fb1, 0xffffff][i]));
      body.scale.z = 1.4;
      bird.add(body);
      const wingGeo = new THREE.PlaneGeometry(0.9, 0.42);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const wl = new THREE.Mesh(wingGeo, wingMat); wl.position.x = -0.5;
      const wr = new THREE.Mesh(wingGeo, wingMat); wr.position.x = 0.5;
      bird.add(wl, wr);
      const r = U.rand(18, 34), h = U.rand(9, 14), off = U.rand(0, 9), sp = U.rand(0.12, 0.2);
      const czx = U.rand(-15, 15), czz = U.rand(-40, 40);
      scene.add(bird);
      world.anims.push(t => {
        const a = t * sp + off;
        bird.position.set(czx + Math.cos(a) * r, h + Math.sin(t * 2 + off) * 0.6, czz + Math.sin(a) * r);
        bird.rotation.y = -a - Math.PI / 2;
        const flap = Math.sin(t * 10 + off) * 0.7;
        wl.rotation.z = flap; wr.rotation.z = -flap;
      });
    }

    /* ちょうちょ（はなばたけ） */
    for (let i = 0; i < 6; i++) {
      const bf = new THREE.Group();
      const wmat = new THREE.MeshBasicMaterial({ color: [0xffa8cf, 0xffd166, 0xa5d8ff][i % 3], side: THREE.DoubleSide });
      const wg = new THREE.CircleGeometry(0.28, 8);
      const w1 = new THREE.Mesh(wg, wmat); w1.position.x = -0.2;
      const w2 = new THREE.Mesh(wg, wmat); w2.position.x = 0.2;
      bf.add(w1, w2);
      const base = U.pick(world.tiles.filter(t => t.zone === 0)).pos;
      const ox = U.rand(-6, 6), oz = U.rand(-6, 6), off = U.rand(0, 9);
      scene.add(bf);
      world.anims.push(t => {
        bf.position.set(
          base.x + ox + Math.sin(t * 0.7 + off) * 2.5,
          1.4 + Math.sin(t * 1.7 + off) * 0.7,
          base.z + oz + Math.cos(t * 0.6 + off) * 2.5
        );
        bf.rotation.y = t * 0.8 + off;
        const flap = Math.sin(t * 14 + off) * 0.9;
        w1.rotation.y = flap; w2.rotation.y = -flap;
      });
    }

    /* ゆき（ゆきのくにの あたりに ふわふわ） */
    const snowN = 160;
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(snowN * 3);
    const snowCenter = zoneCenters[3];
    for (let i = 0; i < snowN; i++) {
      snowPos[i * 3] = snowCenter.x + U.rand(-24, 24);
      snowPos[i * 3 + 1] = U.rand(0, 16);
      snowPos[i * 3 + 2] = snowCenter.z + U.rand(-24, 24);
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    /* まるい ゆきつぶ テクスチャ */
    const dotCv = document.createElement('canvas');
    dotCv.width = dotCv.height = 32;
    const dg = dotCv.getContext('2d');
    const grad = dg.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = grad;
    dg.fillRect(0, 0, 32, 32);
    const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, map: new THREE.CanvasTexture(dotCv),
      transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false,
    }));
    scene.add(snowPts);
    world.anims.push((t, dt) => {
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < snowN; i++) {
        arr[i * 3 + 1] -= dt * U.lerp(1.1, 2.0, (i % 7) / 7);
        arr[i * 3] += Math.sin(t + i) * dt * 0.5;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 16;
      }
      snowGeo.attributes.position.needsUpdate = true;
    });

    /* おうえんだん（みちの よこで はねる どうぶつたち）は characters.js で */

    /* はたを ひらひら */
    world.anims.push(t => {
      cas.traverse(o => { if (o.userData.flag) o.rotation.y = Math.sin(t * 4) * 0.45; });
    });

    world.update = (t, dt) => { for (const fn of world.anims) fn(t, dt); };
    return world;
  }

  return { build, T, TILE_COUNT, ZONES, zoneOf };
})();
