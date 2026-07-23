/* キラキラ・かみふぶき・はなび などの えんしゅつ */
const FX = (() => {

  const COLORS = [0xff5d8f, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc, 0xff8787];

  function create(scene) {
    const parts = [];      /* とびちる つぶ */
    const sprites = [];    /* うかぶ もじ */

    const starGeo = new THREE.OctahedronGeometry(0.16);
    const boxGeo = new THREE.PlaneGeometry(0.3, 0.2);
    const mats = {};
    function matOf(color, double) {
      const key = color + (double ? 'd' : '');
      if (!mats[key]) {
        mats[key] = double
          ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
          : new THREE.MeshBasicMaterial({ color });
      }
      return mats[key];
    }

    function spawn(geo, color, pos, vel, life, spin, double, gravity) {
      const m = new THREE.Mesh(geo, matOf(color, double));
      m.position.copy(pos);
      scene.add(m);
      parts.push({
        m, vel: vel.clone(), life, age: 0,
        spin: spin || 0, gravity: gravity == null ? 9 : gravity,
        rx: U.rand(0, Math.PI), rz: U.rand(0, Math.PI),
      });
    }

    const api = {
      /* ほしの ばくはつ */
      burst(pos, color, n, power) {
        n = n || 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + U.rand(-0.3, 0.3);
          const p = power || 1;
          const vel = new THREE.Vector3(
            Math.cos(a) * U.rand(2, 5) * p,
            U.rand(3.5, 7) * p,
            Math.sin(a) * U.rand(2, 5) * p
          );
          spawn(starGeo, color || U.pick(COLORS), pos, vel, U.rand(0.6, 1.1), U.rand(3, 9));
        }
      },

      /* かみふぶき：pos の うえから ひらひら */
      confetti(pos, n, spread) {
        n = n || 40;
        for (let i = 0; i < n; i++) {
          const start = pos.clone().add(new THREE.Vector3(
            U.rand(-(spread || 5), spread || 5), U.rand(6, 11), U.rand(-(spread || 5), spread || 5)));
          const vel = new THREE.Vector3(U.rand(-0.8, 0.8), U.rand(-1.4, -0.4), U.rand(-0.8, 0.8));
          spawn(boxGeo, U.pick(COLORS), start, vel, U.rand(2.2, 3.6), U.rand(4, 10), true, 0.35);
        }
      },

      /* はなび：たかい ところで ドーン */
      firework(pos, color) {
        const col = color || U.pick(COLORS);
        for (let i = 0; i < 30; i++) {
          const dir = new THREE.Vector3(U.rand(-1, 1), U.rand(-1, 1), U.rand(-1, 1)).normalize();
          const sp = U.rand(5, 9);
          spawn(starGeo, col, pos, dir.multiplyScalar(sp), U.rand(0.9, 1.5), U.rand(2, 7), false, 3.5);
        }
        for (let i = 0; i < 8; i++) {
          const dir = new THREE.Vector3(U.rand(-1, 1), U.rand(-0.2, 1), U.rand(-1, 1)).normalize();
          spawn(starGeo, 0xffffff, pos, dir.multiplyScalar(U.rand(3, 5)), U.rand(0.5, 0.8), 5, false, 3.5);
        }
      },

      /* タップした ところに ちいさな キラッ */
      sparkle(pos) {
        for (let i = 0; i < 7; i++) {
          const a = U.rand(0, Math.PI * 2);
          spawn(starGeo, U.pick(COLORS), pos,
            new THREE.Vector3(Math.cos(a) * U.rand(1, 2.6), U.rand(2.5, 4.6), Math.sin(a) * U.rand(1, 2.6)),
            U.rand(0.4, 0.7), U.rand(4, 9));
        }
      },

      /* うかんで きえる もじ */
      floatText(text, pos, color, scale) {
        const sp = U.textSprite(text, color, scale || 2.4);
        sp.position.copy(pos);
        scene.add(sp);
        sprites.push({ sp, age: 0, life: 1.3, vy: 2.6 });
      },

      /* えもじが ふわふわ うかぶ（ハートなど） */
      emojiBurst(pos, emoji, n, scale) {
        n = n || 5;
        for (let i = 0; i < n; i++) {
          const tex = U.emojiTexture(emoji, 96);
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
          const sp = new THREE.Sprite(mat);
          const s = scale || 1.4;
          sp.scale.set(s, s, 1);
          sp.position.copy(pos).add(new THREE.Vector3(U.rand(-1.6, 1.6), U.rand(0.2, 1.4), U.rand(-1.6, 1.6)));
          scene.add(sp);
          sprites.push({ sp, age: -i * 0.12, life: 1.5, vy: U.rand(1.6, 2.6), sway: U.rand(2, 4) });
        }
      },

      /* おんぷ */
      notes(pos) {
        for (let i = 0; i < 5; i++) {
          const sp = U.textSprite(i % 2 ? '♪' : '♫', '#7048e8', 1.6);
          sp.position.copy(pos).add(new THREE.Vector3(U.rand(-2, 2), U.rand(0.5, 1.5), U.rand(-2, 2)));
          scene.add(sp);
          sprites.push({ sp, age: -i * 0.15, life: 1.6, vy: 2.0, sway: U.rand(2, 4) });
        }
      },

      /* けむり（ろうそくを けしたとき など） */
      puff(pos) {
        for (let i = 0; i < 6; i++) {
          spawn(starGeo, 0xdddddd, pos,
            new THREE.Vector3(U.rand(-1, 1), U.rand(1.5, 3), U.rand(-1, 1)),
            U.rand(0.5, 0.9), 2, false, -1.5);
        }
      },

      update(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.age += dt;
          if (p.age >= p.life) {
            scene.remove(p.m);
            parts.splice(i, 1);
            continue;
          }
          p.vel.y -= p.gravity * dt;
          p.m.position.addScaledVector(p.vel, dt);
          p.m.rotation.x = p.rx + p.age * p.spin;
          p.m.rotation.z = p.rz + p.age * p.spin * 0.8;
          const k = 1 - p.age / p.life;
          p.m.scale.setScalar(Math.max(0.05, k));
        }
        for (let i = sprites.length - 1; i >= 0; i--) {
          const s = sprites[i];
          s.age += dt;
          if (s.age < 0) continue;
          if (s.age >= s.life) {
            scene.remove(s.sp);
            U.disposeSprite(s.sp);
            sprites.splice(i, 1);
            continue;
          }
          s.sp.position.y += s.vy * dt;
          if (s.sway) s.sp.position.x += Math.sin(s.age * s.sway) * dt;
          s.sp.material.opacity = 1 - Math.pow(s.age / s.life, 2);
        }
      },

      clear() {
        for (const p of parts) scene.remove(p.m);
        parts.length = 0;
        for (const s of sprites) { scene.remove(s.sp); U.disposeSprite(s.sp); }
        sprites.length = 0;
      },
    };

    return api;
  }

  return { create };
})();
