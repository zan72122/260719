/* =========================================================
 * drive.js — メインゲーム級「もじドライブ」
 *
 * 文字の線 = 道路網。車で走って郵便を届ける。
 *  - T の交差点は文字通り「T字路」、Y は「Y字路」、X は十字路
 *  - O は出口のない環状線、G は行き止まりの駐車場
 *  - 行き止まり = おうち。分かれ道に来ると車が止まり、
 *    光る矢印をタップして進む方向を選ぶ
 * コースターが「線の順番」なら、これは「線のつながり方」。
 * ========================================================= */

const Drive = (() => {
  const FONT = '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

  function arcE(cx, cy, rx, ry, a0, a1, steps = 20) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = (a0 + (a1 - a0) * (i / steps)) * Math.PI / 180;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }

  /* 道路網: 文字ごとの辺 (端点が一致する辺は自動で交差点になる)
   * 座標は 100x100 の箱, y 下向き */
  const ROADS = {
    A: [[[50, 4], [26, 52]], [[26, 52], [8, 96]], [[50, 4], [74, 52]], [[74, 52], [92, 96]], [[26, 52], [74, 52]]],
    B: [[[20, 4], [20, 50]], [[20, 50], [20, 96]],
        arcE(20, 27, 27, 23, -90, 90), arcE(20, 73, 31, 23, -90, 90)],
    C: [arcE(52, 50, 40, 42, -55, -305, 28)],
    D: [[[22, 4], [22, 96]], arcE(22, 50, 52, 46, -90, 90, 26)],
    E: [[[20, 8], [20, 50]], [[20, 50], [20, 92]], [[20, 8], [82, 8]], [[20, 50], [74, 50]], [[20, 92], [84, 92]]],
    F: [[[20, 8], [20, 50]], [[20, 50], [20, 94]], [[20, 8], [82, 8]], [[20, 50], [72, 50]]],
    G: [arcE(52, 50, 40, 42, -55, -330, 28), [[86.6, 71], [54, 71]]],
    H: [[[20, 4], [20, 50]], [[20, 50], [20, 96]], [[80, 4], [80, 50]], [[80, 50], [80, 96]], [[20, 50], [80, 50]]],
    I: [[[50, 6], [50, 50]], [[50, 50], [50, 94]]],
    J: [[[62, 6], [62, 62]], arcE(43, 62, 19, 25, 0, 180, 14)],
    K: [[[18, 4], [18, 50]], [[18, 50], [18, 96]], [[18, 50], [82, 6]], [[18, 50], [84, 96]]],
    L: [[[22, 6], [22, 88]], [[22, 88], [86, 88]]],
    M: [[[8, 96], [14, 8]], [[14, 8], [50, 80]], [[50, 80], [86, 8]], [[86, 8], [92, 96]]],
    N: [[[14, 96], [14, 8]], [[14, 8], [86, 92]], [[86, 92], [86, 6]]],
    O: [arcE(50, 50, 40, 44, -90, 90, 22), arcE(50, 50, 40, 44, 90, 270, 22)],
    P: [[[22, 4], [22, 52]], [[22, 52], [22, 96]], arcE(22, 28, 40, 24, -90, 90)],
    Q: [arcE(50, 46, 38, 40, -90, 58, 24), arcE(50, 46, 38, 40, 58, 270, 24), [[70, 80], [92, 98]]],
    R: [[[22, 4], [22, 52]], [[22, 52], [22, 96]], arcE(22, 28, 40, 24, -90, 90), [[22, 52], [88, 96]]],
    S: [[[78, 16], [62, 5], [38, 5], [24, 16], [26, 32], [44, 44], [62, 52], [76, 64], [76, 80], [60, 92], [36, 95], [20, 84]]],
    T: [[[8, 10], [50, 10]], [[50, 10], [92, 10]], [[50, 10], [50, 94]]],
    U: [[[16, 8], [16, 56]], arcE(50, 56, 34, 36, 180, 0, 18), [[84, 56], [84, 8]]],
    V: [[[8, 6], [50, 94]], [[50, 94], [92, 6]]],
    W: [[[4, 6], [26, 94]], [[26, 94], [50, 28]], [[50, 28], [74, 94]], [[74, 94], [96, 6]]],
    X: [[[50, 50], [10, 8]], [[50, 50], [90, 8]], [[50, 50], [10, 92]], [[50, 50], [90, 92]]],
    Y: [[[10, 8], [50, 46]], [[90, 8], [50, 46]], [[50, 46], [50, 94]]],
    Z: [[[10, 14], [88, 14]], [[88, 14], [14, 86]], [[14, 86], [92, 86]]],
  };

  // 交差点で最初に止まった時のひとこと (日常語の種明かし)
  const JUNCTION_TALK = { T: 'Look! A T road!', Y: 'A Y road!', X: 'Crossroads!' };
  const HOUSE_ANIMALS = ['🐻', '🐰', '🐱', '🐶', '🐷', '🐸', '🦊', '🐼'];

  /* ---------------- グラフ構築 ---------------- */

  let graph = null; // {nodes:[{x,y,ports:[{e,end}]}], edges:[{pts,len,cum,n0,n1}]}

  function buildGraph(ch, S, ox, oy) {
    const edges = ROADS[ch].map(raw => {
      const pts = raw.map(([x, y]) => ({ x: ox + x * S, y: oy + y * S }));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      return { pts, cum, len: cum[cum.length - 1], n0: -1, n1: -1 };
    });
    const nodes = [];
    const eps = 6 * S;
    const findNode = (p) => {
      for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) < eps) return i;
      }
      nodes.push({ x: p.x, y: p.y, ports: [] });
      return nodes.length - 1;
    };
    edges.forEach((e, ei) => {
      e.n0 = findNode(e.pts[0]);
      e.n1 = findNode(e.pts[e.pts.length - 1]);
      nodes[e.n0].ports.push({ e: ei, end: 0 });
      nodes[e.n1].ports.push({ e: ei, end: 1 });
    });
    return { nodes, edges };
  }

  // ノード間の最短距離 (小さなダイクストラ)
  function distances(startNode) {
    const dist = graph.nodes.map(() => Infinity);
    dist[startNode] = 0;
    const visited = graph.nodes.map(() => false);
    for (;;) {
      let u = -1, best = Infinity;
      dist.forEach((d, i) => { if (!visited[i] && d < best) { best = d; u = i; } });
      if (u < 0) break;
      visited[u] = true;
      for (const port of graph.nodes[u].ports) {
        const e = graph.edges[port.e];
        const v = port.end === 0 ? e.n1 : e.n0;
        if (dist[u] + e.len < dist[v]) dist[v] = dist[u] + e.len;
      }
    }
    return dist;
  }

  function edgePoint(e, s) {
    const edge = graph.edges[e];
    s = Math.max(0, Math.min(edge.len, s));
    let i = 0;
    while (i < edge.cum.length - 2 && edge.cum[i + 1] < s) i++;
    const segLen = edge.cum[i + 1] - edge.cum[i] || 1;
    const t = (s - edge.cum[i]) / segLen;
    const a = edge.pts[i], b = edge.pts[i + 1];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  /* ---------------- モード状態 ---------------- */

  let deck = [];
  let letter = null;
  let S = 3, ox = 0, oy = 0;
  let car = null;      // {e, s, dir, speed, angle}
  let startNode = 0;
  let goal = null;     // {x,y}
  let houses = [];     // {x,y,node,isGoal,animal}
  let arrows = [];     // 分岐の選択肢 {x,y,ang,port}
  let atNode = -1;
  let phase = 'drive'; // drive → choose → turnaround → delivered
  let starCount = 0;
  let junctionTalked = false;
  let turnT = 0;
  let timers = [];
  let engineT = 0;
  let ghostFlash = 1;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function enter() {
    deck = Object.keys(ROADS).sort(() => Math.random() - 0.5);
    // 交差点が楽しい文字から始める
    for (const ch of ['X', 'Y', 'T']) {
      deck.splice(deck.indexOf(ch), 1);
    }
    deck = ['T', 'Y', 'X', ...deck];
    starCount = 0;
    document.getElementById('hud').innerHTML = `
      <div id="star-count">⭐ 0</div>
      <button id="dr-horn">📯</button>`;
    document.getElementById('dr-horn').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      Sound.fx.chime();
      honk();
    });
    nextLevel(true);
  }

  function honk() {
    // プップー!
    Sound.fx.boing();
    setTimeout(() => Sound.fx.boing(), 180);
    const p = carPos();
    if (p) FX.stars(p.x, p.y - 30, 4);
  }

  function exit() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function layout() {
    const W = innerWidth, H = innerHeight;
    const size = Math.min(W * 0.86, H * 0.6);
    S = size / 100;
    ox = W / 2 - size / 2;
    oy = H * 0.46 - size / 2;
  }

  function onResize() {
    layout();
    if (letter) rebuild(); // 道路網を作り直し (車は開始地点へ)
  }

  function nextLevel(first = false) {
    timers.forEach(clearTimeout);
    timers = [];
    if (!deck.length) deck = Object.keys(ROADS).sort(() => Math.random() - 0.5);
    letter = deck.shift();
    layout();
    rebuild();
    junctionTalked = false;
    ghostFlash = 1;
    later(() => {
      Sound.speakSequence([
        { text: letter + '!', wait: 800 },
        { text: 'Take the mail to the house!', wait: 0 },
      ]);
    }, first ? 900 : 400);
  }

  function rebuild() {
    graph = buildGraph(letter, S, ox, oy);
    // スタート: 次数1のノード (なければ 0 番)
    const deg1 = graph.nodes.map((n, i) => i).filter(i => graph.nodes[i].ports.length === 1);
    startNode = deg1.length ? deg1[0] : 0;
    // ゴール: スタートから道のりが最も遠い所
    const dist = distances(startNode);
    let goalNode = -1, best = -1;
    for (const i of deg1) {
      if (i !== startNode && dist[i] > best && dist[i] < Infinity) { best = dist[i]; goalNode = i; }
    }
    if (goalNode < 0) {
      // 行き止まりが無い文字 (O・D) → いちばん遠い辺の真ん中にポスト
      let bestE = 0, bestD = -1;
      graph.edges.forEach((e, ei) => {
        const d = Math.min(dist[e.n0], dist[e.n1]) + e.len / 2;
        if (d > bestD) { bestD = d; bestE = ei; }
      });
      const p = edgePoint(bestE, graph.edges[bestE].len / 2);
      goal = { x: p.x, y: p.y };
    } else {
      goal = { x: graph.nodes[goalNode].x, y: graph.nodes[goalNode].y };
    }
    // おうち: 各行き止まりに (ゴールは赤いおうち)
    houses = [];
    let ai = 0;
    for (const i of deg1) {
      if (i === startNode) continue;
      const isGoal = goalNode === i;
      houses.push({ x: graph.nodes[i].x, y: graph.nodes[i].y, isGoal, animal: HOUSE_ANIMALS[ai++ % HOUSE_ANIMALS.length] });
    }
    if (goalNode < 0) houses.push({ x: goal.x, y: goal.y, isGoal: true, animal: '🐻' });

    // 車をスタートに配置
    const port = graph.nodes[startNode].ports[0];
    car = {
      e: port.e,
      s: port.end === 0 ? 0 : graph.edges[port.e].len,
      dir: port.end === 0 ? 1 : -1,
      speed: 0,
      angle: 0,
    };
    // スタート地点に選択肢が2つ以上あれば選ばせる
    if (graph.nodes[startNode].ports.length >= 2) {
      openChoice(startNode, -1);
    } else {
      phase = 'drive';
      arrows = [];
      atNode = -1;
    }
  }

  /* ---------------- 分岐の選択 ---------------- */

  function openChoice(nodeIdx, fromEdge) {
    phase = 'choose';
    atNode = nodeIdx;
    const node = graph.nodes[nodeIdx];
    arrows = [];
    for (const port of node.ports) {
      if (port.e === fromEdge && node.ports.length > 1) continue;
      const e = graph.edges[port.e];
      const p = edgePoint(port.e, port.end === 0 ? Math.min(34, e.len * 0.3) : e.len - Math.min(34, e.len * 0.3));
      const ang = Math.atan2(p.y - node.y, p.x - node.x);
      arrows.push({
        x: node.x + Math.cos(ang) * 46,
        y: node.y + Math.sin(ang) * 46,
        ang, port,
      });
    }
    Sound.fx.click();
    if (!junctionTalked && JUNCTION_TALK[letter] && node.ports.length >= 3) {
      junctionTalked = true;
      later(() => Sound.speak(JUNCTION_TALK[letter]), 350);
    }
  }

  function choosePort(port) {
    const e = graph.edges[port.e];
    car.e = port.e;
    car.s = port.end === 0 ? 0 : e.len;
    car.dir = port.end === 0 ? 1 : -1;
    car.speed = 40;
    phase = 'drive';
    arrows = [];
    Sound.fx.depart();
  }

  function onDown(x, y) {
    if (phase === 'choose') {
      for (const a of arrows) {
        if (Math.hypot(a.x - x, a.y - y) < 52) {
          choosePort(a.port);
          FX.sparkle(x, y);
          return;
        }
      }
    }
    FX.sparkle(x, y);
  }

  /* ---------------- 毎フレーム ---------------- */

  const SPEED = 170;

  function carPos() {
    if (!car) return null;
    return edgePoint(car.e, car.s);
  }

  function tick(dt) {
    const dts = Math.min(dt, 40) / 1000;
    ghostFlash = Math.max(0, ghostFlash - dts * 0.4);

    if (phase === 'drive' && car) {
      car.speed = Math.min(SPEED, car.speed + 300 * dts);
      car.s += car.speed * car.dir * dts;
      engineT += dts;
      if (engineT > 0.28 && car.speed > 60) {
        engineT = 0;
        Sound.fx.clank(); // ぷすぷすエンジン
      }

      // ゴール判定
      const p = carPos();
      if (Math.hypot(p.x - goal.x, p.y - goal.y) < 17) {
        deliver();
        return;
      }

      const e = graph.edges[car.e];
      if (car.s <= 0 || car.s >= e.len) {
        car.s = Math.max(0, Math.min(e.len, car.s));
        const nodeIdx = car.s <= 0 ? e.n0 : e.n1;
        const node = graph.nodes[nodeIdx];
        const others = node.ports.filter(pt => pt.e !== car.e);
        if (others.length === 0) {
          // 行き止まり (ハズレのおうち) → 3点ターンで引き返す
          phase = 'turnaround';
          turnT = 0;
          Sound.fx.wrong();
          later(() => Sound.fx.boing(), 250);
          const house = houses.find(h => Math.hypot(h.x - p.x, h.y - p.y) < 24);
          if (house) later(() => Sound.speak('Not this house!'), 100);
        } else if (others.length === 1) {
          choosePort(others[0]); // 一本道は自動で進む
        } else {
          openChoice(nodeIdx, car.e);
        }
      }
    } else if (phase === 'turnaround') {
      turnT += dts;
      if (turnT > 1.1) {
        car.dir *= -1;
        car.speed = 40;
        phase = 'drive';
      }
    }
  }

  function deliver() {
    phase = 'delivered';
    car.speed = 0;
    starCount++;
    const sc = document.getElementById('star-count');
    if (sc) sc.textContent = '⭐ ' + starCount;
    Sound.fx.tada();
    later(() => Sound.speakSequence([
      { text: letter + '!', wait: 700 },
      { text: 'Mail delivered! Thank you!', wait: 0 },
    ]), 300);
    FX.confetti(goal.x, goal.y - 30, 30);
    FX.emojiPop(goal.x, goal.y - 40, '💌', 4);
    FX.stars(goal.x, goal.y, 8);
    if (starCount % 5 === 0) {
      later(() => { Sound.fx.firework(); FX.firework(innerWidth / 2, innerHeight * 0.3); }, 900);
    }
    later(() => nextLevel(), 3000);
  }

  /* ---------------- 描画 ---------------- */

  function draw(ctx, W, H) {
    const t = performance.now();
    // 草原
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#b8e890');
    grad.addColorStop(1, '#8fd964');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 花
    ctx.font = `${Math.min(W, H) * 0.03}px sans-serif`;
    for (let i = 0; i < 8; i++) {
      const fx_ = ((i * 137) % 100) / 100, fy = ((i * 71) % 100) / 100;
      ctx.fillText(i % 2 ? '🌼' : '🌷', W * fx_, H * (0.05 + fy * 0.9));
    }

    if (!graph) return;
    const color = Tracks.letters[letter].color;

    // ゴースト文字 (道路の下に文字の形)
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3 + ghostFlash * 0.35;
    ctx.lineWidth = 44 * S / 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const e of graph.edges) strokePts(ctx, e.pts);
    ctx.globalAlpha = 1;

    // 道路 (アスファルト + 白の中央線)
    for (const e of graph.edges) {
      ctx.strokeStyle = '#5a5a66';
      ctx.lineWidth = 26 * S / 3;
      strokePts(ctx, e.pts);
    }
    for (const e of graph.edges) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 10]);
      strokePts(ctx, e.pts);
      ctx.setLineDash([]);
    }

    // スタートのガレージ
    const sn = graph.nodes[startNode];
    ctx.font = `${30 * S / 3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', sn.x, sn.y - 20 * S / 3);

    // おうち (ゴールは赤く光って動物が待つ)
    for (const h of houses) {
      const size = (h.isGoal ? 44 : 34) * S / 3;
      ctx.font = `${size}px sans-serif`;
      if (h.isGoal) {
        const pulse = 1 + Math.sin(t / 250) * 0.08;
        ctx.save();
        ctx.translate(h.x, h.y - size * 0.5);
        ctx.scale(pulse, pulse);
        ctx.fillText('🏠', 0, 0);
        ctx.font = `${size * 0.62}px sans-serif`;
        ctx.fillText(h.animal, size * 0.55, -size * 0.42 + Math.sin(t / 180) * 3);
        ctx.font = `${size * 0.5}px sans-serif`;
        ctx.fillText('📮', -size * 0.6, size * 0.28);
        ctx.restore();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.fillText('🛖', h.x, h.y - size * 0.4);
        ctx.globalAlpha = 1;
      }
    }

    drawCar(ctx, t);

    // 分岐の矢印
    if (phase === 'choose') {
      for (const a of arrows) {
        const pulse = 1 + Math.sin(t / 200) * 0.15;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.ang);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ffd45c';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, -12);
        ctx.lineTo(10, -12);
        ctx.lineTo(10, -20);
        ctx.lineTo(26, 0);
        ctx.lineTo(10, 20);
        ctx.lineTo(10, 12);
        ctx.lineTo(-14, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    FX.update();
    FX.draw(ctx);
  }

  function strokePts(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function drawCar(ctx, t) {
    const p = carPos();
    if (!p) return;
    let ang = p.ang + (car.dir < 0 ? Math.PI : 0);
    if (phase === 'turnaround') ang += Math.sin(Math.min(1, turnT) * Math.PI) * Math.PI; // くるっと回る
    // なめらかに回頭
    let d = ang - car.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    car.angle += d * 0.25;

    const k = Math.max(0.85, S / 3);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(car.angle);
    ctx.scale(k, k);
    // 車体 (上から見た郵便車)
    ctx.fillStyle = '#e5533d';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    rr(ctx, -20, -12, 40, 24, 8);
    ctx.fill(); ctx.stroke();
    // フロントガラス
    ctx.fillStyle = '#bfe8f8';
    rr(ctx, 4, -8, 10, 16, 3);
    ctx.fill();
    // 屋根の封筒
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💌', -6, 0);
    // ヘッドライト
    ctx.fillStyle = '#ffd45c';
    ctx.beginPath(); ctx.arc(19, -7, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(19, 7, 3, 0, 7); ctx.fill();
    ctx.restore();
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    enter, exit, tick, draw, onResize, onDown,
    onMove() {}, onUp() {},
    get state() { return { letter, phase, starCount, arrows: arrows.length, car: car && { e: car.e, s: car.s } }; },
    _roads: ROADS,
    _choose(i) { if (phase === 'choose' && arrows[i]) choosePort(arrows[i].port); },
  };
})();

window.Drive = Drive;
