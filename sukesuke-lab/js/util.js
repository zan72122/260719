/* 共通ヘルパー */
window.GAMES = {};

const U = {
  NS: 'http://www.w3.org/2000/svg',

  el(name, attrs, parent) {
    const e = document.createElementNS(U.NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  },

  text(str, attrs, parent) {
    const e = U.el('text', attrs, parent);
    e.textContent = str;
    return e;
  },

  makeSvg(stage, w, h) {
    const svg = U.el('svg', {
      viewBox: `0 0 ${w} ${h}`,
      preserveAspectRatio: 'xMidYMid meet',
    });
    stage.appendChild(svg);
    return svg;
  },

  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(a, b) { return a + Math.random() * (b - a); },

  /* client座標 → viewBox座標 */
  toView(svg, cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  },

  /* びよんびよんバネ: {p:現在値, v:速度, t:目標値} */
  spring(p) { return { p, v: 0, t: p }; },

  /* ポインタ速度トラッカー: push(x,y,tミリ秒) して vel() で px/s を得る */
  velTracker() {
    const buf = [];
    return {
      push(x, y, t) {
        buf.push({ x, y, t });
        while (buf.length > 6 || (buf.length > 1 && t - buf[0].t > 130)) buf.shift();
      },
      vel() {
        if (buf.length < 2) return { x: 0, y: 0, mag: 0 };
        const a = buf[0], b = buf[buf.length - 1];
        const dt = Math.max(8, b.t - a.t) / 1000;
        const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
        return { x: vx, y: vy, mag: Math.hypot(vx, vy) };
      },
      reset() { buf.length = 0; },
    };
  },

  stepSpring(s, dt, stiff, damp) {
    s.v += (s.t - s.p) * stiff * dt;
    s.v *= Math.exp(-damp * dt);
    s.p += s.v * dt;
  },

  /* ジグザグばねのパス（縦向き） */
  springPathV(x, yTop, yBottom, coils, radius) {
    let d = `M ${x} ${yTop.toFixed(1)}`;
    const n = coils * 2;
    const step = (yBottom - yTop) / (n + 1);
    for (let i = 1; i <= n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      d += ` L ${(x + dir * radius).toFixed(1)} ${(yTop + step * i).toFixed(1)}`;
    }
    d += ` L ${x} ${yBottom.toFixed(1)}`;
    return d;
  },

  /* キラキラ・ほし */
  starPath(cx, cy, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      d += (i === 0 ? 'M ' : 'L ') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1) + ' ';
    }
    return d + 'Z';
  },
};

/* パッと出て消えるエフェクト（星・キラキラ・しずく等）を管理 */
function makeFxLayer(parent) {
  const g = U.el('g', {}, parent);
  const items = [];
  return {
    burst(cx, cy, color, n, size) {
      for (let i = 0; i < (n || 6); i++) {
        const a = U.rand(0, Math.PI * 2);
        const sp = U.rand(120, 320);
        const el = U.el('path', {
          d: U.starPath(0, 0, size || U.rand(9, 17)),
          fill: color || '#ffd93b',
          opacity: 1,
        }, g);
        items.push({ el, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: U.rand(0.5, 0.85), age: 0, spin: U.rand(-360, 360) });
      }
    },
    puff(cx, cy, color, n) {
      for (let i = 0; i < (n || 5); i++) {
        const a = U.rand(0, Math.PI * 2);
        const sp = U.rand(40, 140);
        const el = U.el('circle', { r: U.rand(8, 18), fill: color || '#ffffff', opacity: 0.85 }, g);
        items.push({ el, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: U.rand(0.4, 0.7), age: 0, spin: 0 });
      }
    },
    step(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age >= it.life) { it.el.remove(); items.splice(i, 1); continue; }
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vy += 300 * dt;
        const k = 1 - it.age / it.life;
        it.el.setAttribute('opacity', k);
        it.el.setAttribute('transform', `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${(it.spin * it.age).toFixed(0)}) scale(${(0.5 + k * 0.7).toFixed(2)})`);
      }
    },
    clear() {
      items.forEach(it => it.el.remove());
      items.length = 0;
    },
  };
}
