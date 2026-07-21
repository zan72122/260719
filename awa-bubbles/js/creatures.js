'use strict';
/* ================= 生き物たち =================
   ・プチリン：泡に閉じ込められた小さな生き物（助けるのが目標）
   ・ウニ：とげとげ。触れた泡は割れてしまう
   ・ジェリーカニ：ふちを歩き回り、ハサミの届く泡を割る
   ・ブループ：好奇心旺盛な魚。楽観/悲観コメントをくれる */

const Creatures = (() => {
  const freed = [];    // 解放されて泳いでいく生き物
  const urchins = [];  // {x,y,r,rot,drift,vx,vy,life}
  const crabs = [];    // {t,speed,x,y,reach,edge,pinch}
  let world = null;

  /* ---- ブループ ---- */
  const blupe = { active: false, x: 0, y: 0, dir: 1, t: 0, text: '', textT: 0, tail: 0 };
  const BLUPE_LINES = {
    hello: [
      'やあ！ぼくブループ。泡って いいよね〜',
      'きょうも海が きれいだね！',
      'ぷくぷく…きみ、泡のセンスあるね',
    ],
    clear: [
      'やったね！ぜったいできると思ってたよ！',
      'ほらね！ぼくの見立てどおり！',
      'きみは泡の天才かもしれない…！',
    ],
    fail: [
      'まあ…泡は はかないものだから…',
      'だいじょうぶ、海は逃げないよ。もう一回！',
      'ざんねん…でも次はいける気がする（たぶん）',
    ],
    chain: [
      'うわーっ！連鎖だ！きみ、楽観主義タイプだね！',
      'すごい連鎖…ぼくならためらってた。せっかちさん？',
      'ぱちぱちぱち！海じゅうに聞こえたよ！',
    ],
    idle: [
      'ゆっくりでいいんだよ〜',
      'ぼく、待つのはとくいなんだ',
      '泡をながめてるだけで しあわせ…',
    ],
    mud: [
      'うっ、にごっちゃった…まぜすぎ注意だよ',
      'にごり泡は 同じ色をたして きれいにできるよ',
    ],
  };

  function init(w) { world = w; }

  function reset() {
    freed.length = 0; urchins.length = 0; crabs.length = 0;
    blupe.active = false; blupe.textT = 0;
  }

  /* ---- ウニ ---- */
  function addUrchin(x, y, r, drift = false) {
    const u = { x, y, r, rot: Math.random() * TAU, drift, vx: 0, vy: 0, life: Infinity };
    if (drift) {
      u.vx = Util.rand(-14, 14); u.vy = Util.rand(-8, 8);
      u.life = 22;
    }
    urchins.push(u);
    return u;
  }

  /* ---- ジェリーカニ ---- */
  function addCrab(edge = 'bottom', speed = 0.06) {
    crabs.push({ t: Math.random(), speed, x: 0, y: 0, reach: 0, edge, pinch: 0, dir: 1 });
  }

  /* ---- 解放 ---- */
  function free(critter, x, y, scared = false) {
    freed.push({
      type: critter.type, x, y,
      vx: Util.rand(-20, 20), vy: Util.rand(-30, -10),
      t: 0, dur: Util.rand(2.2, 3.2), phase: Math.random() * TAU,
      scared, dir: Math.random() < 0.5 ? -1 : 1,
    });
  }

  function blupeSay(category) {
    const lines = BLUPE_LINES[category] || BLUPE_LINES.hello;
    blupe.active = true;
    blupe.t = 0;
    blupe.dir = Math.random() < 0.5 ? 1 : -1;
    const b = world.bounds;
    blupe.x = blupe.dir > 0 ? b.x - 80 : b.x + b.w + 80;
    blupe.y = b.y + b.h * Util.rand(0.2, 0.75);
    blupe.text = Util.pick(lines);
    blupe.textT = 5;
  }

  function update(dt) {
    const b = world.bounds;
    // ウニ
    for (let i = urchins.length - 1; i >= 0; i--) {
      const u = urchins[i];
      u.rot += dt * 0.3;
      if (u.drift) {
        u.life -= dt;
        u.x += u.vx * dt; u.y += u.vy * dt;
        u.vy += Math.sin(world.time * 0.7 + u.rot) * 6 * dt;
        if (u.x < b.x + u.r || u.x > b.x + b.w - u.r) u.vx *= -1;
        if (u.y < b.y + u.r || u.y > b.y + b.h - u.r) u.vy *= -1;
        u.x = Util.clamp(u.x, b.x + u.r, b.x + b.w - u.r);
        u.y = Util.clamp(u.y, b.y + u.r, b.y + b.h - u.r);
        if (u.life <= 0) { urchins.splice(i, 1); continue; }
      }
    }
    // カニ
    for (const c of crabs) {
      c.t += c.speed * c.dir * dt;
      if (c.t > 1) { c.t = 1; c.dir = -1; }
      if (c.t < 0) { c.t = 0; c.dir = 1; }
      const margin = world.R0 * 1.2;
      if (c.edge === 'bottom') {
        c.x = b.x + margin + (b.w - margin * 2) * c.t;
        c.y = b.y + b.h - world.R0 * 0.55;
      } else {
        c.x = b.x + margin + (b.w - margin * 2) * c.t;
        c.y = b.y + world.R0 * 0.55;
      }
      c.reach = world.R0 * 1.35;
      c.pinch = Math.max(0, c.pinch - dt * 3);
    }
    // 解放された生き物
    for (let i = freed.length - 1; i >= 0; i--) {
      const f = freed[i];
      f.t += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy -= 30 * dt; // 上へ泳いで逃げる
      f.vx += Math.sin(f.t * 5 + f.phase) * 30 * dt;
      if (Math.random() < dt * 6) Fx.bubbleTrail(f.x, f.y + 6);
      if (f.t > f.dur || f.y < b.y - 60) freed.splice(i, 1);
    }
    // ブループ
    if (blupe.active) {
      blupe.t += dt;
      blupe.tail += dt * 7;
      blupe.x += blupe.dir * 46 * dt;
      blupe.y += Math.sin(blupe.t * 1.6) * 14 * dt;
      blupe.textT -= dt;
      const off = 140;
      if (blupe.x < b.x - off || blupe.x > b.x + b.w + off) blupe.active = false;
    }
  }

  /* 泡が危険物に触れているか（ゲーム側から毎フレーム照会） */
  function checkHazard(bubble) {
    for (const u of urchins) {
      if (Util.dist(bubble.x, bubble.y, u.x, u.y) < bubble.r + u.r * 1.02) return 'urchin';
    }
    for (const c of crabs) {
      if (Util.dist(bubble.x, bubble.y, c.x, c.y) < bubble.r + c.reach * 0.45) { c.pinch = 1; return 'crab'; }
    }
    return null;
  }

  /* ---- 描画 ---- */
  function drawCritterFace(ctx, type, s, t) {
    // s = スケール, t = 時間（またたき用）
    const blink = (Math.sin(t * 1.7) > 0.96) ? 0.15 : 1;
    ctx.save();
    ctx.scale(s, s);
    if (type === 'fish') {
      ctx.fillStyle = '#ffb26b';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); // しっぽ
      ctx.moveTo(-9, 0); ctx.lineTo(-15, -5); ctx.lineTo(-15, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.ellipse(4, -1.5, 1.6, 1.6 * blink, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(5, 2, 2, 0.2, Math.PI - 0.6); ctx.stroke();
    } else if (type === 'star') {
      ctx.fillStyle = '#ffd66b';
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * TAU / 5;
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a + TAU / 10) * 4.6, Math.sin(a + TAU / 10) * 4.6);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a4213';
      ctx.beginPath(); ctx.ellipse(-2.4, 0.5, 1.3, 1.3 * blink, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.4, 0.5, 1.3, 1.3 * blink, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5a4213'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(0, 3, 1.8, 0.3, Math.PI - 0.3); ctx.stroke();
    } else { // tako
      ctx.fillStyle = '#f78fb3';
      ctx.beginPath(); ctx.arc(0, -2, 7.5, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.rect(-7.5, -2, 15, 4); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const lx = -6 + k * 4;
        ctx.beginPath();
        ctx.arc(lx + 1, 3 + Math.sin(t * 3 + k) * 0.8, 2, 0, Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = '#4a2438';
      ctx.beginPath(); ctx.ellipse(-2.6, -3, 1.4, 1.4 * blink, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.6, -3, 1.4, 1.4 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffc7dd';
      ctx.beginPath(); ctx.arc(0, -0.5, 1.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawInBubble(ctx, bubble, time) {
    if (!bubble.critters.length) return;
    const n = bubble.critters.length;
    for (let i = 0; i < n; i++) {
      const cr = bubble.critters[i];
      const off = n > 1 ? (i - (n - 1) / 2) * bubble.r * 0.55 : 0;
      const bob = Math.sin(time * 1.8 + bubble.phase + i * 2) * bubble.r * 0.08;
      const s = Util.clamp(bubble.r / 42, 0.55, 1.5);
      ctx.save();
      ctx.translate(bubble.x + off, bubble.y + bob + bubble.r * 0.05);
      drawCritterFace(ctx, cr.type, s, time + bubble.phase);
      ctx.restore();
    }
  }

  function draw(ctx, time) {
    // ウニ
    for (const u of urchins) {
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.rot);
      ctx.strokeStyle = '#2d2438';
      ctx.lineWidth = Util.clamp(u.r * 0.09, 1.5, 3);
      const spikes = 16;
      ctx.beginPath();
      for (let k = 0; k < spikes; k++) {
        const a = k * TAU / spikes;
        const wig = 1 + Math.sin(time * 2 + k * 2) * 0.06;
        ctx.moveTo(Math.cos(a) * u.r * 0.55, Math.sin(a) * u.r * 0.55);
        ctx.lineTo(Math.cos(a) * u.r * 1.18 * wig, Math.sin(a) * u.r * 1.18 * wig);
      }
      ctx.stroke();
      const grad = ctx.createRadialGradient(-u.r * 0.2, -u.r * 0.2, u.r * 0.1, 0, 0, u.r * 0.8);
      grad.addColorStop(0, '#5d4a75');
      grad.addColorStop(1, '#241c30');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, u.r * 0.72, 0, TAU); ctx.fill();
      // ちいさな目
      ctx.fillStyle = '#efe6ff';
      ctx.beginPath(); ctx.arc(-u.r * 0.2, -u.r * 0.08, u.r * 0.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(u.r * 0.2, -u.r * 0.08, u.r * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#241c30';
      ctx.beginPath(); ctx.arc(-u.r * 0.2, -u.r * 0.06, u.r * 0.045, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(u.r * 0.2, -u.r * 0.06, u.r * 0.045, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // カニ
    for (const c of crabs) {
      const s = world.R0 / 36;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s, s * (c.edge === 'top' ? -1 : 1));
      const wob = Math.sin(time * 8) * (Math.abs(c.dir) > 0 ? 2 : 0);
      // あし
      ctx.strokeStyle = '#c44569'; ctx.lineWidth = 2.4;
      for (let k = -1; k <= 1; k += 2) {
        for (let l = 0; l < 3; l++) {
          ctx.beginPath();
          ctx.moveTo(k * 8, 2 + l * 2);
          ctx.lineTo(k * (16 + l * 2), 8 + Math.sin(time * 8 + l * 2) * 2);
          ctx.stroke();
        }
      }
      // ハサミ
      const pinchA = 0.5 + c.pinch * 0.9;
      for (let k = -1; k <= 1; k += 2) {
        ctx.save();
        ctx.translate(k * 14, -8 + wob * 0.4);
        ctx.rotate(k * -0.5);
        ctx.fillStyle = '#e15b81';
        ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 5, 0, 0, TAU); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.arc(0, -3, 5.5, k * pinchA, k * pinchA + Math.PI * 0.7 * k, k < 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // 体（半透明ゼリー）
      const grad = ctx.createRadialGradient(-3, -6, 2, 0, -2, 15);
      grad.addColorStop(0, 'rgba(255,159,190,0.95)');
      grad.addColorStop(1, 'rgba(196,69,105,0.85)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(0, -2 + wob * 0.3, 12, 9, 0, 0, TAU); ctx.fill();
      // 目
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-4, -6, 2.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -6, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#42224a';
      ctx.beginPath(); ctx.arc(-4 + c.dir, -6, 1.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4 + c.dir, -6, 1.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 解放された生き物
    for (const f of freed) {
      const a = f.t < 0.2 ? f.t / 0.2 : f.t > f.dur - 0.5 ? Math.max(0, (f.dur - f.t) / 0.5) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(f.x, f.y);
      if (f.vx < 0) ctx.scale(-1, 1);
      drawCritterFace(ctx, f.type, 1.1, f.t * 2 + f.phase);
      if (!f.scared && Math.floor(f.t * 4) % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('♪', 12, -10);
      }
      ctx.restore();
    }
    // ブループ
    if (blupe.active) drawBlupe(ctx, time);
  }

  function drawBlupe(ctx, time) {
    ctx.save();
    ctx.translate(blupe.x, blupe.y);
    const flip = blupe.dir < 0;
    ctx.save();
    if (flip) ctx.scale(-1, 1);
    // 体
    const grad = ctx.createLinearGradient(0, -18, 0, 18);
    grad.addColorStop(0, '#7fd0ff');
    grad.addColorStop(1, '#3f8fd4');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 16, 0, 0, TAU); ctx.fill();
    // しっぽ
    const tw = Math.sin(blupe.tail) * 6;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-34, -10 + tw, -40, -14 + tw);
    ctx.quadraticCurveTo(-34, 0, -40, 12 + tw);
    ctx.quadraticCurveTo(-32, 8 + tw * 0.5, -22, 0);
    ctx.fill();
    // ひれ
    ctx.fillStyle = 'rgba(184,230,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 4); ctx.quadraticCurveTo(-6, 14 + tw * 0.4, -12, 12); ctx.quadraticCurveTo(-6, 6, 0, 4);
    ctx.fill();
    // 顔
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(12, -4, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1d3557';
    ctx.beginPath(); ctx.arc(13.5, -4, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(14.5, -5, 1, 0, TAU); ctx.fill();
    // くち
    ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(20, 3, 3.4, 0.4, Math.PI * 0.75); ctx.stroke();
    ctx.restore();
    // セリフ
    if (blupe.textT > 0 && blupe.text) {
      const alpha = Util.clamp(blupe.textT, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = `bold 13px 'Hiragino Maru Gothic ProN','BIZ UDGothic',system-ui,sans-serif`;
      const tw2 = ctx.measureText(blupe.text).width;
      const bx = 0, by = -46;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      const rx = bx - tw2 / 2 - 10, rw = tw2 + 20, ry = by - 14, rh = 28;
      ctx.roundRect(rx, ry, rw, rh, 14);
      ctx.moveTo(bx - 5, by + 14); ctx.lineTo(bx, by + 24); ctx.lineTo(bx + 7, by + 14);
      ctx.fill();
      ctx.fillStyle = '#1d3557';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(blupe.text, bx, by);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  return {
    init, reset, addUrchin, addCrab, free, blupeSay, update, draw, drawInBubble, checkHazard,
    urchins, crabs, freed,
    get blupeActive() { return blupe.active; },
  };
})();
