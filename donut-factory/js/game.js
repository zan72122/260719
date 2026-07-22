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
  // わたしのこうじょう（設置ブラシ）
  brush: 'belt',
  userTileCount: 0,
  // ハプニングイベント
  event: null,
  eventTimer: 75,
  orderBoost: 1,
  // かみなり雲・スタン
  cloud: null,
  cloudTimer: 50,
  stunT: 0,
  // やさいモード・ドミノ波・反転
  veggie: false,
  dominoWave: null,
  flipCooldown: 0,
  rainButtonCd: 0,
  skyfallQueue: 0,
  skyfallT: 0,
};

// 全体の流れ係数（ターボ × イベント効果）。停電・かみなり=0、あめ=1.6倍
Game.flow = function () {
  if (Game.stunT > 0) return 0;
  let m = 1;
  if (Game.event) {
    if (Game.event.type === 'blackout') m = 0;
    else if (Game.event.type === 'rain') m = 1.6;
  }
  return Game.speed * m;
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
  Game.userTileCount = 0;
  Game.event = null;
  Game.orderBoost = 1;
  Game.eventTimer = rand(60, 100);
  Game.cloud = null;
  Game.cloudTimer = rand(45, 80);
  Game.stunT = 0;
  Game.veggie = false;
  Game.dominoWave = null;
  Game.skyfallQueue = 0;
  Game.flipCooldown = 0;
  hideBanner();

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
    d.state === 'belt' && (d.stopped || d.jammed || d.overlapS > 0.3) && dist2(d.x, d.y, c.x, c.y) < r2);
};

/* ============================================================
 * わたしのこうじょう — ゆかに自由に設置・長押しで撤去
 * ============================================================ */
const USER_TILE_CAP = 40;

function smartDir(tx, ty) {
  // となりにベルト等があれば、そちらへ流す向きにする
  for (let d = 0; d < 4; d++) {
    const nt = tileAt(tx + DX[d], ty + DY[d]);
    if (nt && TILE_DEFS[nt.type].walkable) return d;
  }
  return DIR_E;
}

function placeUserTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= Game.cols || ty >= Game.rows) return false;
  if (Game.tiles[ty][tx]) return false;
  const c = { x: (tx + 0.5) * CELL, y: (ty + 0.5) * CELL };
  if (Game.userTileCount >= USER_TILE_CAP) {
    Particles.sparkle(c.x, c.y, 4, '#ffffff');
    AudioSys.sfx('tick');
    return true;
  }
  let spec;
  switch (Game.brush) {
    case 'froster':   spec = { type: 'froster', color: pick(FROST_CYCLE) }; break;
    case 'sprinkler': spec = { type: 'sprinkler', style: pick(SPRINKLE_CYCLE) }; break;
    case 'jump':      spec = { type: 'jump' }; break;
    case 'pusher':    spec = { type: 'pusher' }; break;
    case 'hole':      spec = { type: 'hole' }; break;
    case 'cannon':    spec = { type: 'cannon' }; break;
    default:          spec = { type: 'belt' };
  }
  spec.dir = smartDir(tx, ty);
  const tile = makeTile(spec, tx, ty);
  tile.userPlaced = true;
  tile.spawnAnim = 1;
  tile.pop = 0.5;
  Game.tiles[ty][tx] = tile;
  Game.tileList.push(tile);
  Game.userTileCount++;
  Render3D.addTileView(tile);
  AudioSys.sfx('pokon');
  Particles.puff(c.x, c.y, 5, '#ffffff');
  Particles.sparkle(c.x, c.y, 6, '#aef2ae');
  Game.noteTinker();
  return true;
}

function removeUserTile(tile) {
  if (!tile.userPlaced) return;
  if (Game.tiles[tile.y][tile.x] !== tile) return;
  Game.tiles[tile.y][tile.x] = null;
  const i = Game.tileList.indexOf(tile);
  if (i >= 0) Game.tileList.splice(i, 1);
  Game.userTileCount = Math.max(0, Game.userTileCount - 1);
  Render3D.removeTileView(tile);
  // うえにいたドーナツ・装置につかまれていたドーナツはころがりおちる
  for (const d of Game.donuts) {
    if (d.state === 'belt' && d.tx === tile.x && d.ty === tile.y) startFall(d, d.exitDir);
    if ((d.state === 'pushed' || d.state === 'craned' || d.state === 'loaded') && d.aux && d.aux.srcTile === tile) {
      d.hidden = false;
      startFall(d, randInt(0, 3));
    }
  }
  const c = tileCenter(tile);
  AudioSys.sfx('zupon');
  Particles.puff(c.x, c.y, 6, '#ffffff');
  Particles.crumbs(c.x, c.y, 4);
  Game.noteTinker();
}

/* ============================================================
 * ハプニングイベント（あめ・ていでん・おおちゅうもん）
 * ============================================================ */
const EVENTS = {
  rain:     { emoji: '☔', text: 'あめだ！ みんな いそげ〜！', dur: 22 },
  blackout: { emoji: '💡', text: 'ていでん！ タップで なおして！', dur: 18 },
  order:    { emoji: '📋', text: 'おおちゅうもん！ ドーナツ いっぱい つくって！', dur: 20 },
};

