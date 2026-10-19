/* ============================================================
   Typing Game（打字游戏 - 品牌蓝透明玻璃风格）
   模式一：字母模式 —— 字母掉落，按对应键击落
   模式二：单词模式 —— 小学生英语单词掉落，按顺序输入
           每个字母，打完整单词后爆炸消失
   支持速度调节、连击计分、生命值、暂停。
   ============================================================ */
(function () {
  var app = document.getElementById('tg-app');
  if (!app) return;

  // ---------- 配置 ----------
  var SPEEDS = [
    { name: '慢速', fall: 55, spawn: 1500 },   // px/s, ms（字母模式）
    { name: '中速', fall: 85, spawn: 1100 },
    { name: '快速', fall: 125, spawn: 800 },
    { name: '疯狂', fall: 175, spawn: 550 }
  ];
  var MAX_LIVES = 5;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var BASE_SCORE = 10;        // 每次击中基础分
  var COMBO_BONUS = 2;        // 每级连击额外加分

  // 小学生常见英语单词库
  var WORDS = [
    'APPLE', 'BANANA', 'ORANGE', 'PEAR', 'GRAPE', 'CAKE', 'RICE', 'EGG',
    'BREAD', 'MILK', 'WATER', 'TEA', 'CAT', 'DOG', 'BIRD', 'FISH',
    'TIGER', 'PANDA', 'MONKEY', 'RABBIT', 'HORSE', 'DUCK', 'BEAR', 'LION',
    'BOOK', 'PEN', 'BAG', 'SCHOOL', 'TEACHER', 'STUDENT', 'CLASS', 'FRIEND',
    'FAMILY', 'HOUSE', 'ROOM', 'DOOR', 'WINDOW', 'TABLE', 'CHAIR', 'BED',
    'SUN', 'MOON', 'STAR', 'TREE', 'FLOWER', 'GRASS', 'SKY', 'SEA',
    'HAPPY', 'SAD', 'BIG', 'SMALL', 'LONG', 'SHORT', 'TALL', 'OLD',
    'NEW', 'GOOD', 'NICE', 'CUTE', 'RED', 'BLUE', 'GREEN', 'YELLOW',
    'MUSIC', 'ART', 'MATH', 'ENGLISH', 'CHINA', 'PLAY', 'RUN', 'JUMP',
    'SWIM', 'SING', 'READ', 'WRITE', 'HELP', 'LOVE', 'SMILE', 'DREAM'
  ];

  // ---------- 状态 ----------
  var mode = 'letters';       // 'letters' | 'words'
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
  var targets = [];           // 活动目标 {el, ch|word, typed, x, y, dead, isWord}
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
  var MODE_DESC = {
    letters: '字母正在掉落，按下键盘上<strong>对应的字母键</strong>将其击落。<br>' +
             '漏接会损失生命，生命耗尽游戏结束。选择速度后开始挑战！',
    words: '英语单词正在掉落，按<strong>顺序输入单词的每个字母</strong>，<br>' +
           '打完整单词即可将其<strong>引爆</strong>并获得额外奖励分！<br>' +
           '单词落底未打完会损失生命。选择速度后开始挑战！'
  };

  function showStart() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="tg-title">打字练习</h2>' +
      '<div class="tg-modes">' +
        '<button class="tg-mode-btn' + (mode === 'letters' ? ' active' : '') +
          '" data-mode="letters" type="button">🔤 字母模式</button>' +
        '<button class="tg-mode-btn' + (mode === 'words' ? ' active' : '') +
          '" data-mode="words" type="button">💥 单词模式</button>' +
      '</div>' +
      '<p class="tg-subtitle" id="tg-mode-desc">' + MODE_DESC[mode] + '</p>' +
      '<button class="tg-btn tg-blink" id="tg-start" type="button">▶ 开始游戏</button>';
    overlay.querySelectorAll('.tg-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.getAttribute('data-mode');
        overlay.querySelectorAll('.tg-mode-btn').forEach(function (o) {
          o.classList.toggle('active', o === b);
        });
        overlay.querySelector('#tg-mode-desc').innerHTML = MODE_DESC[mode];
      });
    });
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
    targets.forEach(function (t) { t.el.remove(); });
    targets = [];
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

  // ---------- 生成目标 ----------
  function spawnLetter() {
    var ch = LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
    var el = document.createElement('span');
    el.className = 'tg-letter';
    el.textContent = ch;
    var w = screen.clientWidth;
    var x = 20 + Math.random() * Math.max(40, w - 70);
    el.style.left = x + 'px';
    screen.appendChild(el);
    var t = { el: el, ch: ch, x: x, y: -34, dead: false, isWord: false };
    el.addEventListener('pointerdown', function () {
      pressTarget(t.ch);
    });
    targets.push(t);
  }

  function spawnWord() {
    var word = WORDS[Math.floor(Math.random() * WORDS.length)];
    var el = document.createElement('span');
    el.className = 'tg-letter tg-word';
    // 渲染每个字母：done / next / todo
    for (var i = 0; i < word.length; i++) {
      var s = document.createElement('span');
      s.textContent = word.charAt(i);
      if (i === 0) s.className = 'next';
      else s.className = 'todo';
      el.appendChild(s);
    }
    screen.appendChild(el);
    // 按实际宽度随机 x（避免出界）
    var w = screen.clientWidth;
    var ew = el.offsetWidth;
    var x = 16 + Math.random() * Math.max(30, w - ew - 32);
    el.style.left = x + 'px';
    var t = { el: el, word: word, typed: 0, x: x, y: -34, dead: false, isWord: true };
    el.addEventListener('pointerdown', function () {
      pressTarget(word.charAt(t.typed));
    });
    targets.push(t);
  }

  // ---------- 飘字 ----------
  function popText(x, y, text, bad) {
    var p = document.createElement('span');
    p.className = 'tg-pop' + (bad ? ' tg-pop-bad' : '');
    p.textContent = text;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    screen.appendChild(p);
    setTimeout(function () { p.remove(); }, 720);
  }

  // ---------- 击中 / 漏接 ----------
  function hitLetter(t) {
    t.dead = true;
    t.el.classList.add('hit');
    hits++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    var gain = BASE_SCORE + (combo - 1) * COMBO_BONUS;
    score += gain;
    popText(t.x, t.y, '+' + gain, false);
    renderHud();
    setTimeout(function () {
      t.el.remove();
      targets = targets.filter(function (o) { return o !== t; });
    }, 300);
  }

  function hitWordLetter(t) {
    t.typed++;
    hits++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    var gain = BASE_SCORE + (combo - 1) * COMBO_BONUS;
    score += gain;
    renderHud();

    if (t.typed >= t.word.length) {
      // 打完整单词 → 爆炸消失 + 奖励分
      t.dead = true;
      t.el.classList.add('hit');
      var bonus = t.word.length * 10;
      score += bonus;
      popText(t.x, t.y - 6, '+' + bonus + ' 完美!', false);
      renderHud();
      setTimeout(function () {
        t.el.remove();
        targets = targets.filter(function (o) { return o !== t; });
      }, 300);
    } else {
      // 更新字母状态样式
      var spans = t.el.children;
      for (var i = 0; i < spans.length; i++) {
        spans[i].className = i < t.typed ? 'done' : (i === t.typed ? 'next' : 'todo');
      }
      popText(t.x + t.typed * 20, t.y, '+' + gain, false);
    }
  }

  function missTarget(t) {
    if (t.dead) return;
    t.dead = true;
    t.el.classList.add('miss');
    misses++;
    combo = 0;
    lives--;
    popText(t.x, screen.clientHeight - 60, 'MISS', true);
    renderHud();
    renderLives();
    setTimeout(function () {
      t.el.remove();
      targets = targets.filter(function (o) { return o !== t; });
    }, 340);
    if (lives <= 0) endGame();
  }

  // ---------- 按键处理（统一入口） ----------
  function pressTarget(ch) {
    if (!running || paused || over) return;
    if (LETTERS.indexOf(ch) === -1) return;

    // 找匹配目标：最靠下的优先（最紧急）
    var target = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.dead) continue;
      var need = t.isWord ? t.word.charAt(t.typed) : t.ch;
      if (need === ch) {
        if (!target || t.y > target.y) target = t;
      }
    }
    if (target) {
      if (target.isWord) hitWordLetter(target);
      else hitLetter(target);
    } else if (combo > 0) {
      combo = 0;  // 按错：中断连击
      renderHud();
    }
  }

  // ---------- 主循环 ----------
  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (paused) { lastTime = now; return; }

    var dt = Math.min(100, now - lastTime) / 1000;
    lastTime = now;
    var speed = SPEEDS[speedIndex];

    // 单词模式：下落更慢、生成更稀疏（需要时间逐字母输入）
    var fall = mode === 'words' ? speed.fall * 0.55 : speed.fall;
    var spawn = mode === 'words' ? speed.spawn * 1.9 : speed.spawn;

    if (now - lastSpawn > spawn) {
      if (mode === 'words') spawnWord();
      else spawnLetter();
      lastSpawn = now;
    }

    var floorY = screen.clientHeight - 40;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.dead) continue;
      t.y += fall * dt;
      t.el.style.transform = 'translateY(' + t.y + 'px)';
      if (t.y >= floorY) missTarget(t);
    }
  }

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (running && !over) togglePause();
      return;
    }
    if (!running || paused || over) return;
    pressTarget(e.key.toUpperCase());
  });

  // ---------- 启动 ----------
  renderHud();
  renderLives();
  showStart();
})();
