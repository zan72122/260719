/* ゲームほんたい：ターンせいぎょ・イベント・カメラ */
const Game = (() => {

  let renderer, scene, camera, world, fx, spectators, roulette;
  let players = [], turnIdx = 0;
  let running = false;
  let rafId = 0;
  let elapsed = 0;
  let camTarget = new THREE.Vector3();
  let camPos = new THREE.Vector3();
  let camMode = 'follow';         /* follow | goal | spot | coaster */
  let goalOrbitT = 0;
  let camSpot = new THREE.Vector3();
  let mouseCount = 0;             /* どろぼうねずみは 1ゲーム 2かいまで */
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
      Chars.applyCostume(car, 0, null);   /* みんな あかちゃんから スタート */
      scene.add(car);
      return {
        ...Chars.CHARS[p.kind], kind: p.kind, human: p.human,
        label: p.label, car, tileIndex: 0, stars: 0, finished: false, rank: 0,
        stage: 0, job: null, houseTier: 0,
      };
    });
    turnIdx = 0;
    camMode = 'follow';
    goalOrbitT = 0;
    mouseCount = 0;

    buildBadges();

    /* ルーレット（キャンバスは 1こなので インスタンスも 1こだけ） */
    const rcv = document.getElementById('roulette');
    if (!Game._roulette) Game._roulette = Roulette.create(rcv);
    roulette = Game._roulette;
    roulette.setMode('normal');
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
      world.update(elapsed, dt, camera.position);
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
    if (roulette) roulette.setMode('normal');
    const shopEl = document.getElementById('shop');
    if (shopEl) shopEl.classList.add('hidden');
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

  function showRoulette(show, withHint, hintText) {
    rouletteWrap.classList.toggle('off', !show);
    hintEl.style.visibility = withHint ? 'visible' : 'hidden';
    hintEl.textContent = hintText || 'タッチで まわしてね！';
  }

  /* カメラを いっしゅんで めあての ばしょへ（テレポートよう） */
  function snapCam() {
    const p = players[turnIdx] ? players[turnIdx].car.position : new THREE.Vector3();
    camTarget.set(p.x, p.y + 1, p.z);
    camPos.copy(p).add(camOffset());
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
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
    } else if (camMode === 'spot') {
      const want = camSpot.clone().add(new THREE.Vector3(7, 9, 11));
      camPos.lerp(want, k);
      camTarget.lerp(camSpot.clone().add(new THREE.Vector3(0, 2, 0)), k);
    } else if (camMode === 'coaster') {
      const car = players[turnIdx].car;
      const f = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
      const kk = Math.min(1, k * 2.2);
      camPos.lerp(car.position.clone().addScaledVector(f, -7.5).add(new THREE.Vector3(0, 3.6, 0)), kk);
      camTarget.lerp(car.position.clone().addScaledVector(f, 4), kk);
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

  /* きめられた ばしょへ ぴょん（どうくつ など みちいがい） */
  async function hopPos(p, target, hopN) {
    const from = p.car.position.clone();
    p.car.userData.moving = true;
    S.hop(hopN || 0);
    const rotY = Math.atan2(target.x - from.x, target.z - from.z);
    p.car.rotation.y = rotY;
    await U.tween(430, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      p.car.position.set(
        U.lerp(from.x, target.x, e),
        U.lerp(from.y, target.y, e) + Math.sin(t * Math.PI) * 1.5,
        U.lerp(from.z, target.z, e)
      );
    });
    if (!running) return;
    p.car.position.copy(target);
    p.car.userData.moving = false;
    S.land();
  }

  /* ゾーンを こえたら せいちょう！ */
  async function maybeGrow(p) {
    const st = world.zoneOf(p.tileIndex);
    if (st <= p.stage || !running) return;
    p.stage = st;
    const texts = ['', '🎒 こどもに なった！', '👔 おとなに なった！', '👴 おじいちゃんに なった！'];
    const says = ['', 'こどもに なった！', 'おとなに なった！', 'おじいちゃんに なった！'];
    S.levelup();
    U.vibrate(50);
    showBanner(texts[st], 2100);
    S.say(says[st]);
    fx.burst(p.car.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd43b, 18, 1.2);
    fx.confetti(p.car.position, 18, 3);
    Chars.applyCostume(p.car, st, p.job);
    const base = p.car.userData.head.scale.x;
    await U.tween(550, t => {
      if (!running) return;
      p.car.userData.head.scale.setScalar(base * (1 + Math.sin(t * Math.PI) * 0.55));
    });
    if (!running) return;
    p.car.userData.head.scale.setScalar(base);
    await U.wait(800);
  }

  async function moveSteps(p, steps) {
    for (let s = 0; s < steps; s++) {
      const next = p.tileIndex + 1;
      if (next >= world.TILE_COUNT) break;
      await hopTo(p, p.tileIndex, next, s);
      if (!running) return;
      p.tileIndex = next;
      if (next === world.TILE_COUNT - 1) return;  /* ゴール！ */
      await maybeGrow(p);
      if (!running) return;
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
    p.stars = Math.max(0, p.stars + n);
    updateBadge(players.indexOf(p));
    const label = (n >= 0 ? '+' : '') + n;
    const color = n >= 0 ? '#f5a623' : '#748ffc';
    fx.floatText(label, (pos || p.car.position).clone().add(new THREE.Vector3(0, 3.2, 0)), color, 2.8);
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

  /* ---------------- 🐭 どろぼうねずみ（ほしマスで まれに） ---------------- */

  async function maybeMouse(p, force) {
    if (!running) return;
    if (!force && (mouseCount >= 2 || p.stars < 4 || Math.random() > 0.25)) return;
    mouseCount++;

    const mouse = Chars.makeMouse();
    const u = tileU(p.tileIndex);
    const tan = world.curve.getTangentAt(u);
    const side = tan.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const start = p.car.position.clone().addScaledVector(side, 6);
    mouse.position.copy(start).setY(0);
    scene.add(mouse);

    showBanner('🐭 どろぼうねずみ！', 1800);
    S.squeak();
    S.say('あっ！どろぼうねずみ！');

    /* くるまに かけよる */
    const carPos = p.car.position.clone();
    await U.tween(750, t => {
      if (!running) return;
      mouse.position.lerpVectors(start, carPos.clone().addScaledVector(side, 1.2), U.easeInOut(t));
      mouse.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.4;
      mouse.lookAt(carPos.x, 0, carPos.z);
    });
    if (!running) { scene.remove(mouse); return; }

    /* ほしを 2こ うばう！ */
    mouse.userData.sack.visible = true;
    addStars(p, -2);
    S.squeak();
    U.vibrate(30);

    /* にげる！タッチで つかまえられる */
    let tripped = false;
    mouse.userData.tapTarget = true;
    mouse.userData.onTap = () => { tripped = true; };
    tappables.push(mouse);

    const escTarget = world.curve
      .getPointAt(U.clamp(tileU(Math.min(p.tileIndex + 3, world.TILE_COUNT - 1)), 0, 1))
      .clone().addScaledVector(side, 2.5);
    const escStart = mouse.position.clone();
    const t0 = performance.now();
    const DUR = 3200;
    while (!tripped && running) {
      const f = (performance.now() - t0) / DUR;
      if (f >= 1) { tripped = true; break; }
      mouse.position.lerpVectors(escStart, escTarget, f);
      mouse.position.y = Math.abs(Math.sin(f * 26)) * 0.5;
      mouse.lookAt(escTarget.x, 0, escTarget.z);
      await U.wait(16);
    }
    tappables = tappables.filter(t => t !== mouse);
    if (!running) { scene.remove(mouse); return; }

    /* すってんころりん！ほしが こぼれて ふえて もどる */
    S.slip();
    await U.tween(650, t => {
      if (!running) return;
      mouse.rotation.z = t * Math.PI * 2;
      mouse.position.y = Math.abs(Math.sin(t * Math.PI)) * 1.2;
    });
    if (!running) { scene.remove(mouse); return; }
    mouse.rotation.z = 0;
    mouse.userData.sack.visible = false;
    fx.burst(mouse.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd43b, 14, 1.1);
    S.star(0); S.star(1);
    addStars(p, 3, mouse.position);
    showBanner('ころんだ！ ほしが ふえて もどってきた！', 2000);
    S.say('ころんだ！ほしが もどってきた！');

    /* ぺこりと あやまって にげる */
    await U.tween(500, t => { if (running) mouse.rotation.x = Math.sin(t * Math.PI) * 0.7; });
    await U.tween(700, t => {
      if (!running) return;
      mouse.position.addScaledVector(side, 0.14);
      mouse.position.y = Math.abs(Math.sin(t * 20)) * 0.3;
      mouse.scale.setScalar(Math.max(0.01, 1 - t));
    });
    scene.remove(mouse);
  }

  /* ---------------- 🛒 おみせ ---------------- */

  const SHOP_CATALOGS = {
    3: [
      { item: 'ice',   name: 'アイス',       emoji: '🍦', price: 1 },
      { item: 'teddy', name: 'ぬいぐるみ',   emoji: '🧸', price: 2 },
      { item: 'ball',  name: 'ボール',       emoji: '⚽', price: 2 },
    ],
    26: [
      { item: 'house',    name: 'おうち',         emoji: '🏠', price: 4 },
      { item: 'heli',     name: 'ヘリコプター',   emoji: '🚁', price: 5 },
      { item: 'elephant', name: 'ぞうさん',       emoji: '🐘', price: 6 },
    ],
    42: [
      { item: 'mansion', name: 'ごうてい',       emoji: '🏰', price: 8 },
      { item: 'heli',    name: 'ヘリコプター',   emoji: '🚁', price: 5 },
      { item: 'teddy',   name: 'ぬいぐるみ',     emoji: '🧸', price: 2 },
    ],
  };

  function shopItemsFor(p) {
    const cat = SHOP_CATALOGS[p.tileIndex] || SHOP_CATALOGS[3];
    return cat.filter(it => {
      if (it.item === 'house' && p.houseTier >= 1) return false;
      if (it.item === 'mansion' && p.houseTier >= 2) return false;
      return true;
    });
  }

  async function heliRide(p) {
    /* ヘリコプターで 4マス ひとっとび */
    showBanner('🚁 ヘリで ビューン！', 1800);
    S.say('ヘリコプター しゅっぱつ！');
    const heli = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0x4dabf7 }));
    body.scale.set(1.25, 0.85, 1);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.8 }));
    glass.position.set(0, 0.15, 0.6);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.6, 8),
      new THREE.MeshLambertMaterial({ color: 0x4dabf7 }));
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.2, -1.5);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.26),
      new THREE.MeshLambertMaterial({ color: 0x555555 }));
    rotor.position.y = 1.0;
    heli.add(body, glass, tail, rotor);
    heli.userData.rotor = rotor;
    scene.add(heli);

    const target = Math.min(world.TILE_COUNT - 1, p.tileIndex + 4);
    const off = offsetOnTile(players.indexOf(p), players.length);
    const u0 = tileU(p.tileIndex), u1 = tileU(target);
    heli.position.copy(p.car.position).add(new THREE.Vector3(0, 14, 0));
    S.rocket();

    /* おりてくる → つりさげて とぶ → おろす */
    await U.tween(800, t => {
      if (!running) return;
      heli.userData.rotor.rotation.y += 0.9;
      heli.position.y = U.lerp(14, 4.4, U.easeOut(t));
    });
    if (!running) { scene.remove(heli); return; }
    await U.tween(2100, t => {
      if (!running) return;
      heli.userData.rotor.rotation.y += 0.9;
      const e = U.easeInOut(t);
      const pt = world.curve.getPointAt(U.lerp(u0, u1, e));
      const fly = Math.sin(t * Math.PI) * 3.4;
      heli.position.set(pt.x + off.x, 4.4 + fly, pt.z + off.z);
      p.car.position.set(pt.x + off.x, 1.6 + fly, pt.z + off.z);
      const tn = world.curve.getTangentAt(U.lerp(u0, u1, e));
      p.car.rotation.y = Math.atan2(tn.x, tn.z);
      heli.rotation.y = p.car.rotation.y;
    });
    if (!running) { scene.remove(heli); return; }
    p.car.position.y = 0;
    p.tileIndex = target;
    faceAlongPath(p.car, tileU(target));
    S.land();
    fx.sparkle(p.car.position.clone().add(new THREE.Vector3(0, 1, 0)));
    /* ヘリは とんでいく */
    await U.tween(900, t => {
      if (!running) return;
      heli.userData.rotor.rotation.y += 0.9;
      heli.position.y = 4.4 + t * 16;
      heli.position.x += 0.12;
    });
    scene.remove(heli);
  }

  async function eventShop(p, depth) {
    showBanner('🛒 おみせに とうちゃく！', 1800);
    S.kaching();
    S.say('おかいものタイム！');
    await U.wait(600);
    if (!running) return;

    const items = shopItemsFor(p);
    const shopEl = document.getElementById('shop');
    const itemsEl = document.getElementById('shopItems');
    const leaveBtn = document.getElementById('shopLeave');
    const starsEl = document.getElementById('shopStars');
    itemsEl.innerHTML = '';
    starsEl.textContent = '⭐ × ' + p.stars;

    let resolveChoice;
    const chosen = new Promise(r => { resolveChoice = r; });

    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'shopItem';
      const ok = p.stars >= it.price;
      b.disabled = !ok;
      b.innerHTML = `<span class="siEmoji">${it.emoji}</span>` +
        `<span class="siName">${it.name}</span>` +
        `<span class="siPrice">⭐${it.price}</span>`;
      b.addEventListener('click', () => { S.pop(); resolveChoice(it); });
      itemsEl.appendChild(b);
    });
    const onLeave = () => { S.pop(); resolveChoice(null); };
    leaveBtn.addEventListener('click', onLeave);

    shopEl.classList.remove('hidden');

    const affordable = items.filter(it => p.stars >= it.price);
    let result;
    if (!p.human) {
      /* CPUは ちょっと なやんでから いちばん たかいものを かう */
      await U.wait(1500);
      result = affordable.length ? affordable[affordable.length - 1] : null;
    } else if (!affordable.length) {
      /* かえるものが ない → てんいんさんの おまけ */
      await U.wait(2400);
      result = 'omake';
    } else {
      /* こどもが まよっても いいように ながめの タイムアウト */
      const timeout = U.wait(25000).then(() => null);
      result = await Promise.race([chosen, timeout]);
    }
    leaveBtn.removeEventListener('click', onLeave);
    shopEl.classList.add('hidden');
    if (!running) return;

    if (result === 'omake') {
      showBanner('てんいんさんの おまけ！ +1⭐', 2000);
      S.say('おまけ もらっちゃった！');
      S.star(0);
      addStars(p, 1);
      await U.wait(900);
      return;
    }
    if (!result) {
      showBanner('また きてね！', 1400);
      await U.wait(700);
      return;
    }

    /* おかいもの！ */
    addStars(p, -result.price);
    S.kaching();
    U.vibrate(30);

    if (result.item === 'house' || result.item === 'mansion') {
      const tier = result.item === 'house' ? 1 : 2;
      p.houseTier = tier;
      const h = world.addHouse(players.indexOf(p), tier, p.car.userData ? Chars.CHARS[p.kind].car : 0xff6b6b);
      h.scale.setScalar(0.01);
      showBanner(tier === 1 ? '🏠 ゴールよこに おうちが たった！' : '🏰 ごうていが たった！', 2400);
      S.say(tier === 1 ? 'おうちを かった！' : 'ごうていを かった！すごーい！');
      /* カメラで おうちを みにいく */
      camSpot.copy(h.position);
      camMode = 'spot';
      await U.tween(700, t => { if (running) h.scale.setScalar(U.easeOutBack(t)); });
      fx.confetti(h.position, 30, 4);
      S.cheer();
      await U.wait(1800);
      camMode = 'follow';
      await U.wait(600);
    } else if (result.item === 'heli') {
      await U.wait(300);
      await heliRide(p);
      if (!running) return;
      await maybeGrow(p);
      if (!running) return;
      if (p.tileIndex < world.TILE_COUNT - 1 && depth < 1) await runTileEvent(p, depth + 1);
    } else {
      Chars.addCargo(p.car, result.item);
      showBanner(`${result.emoji} ${result.name}を かった！`, 1800);
      S.say(`${result.name}、かっちゃった！`);
      fx.sparkle(p.car.position.clone().add(new THREE.Vector3(0, 2, 0)));
      S.cheer();
      await U.wait(1000);
    }
  }

  /* ---------------- 💼 おしごと ---------------- */

  async function eventJob(p) {
    showBanner('💼 おしごと きめよう！', 1800);
    S.say('どんな おしごとに なるかな？');
    S.drum();

    /* おしごとカードが あたまのうえを ぐるぐる */
    const sprites = Chars.JOBS.map(j => {
      const tex = U.emojiTexture(j.emoji, 128, '#ffffff');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(2.1, 2.1, 1);
      scene.add(sp);
      return sp;
    });
    const chosen = U.randInt(0, Chars.JOBS.length - 1);
    const center = p.car.position.clone().add(new THREE.Vector3(0, 4.2, 0));
    const totalRot = Math.PI * 2 * 2.4 + (Math.PI * 2 / sprites.length) * chosen;

    await U.tween(2800, t => {
      if (!running) return;
      const rot = U.easeOut(t) * totalRot;
      sprites.forEach((sp, i) => {
        const a = rot + i / sprites.length * Math.PI * 2;
        sp.position.set(center.x + Math.cos(a) * 2.6, center.y + Math.sin(t * 6 + i) * 0.2, center.z + Math.sin(a) * 2.6);
      });
      if (Math.floor(t * 14) !== Math.floor((t - 0.02) * 14)) S.tick();
    });
    if (!running) { sprites.forEach(s => scene.remove(s)); return; }

    const job = Chars.JOBS[chosen];
    p.job = job.key;
    Chars.applyCostume(p.car, p.stage, p.job);
    S.levelup();
    U.vibrate(40);
    showBanner(`${job.emoji} きょうから ${job.name}！`, 2400);
    S.say(`きょうから ${job.name}！おきゅうりょうが もらえるよ！`);

    /* えらばれた カードだけ おおきく */
    await U.tween(900, t => {
      if (!running) return;
      sprites.forEach((sp, i) => {
        if (i === chosen) {
          sp.position.lerp(p.car.position.clone().add(new THREE.Vector3(0, 5.2, 0)), 0.1);
          sp.scale.setScalar(2.1 + U.easeOutBack(t) * 1.4);
        } else {
          sp.material.opacity = 1 - t;
        }
      });
    });
    fx.confetti(p.car.position, 20, 3);
    S.cheer();
    addStars(p, 1);
    await U.wait(900);
    sprites.forEach(s => { scene.remove(s); U.disposeSprite(s); });
  }

  /* ---------------- 💒 けっこん・🍼 あかちゃん ---------------- */

  async function eventWedding(p) {
    showBanner('💒 けっこんしき！', 2200);
    S.bells();
    S.say('けっこんしき！おめでとう！');

    const kinds = Object.keys(Chars.CHARS).filter(k => k !== p.kind);
    const kind = U.pick(kinds);
    const u = tileU(p.tileIndex);
    const tan = world.curve.getTangentAt(u);
    const side = tan.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();

    /* パートナーが はしってくる */
    const partner = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 12),
      new THREE.MeshLambertMaterial({ color: Chars.CHARS[kind].fur }));
    body.position.y = 0.7;
    partner.add(body);
    const head = Chars.animalHead(kind, 0.8);
    head.position.y = 1.55;
    partner.add(head);
    const veil = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 10, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    veil.position.y = 2.15;
    partner.add(veil);
    const start = p.car.position.clone().addScaledVector(side, 7);
    partner.position.copy(start).setY(0);
    partner.lookAt(p.car.position.x, 0, p.car.position.z);
    scene.add(partner);

    await U.tween(1100, t => {
      if (!running) return;
      partner.position.lerpVectors(start, p.car.position.clone().addScaledVector(side, 1.1), U.easeInOut(t));
      partner.position.y = Math.abs(Math.sin(t * Math.PI * 5)) * 0.5;
    });
    if (!running) { scene.remove(partner); return; }

    fx.emojiBurst(p.car.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '💗', 7, 1.6);
    fx.confetti(p.car.position, 30, 4);
    spectators.cheerAll(elapsed, 3.5);
    S.cheer();

    /* くるまに のりこむ */
    await U.tween(500, t => {
      if (!running) return;
      partner.position.y = Math.sin(t * Math.PI) * 1.6;
      partner.scale.setScalar(Math.max(0.01, 1 - t * 0.4));
    });
    scene.remove(partner);
    if (!running) return;
    Chars.addPassenger(p.car, kind, { bow: true });
    S.bells();
    addStars(p, 2);
    await U.wait(1100);
  }

  async function eventBaby(p) {
    showBanner('🍼 あかちゃんが やってきた！', 2200);
    S.say('あかちゃんが うまれたよ！');

    /* おおきな たまごが ぽとん → パカッ */
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0xfffde7 }));
    egg.scale.y = 1.2;
    const tile = world.tiles[p.tileIndex];
    egg.position.set(tile.pos.x, 6, tile.pos.z + 1.2);
    scene.add(egg);
    await U.tween(700, t => {
      if (!running) return;
      egg.position.y = U.lerp(6, 1.0, U.easeOut(t));
    });
    if (!running) { scene.remove(egg); return; }
    S.land();
    /* ぷるぷる */
    await U.tween(900, t => {
      if (!running) return;
      egg.rotation.z = Math.sin(t * Math.PI * 8) * 0.22;
    });
    if (!running) { scene.remove(egg); return; }
    S.pop();
    fx.burst(egg.position, 0xfff59d, 12, 0.8);
    await U.tween(300, t => { if (running) egg.scale.setScalar(Math.max(0.01, 1.0 - t)); });
    scene.remove(egg);
    if (!running) return;

    Chars.addPassenger(p.car, p.kind, { baby: true });
    S.baby();
    fx.emojiBurst(p.car.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '💛', 5, 1.4);
    addStars(p, 2);
    S.cheer();
    await U.wait(1200);
  }

  /* ---------------- ⛈ あめあめ マイナスルーレット ---------------- */

  async function eventThunder(p) {
    /* そらが くらくなる */
    const sky0 = scene.background.clone();
    const fog0 = scene.fog.color.clone();
    const skyDark = new THREE.Color(0x5c6b96), fogDark = new THREE.Color(0x6b7aa8);
    await U.tween(700, t => {
      if (!running) return;
      scene.background.copy(sky0).lerp(skyDark, t);
      scene.fog.color.copy(fog0).lerp(fogDark, t);
    });
    if (!running) return;

    /* くろい くも と かみなり */
    const cloud = new THREE.Group();
    const cm = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(U.rand(0.9, 1.5), 10, 8), cm);
      s.position.set(i * 1.2 - 1.8, U.rand(-0.2, 0.3), U.rand(-0.4, 0.4));
      s.scale.y = 0.6;
      cloud.add(s);
    }
    cloud.position.copy(p.car.position).add(new THREE.Vector3(0, 7, 0));
    scene.add(cloud);
    S.thunder();
    U.vibrate([60, 80, 60]);

    showBanner('⛈ あめあめ ルーレット！', 2200);
    S.say('たいへん！マイナスルーレットだ！');
    await U.wait(1200);
    if (!running) { scene.remove(cloud); return; }

    roulette.setMode('minus');
    let n;
    if (p.human) {
      showRoulette(true, true, 'ドキドキ…');
      n = await roulette.waitForSpin();
    } else {
      showRoulette(true, false);
      await U.wait(900);
      if (!running) { scene.remove(cloud); return; }
      n = await roulette.autoSpin();
    }
    showRoulette(false, false);
    roulette.setMode('normal');
    if (!running) { scene.remove(cloud); return; }

    showBanner(`−${n} ばっく〜！`, 1700);
    S.say(`マイナス ${n}！`);
    S.thunder();
    await U.wait(900);
    if (!running) { scene.remove(cloud); return; }

    /* ともだちが とめてくれる かも！ */
    const rescue = n >= 2 && Math.random() < 0.45;
    if (rescue) {
      await slideBack(p, Math.floor(n / 2));
      if (!running) { scene.remove(cloud); return; }
      /* ともだち とうじょう */
      const kinds = Object.keys(Chars.CHARS).filter(k => k !== p.kind);
      const kind = U.pick(kinds);
      const friend = new THREE.Group();
      const fb = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 12),
        new THREE.MeshLambertMaterial({ color: Chars.CHARS[kind].fur }));
      fb.position.y = 0.7;
      friend.add(fb);
      const fh = Chars.animalHead(kind, 0.8);
      fh.position.y = 1.55;
      friend.add(fh);
      const u2 = tileU(p.tileIndex);
      const side2 = world.curve.getTangentAt(u2).cross(new THREE.Vector3(0, 1, 0)).normalize();
      const fs = p.car.position.clone().addScaledVector(side2, 6);
      friend.position.copy(fs).setY(0);
      scene.add(friend);
      await U.tween(700, t => {
        if (!running) return;
        friend.position.lerpVectors(fs, p.car.position.clone().addScaledVector(side2, 1.5), U.easeOut(t));
        friend.position.y = Math.abs(Math.sin(t * Math.PI * 3)) * 0.5;
        friend.lookAt(p.car.position.x, 0, p.car.position.z);
      });
      if (!running) { scene.remove(cloud); scene.remove(friend); return; }
      showBanner(`${Chars.CHARS[kind].emoji} とめてくれた！ ありがとう！`, 2200);
      S.say('ともだちが たすけてくれた！');
      S.cheer();
      fx.emojiBurst(p.car.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '💗', 5, 1.4);
      bounce(p.car, 0.4);
      addStars(p, 1);
      await U.wait(1400);
      await U.tween(600, t => {
        if (!running) return;
        friend.position.addScaledVector(side2, 0.12);
        friend.position.y = Math.abs(Math.sin(t * 16)) * 0.4;
        friend.scale.setScalar(Math.max(0.01, 1 - t));
      });
      scene.remove(friend);
    } else {
      await slideBack(p, n);
    }
    if (!running) { scene.remove(cloud); return; }

    /* はれた！ミニにじ と なぐさめの ほし */
    scene.remove(cloud);
    await U.tween(800, t => {
      if (!running) return;
      scene.background.copy(skyDark).lerp(sky0, t);
      scene.fog.color.copy(fogDark).lerp(fog0, t);
    });
    if (!running) return;
    const mini = new THREE.Group();
    [0xff5d5d, 0xffe066, 0x74c0fc].forEach((c, i) => {
      const tor = new THREE.Mesh(new THREE.TorusGeometry(2.6 - i * 0.35, 0.14, 8, 24, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      mini.add(tor);
    });
    mini.position.copy(p.car.position).add(new THREE.Vector3(0, 0.5, 0));
    mini.rotation.y = p.car.rotation.y + Math.PI / 2;
    mini.scale.setScalar(0.01);
    scene.add(mini);
    await U.tween(500, t => { if (running) mini.scale.setScalar(U.easeOutBack(t)); });
    showBanner('☀ はれた！ えらかったね +1⭐', 2000);
    S.say('はれた！がんばったね！');
    S.star(0);
    addStars(p, 1);
    await U.wait(1300);
    await U.tween(400, t => { if (running) mini.scale.setScalar(Math.max(0.01, 1 - t)); });
    scene.remove(mini);
  }

  /* ---------------- 🕳 おおあな → ひみつのどうくつ ---------------- */

  async function eventHole(p, depth) {
    const cave = world.cave;
    showBanner('🕳 わっ！ おおあな！', 1800);
    S.say('わーっ！おっこちるー！');
    await U.wait(700);
    if (!running) return;

    /* ストン！と おちる */
    S.fallDown();
    U.vibrate(50);
    await U.tween(900, t => {
      if (!running) return;
      p.car.position.y = -U.easeOut(t) * 7;
      p.car.rotation.x = t * 0.8;
      p.car.scale.setScalar(Math.max(0.3, 1 - t * 0.5));
    });
    if (!running) return;

    /* どうくつへ テレポート */
    p.car.rotation.x = 0;
    p.car.scale.setScalar(1);
    p.car.position.copy(cave.entry);
    p.car.lookAt(cave.chestPos.x, cave.entry.y, cave.chestPos.z);
    snapCam();
    fx.sparkle(p.car.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
    showBanner('✨ ひみつの どうくつ！', 2200);
    S.say('ひみつの どうくつに ついた！');
    await U.wait(1400);
    if (!running) return;

    /* とびいしを ぴょんぴょん */
    for (let i = 0; i < cave.stones.length; i++) {
      await hopPos(p, cave.stones[i], i);
      if (!running) return;
      await U.wait(120);
    }

    /* たからばこ オープン！ */
    await hopPos(p, new THREE.Vector3(cave.chestPos.x - 2.2, cave.entry.y, cave.chestPos.z), 3);
    if (!running) return;
    S.present();
    await U.tween(700, t => {
      if (!running) return;
      cave.chestLid.position.y = 0.9 + U.easeOut(t) * 0.8;
      cave.chestLid.rotation.x = -U.easeOut(t) * 1.1;
    });
    if (!running) return;
    cave.chestGold.visible = true;
    fx.burst(cave.chest.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffd43b, 20, 1.2);
    S.cheer();
    showBanner('💎 たからばこ！ +3⭐', 2200);
    S.say('たからばこ みーっけ！');
    addStars(p, 3, cave.chest.position);
    await U.wait(1600);
    if (!running) return;

    /* かんけつせんで ちじょうへ！ */
    showBanner('🌊 ぴゅーん！', 1600);
    S.geyser();
    U.vibrate(40);
    const geyser = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.5, 1, 12, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xb3e5fc, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    const gBase = p.car.position.clone();
    geyser.position.copy(gBase);
    scene.add(geyser);

    const exitTile = world.tiles[cave.exitIndex];
    const off = offsetOnTile(players.indexOf(p), players.length);
    const exitPos = new THREE.Vector3(exitTile.pos.x + off.x, 0, exitTile.pos.z + off.z);

    /* すいちゅうを のぼる */
    await U.tween(1000, t => {
      if (!running) return;
      const h = U.easeOut(t) * 36;
      geyser.scale.y = Math.max(0.01, h);
      geyser.position.y = gBase.y + h / 2;
      p.car.position.y = gBase.y + h;
      p.car.rotation.y += 0.12;
    });
    if (!running) { scene.remove(geyser); return; }
    snapCam();
    fx.burst(p.car.position, 0x81d4fa, 16, 1.4);

    /* そのまま マスへ ふわり */
    const apex = p.car.position.clone();
    await U.tween(900, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      p.car.position.set(
        U.lerp(apex.x, exitPos.x, e),
        U.lerp(apex.y, 0, e) + Math.sin(t * Math.PI) * 2,
        U.lerp(apex.z, exitPos.z, e)
      );
      geyser.scale.y = Math.max(0.01, 36 * (1 - t));
      geyser.position.y = gBase.y + geyser.scale.y / 2;
    });
    scene.remove(geyser);
    if (!running) return;
    p.car.position.copy(exitPos);
    p.tileIndex = cave.exitIndex;
    faceAlongPath(p.car, tileU(p.tileIndex));
    S.land();
    snapCam();
    fx.confetti(p.car.position, 20, 3);

    /* たからばこを もとに もどす */
    cave.chestLid.position.y = 0.9;
    cave.chestLid.rotation.x = 0;
    cave.chestGold.visible = false;

    await maybeGrow(p);
    if (!running) return;
    if (depth < 1) await runTileEvent(p, depth + 1);
  }

  /* ---------------- 🎢 ジェットコースター ---------------- */

  async function eventCoaster(p, depth) {
    showBanner('🎢 ジェットコースター！', 2000);
    S.say('ジェットコースター、しゅっぱつ しんこう！');
    await U.wait(1100);
    if (!running) return;

    const curve = world.coaster.curve;
    const off = offsetOnTile(players.indexOf(p), players.length);
    camMode = 'coaster';
    p.car.userData.moving = true;
    S.wind();
    let screamed1 = false, screamed2 = false;

    await U.tween(5200, t => {
      if (!running) return;
      const u = U.easeInOut(t);
      const pt = curve.getPointAt(u);
      const tn = curve.getTangentAt(u);
      p.car.position.set(pt.x, pt.y, pt.z);
      p.car.rotation.y = Math.atan2(tn.x, tn.z);
      p.car.rotation.x = -Math.asin(U.clamp(tn.y, -1, 1)) * 0.8;
      if (t > 0.3 && !screamed1) { screamed1 = true; S.scream(); }
      if (t > 0.66 && !screamed2) { screamed2 = true; S.scream(); }
      if (Math.floor(t * 24) % 5 === 0 && Math.random() < 0.2) {
        fx.sparkle(p.car.position.clone().add(new THREE.Vector3(0, -0.4, 0)));
      }
    });
    p.car.userData.moving = false;
    p.car.rotation.x = 0;
    camMode = 'follow';
    if (!running) return;

    p.tileIndex = world.coaster.to;
    const exit = world.tiles[p.tileIndex];
    p.car.position.set(exit.pos.x + off.x, 0, exit.pos.z + off.z);
    faceAlongPath(p.car, tileU(p.tileIndex));
    S.land();
    fx.confetti(p.car.position, 26, 3);
    S.cheer();
    showBanner('たのしかったー！ +2⭐', 2000);
    S.say('たのしかったね！');
    addStars(p, 2);
    await U.wait(1200);
    if (!running) return;

    await maybeGrow(p);
    if (!running) return;
    if (depth < 1) await runTileEvent(p, depth + 1);
  }

  /* ---------------- 🌪 たつまき ひっこし ---------------- */

  function makeTornado() {
    const g = new THREE.Group();
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.7 + i * 0.65;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.32 + i * 0.06, 8, 18),
        new THREE.MeshLambertMaterial({ color: 0xb0bec5, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 + i * 1.35;
      g.add(ring);
      rings.push(ring);
    }
    g.userData.rings = rings;
    return g;
  }

  async function eventTornado(p, depth) {
    showBanner('🌪 たつまきだ〜！', 1900);
    S.say('たつまきに まきこまれたー！');
    S.wind();
    U.vibrate([50, 60, 50]);

    const tor = makeTornado();
    tor.position.copy(p.car.position).setY(14);
    scene.add(tor);
    const spinT = { v: 0 };
    const spinRings = t => {
      tor.userData.rings.forEach((r, i) => { r.rotation.z = t * (4 + i); });
    };

    /* おりてきて くるまを もちあげる */
    await U.tween(1100, t => {
      if (!running) return;
      tor.position.y = U.lerp(14, 0, U.easeOut(t));
      spinRings(spinT.v += 0.08);
    });
    if (!running) { scene.remove(tor); return; }
    await U.tween(900, t => {
      if (!running) return;
      p.car.position.y = U.easeInOut(t) * 7;
      p.car.rotation.y += 0.25;
      spinRings(spinT.v += 0.09);
    });
    if (!running) { scene.remove(tor); return; }

    /* ルーレットで とばされる さきが きまる！ */
    roulette.setMode('wind');
    let n;
    if (p.human) {
      showRoulette(true, true, 'どこに とぶ！？');
      n = await roulette.waitForSpin();
    } else {
      showRoulette(true, false);
      await U.wait(800);
      if (!running) { scene.remove(tor); return; }
      n = await roulette.autoSpin();
    }
    showRoulette(false, false);
    roulette.setMode('normal');
    if (!running) { scene.remove(tor); return; }

    /* かならず たのしいマスに ちゃくち */
    let target = Math.min(world.TILE_COUNT - 2, p.tileIndex + n);
    const bad = [T.BANANA, T.THUNDER, T.HOLE, T.TORNADO];
    while (target < world.TILE_COUNT - 2 && bad.includes(world.tiles[target].type)) target++;

    showBanner(`${n} マスさき まで ビューン！`, 1600);
    S.say(`${n}マス とんでいくよー！`);
    S.wind();

    const start = p.car.position.clone();
    const off = offsetOnTile(players.indexOf(p), players.length);
    const endTile = world.tiles[target];
    const end = new THREE.Vector3(endTile.pos.x + off.x, 0, endTile.pos.z + off.z);

    await U.tween(2300, t => {
      if (!running) return;
      const e = U.easeInOut(t);
      const swirlR = 2.2 * (1 - t);
      p.car.position.set(
        U.lerp(start.x, end.x, e) + Math.cos(t * 12) * swirlR,
        U.lerp(7, 0, e * e) + Math.sin(t * Math.PI) * 3,
        U.lerp(start.z, end.z, e) + Math.sin(t * 12) * swirlR
      );
      p.car.rotation.y += 0.3 * (1 - t) + 0.02;
      tor.position.set(p.car.position.x, Math.max(0, p.car.position.y - 1), p.car.position.z);
      spinRings(spinT.v += 0.09);
    });
    if (!running) { scene.remove(tor); return; }

    p.car.position.copy(end);
    p.tileIndex = target;
    faceAlongPath(p.car, tileU(target));
    S.land();
    U.vibrate(40);
    fx.burst(p.car.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x96e6d8, 14, 1.1);
    spectators.cheerNear(p.car.position, elapsed);

    /* たつまきは かえっていく */
    U.tween(1000, t => {
      if (!running) return;
      tor.position.y += 0.4;
      tor.scale.setScalar(Math.max(0.01, 1 - t));
      spinRings(spinT.v += 0.09);
    }).then(() => scene.remove(tor));

    showBanner('ぶじ とうちゃく！ ようこそ〜！', 2000);
    S.say('ようこそ！ぶじで よかった！');
    S.cheer();
    addStars(p, 1);
    await U.wait(1300);
    if (!running) return;

    await maybeGrow(p);
    if (!running) return;
    if (depth < 1) await runTileEvent(p, depth + 1);
  }

  async function runTileEvent(p, depth) {
    const tile = world.tiles[p.tileIndex];
    switch (tile.type) {
      case T.STAR:
        await eventStar(p);
        if (running && depth === 0) await maybeMouse(p);
        break;
      case T.PRESENT: await eventPresent(p); break;
      case T.CAKE: await eventCake(p); break;
      case T.RAINBOW: await eventRainbow(p); break;
      case T.MUSIC: await eventMusic(p); break;
      case T.BANANA: await eventBanana(p, depth); break;
      case T.ROCKET: await eventRocket(p, depth); break;
      case T.SHOP: await eventShop(p, depth); break;
      case T.JOB: await eventJob(p); break;
      case T.WEDDING: await eventWedding(p); break;
      case T.BABY: await eventBaby(p); break;
      case T.THUNDER: await eventThunder(p); break;
      case T.HOLE: await eventHole(p, depth); break;
      case T.COASTER: await eventCoaster(p, depth); break;
      case T.TORNADO: await eventTornado(p, depth); break;
      default: break;
    }
  }

  /* ---------------- ゴール ---------------- */

  async function goalCelebration(p) {
    p.finished = true;
    p.rank = players.filter(x => x.finished).length;

    /* かぞくボーナス と おうちボーナス */
    const fam = (p.car.userData.passengers || []).length;
    if (fam > 0) {
      showBanner(`👨‍👩‍👧 かぞくボーナス +${fam * 2}⭐`, 2000);
      S.say('かぞくボーナス！');
      for (let i = 0; i < fam; i++) {
        addStars(p, 2);
        S.star(i);
        fx.emojiBurst(p.car.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '💗', 2, 1.2);
        await U.wait(450);
        if (!running) return;
      }
      await U.wait(700);
      if (!running) return;
    }
    if (p.houseTier > 0) {
      const bonus = p.houseTier * 2;
      showBanner(`${p.houseTier === 1 ? '🏠' : '🏰'} おうちボーナス +${bonus}⭐`, 2000);
      S.say('おうちに おかえりなさい！');
      addStars(p, bonus);
      S.kaching();
      await U.wait(1200);
      if (!running) return;
    }

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

      /* おしごとが あると おきゅうりょう！ */
      if (p.job) {
        const job = Chars.JOBS.find(j => j.key === p.job);
        addStars(p, 1);
        fx.floatText(job ? job.emoji : '💼', p.car.position.clone().add(new THREE.Vector3(0, 4.6, 0)), '#748ffc', 2.0);
        S.star(1);
        await U.wait(500);
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
    /* かいはつよう：いまの プレイヤーを しててい タイプの マスへ おいて イベントを ながす */
    async debugEvent(type, nth) {
      if (!running) return 'not-running';
      const p = players[turnIdx];
      const cands = world.tiles.filter(t => t.type === type);
      const tile = cands[nth || 0] || cands[0];
      if (!tile) return 'no-tile';
      p.tileIndex = tile.index;
      const off = offsetOnTile(players.indexOf(p), players.length);
      p.car.position.set(tile.pos.x + off.x, 0, tile.pos.z + off.z);
      faceAlongPath(p.car, tileU(tile.index));
      p.stage = world.zoneOf(tile.index);   /* せいちょうずみ として あつかう */
      Chars.applyCostume(p.car, p.stage, p.job);
      snapCam();
      await runTileEvent(p, 0);
      return 'done';
    },
    debugStars(n) {
      if (!running) return;
      const p = players[turnIdx];
      p.stars = Math.max(0, n);
      updateBadge(turnIdx);
    },
    async debugMouse() {
      if (!running) return;
      await maybeMouse(players[turnIdx], true);
    },
    debugState() {
      return players.map(p => ({
        kind: p.kind, tile: p.tileIndex, stars: p.stars, stage: p.stage, job: p.job,
        houseTier: p.houseTier,
        passengers: (p.car.userData.passengers || []).length,
        cargo: (p.car.userData.cargo || []).length,
      }));
    },
  };
})();
