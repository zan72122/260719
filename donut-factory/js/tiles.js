'use strict';
/* ============================================================
 * tiles.js — タイル（ベルト＆装置）の挙動定義
 *  3Dの見た目は render3d.js の TileView が担当する。
 *  ここには「何が起きるか」だけを書く。
 * ============================================================ */

const LANE_W = 64;
const TELE_COLORS = ['#b78cff', '#5cc8ff', '#7ce27c', '#ffb84d'];

function makeTile(spec, x, y) {
  return Object.assign({
    x, y,
    dir: DIR_E,
    pop: 0,          // タップ/動作のバウンス
    rotAnim: 0,      // ベルト回転アニメ
    pressT: 0,       // スタンプのプレス
    flip: 0,         // スプリッターの切替
    idx: 0,          // スイッチャーの状態
    open: true,      // ゲート
    armT: 1,         // ゲートアームのアニメ位置
    paddleAnim: 0,
    spinAnim: 0,
    timer: 0,
    count: 0,
    shipT: 0,
    totalCount: 0,
  }, spec);
}

function tileCenter(tile) {
  return { x: (tile.x + 0.5) * CELL, y: (tile.y + 0.5) * CELL };
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
      Particles.hearts(c.x, c.y, 4);
    },
    update(tile, dt) { tile.shipT = Math.max(0, tile.shipT - dt); },
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
      Particles.splash(c.x, c.y, FROST_COLORS[tile.color].fill, 14);
      Render3D.shake(3);
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
        Particles.drizzle(c.x, c.y, pick(style.colors));
      }
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
      Particles.puff(c.x, c.y, 10, '#fffdf6');
      game.noteTinker();
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
      Particles.stars(c.x, c.y, 8);
      Particles.crumbs(c.x, c.y, 6);
      Particles.puff(c.x, c.y, 6, '#e6dcfa');
      Render3D.shake(14);                       // ズドン！
      Render3D.flash(c.x, c.y, '#ffffff', 150);
    },
    onTap(tile, game) {
      const i = SHAPE_CYCLE.indexOf(tile.shape);
      tile.shape = SHAPE_CYCLE[(i + 1) % SHAPE_CYCLE.length];
      tile.pressT = 1;
      tile.pop = 1;
      AudioSys.sfx('stamp');
      const c = tileCenter(tile);
      Particles.puff(c.x, c.y, 5, '#e6dcfa');
      Render3D.shake(8);
      game.noteTinker();
    },
    update(tile, dt) { tile.pressT = Math.max(0, tile.pressT - dt * 3); },
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
    update(tile, dt) { tile.paddleAnim = Math.max(0, tile.paddleAnim - dt * 4); },
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
    update(tile, dt) { tile.paddleAnim = Math.max(0, tile.paddleAnim - dt * 4); },
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
    update(tile, dt) { tile.spinAnim = Math.max(0, tile.spinAnim - dt * 1.6); },
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
    update(tile, dt) { tile.spinAnim = Math.max(0, tile.spinAnim - dt * 1.6); },
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
      const partner = game.findTelePartner(tile);
      if (partner) {
        const p = tileCenter(partner);
        Particles.sparkle(p.x, p.y, 12, TELE_COLORS[tile.pair % TELE_COLORS.length]);
        partner.pop = 1;
      }
      game.noteTinker();
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
      else Render3D.shake(5);                   // ガシャン！ととじる
      game.noteTinker();
    },
    update(tile, dt) {
      const target = tile.open ? 1 : 0;
      tile.armT += (target - tile.armT) * Math.min(1, dt * 10);
    },
  },
};

/* ゲートで止めるべきか（game.js の移動処理から呼ばれる） */
function tileBlocksAt(tile, t) {
  return tile.type === 'gate' && !tile.open && t >= 0.30;
}
