'use strict';
/*
 * WebGL パーティクルレンダラ。
 * ・全粒子をポイントスプライトで加算合成描画
 * ・半解像度のピンポンFBOに残像（トレイル）を蓄積 → 本家のような光の尾
 * ・背景は空グラデーション＋オーロラの光をシェーダで直接描く
 * WebGLが使えない環境用に Canvas2D フォールバックも用意。
 */

const VERT_SRC = `
attribute vec2 aPos;
attribute float aSize;
attribute vec3 aColor;
uniform vec2 uRes;
uniform float uSizeScale;
varying vec3 vColor;
void main() {
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(aSize * uSizeScale, 1.0);
  vColor = aColor;
}`;

const FRAG_SRC = `
precision mediump float;
varying vec3 vColor;
uniform float uFall;
uniform float uIntensity;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, uFall);
  gl_FragColor = vec4(vColor * a * uIntensity, 1.0);
}`;

const QUAD_VERT = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const TEX_FRAG = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform float uMul;
void main() {
  gl_FragColor = vec4(texture2D(uTex, vUV).rgb * uMul, 1.0);
}`;

const BG_FRAG = `
precision mediump float;
varying vec2 vUV;
uniform vec3 uSky0;
uniform vec3 uSky1;
uniform vec3 uSky2;
uniform vec4 uGlowP[3];
uniform vec3 uGlowC[3];
uniform vec2 uRes;
uniform float uTime;
void main() {
  float y = 1.0 - vUV.y;
  vec3 c = y < 0.55 ? mix(uSky0, uSky1, y / 0.55) : mix(uSky1, uSky2, (y - 0.55) / 0.45);
  vec2 px = vec2(vUV.x * uRes.x, (1.0 - vUV.y) * uRes.y);
  for (int i = 0; i < 3; i++) {
    float d = distance(px, uGlowP[i].xy);
    float k = max(0.0, 1.0 - d / uGlowP[i].z);
    c += uGlowC[i] * (k * k * uGlowP[i].w);
  }
  c += (fract(sin(dot(vUV * 617.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.008;
  gl_FragColor = vec4(c, 1.0);
}`;

class GLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
    this.gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!this.gl) return;
    const gl = this.gl;
    this.ok = true;

    this.pointProg = this._prog(VERT_SRC, FRAG_SRC);
    this.texProg = this._prog(QUAD_VERT, TEX_FRAG);
    this.bgProg = this._prog(QUAD_VERT, BG_FRAG);

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.vertBuf = gl.createBuffer();
    this.texA = null; this.texB = null;
    this.fboA = null; this.fboB = null;
    this.tw = 0; this.th = 0;
    this.firstFrame = true;
    gl.disable(gl.DEPTH_TEST);
  }

  _prog(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const nm = info.name.replace('[0]', '');
      u[nm] = gl.getUniformLocation(p, info.name);
    }
    const a = {};
    const an = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < an; i++) {
      const info = gl.getActiveAttrib(p, i);
      a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return { p, u, a };
  }

  _mkTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  resize(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    const gl = this.gl;
    this.tw = Math.max(2, Math.round(W * dpr * 0.5));
    this.th = Math.max(2, Math.round(H * dpr * 0.5));
    const A = this._mkTarget(this.tw, this.th);
    const B = this._mkTarget(this.tw, this.th);
    this.texA = A.tex; this.fboA = A.fbo;
    this.texB = B.tex; this.fboB = B.fbo;
    this.firstFrame = true;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuf);
  }

  _drawQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _bindVerts(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuf);
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(prog.a.aSize);
    gl.vertexAttribPointer(prog.a.aSize, 1, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(prog.a.aColor);
    gl.vertexAttribPointer(prog.a.aColor, 3, gl.FLOAT, false, 24, 12);
  }

  /* frame = {verts, count, theme, auroras:[{x,y,r,intensity,colorF}], t, decay} */
  render(frame) {
    const gl = this.gl;
    const n = frame.count;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, frame.verts.subarray(0, n * 6), gl.DYNAMIC_DRAW);

    /* 1) トレイルFBO: 前フレームを減衰コピー → 粒子を加算 */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.viewport(0, 0, this.tw, this.th);
    gl.disable(gl.BLEND);
    if (this.firstFrame) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.firstFrame = false;
    } else {
      gl.useProgram(this.texProg.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texA);
      gl.uniform1i(this.texProg.u.uTex, 0);
      gl.uniform1f(this.texProg.u.uMul, frame.decay);
      this._drawQuad(this.texProg);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pointProg.p);
    gl.uniform2f(this.pointProg.u.uRes, this.W, this.H);
    gl.uniform1f(this.pointProg.u.uSizeScale, this.dpr * 0.5);
    gl.uniform1f(this.pointProg.u.uFall, 1.5);
    gl.uniform1f(this.pointProg.u.uIntensity, 0.38);
    this._bindVerts(this.pointProg);
    gl.drawArrays(gl.POINTS, 0, n);

    /* 2) 画面: 背景 → トレイル加算 → くっきりした粒子の芯 */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProg.p);
    const th = frame.theme;
    gl.uniform3fv(this.bgProg.u.uSky0, th.skyF[0]);
    gl.uniform3fv(this.bgProg.u.uSky1, th.skyF[1]);
    gl.uniform3fv(this.bgProg.u.uSky2, th.skyF[2]);
    const gp = new Float32Array(12), gc = new Float32Array(9);
    for (let i = 0; i < 3; i++) {
      const a = frame.auroras[i];
      gp[i * 4] = a.x; gp[i * 4 + 1] = a.y; gp[i * 4 + 2] = a.r; gp[i * 4 + 3] = a.intensity;
      gc[i * 3] = a.colorF[0]; gc[i * 3 + 1] = a.colorF[1]; gc[i * 3 + 2] = a.colorF[2];
    }
    gl.uniform4fv(this.bgProg.u.uGlowP, gp);
    gl.uniform3fv(this.bgProg.u.uGlowC, gc);
    gl.uniform2f(this.bgProg.u.uRes, this.W, this.H);
    gl.uniform1f(this.bgProg.u.uTime, frame.t);
    this._drawQuad(this.bgProg);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.texProg.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.uniform1i(this.texProg.u.uTex, 0);
    gl.uniform1f(this.texProg.u.uMul, 1.0);
    this._drawQuad(this.texProg);

    gl.useProgram(this.pointProg.p);
    gl.uniform2f(this.pointProg.u.uRes, this.W, this.H);
    gl.uniform1f(this.pointProg.u.uSizeScale, this.dpr * 0.62);
    gl.uniform1f(this.pointProg.u.uFall, 2.6);
    gl.uniform1f(this.pointProg.u.uIntensity, 0.85);
    this._bindVerts(this.pointProg);
    gl.drawArrays(gl.POINTS, 0, n);

    /* swap */
    const t = this.texA; this.texA = this.texB; this.texB = t;
    const f = this.fboA; this.fboA = this.fboB; this.fboB = f;
  }
}

/* ---- Canvas 2D フォールバック（WebGL不可の環境用・粒子少なめ） ---- */
class Canvas2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ok = !!this.ctx;
    this.gradTheme = null;
    this.grad = null;
  }
  resize(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = Math.min(dpr, 1.5);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.grad = null;
  }
  render(frame) {
    const g = this.ctx;
    const th = frame.theme;
    if (!this.grad || this.gradTheme !== th) {
      this.gradTheme = th;
      this.grad = g.createLinearGradient(0, 0, 0, this.H);
      this.grad.addColorStop(0, th.sky[0]);
      this.grad.addColorStop(0.55, th.sky[1]);
      this.grad.addColorStop(1, th.sky[2]);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.28;                       // 半透明で塗って残像に
    g.fillStyle = this.grad;
    g.fillRect(0, 0, this.W, this.H);
    g.globalAlpha = 0.15;
    for (const a of frame.auroras) {
      const rg = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r);
      const c = a.colorF.map(v => Math.round(v * 255));
      rg.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.intensity + ')');
      rg.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      g.fillStyle = rg;
      g.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    const v = frame.verts;
    for (let i = 0; i < frame.count; i++) {
      const o = i * 6;
      const r = Math.round(v[o + 3] * 255), gr = Math.round(v[o + 4] * 255), b = Math.round(v[o + 5] * 255);
      g.fillStyle = 'rgb(' + r + ',' + gr + ',' + b + ')';
      g.beginPath();
      g.arc(v[o], v[o + 1], Math.max(0.7, v[o + 2] * 0.32), 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
}
