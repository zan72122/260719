'use strict';
/* ============================================================
 * tiles.js — タイル（ベルト＆装置）の定義・挙動・描画
 *
 * 描画は2パス:
 *   drawBase — ドーナツより下（レーン・台座・装置の足元）
 *   drawTop  — ドーナツより上（アーチ・バリア・プレス）
 * ============================================================ */

const LANE_W = 64;
const TELE_COLORS = ['#b78cff', '#5cc8ff', '#7ce27c', '#ffb84d'];
const _iconDonut = new Donut(0, 0, 0);   // トッパーのアイコン描画用

function makeTile(spec, x, y) {
  return Object.assign({
    x, y,
    dir: DIR_E,
    pop: 0,          // タップ/動作のバウンス
    flash: 0,        // 白フラッシュ
    rotAnim: 0,      // ベルト回転アニメ
    pressT: 0,       // スタンプのプレス
    flip: 0,         // スプリッターの切替
    idx: 0,          // スイッチャー/サイクル系の状態
    open: true,      // ゲート
    armT: 1,         // ゲートアームのアニメ位置
    timer: 0,
    count: 0,
    shipT: 0,
    totalCount: 0,
  }, spec);
}

/* ---------- 共通描画ヘルパー ---------- */

function tileCenter(tile) {
  return { x: (tile.x + 0.5) * CELL, y: (tile.y + 0.5) * CELL };
}

function withTile(ctx, tile, fn, rotate) {
  const c = tileCenter(tile);
  ctx.save();
  ctx.translate(c.x, c.y);
  const s = 1 + 0.14 * Math.sin(Math.min(1, tile.pop) * Math.PI);
  ctx.scale(s, s);
  if (rotate) ctx.rotate(DIR_ANGLE[tile.dir]);
  fn(ctx);
  ctx.restore();
}

// レーン（ベルト面）をタイル方向に沿って描く
function drawLane(ctx, tile, game) {
  withTile(ctx, tile, (c) => {
    const h = LANE_W;
    c.fillStyle = '#f6f1f8';
    roundRectPath(c, -CELL / 2, -h / 2, CELL, h, 8);
    c.fill();
    c.strokeStyle = '#dcd2e6';
    c.lineWidth = 3;
    c.stroke();
    // シェブロン（動く矢印）
    const phase = (game.beltPhase * CELL) % 34;
    c.save();
    c.beginPath();
    roundRectPath(c, -CELL / 2 + 2, -h / 2 + 2, CELL - 4, h - 4, 7);
    c.clip();
    c.strokeStyle = '#cfc2df';
    c.lineWidth = 7;
    c.lineCap = 'round';
    for (let i = -2; i < 3; i++) {
      const bx = i * 34 + phase - CELL / 2;
      c.beginPath();
      c.moveTo(bx - 9, -h * 0.26);
      c.lineTo(bx + 9, 0);
      c.lineTo(bx - 9, h * 0.26);
      c.stroke();
    }
    c.restore();
  }, true);
}

// 装置の台座プレート
function drawPlate(ctx, tile, color, edge) {
  withTile(ctx, tile, (c) => {
    c.fillStyle = color;
    roundRectPath(c, -CELL / 2 + 4, -CELL / 2 + 4, CELL - 8, CELL - 8, 16);
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 3.5;
    c.stroke();
  }, false);
}

// アーチ型装置の上バー（ドーナツの上を通る）
function drawArchTop(ctx, tile, color, edge, iconFn) {
  withTile(ctx, tile, (c) => {
    // 両脚
    c.fillStyle = edge;
    roundRectPath(c, -14, -LANE_W / 2 - 12, 28, 10, 4);
    c.fill();
    roundRectPath(c, -14, LANE_W / 2 + 2, 28, 10, 4);
    c.fill();
    // バー本体（レーンをまたぐ）
    c.fillStyle = color;
    roundRectPath(c, -20, -LANE_W / 2 - 6, 40, LANE_W + 12, 14);
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 3.5;
    c.stroke();
    if (iconFn) {
      c.save();
      c.rotate(-DIR_ANGLE[tile.dir]);   // アイコンは正立させる
      iconFn(c);
      c.restore();
    }
  }, true);
}

