'use strict';
/* ================= ゲーム本体 =================
   モード：puzzle（パズル40面）/ arcade（スコアアタック）/ zen（むげん） */

const Game = (() => {
  const world = new Physics.World();

  const G = {
    world,
    state: 'title',        // title | playing
    mode: 'puzzle',
    levelIdx: 0,
    level: null,
    tanks: {},             // 残りポンプ数（Infinity = 無限）
    tankOrder: [],
    selected: 'R',
    score: 0,
    pumpsUsed: 0,
    pumpsTotal: 0,
    goals: [],
    chain: 0,
    chainT: 0,
    cascadeMax: 0,
    wildThisCascade: false,
    paused: false,
    won: false,
    lost: false,
    stillT: 0,             // 手詰まり判定タイマー
    danger: 0,
    dangerT: 0,
    // アーケード
    spawnT: 0,
    urchinT: 0,
    // 演出
    endDelay: 0,
    tip: '',
    tipT: 0,
  };

  const pointers = new Map(); // pointerId -> {b, credit}
  const PUMP_INTERVAL = 0.5;  // 1ポンプで吹ける秒数
  let achCheckT = 0;
  let blupeCooldown = 0;
  let matchT = 0;

  const stats = () => Save.get().stats;

  /* ================= レベル開始 ================= */
  function setupCommon() {
    world.clear();
    Creatures.reset();
    Fx.clear();
    pointers.clear();
    G.score = 0; G.pumpsUsed = 0;
    G.chain = 0; G.chainT = 0; G.cascadeMax = 0; G.wildThisCascade = false;
    G.won = false; G.lost = false; G.paused = false;
    G.stillT = 0; G.endDelay = 0;
    G.danger = 0; G.dangerT = 0;
    G.tip = ''; G.tipT = 0;
  }

  function startPuzzle(idx) {
    setupCommon();
    G.state = 'playing';
    G.mode = 'puzzle';
    G.levelIdx = idx;
    G.level = Levels.LEVELS[idx];
    world.buoyancy = 0.55;
    world.currentAmp = 0.7;

    const built = Levels.build(G.level, world.bounds, world.R0);
    for (const s of built.bubbles) {
      world.addBubble(s.x, s.y, s.r, s.key, { critter: s.critter });
    }
    for (const hz of built.hazards) {
      if (hz.type === 'urchin') Creatures.addUrchin(hz.x, hz.y, hz.r);
      else Creatures.addCrab(hz.edge, 0.055);
    }
    sanitizeStart();

    G.tanks = {};
    G.tankOrder = [];
    let total = 0;
    for (const k of Colors.KEYS) {
      if (G.level.tanks[k]) { G.tanks[k] = G.level.tanks[k]; G.tankOrder.push(k); total += G.level.tanks[k]; }
    }
    G.pumpsTotal = total;
    G.selected = G.tankOrder[0];
    G.goals = G.level.goals.map(g => ({ def: g, prog: 0, done: false }));
    if (G.level.tip) { G.tip = G.level.tip; G.tipT = 12; }
    UI.enterGame();
  }

  function startArcade() {
    setupCommon();
    G.state = 'playing';
    G.mode = 'arcade';
    G.level = null;
    world.buoyancy = 0.75;
    world.currentAmp = 1;
    G.tanks = { R: Infinity, Y: Infinity, B: Infinity };
    G.tankOrder = ['R', 'Y', 'B'];
    G.selected = 'R';
    G.goals = [];
    G.spawnT = 1.2;
    G.urchinT = 45;
    // 初期配置
    const rnd = Util.rng(Date.now() % 100000);
    for (let i = 0; i < 10; i++) {
      const b = world.bounds;
      world.addBubble(
        b.x + b.w * (0.15 + rnd() * 0.7),
        b.y + b.h * (0.1 + rnd() * 0.4),
        world.R0 * (0.6 + rnd() * 0.5),
        Util.pick(['R', 'Y', 'B']));
    }
    sanitizeStart();
    G.tip = 'そこから 泡がわいてくる！あふれさせないで！';
    G.tipT = 6;
    UI.enterGame();
  }

  function startZen() {
    setupCommon();
    G.state = 'playing';
    G.mode = 'zen';
    G.level = null;
    world.buoyancy = 0.45;
    world.currentAmp = 1.1;
    G.tanks = { R: Infinity, Y: Infinity, B: Infinity, O: Infinity, G: Infinity, P: Infinity, W: Infinity };
    G.tankOrder = ['R', 'Y', 'B', 'O', 'G', 'P', 'W'];
    G.selected = 'B';
    G.goals = [];
    G.tip = 'すきなだけ ぶくぶくしよう。せいげんは なにもないよ';
    G.tipT = 6;
    setTimeout(() => Creatures.blupeSay('hello'), 2500);
    UI.enterGame();
  }

  function toTitle() {
    G.state = 'title';
    setupCommon();
    // タイトル画面の背景デモ泡
    world.buoyancy = 0.15;
    world.currentAmp = 1.6;
    const rnd = Util.rng(9999);
    for (let i = 0; i < 14; i++) {
      const b = world.bounds;
      world.addBubble(
        b.x + b.w * rnd(), b.y + b.h * (0.2 + rnd() * 0.7),
        world.R0 * (0.5 + rnd() * 0.7),
        Util.pick(['R', 'Y', 'B', 'G', 'P', 'O']));
    }
    UI.enterTitle();
  }

  /* 開始時に4こ以上の同色隣接があれば1こ色替えして事故ポップを防ぐ */
  function sanitizeStart() {
    const alt = ['R', 'Y', 'B', 'G', 'P', 'O'];
    for (let iter = 0; iter < 30; iter++) {
      world._buildContacts();
      const grp = findAnyGroup(4); // 開始と同時に勝手に割れる配置だけ崩す
      if (!grp) break;
      const target = grp.members.find(m => !m.wild && !m.critters.length) || grp.members.find(m => !m.wild);
      if (!target) break;
      for (const k of alt) {
        if (k === target.key) continue;
        target.comp = Colors.compOf(k);
        target.wild = false;
        target.key = k;
        world._buildContacts();
        if (!memberOfGroup(target, 4)) break;
      }
      target.flash = 0;
    }
    world.settle(60);
  }

  /* ================= マッチ判定 ================= */
  function adjacentSame(b, key) {
    return b.contacts.filter(c => !c.o.popping && (c.o.key === key || c.o.key === 'W'));
  }

  function collectGroup(seed, key) {
    const seen = new Set([seed.id]);
    const members = [seed];
    const queue = [seed];
    while (queue.length) {
      const cur = queue.pop();
      for (const c of cur.contacts) {
        const o = c.o;
        if (o.popping || seen.has(o.id)) continue;
        if (o.key === key || o.key === 'W') {
          seen.add(o.id); members.push(o); queue.push(o);
        }
      }
    }
    return members;
  }

  function findAnyGroup(minSize) {
    for (const b of world.bubbles) {
      if (b.popping || b.wild || b.key === 'X') continue;
      const members = collectGroup(b, b.key);
      if (members.length >= minSize && members.some(m => !m.wild)) {
        return { key: b.key, members };
      }
    }
    return null;
  }
  function memberOfGroup(b, minSize) {
    if (b.wild || b.key === 'X') return false;
    return collectGroup(b, b.key).length >= minSize;
  }

  function checkMatches() {
    if (G.state !== 'playing') return;
    const done = new Set();
    for (const b of world.bubbles) {
      if (b.popping || b.key === 'X' || b.wild || done.has(b.id)) continue;
      const members = collectGroup(b, b.key);
      for (const m of members) done.add(m.id);
      if (members.length >= 4) scheduleGroupPop(members, b.key);
    }
  }

  function scheduleGroupPop(members, key) {
    // チェイン更新
    if (G.chainT > 0) G.chain++;
    else { G.chain = 1; G.wildThisCascade = false; }
    G.chainT = 2.0;
    G.cascadeMax = Math.max(G.cascadeMax, G.chain);
    const st = stats();
    st.maxChain = Math.max(st.maxChain, G.chain);
    st.maxGroup = Math.max(st.maxGroup, members.length);

    // BFS順に時間差で割る
    members.sort((a, b) => Util.dist(a.x, a.y, members[0].x, members[0].y) - Util.dist(b.x, b.y, members[0].x, members[0].y));
    let i = 0;
    for (const m of members) {
      m.popping = true;
      m.popAt = world.time + 0.12 + i * 0.075;
      m.popIndex = i;
      m.popColorAs = key;
      m.popCause = 'match';
      m.groupSize = members.length;
      i++;
    }

    // 演出・ボーナス
    const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
    if (G.chain >= 2) {
      Fx.text(cx, cy - world.R0 * 1.6, `${G.chain} チェイン！`, { size: 20 + G.chain * 3, color: '#ffe37a' });
    }
    if (members.length >= 6) {
      Fx.praise(cx, cy - world.R0 * 0.4, Math.min(5, members.length - 4));
      G.score += 50 * members.length * G.chain;
    }
    if (members.length >= 10) Fx.confetti(world.bounds.w, world.bounds.h);
    // ワイルド報酬（1カスケードに1回）
    if ((G.chain >= 3 || members.length >= 8) && !G.wildThisCascade && G.mode !== 'zen') {
      G.wildThisCascade = true;
      spawnWild();
    }
    if (G.chain >= 3 && blupeCooldown <= 0) {
      Creatures.blupeSay('chain');
      blupeCooldown = 40;
    }
  }

  function spawnWild() {
    const bd = world.bounds;
    const x = bd.x + bd.w * Util.rand(0.3, 0.7);
    const y = bd.y + bd.h * Util.rand(0.15, 0.3);
    const w = world.addBubble(x, y, world.R0 * 0.75, 'W');
    w.spawnT = 0;
    Fx.sparkle(x, y, world.R0 * 1.4, 16);
    Fx.text(x, y - world.R0, 'ワイルド！', { color: '#c8f4ff', size: 17 });
    AudioMan.chime(4);
    stats().wildsGot++;
  }

  /* ================= 破裂処理 ================= */
  function processPops() {
    for (let i = world.bubbles.length - 1; i >= 0; i--) {
      const b = world.bubbles[i];
      if (b.popping && world.time >= b.popAt) doPop(b);
    }
  }

  function doPop(b, cause) {
    cause = cause || b.popCause || 'match';
    world.removeBubble(b);
    // ポインタがこの泡を吹いていたら解除
    for (const [id, p] of pointers) {
      if (p.b === b) { AudioMan.inflateStop(id); pointers.delete(id); }
    }
    Fx.pop(b.x, b.y, b.r, b.key === 'W' ? 'B' : b.key);
    world.shock(b.x, b.y, b.r, cause === 'match' ? 1 : 0.6);
    if (cause === 'hazard') AudioMan.urchinPop();
    else AudioMan.pop(b.r / world.R0, cause === 'match' ? Math.min(b.popIndex + (G.chain - 1) * 2, 9) : 0);
    haptic(8);

    const st = stats();
    if (cause === 'match') {
      st.pops++;
      if (b.wild) st.wildsPopped++;
      const pts = Math.round(15 * (b.r / world.R0) * (b.r / world.R0)) * Math.max(1, G.chain);
      G.score += pts;
      if (G.mode !== 'zen') {
        Fx.text(b.x, b.y, `+${pts}`, { size: 13, color: '#ffffff', maxLife: 0.8 });
      }
      updateGoal('popAny', 1);
      if (!b.wild || b.popColorAs) updateGoal('popColor', 1, b.popColorAs || b.key);
      updateGoal('big', b.groupSize || 1);
    }
    // 生き物解放
    for (const cr of b.critters) {
      Creatures.free(cr, b.x, b.y, cause === 'hazard');
      st.rescued++;
      updateGoal('rescue', 1);
      if (cause === 'match') {
        G.score += 500;
        Fx.text(b.x, b.y - world.R0, 'レスキュー！ +500', { size: 15, color: '#baf5cf' });
      } else {
        Fx.text(b.x, b.y - world.R0, 'たすかった！', { size: 14, color: '#baf5cf' });
      }
      AudioMan.chime(2);
    }
  }

  /* ================= ゴール ================= */
  function updateGoal(type, amount, color) {
    if (G.mode !== 'puzzle') return;
    for (const g of G.goals) {
      if (g.done || g.def.type !== type) continue;
      if (type === 'popColor' && g.def.color !== color) continue;
      if (type === 'mix' && g.def.color !== color) continue;
      if (type === 'big') {
        if (amount >= g.def.n) { g.prog = g.def.n; g.done = true; goalDone(); }
        continue;
      }
      if (type === 'chain') {
        if (amount >= g.def.n) { g.prog = g.def.n; g.done = true; goalDone(); }
        continue;
      }
      g.prog += amount;
      if (g.prog >= (g.def.n || 1)) { g.prog = g.def.n || 1; g.done = true; goalDone(); }
    }
    UI.refreshGoals();
  }

  function goalDone() {
    AudioMan.chime(3);
  }

  function checkWinLose(dt) {
    if (G.mode !== 'puzzle' || G.won || G.lost) return;
    // clear ゴール
    for (const g of G.goals) {
      if (!g.done && g.def.type === 'clear' && world.bubbles.length === 0) {
        g.done = true; goalDone(); UI.refreshGoals();
      }
      if (!g.done && g.def.type === 'chain') {
        if (G.cascadeMax >= g.def.n) { g.done = true; g.prog = g.def.n; goalDone(); UI.refreshGoals(); }
      }
    }
    if (G.goals.every(g => g.done)) {
      G.won = true;
      G.endDelay = 1.1;
      return;
    }
    // 手詰まり判定：空気切れ＆場が静か
    const anyAir = G.tankOrder.some(k => G.tanks[k] > 0);
    const anyPopping = world.bubbles.some(b => b.popping);
    if (!anyAir && !anyPopping && pointers.size === 0) {
      G.stillT += dt;
      if (G.stillT > 2.2) {
        G.lost = true;
        G.endDelay = 0.6;
      }
    } else G.stillT = 0;
  }

  function finishLevel() {
    const d = Save.get();
    const par = G.level.par || 5;
    const stars = G.pumpsUsed <= par ? 3 : G.pumpsUsed <= Math.ceil(par * 1.7) ? 2 : 1;
    const prev = d.levels[G.levelIdx] || {};
    d.levels[G.levelIdx] = {
      stars: Math.max(prev.stars || 0, stars),
      bestPumps: Math.min(prev.bestPumps || 999, G.pumpsUsed),
    };
    if (stars === 3) d.stats.parClears++;
    if (G.pumpsUsed * 2 <= G.pumpsTotal) d.stats.noWasteClears++;
    Save.save();
    Achievements.check();
    AudioMan.fanfare();
    Fx.confetti(world.bounds.w, world.bounds.h);
    Creatures.blupeSay('clear');
    haptic([30, 60, 30]);
    UI.showClear(stars, G.pumpsUsed, par);
  }

  function failLevel() {
    AudioMan.womp();
    Creatures.blupeSay('fail');
    UI.showFail();
  }

  /* ================= 入力（膨らまし） ================= */
  function consumePump() {
    const t = G.tanks[G.selected];
    if (t === undefined || t <= 0) return false;
    if (t !== Infinity) G.tanks[G.selected] = t - 1;
    G.pumpsUsed++;
    UI.refreshTanks();
    return true;
  }

  function tankRemaining() {
    return G.tanks[G.selected] === Infinity ? Infinity : (G.tanks[G.selected] || 0);
  }

  function pointerDown(id, x, y) {
    if (G.state !== 'playing' || G.paused || G.won || G.lost) return;
    const b = world.bubbleAt(x, y);
    if (b) {
      if (b.popping) return;
      if (tankRemaining() <= 0) { AudioMan.deny(); UI.shakeTank(); return; }
      if (!consumePump()) return;
      pointers.set(id, { b, credit: PUMP_INTERVAL });
      AudioMan.inflateStart(id);
    } else {
      // 空きスペース → 新しい泡を作る
      if (tankRemaining() <= 0) { AudioMan.deny(); UI.shakeTank(); return; }
      const bd = world.bounds;
      const nx = Util.clamp(x, bd.x + world.R0, bd.x + bd.w - world.R0);
      const ny = Util.clamp(y, bd.y + world.R0, bd.y + bd.h - world.R0);
      // ウニのそばには作れない
      for (const u of Creatures.urchins) {
        if (Util.dist(nx, ny, u.x, u.y) < u.r + world.R0 * 0.9) { AudioMan.deny(); return; }
      }
      if (!consumePump()) return;
      const nb = world.addBubble(nx, ny, world.R0 * 0.6, G.selected);
      nb.spawnT = 0;
      pointers.set(id, { b: nb, credit: PUMP_INTERVAL * 0.6 });
      AudioMan.inflateStart(id);
      haptic(5);
    }
  }

  function pointerMove(id, x, y) {
    // 押したまま指を動かしても同じ泡を吹き続ける（あそびやすさ優先）
  }

  function pointerUp(id) {
    if (pointers.has(id)) {
      AudioMan.inflateStop(id);
      pointers.delete(id);
    }
  }

  function updateInflation(dt) {
    const MERGE_R = world.R0 * 1.72;
    const POP_R = world.R0 * 2.15;
    const VOL_RATE = (world.R0 * world.R0 * 0.5) / PUMP_INTERVAL;

    for (const [id, p] of pointers) {
      const b = p.b;
      if (!b || b.popping || !world.bubbles.includes(b)) {
        AudioMan.inflateStop(id); pointers.delete(id); continue;
      }
      if (p.credit <= 0) {
        if (tankRemaining() > 0 && consumePump()) p.credit += PUMP_INTERVAL;
        else { AudioMan.inflateStop(id); pointers.delete(id); UI.shakeTank(); AudioMan.deny(); continue; }
      }
      p.credit -= dt;
      const change = world.inject(b, G.selected, VOL_RATE * dt);
      if (change) onColorChanged(change, b);

      // かべやぶり（合体）
      if (b.r >= MERGE_R) {
        let best = null, bestOv = 0;
        for (const c of b.contacts) {
          if (c.o.popping) continue;
          const ov = b.r + c.o.r - c.d;
          if (ov > bestOv) { bestOv = ov; best = c.o; }
        }
        if (best) {
          const beforeKey = best.key;
          const wasWild = best.wild;
          Fx.pop(b.x, b.y, b.r * 0.5, b.key === 'W' ? 'B' : b.key);
          world.merge(b, best);
          AudioMan.merge();
          haptic(12);
          const st = stats();
          st.merges++;
          updateGoal('merge', 1);
          if (best.key !== beforeKey && !wasWild) onColorChanged({ from: beforeKey, to: best.key }, best);
          p.b = best; // 合体先を吹き続ける
          if (best.r >= POP_R * 1.15) {
            best.popping = true; best.popAt = world.time + 0.05; best.popCause = 'burst';
          }
        } else if (b.r >= POP_R) {
          // 孤立したまま限界 → 自爆（空気のむだづかい）
          b.popping = true; b.popAt = world.time + 0.05; b.popCause = 'burst';
          Fx.text(b.x, b.y - b.r, 'パンク！', { size: 15, color: '#ffb8c2' });
        }
      }
    }
  }

  function onColorChanged(change, b) {
    const st = stats();
    if (change.to === 'O') { st.mixO++; updateGoal('mix', 1, 'O'); }
    if (change.to === 'G') { st.mixG++; updateGoal('mix', 1, 'G'); }
    if (change.to === 'P') { st.mixP++; updateGoal('mix', 1, 'P'); }
    if (change.to === 'X') {
      st.mudMade++;
      Fx.text(b.x, b.y - b.r, 'にごった…', { size: 14, color: '#c2b39c' });
      if (blupeCooldown <= 0) { Creatures.blupeSay('mud'); blupeCooldown = 60; }
    }
    if (change.from === 'X' && change.to !== 'X') {
      st.mudCleaned++;
      updateGoal('clean', 1);
      Fx.sparkle(b.x, b.y, b.r, 8);
      Fx.text(b.x, b.y - b.r, 'きれいになった！', { size: 14, color: '#fff6c9' });
    }
  }

  /* ================= 危険物 ================= */
  function updateHazards() {
    for (let i = world.bubbles.length - 1; i >= 0; i--) {
      const b = world.bubbles[i];
      if (b.popping) continue;
      const hz = Creatures.checkHazard(b);
      if (hz) {
        b.popCause = 'hazard';
        doPop(b, 'hazard');
      }
    }
  }

  /* ================= アーケード ================= */
  function updateArcade(dt) {
    const bd = world.bounds;
    const diff = Util.clamp(G.score / 12000, 0, 1);
    const interval = Util.lerp(3.0, 1.15, diff);
    G.spawnT -= dt;
    if (G.spawnT <= 0 && world.bubbles.length < 90) {
      G.spawnT = interval * Util.rand(0.75, 1.25);
      const colors = diff > 0.4 ? ['R', 'Y', 'B', 'O', 'G', 'P'] : ['R', 'Y', 'B'];
      const key = Util.pick(colors);
      const b = world.addBubble(
        bd.x + bd.w * Util.rand(0.1, 0.9),
        bd.y + bd.h - world.R0 * 0.7,
        world.R0 * Util.rand(0.55, 0.95),
        key,
        { critter: Math.random() < 0.05 ? { type: Util.pick(['fish', 'star', 'tako']) } : null });
      b.spawnT = 0;
    }
    // ウニ出現
    if (G.score > 2500) {
      G.urchinT -= dt;
      if (G.urchinT <= 0) {
        G.urchinT = Util.rand(35, 55);
        Creatures.addUrchin(bd.x + bd.w * Util.rand(0.2, 0.8), bd.y + bd.h * 0.5, world.R0 * 1.0, true);
        Fx.text(bd.x + bd.w / 2, bd.y + bd.h * 0.3, 'ウニがきた！', { size: 18, color: '#ff8598' });
      }
    }
    // 危険度 = 泡の面積比
    G.danger = world.totalArea() / (bd.w * bd.h);
    if (G.danger > 0.58) {
      G.dangerT += dt;
      if (G.dangerT > 4 && !G.lost) {
        G.lost = true;
        const st = stats();
        st.arcadeBest = Math.max(st.arcadeBest, G.score);
        Save.save();
        Achievements.check();
        AudioMan.womp();
        UI.showArcadeOver(G.score, st.arcadeBest);
      }
    } else G.dangerT = Math.max(0, G.dangerT - dt * 2);
  }

  /* ================= メイン更新 ================= */
  function update(dt) {
    if (G.paused) return;
    world.step(dt);
    Creatures.update(dt);
    Fx.update(dt);
    blupeCooldown -= dt;
    if (G.tipT > 0) G.tipT -= dt;

    if (G.state === 'title') {
      // タイトルの泡をたまに補充
      if (world.bubbles.length < 12 && Math.random() < dt * 0.8) {
        const bd = world.bounds;
        world.addBubble(bd.x + bd.w * Math.random(), bd.y + bd.h + world.R0, world.R0 * Util.rand(0.4, 1.1),
          Util.pick(['R', 'Y', 'B', 'G', 'P', 'O']));
      }
      // 上に抜けた泡は消す
      for (let i = world.bubbles.length - 1; i >= 0; i--) {
        if (world.bubbles[i].y < world.bounds.y - world.R0 * 3) world.removeBubble(world.bubbles[i]);
      }
      return;
    }
    if (G.state !== 'playing') return;

    updateInflation(dt);
    updateHazards();

    matchT -= dt;
    if (matchT <= 0) { matchT = 0.12; checkMatches(); }
    processPops();

    G.chainT -= dt;
    if (G.chainT <= 0 && G.chain > 0) { G.chain = 0; }

    if (G.mode === 'arcade' && !G.lost) updateArcade(dt);
    if (G.mode === 'puzzle') checkWinLose(dt);

    if (G.endDelay > 0) {
      G.endDelay -= dt;
      if (G.endDelay <= 0) {
        if (G.won) finishLevel();
        else if (G.lost) failLevel();
      }
    }

    // 統計時間
    const st = stats();
    st.playSec += dt;
    if (G.mode === 'zen') {
      st.zenSec += dt;
      if (Math.random() < dt / 25 && !Creatures.blupeActive) Creatures.blupeSay('idle');
    }
    achCheckT -= dt;
    if (achCheckT <= 0) { achCheckT = 1.5; Achievements.check(); Save.save(); }

    UI.refreshHud();
  }

  function haptic(pat) {
    if (Save.get().settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(pat); } catch (e) {}
    }
  }

  function selectColor(k) {
    if (G.tanks[k] === undefined) return;
    G.selected = k;
    AudioMan.tick();
    UI.refreshTanks();
  }

  function restart() {
    if (G.mode === 'puzzle') startPuzzle(G.levelIdx);
    else if (G.mode === 'arcade') startArcade();
    else startZen();
  }

  function nextLevel() {
    if (G.levelIdx < Levels.LEVELS.length - 1) startPuzzle(G.levelIdx + 1);
    else toTitle();
  }

  /* むげんモード：ぜんぶまとめて流す（ごほうび花火） */
  function zenSweep() {
    let i = 0;
    const list = world.bubbles.filter(b => !b.popping);
    list.sort((a, b) => a.y - b.y);
    for (const b of list) {
      b.popping = true;
      b.popAt = world.time + 0.1 + i * 0.05;
      b.popIndex = Math.min(i, 9);
      b.popCause = 'burst';
      i++;
    }
    if (i > 8) Fx.confetti(world.bounds.w, world.bounds.h);
  }

  /* リサイズ時：スケール追従 */
  function onResize(ob, nb, oldR0, newR0) {
    const sx = nb.w / ob.w, sy = nb.h / ob.h, sr = newR0 / oldR0;
    for (const b of world.bubbles) {
      b.x = nb.x + (b.x - ob.x) * sx;
      b.y = nb.y + (b.y - ob.y) * sy;
      b.px = b.x; b.py = b.y;
      b.r *= sr;
    }
    for (const u of Creatures.urchins) {
      u.x = nb.x + (u.x - ob.x) * sx;
      u.y = nb.y + (u.y - ob.y) * sy;
      u.r *= sr;
    }
    world.settle(20);
  }

  return {
    G, world, update,
    startPuzzle, startArcade, startZen, toTitle, restart, nextLevel, zenSweep,
    pointerDown, pointerMove, pointerUp, selectColor, onResize,
  };
})();
