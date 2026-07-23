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

  return { CHARS, makeCar, animalHead, makeSpectators, makeToy };
})();