function startEvent(type) {
  const def = EVENTS[type];
  Game.event = { type, t: 0, dur: def.dur, data: { taps: 0, restore: 0 } };
  showBanner(def.emoji, def.text, type === 'blackout' ? 17000 : 3200);
  if (type === 'rain') {
    AudioSys.sfx('rain');
    AudioSys.sfx('shaker');
  } else if (type === 'blackout') {
    AudioSys.sfx('powerDown');
    Render3D.shake(6);
  } else {
    AudioSys.sfx('honk');
    AudioSys.sfx('bigPop');
    Game.orderBoost = 4;
  }
}

function endEvent() {
  if (!Game.event) return;
  const type = Game.event.type;
  const fixed = type === 'blackout' && Game.event.data.taps >= 3;
  Game.event = null;
  Game.orderBoost = 1;
  Game.eventTimer = rand(85, 130);
  hideBanner();
  if (type === 'blackout') {
    AudioSys.sfx('fanfare');
    Render3D.punch(0.4);
    for (let i = 0; i < 3; i++) {
      Particles.confetti(rand(0, Game.cols * CELL), rand(0, Game.rows * CELL), 8);
    }
    if (fixed) showBanner('🌟', 'なおった！ ありがとう！', 2600);
  }
}

function updateEvents(dt) {
  if (Game.event) {
    Game.event.t += dt;
    if (Game.event.t >= Game.event.dur) endEvent();
  } else {
    Game.eventTimer -= dt;
    if (Game.eventTimer <= 0) startEvent(pick(['rain', 'blackout', 'order']));
  }

  // かみなり雲（ふらふら漂う。タップすると落雷）
  if (Game.cloud) {
    const cl = Game.cloud;
    cl.t += dt;
    cl.x += cl.vx * dt;
    cl.y += cl.vy * dt;
    const bw = Game.cols * CELL, bh = Game.rows * CELL;
    if (cl.x < 70 || cl.x > bw - 70) cl.vx *= -1;
    if (cl.y < 70 || cl.y > bh - 70) cl.vy *= -1;
    if (cl.t > 24) { Game.cloud = null; Game.cloudTimer = rand(55, 95); }
  } else {
    Game.cloudTimer -= dt;
    if (Game.cloudTimer <= 0 && !Game.event) {
      Game.cloud = {
        x: rand(120, Game.cols * CELL - 120),
        y: rand(120, Game.rows * CELL - 120),
        vx: rand(-26, 26), vy: rand(-18, 18), t: 0,
      };
      showBanner('⛈️', 'かみなりぐもだ！ タップしてみて！', 3400);
      AudioSys.sfx('rain');
    }
  }

  // かみなりのビリビリ（スタン）
  if (Game.stunT > 0) {
    Game.stunT -= dt;
    Game.sparkT = (Game.sparkT || 0) - dt;
    if (Game.sparkT <= 0) {
      Game.sparkT = 0.14;
      const ds = Game.donuts.filter(d => d.state === 'belt');
      if (ds.length) {
        const d = pick(ds);
        Particles.sparkle(d.x, d.y, 4, '#fff06a');
      }
    }
    if (Game.stunT <= 0) { AudioSys.sfx('zap'); AudioSys.sfx('slide'); }
  }

  // ドミノ波（ベルトが1枚ずつパタパタ）
  if (Game.dominoWave) {
    const w = Game.dominoWave;
    w.t += dt;
    while (w.idx < w.list.length && w.t >= w.idx * w.interval) {
      const bt = w.list[w.idx].tile;
      if (bt.type === 'belt' && Game.tiles[bt.y] && Game.tiles[bt.y][bt.x] === bt) {
        bt.dir = rotateCW(bt.dir);
        bt.rotAnim = 1;
        bt.pop = 0.5;
        if (w.idx % 3 === 0) AudioSys.sfx('tick');
      }
      w.idx++;
    }
    if (w.idx >= w.list.length) Game.dominoWave = null;
  }

  // ドーナツのあめ
  Game.rainButtonCd = Math.max(0, Game.rainButtonCd - dt);
  if (Game.skyfallQueue > 0) {
    Game.skyfallT -= dt;
    if (Game.skyfallT <= 0) {
      Game.skyfallT = 0.07;
      Game.skyfallQueue--;
      if (Game.donuts.length < DONUT_CAP) {
        const tx = randInt(0, Game.cols - 1), ty = randInt(0, Game.rows - 1);
        const d = new Donut(tx, ty, DIR_E);
        d.state = 'skyfall';
        d.x = (tx + 0.5) * CELL + rand(-28, 28);
        d.y = (ty + 0.5) * CELL + rand(-28, 28);
        d.z = rand(380, 560);
        d.sx = d.sy = 1;
        d.centerFired = true;
        d.isVeggie = Game.veggie;
        d.aux = { vz: 0 };
        Game.donuts.push(d);
      }
    }
  }

  Game.flipCooldown = Math.max(0, Game.flipCooldown - dt);
}

// らくらい！
function strikeLightning() {
  const cl = Game.cloud;
  Game.cloud = null;
  Game.cloudTimer = rand(60, 100);
  Game.stunT = 3;
  AudioSys.sfx('thunder');
  Render3D.shake(16);
  Render3D.flash(cl.x, cl.y, '#ffffff', 340);
  Render3D.flash(cl.x, cl.y, '#fff06a', 210);
  for (let i = 0; i < 12; i++) {
    Particles.spawn({
      kind: 'sparkle',
      x: cl.x + rand(-14, 14), z: cl.y + rand(-14, 14),
      h: 235 - i * 18,
      vx: rand(-30, 30), vz: rand(-30, 30), vh: -rand(60, 150), g: 0,
      maxLife: 0.4, size: 12, color: '#fff06a',
    });
  }
  showBanner('⚡', 'ビリビリ〜！！', 2600);
}

