'use strict';
/*
 * 群れシミュレーション。数万粒子をO(n)で動かすため、
 * ペアごとのボイド計算ではなく粗いグリッドに種ごとの平均速度・重心を
 * 書き込み、各粒子はそれを読んで整列・結合・分離する（ムクドリの群飛の定石）。
 * さらにカールノイズの流場で夢のような揺らぎを常に与える。
 *
 * mode: 0=自由な群れ 1=背景の星屑 2=惑星のリングに捕まった 3=フォーメーション整列中
 */

const CELL = 56;
const MAXSPEC = 4;

class Sim {
  constructor(maxN) {
    this.maxN = maxN;
    this.n = 0;
    this.px = new Float32Array(maxN);
    this.py = new Float32Array(maxN);
    this.vx = new Float32Array(maxN);
    this.vy = new Float32Array(maxN);
    this.size = new Float32Array(maxN);
    this.colR = new Float32Array(maxN);
    this.colG = new Float32Array(maxN);
    this.colB = new Float32Array(maxN);
    this.phase = new Float32Array(maxN);   // 星屑: 明滅位相 / その他: 揺らぎ
    this.pspd = new Float32Array(maxN);    // 星屑: 明滅速度
    this.spec = new Uint8Array(maxN);
    this.mode = new Uint8Array(maxN);
    this.tgtX = new Float32Array(maxN);    // mode3: 目標 / mode2: 現在の軌道半径
    this.tgtY = new Float32Array(maxN);    // mode3: 目標 / mode2: 目標の軌道半径
    this.orbA = new Float32Array(maxN);    // mode2: 軌道角
    this.orbS = new Float32Array(maxN);    // mode2: 軌道速度
    this.pIdx = new Uint8Array(maxN);      // mode2: 惑星番号
    this.verts = new Float32Array((maxN + 96) * 6);
    this.W = 0; this.H = 0;
    this.gw = 0; this.gh = 0; this.cells = 0;
    this.events = [];
    this.dustN = 0;
    this.numSpec = 1;
  }

  _allocGrid() {
    const c = this.cells * MAXSPEC;
    this.gCnt = new Float32Array(c);
    this.gSx = new Float32Array(c);
    this.gSy = new Float32Array(c);
    this.gVx = new Float32Array(c);
    this.gVy = new Float32Array(c);
    this.rfx = new Float32Array(this.cells);
    this.rfy = new Float32Array(this.cells);
  }

  resize(W, H) {
    this.W = W; this.H = H;
    this.gw = Math.max(1, Math.ceil(W / CELL));
    this.gh = Math.max(1, Math.ceil(H / CELL));
    this.cells = this.gw * this.gh;
    this._allocGrid();
    for (let i = 0; i < this.n; i++) {
      this.px[i] = clamp(this.px[i], 2, W - 2);
      this.py[i] = clamp(this.py[i], 2, H - 2);
    }
  }

