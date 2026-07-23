'use strict';
/* ============================================================
 * render3d-machines.js — 17種の装置の3Dビルダー（ガチ機械工場風）
 *  すべての装置は「常時稼働のアイドル動作」と
 *  「ドーナツ通過時（tile.pop = 1）の大アクション」を持つ。
 * ============================================================ */

(() => {
  const I = Render3D._internals;
  const T = I.T;
  const {
    mat, mkBox, mkCyl, mkSphere, textSprite, updateSpriteText,
    addGear, makeTank, makePiston, makeGantry, makeBase,
    arrowGeo, makeSpringGeo, makeStripeTexture, makeDrumTexture,
    makeLane, makeHalfLane, yawOf, cachedGeo,
    BUILDERS, gc, METAL, METAL_DARK, BOLT,
  } = I;

  const popK = tile => Math.sin(Math.min(1, tile.pop) * Math.PI);

  // 2点をつなぐパイプ
  function pipe(parent, ax, ay, az, bx, by, bz, r, hex) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const m = mkCyl(r, r, 1, hex, 8);
    m.scale.y = len;
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    const dir = new T.Vector3(bx - ax, by - ay, bz - az).normalize();
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    parent.add(m);
    return m;
  }

  // 前側コーナーに立つタンクタワー（柱 + タンク + かきまぜ機 + パイプ）
  function makeTankTower(view, lane, hex, windowHex, barY) {
    const tx = 28, tz = 30;
    const pillar = mkCyl(6, 7.5, 34, METAL, 8, true);
    pillar.position.set(tx, 27, tz);
    lane.add(pillar);
    const tank = makeTank(14, 20, hex, windowHex);
    tank.position.set(tx, 44, tz);
    lane.add(tank);
    const stir = new T.Group();
    const srod = mkCyl(2, 2, 12, BOLT, 6);
    srod.position.y = 6;
    stir.add(srod);
    const sblade = mkBox(17, 2.5, 4, METAL);
    sblade.position.y = 11;
    stir.add(sblade);
    stir.position.set(tx, 72, tz);
    lane.add(stir);
    view.spinners.push({ obj: stir, axis: 'y', speed: 4.2 });
    pipe(lane, tx - 6, 58, tz - 6, 0, barY || 66, 0, 3.4, METAL);
    return { tank, stir };
  }

  /* ---------------- ベルト ---------------- */
  BUILDERS.belt = (view, tile) => {
    const lane = makeLane(view, true);
    view.group.add(lane);
    view.update = () => {
      lane.rotation.y = yawOf(tile.dir) + tile.rotAnim * (Math.PI / 2);
    };
  };

  /* ---------------- スポナー（ドーナツ製造マシン＝こうじょうの入口） ---------------- */
  BUILDERS.spawner = (view, tile) => {
    const g = view.group;
    // スタートはみどりの床
    g.add(makeBase('#bce8b6'));
    const startPad = mkBox(100, 3, 100, '#a5dfa0');
    startPad.position.y = 1;
    g.add(startPad);
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // ドーナツ出口のひかるリング
    const exitRingM = new T.MeshBasicMaterial({ color: 0x57d957, transparent: true, opacity: 0.7, depthWrite: false });
    gc(exitRingM);
    const exitRing = new T.Mesh(cachedGeo('exitRing', () => new T.TorusGeometry(30, 3.2, 8, 28).rotateX(Math.PI / 2)), exitRingM);
    exitRing.position.y = BELT_TOP + 1.6;
    g.add(exitRing);
    // 大きな「🍩」かんばん
    const sign = new T.Group();
    for (const sx of [-20, 20]) {
      const pole = mkCyl(2.6, 3.2, 44, METAL, 8, true);
      pole.position.set(sx, 96, 0);
      sign.add(pole);
    }
    const boardBack = mkBox(52, 38, 4, '#57b357', true);
    boardBack.position.y = 126;
    sign.add(boardBack);
    const board = mkBox(46, 32, 4, '#ffffff', true);
    board.position.set(0, 126, 1.5);
    sign.add(board);
    const signDonut = new T.Mesh(cachedGeo('signDonut', () => new T.TorusGeometry(11, 6, 10, 18)), mat('#f4bd76'));
    signDonut.position.set(0, 126, 5.5);
    sign.add(signDonut);
    const signFrost = new T.Mesh(cachedGeo('signFrost', () => new T.TorusGeometry(11, 6.6, 10, 18)), mat('#ff9ec7'));
    signFrost.scale.z = 0.55;
    signFrost.position.set(0, 126, 7);
    sign.add(signFrost);
    sign.position.z = -34;
    g.add(sign);

    const rig = new T.Group();
    // 4本柱 + 天板
    for (const [cx, cz] of [[-28, -34], [28, -34], [-28, 34], [28, 34]]) {
      const col = mkCyl(4, 5, 66, METAL, 8, true);
      col.position.set(cx, 33, cz);
      rig.add(col);
    }
    const deck = mkBox(74, 10, 84, '#f3a9cd', true);
    deck.position.y = 70;
    rig.add(deck);
    // 生地タンク（まど付き）+ かきまぜ棒
    const tank = makeTank(21, 26, '#ff9ec7', '#ffd7e8');
    tank.position.y = 75;
    rig.add(tank);
    const stirrer = new T.Group();
    const rod = mkCyl(2.2, 2.2, 14, BOLT, 6);
    rod.position.y = 7;
    stirrer.add(rod);
    const blade = mkBox(24, 3, 5, METAL);
    blade.position.y = 14;
    stirrer.add(blade);
    stirrer.position.y = 75 + 26 + 8;
    rig.add(stirrer);
    view.spinners.push({ obj: stirrer, axis: 'y', speed: 3.4 });
    // ピストンポンプ
    const piston = makePiston(rig, -30, 76, 0, '#ff6f9c');
    // しぼり出しノズル
    const nozzle = mkCyl(6, 11, 18, '#ffd7e8', 10, true);
    nozzle.position.y = 58;
    rig.add(nozzle);
    // メーター（針つき）
    const dial = mkCyl(8, 8, 4, '#ffffff', 12);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 52, 44);
    rig.add(dial);
    const needle = mkBox(1.8, 7, 1, '#e05577');
    needle.position.set(0, 55, 46.5);
    rig.add(needle);
    // えんとつ
    const chimney = mkCyl(4.5, 5.5, 16, METAL_DARK, 8, true);
    chimney.position.set(28, 82, -30);
    rig.add(chimney);
    g.add(rig);
    view.popTarget = rig;

    let steamT = 0;
    view.update = (dt, time, game) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      piston.position.y = 76 - Math.max(0, Math.sin(time * 5)) * 4 - k * 9;
      nozzle.scale.set(1 + k * 0.45, 1 - k * 0.35, 1 + k * 0.45);
      tank.scale.y = 1 - k * 0.12;
      needle.rotation.z = Math.sin(time * 3.1) * 0.6 - k * 1.2;
      // 出口リングのパルス（ドーナツが出ると大きくひかる）
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      exitRingM.opacity = 0.35 + pulse * 0.3 + k * 0.4;
      const rs = 1 + pulse * 0.08 + k * 0.3;
      exitRing.scale.set(rs, 1, rs);
      // かんばんはカメラのほうを向いて、ゆらゆら
      sign.rotation.y = I.isRotated() ? Math.PI / 2 : 0;
      sign.rotation.z = Math.sin(time * 1.4) * 0.03;
      steamT -= dt;
      if (steamT <= 0) {
        steamT = 0.85;
        const c = tileCenter(tile);
        Particles.puff(c.x + 28, c.y - 30, 2, '#ffffff');
      }
    };
  };

  /* ---------------- ボックス（ゴール＝はいたつトラック） ---------------- */
  BUILDERS.box = (view, tile) => {
    const g = view.group;
    // ゴールは赤いじゅうたん
    g.add(makeBase('#ff9d9d'));
    const carpet = mkBox(100, 3, 100, '#f57d7d');
    carpet.position.y = 1;
    g.add(carpet);
    for (const s of [-1, 1]) {
      const stripe = mkBox(100, 3.4, 7, '#ffffff');
      stripe.position.set(0, 1.2, s * 44);
      g.add(stripe);
      const stripe2 = mkBox(7, 3.4, 100, '#ffffff');
      stripe2.position.set(s * 44, 1.2, 0);
      g.add(stripe2);
    }

    // トラックの向き = いちばん近いボードのはし（そこから走り去る）
    const dists = [
      Game.cols - 1 - tile.x,   // E
      Game.rows - 1 - tile.y,   // S
      tile.x,                   // W
      tile.y,                   // N
    ];
    let facing = 0;
    for (let d = 1; d < 4; d++) if (dists[d] < dists[facing]) facing = d;
    const fx = DX[facing], fz = DY[facing];

    // トラック本体（ローカル +x が前）
    const truck = new T.Group();
    // シャシー + 荷台（ドーナツを受ける箱）
    const chassis = mkBox(84, 8, 52, METAL_DARK, true);
    chassis.position.y = 12;
    truck.add(chassis);
    const bedBottom = mkBox(56, 5, 52, '#ff8f8f', true);
    bedBottom.position.set(-12, 17, 0);
    truck.add(bedBottom);
    for (const [bx2, bz, w, d] of [[-38, 0, 6, 52], [14, 0, 6, 52], [-12, -24, 58, 6], [-12, 24, 58, 6]]) {
      const wall = mkBox(w, 22, d, '#ff8f8f', true);
      wall.position.set(bx2, 28, bz);
      truck.add(wall);
    }
    // キャビン（うんてんせき）
    const cab = mkBox(26, 26, 44, '#f56b6b', true);
    cab.position.set(30, 26, 0);
    truck.add(cab);
    const cabTop = mkBox(24, 16, 40, '#ff8f8f', true);
    cabTop.position.set(28, 46, 0);
    truck.add(cabTop);
    const windshield = mkBox(4, 12, 32, '#cfeaf5');
    windshield.position.set(41, 46, 0);
    truck.add(windshield);
    // ヘッドライト
    const lightM = new T.MeshBasicMaterial({ color: 0xfff2a8 });
    gc(lightM);
    for (const s of [-1, 1]) {
      const hl = new T.Mesh(cachedGeo('lamp', () => new T.SphereGeometry(3.2, 8, 6)), lightM);
      hl.position.set(44, 22, s * 16);
      truck.add(hl);
    }
    // タイヤ4本
    const wheels = [];
    for (const [wx2, wz] of [[-28, -27], [-28, 27], [30, -27], [30, 27]]) {
      const wheel = mkCyl(9, 9, 7, '#6b6478', 12, true);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx2, 9, wz);
      truck.add(wheel);
      const hubcap = mkCyl(4, 4, 8.5, BOLT, 8);
      hubcap.rotation.x = Math.PI / 2;
      hubcap.position.set(wx2, 9, wz);
      truck.add(hubcap);
      wheels.push(wheel, hubcap);
    }
    // なかのミニドーナツ + カウント
    const minis = [];
    const miniGeo = cachedGeo('miniDonut', () => new T.TorusGeometry(9, 5.5, 8, 14).rotateX(Math.PI / 2));
    const miniCols = ['#ff9ec7', '#8a5a3b', '#9edcff'];
    for (let i = 0; i < 3; i++) {
      const md = new T.Mesh(miniGeo, mat(miniCols[i]));
      md.position.set(-26 + i * 14, 24, 0);
      md.visible = false;
      truck.add(md);
      minis.push(md);
    }
    const label = textSprite('0', 36, { color: '#c04b4b', strokeStyle: '#ffffff' });
    label.position.set(-12, 62, 0);
    truck.add(label);
    truck.rotation.y = yawOf(facing);
    g.add(truck);

    // ゴールの旗ガーランド（トラックのうしろがわ＝入口）
    const flagG = new T.Group();
    for (const s of [-1, 1]) {
      const pole = mkCyl(2.2, 2.8, 52, '#ffffff', 8, true);
      pole.position.set(-46, 26, s * 46);
      flagG.add(pole);
    }
    const flagCols = ['#ff6f6f', '#ffd94d', '#7ce27c', '#5cc8ff', '#ff9ec7'];
    for (let i = 0; i < 5; i++) {
      const flag = new T.Mesh(cachedGeo('pennant', () => new T.ConeGeometry(6.5, 16, 4)), mat(flagCols[i]));
      const t = i / 4;
      flag.position.set(-46, 48 - Math.sin(t * Math.PI) * 7, -46 + t * 92);
      flag.rotation.z = Math.PI;
      flagG.add(flag);
    }
    flagG.rotation.y = yawOf(facing);
    const fc = tileCenter(tile);
    // フラッグは回転しない位置（タイルローカル）なのでトラックと同じ向きに
    g.add(flagG);
    // ビーコン（回る星）
    const star = new T.Mesh(cachedGeo('deco-star', () => new T.OctahedronGeometry(11)), mat('#ffd94d'));
    star.scale.set(0.8, 0.55, 0.8);
    star.position.set(-42, 8, -42);
    g.add(star);
    view.spinners.push({ obj: star, axis: 'y', speed: 2.2 });
    view.popTarget = truck;

    let lastOff = 0, dustT = 0;
    view.update = (dt, time) => {
      // 出荷: クラクション→発車→あたらしいトラックがバック搬入
      let off = 0;
      const s = tile.shipT;
      if (s > 0) {
        if (s > 0.55) off = easeInCubic((1 - s) / 0.45) * 460;
        else off = 460 * easeInCubic(s / 0.55);
      }
      truck.position.set(fx * off, 0, fz * off);
      // はしっている間はタイヤが回り、ほこりが出る
      const moving = Math.abs(off - lastOff);
      if (moving > 0.5) {
        for (const w of wheels) w.rotation.z -= moving * 0.05;
        dustT -= dt;
        if (dustT <= 0) {
          dustT = 0.08;
          Particles.puff(fc.x + fx * (off - 40), fc.y + fz * (off - 40), 2, '#e8ddd0');
        }
      }
      lastOff = off;
      updateSpriteText(label, String(tile.count), { color: '#c04b4b', strokeStyle: '#ffffff' });
      for (let i = 0; i < 3; i++) minis[i].visible = i < Math.min(3, tile.count);
    };
  };

  /* ---------------- フロスター（フロスティング・ステーション） ---------------- */
  BUILDERS.froster = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#fdeaf4'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);

    const colorMat = new T.MeshToonMaterial({ color: new T.Color(FROST_COLORS[tile.color].fill), gradientMap: I.gradientTex });
    const edgeMat = new T.MeshToonMaterial({ color: new T.Color(FROST_COLORS[tile.color].edge), gradientMap: I.gradientTex });
    gc(colorMat); gc(edgeMat);

    const gantry = makeGantry('#ffffff', '#e8b8d2');
    gantry.userData.bar.material = colorMat;
    lane.add(gantry);
    // 前側コーナーのタンクタワー（かきまぜ機つき）
    const tower = makeTankTower(view, lane, '#ffffff', null, 62);
    const tank = tower.tank;
    tank.children[0].material = colorMat;
    tank.children[1].material = colorMat;
    // 側面の駆動歯車
    addGear(view, lane, 8, 12, '#e8b8d2', 2.6, { x: -26, y: 20, z: LANE_W / 2 + 14, depth: 5 });
    // ノズル3本 + 噴射ストリーム
    const nozzles = [], streams = [];
    for (let i = -1; i <= 1; i++) {
      const nz = new T.Mesh(cachedGeo('nozzle', () => new T.CylinderGeometry(3, 6.5, 12, 8)), edgeMat);
      nz.position.set(0, 48, i * 17);
      lane.add(nz);
      nozzles.push(nz);
      const st = new T.Mesh(cachedGeo('stream', () => {
        const s = new T.CylinderGeometry(2.6, 3.4, 1, 6);
        s.translate(0, -0.5, 0);
        return s;
      }), colorMat);
      st.position.set(0, 44, i * 17);
      st.visible = false;
      lane.add(st);
      streams.push(st);
    }
    // したたり
    const drips = [];
    for (let i = -1; i <= 1; i++) {
      const dr = new T.Mesh(cachedGeo('drip', () => new T.SphereGeometry(5, 8, 7)), edgeMat);
      dr.position.set(0, 40, i * 17);
      dr.scale.set(0.8, 1.4, 0.8);
      lane.add(dr);
      drips.push(dr);
    }

    let lastColor = tile.color;
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      if (lastColor !== tile.color) {
        lastColor = tile.color;
        colorMat.color.set(FROST_COLORS[tile.color].fill);
        edgeMat.color.set(FROST_COLORS[tile.color].edge);
      }
      const k = popK(tile);
      nozzles.forEach((nz, i) => { nz.position.y = 48 - k * 7 - Math.max(0, Math.sin(time * 4 + i * 2)) * 1.5; });
      streams.forEach((st, i) => {
        st.visible = k > 0.05;
        st.scale.y = k * 18;
        st.position.y = 42 - i * 0;
      });
      tank.scale.set(1 + k * 0.08, 1 - k * 0.14, 1 + k * 0.08);
      drips.forEach((dr, i) => {
        dr.position.y = 40 - Math.max(0, Math.sin(time * 2.2 + i * 2.1 + tile.x)) * 6;
      });
    };
  };

  /* ---------------- スプリンクラー（スプリンクル・シャワー） ---------------- */
  BUILDERS.sprinkler = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#fdf6e0'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    const gantry = makeGantry('#ffe9b8', '#e0c070');
    lane.add(gantry);
    // じょうご（ホッパー）
    const funnel = mkCyl(20, 8, 22, '#ffffff', 12, true);
    funnel.position.y = 84;
    lane.add(funnel);
    addGear(view, lane, 9, 10, '#e0c070', 3.0, { flat: true, x: 0, y: 97, z: 0, depth: 4 });
    // 回転ドラム（バーの下・ドーナツのすぐ上で回る）
    const drumHolder = new T.Group();
    drumHolder.rotation.x = Math.PI / 2;
    drumHolder.position.y = 47;
    lane.add(drumHolder);
    const drumTexHolder = { tex: null };
    const drumMat = new T.MeshToonMaterial({ gradientMap: I.gradientTex });
    gc(drumMat);
    const drum = new T.Mesh(cachedGeo('sprinkDrum', () => new T.CylinderGeometry(9, 9, 30, 12)), drumMat);
    drum.castShadow = true;
    drumHolder.add(drum);
    view.spinners.push({ obj: drum, axis: 'y', speed: 2.4 });
    // じょうごのふちのスプリンクル
    const bits = new T.Group();
    bits.position.y = 92;
    lane.add(bits);
    let lastStyle = null;
    const rebuild = () => {
      lastStyle = tile.style;
      const style = SPRINKLE_STYLES[tile.style];
      if (drumTexHolder.tex) drumTexHolder.tex.dispose();
      drumTexHolder.tex = makeDrumTexture(style.colors);
      gc(drumTexHolder.tex);
      drumMat.map = drumTexHolder.tex;
      drumMat.needsUpdate = true;
      while (bits.children.length) bits.remove(bits.children[0]);
      for (let i = 0; i < 6; i++) {
        const b = new T.Mesh(cachedGeo('bit', () => new T.BoxGeometry(8, 3, 3)), mat(style.colors[i % style.colors.length]));
        const a = (i / 6) * TAU;
        b.position.set(Math.cos(a) * 13, 0, Math.sin(a) * 13);
        b.rotation.y = a;
        bits.add(b);
      }
    };
    rebuild();
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      if (lastStyle !== tile.style) rebuild();
      const k = popK(tile);
      funnel.rotation.z = Math.sin(time * 9) * 0.05 + k * Math.sin(time * 40) * 0.12;
      funnel.position.y = 82 + Math.sin(time * 9 + 1) * 1.2;
    };
  };

  /* ---------------- クリーマー（ホイップ・プレス） ---------------- */
  BUILDERS.creamer = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#eaf6fc'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    const gantry = makeGantry('#dff2fb', '#a8cede');
    lane.add(gantry);
    // 前側コーナーのクリームタンク + ポンプ
    const tower = makeTankTower(view, lane, '#ffffff', '#fffdf6', 62);
    const tank = tower.tank;
    const pump = makePiston(lane, -28, 12, 30, '#5cc8ff');
    addGear(view, lane, 7, 10, '#a8cede', -3.4, { x: -26, y: 20, z: LANE_W / 2 + 14, depth: 5 });
    // ぐるぐる動くノズルユニット
    const nozzleUnit = new T.Group();
    const ncone = mkCyl(2.5, 7, 14, '#fffdf6', 8, true);
    nozzleUnit.add(ncone);
    const ntip = mkCyl(1.5, 3, 6, '#a8cede', 6);
    ntip.position.y = -9;
    nozzleUnit.add(ntip);
    nozzleUnit.position.y = 49;
    lane.add(nozzleUnit);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      pump.position.y = 12 - Math.max(0, Math.sin(time * 6)) * 5 - k * 6;
      if (k > 0.05) {
        // 通過時: らせんをえがいて大しぼり
        const ang = (1 - tile.pop) * TAU * 2.5;
        const rad = 15 * k;
        nozzleUnit.position.set(Math.cos(ang) * rad, 49 - k * 8, Math.sin(ang) * rad);
      } else {
        // アイドル: ちいさな円をゆっくり
        nozzleUnit.position.set(Math.cos(time * 1.6) * 5, 49, Math.sin(time * 1.6) * 5);
      }
    };
  };

  /* ---------------- トッパー（ロボットアーム） ---------------- */
  BUILDERS.topper = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#ffe9ec'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // 台座 + ターンテーブル
    const pedestal = mkCyl(14, 17, 28, '#e898a5', 12, true);
    pedestal.position.set(0, 14, -(LANE_W / 2 + 20));
    lane.add(pedestal);
    addGear(view, lane, 11, 14, '#ffd7dc', 1.2, { flat: true, x: 0, y: 29, z: -(LANE_W / 2 + 20), depth: 4 });
    // アーム（肩ピボット）
    const shoulder = new T.Group();
    shoulder.position.set(0, 34, -(LANE_W / 2 + 20));
    lane.add(shoulder);
    const upper = mkBox(9, 9, 34, '#ff9ec7', true);
    upper.position.set(0, 8, 15);
    shoulder.add(upper);
    const elbow = new T.Group();
    elbow.position.set(0, 12, 30);
    shoulder.add(elbow);
    const fore = mkBox(7, 7, 26, '#ffd7dc', true);
    fore.position.set(0, -4, 11);
    elbow.add(fore);
    // クロー + アイテム
    const claw = new T.Group();
    claw.position.set(0, -8, 22);
    elbow.add(claw);
    for (const s of [-1, 1]) {
      const finger = mkBox(3, 10, 3, METAL);
      finger.position.set(s * 5, -3, 0);
      finger.rotation.z = s * 0.3;
      claw.add(finger);
    }
    let itemHolder = new T.Group();
    itemHolder.position.y = -8;
    claw.add(itemHolder);
    let lastKind = null;
    const rebuildItem = () => {
      lastKind = tile.kind;
      while (itemHolder.children.length) itemHolder.remove(itemHolder.children[0]);
      const icon = Donut3D.buildTopper(tile.kind);
      icon.scale.set(1.3, 1.3, 1.3);
      itemHolder.add(icon);
    };
    rebuildItem();
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      if (lastKind !== tile.kind) rebuildItem();
      const k = popK(tile);
      // アイドル: ゆらゆら。通過時: ガシャンとふりおろす
      shoulder.rotation.x = -0.35 + Math.sin(time * 1.8) * 0.08 + k * 0.75;
      elbow.rotation.x = 0.2 + Math.sin(time * 1.8 + 1) * 0.06 + k * 0.35;
      claw.children[0].rotation.z = -0.3 - k * 0.35;
      claw.children[1].rotation.z = 0.3 + k * 0.35;
    };
  };

  /* ---------------- グレーザー（グレーズ・シャワー） ---------------- */
  BUILDERS.glazer = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#fdf4e2'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    const gantry = makeGantry('#ffeacb', '#e0c080');
    lane.add(gantry);
    // 前側コーナーのグレーズタンク + 横向きスクリューコンベア
    makeTankTower(view, lane, '#ffdf9e', '#fff3d8', 62);
    const screwHolder = new T.Group();
    screwHolder.rotation.x = Math.PI / 2;
    screwHolder.position.set(0, 80, 8);
    lane.add(screwHolder);
    const screw = new T.Mesh(makeSpringGeo(5, 6, 34, 2.2), mat('#e0c080'));
    screw.position.y = -17;
    screwHolder.add(screw);
    view.spinners.push({ obj: screw, axis: 'y', speed: 5 });
    // シャワーヘッド
    const head = mkBox(26, 8, LANE_W - 6, '#fff3d8', true);
    head.position.y = 50;
    lane.add(head);
    // グレーズの滝
    const cg = cachedGeo('curtain', () => new T.PlaneGeometry(LANE_W + 14, 34));
    const cm = new T.MeshPhongMaterial({
      color: 0xfff0d8, transparent: true, opacity: 0.5,
      side: T.DoubleSide, depthWrite: false, shininess: 120,
    });
    gc(cm);
    const curtain = new T.Mesh(cg, cm);
    curtain.rotation.y = Math.PI / 2;
    curtain.position.y = 30;
    lane.add(curtain);
    const spark = textSprite('✨', 30);
    spark.position.y = 96;
    lane.add(spark);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      cm.opacity = 0.42 + Math.sin(time * 4 + tile.y) * 0.1 + k * 0.3;
      curtain.scale.set(1 + k * 0.6, 1 + Math.sin(time * 6 + tile.x) * 0.04 + k * 0.15, 1);
      head.position.y = 50 - k * 4;
    };
  };

  /* ---------------- スタンパー（メガプレス） ---------------- */
  BUILDERS.stamper = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#efe8fc'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // 4本の支柱 + 天板
    for (const [cx, cz] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) {
      const col = mkCyl(5, 6, 92, METAL, 8, true);
      col.position.set(cx, 46, cz);
      g.add(col);
      const spring = new T.Mesh(makeSpringGeo(3, 8, 18, 1.8), mat('#c9b3ef'));
      spring.position.set(cx, 10, cz);
      g.add(spring);
    }
    const crown = mkBox(84, 14, 84, '#c9b3ef', true);
    crown.position.y = 96;
    g.add(crown);
    addGear(view, g, 10, 12, '#a488d6', 2.8, { x: -46, y: 96, z: 0, depth: 5 });
    addGear(view, g, 7, 10, '#c9b3ef', -4.0, { x: -46, y: 82, z: 0, depth: 5 });
    // 油圧シリンダー2本（ロッドはヘッドに追従）
    const rods = [];
    for (const rx of [-20, 20]) {
      const housing = mkCyl(8, 9, 16, METAL_DARK, 10, true);
      housing.position.set(rx, 86, 0);
      g.add(housing);
      const rod = mkCyl(4, 4, 1, BOLT, 8);
      g.add(rod);
      rod.userData.rx = rx;
      rods.push(rod);
    }
    // プレスヘッド
    const head = new T.Group();
    const block = mkBox(62, 24, 62, '#c9b3ef', true);
    head.add(block);
    const cutter = mkBox(46, 8, 46, '#e6dcfa', true);
    cutter.position.y = -16;
    head.add(cutter);
    const shapeIcon = textSprite('⭐', 40, { px: 84 });
    shapeIcon.position.y = 22;
    head.add(shapeIcon);
    head.position.y = 68;
    g.add(head);
    const SHAPE_EMOJI = { star: '⭐', heart: '💗', flower: '🌸', ring: '⭕' };
    view.update = () => {
      lane.rotation.y = yawOf(tile.dir);
      // するどく落ちて、ゆっくり戻る
      const p = Math.min(1, tile.pressT);
      const press = p > 0.72 ? (1 - p) / 0.28 : Math.pow(p / 0.72, 0.7);
      const headY = 68 - press * 26;
      head.position.y = headY;
      for (const rod of rods) {
        const top = 86, bottom = headY + 12;
        rod.scale.y = Math.max(1, top - bottom);
        rod.position.set(rod.userData.rx, (top + bottom) / 2, 0);
      }
      updateSpriteText(shapeIcon, SHAPE_EMOJI[tile.shape] || '⭐', { px: 84 });
    };
  };

  /* ---------------- スプリッター（ポイント切替機） ---------------- */
  BUILDERS.splitter = (view, tile) => {
    const g = view.group;
    for (const d of tile.outs) g.add(makeHalfLane(view, d));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    g.add(makeBase('#e3f2fc'));
    // モーターボックス + フライホイール
    const motor = mkBox(22, 18, 20, METAL, true);
    motor.position.set(-38, 22, -38);
    g.add(motor);
    addGear(view, g, 9, 12, '#5cabdf', 5.5, { x: -38, y: 22, z: -26, depth: 5 });
    // 切替パドル（ピボットボルトつき）
    const paddleG = new T.Group();
    const paddle = new T.Mesh(arrowGeo(0.9, 10), mat('#5cabdf'));
    paddle.castShadow = true;
    paddleG.add(paddle);
    const pivotBolt = mkCyl(5, 5, 14, BOLT, 8);
    pivotBolt.position.y = 4;
    paddleG.add(pivotBolt);
    paddleG.position.y = 22;
    g.add(paddleG);
    view.update = () => {
      const target = yawOf(tile.outs[tile.flip]);
      const wig = Math.sin(tile.paddleAnim * Math.PI) * 0.55;
      paddleG.rotation.y = target + wig;
    };
  };

  /* ---------------- スイッチャー（きりかえレバー） ---------------- */
  BUILDERS.switcher = (view, tile) => {
    const g = view.group;
    for (const d of tile.outs) g.add(makeHalfLane(view, d));
    g.add(makeBase('#fff1d2'));
    // ラチェット歯車（切替時にまわる）
    const ratchet = new T.Mesh(I.gearGeo(16, 14, 5), mat('#ecca7c'));
    ratchet.rotation.x = -Math.PI / 2;
    ratchet.position.y = 12;
    g.add(ratchet);
    // おおきな光る矢印
    const am = new T.MeshToonMaterial({
      color: new T.Color('#ffb840'), gradientMap: I.gradientTex,
      emissive: new T.Color('#ff9500'), emissiveIntensity: 0.25,
    });
    gc(am);
    const arrow = new T.Mesh(arrowGeo(1.05, 14), am);
    arrow.castShadow = true;
    arrow.position.y = 22;
    g.add(arrow);
    // レバー
    const lever = new T.Group();
    const lrod = mkCyl(2.5, 3, 26, METAL, 8, true);
    lrod.position.y = 13;
    lever.add(lrod);
    const ball = mkSphere(6.5, '#ff6f6f', 10, true);
    ball.position.y = 27;
    lever.add(ball);
    lever.position.set(-38, 10, 38);
    g.add(lever);
    view.update = (dt, time) => {
      const target = yawOf(tile.outs[tile.idx]);
      const wig = Math.sin(tile.paddleAnim * Math.PI) * 0.6;
      arrow.rotation.y = target + wig;
      ratchet.rotation.z -= tile.paddleAnim * dt * 22;
      am.emissiveIntensity = 0.18 + 0.16 * Math.sin(time * 3);
      arrow.position.y = 22 + Math.sin(time * 3) * 1.5;
      lever.rotation.x = (tile.idx === 0 ? -0.4 : 0.4) + Math.sin(tile.paddleAnim * Math.PI) * 0.3;
    };
  };

  /* ---------------- クローナー（コピー・チェンバー） ---------------- */
  BUILDERS.cloner = (view, tile) => {
    const g = view.group;
    g.add(makeHalfLane(view, tile.side));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    g.add(makeBase('#e2f6e2'));
    const gantry = makeGantry('#c9efc9', '#8ec98e');
    lane.add(gantry);
    // ガラス管2本 + なかのドーナツ
    const glassMat = new T.MeshPhongMaterial({
      color: 0xd8ffe0, transparent: true, opacity: 0.35, shininess: 100, depthWrite: false,
    });
    gc(glassMat);
    const tubes = [];
    for (const s of [-1, 1]) {
      const tube = new T.Mesh(cachedGeo('cloneTube', () => new T.CylinderGeometry(13, 13, 32, 12, 1, true)), glassMat);
      tube.position.set(0, 88, s * 15);
      lane.add(tube);
      tubes.push(tube);
      const cap = mkCyl(14, 14, 4, '#8ec98e', 12, true);
      cap.position.set(0, 106, s * 15);
      lane.add(cap);
      const md = new T.Mesh(cachedGeo('miniDonut', () => new T.TorusGeometry(9, 5.5, 8, 14).rotateX(Math.PI / 2)), mat('#ff9ec7'));
      md.position.set(0, 86, s * 15);
      md.userData.side = s;
      lane.add(md);
      tubes.push(md);
    }
    // テスラ球 + コイル
    const orb = mkSphere(7, '#aef2ae', 12, true);
    orb.position.y = 116;
    lane.add(orb);
    view.spinners.push({ obj: orb, axis: 'y', speed: 6 });
    const coilHolder = new T.Group();
    coilHolder.rotation.x = Math.PI / 2;
    coilHolder.position.set(0, 100, 0);
    lane.add(coilHolder);
    const coil = new T.Mesh(makeSpringGeo(4, 4, 22, 1.6), mat('#7bd47b'));
    coil.position.y = -11;
    coilHolder.add(coil);
    view.spinners.push({ obj: coil, axis: 'y', speed: 8 });
    // 電気アーク（ジグザグ線）
    const arcMat = new T.LineBasicMaterial({ color: 0xbaffba, transparent: true, opacity: 0.6 });
    gc(arcMat);
    const arcGeo = new T.BufferGeometry();
    const arcPts = new Float32Array(12 * 3);
    arcGeo.setAttribute('position', new T.BufferAttribute(arcPts, 3));
    gc(arcGeo);
    const arcs = new T.LineSegments(arcGeo, arcMat);
    lane.add(arcs);
    let arcT = 0;
    const x2 = textSprite('×2', 30, { color: '#3f8f3f', strokeStyle: '#ffffff' });
    x2.position.y = 62;
    lane.add(x2);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      // アーク: ちりちり更新
      arcT -= dt;
      if (arcT <= 0) {
        arcT = 0.07;
        let p = 0;
        for (let seg = 0; seg < 2; seg++) {
          let prev = [rand(-4, 4), 96 + seg * 8, -13];
          for (let i = 0; i < 3; i++) {
            const next = [rand(-6, 6), 96 + seg * 8 + rand(-4, 4), -13 + (i + 1) * (26 / 3)];
            arcPts[p++] = prev[0]; arcPts[p++] = prev[1]; arcPts[p++] = prev[2];
            arcPts[p++] = next[0]; arcPts[p++] = next[1]; arcPts[p++] = next[2];
            prev = next;
          }
        }
        arcGeo.attributes.position.needsUpdate = true;
      }
      arcMat.opacity = 0.35 + Math.sin(time * 12) * 0.2 + k * 0.45;
      glassMat.opacity = 0.35 + k * 0.3;
      // なかのミニドーナツがぽよぽよ
      for (const t of tubes) {
        if (t.userData && t.userData.side !== undefined) {
          t.position.y = 86 + Math.sin(time * 3 + t.userData.side) * 4 + k * 8;
          t.rotation.y = time * (1.5 + k * 8);
        }
      }
    };
  };

  /* ---------------- ランダマイザー（ガチャガチャ・ミキサー） ---------------- */
  BUILDERS.random = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#f8e6fc'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    const gantry = makeGantry('#f3c9fb', '#cf8fdf');
    lane.add(gantry);
    // ハウジング + 回転ドラム
    const housing = mkBox(34, 30, 44, '#e6aef2', true);
    housing.position.y = 88;
    lane.add(housing);
    const drumHolder = new T.Group();
    drumHolder.rotation.x = Math.PI / 2;
    drumHolder.position.y = 88;
    lane.add(drumHolder);
    const drumTex = makeDrumTexture(['#ff6f9c', '#ffb84d', '#7ce27c', '#5cc8ff', '#c99cff']);
    gc(drumTex);
    const drumMat2 = new T.MeshToonMaterial({ map: drumTex, gradientMap: I.gradientTex });
    gc(drumMat2);
    const drum = new T.Mesh(cachedGeo('gachaDrum', () => new T.CylinderGeometry(12, 12, 30, 12)), drumMat2);
    drumHolder.add(drum);
    view.spinners.push({ obj: drum, axis: 'y', speed: 1.6 });
    // チカチカ・チェイスライト
    const brightM = new T.MeshBasicMaterial({ color: 0xfff06a });
    const dimM = new T.MeshBasicMaterial({ color: 0xb98fc4 });
    gc(brightM); gc(dimM);
    const lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new T.Mesh(cachedGeo('lamp', () => new T.SphereGeometry(3.2, 8, 6)), dimM);
      const a = (i / 8) * TAU;
      l.position.set(19, 88 + Math.sin(a) * 18, Math.cos(a) * 24);
      lane.add(l);
      lights.push(l);
    }
    const q = textSprite('?', 40, { color: '#8f3fa5', strokeStyle: '#ffffff' });
    q.position.y = 116;
    lane.add(q);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const spin = tile.spinAnim;
      drum.rotation.y += spin * dt * 28;
      const speed = 6 + spin * 30;
      lights.forEach((l, i) => {
        l.material = ((time * speed + i) % 8) < 2 ? brightM : dimM;
      });
      q.material.rotation = spin * TAU * 2;
      q.position.y = 116 + Math.sin(time * 3 + tile.x) * 3;
    };
  };

  /* ---------------- ワイルド（ルーレット・ターンテーブル） ---------------- */
  BUILDERS.wild = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#e6e2fa'));
    const lane = makeLane(view, false);
    g.add(lane);
    // 回転プラッター
    const platter = new T.Group();
    const disc = mkCyl(41, 44, 7, '#cfc6ee', 20, true);
    disc.position.y = 3.5;
    platter.add(disc);
    const cols = ['#ff9ec7', '#9edcff', '#a8d878', '#ffd94d'];
    for (let d = 0; d < 4; d++) {
      const c = new T.Mesh(cachedGeo('wildArrow', () => new T.ConeGeometry(9, 18, 5)), mat(cols[d]));
      const holder = new T.Group();
      holder.rotation.y = -d * Math.PI / 2;
      c.rotation.z = -Math.PI / 2;
      c.position.set(30, 8, 0);
      holder.add(c);
      platter.add(holder);
    }
    platter.position.y = 8;
    g.add(platter);
    view.spinners.push({ obj: platter, axis: 'y', speed: 0.8 });
    // センターピラー + ハテナ
    const pillar = mkCyl(6, 8, 26, METAL, 10, true);
    pillar.position.y = 24;
    g.add(pillar);
    const q = textSprite('?', 42, { color: '#5f55b0', strokeStyle: '#ffffff' });
    q.position.y = 48;
    g.add(q);
    // カチカチのフラップ
    const flap = mkBox(4, 12, 8, '#ff6f6f', true);
    flap.position.set(48, 16, 0);
    g.add(flap);
    view.update = (dt, time) => {
      platter.rotation.y += tile.spinAnim * dt * 18;
      flap.rotation.z = Math.sin(platter.rotation.y * 8) * 0.35;
      q.position.y = 48 + Math.sin(time * 4) * 3;
    };
  };

  /* ---------------- テレポーター（ワープ・リアクター） ---------------- */
  BUILDERS.tele = (view, tile) => {
    const g = view.group;
    const col = TELE_COLORS[tile.pair % TELE_COLORS.length];
    g.add(makeBase('#f1edfc'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // うずまきリング
    const rg = cachedGeo('teleRing', () => new T.TorusGeometry(27, 4.5, 8, 28, TAU * 0.78).rotateX(Math.PI / 2));
    const ring1 = new T.Mesh(rg, mat(col));
    ring1.position.y = 19;
    g.add(ring1);
    view.spinners.push({ obj: ring1, axis: 'y', speed: 2.4 });
    const ring2 = new T.Mesh(rg, mat(col));
    ring2.position.y = 23;
    ring2.scale.set(0.65, 1, 0.65);
    g.add(ring2);
    view.spinners.push({ obj: ring2, axis: 'y', speed: -3.2 });
    const dm = new T.MeshBasicMaterial({ color: new T.Color(col), transparent: true, opacity: 0.3, depthWrite: false });
    gc(dm);
    const disc = new T.Mesh(cachedGeo('teleDisc', () => new T.CylinderGeometry(24, 24, 2, 20)), dm);
    disc.position.y = 16;
    g.add(disc);
    // パイロン4本（先端ランプ点滅）
    const tipBright = new T.MeshBasicMaterial({ color: new T.Color(col) });
    const tipDim = new T.MeshBasicMaterial({ color: 0xbdb4d4 });
    gc(tipBright); gc(tipDim);
    const tips = [];
    for (const [px, pz] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) {
      const py = mkCyl(3, 4, 26, METAL, 8, true);
      py.position.set(px, 13, pz);
      g.add(py);
      const tip = new T.Mesh(cachedGeo('lamp', () => new T.SphereGeometry(3.2, 8, 6)), tipDim);
      tip.position.set(px, 29, pz);
      g.add(tip);
      tips.push(tip);
    }
    // 軌道をまわるエネルギー玉
    const orbM = new T.MeshBasicMaterial({ color: new T.Color(col) });
    gc(orbM);
    const orbs = [];
    for (let i = 0; i < 3; i++) {
      const o = new T.Mesh(cachedGeo('orb', () => new T.SphereGeometry(4, 8, 6)), orbM);
      g.add(o);
      orbs.push(o);
    }
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      dm.opacity = 0.22 + 0.14 * Math.sin(time * 4) + k * 0.4;
      tips.forEach((tip, i) => {
        tip.material = ((time * 5 + i * 1.3) % 4) < 1.6 ? tipBright : tipDim;
      });
      orbs.forEach((o, i) => {
        const a = time * (2.2 + i * 0.4) + i * (TAU / 3);
        const r = 30 + k * 22;
        o.position.set(Math.cos(a) * r, 26 + Math.sin(time * 3 + i * 2) * 8 + k * 14, Math.sin(a) * r);
      });
    };
  };

  /* ---------------- ジャンプだい（カタパルト） ---------------- */
  BUILDERS.jump = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#ffedd9'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // ばね + 発射だい
    const springG = new T.Group();
    const coil = new T.Mesh(makeSpringGeo(4, 15, 30, 3.4), mat('#d6884a'));
    coil.castShadow = true;
    springG.add(coil);
    const pad = mkBox(52, 10, 52, '#ffb840', true);
    pad.position.y = 38;
    springG.add(pad);
    for (const [bx, bz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) {
      const bolt = mkCyl(2.4, 2.4, 3, BOLT, 6);
      bolt.position.set(bx, 44, bz);
      springG.add(bolt);
    }
    springG.position.y = BELT_TOP;
    g.add(springG);
    // サイドピストン2本
    const p1 = makePiston(g, -36, 12, -36, '#ffb840');
    const p2 = makePiston(g, 36, 12, 36, '#ffb840');
    // とぶ方向の矢印
    const arr = new T.Mesh(arrowGeo(0.5, 6), mat('#d68f1e'));
    arr.position.set(36, 18, 0);
    lane.add(arr);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      const k = popK(tile);
      // アイドル: 呼吸。発射: ぐっと縮んでビヨーン
      const breathe = 1 + Math.sin(time * 2.2) * 0.05;
      const slam = k > 0 ? (tile.pop > 0.6 ? 1 - (1 - (1 - tile.pop) / 0.4) * 0.65 : 1 + Math.sin((0.6 - tile.pop) / 0.6 * Math.PI) * 0.25) : 1;
      springG.scale.y = breathe * (k > 0 ? slam : 1);
      p1.position.y = 12 - Math.max(0, Math.sin(time * 4)) * 4 - k * 6;
      p2.position.y = 12 - Math.max(0, Math.sin(time * 4 + 2)) * 4 - k * 6;
    };
  };

  /* ---------------- のびちぢみプッシャー ---------------- */
  BUILDERS.pusher = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#ffe3d0'));
    const laneG = new T.Group();
    laneG.rotation.y = yawOf(tile.dir);
    g.add(laneG);
    // ハウジング（しましま注意カラー）
    const stripeTex = makeStripeTexture();
    const stripeM = new T.MeshToonMaterial({ map: stripeTex, gradientMap: I.gradientTex });
    gc(stripeM, stripeTex);
    const housing = mkBox(56, 44, 60, '#ff9d6e', true);
    housing.position.set(-6, 26, 0);
    laneG.add(housing);
    const stripeBar = new T.Mesh(cachedGeo('pushStripe', () => new T.BoxGeometry(58, 8, 62)), stripeM);
    stripeBar.position.set(-6, 44, 0);
    laneG.add(stripeBar);
    addGear(view, laneG, 8, 10, '#e8814a', 4.2, { x: -6, y: 26, z: 34, depth: 5 });
    // のびる3段アーム + 先端プレート
    const segs = [];
    const segCols = ['#d98a5e', '#e8a06e', '#f4b684'];
    for (let i = 0; i < 3; i++) {
      const seg = new T.Mesh(cachedGeo(`pushSeg${i}`, () => new T.BoxGeometry(CELL, 20 - i * 3, 52 - i * 12)), mat(segCols[i]));
      seg.castShadow = true;
      laneG.add(seg);
      segs.push(seg);
    }
    const plate = mkBox(12, 34, LANE_W + 6, '#ff9d6e', true);
    laneG.add(plate);
    view.update = () => {
      laneG.rotation.y = yawOf(tile.dir);
      const ext = tile.ext || 0;
      let start = 22;
      for (let i = 0; i < 3; i++) {
        const len = clamp(ext - i, 0, 1) * CELL;
        segs[i].visible = len > 2;
        segs[i].scale.x = Math.max(0.02, len / CELL);
        segs[i].position.set(start + len / 2, 26, 0);
        start += len;
      }
      plate.position.set(22 + ext * CELL + 7, 26, 0);
    };
  };

  /* ---------------- ロングアームクレーン ---------------- */
  BUILDERS.crane = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#e8ecf8'));
    const laneG = new T.Group();
    laneG.rotation.y = yawOf(tile.dir);
    g.add(laneG);
    // タワー + キャビン
    const tower = mkBox(20, 112, 20, '#8fa3d8', true);
    tower.position.y = 56;
    laneG.add(tower);
    const cab = mkBox(30, 22, 26, '#ffd94d', true);
    cab.position.set(4, 118, 0);
    laneG.add(cab);
    addGear(view, laneG, 9, 12, '#6f83bc', 2.2, { flat: true, x: 0, y: 10, z: 0, depth: 5 });
    // のびるジブ + ケーブル + クロー
    const jib = new T.Mesh(cachedGeo('craneJib', () => new T.BoxGeometry(CELL, 12, 14)), mat('#a9b8e8'));
    jib.castShadow = true;
    laneG.add(jib);
    const cable = new T.Mesh(cachedGeo('craneCable', () => new T.CylinderGeometry(1.8, 1.8, 1, 6)), mat('#6b6478'));
    laneG.add(cable);
    const claw = new T.Group();
    for (const s of [-1, 1]) {
      const finger = mkBox(4, 14, 4, METAL);
      finger.position.set(s * 9, -4, 0);
      finger.rotation.z = s * 0.35;
      claw.add(finger);
    }
    const clawHub = mkSphere(6, '#ffd94d', 8, true);
    claw.add(clawHub);
    laneG.add(claw);
    view.update = () => {
      laneG.rotation.y = yawOf(tile.dir);
      const reach = tile.craneReach || CELL;
      const zTop = 112;
      const clawY = (tile.craneZ || 60) + 44;
      jib.scale.x = (reach + 50) / CELL;
      jib.position.set((reach + 50) / 2 - 10, zTop, 0);
      const len = Math.max(4, zTop - clawY);
      cable.scale.y = len;
      cable.position.set(reach, zTop - len / 2, 0);
      claw.position.set(reach, clawY, 0);
    };
  };

  /* ---------------- ブラックホール ---------------- */
  BUILDERS.hole = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#d8cfe8'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // 渦
    const disc = mkCyl(34, 36, 4, '#3a3050', 20, true);
    disc.position.y = BELT_TOP + 3;
    g.add(disc);
    const core = new T.Mesh(cachedGeo('holeCore', () => new T.CylinderGeometry(17, 17, 5, 16)), new T.MeshBasicMaterial({ color: 0x120e20 }));
    core.position.y = BELT_TOP + 4;
    g.add(core);
    const rg = cachedGeo('holeSwirl', () => new T.TorusGeometry(26, 3, 6, 24, TAU * 0.7).rotateX(Math.PI / 2));
    const sw1 = new T.Mesh(rg, mat('#b78cff'));
    sw1.position.y = BELT_TOP + 6;
    g.add(sw1);
    view.spinners.push({ obj: sw1, axis: 'y', speed: -5 });
    const sw2 = new T.Mesh(rg, mat('#8c5fd8'));
    sw2.position.y = BELT_TOP + 8;
    sw2.scale.set(0.6, 1, 0.6);
    g.add(sw2);
    view.spinners.push({ obj: sw2, axis: 'y', speed: -7.5 });
    const c = tileCenter(tile);
    let inT = 0;
    view.update = (dt, time, game) => {
      lane.rotation.y = yawOf(tile.dir);
      // まわりのきらきらが吸い込まれる
      inT -= dt;
      if (inT <= 0) {
        inT = 0.18;
        const a = rand(0, TAU);
        Particles.spawn({
          kind: 'sparkle',
          x: c.x + Math.cos(a) * 55, z: c.y + Math.sin(a) * 55,
          h: 26, vx: -Math.cos(a) * 130, vz: -Math.sin(a) * 130, vh: 0, g: 0,
          maxLife: 0.4, size: 8, color: '#b78cff',
        });
      }
      const k = 1 + Math.sin(time * 5) * 0.05 + (tile.cool > 1 ? 0.3 : 0);
      disc.scale.set(k, 1, k);
    };
  };

  /* ---------------- 大砲 ---------------- */
  BUILDERS.cannon = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#e0d8cc'));
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    const laneG = new T.Group();
    laneG.rotation.y = yawOf(tile.dir);
    g.add(laneG);
    // 車輪つきの台座
    for (const s of [-1, 1]) {
      const wheel = mkCyl(13, 13, 7, '#6b6478', 12, true);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-8, 14, s * 32);
      laneG.add(wheel);
      const mount = mkBox(30, 26, 8, '#8a6a4a', true);
      mount.position.set(-4, 28, s * 24);
      laneG.add(mount);
    }
    // 砲身（ななめ上向き）
    const barrelG = new T.Group();
    barrelG.position.set(-6, 36, 0);
    const barrel = new T.Mesh(cachedGeo('barrel', () => {
      const geo = new T.CylinderGeometry(11, 15, 74, 12);
      geo.rotateZ(-Math.PI / 2);
      geo.translate(30, 0, 0);
      return geo;
    }), mat('#5a5a6e'));
    barrel.castShadow = true;
    barrelG.add(barrel);
    const muzzle = new T.Mesh(cachedGeo('muzzle', () => {
      const geo = new T.TorusGeometry(12, 3.5, 8, 14);
      geo.rotateY(Math.PI / 2);
      return geo;
    }), mat('#ffd94d'));
    muzzle.position.set(67, 0, 0);
    barrelG.add(muzzle);
    laneG.add(barrelG);
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      laneG.rotation.y = yawOf(tile.dir);
      const charge = tile.chargeT || 0, fire = tile.fireT || 0;
      // チャージでガタガタ、発射で反動
      barrelG.rotation.z = 0.38 + charge * 0.18 + (charge > 0 ? Math.sin(time * 45) * 0.05 * charge : 0);
      barrelG.position.x = -6 - fire * 16;
      barrelG.scale.set(1 - fire * 0.12, 1 + fire * 0.18, 1 + fire * 0.18);
    };
  };

  /* ---------------- ドミノスイッチ ---------------- */
  BUILDERS.domino = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#ffe0e0'));
    const pedestal = mkCyl(26, 30, 18, '#e88a8a', 14, true);
    pedestal.position.y = 18;
    g.add(pedestal);
    const button = mkSphere(20, '#ff5c5c', 14, true);
    button.scale.set(1, 0.62, 1);
    button.position.y = 30;
    g.add(button);
    // まわりのミニベルト飾り（パタパタするやつの予告）
    const chip = cachedGeo('dominoChip', () => new T.BoxGeometry(12, 3, 8));
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(chip, mat('#cfc2df'));
      const a = (i / 4) * TAU;
      m.position.set(Math.cos(a) * 38, 12, Math.sin(a) * 38);
      m.rotation.y = a;
      g.add(m);
    }
    view.update = (dt, time, game) => {
      const press = Math.sin(Math.min(1, tile.pop) * Math.PI);
      button.position.y = 30 - press * 8;
      button.scale.set(1 + press * 0.15, 0.62 - press * 0.2, 1 + press * 0.15);
      const wave = game.dominoWave ? 1 : 0;
      pedestal.rotation.y += dt * wave * 6;
    };
  };

  /* ---------------- やさいスイッチ ---------------- */
  BUILDERS.veggie = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#e2f2d8'));
    const pedestal = mkBox(40, 22, 40, '#8fbf6e', true);
    pedestal.position.y = 11;
    g.add(pedestal);
    // レバー
    const lever = new T.Group();
    const rod = mkCyl(3, 3.6, 30, METAL, 8, true);
    rod.position.y = 15;
    lever.add(rod);
    const knob = mkSphere(8, '#57b357', 10, true);
    knob.position.y = 32;
    lever.add(knob);
    lever.position.y = 22;
    g.add(lever);
    // アイコン: ブロッコリー & ドーナツ
    const brocG = new T.Group();
    const stem = mkCyl(3, 4, 8, '#cfe8b0', 6);
    brocG.add(stem);
    for (let i = 0; i < 3; i++) {
      const fl = mkSphere(6, '#4e9b4e', 8);
      fl.position.set((i - 1) * 5, 7, 0);
      brocG.add(fl);
    }
    brocG.position.set(-16, 48, 0);
    g.add(brocG);
    const mini = new T.Mesh(cachedGeo('miniDonut', () => new T.TorusGeometry(9, 5.5, 8, 14).rotateX(Math.PI / 2)), mat('#ff9ec7'));
    mini.position.set(16, 46, 0);
    g.add(mini);
    view.update = (dt, time, game) => {
      lever.rotation.z = (game.veggie ? -0.5 : 0.5) + Math.sin(Math.min(1, tile.pop) * Math.PI) * 0.25;
      brocG.scale.setScalar(game.veggie ? 1.35 : 0.85);
      mini.scale.setScalar(game.veggie ? 0.85 : 1.35);
      brocG.position.y = 48 + (game.veggie ? Math.sin(time * 4) * 3 : 0);
      mini.position.y = 46 + (!game.veggie ? Math.sin(time * 4) * 3 : 0);
    };
  };

  /* ---------------- こうじょう反転レバー ---------------- */
  BUILDERS.flip = (view, tile) => {
    const g = view.group;
    g.add(makeBase('#ffe8f2'));
    const pedestal = mkCyl(22, 26, 20, '#e87aa8', 12, true);
    pedestal.position.y = 20;
    g.add(pedestal);
    // ぐるぐる回る2重矢印
    const arrowRing = new T.Group();
    const arcGeo = cachedGeo('flipArc', () => new T.TorusGeometry(24, 4, 8, 18, TAU * 0.36).rotateX(Math.PI / 2));
    for (const s of [0, Math.PI]) {
      const arc = new T.Mesh(arcGeo, mat('#ff6f9c'));
      arc.rotation.y = s;
      arrowRing.add(arc);
      const tip = new T.Mesh(cachedGeo('flipTip', () => new T.ConeGeometry(7, 14, 5)), mat('#ff6f9c'));
      tip.position.set(Math.cos(s + TAU * 0.36) * 24, 0, -Math.sin(s + TAU * 0.36) * 24);
      tip.rotation.y = s;
      tip.rotation.x = Math.PI / 2;
      arrowRing.add(tip);
    }
    arrowRing.position.y = 44;
    g.add(arrowRing);
    view.spinners.push({ obj: arrowRing, axis: 'y', speed: 1.4 });
    const knob = mkSphere(8, '#ff5c5c', 10, true);
    knob.position.y = 62;
    g.add(knob);
    view.update = (dt, time, game) => {
      const press = Math.sin(Math.min(1, tile.pop) * Math.PI);
      pedestal.scale.set(1 + press * 0.15, 1 - press * 0.2, 1 + press * 0.15);
      knob.position.y = 62 + Math.sin(time * 3) * 3;
    };
  };

  /* ---------------- ゲート（こうさてんゲート） ---------------- */
  BUILDERS.gate = (view, tile) => {
    const g = view.group;
    const lane = makeLane(view, true);
    lane.rotation.y = yawOf(tile.dir);
    g.add(lane);
    // しんごうき（フードつき3灯）
    const pole = mkCyl(4.5, 5.5, 52, '#8f8fa5', 8, true);
    pole.position.set(6, 26, -(LANE_W / 2 + 16));
    lane.add(pole);
    const hood = mkBox(12, 30, 10, METAL_DARK, true);
    hood.position.set(6, 48, -(LANE_W / 2 + 16));
    lane.add(hood);
    const greenM = new T.MeshBasicMaterial({ color: 0x57d957 });
    const redM = new T.MeshBasicMaterial({ color: 0xff5c5c });
    const offM = new T.MeshBasicMaterial({ color: 0xe0e0ea });
    gc(greenM); gc(redM); gc(offM);
    const lampTop = new T.Mesh(cachedGeo('lamp', () => new T.SphereGeometry(3.2, 8, 6)), greenM);
    lampTop.scale.set(1.4, 1.4, 1.4);
    lampTop.position.set(6, 56, -(LANE_W / 2 + 11));
    lane.add(lampTop);
    const lampBottom = new T.Mesh(cachedGeo('lamp', () => new T.SphereGeometry(3.2, 8, 6)), offM);
    lampBottom.scale.set(1.4, 1.4, 1.4);
    lampBottom.position.set(6, 42, -(LANE_W / 2 + 11));
    lane.add(lampBottom);
    // モーターボックス + 歯車
    const motor = mkBox(16, 14, 14, METAL, true);
    motor.position.set(10, 30, -(LANE_W / 2 + 6));
    lane.add(motor);
    const motorGear = new T.Mesh(I.gearGeo(7, 10, 4), mat('#b9aed0'));
    motorGear.rotation.y = Math.PI / 2;
    motorGear.position.set(19, 30, -(LANE_W / 2 + 6));
    lane.add(motorGear);
    // しゃだんバー + カウンターウェイト
    const pivot = new T.Group();
    pivot.position.set(10, 32, -(LANE_W / 2 + 6));
    const armTex = makeStripeTexture();
    const armM = new T.MeshToonMaterial({ map: armTex, gradientMap: I.gradientTex });
    gc(armM); gc(armTex);
    const arm = new T.Mesh(cachedGeo('gateArm', () => new T.BoxGeometry(9, 9, LANE_W + 22)), armM);
    arm.position.z = (LANE_W + 22) / 2;
    arm.castShadow = true;
    pivot.add(arm);
    const weight = mkBox(12, 12, 14, METAL_DARK, true);
    weight.position.z = -12;
    pivot.add(weight);
    const hub = mkSphere(8, '#8f8fa5', 10);
    pivot.add(hub);
    lane.add(pivot);
    let lastArmT = tile.armT;
    view.update = (dt, time) => {
      lane.rotation.y = yawOf(tile.dir);
      pivot.rotation.x = -tile.armT * 1.3;
      motorGear.rotation.x += (tile.armT - lastArmT) * 9;
      lastArmT = tile.armT;
      // とじているときは赤ランプがチカチカ
      const blink = Math.sin(time * 9) > 0;
      lampTop.material = tile.open ? greenM : offM;
      lampBottom.material = tile.open ? offM : (blink ? redM : offM);
    };
  };
})();