let _bannerTimer = null;
function showBanner(emoji, text, ms = 3000) {
  const b = document.getElementById('event-banner');
  if (!b) return;
  document.getElementById('event-emoji').textContent = emoji;
  document.getElementById('event-text').textContent = text;
  b.classList.remove('hidden');
  if (_bannerTimer) clearTimeout(_bannerTimer);
  _bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
function hideBanner() {
  const b = document.getElementById('event-banner');
  if (b) b.classList.add('hidden');
}

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
  d.isVeggie = Game.veggie;
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
  // 2階建てなら上の子もいっしょに回収（2個ぶんのチャイム！）
  const rider = donut.rider;
  if (rider) {
    donut.rider = null;
    rider.carrier = null;
  }
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
    AudioSys.sfx('honk');
    AudioSys.sfx('fanfare');
    Particles.confetti(c.x, c.y, 40);
    Particles.stars(c.x, c.y, 14);
    Render3D.punch(0.7);                 // 出荷！カメラがズームバウンス
    Render3D.shake(8);
    Render3D.flash(c.x, c.y, '#fff3b0', 210);
  }
  if (rider && !rider.dead) {
    if (rider.isVeggie) Game.spitDonut(rider, tile);
    else Game.collectDonut(rider, tile);
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
  d.isVeggie = donut.isVeggie;
  Game.donuts.push(d);
  AudioSys.sfx('bigPop');
  Particles.sparkle(c.x, c.y, 10, '#aef2ae');
  Render3D.flash(c.x, c.y, '#b6ffb6', 170);    // コピーの閃光！
  Render3D.punch(0.3);
};

Game.teleportDonut = function (donut, tile) {
  const partner = findTelePartner(tile);
  if (!partner) return;   // 相方なし → そのまま通過
  donut.state = 'teleOut';
  donut.stateTime = 0;
  donut.aux = { partner };
  const c = tileCenter(tile);
  const col = TELE_COLORS[tile.pair % TELE_COLORS.length];
  AudioSys.sfx('whoosh');
  Particles.sparkle(c.x, c.y, 10, col);
  Render3D.flash(c.x, c.y, col, 130);
  const pc = tileCenter(partner);
  Render3D.flash(pc.x, pc.y, col, 130);
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
  Render3D.shake(5);
};

function startFall(donut, dir) {
  // 上に乗っていた子もいっしょにころがりおちる
  if (donut.rider) {
    const r = donut.rider;
    donut.rider = null;
    r.carrier = null;
    if (!r.dead && r.state === 'riding') {
      r.state = 'fall';
      r.stateTime = 0;
      r.aux = { dir: randInt(0, 3) };
    }
  }
  if (donut.carrier) {
    donut.carrier.rider = null;
    donut.carrier = null;
  }
  donut.state = 'fall';
  donut.stateTime = 0;
  donut.aux = { dir: dir !== undefined ? dir : donut.exitDir };
  AudioSys.sfx('fallWhistle');
}

/* ============================================================
 * 新しい装置のドーナツ操作（段階3）
 * ============================================================ */

// 大砲: つめて → ドーン！
Game.loadCannon = function (donut, tile) {
  donut.state = 'loaded';
  donut.stateTime = 0;
  donut.hidden = true;
  donut.aux = { srcTile: tile };
  tile.chargeT = 1;
  AudioSys.sfx('ratchet');
};

// ブラックホール: 吸い込まれて、ゴールのそばからこっそり出てくる
Game.suckDonut = function (donut, tile) {
  const c = tileCenter(tile);
  donut.state = 'sucked';
  donut.stateTime = 0;
  donut.aux = { cx: c.x, cy: c.y, r0: Math.max(20, Math.hypot(donut.x - c.x, donut.y - c.y) + 24), a0: Math.atan2(donut.y - c.y, donut.x - c.x) };
  AudioSys.sfx('slurp');
  Particles.sparkle(c.x, c.y, 8, '#b78cff');
};

// やさいを「ぺっ」と吐き出す
Game.spitDonut = function (donut, tile) {
  const back = oppositeDir(donut.entryDir);
  const c = tileCenter(tile);
  donut.state = 'spit';
  donut.stateTime = 0;
  donut.aux = {
    sx: c.x, sy: c.y,
    ex: c.x + DX[back] * CELL, ey: c.y + DY[back] * CELL,
    ltx: tile.x + DX[back], lty: tile.y + DY[back],
  };
  tile.pop = 1;
  AudioSys.sfx('zupon');
  AudioSys.sfx('giggle');
  Particles.puff(c.x, c.y, 4, '#d8f0c8');
};

// プッシャーからの解放
Game.releasePushed = function (donut) {
  const tx = Math.floor(donut.x / CELL), ty = Math.floor(donut.y / CELL);
  const tile = tileAt(tx, ty);
  if (tile && TILE_DEFS[tile.type].walkable) {
    donut.state = 'belt';
    donut.tx = tx; donut.ty = ty;
    donut.t = 0.5;
    donut.entryDir = tile.dir;
    donut.exitDir = tile.dir;
    donut.centerFired = false;
  } else {
    startFall(donut, randInt(0, 3));
  }
};

