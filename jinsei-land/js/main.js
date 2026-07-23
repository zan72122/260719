/* がめんの きりかえと ゲームの きどう */
(() => {
  const home = document.getElementById('home');
  const pick2 = document.getElementById('pick2');
  const game = document.getElementById('game');
  const result = document.getElementById('result');
  const banner = document.getElementById('banner');
  const muteBtn = document.getElementById('muteBtn');

  let char1 = localStorage.getItem('jl.char') || 'usagi';
  let mode = localStorage.getItem('jl.mode') || 'cpu';
  let lastOpts = null;

  /* さいしょの タッチで おとの ロックかいじょ */
  document.addEventListener('pointerdown', () => S.unlock(), { capture: true });

  /* ダブルタップ かくだい などを ふせぐ */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- タイトルの えらぶ UI ---------------- */

  function refreshSel() {
    document.querySelectorAll('#home .charBtn').forEach(b =>
      b.classList.toggle('sel', b.dataset.char === char1));
    document.querySelectorAll('#home .modeBtn').forEach(b =>
      b.classList.toggle('sel', b.dataset.mode === mode));
  }
  refreshSel();

  document.querySelectorAll('#home .charBtn').forEach(b => {
    b.addEventListener('click', () => {
      char1 = b.dataset.char;
      localStorage.setItem('jl.char', char1);
      S.pop();
      S.say(Chars.CHARS[char1].name);
      refreshSel();
    });
  });

  document.querySelectorAll('#home .modeBtn').forEach(b => {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      localStorage.setItem('jl.mode', mode);
      S.pop();
      refreshSel();
    });
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    S.unlock();
    S.fanfare();
    if (mode === 'two') {
      openPick2();
    } else {
      startGame(buildPlayers(mode, char1, null));
    }
  });

  /* ---------------- ふたりめ えらび ---------------- */

  function openPick2() {
    const wrap = document.getElementById('chars2');
    wrap.innerHTML = '';
    for (const key in Chars.CHARS) {
      if (key === char1) continue;
      const c = Chars.CHARS[key];
      const b = document.createElement('button');
      b.className = 'charBtn';
      b.innerHTML = `<span class="face">${c.emoji}</span><span class="cname">${c.name}</span>`;
      b.addEventListener('click', () => {
        S.pop();
        pick2.classList.add('hidden');
        startGame(buildPlayers('two', char1, key));
      });
      wrap.appendChild(b);
    }
    home.classList.add('hidden');
    pick2.classList.remove('hidden');
  }

  /* ---------------- ゲームの きどう ---------------- */

  function buildPlayers(mode, c1, c2) {
    const others = Object.keys(Chars.CHARS).filter(k => k !== c1);
    if (mode === 'solo') {
      return { mode, players: [{ kind: c1, human: true }] };
    }
    if (mode === 'two') {
      return { mode, players: [{ kind: c1, human: true }, { kind: c2 || U.pick(others), human: true }] };
    }
    /* cpu：ともだち（コンピュータ）と いっしょ */
    return { mode, players: [{ kind: c1, human: true }, { kind: U.pick(others), human: false }] };
  }

  function startGame(opts) {
    lastOpts = opts;
    home.classList.add('hidden');
    pick2.classList.add('hidden');
    result.classList.add('hidden');
    game.classList.remove('hidden');
    Game.start(opts, showResult);
  }

  function quitToHome() {
    Game.stop();
    banner.classList.add('hidden');
    game.classList.add('hidden');
    result.classList.add('hidden');
    pick2.classList.add('hidden');
    home.classList.remove('hidden');
  }

  document.getElementById('homeBtn').addEventListener('click', () => {
    S.pop();
    quitToHome();
  });

  /* ---------------- おと ---------------- */

  muteBtn.addEventListener('click', () => {
    const m = !S.isMuted();
    S.setMuted(m);
    muteBtn.textContent = m ? '🔇' : '🔊';
    if (!m) { S.pop(); if (Game.isRunning()) S.bgmStart(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) S.bgmStop();
    else if (Game.isRunning() && !S.isMuted()) S.bgmStart();
  });

  /* ---------------- けっか ---------------- */

  function showResult(players) {
    banner.classList.add('hidden');
    const rows = document.getElementById('resultRows');
    rows.innerHTML = '';
    const sorted = players.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'rrow';
      const crown = p.rank === 1 ? '<span class="rcrown">👑</span>' : '<span class="rcrown">🎖️</span>';
      row.innerHTML = `${crown}<span class="rface">${p.emoji}</span><span>${p.name}</span>` +
        `<span class="rstars">⭐×<span class="cnt">0</span></span>`;
      rows.appendChild(row);

      /* ほしを カウントアップ */
      const cntEl = row.querySelector('.cnt');
      const total = p.stars;
      let cur = 0;
      const timer = setInterval(() => {
        if (result.classList.contains('hidden')) { clearInterval(timer); return; }
        cur++;
        if (cur >= total) { cur = total; clearInterval(timer); }
        cntEl.textContent = cur;
        if (total > 0) S.tick();
      }, 90 + i * 20);
    });
    result.classList.remove('hidden');
    S.cheer();
  }

  document.getElementById('againBtn').addEventListener('click', () => {
    S.pop();
    Game.stop();
    if (lastOpts) {
      /* おなじ メンバーで もういちど */
      startGame(buildPlayers(lastOpts.mode, lastOpts.players[0].kind,
        lastOpts.players[1] ? lastOpts.players[1].kind : null));
    } else {
      quitToHome();
    }
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    S.pop();
    quitToHome();
  });
})();
