/* ============================================================
   Typing Game（打字游戏 - 复古学习机风格）
   致敬小霸王 / 裕兴学习机的打字练习程序：
   字母从屏幕顶部掉落，按下对应按键将其击落。
   支持速度调节、连击计分、生命值、暂停。
   ============================================================ */
(function () {
  var app = document.getElementById('tg-app');
  if (!app) return;

  // ---------- 配置 ----------
  var SPEEDS = [
    { name: '慢速', fall: 55, spawn: 1500 },   // px/s, ms
    { name: '中速', fall: 85, spawn: 1100 },
    { name: '快速', fall: 125, spawn: 800 },
    { name: '疯狂', fall: 175, spawn: 550 }
  ];
  var MAX_LIVES = 5;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var BASE_SCORE = 10;        // 每次击中基础分
  var COMBO_BONUS = 2;        // 每级连击额外加分

  // ---------- 状态 ----------
  var speedIndex = 1;         // 默认中速
  var running = false;
  var paused = false;
  var over = false;
  var score = 0;
  var combo = 0;
  var bestCombo = 0;
  var hits = 0;
  var misses = 0;
  var lives = MAX_LIVES;
  var letters = [];           // 活动字母 {el, ch, x, y, dead}
  var lastSpawn = 0;
  var rafId = null;
  var lastTime = 0;

  // ---------- DOM ----------
  var crt = document.createElement('div');
  crt.className = 'tg-crt';
  app.appendChild(crt);

  var hud = document.createElement('div');
  hud.className = 'tg-hud';
  hud.innerHTML =
    '<div class="tg-hud-group">' +
      '<span class="tg-stat">得分 <strong id="tg-score">0</strong></span>' +
      '<span class="tg-stat">连击 <strong id="tg-combo">0</strong></span>' +
      '<span class="tg-stat">击中 <strong id="tg-hits">0</strong></span>' +
      '<span class="tg-stat tg-danger">漏接 <strong id="tg-misses">0</strong></span>' +
    '</div>' +
    '<div class="tg-stat">生命 <span class="tg-lives" id="tg-lives"></span></div>';
  crt.appendChild(hud);

  var controls = document.createElement('div');
  controls.className = 'tg-controls';
  crt.appendChild(controls);

  var screen = document.createElement('div');
  screen.className = 'tg-screen';
  screen.innerHTML = '<div class="tg-floor"></div>';
  crt.appendChild(screen);

  var overlay = document.createElement('div');
  overlay.className = 'tg-overlay';
  screen.appendChild(overlay);

  var elScore = hud.querySelector('#tg-score');
  var elCombo = hud.querySelector('#tg-combo');
  var elHits = hud.querySelector('#tg-hits');
  var elMisses = hud.querySelector('#tg-misses');
  var elLives = hud.querySelector('#tg-lives');

  // ---------- 速度按钮 + 暂停按钮 ----------
  var speedLabel = document.createElement('span');
  speedLabel.className = 'tg-speed-label';
  speedLabel.textContent = '速度:';
  controls.appendChild(speedLabel);

  var speedBtns = SPEEDS.map(function (s, i) {
    var b = document.createElement('button');
    b.className = 'tg-speed-btn' + (i === speedIndex ? ' active' : '');
    b.type = 'button';
    b.textContent = s.name;
    b.addEventListener('click', function () {
      speedIndex = i;
      speedBtns.forEach(function (btn, j) {
        btn.classList.toggle('active', j === i);
      });
    });
    controls.appendChild(b);
    return b;
  });

  var pauseBtn = document.createElement('button');
  pauseBtn.className = 'tg-btn';
  pauseBtn.type = 'button';
  pauseBtn.textContent = '暂停';
  pauseBtn.addEventListener('click', function () {
    if (running && !over) togglePause();
  });
  controls.appendChild(pauseBtn);

  // ---------- HUD 渲染 ----------
  function renderLives() {
    elLives.innerHTML = '';
    for (var i = 0; i < MAX_LIVES; i++) {
      var d = document.createElement('span');
      d.className = 'tg-life' + (i < lives ? '' : ' lost');
      elLives.appendChild(d);
    }
  }

  function renderHud() {
    elScore.textContent = score;
    elCombo.textContent = combo;
    elHits.textContent = hits;
    elMisses.textContent = misses;
  }

  // ---------- 覆盖层 ----------
  function showStart() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="tg-title">打字练习</h2>' +
      '<p class="tg-subtitle">字母正在掉落，按下键盘上<strong>对应的字母键</strong>将其击落。<br>' +
      '漏接会损失生命，生命耗尽游戏结束。选择速度后开始挑战！</p>' +
      '<button class="tg-btn tg-blink" id="tg-start" type="button">▶ 开始游戏</button>';
    overlay.querySelector('#tg-start').addEventListener('click', startGame);
  }

  function showPause() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="tg-title">已暂停</h2>' +
      '<p class="tg-subtitle tg-blink">按 Esc 或点击按钮继续</p>' +
      '<button class="tg-btn" id="tg-resume" type="button">继续</button>';
    overlay.querySelector('#tg-resume').addEventListener('click', togglePause);
  }

  function showOver() {
    var accuracy = hits + misses > 0 ? Math.round(hits / (hits + misses) * 100) : 0;
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="tg-title">GAME OVER</h2>' +
      '<p class="tg-final">最终得分 <strong>' + score + '</strong>　最高连击 <strong>' + bestCombo +
      '</strong><br>击中 <strong>' + hits + '</strong> 个　漏接 <strong>' + misses +
      ' 个</strong>　命中率 <strong>' + accuracy + '%</strong></p>' +
      '<button class="tg-btn" id="tg-restart" type="button">↻ 再来一局</button>';
    overlay.querySelector('#tg-restart').addEventListener('click', startGame);
  }

  // ---------- 游戏流程 ----------
  function startGame() {
    // 清场
    letters.forEach(function (L) { L.el.remove(); });
    letters = [];
    score = 0;
    combo = 0;
    bestCombo = 0;
    hits = 0;
    misses = 0;
    lives = MAX_LIVES;
    over = false;
    paused = false;
    running = true;
    lastSpawn = 0;
    renderHud();
    renderLives();
    overlay.hidden = true;
    pauseBtn.textContent = '暂停';
    lastTime = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!running || over) return;
    paused = !paused;
    if (paused) {
      showPause();
      pauseBtn.textContent = '继续';
    } else {
      overlay.hidden = true;
      pauseBtn.textContent = '暂停';
      lastTime = performance.now();
    }
  }

  function endGame() {
    running = false;
    over = true;
    if (rafId) cancelAnimationFrame(rafId);
    showOver();
  }

  // ---------- 字母 ----------
  function spawnLetter() {
    var ch = LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
    var el = document.createElement('span');
    el.className = 'tg-letter';
    el.textContent = ch;
    var w = screen.clientWidth;
    var x = 20 + Math.random() * Math.max(40, w - 70);
    el.style.left = x + 'px';
    screen.appendChild(el);
    var L = { el: el, ch: ch, x: x, y: -34, dead: false };
    el.addEventListener('pointerdown', function () {
      hitLetter(L);
    });
    letters.push(L);
  }

  function popText(x, y, text, bad) {
    var p = document.createElement('span');
    p.className = 'tg-pop' + (bad ? ' tg-pop-bad' : '');
    p.textContent = text;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    screen.appendChild(p);
    setTimeout(function () { p.remove(); }, 720);
  }

  function hitLetter(L) {
    if (L.dead || !running || paused) return;
    L.dead = true;
    L.el.classList.add('hit');
    hits++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    var gain = BASE_SCORE + (combo - 1) * COMBO_BONUS;
    score += gain;
    popText(L.x, L.y, '+' + gain, false);
    renderHud();
    setTimeout(function () {
      L.el.remove();
      letters = letters.filter(function (o) { return o !== L; });
    }, 300);
  }

  function missLetter(L) {
    if (L.dead) return;
    L.dead = true;
    L.el.classList.add('miss');
    misses++;
    combo = 0;
    lives--;
    popText(L.x, screen.clientHeight - 60, 'MISS', true);
    renderHud();
    renderLives();
    setTimeout(function () {
      L.el.remove();
      letters = letters.filter(function (o) { return o !== L; });
    }, 340);
    if (lives <= 0) endGame();
  }

  // ---------- 主循环 ----------
  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (paused) { lastTime = now; return; }

    var dt = Math.min(100, now - lastTime) / 1000;
    lastTime = now;
    var speed = SPEEDS[speedIndex];

    // 生成
    if (now - lastSpawn > speed.spawn) {
      spawnLetter();
      lastSpawn = now;
    }

    // 下落
    var floorY = screen.clientHeight - 40;
    for (var i = 0; i < letters.length; i++) {
      var L = letters[i];
      if (L.dead) continue;
      L.y += speed.fall * dt;
      L.el.style.transform = 'translateY(' + L.y + 'px)';
      if (L.y >= floorY) missLetter(L);
    }
  }

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (running && !over) togglePause();
      return;
    }
    if (!running || paused || over) return;
    var ch = e.key.toUpperCase();
    if (LETTERS.indexOf(ch) === -1) return;

    // 匹配最靠下的同字母（最紧急优先）
    var target = null;
    for (var i = 0; i < letters.length; i++) {
      var L = letters[i];
      if (!L.dead && L.ch === ch) {
        if (!target || L.y > target.y) target = L;
      }
    }
    if (target) {
      hitLetter(target);
    } else {
      // 按错：中断连击
      if (combo > 0) {
        combo = 0;
        renderHud();
      }
    }
  });

  // ---------- 启动 ----------
  renderHud();
  renderLives();
  showStart();
})();
