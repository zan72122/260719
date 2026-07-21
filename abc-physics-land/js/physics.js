/* =========================================================
 * physics.js — Matter.js の世界と「文字ボディ」ファクトリ
 *
 * 文字はただの絵ではなく物理オブジェクト:
 *  - 形: 丸い O は転がり、三角の A はどっしり座る
 *  - 重さ: インクの量で決まる (W は I の3倍以上重い)
 *  - 音: 衝突すると重さに応じた高さの音が鳴る
 *  - 個性: F はふわふわ、Z はジグザグ、S は超はずむ、
 *          小文字 i/j は点がはずれて鈴の音を鳴らす
 * ========================================================= */

const Phys = (() => {
  const { Engine, World, Bodies, Body, Composite, Events, Query, Constraint, Vector } = Matter;

  let engine = null;
  let walls = { floor: null, left: null, right: null, ceil: null };
  let letterBodies = [];   // 文字本体 (点は dots に)
  let dotBodies = [];      // i/j の点
  let touchLinks = new Map(); // touchId -> { constraint, body }
  let W = 0, H = 0, floorY = 0;
  let wallThick = 200;
  let ceilingOn = false;

  function init() {
    engine = Engine.create();
    engine.gravity.y = 1;
    engine.enableSleeping = false;

    Events.on(engine, 'collisionStart', onCollision);
    return engine;
  }

  function setBounds(width, height, { floorOffset = 0, ceiling = false } = {}) {
    W = width; H = height;
    floorY = height - floorOffset;
    ceilingOn = ceiling;
    for (const key of Object.keys(walls)) {
      if (walls[key]) { World.remove(engine.world, walls[key]); walls[key] = null; }
    }
    const opts = { isStatic: true, friction: 0.4, restitution: 0.2, label: 'wall' };
    walls.floor = Bodies.rectangle(W / 2, floorY + wallThick / 2, W * 3, wallThick, opts);
    walls.left = Bodies.rectangle(-wallThick / 2, H / 2, wallThick, H * 4, opts);
    walls.right = Bodies.rectangle(W + wallThick / 2, H / 2, wallThick, H * 4, opts);
    World.add(engine.world, [walls.floor, walls.left, walls.right]);
    if (ceiling) {
      walls.ceil = Bodies.rectangle(W / 2, -wallThick / 2, W * 3, wallThick, opts);
      World.add(engine.world, walls.ceil);
    }
  }

  /* ---------- 文字ボディの生成 ---------- */

  function makeLetterBody(ch, x, y, size, lower) {
    const info = window.GameData.LETTERS[ch.toUpperCase()];
    const glyph = lower ? ch.toLowerCase() : ch.toUpperCase();
    const s = size;
    const density = 0.0012 * info.ink;
    const common = {
      density,
      restitution: info.bounce,
      friction: info.shape === 'circle' ? 0.05 : 0.4,
      frictionAir: 0.012,
      label: 'letter',
    };

    let body;
    const w = info.narrow ? s * 0.38 : s * 0.78;
    const h = s;

    switch (info.shape) {
      case 'circle':
        body = Bodies.circle(x, y, s * 0.42, common);
        break;
      case 'tri': // A: 上がとがった三角形
        body = Bodies.fromVertices(x, y, [[
          { x: -s * 0.42, y: s * 0.5 },
          { x: s * 0.42, y: s * 0.5 },
          { x: 0, y: -s * 0.5 },
        ]], common, true);
        break;
      case 'vtri': // V: 逆三角形 (不安定でコロンと倒れる)
        body = Bodies.fromVertices(x, y, [[
          { x: -s * 0.42, y: -s * 0.5 },
          { x: s * 0.42, y: -s * 0.5 },
          { x: 0, y: s * 0.5 },
        ]], common, true);
        break;
      case 'T': { // T: 上の横棒 + 縦棒
        const bar = Bodies.rectangle(x, y - s * 0.38, s * 0.8, s * 0.24, common);
        const stem = Bodies.rectangle(x, y + 0.12 * s, s * 0.26, s * 0.76, common);
        body = Body.create({ parts: [bar, stem], ...common });
        break;
      }
      case 'L': { // L: 縦棒 + 下の横棒
        const stem = Bodies.rectangle(x - s * 0.18, y - s * 0.06, s * 0.26, s * 0.88, common);
        const base = Bodies.rectangle(x + s * 0.08, y + s * 0.38, s * 0.78, s * 0.24, common);
        body = Body.create({ parts: [stem, base], ...common });
        break;
      }
      case 'U': { // U: コップ型! 他の文字を受け止められる
        const lWall = Bodies.rectangle(x - s * 0.3, y - s * 0.05, s * 0.2, s * 0.9, common);
        const rWall = Bodies.rectangle(x + s * 0.3, y - s * 0.05, s * 0.2, s * 0.9, common);
        const bottom = Bodies.rectangle(x, y + s * 0.38, s * 0.8, s * 0.22, common);
        body = Body.create({ parts: [lWall, rWall, bottom], ...common });
        break;
      }
      default:
        body = Bodies.rectangle(x, y, w, h, { ...common, chamfer: { radius: s * 0.12 } });
    }

    // 合成ボディは重心が字面の中心とずれるので、描画用オフセットを記録
    body.game = {
      char: ch.toUpperCase(),
      glyph,
      color: info.color,
      size: s,
      squash: 1,
      squashV: 0,
      blinkAt: performance.now() + 1000 + Math.random() * 4000,
      blinking: 0,
      offsetX: x - body.position.x,
      offsetY: y - body.position.y,
      born: performance.now(),
      special: info.special,
      zigzagPhase: Math.random() * Math.PI * 2,
      mood: 'happy',
      moodUntil: 0,
    };
    return body;
  }

  function spawnLetter(ch, x, y, { size = 110, lower = false, maxCount = 40, vx = 0, vy = 0 } = {}) {
    const body = makeLetterBody(ch, x, y, size, lower);
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
    World.add(engine.world, body);
    letterBodies.push(body);

    // 小文字 i / j は点を別ボディとして落とす → はずれて転がり、鈴の音が鳴る
    const info = window.GameData.LETTERS[ch.toUpperCase()];
    if (lower && info.special === 'dot') {
      const dot = Bodies.circle(x + (ch.toUpperCase() === 'J' ? size * 0.06 : 0), y - size * 0.78, size * 0.11, {
        density: 0.0004,
        restitution: 0.75,
        friction: 0.05,
        frictionAir: 0.01,
        label: 'dot',
      });
      dot.game = { isDot: true, color: info.color, size: size * 0.11, lastChime: 0 };
      World.add(engine.world, dot);
      dotBodies.push(dot);
    }

    // 増えすぎたら古い文字からポンと消す
    while (letterBodies.length > maxCount) removeLetter(letterBodies[0], true);
    while (dotBodies.length > 14) {
      World.remove(engine.world, dotBodies[0]);
      dotBodies.shift();
    }
    return body;
  }

  function removeLetter(body, withPop = false) {
    const i = letterBodies.indexOf(body);
    if (i >= 0) letterBodies.splice(i, 1);
    for (const [id, link] of touchLinks) {
      if (link.body === body) {
        World.remove(engine.world, link.constraint);
        touchLinks.delete(id);
      }
    }
    World.remove(engine.world, body);
    if (withPop && body.game) {
      FX.burst(body.position.x, body.position.y, body.game.color, 10);
    }
  }

  function clearLetters(withPop = true) {
    for (const b of [...letterBodies]) removeLetter(b, withPop);
    for (const d of dotBodies) World.remove(engine.world, d);
    dotBodies = [];
  }

  /* ---------- 衝突 → 音 + むにっと潰れる ---------- */

  function onCollision(ev) {
    const now = performance.now();
    for (const pair of ev.pairs) {
      const a = pair.bodyA.parent || pair.bodyA;
      const b = pair.bodyB.parent || pair.bodyB;
      const speed = Math.hypot(
        (a.velocity ? a.velocity.x : 0) - (b.velocity ? b.velocity.x : 0),
        (a.velocity ? a.velocity.y : 0) - (b.velocity ? b.velocity.y : 0));
      if (speed < 2.2) continue;

      for (const body of [a, b]) {
        if (!body.game) continue;
        if (body.game.isDot) {
          // 「i の点はどんな音?」→ 鈴の音!
          if (now - body.game.lastChime > 250) {
            body.game.lastChime = now;
            Sound.fx.dotChime();
            FX.sparkle(body.position.x, body.position.y);
          }
        } else {
          if (now - (body.game.lastThud || 0) > 130) {
            body.game.lastThud = now;
            Sound.fx.thud(body.mass, Math.min(3, speed / 4));
            body.game.squashV = -Math.min(0.4, speed * 0.035);
            const isS = body.game.char === 'S' || body.game.char === 'B';
            if (isS && speed > 5) Sound.fx.boing();
          }
        }
      }
    }
  }

  /* ---------- 毎フレームの「個性」 ---------- */

  function tick(dt) {
    const now = performance.now();
    for (const body of letterBodies) {
      const g = body.game;

      // むにっと潰れて戻るバネアニメーション
      g.squashV += (1 - g.squash) * 0.25;
      g.squashV *= 0.8;
      g.squash += g.squashV;

      // まばたき
      if (now > g.blinkAt) {
        g.blinking = 1;
        g.blinkAt = now + 1500 + Math.random() * 4500;
      }
      if (g.blinking > 0) g.blinking = Math.max(0, g.blinking - dt * 0.008);

      // F: 羽のようにふわふわ落ちる
      if (g.special === 'floaty' && !isHeld(body)) {
        Body.applyForce(body, body.position,
          { x: Math.sin(now / 300 + g.zigzagPhase) * body.mass * 0.0006,
            y: -engine.gravity.y * body.mass * 0.00075 });
      }
      // Z: ジグザグに落ちる
      if (g.special === 'zigzag' && body.velocity.y > 1 && !isHeld(body)) {
        Body.applyForce(body, body.position,
          { x: Math.sin(now / 150) * body.mass * 0.0018, y: 0 });
      }
      // 転がる丸文字は時々コロコロ音
      if (body.circleRadius && Math.abs(body.angularVelocity) > 0.12 &&
          now - (g.lastRoll || 0) > 300 && Math.abs(body.velocity.y) < 1) {
        g.lastRoll = now;
        Sound.fx.roll();
      }
    }
    Engine.update(engine, Math.min(dt, 33));
  }

  /* ---------- マルチタッチドラッグ ---------- */

  function isHeld(body) {
    for (const link of touchLinks.values()) if (link.body === body) return true;
    return false;
  }

  function pointerDown(id, x, y) {
    const hits = Query.point([...letterBodies, ...dotBodies], { x, y });
    let body = hits.length ? (hits[0].parent || hits[0]) : null;
    // 当たり判定を少し甘く (子ども向け)
    if (!body) {
      let best = null, bestD = 55;
      for (const b of letterBodies) {
        const d = Math.hypot(b.position.x - x, b.position.y - y);
        if (d < bestD + (b.game ? b.game.size * 0.4 : 0)) { best = b; bestD = d; }
      }
      body = best;
    }
    if (!body || body.isStatic) return null;

    const constraint = Constraint.create({
      pointA: { x, y },
      bodyB: body,
      pointB: { x: x - body.position.x, y: y - body.position.y },
      stiffness: 0.12,
      damping: 0.12,
      length: 0,
    });
    World.add(engine.world, constraint);
    touchLinks.set(id, { constraint, body, moved: false, startX: x, startY: y });
    return body;
  }

  function pointerMove(id, x, y) {
    const link = touchLinks.get(id);
    if (!link) return;
    link.constraint.pointA.x = x;
    link.constraint.pointA.y = y;
    if (Math.hypot(x - link.startX, y - link.startY) > 14) link.moved = true;
  }

  function pointerUp(id) {
    const link = touchLinks.get(id);
    if (!link) return null;
    World.remove(engine.world, link.constraint);
    touchLinks.delete(id);
    return link; // { body, moved } — タップかドラッグかの判定に使う
  }

  function bodyAt(x, y) {
    const hits = Query.point([...letterBodies], { x, y });
    return hits.length ? (hits[0].parent || hits[0]) : null;
  }

  return {
    init, setBounds, spawnLetter, removeLetter, clearLetters, tick,
    pointerDown, pointerMove, pointerUp, bodyAt, isHeld,
    get engine() { return engine; },
    get letters() { return letterBodies; },
    get dots() { return dotBodies; },
    get floorY() { return floorY; },
    get width() { return W; },
    get height() { return H; },
  };
})();

window.Phys = Phys;