// クレーンからの解放
Game.releaseCraned = function (donut, tx, ty) {
  const tile = tileAt(tx, ty);
  if (tile && TILE_DEFS[tile.type].walkable) {
    donut.state = 'belt';
    donut.tx = tx; donut.ty = ty;
    donut.t = 0.5;
    donut.entryDir = tile.dir;
    donut.exitDir = tile.dir;
    donut.centerFired = false;
    donut.z = 0;
    donut.sx = 1.2; donut.sy = 0.8;
  } else {
    startFall(donut, randInt(0, 3));
  }
};

// ドミノスイッチ: ベルトが1枚ずつパタパタ回る
Game.startDominoWave = function (tile) {
  if (Game.dominoWave) return;
  const belts = Game.tileList
    .filter(t => t.type === 'belt')
    .map(t => ({ tile: t, dist: Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y) }))
    .sort((a, b) => a.dist - b.dist);
  if (!belts.length) return;
  Game.dominoWave = { list: belts, idx: 0, t: 0, interval: 0.09 };
  AudioSys.sfx('ratchet');
  Render3D.shake(3);
};

// やさいスイッチ
Game.toggleVeggie = function () {
  Game.veggie = !Game.veggie;
  for (const d of Game.donuts) {
    d.isVeggie = Game.veggie;
    d.decorRev++;
    if (d.state === 'belt') Particles.puff(d.x, d.y, 2, Game.veggie ? '#bfe8a8' : '#ffd7e8');
  }
  AudioSys.sfx(Game.veggie ? 'boing' : 'pokon');
  AudioSys.sfx('spin');
  showBanner(Game.veggie ? '🥦' : '🍩', Game.veggie ? 'ぜんぶ やさいに なっちゃった！' : 'ドーナツに もどった！', 2800);
  Render3D.punch(0.35);
};

// こうじょう反転レバー
Game.flipBoard = function () {
  if (Game.flipCooldown > 0) return;
  Game.flipCooldown = 3;
  const cols = Game.cols, rows = Game.rows;
  // 2階建てはほどいてから
  for (const d of Game.donuts) { d.rider = null; d.carrier = null; }
  // 途中状態のドーナツはポンっと消す
  Game.donuts = Game.donuts.filter(d => {
    if (d.state === 'belt' || d.state === 'carried') return true;
    Particles.sparkle(d.x, d.y, 6, '#ffffff');
    return false;
  });
  // 位置は点対称、向きはそのまま。
  // （位置の反転 + スタート/ゴール役割の入替で、流れは自然に逆転する）
  for (const t of Game.tileList) {
    t.x = cols - 1 - t.x;
    t.y = rows - 1 - t.y;
    if (t.type === 'spawner') {
      t.type = 'box'; t.count = 0; t.shipT = 0;
    } else if (t.type === 'box') {
      t.type = 'spawner'; t.timer = 1;
    }
    t.held = null; t.craneState = null;
  }
  Game.tiles = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const t of Game.tileList) Game.tiles[t.y][t.x] = t;
  // 新スポナー（もとゴール）の向き: 流れ出せる方向へ
  for (const t of Game.tileList) {
    if (t.type !== 'spawner') continue;
    let best = -1;
    for (let d2 = 0; d2 < 4; d2++) {
      const nt = tileAt(t.x + DX[d2], t.y + DY[d2]);
      if (nt && TILE_DEFS[nt.type].walkable) {
        if (best < 0) best = d2;
        if (nt.dir === d2) { best = d2; break; }
      }
    }
    if (best >= 0) t.dir = best;
  }
  // ドーナツも点対称の位置へ（マス中央にスナップして流れ直す）
  const bw = cols * CELL, bh = rows * CELL;
  for (const d of Game.donuts) {
    d.tx = cols - 1 - d.tx;
    d.ty = rows - 1 - d.ty;
    const under = tileAt(d.tx, d.ty);
    if (under && TILE_DEFS[under.type].walkable && d.state === 'belt') {
      d.t = 0.5;
      d.entryDir = under.dir;
      d.exitDir = under.dir;
      d.centerFired = true;
      donutWorldPos(d);
    } else {
      d.x = bw - d.x;
      d.y = bh - d.y;
      if (d.state === 'belt') startFall(d, randInt(0, 3));
    }
  }
  Render3D.buildLevel(Game);
  Render3D.punch(0.8);
  Render3D.shake(10);
  Render3D.flash(bw / 2, bh / 2, '#ffffff', 320);
  for (let i = 0; i < 4; i++) Particles.confetti(rand(0, bw), rand(0, bh), 10);
  AudioSys.sfx('spin');
  AudioSys.sfx('fanfare');
  showBanner('🙃', 'こうじょう はんてん！', 3000);
};

/* ============================================================
 * シミュレーション
 * ============================================================ */
