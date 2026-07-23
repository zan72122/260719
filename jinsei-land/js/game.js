/* ゲームほんたい：ターンせいぎょ・イベント・カメラ */
const Game = (() => {

  let renderer, scene, camera, world, fx, spectators, roulette;
  let players = [], turnIdx = 0;
  let running = false;
  let rafId = 0;
  let elapsed = 0;
  let camTarget = new THREE.Vector3();
  let camPos = new THREE.Vector3();
  let camMode = 'follow';         /* follow | goal */
  let goalOrbitT = 0;
  let onFinish = null;
  let raycaster, pointerV;
  let tappables = [];             /* いま タップできる 3D オブジェクト */
  let stageEl, bannerEl, rouletteWrap, hintEl, badgesEl;
  let disposers = [];

  const T = World.T;

  /* ---------------- セットアップ ---------------- */

  function init(opts) {
    stageEl = document.getElementById('stage');
    bannerEl = document.getElementById('banner');
    rouletteWrap = document.getElementById('rouletteWrap');
    hintEl = document.getElementById('rouletteHint');
    badgesEl = document.getElementById('badges');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaee9ff);
    scene.fog = new THREE.Fog(0xcdeeff, 55, 130);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stageEl.appendChild(renderer.domElement);

    world = World.build(scene);
    fx = FX.create(scene);
    spectators = Chars.makeSpectators(world, scene);

    raycaster = new THREE.Raycaster();
    pointerV = new THREE.Vector2();

    /* プレイヤー */
    players = opts.players.map((p, i) => {
      const car = Chars.makeCar(p.kind);
      const tile = world.tiles[0];
      const off = offsetOnTile(i, opts.players.length);
      car.position.set(tile.pos.x + off.x, 0, tile.pos.z + off.z);
      faceAlongPath(car, 0);
      scene.add(car);
      return {
        ...Chars.CHARS[p.kind], kind: p.kind, human: p.human,
        label: p.label, car, tileIndex: 0, stars: 0, finished: false, rank: 0,
      };
    });
    turnIdx = 0;
    camMode = 'follow';
    goalOrbitT = 0;

    buildBadges();

    /* ルーレット */
    const rcv = document.getElementById('roulette');
    roulette = Roulette.create(rcv);
    showRoulette(false, false);

    /* カメラ しょきち */
    const p0 = players[0].car.position;
    camTarget.copy(p0);
    camPos.copy(p0).add(camOffset());
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    onResize();
    const resizeH = () => onResize();
    window.addEventListener('resize', resizeH);
    disposers.push(() => window.removeEventListener('resize', resizeH));

    const tapH = e => onTap(e);
    renderer.domElement.addEventListener('pointerdown', tapH);
    disposers.push(() => renderer.domElement.removeEventListener('pointerdown', tapH));

    running = true;
    elapsed = 0;
    let last = performance.now();
    function loop(now) {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      world.update(elapsed, dt);
      spectators.update(elapsed);
      fx.update(dt);
      updateCamera(dt);
      updateCars(dt);
      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(loop);

    S.bgmStart();
    turnLoop(opts);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    S.bgmStop();
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    for (const d of disposers) d();
    disposers = [];
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null; scene = null; world = null; fx = null;
    players = [];
    tappables = [];
  }

  /* ---------------- HUD ---------------- */

  function buildBadges() {
    badgesEl.innerHTML = '';
    players.forEach((p, i) => {
      const b = document.createElement('div');
      b.className = 'badge';
      b.id = 'badge' + i;
      b.innerHTML = `<span class="bface">${p.emoji}</span><span>⭐<span class="bstars">0</span></span>`;
      badgesEl.appendChild(b);
    });
  }

  function updateBadge(i) {
    const p = players[i];
    const el = document.getElementById('badge' + i);
    if (el) el.querySelector('.bstars').textContent = p.stars;
  }

  function setTurnBadge(i) {
    players.forEach((_, k) => {
      const el = document.getElementById('badge' + k);
      if (el) el.classList.toggle('turn', k === i);
    });
  }

  function showBanner(text, ms) {
    bannerEl.textContent = text;
    bannerEl.classList.remove('hidden');
    /* アニメを やりなおす */
    bannerEl.style.animation = 'none';
    void bannerEl.offsetWidth;
    bannerEl.style.animation = '';
    if (ms) setTimeout(() => { if (bannerEl.textContent === text) bannerEl.classList.add('hidden'); }, ms);
  }

  function hideBanner() { bannerEl.classList.add('hidden'); }

  function showRoulette(show, withHint) {
    rouletteWrap.classList.toggle('off', !show);
    hintEl.style.visibility = withHint ? 'visible' : 'hidden';
  }

  /* ---------------- カメラ・くるま ---------------- */

  function camOffset() {
    const portrait = window.innerHeight > window.innerWidth;
    return portrait ? new THREE.Vector3(0, 15.5, 17.5) : new THREE.Vector3(0, 10.5, 13.5);
  }

  function updateCamera(dt) {
    const k = 1 - Math.pow(0.001, dt);   /* なめらかに ついていく */
    if (camMode === 'goal') {
      goalOrbitT += dt * 0.5;
      const c = world.castle.position;
      const r = 16;
      const want = new THREE.Vector3(
        c.x + Math.cos(goalOrbitT) * r, 9.5, c.z + Math.sin(goalOrbitT) * r);
      camPos.lerp(want, k);
      camTarget.lerp(new THREE.Vector3(c.x, 3, c.z), k);
    } else {
      const p = players[turnIdx] ? players[turnIdx].car.position : new THREE.Vector3();
      camTarget.lerp(new THREE.Vector3(p.x, p.y + 1, p.z), k);
      const want = new THREE.Vector3().copy(p).add(camOffset());
      camPos.lerp(want, k * 0.8);
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  function updateCars(dt) {
    for (const p of players) {
      const ud = p.car.userData;
      if (ud.moving) {
        for (const w of ud.wheels) w.rotation.x += dt * 14;
      }
      /* うんてんしゅが ゆらゆら */
      ud.head.rotation.z = Math.sin(elapsed * 3 + p.car.position.x) * 0.08;
    }
  }

  function onResize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = h > w ? 60 : 52;
    camera.updateProjectionMatrix();
  }

  function offsetOnTile(i, total) {
    if (total <= 1) return { x: 0, z: 0 };
    const a = (i / total) * Math.PI * 2 + 0.7;
    return { x: Math.cos(a) * 0.85, z: Math.sin(a) * 0.85 };
  }

  function faceAlongPath(car, u) {
    const tan = world.curve.getTangentAt(U.clamp(u, 0, 1));
    car.rotation.y = Math.atan2(tan.x, tan.z);
  }

  function tileU(i) { return i / (world.TILE_COUNT - 1); }

  /* ---------------- タップ ---------------- */

  function onTap(e) {
    if (!running) return;
    S.unlock();
    const rect = renderer.domElement.getBoundingClientRect();
    pointerV.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerV, camera);

    /* 1) ミニゲームの まと */
    if (tappables.length) {
      const hits = raycaster.intersectObjects(tappables, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !obj.userData.tapTarget) obj = obj.parent;
        if (obj && obj.userData.onTap) { obj.userData.onTap(); return; }
      }
    }

    /* 2) くるまを つついたら クラクション */
    for (const p of players) {
      const hits = raycaster.intersectObject(p.car, true);
      if (hits.length) {
        S.honk();
        U.vibrate(20);
        bounce(p.car, 0.35);
        fx.sparkle(p.car.position.clone().add(new THREE.Vector3(0, 2, 0)));
        return;
      }
    }

    /* 3) じめんタップ → キラキラ */
    const gHits = raycaster.intersectObject(world.ground);
    if (gHits.length) {
      fx.sparkle(gHits[0].point.clone().add(new THREE.Vector3(0, 0.4, 0)));
      S.pop();
    }
  }

  async function bounce(obj, power) {
    const y0 = 0;
    await U.tween(320, t => {
      if (!running) return;
      obj.position.y = y0 + Math.sin(t * Math.PI) * (power || 0.5) * 2;
    });
    if (running) obj.position.y = y0;
  }

  /* ---------------- いどう ---------------- */

  async function hopTo(p, fromIdx, toIdx, hopN) {
    const from = world.tiles[fromIdx].pos, to = world.tiles[toIdx].pos;
    const off = offsetOnTile(players.indexOf(p), players.length);
    const fx0 = from.x + off.x, fz0 = from.z + off.z;
    const tx = to.x + off.x, tz = to.z + off.z;
    p.car.userData.moving = true;
    S.hop(hopN);
    const targetRotY = Math.atan2(tx - fx0, tz - fz0);
    const rot0 = p.car.rotation.y;
    let dRot = targetRotY - rot0;
    while (dRot > Math.PI) dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;

    await U.tween(400, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      p.car.position.x = U.lerp(fx0, tx, e);
      p.car.position.z = U.lerp(fz0, tz, e);
      p.car.position.y = Math.sin(t * Math.PI) * 1.5;
      p.car.rotation.y = rot0 + dRot * Math.min(1, t * 2);
      const s = Math.sin(t * Math.PI);
      p.car.scale.set(1 - s * 0.07, 1 + s * 0.14, 1 - s * 0.07);
    });
    if (!running) return;
    p.car.position.y = 0;
    p.car.scale.set(1, 1, 1);
    p.car.userData.moving = false;
    S.land();
    spectators.cheerNear(world.tiles[toIdx].pos, elapsed);
  }

  async function moveSteps(p, steps) {
    for (let s = 0; s < steps; s++) {
      const next = p.tileIndex + 1;
      if (next >= world.TILE_COUNT) break;
      await hopTo(p, p.tileIndex, next, s);
      if (!running) return;
      p.tileIndex = next;
      if (next === world.TILE_COUNT - 1) return;  /* ゴール！ */
      await U.wait(60);
    }
  }

  async function slideBack(p, steps) {
    const target = Math.max(1, p.tileIndex - steps);
    S.slip();
    fx.floatText('おっとっと〜', p.car.position.clone().add(new THREE.Vector3(0, 3, 0)), '#ff8c42', 2.6);
    const fromIdx = p.tileIndex;
    const off = offsetOnTile(players.indexOf(p), players.length);
    const u0 = tileU(fromIdx), u1 = tileU(target);
    const rot0 = p.car.rotation.y;
    await U.tween(1100, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      const pt = world.curve.getPointAt(U.lerp(u0, u1, e));
      p.car.position.set(pt.x + off.x, Math.abs(Math.sin(t * Math.PI * 3)) * 0.4, pt.z + off.z);
      p.car.rotation.y = rot0 + t * Math.PI * 4;  /* くるくる〜 */
    });
    if (!running) return;
    p.car.position.y = 0;
    p.tileIndex = target;
    faceAlongPath(p.car, tileU(target));
  }

  async function rocketJump(p, steps) {
    const target = Math.min(world.TILE_COUNT - 1, p.tileIndex + steps);
    S.rocket();
    U.vibrate(40);
    const off = offsetOnTile(players.indexOf(p), players.length);
    const u0 = tileU(p.tileIndex), u1 = tileU(target);
    let trail = 0;
    await U.tween(1300, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      const pt = world.curve.getPointAt(U.lerp(u0, u1, e));
      p.car.position.set(pt.x + off.x, Math.sin(t * Math.PI) * 6.5, pt.z + off.z);
      p.car.rotation.y += 0.02;
      trail += 1;
      if (trail % 4 === 0 && t < 0.9) {
        fx.burst(p.car.position.clone().add(new THREE.Vector3(0, -0.5, 0)), 0xffa94d, 3, 0.4);
      }
    });
    if (!running) return;
    p.car.position.y = 0;
    p.tileIndex = target;
    faceAlongPath(p.car, tileU(target));
    S.land();
    fx.burst(p.car.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xffe066, 12);
  }

  /* ---------------- マスの イベント ---------------- */

  function addStars(p, n, pos) {
    p.stars += n;
    updateBadge(players.indexOf(p));
    fx.floatText('+' + n, (pos || p.car.position).clone().add(new THREE.Vector3(0, 3.2, 0)), '#f5a623', 2.8);
  }

  async function eventStar(p) {
    S.star(p.tileIndex);
    fx.burst(p.car.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffd43b, 12);
    addStars(p, 1);
    await U.wait(500);
  }

  async function eventPresent(p) {
    showBanner('🎁 プレゼント！', 1600);
    S.present();
    S.say('プレゼント！');

    const tile = world.tiles[p.tileIndex];
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: 0xff8fb1 }));
    box.position.y = 0.6;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), new THREE.MeshLambertMaterial({ color: 0xff5d8f }));
    lid.position.y = 1.4;
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.45, 1.7), new THREE.MeshLambertMaterial({ color: 0xffe066 }));
    ribbon.position.y = 0.75;
    g.add(box, lid, ribbon);
    g.position.set(tile.pos.x, 0.5, tile.pos.z);
    g.scale.setScalar(0.01);
    scene.add(g);

    await U.tween(400, t => { if (running) g.scale.setScalar(U.easeOutBack(t)); });
    await U.wait(400);
    if (!running) { scene.remove(g); return; }

    /* ふたが ぽーん */
    S.pop();
    const toy = Chars.makeToy();
    toy.position.copy(g.position).setY(1.2);
    toy.scale.setScalar(0.01);
    scene.add(toy);
    await U.tween(700, t => {
      if (!running) return;
      lid.position.y = 1.4 + t * 5;
      lid.rotation.z = t * 7;
      lid.rotation.x = t * 3;
      const mat = lid.material; mat.transparent = true; mat.opacity = 1 - t;
      toy.scale.setScalar(U.easeOutBack(t) * 1.1);
      toy.position.y = 1.2 + U.easeOut(t) * 1.6;
      toy.rotation.y = t * 6;
    });
    if (!running) { scene.remove(g); scene.remove(toy); return; }

    fx.confetti(g.position, 26, 3);
    S.cheer();
    addStars(p, 2, g.position);
    await U.wait(1100);

    await U.tween(350, t => {
      if (!running) return;
      const s = Math.max(0.01, 1 - t);
      g.scale.setScalar(s);
      toy.scale.setScalar(s);
    });
    scene.remove(g);
    scene.remove(toy);
  }

  async function eventCake(p) {
    showBanner('🎂 ろうそくを けそう！', 2200);
    S.present();
    S.say('ろうそくを たっちで けしてね！');

    const tile = world.tiles[p.tileIndex];
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.8, 20), new THREE.MeshLambertMaterial({ color: 0xfff3e0 }));
    base.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 20), new THREE.MeshLambertMaterial({ color: 0xffc9de }));
    top.position.y = 1.15;
    const icing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 8, 24), new THREE.MeshLambertMaterial({ color: 0xff8fb1 }));
    icing.rotation.x = Math.PI / 2;
    icing.position.y = 0.82;
    g.add(base, top, icing);

    const candles = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
    for (let i = 0; i < 3; i++) {
      const cg = new THREE.Group();
      const a = i / 3 * Math.PI * 2 + 0.5;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: [0xff6b6b, 0x74c0fc, 0x8ce99a][i] }));
      stick.position.y = 0.4;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), flameMat.clone());
      flame.position.y = 0.95;
      flame.scale.y = 1.5;
      cg.add(stick, flame);
      cg.position.set(Math.cos(a) * 0.55, 1.5, Math.sin(a) * 0.55);
      cg.userData.tapTarget = true;
      cg.userData.flame = flame;
      g.add(cg);
      candles.push(cg);
    }
    g.position.set(tile.pos.x, 0.5, tile.pos.z);
    g.scale.setScalar(0.01);
    scene.add(g);
    await U.tween(450, t => { if (running) g.scale.setScalar(U.easeOutBack(t)); });

    let left = candles.length;
    let resolveDone;
    const done = new Promise(r => { resolveDone = r; });

    for (const cg of candles) {
      cg.userData.onTap = () => {
        if (!cg.userData.flame.visible) return;
        cg.userData.flame.visible = false;
        S.puff();
        U.vibrate(25);
        fx.puff(g.position.clone().add(cg.position).add(new THREE.Vector3(0, 0.6, 0)));
        addStars(p, 1, g.position);
        left--;
        if (left <= 0) resolveDone();
      };
      tappables.push(cg);
    }

    /* CPU は じぶんで ふく。にんげんは 10びょうで おてつだい */
    let helper = null;
    if (!p.human) {
      helper = setInterval(() => {
        if (!running) { resolveDone(); return; }
        const c = candles.find(c => c.userData.flame.visible);
        if (c) c.userData.onTap();
      }, 900);
    } else {
      helper = setTimeout(async () => {
        for (const c of candles) {
          if (!running) break;
          if (c.userData.flame.visible && left > 0) { c.userData.onTap(); await U.wait(400); }
        }
      }, 10000);
    }

    /* ほのお ゆらゆら */
    const flicker = setInterval(() => {
      if (!running) { resolveDone(); return; }
      for (const c of candles) {
        if (c.userData.flame.visible) c.userData.flame.scale.y = 1.3 + Math.random() * 0.5;
      }
    }, 90);

    await done;
    clearInterval(flicker);
    if (p.human) clearTimeout(helper); else clearInterval(helper);
    tappables = tappables.filter(t => !candles.includes(t));

    S.cheer();
    S.say('じょうずに けせたね！');
    fx.confetti(g.position, 22, 3);
    showBanner('ふー！ できたね！', 1600);
    await U.wait(1000);
    await U.tween(350, t => { if (running) g.scale.setScalar(Math.max(0.01, 1 - t)); });
    scene.remove(g);
  }

  async function eventRainbow(p) {
    showBanner('🌈 ほしを あつめて！', 2000);
    S.say('おほしさまを たっちして あつめよう！');
    S.present();

    /* にじが しゅっと でる */
    const arch = (function () {
      const g = new THREE.Group();
      const cols = [0xff5d5d, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc];
      cols.forEach((c, i) => {
        const t = new THREE.Mesh(
          new THREE.TorusGeometry(5 - i * 0.32, 0.16, 8, 32, Math.PI),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 })
        );
        g.add(t);
      });
      return g;
    })();
    arch.position.copy(p.car.position);
    arch.rotation.y = p.car.rotation.y + Math.PI / 2;
    arch.scale.setScalar(0.01);
    scene.add(arch);
    U.tween(600, t => { if (running) arch.scale.setScalar(U.easeOutBack(t)); });

    const starGeo = new THREE.OctahedronGeometry(0.55);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffd43b });
    const stars = [];
    const N = 6;
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(starGeo, starMat.clone());
      const a = i / N * Math.PI * 2;
      m.position.set(
        p.car.position.x + Math.cos(a) * U.rand(2.5, 4.5),
        U.rand(7, 11),
        p.car.position.z + Math.sin(a) * U.rand(2.5, 4.5)
      );
      m.userData.tapTarget = true;
      m.userData.vy = U.rand(-2.2, -1.6);
      m.userData.landed = 0;
      scene.add(m);
      stars.push(m);
      tappables.push(m);
    }

    let got = 0;
    let resolveDone;
    const done = new Promise(r => { resolveDone = r; });

    function collect(m) {
      if (m.userData.got) return;
      m.userData.got = true;
      S.star(got);
      fx.burst(m.position, 0xffd43b, 8, 0.7);
      addStars(p, 1, m.position);
      scene.remove(m);
      got++;
      if (got >= N) resolveDone();
    }
    for (const m of stars) m.userData.onTap = () => collect(m);

    /* ほしが ゆっくり おちてくる。じめんに ついて 1びょうで じどうかいしゅう */
    const fall = setInterval(() => {
      if (!running) { resolveDone(); return; }
      const now = performance.now();
      for (const m of stars) {
        if (m.userData.got) continue;
        m.rotation.y += 0.15; m.rotation.x += 0.1;
        if (m.position.y > 0.6) {
          m.position.y = Math.max(0.6, m.position.y + m.userData.vy * 0.06);
          if (m.position.y <= 0.6) m.userData.landed = now;
        } else if (m.userData.landed && now - m.userData.landed > (p.human ? 2500 : 700)) {
          collect(m);
        }
      }
    }, 60);

    await done;
    clearInterval(fall);
    tappables = tappables.filter(t => !stars.includes(t));
    S.cheer();
    await U.tween(400, t => { if (running) arch.scale.setScalar(Math.max(0.01, 1 - t)); });
    scene.remove(arch);
  }

  async function eventMusic(p) {
    showBanner('🎵 おんがくタイム！', 1800);
    S.say('みんなで ダンス！');
    spectators.cheerAll(elapsed, 2.6);
    fx.notes(p.car.position);
    for (let i = 0; i < 6; i++) {
      S.note(i);
      bounce(p.car, 0.3);
      await U.wait(280);
      if (!running) return;
    }
    addStars(p, 1);
    S.star(0);
  }

  async function eventBanana(p, depth) {
    showBanner('🍌 つるりん！', 1600);
    S.say('つるりん！');
    await U.wait(350);
    if (!running) return;
    await slideBack(p, 2);
    if (!running) return;
    await U.wait(250);
    /* すべった さきの マスも たのしい（1かいだけ） */
    if (depth < 1) await runTileEvent(p, depth + 1);
  }

  async function eventRocket(p, depth) {
    showBanner('🚀 ロケットで ビューン！', 1600);
    S.say('ロケットだ！');
    await U.wait(400);
    if (!running) return;
    await rocketJump(p, 3);
    if (!running) return;
    if (p.tileIndex === world.TILE_COUNT - 1) return;
    await U.wait(250);
    if (depth < 1) await runTileEvent(p, depth + 1);
  }

  async function runTileEvent(p, depth) {
    const tile = world.tiles[p.tileIndex];
    switch (tile.type) {
      case T.STAR: await eventStar(p); break;
      case T.PRESENT: await eventPresent(p); break;
      case T.CAKE: await eventCake(p); break;
      case T.RAINBOW: await eventRainbow(p); break;
      case T.MUSIC: await eventMusic(p); break;
      case T.BANANA: await eventBanana(p, depth); break;
      case T.ROCKET: await eventRocket(p, depth); break;
      default: break;
    }
  }

  /* ---------------- ゴール ---------------- */

  async function goalCelebration(p) {
    p.finished = true;
    p.rank = players.filter(x => x.finished).length;

    camMode = 'goal';
    goalOrbitT = Math.atan2(camPos.z - world.castle.position.z, camPos.x - world.castle.position.x);
    S.bgmStop();
    S.fanfare();
    S.say('ゴール！ おめでとう！');
    showBanner('🏆 ゴール！ おめでとう！');
    spectators.cheerAll(elapsed, 6);
    U.vibrate([80, 60, 80]);

    /* はなび ドンドン */
    const c = world.castle.position;
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        if (!running) return;
        fx.firework(new THREE.Vector3(
          c.x + U.rand(-9, 9), U.rand(8, 14), c.z + U.rand(-7, 7)));
        S.goalBoom();
      }, 350 + i * 550);
    }
    fx.confetti(p.car.position, 60, 7);

    /* くるまが くるくる よろこぶ */
    const rot0 = p.car.rotation.y;
    await U.tween(1800, t => {
      if (!running) return;
      p.car.rotation.y = rot0 + t * Math.PI * 6;
      p.car.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 1.2;
    });
    if (running) p.car.position.y = 0;
    await U.wait(2600);
  }

  /* ---------------- ターン ---------------- */

  async function turnLoop(opts) {
    await U.wait(600);
    if (!running) return;
    S.say('じんせいランドへ ようこそ！');
    showBanner('🎡 じんせいランドへ ようこそ！', 2000);
    await U.wait(2100);

    while (running) {
      const p = players[turnIdx];
      if (p.finished) { turnIdx = (turnIdx + 1) % players.length; continue; }

      camMode = 'follow';
      setTurnBadge(turnIdx);
      if (players.length > 1) {
        showBanner(`${p.emoji} ${p.label || p.name}の ばん！`, 1700);
        S.say(`${p.label || p.name}の ばん`);
        await U.wait(900);
        if (!running) return;
      }

      /* ルーレット */
      let n;
      if (p.human) {
        showRoulette(true, true);
        n = await roulette.waitForSpin();
      } else {
        showRoulette(true, false);
        await U.wait(1000);
        if (!running) return;
        n = await roulette.autoSpin();
      }
      if (!running) return;
      showRoulette(false, false);
      showBanner(`${n} が でたよ！`, 1500);
      S.say(`${n}！`);
      await U.wait(750);
      if (!running) return;

      /* すすむ */
      await moveSteps(p, n);
      if (!running) return;

      /* ゴール？ */
      if (p.tileIndex >= world.TILE_COUNT - 1) {
        await goalCelebration(p);
        if (!running) return;
        break;
      }

      /* マスイベント */
      await runTileEvent(p, 0);
      if (!running) return;

      if (p.tileIndex >= world.TILE_COUNT - 1) {
        await goalCelebration(p);
        if (!running) return;
        break;
      }

      await U.wait(350);
      turnIdx = (turnIdx + 1) % players.length;
    }

    if (running && onFinish) onFinish(players.slice());
  }

  return {
    start(opts, finishCb) { onFinish = finishCb; init(opts); },
    stop,
    isRunning: () => running,
    /* かいはつよう：みんなを ゴールちかくへ ワープ */
    debugSkip(n) {
      if (!running) return;
      for (const p of players) {
        p.tileIndex = U.clamp(n == null ? world.TILE_COUNT - 3 : n, 0, world.TILE_COUNT - 2);
        const off = offsetOnTile(players.indexOf(p), players.length);
        const tp = world.tiles[p.tileIndex].pos;
        p.car.position.set(tp.x + off.x, 0, tp.z + off.z);
        faceAlongPath(p.car, tileU(p.tileIndex));
      }
    },
  };
})();
