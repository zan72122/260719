'use strict';
/* ================= UI（DOMスクリーン・HUD・モーダル） ================= */

const UI = (() => {
  const $ = sel => document.querySelector(sel);
  let toastQueue = [];
  let toastBusy = false;

  const GOAL_ICON = { rescue: '🐠', popAny: '🫧', chain: '⚡', big: '💥', merge: '🔨', clean: '✨', clear: '🧹' };

  function goalText(g) {
    const d = g.def;
    const n = d.n || 1;
    switch (d.type) {
      case 'rescue':   return `🐠 ${g.prog}/${n}`;
      case 'popColor': return `<span class="dot" style="background:${Colors.defs[d.color].main}"></span>×${n} (${g.prog}/${n})`;
      case 'popAny':   return `🫧 ${g.prog}/${n}`;
      case 'mix':      return `🎨<span class="dot" style="background:${Colors.defs[d.color].main}"></span> ${g.prog}/${n}`;
      case 'chain':    return `⚡ ${n}チェイン`;
      case 'big':      return `💥 ${n}こ同時`;
      case 'merge':    return `🔨 ${g.prog}/${n}`;
      case 'clean':    return `✨ ${g.prog}/${n}`;
      case 'clear':    return `🧹 ぜんぶ割る`;
    }
    return '';
  }

  /* ---------- 画面切替 ---------- */
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function enterTitle() {
    hide('#hud'); hide('#screen-levels');
    show('#screen-title');
    closeModal();
    refreshTitle();
  }

  function refreshTitle() {
    const d = Save.get();
    $('#title-stars').textContent = `★ ${Achievements.totalStars(d)} / 120`;
    $('#title-ach').textContent = `🏆 ${Achievements.unlockedCount()} / ${Achievements.LIST.length}`;
    const best = d.stats.arcadeBest;
    $('#btn-arcade .mode-sub').textContent = best > 0 ? `ベスト ${Util.fmt(best)}` : 'スコアアタック';
  }

  function enterLevels() {
    hide('#screen-title');
    show('#screen-levels');
    buildLevelGrid();
  }

  function buildLevelGrid() {
    const wrap = $('#level-worlds');
    wrap.innerHTML = '';
    const d = Save.get();
    Levels.WORLDS.forEach((w, wi) => {
      const sec = document.createElement('div');
      sec.className = 'world-sec';
      const h = document.createElement('h3');
      h.textContent = `ワールド${wi + 1}　${w.name}`;
      h.style.color = w.color;
      sec.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'level-grid';
      for (let i = w.range[0]; i <= w.range[1]; i++) {
        const cell = document.createElement('button');
        cell.className = 'level-cell';
        const unlocked = i === 0 || (d.levels[i - 1] && d.levels[i - 1].stars > 0);
        const rec = d.levels[i];
        if (!unlocked) {
          cell.classList.add('locked');
          cell.innerHTML = `<span class="lv-num">🔒</span>`;
        } else {
          const stars = rec ? rec.stars : 0;
          cell.innerHTML = `<span class="lv-num">${i + 1}</span><span class="lv-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
          cell.addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); Game.startPuzzle(i); });
        }
        grid.appendChild(cell);
      }
      sec.appendChild(grid);
      wrap.appendChild(sec);
    });
  }

  /* ---------- ゲームHUD ---------- */
  function enterGame() {
    hide('#screen-title'); hide('#screen-levels');
    closeModal();
    show('#hud');
    const G = Game.G;
    $('#hud-mode-label').textContent =
      G.mode === 'puzzle' ? `Lv.${G.levelIdx + 1} ${G.level.name}` :
      G.mode === 'arcade' ? 'アーケード' : 'むげんモード';
    $('#btn-hint').classList.toggle('hidden', G.mode !== 'puzzle');
    $('#btn-sweep').classList.toggle('hidden', G.mode !== 'zen');
    $('#arcade-info').classList.toggle('hidden', G.mode !== 'arcade');
    $('#goal-chips').classList.toggle('hidden', G.mode !== 'puzzle');
    buildTanks();
    refreshGoals();
    refreshHud();
    document.body.dispatchEvent(new Event('layoutchange'));
  }

  function buildTanks() {
    const G = Game.G;
    const wrap = $('#tanks');
    wrap.innerHTML = '';
    for (const k of G.tankOrder) {
      const def = Colors.defs[k];
      const btn = document.createElement('button');
      btn.className = 'tank';
      btn.dataset.key = k;
      const isWild = k === 'W';
      btn.innerHTML = `
        <span class="tank-bubble ${isWild ? 'wild' : ''}" style="${isWild ? '' : `background: radial-gradient(circle at 35% 30%, ${def.hi}, ${def.main} 55%, ${def.deep})`}"></span>
        <span class="tank-count"></span>`;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        AudioMan.unlock();
        Game.selectColor(k);
      });
      wrap.appendChild(btn);
    }
    refreshTanks();
  }

  function refreshTanks() {
    const G = Game.G;
    document.querySelectorAll('.tank').forEach(el => {
      const k = el.dataset.key;
      const n = G.tanks[k];
      el.classList.toggle('selected', G.selected === k);
      el.classList.toggle('empty', n !== Infinity && n <= 0);
      el.querySelector('.tank-count').textContent = n === Infinity ? '∞' : n;
    });
  }

  function shakeTank() {
    const el = document.querySelector(`.tank[data-key="${Game.G.selected}"]`);
    if (el) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  function refreshGoals() {
    const G = Game.G;
    if (G.mode !== 'puzzle') return;
    const wrap = $('#goal-chips');
    wrap.innerHTML = '';
    for (const g of G.goals) {
      const chip = document.createElement('span');
      chip.className = 'goal-chip' + (g.done ? ' done' : '');
      chip.innerHTML = (g.done ? '✔ ' : '') + goalText(g);
      wrap.appendChild(chip);
    }
  }

  let lastScore = -1, lastDanger = -1;
  function refreshHud() {
    const G = Game.G;
    if (G.mode === 'arcade') {
      if (G.score !== lastScore) {
        lastScore = G.score;
        $('#arcade-score').textContent = Util.fmt(G.score);
      }
      const dv = Math.round(Util.clamp(G.danger / 0.58, 0, 1) * 100);
      if (dv !== lastDanger) {
        lastDanger = dv;
        const bar = $('#danger-bar-fill');
        bar.style.width = dv + '%';
        bar.classList.toggle('hot', dv > 75);
      }
    }
    // ヒントバナー
    const tipEl = $('#tip-banner');
    if (G.tipT > 0 && G.tip) {
      tipEl.textContent = G.tip;
      tipEl.classList.remove('hidden');
      tipEl.style.opacity = Util.clamp(G.tipT, 0, 1);
    } else {
      tipEl.classList.add('hidden');
    }
  }

  /* ---------- モーダル ---------- */
  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
    root.classList.remove('hidden');
    return root.querySelector('.modal');
  }
  function closeModal() {
    $('#modal-root').classList.add('hidden');
    $('#modal-root').innerHTML = '';
  }
  function bindClose(m) {
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { AudioMan.tick(); closeModal(); }));
  }

  function showPause() {
    Game.G.paused = true;
    const m = openModal(`
      <h2>ポーズ</h2>
      <div class="btn-col">
        <button class="btn primary" id="pm-resume">つづける</button>
        <button class="btn" id="pm-restart">やりなおす</button>
        <button class="btn" id="pm-settings">せってい</button>
        <button class="btn" id="pm-quit">タイトルへ</button>
      </div>`);
    m.querySelector('#pm-resume').addEventListener('click', () => { AudioMan.tick(); Game.G.paused = false; closeModal(); });
    m.querySelector('#pm-restart').addEventListener('click', () => { AudioMan.tick(); Game.G.paused = false; Game.restart(); });
    m.querySelector('#pm-settings').addEventListener('click', () => { showSettings(() => showPause()); });
    m.querySelector('#pm-quit').addEventListener('click', () => { AudioMan.tick(); Game.G.paused = false; Game.toTitle(); });
  }

  function showClear(stars, pumps, par) {
    const starHtml = [1, 2, 3].map(i =>
      `<span class="big-star ${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('');
    const isLast = Game.G.levelIdx >= Levels.LEVELS.length - 1;
    const m = openModal(`
      <h2>クリア！</h2>
      <div class="star-row">${starHtml}</div>
      <p class="modal-note">つかった空気：${pumps}　（パー：${par}）</p>
      <div class="btn-col">
        <button class="btn primary" id="cm-next">${isLast ? 'タイトルへ' : 'つぎのレベル'}</button>
        <button class="btn" id="cm-retry">もういちど</button>
        <button class="btn" id="cm-quit">レベルせんたく</button>
      </div>`);
    m.querySelector('#cm-next').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.nextLevel(); });
    m.querySelector('#cm-retry').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.restart(); });
    m.querySelector('#cm-quit').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.toTitle(); enterLevels(); });
  }

  function showFail() {
    const m = openModal(`
      <h2>空気ぎれ…</h2>
      <p class="modal-note">だいじょうぶ、なんどでも ちょうせんできるよ</p>
      <div class="btn-col">
        <button class="btn primary" id="fm-retry">もういちど</button>
        <button class="btn" id="fm-hint">ヒントを見る</button>
        <button class="btn" id="fm-quit">レベルせんたく</button>
      </div>`);
    m.querySelector('#fm-retry').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.restart(); });
    m.querySelector('#fm-hint').addEventListener('click', () => { showHint(() => showFail()); });
    m.querySelector('#fm-quit').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.toTitle(); enterLevels(); });
  }

  function showArcadeOver(score, best) {
    const isNew = score >= best && score > 0;
    const m = openModal(`
      <h2>あふれちゃった！</h2>
      <p class="score-big">${Util.fmt(score)}</p>
      <p class="modal-note">${isNew ? '🎉 じこベストこうしん！' : `ベスト：${Util.fmt(best)}`}</p>
      <div class="btn-col">
        <button class="btn primary" id="am-retry">もういちど</button>
        <button class="btn" id="am-quit">タイトルへ</button>
      </div>`);
    m.querySelector('#am-retry').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.startArcade(); });
    m.querySelector('#am-quit').addEventListener('click', () => { AudioMan.tick(); closeModal(); Game.toTitle(); });
  }

  function showHint(back) {
    const lv = Game.G.level;
    const m = openModal(`
      <h2>💡 ヒント</h2>
      <p class="modal-note hint-text">${lv && lv.hint ? lv.hint : 'おなじ色を4こ くっつけよう！'}</p>
      <div class="btn-col"><button class="btn primary" id="hm-back">とじる</button></div>`);
    m.querySelector('#hm-back').addEventListener('click', () => { AudioMan.tick(); if (back) back(); else closeModal(); });
  }

  function showSettings(back) {
    const s = Save.get().settings;
    const m = openModal(`
      <h2>せってい</h2>
      <div class="setting-rows">
        <label class="setting-row"><span>🎵 おんがく</span><input type="checkbox" id="set-music" ${s.music ? 'checked' : ''}></label>
        <label class="setting-row"><span>🔔 こうかおん</span><input type="checkbox" id="set-sfx" ${s.sfx ? 'checked' : ''}></label>
        <label class="setting-row"><span>📳 しんどう</span><input type="checkbox" id="set-haptics" ${s.haptics ? 'checked' : ''}></label>
        <label class="setting-row"><span>✨ きれいな描画</span><input type="checkbox" id="set-quality" ${s.quality >= 2 ? 'checked' : ''}></label>
      </div>
      <div class="btn-col">
        <button class="btn primary" id="sm-back">とじる</button>
        <button class="btn danger" id="sm-reset">データをぜんぶ消す</button>
      </div>`);
    m.querySelector('#set-music').addEventListener('change', e => { s.music = e.target.checked; AudioMan.setMusic(s.music); Save.save(); });
    m.querySelector('#set-sfx').addEventListener('change', e => { s.sfx = e.target.checked; AudioMan.setSfx(s.sfx); Save.save(); });
    m.querySelector('#set-haptics').addEventListener('change', e => { s.haptics = e.target.checked; Save.save(); });
    m.querySelector('#set-quality').addEventListener('change', e => { s.quality = e.target.checked ? 2 : 1; Renderer.setQuality(s.quality); Save.save(); });
    m.querySelector('#sm-back').addEventListener('click', () => { AudioMan.tick(); if (back) back(); else closeModal(); });
    m.querySelector('#sm-reset').addEventListener('click', () => {
      if (confirm('セーブデータ（レベル・じっせき・きろく）をすべて消します。いいですか？')) {
        localStorage.removeItem('awa-bubbles.save.v1');
        Save.load();
        closeModal();
        refreshTitle();
      }
    });
  }

  function showHelp() {
    const mixRow = (a, b, c) => `
      <span class="mix-row">
        <span class="dot big" style="background:${Colors.defs[a].main}"></span>＋
        <span class="dot big" style="background:${Colors.defs[b].main}"></span>＝
        <span class="dot big" style="background:${Colors.defs[c].main}"></span>
      </span>`;
    const m = openModal(`
      <h2>あそびかた</h2>
      <div class="help-body">
        <p>🫧 <b>ながおし</b>で泡がふくらむ。あいた場所なら あたらしい泡がうまれるよ。</p>
        <p>🎨 泡にちがう色を吹き込むと <b>色がまざる</b>。<br>${mixRow('R', 'Y', 'O')} ${mixRow('Y', 'B', 'G')} ${mixRow('R', 'B', 'P')}</p>
        <p>💥 おなじ色が <b>4こ</b>くっつくと ぽん！と割れるよ。</p>
        <p>🔨 泡を おおきくふくらませすぎると、となりの泡と<b>がったい</b>して色がまざる。</p>
        <p>⚡ れんぞくで割ると<b>チェイン</b>！3チェインで にじいろの<b>ワイルド泡</b>がもらえる。</p>
        <p>⚠️ 3色ぜんぶまざると<b>にごり泡</b>に…。ひとつの色をたっぷりたせば もとどおり！</p>
        <p>🐠 泡のなかの いきものは、泡を割って たすけてあげよう。</p>
        <p>🦔 ウニと🦀ジェリーカニに さわった泡は 割れてしまうよ。</p>
      </div>
      <div class="btn-col"><button class="btn primary" data-close>とじる</button></div>`);
    bindClose(m);
  }

  function showAchievements() {
    const d = Save.get();
    const rows = Achievements.LIST.map(a => {
      const on = !!d.ach[a.id];
      return `<div class="ach-row ${on ? 'on' : ''}">
        <span class="ach-icon">${on ? '🏆' : '🔒'}</span>
        <span class="ach-text"><b>${a.name}</b><small>${a.desc}</small></span>
      </div>`;
    }).join('');
    const st = d.stats;
    const m = openModal(`
      <h2>じっせき　${Achievements.unlockedCount()}/${Achievements.LIST.length}</h2>
      <div class="ach-list">${rows}</div>
      <div class="stats-box">
        <h3>きろく</h3>
        <p>割った泡：${Util.fmt(st.pops)}こ ／ さいだいチェイン：${st.maxChain}</p>
        <p>さいだい同時わり：${st.maxGroup}こ ／ 合体：${st.merges}回</p>
        <p>たすけた いきもの：${st.rescued}ひき ／ ワイルド：${st.wildsGot}こ</p>
        <p>アーケードベスト：${Util.fmt(st.arcadeBest)}</p>
        <p>プレイ時間：${Math.floor(st.playSec / 60)}ぷん</p>
      </div>
      <div class="btn-col"><button class="btn primary" data-close>とじる</button></div>`);
    bindClose(m);
  }

  /* ---------- 実績トースト ---------- */
  function toast(a) {
    toastQueue.push(a);
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const a = toastQueue.shift();
    if (!a) { toastBusy = false; return; }
    toastBusy = true;
    const root = $('#toast-root');
    root.innerHTML = `<div class="toast">🏆 <b>${a.name}</b><small>${a.desc}</small></div>`;
    AudioMan.chime(2);
    const el = root.firstElementChild;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(nextToast, 500);
    }, 2600);
  }

  /* ---------- 初期化 ---------- */
  function init() {
    Achievements.setUnlockHandler(toast);
    $('#btn-puzzle').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); enterLevels(); });
    $('#btn-arcade').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); Game.startArcade(); });
    $('#btn-zen').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); Game.startZen(); });
    $('#btn-help').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); showHelp(); });
    $('#btn-ach').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); showAchievements(); });
    $('#btn-settings').addEventListener('click', () => { AudioMan.unlock(); AudioMan.tick(); showSettings(); });
    $('#btn-levels-back').addEventListener('click', () => { AudioMan.tick(); hide('#screen-levels'); show('#screen-title'); refreshTitle(); });
    $('#btn-pause').addEventListener('click', () => { AudioMan.tick(); showPause(); });
    $('#btn-restart').addEventListener('click', () => { AudioMan.tick(); Game.restart(); });
    $('#btn-hint').addEventListener('click', () => { AudioMan.tick(); showHint(); });
    $('#btn-sweep').addEventListener('click', () => { AudioMan.tick(); Game.zenSweep(); });
  }

  return {
    init, enterTitle, enterGame, enterLevels,
    refreshTanks, refreshGoals, refreshHud, shakeTank,
    showClear, showFail, showArcadeOver, showPause,
  };
})();