  /* avoid: 種ごとに避けたい座標（自分の惑星の上に湧かないように） */
  init(theme, W, H, N, avoid) {
    this.n = Math.min(N, this.maxN);
    this.resize(W, H);
    const sps = theme.species;
    this.numSpec = sps.length;
    this.dustN = Math.floor(this.n * 0.30);

    // 背景の星屑（大小のボケ玉・明滅）
    for (let i = 0; i < this.dustN; i++) {
      this.mode[i] = 1;
      this.px[i] = rand(W);
      this.py[i] = rand(H);
      this.vx[i] = 0; this.vy[i] = 0;
      const big = Math.random() < 0.18;
      this.size[i] = big ? rand(5, 13) : rand(0.8, 2.4);
      const gc = theme.glowF[randInt(0, theme.glowF.length - 1)];
      const b = big ? rand(0.05, 0.12) : rand(0.10, 0.30);
      const wmix = rand(0.3, 0.8);
      this.colR[i] = (gc[0] * (1 - wmix) + wmix) * b;
      this.colG[i] = (gc[1] * (1 - wmix) + wmix) * b;
      this.colB[i] = (gc[2] * (1 - wmix) + wmix) * b;
      this.phase[i] = rand(TAU);
      this.pspd[i] = rand(0.4, 2.2);
      this.spec[i] = 0;
    }

    // 群れ本体：種ごとに雲のかたまりで出現（自分の惑星からは離れた場所に）
    const centers = [];
    for (let s = 0; s < this.numSpec; s++) {
      let best = null, bestD = -1;
      for (let tr = 0; tr < 6; tr++) {
        const cx = rand(W * 0.18, W * 0.82), cy = rand(H * 0.18, H * 0.82);
        const av = avoid && avoid[s];
        const d = av ? dist2(cx, cy, av.x, av.y) : 1;
        if (d > bestD) { bestD = d; best = [cx, cy]; }
      }
      centers.push(best);
    }
    for (let i = this.dustN; i < this.n; i++) {
      const s = i % this.numSpec;
      this.mode[i] = 0;
      this.spec[i] = s;
      const c = centers[s];
      const a = rand(TAU), r = rand(0, Math.min(W, H) * 0.28);
      this.px[i] = clamp(c[0] + Math.cos(a) * r, 4, W - 4);
      this.py[i] = clamp(c[1] + Math.sin(a) * r, 4, H - 4);
      const va = rand(TAU);
      this.vx[i] = Math.cos(va) * 50;
      this.vy[i] = Math.sin(va) * 50;
      this.size[i] = Math.random() < 0.06 ? rand(3.6, 5.2) : rand(1.6, 3.2);
      const cf = sps[s].colorF;
      const j = rand(0.72, 1.12);
      this.colR[i] = Math.min(1, cf[0] * j + 0.06);
      this.colG[i] = Math.min(1, cf[1] * j + 0.06);
      this.colB[i] = Math.min(1, cf[2] * j + 0.06);
      this.phase[i] = rand(TAU);
      this.pspd[i] = rand(2, 6);
    }
  }

  /* 自由な粒子の中からk個選ぶ（フォーメーション用） */
  pickFree(k) {
    const out = [];
    const start = randInt(this.dustN, this.n - 1);
    for (let step = 0; step < this.n - this.dustN && out.length < k; step++) {
      const i = this.dustN + ((start - this.dustN + step * 7919) % (this.n - this.dustN));
      if (this.mode[i] === 0) out.push(i);
    }
    return out;
  }

  releaseParticle(i) {
    if (this.mode[i] === 3) {
      this.mode[i] = 0;
      const a = rand(TAU);
      this.vx[i] = Math.cos(a) * rand(40, 120);
      this.vy[i] = Math.sin(a) * rand(40, 120);
    }
  }

