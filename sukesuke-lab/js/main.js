/* 画面の切りかえ */
(() => {
  const home = document.getElementById('home');
  const game = document.getElementById('game');
  const stage = document.getElementById('stage');
  const homeBtn = document.getElementById('homeBtn');
  const demoBtn = document.getElementById('demoBtn');
  let current = null;

  /* 最初のタッチで音のロックを解除 */
  document.addEventListener('pointerdown', () => S.unlock());

  /* ダブルタップ拡大などをふせぐ */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  /* ゲーム中の画面バウンスはふせぐが、ホームの指スクロールだけは通す */
  document.addEventListener('touchmove', e => {
    if (!(e.target instanceof Element) || !e.target.closest('#home')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.querySelectorAll('.card').forEach(btn => {
    btn.addEventListener('click', () => {
      S.unlock();
      S.pop();
      openGame(btn.dataset.game);
    });
  });

  homeBtn.addEventListener('click', () => {
    S.pop();
    closeGame();
  });

  /* 自動再生（お手本）: もう一度おすと中断、実演が終わると自動でボタンも戻る */
  demoBtn.addEventListener('click', () => {
    if (AUTOPLAY.isRunning()) {
      AUTOPLAY.stop();
      demoBtn.classList.remove('running');
    } else {
      S.pop();
      const started = AUTOPLAY.run(GUIDE.getStage3(), GUIDE.getSteps(), {
        onEnd: () => demoBtn.classList.remove('running'),
      });
      if (started) demoBtn.classList.add('running');
    }
  });

  function openGame(name) {
    if (current) closeGame();
    AUTOPLAY.stop();
    demoBtn.classList.remove('running');
    home.classList.add('hidden');
    game.classList.remove('hidden');
    current = window.GAMES[name];
    current.start(stage);
  }

  function closeGame() {
    AUTOPLAY.stop();
    demoBtn.classList.remove('running');
    if (current) {
      current.stop();
      current = null;
    }
    stage.innerHTML = '';
    game.classList.add('hidden');
    home.classList.remove('hidden');
  }
})();
