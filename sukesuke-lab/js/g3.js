/* 写実3Dゲーム共通ヘルパー (Three.js)
 * ステージ生成・PBR素材・ヘリックスばね・後始末をまとめる。単位は mm。
 */
const G3 = {
  /* レンダラー/シーン/カメラ/オービットの一式を作る */
  createStage(stageEl, opts) {
    THREE.ColorManagement.legacyMode = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure || 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stageEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(opts.fov || 32, 1, 1, 20000);
    const orbit = {
      az: opts.az || 0.5,
      po: opts.po || 1.15,
      radius: opts.radius || 300,
      target: opts.target.clone(),
      azMin: opts.azMin != null ? opts.azMin : -0.5,
      azMax: opts.azMax != null ? opts.azMax : 1.25,
    };

    /* 環境マップ (映り込み) */
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const resize = () => {
      const w = stageEl.clientWidth, h = stageEl.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const a = w / h;
      orbit.radius = a >= 1 ? opts.radius : Math.min(opts.radiusMaxPortrait || opts.radius * 1.8, opts.radiusPortraitBase / a);
    };
    window.addEventListener('resize', resize);
    resize();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const setRay = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster;
    };

    const applyCamera = () => {
      const sp = new THREE.Spherical(orbit.radius, orbit.po, orbit.az);
      camera.position.setFromSpherical(sp).add(orbit.target);
      camera.lookAt(orbit.target);
    };

    /* テスト用: 最新ステージのワールド座標→スクリーン座標 */
    window.__proj = (x, y, z) => {
      applyCamera();
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height];
    };
    /* テスト用: 名前付きオブジェクトのスクリーン座標 */
    window.__pts = {};
    window.__pt = (name) => {
      const obj = window.__pts[name];
      if (!obj) return null;
      applyCamera();
      const v = new THREE.Vector3();
      obj.getWorldPosition(v);
      v.project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height];
    };

    const dispose = () => {
      window.removeEventListener('resize', resize);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
            m.dispose();
          });
        }
      });
      if (scene.background && scene.background.isTexture) scene.background.dispose();
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };

    return { renderer, scene, camera, orbit, setRay, applyCamera, resize, dispose };
  },

  /* 標準のキーライト + 補助光 */
  addLights(scene, opts) {
    const o = opts || {};
    const key = new THREE.DirectionalLight(o.color || 0xfff4e4, o.intensity || 1.05);
    key.position.copy(o.pos || new THREE.Vector3(300, 600, 400));
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = o.shadowSpan || 400;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.far = (o.pos ? o.pos.length() : 780) * 2.2;
    key.shadow.bias = -0.0004;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(o.sky || 0xdfe8f2, o.groundCol || 0x8a8378, o.hemi || 0.4));
    return key;
  },

  /* 上下グラデーションの背景テクスチャ */
  bgGradient(c0, c1, c2) {
    const cv = document.createElement('canvas');
    cv.width = 2;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, c0);
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  },

  /* 縦ヘリックスのばねカーブ */
  Helix: class extends THREE.Curve {
    constructor(y0, len, coils, r) {
      super();
      this.y0 = y0; this.len = len; this.coils = coils; this.r = r;
    }
    getPoint(t, target) {
      const p = target || new THREE.Vector3();
      const a = t * this.coils * Math.PI * 2;
      return p.set(Math.cos(a) * this.r, this.y0 + t * this.len, Math.sin(a) * this.r);
    }
  },

  /* 長さが変わったときだけジオメトリを作り直すばねメッシュ管理 */
  springMesh(parent, material, coils, coilR, wireR) {
    let mesh = null, shown = -1;
    return {
      update(y0, len) {
        if (Math.abs(len - shown) < 0.04) return;
        shown = len;
        const geo = new THREE.TubeGeometry(new G3.Helix(y0, len, coils, coilR), coils * 26, wireR, 8, false);
        if (mesh) {
          mesh.geometry.dispose();
          mesh.geometry = geo;
        } else {
          mesh = new THREE.Mesh(geo, material);
          mesh.castShadow = true;
          parent.add(mesh);
        }
        return mesh;
      },
      get mesh() { return mesh; },
    };
  },

  /* よく使うPBR素材セット (呼び出しごとに新規生成) */
  materials() {
    return {
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xf4fbff, metalness: 0, roughness: 0.06,
        transmission: 0.96, thickness: 1.6, ior: 1.5,
        clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
      }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8f959e, metalness: 0.95, roughness: 0.36, envMapIntensity: 0.85 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdadde2, metalness: 1, roughness: 0.15, envMapIntensity: 0.9 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb8903e, metalness: 1, roughness: 0.3, envMapIntensity: 0.9 }),
      whitePlastic: new THREE.MeshPhysicalMaterial({
        color: 0xeceae2, metalness: 0, roughness: 0.4,
        clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.5,
      }),
      darkPlastic: new THREE.MeshPhysicalMaterial({
        color: 0x2a2d33, metalness: 0, roughness: 0.45,
        clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.4,
      }),
      navy: new THREE.MeshPhysicalMaterial({
        color: 0x122a5e, metalness: 0, roughness: 0.42,
        clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.45,
      }),
      ceramic: new THREE.MeshPhysicalMaterial({
        color: 0xf6f5f1, metalness: 0, roughness: 0.12,
        clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.7,
      }),
      pom: new THREE.MeshStandardMaterial({ color: 0xded8c8, roughness: 0.5, envMapIntensity: 0.45 }),
    };
  },

  /* メッシュ追加の小道具 */
  add(parent, geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    parent.add(m);
    return m;
  },
};
