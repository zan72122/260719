'use strict';
/* ============================================================
 * game.js — メインエンジン
 *  グリッドシミュレーション / 入力 / HUD
 *  描画は render3d.js（Three.js）が担当
 * ============================================================ */

const BASE_SPEED = 1.35;     // タイル/秒
const DONUT_CAP = 70;
const SAVE_KEY = 'donutFactoryV1';

const Game = {
  canvas: null,
  dpr: 1, vw: 0, vh: 0,
  levelIndex: 0, level: null,
  cols: 0, rows: 0,
  tiles: [],        // 2次元 [y][x] (null = ゆか)
  tileList: [],
  donuts: [],
  time: 0,
  speed: 1,
  started: false,
  idleT: 0,
  guide: null,
  pointers: new Map(),
  saved: { level: 0, muted: false, counts: {} },
};

/* ============================================================
 * セーブ
 * ============================================================ */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(Game.saved, JSON.parse(raw));
  } catch (e) {}
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.saved)); } catch (e) {}
}

/* ============================================================
 * レベル読み込み
 * ============================================================ */
function loadLevel(index) {
  const lv = LEVELS[index];
  Game.levelIndex = index;
  Game.level = lv;
  Game.rows = lv.map.length;
  Game.cols = lv.map[0].length;
  Game.tiles = [];
  Game.tileList = [];
  Game.donuts = [];
  Game.guide = null;
  Game.idleT = 0;

  for (let y = 0; y < Game.rows; y++) {
    const row = [];
    const line = lv.map[y];
    for (let x = 0; x < Game.cols; x++) {
      const ch = line[x] || '.';
      let spec = null;
      if (ch === '>') spec = { type: 'belt', dir: 'E' };
      else if (ch === '<') spec = { type: 'belt', dir: 'W' };
      else if (ch === '^') spec = { type: 'belt', dir: 'N' };
      else if (ch === 'v') spec = { type: 'belt', dir: 'S' };
      else if (ch !== '.' && ch !== ' ') {
        const ls = lv.legend[ch];
        if (ls) spec = JSON.parse(JSON.stringify(ls));
      }
      if (spec) {
        // 方向を数値化
        spec.dir = DIR_FROM_CHAR[spec.dir] !== undefined ? DIR_FROM_CHAR[spec.dir] : (spec.dir || 0);
        if (spec.outs) spec.outs = spec.outs.map(d => DIR_FROM_CHAR[d] !== undefined ? DIR_FROM_CHAR[d] : d);
        if (spec.side !== undefined) spec.side = DIR_FROM_CHAR[spec.side] !== undefined ? DIR_FROM_CHAR[spec.side] : spec.side;
        const tile = makeTile(spec, x, y);
        if (tile.type === 'spawner') tile.timer = 0.8;   // すぐ最初の1個が出る
        row.push(tile);
        Game.tileList.push(tile);
      } else {
        row.push(null);
      }
    }
    Game.tiles.push(row);
  }

  Render3D.buildLevel(Game);

  Game.saved.level = index;
  persist();

  if (Game.started) AudioSys.startMusic(lv.music);
  refreshLevelGrid();
}

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= Game.cols || y >= Game.rows) return null;
  return Game.tiles[y][x];
}
Game.tileAt = tileAt;

function findTelePartner(tile) {
  for (const t of Game.tileList) {
    if (t !== tile && t.type === 'tele' && t.pair === tile.pair) return t;
  }
  return null;
}
Game.findTelePartner = findTelePartner;

Game.noteTinker = function () { Game.idleT = 0; Game.guide = null; };

// スポナーの目の前がつまっているか
Game.isTileClogged = function (tile) {
  const c = tileCenter(tile);
  const r2 = (0.75 * CELL) * (0.75 * CELL);
  return Game.donuts.some(d =>
    d.state === 'belt' && d.stopped && dist2(d.x, d.y, c.x, c.y) < r2);
};

/* ============================================================
 * ドーナツ操作 API（タイルから呼ばれる）
 * ============================================================ */
