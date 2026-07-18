/* 画面の切りかえ */
(() => {
  const home = document.getElementById('home');
  const game = document.getElementById('game');
  const stage = document.getElementById('stage');
  const homeBtn = document.getElementById('homeBtn');
  let current = null;

  /* 最初のタッチで音のロックを解除 */
  document.addEventListener('pointerdown', () => S.unlock());

  /* ダブルタップ拡大などをふせぐ */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
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

  function openGame(name) {
    if (current) closeGame();
    home.classList.add('hidden');
    game.classList.remove('hidden');
    current = window.GAMES[name];
    current.start(stage);
  }

  function closeGame() {
    if (current) {
      current.stop();
      current = null;
    }
    stage.innerHTML = '';
    game.classList.add('hidden');
    home.classList.remove('hidden');
  }
})();