function drawMiniDonutIcon(c, x, y, r, frostColor) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#f4bd76';
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  if (frostColor) {
    c.fillStyle = frostColor;
    c.beginPath(); c.arc(0, 0, r * 0.78, 0, TAU); c.fill();
  }
  c.fillStyle = '#fff6ea';
  c.beginPath(); c.arc(0, 0, r * 0.34, 0, TAU); c.fill();
  c.restore();
}

/* ============================================================
 * タイル定義
 * ============================================================ */

const TILE_DEFS = {

  /* ---------------- ベルト ---------------- */
  belt: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onTap(tile, game) {
      tile.dir = rotateCW(tile.dir);
      tile.rotAnim = 1;
      tile.pop = 1;
      AudioSys.sfx('tick');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 5, '#d9c8ef');
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      if (tile.rotAnim > 0) {
        const c = tileCenter(tile);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.globalAlpha = tile.rotAnim * 0.9;
        ctx.rotate(DIR_ANGLE[tile.dir] - (1 - tile.rotAnim) * Math.PI / 2);
        ctx.strokeStyle = '#b28ae0';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-16, 0); ctx.lineTo(20, 0);
        ctx.moveTo(8, -12); ctx.lineTo(20, 0); ctx.lineTo(8, 12);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    },
    update(tile, dt) { tile.rotAnim = Math.max(0, tile.rotAnim - dt * 2.4); },
  },

  /* ---------------- スポナー（ドーナツのもと） ---------------- */
  spawner: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onTap(tile, game) {
      game.spawnFromSpawner(tile, true);
      tile.pop = 1;
    },
    update(tile, dt, game) {
      tile.timer -= dt * game.speed;
      if (tile.timer <= 0) {
        if (game.isTileClogged(tile)) { tile.timer = 0.5; return; }   // つまってたら待つ
        tile.timer = game.level.spawnEvery || 2.5;
        game.spawnFromSpawner(tile, false);
        tile.pop = Math.max(tile.pop, 0.7);
      }
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#ffe3ef', '#efb3d2');
      withTile(ctx, tile, (c) => {
        // しぼり袋型のマシン
        c.fillStyle = '#ff9ec7';
        c.beginPath();
        c.moveTo(-24, 8);
        c.quadraticCurveTo(-30, -30, 0, -32);
        c.quadraticCurveTo(30, -30, 24, 8);
        c.quadraticCurveTo(0, 20, -24, 8);
        c.fill();
        c.strokeStyle = '#e97cae';
        c.lineWidth = 3.5;
        c.stroke();
        // しぼり口
        c.fillStyle = '#ffd7e8';
        roundRectPath(c, -9, 8, 18, 14, 5);
        c.fill();
        c.stroke();
        // 顔（にっこり）
        c.fillStyle = '#7c4a63';
        c.beginPath(); c.arc(-9, -12, 3.2, 0, TAU); c.fill();
        c.beginPath(); c.arc(9, -12, 3.2, 0, TAU); c.fill();
        c.strokeStyle = '#7c4a63';
        c.lineWidth = 3;
        c.lineCap = 'round';
        c.beginPath(); c.arc(0, -8, 7, 0.25, Math.PI - 0.25); c.stroke();
      }, false);
    },
  },

  /* ---------------- ドーナツボックス（ゴール） ---------------- */
  box: {
    walkable: true,
    interactive: true,
    onCenter(tile, donut, game) { game.collectDonut(donut, tile); return true; },
    exitFor(tile) { return tile.dir; },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('giggle');
      const c = tileCenter(tile);
      Particles.hearts(c.x, c.y - 20, 4);
    },
    update(tile, dt) { tile.shipT = Math.max(0, tile.shipT - dt); },
    drawBase(ctx, tile, game, time) {
      drawPlate(ctx, tile, '#ffd9b0', '#e8a86a');
      withTile(ctx, tile, (c) => {
        const shipK = tile.shipT > 0 ? easeOutBack(1 - tile.shipT) : 1;
        c.scale(shipK, shipK);
        // 箱
        c.fillStyle = '#ff9ec7';
        roundRectPath(c, -34, -30, 68, 60, 10);
        c.fill();
        c.strokeStyle = '#e97cae';
        c.lineWidth = 3.5;
        c.stroke();
        // フタの開いた内側
        c.fillStyle = '#fff0f7';
        roundRectPath(c, -27, -23, 54, 46, 7);
        c.fill();
        // 中のドーナツ（たまった数に応じてちら見え）
        const n = Math.min(3, tile.count);
        for (let i = 0; i < n; i++) {
          drawMiniDonutIcon(c, -14 + i * 14, 6, 9, ['#ff9ec7', '#8a5a3b', '#9edcff'][i]);
        }
        // リボン
        c.fillStyle = '#ff6f9c';
        roundRectPath(c, -34, -6, 68, 12, 4);
        c.fill();
        // カウント
        c.fillStyle = '#b2557f';
        c.font = 'bold 26px -apple-system, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.save();
        c.rotate(0);
        c.fillText(String(tile.count), 0, -14);
        c.restore();
      }, false);
    },
  },

  /* ---------------- フロスター（色がけ） ---------------- */
  froster: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setFrost(tile.color);
      tile.pop = 1;
      AudioSys.sfx('splat');
      const c = tileCenter(tile);
      Particles.splash(c.x, c.y, FROST_COLORS[tile.color].fill, 8);
    },
    onTap(tile, game) {
      const i = FROST_CYCLE.indexOf(tile.color);
      tile.color = FROST_CYCLE[(i + 1) % FROST_CYCLE.length];
      tile.pop = 1;
      AudioSys.sfx('pop');
      const c = tileCenter(tile);
      Particles.splash(c.x, c.y, FROST_COLORS[tile.color].fill, 12);
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#fdeef5', '#eab8d2');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      const col = FROST_COLORS[tile.color];
      drawArchTop(ctx, tile, col.fill, col.edge, (c) => {
        // タンク + したたり
        c.fillStyle = '#ffffff';
        c.globalAlpha = 0.4;
        roundRectPath(c, -13, -12, 26, 10, 4);
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = col.edge;
        for (let i = -1; i <= 1; i++) {
          const drip = 4 + Math.sin(time * 3 + i * 2 + tile.x) * 3;
          c.beginPath();
          c.ellipse(i * 11, 8 + drip * 0.4, 4, 5 + drip * 0.5, 0, 0, TAU);
          c.fill();
        }
      });
    },
  },

  /* ---------------- スプリンクラー ---------------- */
  sprinkler: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setSprinkles(tile.style);
      tile.pop = 1;
      AudioSys.sfx('shaker');
    },
    onTap(tile, game) {
      const i = SPRINKLE_CYCLE.indexOf(tile.style);
      tile.style = SPRINKLE_CYCLE[(i + 1) % SPRINKLE_CYCLE.length];
      tile.pop = 1;
      AudioSys.sfx('shaker');
      game.noteTinker();
    },
    update(tile, dt, game) {
      // ぱらぱらとスプリンクルが降る
      tile.timer -= dt;
      if (tile.timer <= 0) {
        tile.timer = 0.12;
        const c = tileCenter(tile);
        const style = SPRINKLE_STYLES[tile.style];
        Particles.spawn({
          kind: 'confetti',
          x: c.x + rand(-20, 20), y: c.y - 26,
          vx: rand(-12, 12), vy: rand(20, 70), g: 300,
          maxLife: 0.5, size: 6,
          color: pick(style.colors),
        });
      }
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#fef7e5', '#eddba8');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      drawArchTop(ctx, tile, '#ffe9b8', '#e8c56a', (c) => {
        const style = SPRINKLE_STYLES[tile.style];
        const shake = Math.sin(time * 10 + tile.x) * 2.5;
        c.save();
        c.rotate(shake * 0.03);
        c.fillStyle = '#fff';
        roundRectPath(c, -12, -14, 24, 22, 6);
        c.fill();
        c.strokeStyle = '#e8c56a';
        c.lineWidth = 2.5;
        c.stroke();
        for (let i = 0; i < 5; i++) {
          c.fillStyle = style.colors[i % style.colors.length];
          c.save();
          c.translate(-7 + (i % 3) * 7, -8 + Math.floor(i / 3) * 8);
          c.rotate(i * 1.1);
          roundRectPath(c, -3.4, -1.3, 6.8, 2.6, 1.3);
          c.fill();
          c.restore();
        }
        c.restore();
      });
    },
  },

  /* ---------------- クリーマー（ホイップ） ---------------- */
  creamer: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setCream(true);
      tile.pop = 1;
      AudioSys.sfx('pop');
      const c = tileCenter(tile);
      Particles.puff(c.x, c.y, 6, '#fffdf6');
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('pop');
      const c = tileCenter(tile);
      Particles.puff(c.x, c.y - 20, 10, '#fffdf6');
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#f2fbff', '#bcdcec');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      drawArchTop(ctx, tile, '#dff2fb', '#a8cede', (c) => {
        // ソフトクリームぐるぐる
        c.fillStyle = '#fffdf6';
        c.strokeStyle = '#d8cdb4';
        c.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const w = 22 - i * 6;
          roundRectPath(c, -w / 2, -2 - i * 7, w, 7, 3.5);
          c.fill(); c.stroke();
        }
        c.beginPath();
        c.moveTo(-5, -23); c.quadraticCurveTo(0, -30, 3, -22);
        c.quadraticCurveTo(5, -20, -5, -23);
        c.fill(); c.stroke();
      });
    },
  },

  /* ---------------- トッパー（さくらんぼ等） ---------------- */
  topper: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setTopper(tile.kind);
      tile.pop = 1;
      AudioSys.sfx('pop');
    },
    onTap(tile, game) {
      const i = TOPPER_CYCLE.indexOf(tile.kind);
      tile.kind = TOPPER_CYCLE[(i + 1) % TOPPER_CYCLE.length];
      tile.pop = 1;
      AudioSys.sfx('pop');
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#ffeef0', '#efb8c0');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      drawArchTop(ctx, tile, '#ffd7dc', '#e898a5', (c) => {
        c.save();
        c.translate(0, -2);
        c.scale(1.5, 1.5);
        _iconDonut._drawTopper(c, tile.kind, 2 / 1.5);
        c.restore();
      });
    },
  },

  /* ---------------- グレーザー（つやつやの滝） ---------------- */
  glazer: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setGlaze(true);
      tile.pop = 1;
      AudioSys.sfx('splat');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 8, '#fff');
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('slide');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 14, '#ffffff');
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#fff8ec', '#e8d3a8');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      withTile(ctx, tile, (c) => {
        // グレーズの滝（半透明カーテン）
        const grd = c.createLinearGradient(0, -LANE_W / 2, 0, LANE_W / 2);
        grd.addColorStop(0, 'rgba(255, 236, 210, 0.95)');
        grd.addColorStop(1, 'rgba(255, 248, 235, 0.55)');
        c.fillStyle = grd;
        const wob = Math.sin(time * 4 + tile.y) * 3;
        c.beginPath();
        c.moveTo(-16 + wob, -LANE_W / 2 - 8);
        c.lineTo(16 + wob, -LANE_W / 2 - 8);
        c.lineTo(12, LANE_W / 2 + 4);
        c.quadraticCurveTo(0, LANE_W / 2 + 12, -12, LANE_W / 2 + 4);
        c.closePath();
        c.fill();
        // きらきら
        c.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 3; i++) {
          const yy = ((time * 60 + i * 40 + tile.x * 13) % (LANE_W + 20)) - LANE_W / 2 - 8;
          c.beginPath();
          c.arc(-6 + i * 7, yy, 2.6, 0, TAU);
          c.fill();
        }
      }, true);
      drawArchTop(ctx, tile, '#ffeacb', '#e8c98a', (c) => {
        c.fillStyle = '#fff';
        c.font = 'bold 22px -apple-system, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('✨', 0, 0);
      });
    },
  },

  /* ---------------- スタンパー（かたち変え） ---------------- */
  stamper: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.setShape(tile.shape);
      tile.pressT = 1;
      tile.pop = 1;
      AudioSys.sfx('stamp');
      const c = tileCenter(tile);
      Particles.stars(c.x, c.y, 6);
      Particles.crumbs(c.x, c.y, 4);
    },
    onTap(tile, game) {
      const i = SHAPE_CYCLE.indexOf(tile.shape);
      tile.shape = SHAPE_CYCLE[(i + 1) % SHAPE_CYCLE.length];
      tile.pressT = 1;
      tile.pop = 1;
      AudioSys.sfx('stamp');
      game.noteTinker();
    },
    update(tile, dt) { tile.pressT = Math.max(0, tile.pressT - dt * 3); },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#f0eaff', '#c3aee8');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      withTile(ctx, tile, (c) => {
        const press = Math.sin(Math.min(1, tile.pressT) * Math.PI);
        const py = press * 10;
        // プレス機のヘッド
        c.fillStyle = '#c9b3ef';
        roundRectPath(c, -30, -34 + py, 60, 34, 10);
        c.fill();
        c.strokeStyle = '#a488d6';
        c.lineWidth = 3.5;
        c.stroke();
        // かたちの窓
        c.fillStyle = '#fff';
        c.beginPath();
        const R = 13;
        const shape = tile.shape;
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU;
          let r = R;
          if (shape === 'flower') r = R * (0.82 + 0.18 * Math.cos(6 * a));
          else if (shape === 'star') r = R * (0.78 + 0.22 * Math.cos(5 * (a + Math.PI / 2)));
          else if (shape === 'heart') r = R * (0.9 - 0.25 * Math.sin(a));
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) c.moveTo(x, y - 17 + py); else c.lineTo(x, y - 17 + py);
        }
        c.closePath();
        c.fill();
      }, false);
    },
  },

  /* ---------------- スプリッター（こうたいで分岐） ---------------- */
  splitter: {
    walkable: true,
    interactive: true,
    exitFor(tile) {
      const d = tile.outs[tile.flip];
      tile.flip = 1 - tile.flip;
      tile.paddleAnim = 1;
      AudioSys.sfx('tick');
      return d;
    },
    onTap(tile, game) {
      tile.flip = 1 - tile.flip;
      tile.paddleAnim = 1;
      tile.pop = 1;
      AudioSys.sfx('clunk');
      game.noteTinker();
    },
    update(tile, dt) { tile.paddleAnim = Math.max(0, (tile.paddleAnim || 0) - dt * 4); },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      // 出口2方向のミニレーン
      for (const d of tile.outs) {
        withTile(ctx, tile, (c) => {
          c.rotate(DIR_ANGLE[d]);
          c.fillStyle = '#f6f1f8';
          roundRectPath(c, 0, -LANE_W / 2, CELL / 2, LANE_W, 8);
          c.fill();
          c.strokeStyle = '#dcd2e6';
          c.lineWidth = 3;
          c.stroke();
        }, false);
      }
      drawPlate(ctx, tile, '#eaf6ff', '#a9cfe8');
      withTile(ctx, tile, (c) => {
        // ゆびさきパドル（次の行き先を指す）
        const target = DIR_ANGLE[tile.outs[tile.flip]];
        const wig = Math.sin((tile.paddleAnim || 0) * Math.PI) * 0.5;
        c.rotate(target + wig);
        c.fillStyle = '#5cabdf';
        c.beginPath();
        c.moveTo(-12, -14);
        c.lineTo(26, 0);
        c.lineTo(-12, 14);
        c.quadraticCurveTo(-20, 0, -12, -14);
        c.fill();
        c.strokeStyle = '#3d84b5';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(-6, 0, 4.5, 0, TAU); c.fill();
      }, false);
    },
  },

  /* ---------------- スイッチャー（タップで行き先を変える） ---------------- */
  switcher: {
    walkable: true,
    interactive: true,
    priorityGuide: true,
    exitFor(tile) { return tile.outs[tile.idx]; },
    onTap(tile, game) {
      tile.idx = (tile.idx + 1) % tile.outs.length;
      tile.pop = 1;
      tile.paddleAnim = 1;
      AudioSys.sfx('clunk');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 6, '#ffd94d');
      game.noteTinker();
    },
    update(tile, dt) { tile.paddleAnim = Math.max(0, (tile.paddleAnim || 0) - dt * 4); },
    drawBase(ctx, tile, game, time) {
      drawLane(ctx, tile, game);
      for (const d of tile.outs) {
        withTile(ctx, tile, (c) => {
          c.rotate(DIR_ANGLE[d]);
          c.fillStyle = '#f6f1f8';
          roundRectPath(c, 0, -LANE_W / 2, CELL / 2, LANE_W, 8);
          c.fill();
          c.strokeStyle = '#dcd2e6';
          c.lineWidth = 3;
          c.stroke();
        }, false);
      }
      drawPlate(ctx, tile, '#fff3d9', '#ecca7c');
      withTile(ctx, tile, (c) => {
        // おおきな矢印レバー
        const target = DIR_ANGLE[tile.outs[tile.idx]];
        const wig = Math.sin((tile.paddleAnim || 0) * Math.PI) * 0.6;
        const glow = 0.6 + 0.4 * Math.sin(time * 3);
        c.rotate(target + wig);
        c.shadowColor = `rgba(255, 200, 60, ${glow * 0.8})`;
        c.shadowBlur = 14;
        c.fillStyle = '#ffb840';
        c.beginPath();
        c.moveTo(-16, -10);
        c.lineTo(6, -10);
        c.lineTo(6, -20);
        c.lineTo(30, 0);
        c.lineTo(6, 20);
        c.lineTo(6, 10);
        c.lineTo(-16, 10);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = '#d68f1e';
        c.lineWidth = 3.5;
        c.stroke();
      }, false);
    },
  },

  /* ---------------- クローナー（ふえる！） ---------------- */
  cloner: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      game.cloneDonut(donut, tile);
      tile.pop = 1;
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('bigPop');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 10, '#aef2ae');
      game.noteTinker();
    },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      withTile(ctx, tile, (c) => {
        c.rotate(DIR_ANGLE[tile.side]);
        c.fillStyle = '#f6f1f8';
        roundRectPath(c, 0, -LANE_W / 2, CELL / 2, LANE_W, 8);
        c.fill();
        c.strokeStyle = '#dcd2e6';
        c.lineWidth = 3;
        c.stroke();
      }, false);
      drawPlate(ctx, tile, '#e9f9e9', '#a5d8a5');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      drawArchTop(ctx, tile, '#c9efc9', '#8ec98e', (c) => {
        drawMiniDonutIcon(c, -8, 0, 8, '#ff9ec7');
        drawMiniDonutIcon(c, 8, 0, 8, '#ff9ec7');
        c.fillStyle = '#3f8f3f';
        c.font = 'bold 16px -apple-system, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('×2', 0, 15);
      });
    },
  },

  /* ---------------- ランダマイザー（デコおまかせ） ---------------- */
  random: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      donut.randomize();
      tile.pop = 1;
      tile.spinAnim = 1;
      AudioSys.sfx('spin');
      const c = tileCenter(tile);
      Particles.confetti(c.x, c.y, 8);
    },
    onTap(tile, game) {
      tile.pop = 1;
      tile.spinAnim = 1;
      AudioSys.sfx('spin');
      game.noteTinker();
    },
    update(tile, dt) { tile.spinAnim = Math.max(0, (tile.spinAnim || 0) - dt * 1.6); },
    drawBase(ctx, tile, game) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#fdeaff', '#dba8e8');
      drawLane(ctx, tile, game);
    },
    drawTop(ctx, tile, game, time) {
      drawArchTop(ctx, tile, '#f3c9fb', '#cf8fdf', (c) => {
        c.save();
        c.rotate((tile.spinAnim || 0) * TAU * 2);
        c.fillStyle = '#8f3fa5';
        c.font = 'bold 30px -apple-system, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('?', 0, 1);
        c.restore();
      });
    },
  },

  /* ---------------- ワイルド（どっちにいくかわからない！） ---------------- */
  wild: {
    walkable: true,
    interactive: true,
    exitFor(tile, donut, game) {
      const back = oppositeDir(donut.entryDir);
      const options = [];
      for (let d = 0; d < 4; d++) {
        if (d === back) continue;
        const nt = game.tileAt(tile.x + DX[d], tile.y + DY[d]);
        if (nt && TILE_DEFS[nt.type].walkable) options.push(d);
      }
      tile.spinAnim = 1;
      AudioSys.sfx('zap');
      return options.length ? pick(options) : back;
    },
    onTap(tile, game) {
      tile.pop = 1;
      tile.spinAnim = 1;
      AudioSys.sfx('zap');
      game.noteTinker();
    },
    update(tile, dt) { tile.spinAnim = Math.max(0, (tile.spinAnim || 0) - dt * 1.6); },
    drawBase(ctx, tile, game, time) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#e8e5ff', '#a89ee8');
      withTile(ctx, tile, (c) => {
        c.rotate(time * 1.5 + (tile.spinAnim || 0) * 10);
        for (let d = 0; d < 4; d++) {
          c.save();
          c.rotate(d * Math.PI / 2);
          c.fillStyle = ['#ff9ec7', '#9edcff', '#a8d878', '#ffd94d'][d];
          c.beginPath();
          c.moveTo(10, -8); c.lineTo(26, 0); c.lineTo(10, 8);
          c.closePath();
          c.fill();
          c.restore();
        }
        c.rotate(-(time * 1.5 + (tile.spinAnim || 0) * 10));
        c.fillStyle = '#5f55b0';
        c.font = 'bold 26px -apple-system, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('?', 0, 1);
      }, false);
    },
  },

  /* ---------------- テレポーター ---------------- */
  tele: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      game.teleportDonut(donut, tile);
      return true;
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('whoosh');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 12, TELE_COLORS[tile.pair % TELE_COLORS.length]);
      // 相方もひかる
      const partner = game.findTelePartner(tile);
      if (partner) {
        const p = tileCenter(partner);
        Particles.sparkle(p.x, p.y, 12, TELE_COLORS[tile.pair % TELE_COLORS.length]);
        partner.pop = 1;
      }
      game.noteTinker();
    },
    drawBase(ctx, tile, game, time) {
      const col = TELE_COLORS[tile.pair % TELE_COLORS.length];
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#f3f0ff', col);
      withTile(ctx, tile, (c) => {
        // うずまきポータル
        c.strokeStyle = col;
        c.lineWidth = 6;
        c.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          const a0 = time * 2.2 + i * (TAU / 3);
          c.arc(0, 0, 12 + i * 8, a0, a0 + 3.6);
          c.stroke();
        }
        c.fillStyle = col;
        c.globalAlpha = 0.5 + 0.3 * Math.sin(time * 4);
        c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill();
        c.globalAlpha = 1;
      }, false);
    },
  },

  /* ---------------- ジャンプだい ---------------- */
  jump: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      game.startJump(donut, tile);
      tile.pop = 1;
      return true;
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('boing');
      game.noteTinker();
    },
    drawBase(ctx, tile, game, time) {
      drawLane(ctx, tile, game);
      drawPlate(ctx, tile, '#fff0e5', '#eab88a');
      withTile(ctx, tile, (c) => {
        const sq = 1 - 0.3 * Math.sin(Math.min(1, tile.pop) * Math.PI);
        // ばね
        c.strokeStyle = '#d6884a';
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const yy = 16 - i * 8 * sq;
          c.moveTo(-14, yy);
          c.lineTo(14, yy - 4 * sq);
        }
        c.stroke();
        // 発射だい
        c.fillStyle = '#ffb84d';
        roundRectPath(c, -24, -26 * sq - 6, 48, 12, 6);
        c.fill();
        c.strokeStyle = '#d68f1e';
        c.lineWidth = 3;
        c.stroke();
        // 矢印（とぶ方向）
        c.rotate(DIR_ANGLE[tile.dir]);
        c.fillStyle = 'rgba(214, 143, 30, 0.85)';
        c.beginPath();
        c.moveTo(26, -9); c.lineTo(40, 0); c.lineTo(26, 9);
        c.closePath();
        c.fill();
      }, false);
    },
  },

  /* ---------------- ゲート（とおせんぼ） ---------------- */
  gate: {
    walkable: true,
    interactive: true,
    priorityGuide: true,
    exitFor(tile) { return tile.dir; },
    onTap(tile, game) {
      tile.open = !tile.open;
      tile.pop = 1;
      AudioSys.sfx('clunk');
      if (tile.open) AudioSys.sfx('slide');
      game.noteTinker();
    },
    update(tile, dt) {
      const target = tile.open ? 1 : 0;
      tile.armT += (target - tile.armT) * Math.min(1, dt * 10);
    },
    drawBase(ctx, tile, game, time) {
      drawLane(ctx, tile, game);
      withTile(ctx, tile, (c) => {
        // しんごうき
        c.fillStyle = '#8f8fa5';
        roundRectPath(c, -LANE_W / 2 - 15, -14, 13, 28, 5);
        c.fill();
        c.fillStyle = tile.open ? '#57d957' : '#e5e5ee';
        c.beginPath(); c.arc(-LANE_W / 2 - 8.5, -6, 4.5, 0, TAU); c.fill();
        c.fillStyle = tile.open ? '#e5e5ee' : '#ff5c5c';
        c.beginPath(); c.arc(-LANE_W / 2 - 8.5, 7, 4.5, 0, TAU); c.fill();
      }, true);
    },
    drawTop(ctx, tile, game, time) {
      withTile(ctx, tile, (c) => {
        // バリアのうで（開くと持ち上がる）
        const k = tile.armT;
        c.translate(10, -LANE_W / 2 - 2);
        c.rotate(-k * 1.35 + Math.PI / 2);
        const grd = c.createLinearGradient(0, 0, LANE_W + 8, 0);
        for (let i = 0; i < 6; i++) {
          grd.addColorStop(i / 6, i % 2 === 0 ? '#ff6f6f' : '#ffffff');
          grd.addColorStop(Math.min(1, (i + 1) / 6 - 0.001), i % 2 === 0 ? '#ff6f6f' : '#ffffff');
        }
        c.fillStyle = grd;
        roundRectPath(c, -4, -6, LANE_W + 12, 12, 6);
        c.fill();
        c.strokeStyle = '#c94f4f';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = '#8f8fa5';
        c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
      }, true);
    },
  },
};

/* ゲートで止めるべきか（game.js の移動処理から呼ばれる） */
function tileBlocksAt(tile, t) {
  return tile.type === 'gate' && !tile.open && t >= 0.30;
}