Game.spawnFromSpawner = function (tile, manual) {
  if (Game.donuts.length >= DONUT_CAP) {
    const c = tileCenter(tile);
    Particles.puff(c.x, c.y, 4, '#ffd7e8');
    if (manual) AudioSys.sfx('pop');
    return;
  }
  const d = new Donut(tile.x, tile.y, tile.dir);
  d.centerFired = true;
  Game.donuts.push(d);
  const c = tileCenter(tile);
  if (manual) {
    AudioSys.sfx('bigPop');
    Particles.hearts(c.x, c.y, 4);
    Particles.sparkle(c.x, c.y, 8, '#fff');
  } else {
    AudioSys.sfx('pop');
    Particles.puff(c.x, c.y, 3, '#ffe9f2');
  }
};

Game.collectDonut = function (donut, tile) {
  if (donut.state === 'collect') return;
  donut.state = 'collect';
  donut.stateTime = 0;
  const c = tileCenter(tile);
  donut.aux = { bx: c.x, by: c.y };
  tile.pop = 1;
  tile.count++;
  tile.totalCount++;
  Game.saved.counts[Game.level.id] = (Game.saved.counts[Game.level.id] || 0) + 1;
  persist();
  AudioSys.sfx('chime', tile.count);
  Particles.stars(c.x, c.y, 6);
  if (tile.count >= 12) {
    tile.count = 0;
    tile.shipT = 1;
    AudioSys.sfx('fanfare');
    Particles.confetti(c.x, c.y, 40);
    Particles.stars(c.x, c.y, 14);
  }
};

Game.cloneDonut = function (donut, tile) {
  const c = tileCenter(tile);
  if (Game.donuts.length >= DONUT_CAP) {
    Particles.sparkle(c.x, c.y, 5, '#aef2ae');
    return;
  }
  const d = new Donut(tile.x, tile.y, tile.side);
  d.centerFired = true;
  d.copyDecorFrom(donut);
  Game.donuts.push(d);
  AudioSys.sfx('bigPop');
  Particles.sparkle(c.x, c.y, 10, '#aef2ae');
};

Game.teleportDonut = function (donut, tile) {
  const partner = findTelePartner(tile);
  if (!partner) return;   // 相方なし → そのまま通過
  donut.state = 'teleOut';
  donut.stateTime = 0;
  donut.aux = { partner };
  const c = tileCenter(tile);
  AudioSys.sfx('whoosh');
  Particles.sparkle(c.x, c.y, 10, TELE_COLORS[tile.pair % TELE_COLORS.length]);
};

Game.startJump = function (donut, tile) {
  const dir = tile.dir;
  const c = tileCenter(tile);
  donut.state = 'jump';
  donut.stateTime = 0;
  donut.aux = {
    sx: c.x, sy: c.y,
    ex: c.x + DX[dir] * 2 * CELL,
    ey: c.y + DY[dir] * 2 * CELL,
    ltx: tile.x + DX[dir] * 2,
    lty: tile.y + DY[dir] * 2,
    dir,
    dur: 0.55,
  };
  AudioSys.sfx('boing');
};

function startFall(donut, dir) {
  donut.state = 'fall';
  donut.stateTime = 0;
  donut.aux = { dir: dir !== undefined ? dir : donut.exitDir };
  AudioSys.sfx('fallWhistle');
}

/* ============================================================
 * シミュレーション
 * ============================================================ */
function donutWorldPos(d) {
  const cx = (d.tx + 0.5) * CELL, cy = (d.ty + 0.5) * CELL;
  if (d.t < 0.5) {
    const k = (0.5 - d.t) * CELL;
    d.x = cx - DX[d.entryDir] * k;
    d.y = cy - DY[d.entryDir] * k;
  } else {
    const k = (d.t - 0.5) * CELL;
    d.x = cx + DX[d.exitDir] * k;
    d.y = cy + DY[d.exitDir] * k;
  }
}

function headingVec(d) {
  const dir = d.t < 0.5 ? d.entryDir : d.exitDir;
  return { x: DX[dir], y: DY[dir] };
}

