/* くるまと どうぶつたち */
const Chars = (() => {

  const CHARS = {
    usagi: { name: 'うさぎ', emoji: '🐰', car: 0xff8fb1, fur: 0xffffff, inner: 0xffb7d0 },
    kuma:  { name: 'くま',   emoji: '🐻', car: 0xff6b6b, fur: 0xc98d5a, inner: 0xa06a3c },
    neko:  { name: 'ねこ',   emoji: '🐱', car: 0xffd43b, fur: 0xffb45e, inner: 0xffe0b0 },
    panda: { name: 'ぱんだ', emoji: '🐼', car: 0x69db7c, fur: 0xffffff, inner: 0x333333 },
  };

  function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }

  /* ---------- どうぶつの あたま ---------- */

  function animalHead(kind, s) {
    const c = CHARS[kind] || CHARS.usagi;
    const g = new THREE.Group();
    s = s || 1;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 16, 14), lambert(c.fur));
    g.add(head);

    /* め */
    const eyeMat = lambert(0x333333);
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 8), eyeMat);
      eye.position.set(sx * s, 0.08 * s, 0.44 * s);
      g.add(eye);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 6, 6), lambert(0xffffff));
      hl.position.set(sx * s + 0.03 * s, 0.11 * s, 0.49 * s);
      g.add(hl);
    }
    /* ほっぺ */
    for (const sx of [-0.3, 0.3]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffa8b8, transparent: true, opacity: 0.75 }));
      cheek.position.set(sx * s, -0.08 * s, 0.42 * s);
      cheek.scale.z = 0.4;
      g.add(cheek);
    }
    /* はな */
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 8), lambert(kind === 'neko' ? 0xff8fa5 : 0x4a3a35));
    nose.position.set(0, -0.03 * s, 0.5 * s);
    g.add(nose);

    if (kind === 'usagi') {
      for (const sx of [-0.2, 0.2]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * s, 0.5 * s, 4, 10), lambert(c.fur));
        ear.position.set(sx * s, 0.72 * s, 0);
        ear.rotation.z = -sx * 0.5;
        g.add(ear);
        const inn = new THREE.Mesh(new THREE.CapsuleGeometry(0.05 * s, 0.32 * s, 4, 8), lambert(c.inner));
        inn.position.set(sx * s, 0.72 * s, 0.07 * s);
        inn.rotation.z = -sx * 0.5;
        g.add(inn);
      }
    } else if (kind === 'kuma' || kind === 'panda') {
      const earCol = kind === 'panda' ? 0x333333 : c.fur;
      for (const sx of [-0.34, 0.34]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 10, 10), lambert(earCol));
        ear.position.set(sx * s, 0.42 * s, 0);
        g.add(ear);
      }
      if (kind === 'panda') {
        for (const sx of [-0.2, 0.2]) {
          const patch = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 8, 8), lambert(0x333333));
          patch.position.set(sx * s, 0.08 * s, 0.4 * s);
          patch.scale.z = 0.5;
          g.add(patch);
        }
        /* めを パッチの うえに */
        g.children.filter(o => o.position.z > 0.43 * s && o.geometry && o.geometry.parameters && o.geometry.parameters.radius === 0.07 * s)
          .forEach(eye => { eye.position.z = 0.5 * s; });
      }
      if (kind === 'kuma') {
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), lambert(0xe8c49a));
        muzzle.position.set(0, -0.08 * s, 0.44 * s);
        muzzle.scale.z = 0.7;
        g.add(muzzle);
      }
    } else if (kind === 'neko') {
      for (const sx of [-0.26, 0.26]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.3 * s, 4), lambert(c.fur));
        ear.position.set(sx * s, 0.5 * s, 0);
        ear.rotation.y = Math.PI / 4;
        g.add(ear);
      }
      /* しましま */
      for (const sx of [-0.1, 0.1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.16 * s, 0.05 * s), lambert(0xe08a3a));
        stripe.position.set(sx * s * 2.2, 0.3 * s, 0.36 * s);
        stripe.rotation.x = -0.5;
        g.add(stripe);
      }
    }
    return g;
  }

  /* ---------- じんせいゲームふうの くるま ---------- */

  function makeCar(kind) {
    const c = CHARS[kind] || CHARS.usagi;
    const g = new THREE.Group();

    const bodyMat = lambert(c.car);

    /* しゃたい */
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.3), bodyMat);
    body.position.y = 0.62;
    g.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.8), bodyMat);
    hood.position.set(0, 0.52, 1.0);
    g.add(hood);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.55), bodyMat);
    back.position.set(0, 0.95, -0.95);
    g.add(back);

    /* フロントガラス */
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85 }));
    glass.position.set(0, 1.05, 0.42);
    glass.rotation.x = -0.25;
    g.add(glass);

    /* ライト */
    for (const sx of [-0.5, 0.5]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
      light.position.set(sx, 0.6, 1.42);
      g.add(light);
    }

    /* タイヤ */
    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 10);
    hubGeo.rotateZ(Math.PI / 2);
    for (const [sx, sz] of [[-0.78, 0.75], [0.78, 0.75], [-0.78, -0.75], [0.78, -0.75]]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wheelGeo, lambert(0x444444)));
      w.add(new THREE.Mesh(hubGeo, lambert(0xffffff)));
      w.position.set(sx, 0.34, sz);
      g.add(w);
      wheels.push(w);
    }

    /* うんてんしゅ */
    const head = animalHead(kind, 0.9);
    head.position.set(0, 1.55, -0.25);
    g.add(head);

    /* からだ（ちいさく） */
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.3, 4, 10), lambert(c.car));
    torso.position.set(0, 0.95, -0.25);
    g.add(torso);

    /* かげ */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 18),
      new THREE.MeshBasicMaterial({ color: 0x2e4a28, transparent: true, opacity: 0.22, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    g.add(shadow);

    g.userData = { wheels, head, shadow, kind };
    return g;
  }

  /* ---------- おうえんだん ---------- */

  const EXTRA_ANIMALS = ['usagi', 'kuma', 'neko', 'panda'];

  function makeSpectators(world, scene) {
    const specs = [];
    const up = new THREE.Vector3(0, 1, 0);
    const every = 4;
    for (let i = 2; i < world.tiles.length - 2; i += every) {
      const tile = world.tiles[i];
      const u = i / (world.tiles.length - 1);
      const tan = world.curve.getTangentAt(u);
      const side = tan.clone().cross(up).normalize();
      const flip = (i % (every * 2) === 2) ? 1 : -1;
      const p = tile.pos.clone().add(side.multiplyScalar(4.2 * flip));

      const g = new THREE.Group();
      const kind = U.pick(EXTRA_ANIMALS);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 12),
        new THREE.MeshLambertMaterial({ color: CHARS[kind].fur }));
      body.position.y = 0.7;
      g.add(body);
      const head = animalHead(kind, 0.8);
      head.position.y = 1.55;
      g.add(head);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 14),
        new THREE.MeshBasicMaterial({ color: 0x2e4a28, transparent: true, opacity: 0.2, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.06;
      g.add(shadow);

      g.position.set(p.x, 0, p.z);
      g.lookAt(tile.pos.x, 0, tile.pos.z);
      scene.add(g);

      specs.push({ group: g, pos: p, tileIndex: i, cheerUntil: 0, phase: U.rand(0, 9) });
    }

    return {
      list: specs,
      cheerNear(pos, now) {
        for (const s of specs) {
          if (Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < 8) {
            s.cheerUntil = Math.max(s.cheerUntil, now + 1.6);
          }
        }
      },
      cheerAll(now, dur) {
        for (const s of specs) s.cheerUntil = now + (dur || 3);
      },
      update(t) {
        for (const s of specs) {
          if (t < s.cheerUntil) {
            const j = Math.abs(Math.sin((t + s.phase) * 9));
            s.group.position.y = j * 0.85;
            s.group.rotation.z = Math.sin((t + s.phase) * 9) * 0.15;
            const sq = 1 + j * 0.12;
            s.group.scale.set(1 / sq, sq, 1 / sq);
          } else {
            s.group.position.y = Math.abs(Math.sin((t + s.phase) * 1.6)) * 0.08;
            s.group.rotation.z = 0;
            s.group.scale.set(1, 1, 1);
          }
        }
      },
    };
  }

  /* ---------- おしごと ---------- */

  const JOBS = [
    { key: 'fire',   name: 'しょうぼうし',     emoji: '🚒' },
    { key: 'cake',   name: 'ケーキやさん',     emoji: '🍰' },
    { key: 'space',  name: 'うちゅうひこうし', emoji: '🚀' },
    { key: 'police', name: 'おまわりさん',     emoji: '👮' },
    { key: 'artist', name: 'がかさん',         emoji: '🎨' },
  ];

  function jobHat(key) {
    const g = new THREE.Group();
    if (key === 'fire') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xe53935));
      dome.position.y = 0.22;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.07, 16), lambert(0xc62828));
      brim.position.y = 0.2;
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), lambert(0xffd43b));
      badge.rotation.x = Math.PI / 2;
      badge.position.set(0, 0.42, 0.36);
      g.add(dome, brim, badge);
    } else if (key === 'cake') {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), lambert(0xffffff));
      puff.position.y = 0.52;
      puff.scale.y = 0.85;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.3, 14), lambert(0xfff3e0));
      band.position.y = 0.26;
      g.add(puff, band);
    } else if (key === 'space') {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 12),
        new THREE.MeshLambertMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.4 }));
      helm.position.y = 0.05;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 18), lambert(0xffffff));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.35;
      g.add(helm, ring);
    } else if (key === 'police') {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.24, 16), lambert(0x3949ab));
      top.position.y = 0.34;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), lambert(0x3949ab));
      crown.position.y = 0.4;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.06, 16, 1, false, -Math.PI / 3, Math.PI * 2 / 3), lambert(0x283593));
      brim.position.set(0, 0.24, 0.14);
      const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), lambert(0xffd43b));
      badge.position.set(0, 0.4, 0.4);
      g.add(top, crown, brim, badge);
    } else if (key === 'artist') {
      const beret = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), lambert(0x8e24aa));
      beret.scale.y = 0.42;
      beret.position.set(0.1, 0.32, 0);
      beret.rotation.z = -0.25;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), lambert(0x6a1b9a));
      stem.position.set(0.14, 0.5, 0);
      g.add(beret, stem);
    }
    return g;
  }

  /* ---------- せいちょうステージの いしょう ---------- */
  /* stage: 0=あかちゃん 1=こども 2=おとな 3=おじいちゃん */

  const STAGES = [
    { name: 'あかちゃん', emoji: '🍼' },
    { name: 'こども',     emoji: '🎒' },
    { name: 'おとな',     emoji: '👔' },
    { name: 'おじいちゃん', emoji: '👴' },
  ];

  function stageCostume(stage, jobKey) {
    const g = new THREE.Group();

    /* ぼうし：おしごとが あれば おしごとの ぼうし */
    if (jobKey && stage >= 1) {
      const h = jobHat(jobKey);
      h.position.y = 0.3;
      g.add(h);
    } else if (stage === 0) {
      /* あかちゃん：しろい ボンネット */
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), lambert(0xfffde7));
      cap.position.y = 0.1;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 18), lambert(0xffe082));
      rim.rotation.x = Math.PI / 2 - 0.35;
      rim.position.y = 0.06;
      g.add(cap, rim);
    } else if (stage === 1) {
      /* こども：あかい ぼうし */
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), lambert(0xef5350));
      cap.position.y = 0.16;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.05, 14, 1, false, -Math.PI / 3, Math.PI * 2 / 3), lambert(0xd32f2f));
      brim.position.set(0, 0.18, 0.2);
      const pon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lambert(0xffffff));
      pon.position.y = 0.56;
      g.add(cap, brim, pon);
    } else if (stage === 2) {
      /* おとな：シルクハット */
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.42, 14), lambert(0x455a64));
      top.position.y = 0.44;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), lambert(0x455a64));
      brim.position.y = 0.24;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.33, 0.1, 14), lambert(0xffb703));
      band.position.y = 0.3;
      g.add(top, brim, band);
    }

    /* おじいちゃん：しろい ひげ と めがね（ぼうしとは べつ） */
    if (stage === 3) {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lambert(0xf5f5f5));
      beard.position.set(0, -0.3, 0.3);
      beard.scale.set(1.25, 0.85, 0.7);
      g.add(beard);
      for (const sx of [-0.18, 0.18]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 6, 14), lambert(0x5d4037));
        lens.position.set(sx, 0.08, 0.44);
        g.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), lambert(0x5d4037));
      bridge.position.set(0, 0.08, 0.44);
      g.add(bridge);
      if (!jobKey) {
        /* おじいちゃんの ベレーぼう */
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), lambert(0x8d9e78));
        cap.scale.y = 0.4;
        cap.position.y = 0.34;
        g.add(cap);
      }
    }
    return g;
  }

  /* くるまに いしょうを きせる（まえの いしょうは ぬぐ） */
  function applyCostume(car, stage, jobKey) {
    const head = car.userData.head;
    if (car.userData.costume) head.remove(car.userData.costume);
    const c = stageCostume(stage, jobKey);
    c.position.y = 0.28;
    head.add(c);
    car.userData.costume = c;
    /* せいちょうで あたまの おおきさも かわる */
    const hs = [0.82, 0.95, 1.05, 1.0][stage] || 1;
    head.scale.setScalar(hs);
  }

  /* ---------- どうじょうしゃ（けっこん・あかちゃん） ---------- */

  const SEATS = [
    { x: -0.42, y: 1.15, z: -0.85 },
    { x: 0.42, y: 1.15, z: -0.85 },
    { x: 0, y: 1.3, z: -1.1 },
  ];

  function addPassenger(car, kind, opts) {
    opts = opts || {};
    car.userData.passengers = car.userData.passengers || [];
    const i = Math.min(car.userData.passengers.length, SEATS.length - 1);
    const g = new THREE.Group();
    const s = opts.baby ? 0.5 : 0.7;
    const head = animalHead(kind, s);
    head.position.y = 0.32;
    g.add(head);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s / 0.7, 0.2, 4, 8),
      lambert(opts.baby ? 0xfff9c4 : CHARS[kind].fur));
    body.position.y = 0;
    g.add(body);
    if (opts.bow) {
      /* あたまに リボン */
      const bow = new THREE.Group();
      for (const sx of [-0.11, 0.11]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 6), lambert(0xff4081));
        wing.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        wing.position.x = sx;
        bow.add(wing);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lambert(0xf50057));
      bow.add(knot);
      bow.position.set(0.16, 0.72 * s + 0.32, 0);
      g.add(bow);
    }
    if (opts.baby) {
      /* あかちゃんぼうし */
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xffe0f0));
      cap.position.y = 0.32 + 0.3 * s;
      g.add(cap);
    }
    const seat = SEATS[i];
    g.position.set(seat.x, seat.y, seat.z);
    car.add(g);
    car.userData.passengers.push({ kind, group: g, baby: !!opts.baby });
    return g;
  }

  /* ---------- おかいものした もの（にだいに のせる） ---------- */

  const CARGO_SPOTS = [
    { x: 0.5, y: 1.28, z: -1.0, s: 1 },
    { x: -0.5, y: 1.28, z: -1.0, s: 1 },
    { x: 0, y: 1.55, z: -1.0, s: 0.9 },
    { x: 0.45, y: 1.75, z: -1.0, s: 0.8 },
    { x: -0.45, y: 1.75, z: -1.0, s: 0.8 },
  ];

  function cargoMesh(item) {
    const g = new THREE.Group();
    if (item === 'teddy') {
      const h = animalHead('kuma', 0.5);
      h.position.y = 0.25;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lambert(0xc98d5a));
      g.add(h, b);
    } else if (item === 'ball') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), lambert(0xff6b6b));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 6, 16), lambert(0xffffff));
      band.rotation.x = Math.PI / 2;
      g.add(b, band);
    } else if (item === 'ice') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 10), lambert(0xd7a86e));
      cone.rotation.x = Math.PI;
      cone.position.y = 0;
      const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lambert(0xfff0f6));
      scoop.position.y = 0.28;
      const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lambert(0xff4d6d));
      cherry.position.y = 0.44;
      g.add(cone, scoop, cherry);
    } else if (item === 'elephant') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lambert(0x90a4d4));
      const headE = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lambert(0x90a4d4));
      headE.position.set(0, 0.24, 0.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), lambert(0x90a4d4));
      trunk.rotation.x = 0.9;
      trunk.position.set(0, 0.1, 0.42);
      for (const sx of [-0.2, 0.2]) {
        const ear = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10),
          new THREE.MeshLambertMaterial({ color: 0xb3c2e8, side: THREE.DoubleSide }));
        ear.position.set(sx, 0.3, 0.14);
        ear.rotation.y = sx * 2;
        g.add(ear);
      }
      g.add(body, headE, trunk);
      g.scale.setScalar(1.35);
    }
    return g;
  }

  function addCargo(car, item) {
    car.userData.cargo = car.userData.cargo || [];
    const i = Math.min(car.userData.cargo.length, CARGO_SPOTS.length - 1);
    const spot = CARGO_SPOTS[i];
    const m = cargoMesh(item);
    m.position.set(spot.x, spot.y, spot.z);
    m.scale.multiplyScalar(spot.s);
    m.rotation.y = U.rand(-0.5, 0.5);
    car.add(m);
    car.userData.cargo.push({ item, group: m });
    return m;
  }

  /* ---------- どろぼう ねずみ ---------- */

  function makeMouse() {
    const g = new THREE.Group();
    const gray = lambert(0x9e9e9e);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), gray);
    body.scale.set(0.85, 0.8, 1.15);
    body.position.y = 0.38;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), gray);
    head.position.set(0, 0.62, 0.42);
    g.add(head);
    const noseM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lambert(0xff8fa5));
    noseM.position.set(0, 0.58, 0.72);
    g.add(noseM);
    for (const sx of [-0.16, 0.16]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10),
        new THREE.MeshLambertMaterial({ color: 0xbdbdbd, side: THREE.DoubleSide }));
      ear.position.set(sx, 0.9, 0.36);
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), lambert(0x333333));
      eye.position.set(sx * 0.8, 0.68, 0.66);
      g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.8, 6), lambert(0xef9a9a));
    tail.rotation.x = 1.2;
    tail.position.set(0, 0.4, -0.7);
    g.add(tail);
    /* かかえる ほしぶくろ */
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lambert(0xffe082));
    sack.position.set(0.3, 0.5, 0.3);
    sack.visible = false;
    g.add(sack);
    g.userData.sack = sack;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 12),
      new THREE.MeshBasicMaterial({ color: 0x2e4a28, transparent: true, opacity: 0.2, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    g.add(shadow);
    return g;
  }

  /* プレゼントから でてくる おもちゃ */
  function makeToy() {
    const kind = U.randInt(0, 3);
    const g = new THREE.Group();
    if (kind === 0) {          /* あひる */
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), lambert(0xffd43b));
      b.scale.z = 1.2; g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), lambert(0xffd43b));
      h.position.set(0, 0.45, 0.3); g.add(h);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), lambert(0xff8c42));
      beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.42, 0.6); g.add(beak);
    } else if (kind === 1) {   /* ロボット */
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.4), lambert(0x74c0fc));
      b.position.y = 0.1; g.add(b);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.35), lambert(0xa5d8ff));
      h.position.y = 0.62; g.add(h);
      const ant = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), lambert(0xff5d6d));
      ant.position.y = 0.9; g.add(ant);
      for (const sx of [-0.12, 0.12]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), lambert(0x333366));
        e.position.set(sx, 0.65, 0.19); g.add(e);
      }
    } else if (kind === 2) {   /* ボール */
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), lambert(0xff6b6b));
      g.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20), lambert(0xffffff));
      band.rotation.x = Math.PI / 2; g.add(band);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), lambert(0xffe066));
      star.position.z = 0.45; g.add(star);
    } else {                   /* こぐま の ぬいぐるみ */
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), lambert(0xc98d5a));
      b.position.y = 0; g.add(b);
      const h = animalHead('kuma', 0.7);
      h.position.y = 0.55; g.add(h);
    }
    return g;
  }

  return {
    CHARS, JOBS, STAGES,
    makeCar, animalHead, makeSpectators, makeToy,
    applyCostume, addPassenger, addCargo, makeMouse,
  };
})();
