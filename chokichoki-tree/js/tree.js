'use strict';

/*
 * 木の成長・剪定モデル。
 * - 木は「枝」の集まり。枝は点列で、先端が少しずつ伸びる
 * - 枝が目標の長さに達すると2本に分岐する
 * - のびる量は「エネルギー」を消費する。エネルギーはゆっくり回復するし、
 *   枝を切ると一部が戻ってくるので、4歳児が詰むことはない
 * - 切り株はしばらくすると、太陽のほうへ新しい芽を出す
 *   （「切ると、のこりが太陽へむかう」という Prune の気持ちよさの簡略版）
 */

function createTree(opts) {
  const T = {
    branches: [],
    energy: 0,
    energyCap: 0,
    planted: false,
    opts,
  };

  const MAX_DEPTH = 7;
  const MAX_BRANCHES = 380;

  function step() { return opts.s() * 0.009; }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function newBranch(parent, x, y, angle, depth, targetLen) {
    const b = {
      parent,
      pts: [{ x, y }],
      angle,
      curv: (Math.random() - 0.5) * 0.05,
      depth,
      len: 0,
      carry: 0,
      targetLen,
      state: 'growing', // growing | done | stub | wilted | bloomed
      regrowAt: 0,
      children: [],
      flower: null,
      wiltT: 0,
    };
    T.branches.push(b);
    return b;
  }

  T.plant = function () {
    const s = opts.s();
    const seed = opts.seed();
    const sun = opts.sun();
    // 縦画面では太陽までの距離が min(W,H) より遠いことがあるので、
    // 木の寸法・速さ・体力は「種から太陽までの距離」を基準にする
    const dist = Math.hypot(sun.x - seed.x, sun.y - seed.y);
    T.speed = Math.max(s * 0.18, dist * 0.25);
    T.energyCap = Math.max(s * 14, dist * 9);
    T.energy = T.energyCap;
    const trunkLen = Math.max(s * 0.12, dist * 0.36) * (0.95 + Math.random() * 0.1);
    newBranch(null, seed.x, seed.y, -Math.PI / 2, 0, trunkLen);
    T.planted = true;
  };

  function splitBranch(b) {
    b.state = 'done';
    if (b.depth >= MAX_DEPTH || T.branches.length > MAX_BRANCHES) return;
    const tip = b.pts[b.pts.length - 1];
    const s = opts.s();
    const spread = 0.45 + Math.random() * 0.35;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const side = i === 0 ? -1 : 1;
      const a = b.angle + side * spread * (0.55 + Math.random() * 0.7);
      const tl = Math.max(s * 0.05, b.targetLen * 0.74 * (0.85 + Math.random() * 0.3));
      const c = newBranch(b, tip.x, tip.y, a, b.depth + 1, tl);
      b.children.push(c);
    }
    if (opts.onSplit) opts.onSplit(b);
  }

  function steer(b, tip) {
    const s = opts.s();
    const W = opts.W(), H = opts.H();
    const groundY = opts.groundY();
    // 地面に向かいそうなら上へ
    if (tip.y > groundY - s * 0.04 && Math.sin(b.angle) > -0.2) {
      b.angle = lerpAngle(b.angle, -Math.PI / 2, 0.35);
    }
    // 画面の外に出そうなら中央へ
    const m = s * 0.04;
    if (tip.x < m || tip.x > W - m || tip.y < m) {
      const back = Math.atan2(H * 0.45 - tip.y, W * 0.5 - tip.x);
      b.angle = lerpAngle(b.angle, back, 0.22);
    }
  }

  function addPoint(b) {
    const st = step();
    b.angle += b.curv + (Math.random() - 0.5) * 0.09;
    const tip = b.pts[b.pts.length - 1];
    steer(b, tip);
    const nx = tip.x + Math.cos(b.angle) * st;
    const ny = tip.y + Math.sin(b.angle) * st;
    b.pts.push({ x: nx, y: ny });
    b.len += st;

    // 太陽のひかりのなか？ → 花がさく
    const sun = opts.sun();
    const dxs = nx - sun.x, dys = ny - sun.y;
    if (dxs * dxs + dys * dys < sun.r * sun.r) {
      b.state = 'bloomed';
      b.flower = {
        x: nx, y: ny, t: 0,
        size: opts.s() * (0.028 + Math.random() * 0.012),
        colorIdx: Math.floor(Math.random() * 2),
        rot: Math.random() * Math.PI * 2,
      };
      if (opts.onBloom) opts.onBloom(b);
      return;
    }

    // 雲のかげ？ → しょんぼりして止まる
    for (const c of opts.clouds()) {
      const dxc = nx - c.x, dyc = ny - c.y;
      if (dxc * dxc + dyc * dyc < c.r * c.r) {
        b.state = 'wilted';
        if (opts.onWilt) opts.onWilt(b);
        return;
      }
    }

    if (b.len >= b.targetLen) splitBranch(b);
  }

  T.update = function (dt, now) {
    if (!T.planted) return;
    const s = opts.s();
    // エネルギーはゆっくり回復（子どもが詰まないための保険）
    T.energy = Math.min(T.energyCap, T.energy + T.energyCap * 0.07 * dt);

    const speed = T.speed;
    for (const b of T.branches) {
      if (b.state === 'growing') {
        b.carry += speed * dt;
        const st = step();
        while (b.carry >= st && b.state === 'growing') {
          if (T.energy <= 0) { b.carry = 0; break; }
          b.carry -= st;
          T.energy -= st;
          addPoint(b);
        }
      } else if (b.state === 'stub' && now >= b.regrowAt) {
        // 切り株から、太陽のほうへ新しい芽
        b.state = 'done';
        if (T.branches.length <= MAX_BRANCHES) {
          const tip = b.pts[b.pts.length - 1];
          const sun = opts.sun();
          const d = Math.hypot(sun.x - tip.x, sun.y - tip.y);
          const a = Math.atan2(sun.y - tip.y, sun.x - tip.x) + (Math.random() - 0.5) * 0.9;
          const tl = Math.min(Math.max(s * 0.08, d * 0.3), s * 0.5);
          const c = newBranch(b, tip.x, tip.y, a,
            Math.min(b.depth + 1, MAX_DEPTH), tl);
          b.children.push(c);
        }
      } else if (b.state === 'wilted') {
        b.wiltT = Math.min(1, b.wiltT + dt * 2);
      }
      if (b.flower && b.flower.t < 1) {
        b.flower.t = Math.min(1, b.flower.t + dt * 2.2);
      }
    }
  };

  /* 指のスワイプ線分 (ax,ay)-(bx,by) にふれた枝を探す */
  T.findCut = function (ax, ay, bx, by, hitR) {
    const abx = bx - ax, aby = by - ay;
    const abLen2 = abx * abx + aby * aby || 1e-6;
    const r2 = hitR * hitR;
    let best = null;
    for (const b of T.branches) {
      for (let i = 1; i < b.pts.length; i++) {
        const p = b.pts[i];
        let t = ((p.x - ax) * abx + (p.y - ay) * aby) / abLen2;
        t = Math.max(0, Math.min(1, t));
        const dx = p.x - (ax + abx * t);
        const dy = p.y - (ay + aby * t);
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 && (!best || d2 < best.d2)) {
          best = { branch: b, index: i, d2 };
        }
      }
    }
    return best;
  };

  function widthOf(b) {
    const s = opts.s();
    return Math.max(s * 0.004, s * 0.013 * Math.pow(0.82, b.depth));
  }
  T.widthOf = widthOf;

  /* 枝 b を index で切断。切り落とした部分のジオメトリを返す */
  T.cutAt = function (b, index, now) {
    const i = Math.max(1, index);
    const cutPt = { x: b.pts[i].x, y: b.pts[i].y };
    const polys = [];
    const flowers = [];
    let removedPts = 0;
    let bloomsLost = 0;

    const gone = new Set();
    (function collect(br, startIdx) {
      gone.add(br);
      const rel = [];
      for (let k = startIdx; k < br.pts.length; k++) {
        rel.push({ x: br.pts[k].x - cutPt.x, y: br.pts[k].y - cutPt.y });
      }
      removedPts += Math.max(0, br.pts.length - startIdx);
      if (rel.length >= 2) polys.push({ pts: rel, w: widthOf(br) });
      if (br.flower) {
        flowers.push({
          x: br.flower.x - cutPt.x, y: br.flower.y - cutPt.y,
          size: br.flower.size, colorIdx: br.flower.colorIdx, rot: br.flower.rot,
        });
        if (br.state === 'bloomed') bloomsLost++;
      }
      for (const c of br.children) collect(c, 0);
    })(b, i);

    // 木側の後始末：b は切り株になり、子孫は消える
    b.pts = b.pts.slice(0, i + 1);
    b.len = (b.pts.length - 1) * step();
    b.children = [];
    b.flower = null;
    b.state = 'stub';
    b.regrowAt = now + 0.7 + Math.random() * 0.4;
    T.branches = T.branches.filter((x) => x === b || !gone.has(x));

    // 切ったぶんのエネルギーが少し戻る
    T.energy = Math.min(T.energyCap, T.energy + removedPts * step() * 0.6);

    return { cutPt, polys, flowers, bloomsLost };
  };

  /* 花がまだ増やせる見込みがあるか（ヒント表示用） */
  T.anyGrowing = function () {
    return T.branches.some((b) => b.state === 'growing' || b.state === 'stub');
  };

  /* 先端たちのだいたいの中心（ヒントの指の位置に使う） */
  T.tipCenter = function () {
    let sx = 0, sy = 0, n = 0;
    for (const b of T.branches) {
      if (b.children.length === 0 && b.pts.length > 1) {
        const p = b.pts[b.pts.length - 1];
        sx += p.x; sy += p.y; n++;
      }
    }
    if (!n) return null;
    return { x: sx / n, y: sy / n };
  };

  /* 画面サイズが変わったとき、木の形をまるごと相似変形する */
  T.scaleWorld = function (fx, fy) {
    for (const b of T.branches) {
      for (const p of b.pts) { p.x *= fx; p.y *= fy; }
      if (b.flower) { b.flower.x *= fx; b.flower.y *= fy; }
      b.targetLen *= (fx + fy) / 2;
      b.len *= (fx + fy) / 2;
    }
    T.energy *= (fx + fy) / 2;
    T.energyCap *= (fx + fy) / 2;
    if (T.speed) T.speed *= (fx + fy) / 2;
  };

  return T;
}