function fireCenter(d) {
  d.centerFired = true;
  const tile = tileAt(d.tx, d.ty);
  if (!tile) return false;
  const def = TILE_DEFS[tile.type];
  if (def.onCenter && def.onCenter(tile, d, Game) === true) return true;   // 状態遷移した
  d.exitDir = def.exitFor ? def.exitFor(tile, d, Game) : tile.dir;
  return false;
}

function updateBeltDonut(d, dt) {
  if (d.stopped) return;
  let remaining = BASE_SPEED * Game.speed * dt;
  let guard = 0;
  while (remaining > 0 && d.state === 'belt' && guard++ < 8) {
    const tile = tileAt(d.tx, d.ty);
    // ゲート：とじていたら手前で止まる
    if (tile && tileBlocksAt(tile, Math.min(0.32, d.t + remaining)) && d.t < 0.32) {
      d.t = Math.min(0.30, d.t + remaining);
      if (d.t >= 0.295) { d.stopped = true; }
      break;
    }
    if (tile && tile.type === 'gate' && !tile.open && d.t >= 0.295 && d.t < 0.5) {
      d.stopped = true;
      break;
    }
    if (!d.centerFired && d.t >= 0.5) {
      if (fireCenter(d)) break;
      continue;
    }
    if (d.t < 0.5) {
      const step = Math.min(remaining, 0.5 - d.t);
      d.t += step;
      remaining -= step;
      if (d.t >= 0.4999 && !d.centerFired) {
        d.t = 0.5;
        if (fireCenter(d)) break;
      }
    } else {
      const step = Math.min(remaining, 1.0 - d.t);
      d.t += step;
      remaining -= step;
      if (d.t >= 0.9999) {
        // つぎのタイルへ
        const nx = d.tx + DX[d.exitDir];
        const ny = d.ty + DY[d.exitDir];
        const nt = tileAt(nx, ny);
        if (nt && TILE_DEFS[nt.type].walkable) {
          d.tx = nx; d.ty = ny;
          d.t = 0;
          d.entryDir = d.exitDir;
          d.centerFired = false;
        } else {
          donutWorldPos(d);
          startFall(d, d.exitDir);
          break;
        }
      }
    }
  }
}

