'use strict';
/* ============================================================
 * particles.js — 3Dパーティクル（紙吹雪・星・しぶき等）
 *  InstancedMesh 2つ（箱・球）で全パーティクルを描く。
 *  API は 2D 版と同じ: (x, y) はボード平面座標（y は 3D の z）。
 * ============================================================ */

const Particles = (() => {
  const MAX_BOX = 280;
  const MAX_BALL = 160;
  const pool = [];
  let active = 0;
  let boxMesh = null, ballMesh = null;
  const _m = null;

  for (let i = 0; i < MAX_BOX + MAX_BALL; i++) {
    pool.push({ alive: false, ball: i >= MAX_BOX });
  }

  // render3d.js の初期化から呼ばれる
  function initScene(THREE_, scene) {
    const boxGeo = new THREE_.BoxGeometry(8, 8, 2.6);
    const ballGeo = new THREE_.SphereGeometry(4.4, 6, 5);
    const mat = new THREE_.MeshBasicMaterial({ color: 0xffffff });
    boxMesh = new THREE_.InstancedMesh(boxGeo, mat.clone(), MAX_BOX);
    ballMesh = new THREE_.InstancedMesh(ballGeo, mat.clone(), MAX_BALL);
    for (const m of [boxMesh, ballMesh]) {
      m.instanceColor = new THREE_.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
      m.frustumCulled = false;
      scene.add(m);
    }
    window.__pDummy = new THREE_.Object3D();
    window.__pColor = new THREE_.Color();
    hideAll();
  }

  function hideAll() {
    if (!boxMesh) return;
    const d = window.__pDummy;
    d.position.set(0, -9999, 0);
    d.scale.set(0.001, 0.001, 0.001);
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    for (let i = 0; i < MAX_BOX; i++) boxMesh.setMatrixAt(i, d.matrix);
    for (let i = 0; i < MAX_BALL; i++) ballMesh.setMatrixAt(i, d.matrix);
    boxMesh.instanceMatrix.needsUpdate = true;
    ballMesh.instanceMatrix.needsUpdate = true;
  }

  function spawn(opts) {
    const wantBall = opts.kind === 'drop' || opts.kind === 'puff';
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.alive || p.ball !== wantBall) continue;
      p.alive = true;
      p.kind = opts.kind || 'confetti';
      p.x = opts.x; p.z = opts.z !== undefined ? opts.z : opts.y;
      p.h = opts.h !== undefined ? opts.h : 30;
      p.vx = opts.vx || 0;
      p.vz = opts.vz || 0;
      p.vh = opts.vh || 0;
      p.g = opts.g !== undefined ? opts.g : 900;
      p.life = 0;
      p.maxLife = opts.maxLife || 1;
      p.size = (opts.size || 8) / 8;
      p.color = opts.color || '#ff9ec7';
      p.rx = rand(0, TAU); p.ry = rand(0, TAU);
      p.rvx = rand(-8, 8); p.rvy = rand(-8, 8);
      p.drag = opts.drag !== undefined ? opts.drag : 0.99;
      active++;
      return p;
    }
    return null;
  }

  const CONFETTI_COLORS = ['#ff6f9c', '#ffb84d', '#ffe95c', '#7ce27c', '#5cc8ff', '#c99cff', '#ff9ec7'];

  function burst(x, y, kind, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(opts.minSpeed || 120, opts.maxSpeed || 420) * 0.6;
      spawn({
        kind,
        x, y,
        h: opts.h !== undefined ? opts.h : 34,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vh: (opts.up || 160) + rand(0, 120),
        g: opts.g !== undefined ? opts.g : 900,
        maxLife: rand(0.5, opts.life || 1.1),
        size: rand(5, opts.size || 11),
        color: opts.color || pick(CONFETTI_COLORS),
      });
    }
  }

  function sparkle(x, y, count = 8, color = '#fff') {
    burst(x, y, 'sparkle', count, { minSpeed: 40, maxSpeed: 180, up: 60, g: 60, life: 0.6, size: 9, color, h: 40 });
  }
  function confetti(x, y, count = 24) {
    burst(x, y, 'confetti', count, { up: 340, life: 1.4, h: 60 });
  }
  function hearts(x, y, count = 6) {
    burst(x, y, 'heart', count, { minSpeed: 50, maxSpeed: 190, up: 220, g: 260, life: 1.0, size: 13, color: '#ff7ba9', h: 50 });
  }
  function stars(x, y, count = 10) {
    burst(x, y, 'star', count, { minSpeed: 60, maxSpeed: 260, up: 220, g: 420, life: 1.0, size: 12, color: '#ffd94d', h: 40 });
  }
  function splash(x, y, color, count = 10) {
    burst(x, y, 'drop', count, { minSpeed: 60, maxSpeed: 250, up: 200, g: 800, life: 0.8, size: 8, color, h: 40 });
  }
  function crumbs(x, y, count = 8) {
    burst(x, y, 'drop', count, { minSpeed: 60, maxSpeed: 220, up: 160, g: 900, life: 0.7, size: 6, color: '#e8b06a', h: 24 });
  }
  function puff(x, y, count = 7, color = '#ffffff') {
    burst(x, y, 'puff', count, { minSpeed: 20, maxSpeed: 90, up: 60, g: -40, life: 0.8, size: 16, color, h: 40 });
  }
  // スプリンクラーからぱらぱら落ちる
  function drizzle(x, z, color) {
    spawn({
      kind: 'confetti',
      x: x + rand(-20, 20), z: z + rand(-14, 14),
      h: 74,
      vx: rand(-12, 12), vz: rand(-12, 12), vh: -rand(20, 60),
      g: 340, maxLife: 0.55, size: 6, color,
    });
  }

  function update(dt) {
    if (active <= 0) return;
    for (const p of pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; active--; continue; }
      p.vh -= p.g * dt;
      p.vx *= p.drag;
      p.vz *= p.drag;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.h += p.vh * dt;
      if (p.h < 3 && p.vh < 0) { p.h = 3; p.vh *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.rvx * dt;
      p.ry += p.rvy * dt;
    }
  }

  // 毎フレーム render3d.js から呼ばれる
  function sync() {
    if (!boxMesh) return;
    const d = window.__pDummy;
    const col = window.__pColor;
    let bi = 0, si = 0;
    for (const p of pool) {
      if (!p.alive) continue;
      const k = 1 - p.life / p.maxLife;
      const fade = Math.min(1, k * 2.5);
      let s = p.size * fade;
      if (p.kind === 'puff') s = p.size * (1.3 - k * 0.5) * Math.min(1, k * 2);
      d.position.set(p.x, p.h, p.z);
      d.rotation.set(p.rx, p.ry, 0);
      d.scale.set(s, s, s);
      d.updateMatrix();
      col.set(p.color);
      if (!p.ball && bi < MAX_BOX) {
        boxMesh.setMatrixAt(bi, d.matrix);
        boxMesh.setColorAt(bi, col);
        bi++;
      } else if (p.ball && si < MAX_BALL) {
        ballMesh.setMatrixAt(si, d.matrix);
        ballMesh.setColorAt(si, col);
        si++;
      }
    }
    // のこりは隠す
    d.position.set(0, -9999, 0);
    d.scale.set(0.001, 0.001, 0.001);
    d.updateMatrix();
    for (let i = bi; i < MAX_BOX; i++) boxMesh.setMatrixAt(i, d.matrix);
    for (let i = si; i < MAX_BALL; i++) ballMesh.setMatrixAt(i, d.matrix);
    boxMesh.instanceMatrix.needsUpdate = true;
    ballMesh.instanceMatrix.needsUpdate = true;
    if (boxMesh.instanceColor) boxMesh.instanceColor.needsUpdate = true;
    if (ballMesh.instanceColor) ballMesh.instanceColor.needsUpdate = true;
  }

  function clear() {
    for (const p of pool) p.alive = false;
    active = 0;
    if (boxMesh) hideAll();
  }

  return { initScene, spawn, burst, sparkle, confetti, hearts, stars, splash, crumbs, puff, drizzle, update, sync, clear };
})();