  step(dt, t, env) {
    const { W, H } = this;
    const n = this.n, dustN = this.dustN;
    const px = this.px, py = this.py, vx = this.vx, vy = this.vy;
    const mode = this.mode, spec = this.spec;
    const cells = this.cells, gw = this.gw, gh = this.gh;
    const gCnt = this.gCnt, gSx = this.gSx, gSy = this.gSy, gVx = this.gVx, gVy = this.gVy;
    const rfx = this.rfx, rfy = this.rfy;
    const sps = env.species;
    const nSpec = this.numSpec;

    /* --- グリッド集計 --- */
    gCnt.fill(0); gSx.fill(0); gSy.fill(0); gVx.fill(0); gVy.fill(0);
    const scCnt = [0, 0, 0, 0], scX = [0, 0, 0, 0], scY = [0, 0, 0, 0];
    for (let i = dustN; i < n; i++) {
      if (mode[i] !== 0) continue;
      const cxi = Math.min(gw - 1, Math.max(0, (px[i] / CELL) | 0));
      const cyi = Math.min(gh - 1, Math.max(0, (py[i] / CELL) | 0));
      const base = spec[i] * cells + cyi * gw + cxi;
      gCnt[base]++;
      gSx[base] += px[i]; gSy[base] += py[i];
      gVx[base] += vx[i]; gVy[base] += vy[i];
      const s = spec[i];
      scCnt[s]++; scX[s] += px[i]; scY[s] += py[i];
    }
    for (let s = 0; s < nSpec; s++) {
      if (scCnt[s] > 0) { scX[s] /= scCnt[s]; scY[s] /= scCnt[s]; }
    }

    /* --- 光の川をグリッドに焼き込む --- */
    rfx.fill(0); rfy.fill(0);
    for (const rv of env.rivers) {
      const w0 = rv.alpha;
      if (w0 <= 0) continue;
      const pts = rv.pts;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const cxi = (p.x / CELL) | 0, cyi = (p.y / CELL) | 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const xx = cxi + ox, yy = cyi + oy;
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            const w = w0 * ((ox === 0 && oy === 0) ? 1 : 0.4);
            const c = yy * gw + xx;
            rfx[c] += p.dx * w;
            rfy[c] += p.dy * w;
          }
        }
      }
    }

    const touches = env.touches, pulses = env.pulses, planets = env.planets;

    /* --- 粒子ごとの更新 --- */
    for (let i = 0; i < n; i++) {
      const m = mode[i];

      if (m === 1) {
        // 星屑：カールノイズでゆっくり漂う（大きいほど手前で速い）
        const k1 = 0.0035, k2 = 0.0011;
        const x = px[i], y = py[i];
        const cxv = Math.sin(x * k1 + t * 0.21) * Math.sin(y * k1 - t * 0.17) * 0.7
                  + Math.cos(y * k2 + t * 0.1) * 0.5;
        const cyv = Math.cos(x * k1 - t * 0.13) * Math.sin(y * k1 + t * 0.19) * 0.7
                  + Math.sin(x * k2 - t * 0.08) * 0.5;
        const sp = 4 + this.size[i] * 1.6;
        px[i] += cxv * sp * dt;
        py[i] += (cyv * sp - 2.5) * dt;
        if (px[i] < -20) px[i] += W + 40;
        if (px[i] > W + 20) px[i] -= W + 40;
        if (py[i] < -20) py[i] += H + 40;
        if (py[i] > H + 20) py[i] -= H + 40;
        continue;
      }

      if (m === 2) {
        // 惑星のリングを回る
        const pl = planets[this.pIdx[i]];
        if (!pl) { mode[i] = 0; continue; }
        this.orbA[i] += this.orbS[i] * dt;
        this.tgtX[i] += (this.tgtY[i] - this.tgtX[i]) * Math.min(1, 2.5 * dt);
        const rr = this.tgtX[i] + Math.sin(t * 2.3 + this.phase[i]) * 2.5;
        px[i] = pl.x + Math.cos(this.orbA[i]) * rr;
        py[i] = pl.y + Math.sin(this.orbA[i]) * rr * 0.92;
        continue;
      }

      if (m === 3) {
        // フォーメーション：目標へスプリングで吸い付く
        let fx = (this.tgtX[i] - px[i]) * 42 - vx[i] * 8.5;
        let fy = (this.tgtY[i] - py[i]) * 42 - vy[i] * 8.5;
        vx[i] += fx * dt; vy[i] += fy * dt;
        const sp2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp2 > 640000) { const s = 800 / Math.sqrt(sp2); vx[i] *= s; vy[i] *= s; }
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        continue;
      }

      /* ----- mode 0: 自由な群れ ----- */
      const s = spec[i];
      const cfg = sps[s];
      const x = px[i], y = py[i];
      let fx = 0, fy = 0;

      const cxi = Math.min(gw - 1, Math.max(0, (x / CELL) | 0));
      const cyi = Math.min(gh - 1, Math.max(0, (y / CELL) | 0));
      const cell = cyi * gw + cxi;
      const base = s * cells + cell;
      const cnt = gCnt[base];
      if (cnt > 1) {
        const inv = 1 / cnt;
        // 整列
        fx += (gVx[base] * inv - vx[i]) * 2.4;
        fy += (gVy[base] * inv - vy[i]) * 2.4;
        // 結合
        const ccx = gSx[base] * inv, ccy = gSy[base] * inv;
        fx += (ccx - x) * 1.1;
        fy += (ccy - y) * 1.1;
        // 分離（混みすぎたセルでは重心から逃げる）
        if (cnt > 9) {
          const over = Math.min(cnt - 9, 45) * 0.5;
          fx += (x - ccx) * over * 0.12;
          fy += (y - ccy) * over * 0.12;
        }
      }

      // カールノイズの流場（夢の中の風）
      {
        const k1 = 0.0042, k2 = 0.012;
        const a1x = Math.sin(x * k1 + t * 0.7 + 1.7) * Math.cos(y * k1 - t * 0.5);
        const a1y = -Math.cos(x * k1 + t * 0.7 + 1.7) * Math.sin(y * k1 - t * 0.5);
        const a2x = Math.sin(x * k2 - t * 0.9) * Math.cos(y * k2 + t * 0.8) * 0.5;
        const a2y = -Math.cos(x * k2 - t * 0.9) * Math.sin(y * k2 + t * 0.8) * 0.5;
        fx += (a1y + a2y) * 46;
        fy += -(a1x + a2x) * 46;
      }

      // 光の川に流れる
      {
        const rx = rfx[cell], ry = rfy[cell];
        const len2 = rx * rx + ry * ry;
        if (len2 > 0.0001) {
          const len = Math.sqrt(len2);
          const str = Math.min(len, 1.3) * (cfg.follow ? 300 : 120);
          fx += rx / len * str;
          fy += ry / len * str;
        }
      }

      // リーダーの種を追いかける
      if (cfg.leader >= 0) {
        const lb = cfg.leader * cells + cell;
        const lc = gCnt[lb];
        if (lc > 0) {
          const inv = 1 / lc;
          fx += (gVx[lb] * inv - vx[i]) * 3.0;
          fy += (gVy[lb] * inv - vy[i]) * 3.0;
          fx += (gSx[lb] * inv - x) * 1.3;
          fy += (gSy[lb] * inv - y) * 1.3;
        } else if (scCnt[cfg.leader] > 0) {
          fx += (scX[cfg.leader] - x) * 0.28;
          fy += (scY[cfg.leader] - y) * 0.28;
        }
      }

      // 自分たちで渦を巻く種
      if (cfg.vortex && scCnt[s] > 0) {
        const dx = scX[s] - x, dy = scY[s] - y;
        const d = Math.hypot(dx, dy);
        if (d > 1 && d < 320) {
          const k = 1 - d / 320;
          fx += (-dy / d) * 120 * k + dx / d * 26 * k;
          fy += (dx / d) * 120 * k + dy / d * 26 * k;
        }
      }

      // 指との関係
      for (let ti = 0; ti < touches.length; ti++) {
        const tc = touches[ti];
        const dx = tc.x - x, dy = tc.y - y;
        const d2v = dx * dx + dy * dy;
        if (cfg.shy) {
          if (d2v < 32400) { // 180px 逃げる
            const d = Math.sqrt(d2v) || 1;
            const k = 1 - d / 180;
            fx -= dx / d * 380 * k;
            fy -= dy / d * 380 * k;
          }
        } else if (tc.age > 0.3 && d2v < 26896) { // 164px 押しっぱなしで渦
          const d = Math.sqrt(d2v) || 1;
          const k = 1 - d / 164;
          fx += (-dy / d) * 260 * k + dx / d * 85 * k;
          fy += (dx / d) * 260 * k + dy / d * 85 * k;
        }
      }

      // タップの波紋パルス
      for (let piv = 0; piv < pulses.length; piv++) {
        const pu = pulses[piv];
        const R = pu.age * 480;
        const dx = x - pu.x, dy = y - pu.y;
        const d = Math.hypot(dx, dy) || 1;
        const band = Math.abs(d - R);
        if (band < 70 && pu.age < 0.9) {
          const k = (1 - pu.age / 0.9) * (1 - band / 70);
          fx += dx / d * 640 * k;
          fy += dy / d * 640 * k;
        }
      }

      // 惑星：同じ種は引き寄せ→捕獲、ちがう種はやさしく押し返す
      let captured = false;
      for (let pli = 0; pli < planets.length; pli++) {
        const pl = planets[pli];
        const dx = pl.x - x, dy = pl.y - y;
        const d2v = dx * dx + dy * dy;
        if (pl.specIdx === s && !pl.full) {
          const pull = pl.r + 100;
          if (d2v < pull * pull) {
            const d = Math.sqrt(d2v) || 1;
            fx += dx / d * (30 + 200 * (1 - d / pull));
            fy += dy / d * (30 + 200 * (1 - d / pull));
            if (d < pl.r * 0.85 && pl.captured < pl.quota) {
              mode[i] = 2;
              this.pIdx[i] = pli;
              this.orbA[i] = Math.atan2(y - pl.y, x - pl.x);
              this.orbS[i] = rand(1.0, 2.4) * (Math.random() < 0.5 ? -1 : 1);
              this.tgtX[i] = d;
              this.tgtY[i] = pl.r * rand(1.08, 1.5);
              pl.captured++;
              this.events.push({ type: 'capture', planet: pli });
              captured = true;
              break;
            }
          }
        } else {
          const rr = pl.r + 24;
          if (d2v < rr * rr) {
            const d = Math.sqrt(d2v) || 1;
            fx -= dx / d * 300 * (1.15 - d / rr);
            fy -= dy / d * 300 * (1.15 - d / rr);
          }
        }
      }
      if (captured) continue;

      // 画面の端
      const mgn = 40;
      if (x < mgn) fx += (mgn - x) * 8;
      if (x > W - mgn) fx -= (x - (W - mgn)) * 8;
      if (y < mgn) fy += (mgn - y) * 8;
      if (y > H - mgn) fy -= (y - (H - mgn)) * 8;

      // 積分
      vx[i] += fx * dt;
      vy[i] += fy * dt;
      const damp = 1 - 0.30 * dt;
      vx[i] *= damp; vy[i] *= damp;
      const sp2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp2 > 57600) { const sc = 240 / Math.sqrt(sp2); vx[i] *= sc; vy[i] *= sc; }
      else if (sp2 < 576 && sp2 > 0.01) { const sc = 24 / Math.sqrt(sp2); vx[i] *= sc; vy[i] *= sc; }
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      if (px[i] < 2) { px[i] = 2; vx[i] = Math.abs(vx[i]) * 0.5; }
      if (px[i] > W - 2) { px[i] = W - 2; vx[i] = -Math.abs(vx[i]) * 0.5; }
      if (py[i] < 2) { py[i] = 2; vy[i] = Math.abs(vy[i]) * 0.5; }
      if (py[i] > H - 2) { py[i] = H - 2; vy[i] = -Math.abs(vy[i]) * 0.5; }
    }
  }

  /* 頂点バッファへ書き出し。extras は main が appendExtra で追加する */
  fillVerts(t) {
    const v = this.verts;
    const n = this.n;
    let j = 0;
    for (let i = 0; i < n; i++) {
      v[j] = this.px[i];
      v[j + 1] = this.py[i];
      let br = 1;
      if (this.mode[i] === 1) {
        br = 0.55 + 0.45 * Math.sin(t * this.pspd[i] + this.phase[i]);
      } else if (this.mode[i] === 2) {
        br = 0.85 + 0.3 * Math.sin(t * 3 + this.phase[i]);
      }
      v[j + 2] = this.size[i];
      v[j + 3] = this.colR[i] * br;
      v[j + 4] = this.colG[i] * br;
      v[j + 5] = this.colB[i] * br;
      j += 6;
    }
    this.vertCount = n;
    return n;
  }

  appendExtra(x, y, size, r, g, b) {
    const j = this.vertCount * 6;
    if (j + 6 > this.verts.length) return;
    const v = this.verts;
    v[j] = x; v[j + 1] = y; v[j + 2] = size;
    v[j + 3] = r; v[j + 4] = g; v[j + 5] = b;
    this.vertCount++;
  }
}