function donutWorldPos(d) {
  const cx = (d.tx + 0.5) * CELL, cy = (d.ty + 0.5) * CELL;
  if (d.t < 0.5) {
    const k = (0.5 - d.t) * CELL;
    d.x = cx - DX[d.entryDir] * k + d.ox;
    d.y = cy - DY[d.entryDir] * k + d.oy;
  } else {
    const k = (d.t - 0.5) * CELL;
    d.x = cx + DX[d.exitDir] * k + d.ox;
    d.y = cy + DY[d.exitDir] * k + d.oy;
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
  d.revHold = false;
  // 押し付けが深いほど遅くなる（連続減速 → 隊列が静かに落ち着く）
  const contactSlow = clamp(1 - d.overlapS * 1.35, 0, 1);
  let remaining = BASE_SPEED * Game.flow() * dt * contactSlow;
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
    } else if (d.exitDir === oppositeDir(d.entryDir) && d.t <= 0.51 &&
               (d.reverseLock > 0 || d.pressure >= 2)) {
      // 反転ヒステリシス：ロック中 or 押し合い中は境界でふんばる（押し相撲）
      d.t = 0.5;
      d.revHold = true;
      break;
    } else {
      // 反転を実行するときはしばらく再反転禁止
      if (d.exitDir === oppositeDir(d.entryDir) && d.t <= 0.51) d.reverseLock = 0.62;
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
  // ゲートによる停止のみ。渋滞の伝播は「ふれあい物理」が担う
  const ds = Game.donuts;
  for (const d of ds) d.stopped = false;
  for (const d of ds) {
    if (d.state !== 'belt') continue;
    const tile = tileAt(d.tx, d.ty);
    if (tile && tile.type === 'gate' && !tile.open && d.t >= 0.29 && d.t < 0.5) d.stopped = true;
  }
}

/* ============================================================
 * ふれあい物理 — 「やわらかい世界では、衝突は事故ではなく“ふれあい”になる」
 *  位置ベース（PBD）で押し合いを解く。ばねを使わないので発振しない。
 *  ・おしくらまんじゅう: 重なりを直接押し戻し、深さは squish 描画へ
 *  ・ヒステリシス: 反転ロック + 押し合い中は境界でふんばる（押し相撲）
 *  ・ところてん圧力弁: 3方向以上から圧されたら横へ「にゅるっ」
 *  ・ラッキー乗り上げ: 圧の中心の子はとなりの上へぽんっ（2階建てまで）
 * ============================================================ */
const CONTACT_D = 54;                 // 接触直径
const CONTACT_RELAX = 0.3;            // 1回の解決率（低め＝むにゅっと感）
const PAIR_CAP = 320;                 // 1フレームの処理ペア上限

function solveContacts(dt) {
  const list = [];
  for (const d of Game.donuts) {
    d.overlap = 0;
    d.pressure = 0;
    d.pressN = null;
    d.reverseLock = Math.max(0, d.reverseLock - dt);
    d.squeezeCd = Math.max(0, d.squeezeCd - dt);
    if (d.state === 'belt' || d.state === 'carried') list.push(d);
  }
  const n = list.length;
  if (n < 2) return;
  const D2 = CONTACT_D * CONTACT_D;

  for (let iter = 0; iter < 2; iter++) {
    let pairs = 0;
    for (let i = 0; i < n && pairs < PAIR_CAP; i++) {
      const a = list[i];
      for (let j = i + 1; j < n && pairs < PAIR_CAP; j++) {
        const b = list[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        if (dx > CONTACT_D || dx < -CONTACT_D || dy > CONTACT_D || dy < -CONTACT_D) continue;
        const dd = dx * dx + dy * dy;
        if (dd >= D2) continue;
        pairs++;
        let dist = Math.sqrt(dd);
        if (dist < 1) {   // 完全一致（クローン直後など）は id で向きを決める
          const ja = a.id * 2.399;
          dx = Math.cos(ja); dy = Math.sin(ja); dist = 1;
        } else {
          dx /= dist; dy /= dist;
        }
        const pen = CONTACT_D - dist;
        const ov = pen / CONTACT_D;
        if (iter === 0) {
          a.pressure++; b.pressure++;
          if (ov > a.overlap) { a.overlap = ov; a.pressN = b; }
          if (ov > b.overlap) { b.overlap = ov; b.pressN = a; }
        }
        // 重み: 指でつかんでいる子は不動、ゲート停止はどっしり、渋滞中はやや重い
        const wa = a.state === 'carried' ? 0 : (a.stopped ? 0.22 : (a.jammed ? 0.55 : 1));
        const wb = b.state === 'carried' ? 0 : (b.stopped ? 0.22 : (b.jammed ? 0.55 : 1));
        const ws = wa + wb;
        if (ws <= 0) continue;
        const push = pen * CONTACT_RELAX;
        const pa = push * (wa / ws), pb = push * (wb / ws);
        a.ox -= dx * pa; a.oy -= dy * pa; a.x -= dx * pa; a.y -= dy * pa;
        b.ox += dx * pb; b.oy += dy * pb; b.x += dx * pb; b.y += dy * pb;
      }
    }
  }

  // 圧力の出口: ラッキー乗り上げ / ところてん
  Game.valveCd = Math.max(0, (Game.valveCd || 0) - dt);
  for (const d of list) {
    if (d.state !== 'belt' || d.squeezeCd > 0) continue;
    if (d.pressure >= 3 && d.overlap > 0.06 && !d.rider && !d.carrier) {
      const nb = d.pressN;
      if (nb && nb.state === 'belt' && !nb.rider && !nb.carrier && Math.random() < dt * 2.2) {
        mountRider(d, nb);
        continue;
      }
      if (d.pressure >= 4 && Game.valveCd <= 0 && Math.random() < dt * 3.5) {
        squeezeOut(d);
        Game.valveCd = 0.4;
      }
    }
  }

  // 押し相撲のけむり
  Game.sumoT = (Game.sumoT || 0) - dt;
  if (Game.sumoT <= 0) {
    Game.sumoT = 0.5;
    const s = list.find(d => d.revHold && d.pressure >= 2);
    if (s) {
      Particles.puff(s.x + rand(-14, 14), s.y + rand(-14, 14), 2, '#ffffff');
      if (Math.random() < 0.3) AudioSys.sfx('giggle');
    }
  }
}

// オフセットの落ち着き: 進行方向成分は t へ移し、のこりはベルトが中央へ戻す
function settleContacts(dt) {
  for (const d of Game.donuts) {
    if (d.state === 'belt') {
      let ox = d.ox, oy = d.oy;
      if (ox !== 0 || oy !== 0) {
        const hv = headingVec(d);
        const along = ox * hv.x + oy * hv.y;
        // とじたゲートは位置制約としても硬い（圧力ですり抜けない）
        let hi = 0.995;
        const under = tileAt(d.tx, d.ty);
        const gateClosed = under && under.type === 'gate' && !under.open;
        if (gateClosed && d.t <= 0.31) hi = 0.30;
        const newT = clamp(d.t + along / CELL, -0.35, hi);
        const used = (newT - d.t) * CELL;
        d.t = newT;
        ox -= hv.x * used;
        oy -= hv.y * used;
        if (gateClosed) {
          // バーの先へ進む方向のオフセットはすてる
          const fwd = ox * hv.x + oy * hv.y;
          if (fwd > 0) { ox -= hv.x * fwd; oy -= hv.y * fwd; }
        }
        const decay = 1 - Math.min(1, dt * 3.2);
        d.ox = clamp(ox * decay, -46, 46);
        d.oy = clamp(oy * decay, -46, 46);
      }
      // 押されて動けない子は jammed（0.25秒窓の実移動量で判定 → マイクロ振動に強い）
      d.anchorT -= dt;
      if (d.anchorT <= 0) {
        const net = Math.hypot(d.x - d.anchorX, d.y - d.anchorY);
        if (!d.jammed) {
          if (net < 11 && d.overlapS > 0.03) d.jammed = true;
        } else if (d.overlapS < 0.015) {
          d.jammed = false;
        }
        d.anchorX = d.x; d.anchorY = d.y;
        d.anchorT = 0.25;
      }
    } else {
      d.ox *= 0.8; d.oy *= 0.8;
      d.jammed = false;
    }
    d.overlapS += (Math.min(1, d.overlap * 5.5) - d.overlapS) * Math.min(1, dt * 10);
    d.prevX = d.x; d.prevY = d.y;
  }
}

// ラッキー乗り上げ（2階建てドーナツ）
function mountRider(d, carrier) {
  d.state = 'riding';
  d.stateTime = 0;
  d.carrier = carrier;
  carrier.rider = d;
  d.ox = d.oy = 0;
  d.stopped = false;
  AudioSys.sfx('boing');
  Particles.hearts(d.x, d.y, 2);
}

function dismountRider(d) {
  const c = d.carrier;
  if (c) c.rider = null;
  d.carrier = null;
  if (d.dead || d.state !== 'riding') return;
  const tx = Math.floor(d.x / CELL), ty = Math.floor(d.y / CELL);
  const under = tileAt(tx, ty);
  if (under && TILE_DEFS[under.type].walkable) {
    d.state = 'belt';
    d.tx = tx; d.ty = ty;
    d.t = 0.5;
    d.entryDir = under.dir;
    d.exitDir = under.dir;
    d.centerFired = true;
    d.squeezeCd = 1.5;
    d.ox = d.oy = 0;
  } else {
    startFall(d, randInt(0, 3));
  }
}

// ところてん式に横へ「にゅるっ」
function squeezeOut(d) {
  const hv = headingVec(d);
  const sides = Math.random() < 0.5
    ? [[hv.y, -hv.x], [-hv.y, hv.x]]
    : [[-hv.y, hv.x], [hv.y, -hv.x]];
  for (const [px, py] of sides) {
    const tx = d.tx + px, ty = d.ty + py;
    const nt = tileAt(tx, ty);
    if (nt && TILE_DEFS[nt.type].walkable) {
      hopTo(d, tx, ty);
      return;
    }
  }
  // 左右がなければうしろへ
  const bx = d.tx - hv.x, by = d.ty - hv.y;
  const bt = tileAt(bx, by);
  if (bt && TILE_DEFS[bt.type].walkable) hopTo(d, bx, by);
}

function hopTo(d, tx, ty) {
  d.state = 'spit';
  d.stateTime = 0;
  d.aux = {
    sx: d.x, sy: d.y,
    ex: (tx + 0.5) * CELL, ey: (ty + 0.5) * CELL,
    ltx: tx, lty: ty,
  };
  d.ox = d.oy = 0;
  d.squeezeCd = 3;
  AudioSys.sfx('pokon');
  Particles.puff(d.x, d.y, 3, '#ffffff');
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
        d.stateTime += dt * Math.max(0.0001, Game.flow());
        const a = d.aux;
        const k = Math.min(1, d.stateTime / a.dur);
        d.x = lerp(a.sx, a.ex, k);
        d.y = lerp(a.sy, a.ey, k);
        d.z = (a.h || 100) * 4 * k * (1 - k);
        d.spin = k * TAU * (a.h > 150 ? 2 : 1);
        if (k >= 1) {
          d.spin = 0;
          d.z = 0;
          const nt = tileAt(a.ltx, a.lty);
          AudioSys.sfx('plop');
          d.sx = 1.25; d.sy = 0.75;   // 着地スカッシュ
          Particles.crumbs(d.x, d.y, 3);
          if (a.h > 150) { Render3D.shake(6); Particles.puff(d.x, d.y, 5, '#e8e0d8'); }   // 大砲の着弾
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

      case 'loaded': {   // 大砲のなかでチャージ
        d.stateTime += dt * Math.max(0.0001, Game.flow());
        if (d.stateTime >= 0.62) {
          const tile = d.aux.srcTile;
          const dir = tile.dir;
          const c = tileCenter(tile);
          d.hidden = false;
          d.state = 'jump';
          d.stateTime = 0;
          d.aux = {
            sx: c.x, sy: c.y,
            ex: c.x + DX[dir] * 4 * CELL, ey: c.y + DY[dir] * 4 * CELL,
            ltx: tile.x + DX[dir] * 4, lty: tile.y + DY[dir] * 4,
            dir, dur: 0.8, h: 190,
          };
          tile.fireT = 1;
          tile.pop = 1;
          AudioSys.sfx('boom');
          Render3D.shake(12);
          Render3D.flash(c.x + DX[dir] * 40, c.y + DY[dir] * 40, '#fff0c0', 190);
          Particles.puff(c.x + DX[dir] * 55, c.y + DY[dir] * 55, 8, '#e8e0d8');
        }
        break;
      }

      case 'sucked': {   // ブラックホールにうずまき吸引
        d.stateTime += dt;
        const k = Math.min(1, d.stateTime / 0.55);
        const a = d.aux;
        const r = a.r0 * (1 - k);
        const ang = a.a0 + k * 9;
        d.x = a.cx + Math.cos(ang) * r;
        d.y = a.cy + Math.sin(ang) * r;
        d.spin = ang;
        d.sx = d.sy = Math.max(0.03, (1 - k) * d.targetS);
        if (k >= 1) {
          const boxes = Game.tileList.filter(t => t.type === 'box');
          if (!boxes.length) { d.dead = true; break; }
          const box = pick(boxes);
          let feed = null, fdir = box.dir;
          for (let dd = 0; dd < 4; dd++) {
            const nt = tileAt(box.x + DX[dd], box.y + DY[dd]);
            if (nt && TILE_DEFS[nt.type].walkable && nt.dir === oppositeDir(dd)) {
              feed = nt; fdir = oppositeDir(dd); break;
            }
          }
          if (feed) { d.tx = feed.x; d.ty = feed.y; } else { d.tx = box.x; d.ty = box.y; }
          d.exitDir = fdir;
          d.entryDir = fdir;
          d.t = 0.5;
          d.centerFired = false;
          d.state = 'teleIn';
          d.stateTime = 0;
          d.spin = 0;
          donutWorldPos(d);
          Particles.puff(d.x, d.y, 3, '#d8c8f8');
          AudioSys.sfx('whoosh');
        }
        break;
      }

      case 'spit': {   // 「ぺっ」とはきだされる
        d.stateTime += dt;
        const k = Math.min(1, d.stateTime / 0.5);
        const a = d.aux;
        d.x = lerp(a.sx, a.ex, k);
        d.y = lerp(a.sy, a.ey, k);
        d.z = Math.sin(k * Math.PI) * 80;
        d.spin += dt * 10;
        if (k >= 1) {
          d.spin = 0; d.z = 0;
          const tile = tileAt(a.ltx, a.lty);
          if (tile && TILE_DEFS[tile.type].walkable) {
            d.state = 'belt';
            d.tx = a.ltx; d.ty = a.lty;
            d.t = 0.5;
            d.entryDir = tile.dir;
            d.exitDir = tile.dir;
            d.centerFired = true;
            d.sx = 1.2; d.sy = 0.8;
            AudioSys.sfx('plop');
          } else {
            startFall(d, randInt(0, 3));
          }
        }
        break;
      }

      case 'skyfall': {   // ドーナツのあめ
        const a = d.aux;
        a.vz += 1000 * dt;
        d.z -= a.vz * dt;
        d.spin += dt * 5;
        if (d.z <= 0) {
          d.z = 0; d.spin = 0;
          const tx2 = Math.floor(d.x / CELL), ty2 = Math.floor(d.y / CELL);
          const tile = tileAt(tx2, ty2);
          d.sx = 1.3; d.sy = 0.7;
          AudioSys.sfx('plop');
          Particles.crumbs(d.x, d.y, 3);
          if (tile && TILE_DEFS[tile.type].walkable) {
            d.state = 'belt';
            d.tx = tx2; d.ty = ty2;
            d.t = 0.5;
            d.entryDir = tile.dir;
            d.exitDir = tile.dir;
            d.centerFired = false;
          } else {
            d.state = 'fall';
            d.stateTime = 0.35;
            d.aux = { dir: randInt(0, 3) };
          }
        }
        break;
      }

      case 'pushed':
      case 'craned':
        d.stateTime += dt;
        if (d.stateTime > 7) startFall(d, randInt(0, 3));   // 保険
        break;

      case 'riding': {   // 2階建て: 下の子について行く
        const c = d.carrier;
        if (!c || c.dead || c.state !== 'belt') { dismountRider(d); break; }
        d.stateTime += dt;
        d.x += (c.x - d.x) * Math.min(1, dt * 14);
        d.y += (c.y - d.y) * Math.min(1, dt * 14);
        d.z += ((c.z + 40) - d.z) * Math.min(1, dt * 9);
        if (d.stateTime > 12) dismountRider(d);   // そろそろおりる
        break;
      }
    }
  }

  // ふれあい物理
  solveContacts(dt);
  settleContacts(dt);

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
    if (d.state !== 'belt' && d.state !== 'carried' && d.state !== 'riding') continue;
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

  // 0) ていでん中はどこをタップしても「しゅうり」
  if (Game.event && Game.event.type === 'blackout') {
    const ev = Game.event;
    ev.data.taps++;
    ev.data.restore = Math.min(1, ev.data.taps / 3);
    AudioSys.sfx('zap');
    Render3D.flash(w.x, w.y, '#fff6b8', 160);
    Particles.sparkle(w.x, w.y, 8, '#fff6b8');
    if (ev.data.taps >= 3) endEvent();
    Game.pointers.set(e.pointerId, { kind: 'tap' });
    return;
  }

  // 0.5) かみなりぐもをタップ → らくらい！
  if (Game.cloud && dist2(w.x, w.y, Game.cloud.x, Game.cloud.y) < 90 * 90) {
    strikeLightning();
    Game.pointers.set(e.pointerId, { kind: 'tap' });
    return;
  }

  // 1) ドーナツをつかむ
  const d = hitDonut(w.x, w.y);
  if (d) {
    // 2階建ての子をつまんだら／下の子をつまんだら、そっとほどく
    if (d.carrier) { d.carrier.rider = null; d.carrier = null; }
    if (d.rider) dismountRider(d.rider);
    d.state = 'carried';
    d.stopped = false;
    d.targetS = 1.18;
    d.spin = 0;
    d.ox = d.oy = 0;
    Game.pointers.set(e.pointerId, { kind: 'grab', donut: d });
    AudioSys.sfx('boing');
    Particles.hearts(d.x, d.y, 3);
    try { Game.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    return;
  }

  // 2) タイルをタップ（じぶんで置いたものは長押しで撤去）
  const tx = Math.floor(w.x / CELL), ty = Math.floor(w.y / CELL);
  const tile = tileAt(tx, ty);
  if (tile) {
    const def = TILE_DEFS[tile.type];
    if (def.onTap) {
      def.onTap(tile, Game, w.x, w.y);
      const rec = { kind: 'tap', sx: e.clientX, sy: e.clientY };
      if (tile.userPlaced) {
        rec.lpTimer = setTimeout(() => {
          if (Game.pointers.get(e.pointerId) === rec) removeUserTile(tile);
        }, 650);
      }
      Game.pointers.set(e.pointerId, rec);
      return;
    }
  }

  // 3) なにもないところ → えらんだ装置を「ぽこっ」と設置！
  if (placeUserTile(tx, ty)) {
    Game.pointers.set(e.pointerId, { kind: 'placed' });
    return;
  }
  Particles.sparkle(w.x, w.y, 6, '#ffffff');
  AudioSys.sfx('tick');
  Game.pointers.set(e.pointerId, { kind: 'tap' });
}

function onPointerMove(e) {
  const p = Game.pointers.get(e.pointerId);
  if (!p) return;
  // 長押し判定：ゆびが大きく動いたらキャンセル
  if (p.kind === 'tap') {
    if (p.lpTimer !== undefined && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 18) {
      clearTimeout(p.lpTimer);
      p.lpTimer = undefined;
    }
    return;
  }
  if (p.kind !== 'grab') return;
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
  if (p && p.lpTimer !== undefined) clearTimeout(p.lpTimer);
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
    Render3D.punch(0.5);
    Render3D.shake(6);
    Game.noteTinker();
  });

  btnTurbo.addEventListener('click', () => {
    AudioSys.ensure();
    Game.speed = Game.speed === 1 ? 2.1 : 1;
    btnTurbo.textContent = Game.speed === 1 ? '🐢' : '🐇';
    AudioSys.sfx(Game.speed === 1 ? 'clunk' : 'slide');
    Game.noteTinker();
  });

  // ドーナツのあめボタン
  const btnDonutRain = document.getElementById('btn-donutrain');
  btnDonutRain.addEventListener('click', () => {
    AudioSys.ensure();
    if (Game.rainButtonCd > 0) return;
    Game.rainButtonCd = 7;
    Game.skyfallQueue = 20;
    Game.skyfallT = 0;
    AudioSys.sfx('fallWhistle');
    AudioSys.sfx('slide');
    showBanner('🍩', 'ドーナツの あめ〜！', 2600);
    Game.noteTinker();
  });

  // わたしのこうじょう：設置ブラシのパレット
  const palBtns = document.querySelectorAll('.pal-btn');
  palBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      AudioSys.ensure();
      Game.brush = btn.dataset.brush;
      palBtns.forEach(b => b.classList.toggle('selected', b === btn));
      AudioSys.sfx('pop');
      Game.noteTinker();
    });
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
    updateEvents(dt);
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
