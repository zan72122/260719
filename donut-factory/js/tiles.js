'use strict';
/* ============================================================
 * tiles.js — タイル（ベルト＆装置）の挙動定義
 *  3Dの見た目は render3d.js の TileView が担当する。
 *  ここには「何が起きるか」だけを書く。
 * ============================================================ */

const LANE_W = 64;
const TELE_COLORS = ['#b78cff', '#5cc8ff', '#7ce27c', '#ffb84d'];

// 2階建てなら「上の子」がデコられる
const topOf = d => d.rider || d;

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
    spawnAnim: 0,     // 設置時の「ぽこっ」
    userPlaced: false,
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
      // ベルトは 4方向を一周したら「ずぽん」と消える
      // （出現 → 右 → 下 → 左 → 消失 のトグル）
      // レベル元来のベルトを消すと、しゅうりロボがなおしに来る
      tile.tapCycle = (tile.tapCycle || 0) + 1;
      if (tile.tapCycle >= 4) {
        if (tile.userPlaced) removeUserTile(tile);
        else demolishOriginalBelt(tile);
        game.noteTinker();
        return;
      }
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
      const flow = game.flow ? game.flow() : game.speed;
      tile.timer -= dt * flow * (game.orderBoost || 1);
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
    onCenter(tile, donut, game) {
      if (donut.isVeggie) { game.spitDonut(donut, tile); return true; }   // やさいは「ぺっ」
      game.collectDonut(donut, tile);
      return true;
    },
    exitFor(tile) { return tile.dir; },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('giggle');
      const c = tileCenter(tile);
      Particles.hearts(c.x, c.y, 4);
    },
    update(tile, dt) {
      const before = tile.shipT;
      tile.shipT = Math.max(0, tile.shipT - dt * 0.7);
      // あたらしいトラックがバックしてくる間はピッピッと鳴る
      if (before > 0.55 && tile.shipT <= 0.55) AudioSys.sfx('beep');
    },
  },

  /* ---------------- フロスター（色がけ） ---------------- */
  froster: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      topOf(donut).setFrost(tile.color);
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
      topOf(donut).setSprinkles(tile.style);
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
      topOf(donut).setCream(true);
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
      topOf(donut).setTopper(tile.kind);
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
      topOf(donut).setGlaze(true);
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
      topOf(donut).setShape(tile.shape);
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
      topOf(donut).randomize();
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
  /* ---------------- のびちぢみプッシャー ---------------- */
  pusher: {
    walkable: false,
    interactive: true,
    onTap(tile, game) {
      // すぐに1回のばす
      const period = 4.2;
      const ph = (tile.cycleT || 0) % period;
      if (ph > 1.6) tile.cycleT += period - ph;
      tile.pop = 1;
      AudioSys.sfx('clunk');
      game.noteTinker();
    },
    update(tile, dt, game) {
      const flow = game.flow();
      tile.cycleT = (tile.cycleT || 0) + dt * flow;
      const ph = tile.cycleT % 4.2;
      const MAXE = 2.2;   // 2マスさきのレーンに確実にとどく長さ
      let ext = 0;
      if (ph < 0.5) ext = easeOutCubic(ph / 0.5) * MAXE;
      else if (ph < 0.85) ext = MAXE;
      else if (ph < 1.6) ext = MAXE * (1 - easeOutCubic((ph - 0.85) / 0.75));
      const prev = tile.ext || 0;
      if (prev < MAXE - 0.1 && ext >= MAXE - 0.1) { AudioSys.sfx('clunk'); Render3D.shake(4); }
      tile.ext = ext;
      const c = tileCenter(tile);
      const dx = DX[tile.dir], dy = DY[tile.dir];
      const extending = ext > prev;
      if (ext > 0.05 && extending) {
        const tip = (0.5 + ext) * CELL;
        for (const d of game.donuts) {
          if (d.state !== 'belt' && d.state !== 'pushed') continue;
          const rx = d.x - c.x, ry = d.y - c.y;
          const along = rx * dx + ry * dy;
          const perp = Math.abs(-rx * dy + ry * dx);
          if (along > 0.3 * CELL && along < tip + 32 && perp < 46) {
            if (d.state !== 'pushed') { d.sx = 1.25; d.sy = 0.75; AudioSys.sfx('boing'); }
            d.state = 'pushed';
            d.stateTime = 0;
            d.aux = { srcTile: tile };
            d.x = c.x + dx * (tip + 28);
            d.y = c.y + dy * (tip + 28);
            d.z = 0;
          }
        }
      }
      // ちぢみはじめたら、押していたドーナツをはなす
      if (!extending || ext <= 0.05) {
        for (const d of game.donuts) {
          if (d.state === 'pushed' && d.aux.srcTile === tile) game.releasePushed(d);
        }
      }
    },
  },

  /* ---------------- ロングアームクレーン ---------------- */
  crane: {
    walkable: false,
    interactive: true,
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('clunk');
      game.noteTinker();
    },
    update(tile, dt, game) {
      const flow = Math.max(0, game.flow());
      if (!tile.craneState) { tile.craneState = 'idle'; tile.craneK = 0; tile.craneReach = CELL; tile.craneZ = 60; tile.cool = 1; }
      const step = dt * flow;
      const c = tileCenter(tile);
      const dx = DX[tile.dir], dy = DY[tile.dir];
      const d = tile.held;
      const setDonut = (r, z) => {
        if (!d) return;
        d.x = c.x + dx * r;
        d.y = c.y + dy * r;
        d.z = z;
      };
      switch (tile.craneState) {
        case 'idle': {
          tile.cool -= step;
          tile.craneReach += (CELL - tile.craneReach) * Math.min(1, dt * 4);
          tile.craneZ = 60 + Math.sin(game.time * 2 + tile.x) * 8;
          if (tile.cool <= 0) {
            const px = tile.x + dx, py = tile.y + dy;
            const cand = game.donuts.find(dd =>
              dd.state === 'belt' && dd.tx === px && dd.ty === py && Math.abs(dd.t - 0.5) < 0.28);
            if (cand) {
              tile.held = cand;
              cand.state = 'craned';
              cand.stateTime = 0;
              cand.aux = { srcTile: tile };
              tile.craneState = 'lift';
              tile.craneK = 0;
              AudioSys.sfx('clunk');
            }
          }
          break;
        }
        case 'lift':
          tile.craneK += step / 0.35;
          setDonut(CELL, Math.min(1, tile.craneK) * 95);
          tile.craneReach = CELL;
          tile.craneZ = Math.min(1, tile.craneK) * 95;
          if (tile.craneK >= 1) { tile.craneState = 'swing'; tile.craneK = 0; AudioSys.sfx('whoosh'); }
          break;
        case 'swing': {
          tile.craneK += step / 0.7;
          const k = Math.min(1, tile.craneK);
          const r = lerp(CELL, 3 * CELL, easeOutCubic(k));
          setDonut(r, 95 + Math.sin(k * Math.PI) * 25);
          tile.craneReach = r;
          tile.craneZ = 95;
          if (tile.craneK >= 1) { tile.craneState = 'lower'; tile.craneK = 0; }
          break;
        }
        case 'lower': {
          tile.craneK += step / 0.3;
          const k = Math.min(1, tile.craneK);
          setDonut(3 * CELL, 95 * (1 - k));
          tile.craneReach = 3 * CELL;
          tile.craneZ = 95 * (1 - k);
          if (tile.craneK >= 1) {
            if (d) game.releaseCraned(d, tile.x + dx * 3, tile.y + dy * 3);
            tile.held = null;
            tile.craneState = 'idle';
            tile.cool = 1.4;
            AudioSys.sfx('plop');
          }
          break;
        }
      }
      // つかんでいたドーナツが消えたらリセット
      if (tile.held && (tile.held.dead || tile.held.state !== 'craned')) {
        tile.held = null;
        tile.craneState = 'idle';
        tile.cool = 1;
      }
    },
  },

  /* ---------------- ブラックホール ---------------- */
  hole: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      tile.cool = tile.cool || 0;
      if (tile.cool > 0) return false;      // クールダウン中はそのまま通過
      tile.cool = 1.4;
      tile.pop = 1;
      game.suckDonut(donut, tile);
      return true;
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('slurp');
      const c = tileCenter(tile);
      Particles.sparkle(c.x, c.y, 10, '#b78cff');
      game.noteTinker();
    },
    update(tile, dt) { tile.cool = Math.max(0, (tile.cool || 0) - dt); },
  },

  /* ---------------- 大砲 ---------------- */
  cannon: {
    walkable: true,
    interactive: true,
    exitFor(tile) { return tile.dir; },
    onCenter(tile, donut, game) {
      game.loadCannon(donut, tile);
      return true;
    },
    onTap(tile, game) {
      tile.pop = 1;
      AudioSys.sfx('clunk');
      game.noteTinker();
    },
    update(tile, dt) {
      tile.chargeT = Math.max(0, (tile.chargeT || 0) - dt);
      tile.fireT = Math.max(0, (tile.fireT || 0) - dt * 2.2);
    },
  },

  /* ---------------- ドミノスイッチ ---------------- */
  domino: {
    walkable: false,
    interactive: true,
    priorityGuide: true,
    onTap(tile, game) {
      tile.pop = 1;
      game.startDominoWave(tile);
      game.noteTinker();
    },
  },

  /* ---------------- やさいスイッチ ---------------- */
  veggie: {
    walkable: false,
    interactive: true,
    priorityGuide: true,
    onTap(tile, game) {
      tile.pop = 1;
      game.toggleVeggie();
      game.noteTinker();
    },
  },

  /* ---------------- こうじょう反転レバー ---------------- */
  flip: {
    walkable: false,
    interactive: true,
    priorityGuide: true,
    onTap(tile, game) {
      tile.pop = 1;
      game.flipBoard();
      game.noteTinker();
    },
  },
};

/* ゲートで止めるべきか（game.js の移動処理から呼ばれる） */
function tileBlocksAt(tile, t) {
  return tile.type === 'gate' && !tile.open && t >= 0.30;
}
