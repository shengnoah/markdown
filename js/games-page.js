/* ============================================================
   Games Hub 交互（游戏大厅 /games/）
   - 类型筛选
   - 关键词搜索（/ 聚焦，Esc 清空）
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('games-page');
  if (!root) return;

  var grid = document.getElementById('games-grid');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.game-card'));
  var chips = Array.prototype.slice.call(root.querySelectorAll('.games-chip'));
  var search = document.getElementById('games-search');
  var empty = document.getElementById('games-empty');
  var countEl = root.querySelector('.games-count');
  var resultEl = root.querySelector('.games-result');

  var activeTag = 'all';
  var keyword = '';

  function apply() {
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var tagOk = activeTag === 'all' || card.getAttribute('data-tag') === activeTag;
      var textOk = !keyword || (card.getAttribute('data-search') || '').indexOf(keyword) >= 0;
      var visible = tagOk && textOk;
      card.hidden = !visible;
      if (visible) shown++;
    }
    if (countEl) countEl.textContent = shown;
    if (empty) empty.hidden = shown > 0;
    if (grid) {
      // 只剩一张卡片时铺满整行
      grid.classList.toggle('is-solo', shown === 1);
    }
    cards.forEach(function (card) {
      var on = !card.hidden;
      card.style.animation = on ? '' : 'none';
    });
    if (resultEl) {
      resultEl.style.display = cards.length ? '' : 'none';
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      activeTag = chip.getAttribute('data-tag') || 'all';
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', function () {
      keyword = search.value.trim().toLowerCase();
      apply();
    });

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (ev.key === '/' && !typing) {
        ev.preventDefault();
        search.focus();
        search.select();
      } else if (ev.key === 'Escape' && document.activeElement === search) {
        search.value = '';
        keyword = '';
        apply();
        search.blur();
      }
    });
  }

  apply();
})();