function resolveStops() {
  const ds = Game.donuts;
  for (const d of ds) d.stopped = false;
  // ゲートによる停止
  for (const d of ds) {
    if (d.state !== 'belt') continue;
    const tile = tileAt(d.tx, d.ty);
    if (tile && tile.type === 'gate' && !tile.open && d.t >= 0.29 && d.t < 0.5) d.stopped = true;
  }
  // 前がつまってたら止まる（チェーン）
  const minD2 = (0.58 * CELL) * (0.58 * CELL);
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const d of ds) {
      if (d.state !== 'belt' || d.stopped) continue;
      const hv = headingVec(d);
      for (const e of ds) {
        if (e === d || e.state !== 'belt' || !e.stopped) continue;
        const ex = e.x - d.x, ey = e.y - d.y;
        if (ex * ex + ey * ey < minD2 && (ex * hv.x + ey * hv.y) > 0) {
          d.stopped = true;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
}

function updateDonuts(dt) {
  for (const d of Game.donuts) {
    if (d.state === 'belt') donutWorldPos(d);
  }
  resolveStops();

  for (const d of Game.donuts) {
    // スケールのばね
    d.sx += (d.targetS - d.sx) * Math.min(1, dt * 8);
    d.sy += (d.targetS - d.sy) * Math.min(1, dt * 8);

    switch (d.state) {
      case 'belt':
        updateBeltDonut(d, dt);
        donutWorldPos(d);
        if (d.z > 0) d.z = Math.max(0, d.z - dt * 380);
        break;

      case 'jump': {
        d.stateTime += dt * Game.speed;
        const a = d.aux;
        const k = Math.min(1, d.stateTime / a.dur);
        d.x = lerp(a.sx, a.ex, k);
        d.y = lerp(a.sy, a.ey, k);
        d.z = 100 * 4 * k * (1 - k);
        d.spin = k * TAU;
        if (k >= 1) {
          d.spin = 0;
          d.z = 0;
          const nt = tileAt(a.ltx, a.lty);
          AudioSys.sfx('plop');
          d.sx = 1.25; d.sy = 0.75;   // 着地スカッシュ
          Particles.crumbs(d.x, d.y, 3);
          if (nt && TILE_DEFS[nt.type].walkable) {
            d.state = 'belt';
            d.tx = a.ltx; d.ty = a.lty;
            d.t = 0.5;
            d.entryDir = a.dir;
            d.exitDir = a.dir;
            d.centerFired = false;   // 着地先の装置も発動する
          } else {
            startFall(d, a.dir);
          }
        }
        break;
      }

      case 'fall': {
        d.stateTime += dt;
        const k = d.stateTime / 0.9;
        const sp = BASE_SPEED * Game.speed * CELL * Math.max(0, 1 - k * 1.1);
        d.x += DX[d.aux.dir] * sp * dt;
        d.y += DY[d.aux.dir] * sp * dt;
        d.spin += dt * 9;
        // ぴょこぴょこ2回はねてきえる
        const bounce = Math.abs(Math.sin(k * Math.PI * 2.5)) * 34 * (1 - k);
        d.z = bounce - 12 * k;
        if (k > 0.75) d.alpha = Math.max(0, 1 - (k - 0.75) / 0.25);
        if (k >= 1) {
          d.dead = true;
          AudioSys.sfx('plop');
          Particles.crumbs(d.x, d.y, 6);
          Particles.sparkle(d.x, d.y, 5, '#ffd7e8');
        }
        break;
      }

      case 'collect': {
        d.stateTime += dt;
        const k = Math.min(1, d.stateTime / 0.35);
        d.x = lerp(d.x, d.aux.bx, Math.min(1, dt * 14));
        d.y = lerp(d.y, d.aux.by, Math.min(1, dt * 14));
        d.sx = d.sy = (1 - easeInCubic(k)) * d.targetS;
        d.z = Math.sin(k * Math.PI) * 46;
        if (k >= 1) d.dead = true;
        break;
      }

      case 'teleOut': {
        d.stateTime += dt;
        const k = Math.min(1, d.stateTime / 0.16);
        d.sx = d.sy = (1 - k) * d.targetS;
        d.spin += dt * 22;
        if (k >= 1) {
          const p = d.aux.partner;
          d.tx = p.x; d.ty = p.y;
          d.t = 0.5;
          d.exitDir = p.dir;
          d.entryDir = p.dir;
          d.centerFired = true;    // 相方のテレポは発動しない
          d.state = 'teleIn';
          d.stateTime = 0;
          donutWorldPos(d);
          const c = tileCenter(p);
          Particles.sparkle(c.x, c.y, 10, TELE_COLORS[p.pair % TELE_COLORS.length]);
          p.pop = 1;
        }
        break;
      }

      case 'teleIn': {
        d.stateTime += dt;
        const k = Math.min(1, d.stateTime / 0.16);
        d.sx = d.sy = easeOutBack(k) * d.targetS;
        d.spin = (1 - k) * 4;
        if (k >= 1) { d.state = 'belt'; d.spin = 0; }
        break;
      }

      case 'carried':
        d.z += (52 - d.z) * Math.min(1, dt * 12);
        break;
    }
  }

  Game.donuts = Game.donuts.filter(d => !d.dead);
}

/* ============================================================
 * ガイド（しばらく さわらないと おてほんが でる）
 * ============================================================ */
function updateGuide(dt) {
  Game.idleT += dt;
  if (Game.guide && Game.time - Game.guide.t0 > 4.5) Game.guide = null;
  if (!Game.guide && Game.idleT > 9) {
    const prio = Game.tileList.filter(t => TILE_DEFS[t.type].priorityGuide);
    const machines = Game.tileList.filter(t => {
      const def = TILE_DEFS[t.type];
      return def.interactive && t.type !== 'belt' && t.type !== 'box';
    });
    const pool = (prio.length && Math.random() < 0.6) ? prio : (machines.length ? machines : Game.tileList);
    if (pool.length) {
      Game.guide = { tile: pick(pool), t0: Game.time };
      Game.idleT = 4;   // つぎのガイドまでの間隔
    }
  }
}

/* ============================================================
 * 入力
 * ============================================================ */
function hitDonut(wx, wy) {
  for (let i = Game.donuts.length - 1; i >= 0; i--) {
    const d = Game.donuts[i];
    if (d.state !== 'belt' && d.state !== 'carried') continue;
    if (dist2(wx, wy, d.x, d.y) < (DONUT_R * 1.35) ** 2) return d;
  }
  return null;
}

function onPointerDown(e) {
  e.preventDefault();
  AudioSys.ensure();
  Game.idleT = 0;
  Game.guide = null;
  if (!Game.started) return;

  const rect = Game.canvas.getBoundingClientRect();
  const w = Render3D.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

  // 1) ドーナツをつかむ
  const d = hitDonut(w.x, w.y);
  if (d) {
    d.state = 'carried';
    d.stopped = false;
    d.targetS = 1.18;
    d.spin = 0;
    Game.pointers.set(e.pointerId, { kind: 'grab', donut: d });
    AudioSys.sfx('boing');
    Particles.hearts(d.x, d.y, 3);
    try { Game.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    return;
  }

  // 2) タイルをタップ
  const tx = Math.floor(w.x / CELL), ty = Math.floor(w.y / CELL);
  const tile = tileAt(tx, ty);
  if (tile) {
    const def = TILE_DEFS[tile.type];
    if (def.onTap) {
      def.onTap(tile, Game, w.x, w.y);
      Game.pointers.set(e.pointerId, { kind: 'tap' });
      return;
    }
  }

  // 3) ゆかタップもたのしい
  Particles.sparkle(w.x, w.y, 6, '#ffffff');
  AudioSys.sfx('tick');
  Game.pointers.set(e.pointerId, { kind: 'tap' });
}

function onPointerMove(e) {
  const p = Game.pointers.get(e.pointerId);
  if (!p || p.kind !== 'grab') return;
  e.preventDefault();
  const rect = Game.canvas.getBoundingClientRect();
  const w = Render3D.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const d = p.donut;
  d.x = clamp(w.x, -CELL * 0.4, Game.cols * CELL + CELL * 0.4);
  d.y = clamp(w.y, -CELL * 0.4, Game.rows * CELL + CELL * 0.4);
}

function onPointerUp(e) {
  const p = Game.pointers.get(e.pointerId);
  Game.pointers.delete(e.pointerId);
  if (!p || p.kind !== 'grab') return;
  e.preventDefault();
  const d = p.donut;
  if (d.dead) return;
  d.targetS = 1;

  const tx = Math.floor(d.x / CELL), ty = Math.floor(d.y / CELL);
  const tile = tileAt(tx, ty);
  if (tile && TILE_DEFS[tile.type].walkable) {
    d.state = 'belt';
    d.tx = tx; d.ty = ty;
    d.t = 0.5;
    d.entryDir = tile.dir !== undefined ? tile.dir : DIR_E;
    d.exitDir = d.entryDir;
    d.centerFired = false;   // おいた場所の装置が発動（ボックスなら回収）
    AudioSys.sfx('plop');
    Particles.puff(d.x, d.y, 3, '#fff');
  } else {
    startFall(d, randInt(0, 3));
  }
}

/* ============================================================
 * HUD
 * ============================================================ */
function setupHUD() {
  const btnLevels = document.getElementById('btn-levels');
  const btnSound = document.getElementById('btn-sound');
  const btnRainbow = document.getElementById('btn-rainbow');
  const btnTurbo = document.getElementById('btn-turbo');
  const overlay = document.getElementById('level-overlay');

  btnLevels.addEventListener('click', () => {
    AudioSys.ensure();
    AudioSys.sfx('pop');
    refreshLevelGrid();
    overlay.classList.remove('hidden');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  btnSound.addEventListener('click', () => {
    AudioSys.ensure();
    const m = !AudioSys.muted;
    AudioSys.setMuted(m);
    Game.saved.muted = m;
    persist();
    btnSound.textContent = m ? '🔇' : '🔊';
    if (!m) AudioSys.sfx('chime', 0);
  });

  btnRainbow.addEventListener('click', () => {
    AudioSys.ensure();
    if (Game.rainbowCooldown > 0) return;
    Game.rainbowCooldown = 0.8;
    AudioSys.sfx('slide');
    AudioSys.sfx('fanfare');
    for (const d of Game.donuts) {
      if (d.state === 'collect' || d.state === 'fall') continue;
      d.randomize();
      Particles.sparkle(d.x, d.y, 4, '#fff');
    }
    for (let i = 0; i < 5; i++) {
      Particles.confetti(rand(0, Game.cols * CELL), rand(0, Game.rows * CELL), 10);
    }
    Game.noteTinker();
  });

  btnTurbo.addEventListener('click', () => {
    AudioSys.ensure();
    Game.speed = Game.speed === 1 ? 2.1 : 1;
    btnTurbo.textContent = Game.speed === 1 ? '🐢' : '🐇';
    AudioSys.sfx(Game.speed === 1 ? 'clunk' : 'slide');
    Game.noteTinker();
  });
}

function refreshLevelGrid() {
  const grid = document.getElementById('level-grid');
  if (!grid) return;
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (i === Game.levelIndex ? ' current' : '');
    const total = Game.saved.counts[lv.id] || 0;
    btn.innerHTML = `<span class="lv-emoji">${lv.emoji}</span>` +
      `<span class="lv-name">${lv.name}</span>` +
      `<span class="lv-count">🍩 ${total}</span>`;
    btn.addEventListener('click', () => {
      AudioSys.sfx('bigPop');
      loadLevel(i);
      document.getElementById('level-overlay').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
}

/* ============================================================
 * メインループ・起動
 * ============================================================ */
let _lastT = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - _lastT) / 1000 || 0.016);
  _lastT = ts;
  Game.time += dt;
  Game.rainbowCooldown = Math.max(0, (Game.rainbowCooldown || 0) - dt);

  if (Game.started) {
    for (const t of Game.tileList) {
      t.pop = Math.max(0, t.pop - dt * 3);
      const def = TILE_DEFS[t.type];
      if (def.update) def.update(t, dt, Game);
    }
    updateDonuts(dt);
    Particles.update(dt);
    updateGuide(dt);
  }
  Render3D.render(Game, dt);
  requestAnimationFrame(frame);
}

function resize() {
  Game.dpr = Math.min(2, window.devicePixelRatio || 1);
  Game.vw = window.innerWidth;
  Game.vh = window.innerHeight;
  Render3D.resize(Game.vw, Game.vh, Game.dpr, Game);
}

function boot() {
  Game.canvas = document.getElementById('game');
  Render3D.init(Game.canvas);
  loadSave();

  resize();
  window.addEventListener('resize', () => setTimeout(resize, 60));
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  Game.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  Game.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  Game.canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  Game.canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

  // ダブルタップズーム等の抑止
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  setupHUD();

  const startLevel = clamp(Game.saved.level || 0, 0, LEVELS.length - 1);
  loadLevel(startLevel);

  if (Game.saved.muted) {
    AudioSys.setMuted(true);
    document.getElementById('btn-sound').textContent = '🔇';
  }

  const startOverlay = document.getElementById('start-overlay');
  const begin = () => {
    if (Game.started) return;
    Game.started = true;
    AudioSys.ensure();
    AudioSys.setMuted(Game.saved.muted);
    AudioSys.startMusic(Game.level.music);
    AudioSys.sfx('fanfare');
    startOverlay.classList.add('hidden');
  };
  startOverlay.addEventListener('pointerdown', begin);
  startOverlay.addEventListener('click', begin);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) AudioSys.ensure();
  });

  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', boot);
