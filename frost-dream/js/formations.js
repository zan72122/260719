'use strict';
/*
 * フォーメーションエンジン。
 * 文字やシルエットをオフスクリーンCanvasに描いてピクセルをサンプリングし、
 * 自由な粒子を割り当てて、スプリングで形に整列させる。
 * ひらがな・数字・名前・ハート・星・花・にじ・くじら・ちょうちょ・とり・りゅう。
 */

const Formations = (() => {
  const CW = 640, CH = 360;
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const cx2d = cv.getContext('2d', { willReadFrequently: true });

  /* ---- サンプリング ---- */
  function samplePixels(step, maxPts) {
    const data = cx2d.getImageData(0, 0, CW, CH).data;
    const raw = [];
    for (let y = 0; y < CH; y += step) {
      for (let x = 0; x < CW; x += step) {
        if (data[(y * CW + x) * 4 + 3] > 110) {
          raw.push(x + rand(-1.5, 1.5), y + rand(-1.5, 1.5));
        }
      }
    }
    const m = raw.length / 2;
    if (m === 0) return null;
    // バウンディングボックスで正規化（yの半径=1）
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < m; i++) {
      const x = raw[i * 2], y = raw[i * 2 + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2;
    const halfH = Math.max(1, (maxY - minY) / 2);
    // ランダムに間引く
    const order = [];
    for (let i = 0; i < m; i++) order.push(i);
    for (let i = m - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[k]; order[k] = tmp;
    }
    const take = Math.min(m, maxPts);
    const pts = new Float32Array(take * 2);
    for (let i = 0; i < take; i++) {
      const o = order[i];
      pts[i * 2] = (raw[o * 2] - cxm) / halfH;
      pts[i * 2 + 1] = (raw[o * 2 + 1] - cym) / halfH;
    }
    return pts;
  }

  function sampleText(text, maxPts) {
    cx2d.clearRect(0, 0, CW, CH);
    let fs = 250;
    cx2d.font = '900 ' + fs + 'px -apple-system, "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
    const w = cx2d.measureText(text).width;
    if (w > CW * 0.94) {
      fs = Math.floor(fs * CW * 0.94 / w);
      cx2d.font = '900 ' + fs + 'px -apple-system, "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
    }
    cx2d.fillStyle = '#fff';
    cx2d.textAlign = 'center';
    cx2d.textBaseline = 'middle';
    cx2d.fillText(text, CW / 2, CH / 2);
    return samplePixels(4, maxPts);
  }

  /* ---- シルエット ---- */
  const SHAPES = {
    heart(g) {
      g.beginPath();
      g.moveTo(320, 300);
      g.bezierCurveTo(150, 190, 160, 60, 320, 130);
      g.bezierCurveTo(480, 60, 490, 190, 320, 300);
      g.fill();
    },
    star(g) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const r = (i % 2 === 0) ? 150 : 64;
        const x = 320 + Math.cos(a) * r, y = 180 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
    },
    flower(g) {
      for (let i = 0; i < 6; i++) {
        g.save();
        g.translate(320, 180);
        g.rotate(i * TAU / 6);
        g.beginPath();
        g.ellipse(0, -85, 42, 78, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      g.beginPath();
      g.arc(320, 180, 46, 0, TAU);
      g.fill();
    },
    rainbow(g) {
      g.lineWidth = 70;
      g.beginPath();
      g.arc(320, 320, 220, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    },
    whale(g) {
      // 右向きのくじら。巨大でも形が読めるように「線画（輪郭の星座）」で描く
      g.lineWidth = 22;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();                                  // どうの輪郭
      g.ellipse(340, 195, 195, 90, 0.05, 0, TAU);
      g.stroke();
      g.beginPath();                                  // お（尾びれ）
      g.moveTo(165, 180);
      g.quadraticCurveTo(85, 150, 45, 95);
      g.quadraticCurveTo(70, 170, 60, 195);
      g.quadraticCurveTo(85, 240, 45, 285);
      g.quadraticCurveTo(90, 240, 165, 215);
      g.stroke();
      g.beginPath();                                  // むなびれ
      g.moveTo(360, 265);
      g.quadraticCurveTo(330, 320, 280, 330);
      g.stroke();
      g.beginPath();                                  // しおふき
      g.moveTo(430, 95);
      g.quadraticCurveTo(425, 55, 395, 35);
      g.moveTo(430, 95);
      g.quadraticCurveTo(455, 50, 490, 40);
      g.stroke();
      g.beginPath();                                  // め（塗り）
      g.arc(455, 165, 17, 0, TAU);
      g.fill();
      g.beginPath();                                  // くち
      g.arc(430, 205, 65, Math.PI * 0.15, Math.PI * 0.5);
      g.stroke();
    },
    butterfly(g) {
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.ellipse(320 + sd * 95, 120, 88, 68, sd * 0.5, 0, TAU);
        g.fill();
        g.beginPath();
        g.ellipse(320 + sd * 78, 235, 66, 52, -sd * 0.45, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.ellipse(320, 180, 17, 92, 0, 0, TAU);
      g.fill();
    },
    bird(g) {
      g.beginPath();
      g.ellipse(320, 210, 130, 62, 0.08, 0, TAU);    // どう
      g.fill();
      g.beginPath();                                  // あたま
      g.arc(445, 165, 48, 0, TAU);
      g.fill();
      g.beginPath();                                  // くちばし
      g.moveTo(485, 160); g.lineTo(535, 172); g.lineTo(485, 186);
      g.closePath(); g.fill();
      g.beginPath();                                  // つばさ
      g.moveTo(320, 195);
      g.quadraticCurveTo(215, 40, 110, 80);
      g.quadraticCurveTo(215, 130, 285, 235);
      g.closePath(); g.fill();
      g.beginPath();                                  // お
      g.moveTo(200, 215); g.lineTo(95, 255); g.lineTo(115, 190);
      g.closePath(); g.fill();
    },
    dragon(g) {
      g.lineWidth = 62;                               // うねるからだ
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(80, 260);
      g.bezierCurveTo(170, 120, 260, 320, 370, 190);
      g.quadraticCurveTo(440, 110, 520, 140);
      g.stroke();
      g.beginPath();                                  // あたま
      g.arc(535, 140, 52, 0, TAU);
      g.fill();
      g.beginPath();                                  // つの
      g.moveTo(520, 95); g.lineTo(500, 30); g.lineTo(548, 82);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(560, 100); g.lineTo(590, 42); g.lineTo(588, 98);
      g.closePath(); g.fill();
    }
  };

  function sampleShape(name, maxPts) {
    cx2d.clearRect(0, 0, CW, CH);
    cx2d.fillStyle = '#fff';
    cx2d.strokeStyle = '#fff';
    SHAPES[name](cx2d);
    return samplePixels(4, maxPts);
  }

  /* ---- フォーメーションの実体管理 ---- */
  let active = [];

  /*
   * opts: {pts, cx, cy, scale(=半分の高さpx), hold, driftX, driftY, flipX}
   */
  function start(sim, opts) {
    const pts = opts.pts;
    if (!pts) return null;
    const m = pts.length / 2;
    // 少し多めに集めて、形の中心に近い粒子から使う（収束が速くきれいになる）
    let idx = sim.pickFree(Math.ceil(m * 1.5));
    if (idx.length < Math.min(m, 60)) return null;   // 粒子が足りない
    if (idx.length > m) {
      const cx0 = opts.cx, cy0 = opts.cy;
      idx.sort((a, b) =>
        dist2(sim.px[a], sim.py[a], cx0, cy0) - dist2(sim.px[b], sim.py[b], cx0, cy0));
      idx = idx.slice(0, m);
    }
    const f = {
      idx,
      pts,
      cx: opts.cx, cy: opts.cy,
      scale: opts.scale,
      hold: opts.hold !== undefined ? opts.hold : 2.4,
      driftX: opts.driftX || 0,
      driftY: opts.driftY || 0,
      flipX: opts.flipX ? -1 : 1,
      type: opts.type || 'shape',
      excite: 0,           // くじら：なでられた興奮（うねりが大きくなる）
      t: 0,
      state: 'in'          // in → hold → out(解散)
    };
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      sim.mode[i] = 3;
      const o = (k % m) * 2;
      sim.tgtX[i] = f.cx + pts[o] * f.scale * f.flipX;
      sim.tgtY[i] = f.cy + pts[o + 1] * f.scale;
    }
    active.push(f);
    return f;
  }

  function update(sim, dt, t, W, H) {
    for (let a = active.length - 1; a >= 0; a--) {
      const f = active[a];
      f.t += dt;
      f.cx += f.driftX * dt;
      f.cy += f.driftY * dt;
      if (f.state === 'in' && f.t > 1.1) f.state = 'hold';
      if (f.state === 'hold' && f.t > 1.1 + f.hold) {
        f.state = 'out';
        for (const i of f.idx) sim.releaseParticle(i);
        active.splice(a, 1);
        continue;
      }
      // ドリフトで完全に画面外へ出たら解散
      if (f.driftX !== 0 && (f.cx < -f.scale * 3 || f.cx > W + f.scale * 3)) {
        for (const i of f.idx) sim.releaseParticle(i);
        active.splice(a, 1);
        continue;
      }
      // 目標を更新（呼吸のゆらぎ付き。くじらは体をうねらせて泳ぐ）
      const m = f.pts.length / 2;
      if (f.type === 'whale') {
        f.excite = Math.max(0, f.excite - dt * 0.55);
        const amp = f.scale * 0.08 * (1 + f.excite * 2.2);
        const bob = Math.sin(t * 0.8) * f.scale * 0.08;
        const wspd = 2.6 * (1 + f.excite * 1.4);
        for (let k = 0; k < f.idx.length; k++) {
          const i = f.idx[k];
          if (sim.mode[i] !== 3) continue;
          const o = (k % m) * 2;
          const lx = f.pts[o], ly = f.pts[o + 1];
          sim.tgtX[i] = f.cx + lx * f.scale * f.flipX + Math.sin(t * 2.1 + k * 0.61) * 2.6;
          sim.tgtY[i] = f.cy + ly * f.scale + bob
                      + Math.sin(t * wspd - lx * 2.4) * amp * (0.4 + Math.abs(lx) * 0.55);
        }
      } else {
        for (let k = 0; k < f.idx.length; k++) {
          const i = f.idx[k];
          if (sim.mode[i] !== 3) continue;
          const o = (k % m) * 2;
          const wob = Math.sin(t * 2.1 + k * 0.61) * 2.6;
          sim.tgtX[i] = f.cx + f.pts[o] * f.scale * f.flipX + wob;
          sim.tgtY[i] = f.cy + f.pts[o + 1] * f.scale + Math.cos(t * 1.8 + k * 0.37) * 2.6;
        }
      }
    }
  }

  function releaseAll(sim) {
    for (const f of active) {
      for (const i of f.idx) sim.releaseParticle(i);
    }
    active = [];
  }

  function count() { return active.length; }
  function isActive(f) { return active.indexOf(f) >= 0; }
  function shapeNames() { return Object.keys(SHAPES); }

  return { sampleText, sampleShape, start, update, releaseAll, count, isActive, shapeNames, SHAPES };
})();
