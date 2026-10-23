/* ============================================================
   Typing Game（打字游戏 - 品牌蓝透明玻璃风格）
   模式一：字母模式 —— 字母掉落，按对应键击落
   模式二：单词模式 —— 小学生英语单词掉落，按顺序输入
           每个字母，打完整单词后爆炸消失
   趣味增强：
   - 8-bit 音效（Web Audio 合成，可一键开关）
   - 道具系统：💣炸弹(B) ❤️生命(H) ⏱️慢速(S) ✨双倍(D)
   - 等级系统：分数越高等级越高，下落逐渐加速
   - 连击称号：5/10/20/30/50 连击触发全屏喝彩
   - 粒子爆炸、屏幕震动、按模式记录最高分
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
  var LEVEL_SCORE = 300;      // 每多少分升一级
  var LEVEL_SPEEDUP = 0.07;   // 每级下落速度增幅
  var POWERUP_CHANCE = 0.12;  // 生成目标时出道具的概率
  var POWERUP_GAP = 8000;     // 两个道具的最小间隔(ms)
  var SLOW_MS = 6000;         // 慢速道具持续时间
  var DOUBLE_MS = 8000;       // 双倍得分持续时间

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

  // 道具定义：掉落时按对应字母键激活
  var POWERUPS = {
    bomb:   { icon: '💣', key: 'B', label: '炸弹', desc: '清除全部目标' },
    heart:  { icon: '❤️', key: 'H', label: '生命', desc: '恢复一条生命' },
    slow:   { icon: '⏱️', key: 'S', label: '慢速', desc: '下落减速 6 秒' },
    double: { icon: '✨', key: 'D', label: '双倍', desc: '得分翻倍 8 秒' }
  };

  // 连击称号（达到指定连击数时全屏喝彩）
  var COMBO_TITLES = [
    { at: 5,  text: '手感不错' },
    { at: 10, text: '厉害!' },
    { at: 20, text: '火力全开' },
    { at: 30, text: '势不可挡' },
    { at: 50, text: '打字之神' }
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
  var level = 1;
  var targets = [];           // 活动目标 {el, ch|word, typed, x, y, dead, isWord, isPowerup, puType}
  var slowUntil = 0;          // 慢速截止时间戳(performance.now)
  var doubleUntil = 0;        // 双倍得分截止时间戳
  var lastSpawn = 0;
  var lastPowerup = 0;
  var rafId = null;
  var lastTime = 0;
  var soundOn = true;
  var audioCtx = null;

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
      '<span class="tg-stat">等级 <strong id="tg-level">1</strong></span>' +
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

  // 道具状态条（显示激活中的道具与剩余时间）
  var puBar = document.createElement('div');
  puBar.className = 'tg-pu-bar';
  screen.appendChild(puBar);

  var overlay = document.createElement('div');
  overlay.className = 'tg-overlay';
  screen.appendChild(overlay);

  var elScore = hud.querySelector('#tg-score');
  var elCombo = hud.querySelector('#tg-combo');
  var elLevel = hud.querySelector('#tg-level');
  var elHits = hud.querySelector('#tg-hits');
  var elMisses = hud.querySelector('#tg-misses');
  var elLives = hud.querySelector('#tg-lives');

  // ---------- 音效（Web Audio 合成 8-bit 风格） ----------
  function ensureAudio() {
    if (!soundOn) return;
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(freq, dur, type, vol, delay) {
    if (!soundOn || !audioCtx) return;
    try {
      var t0 = audioCtx.currentTime + (delay || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(vol || 0.06, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* 忽略音频错误 */ }
  }

  var sfx = {
    hit: function (c) { beep(600 + Math.min(c, 25) * 16, 0.07, 'square', 0.05); },
    word: function () {
      beep(523, 0.08, 'square', 0.06);
      beep(659, 0.08, 'square', 0.06, 0.08);
      beep(784, 0.08, 'square', 0.06, 0.16);
      beep(1047, 0.16, 'square', 0.07, 0.24);
    },
    miss: function () {
      beep(220, 0.16, 'sawtooth', 0.06);
      beep(150, 0.24, 'sawtooth', 0.06, 0.1);
    },
    powerup: function () {
      beep(880, 0.08, 'triangle', 0.08);
      beep(1320, 0.14, 'triangle', 0.08, 0.09);
    },
    bomb: function () {
      beep(90, 0.45, 'sawtooth', 0.12);
      beep(60, 0.5, 'square', 0.1, 0.05);
      beep(180, 0.18, 'sawtooth', 0.07, 0.02);
    },
    levelup: function () {
      beep(523, 0.08, 'square', 0.07);
      beep(659, 0.08, 'square', 0.07, 0.09);
      beep(784, 0.08, 'square', 0.07, 0.18);
      beep(1047, 0.22, 'square', 0.08, 0.27);
    },
    combo: function () {
      beep(784, 0.07, 'square', 0.07);
      beep(988, 0.07, 'square', 0.07, 0.08);
      beep(1175, 0.14, 'square', 0.08, 0.16);
    },
    start: function () {
      beep(523, 0.08, 'square', 0.06);
      beep(784, 0.14, 'square', 0.07, 0.1);
    },
    over: function () {
      beep(392, 0.16, 'square', 0.07);
      beep(330, 0.16, 'square', 0.07, 0.17);
      beep(262, 0.2, 'square', 0.07, 0.34);
      beep(196, 0.42, 'square', 0.08, 0.52);
    }
  };

  // ---------- 速度按钮 + 音效开关 + 暂停按钮 ----------
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

  var soundBtn = document.createElement('button');
  soundBtn.className = 'tg-btn tg-sound-btn';
  soundBtn.type = 'button';
  soundBtn.textContent = '🔊';
  soundBtn.title = '音效开关';
  soundBtn.setAttribute('aria-label', '音效开关');
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !soundOn);
    if (soundOn) { ensureAudio(); sfx.powerup(); }
  });
  controls.appendChild(soundBtn);

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
    elLevel.textContent = level;
    elHits.textContent = hits;
    elMisses.textContent = misses;
    elCombo.classList.toggle('hot', combo >= 10);
  }

  // ---------- 最高分（按模式分别记录） ----------
  function loadBest() {
    try {
      return parseInt(localStorage.getItem('tg-best-' + mode) || '0', 10) || 0;
    } catch (e) { return 0; }
  }

  function saveBest(v) {
    try { localStorage.setItem('tg-best-' + mode, String(v)); } catch (e) {}
  }

  // ---------- 覆盖层 ----------
  var MODE_DESC = {
    letters: '字母正在掉落，按下键盘上<strong>对应的字母键</strong>将其击落。<br>' +
             '漏接会损失生命，生命耗尽游戏结束。选择速度后开始挑战！',
    words: '英语单词正在掉落，按<strong>顺序输入单词的每个字母</strong>，<br>' +
           '打完整单词即可将其<strong>引爆</strong>并获得额外奖励分！<br>' +
           '单词落底未打完会损失生命。选择速度后开始挑战！'
  };

  function puLegendHtml() {
    return '<div class="tg-pu-legend">' +
      '<span class="tg-pu-item" title="清除全部目标">💣 炸弹 <kbd>B</kbd></span>' +
      '<span class="tg-pu-item" title="恢复一条生命">❤️ 生命 <kbd>H</kbd></span>' +
      '<span class="tg-pu-item" title="下落减速 6 秒">⏱️ 慢速 <kbd>S</kbd></span>' +
      '<span class="tg-pu-item" title="得分翻倍 8 秒">✨ 双倍 <kbd>D</kbd></span>' +
    '</div>';
  }

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
      puLegendHtml() +
      '<p class="tg-best-line" id="tg-best-line">🏆 本模式最高分 <strong>' + loadBest() + '</strong></p>' +
      '<button class="tg-btn tg-blink" id="tg-start" type="button">▶ 开始游戏</button>';
    overlay.querySelectorAll('.tg-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.getAttribute('data-mode');
        overlay.querySelectorAll('.tg-mode-btn').forEach(function (o) {
          o.classList.toggle('active', o === b);
        });
        overlay.querySelector('#tg-mode-desc').innerHTML = MODE_DESC[mode];
        overlay.querySelector('#tg-best-line').innerHTML =
          '🏆 本模式最高分 <strong>' + loadBest() + '</strong>';
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
    var best = loadBest();
    var isNew = score > best;
    if (isNew) { best = score; saveBest(best); }
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="tg-title">' + (isNew ? '🏆 新纪录!' : 'GAME OVER') + '</h2>' +
      '<p class="tg-final">最终得分 <strong>' + score + '</strong>　最高连击 <strong>' + bestCombo +
      '</strong>　达到等级 <strong>' + level + '</strong><br>击中 <strong>' + hits + '</strong> 个　漏接 <strong>' + misses +
      ' 个</strong>　命中率 <strong>' + accuracy + '%</strong><br>历史最高分 <strong>' + best + '</strong></p>' +
      '<button class="tg-btn" id="tg-restart" type="button">↻ 再来一局</button>';
    overlay.querySelector('#tg-restart').addEventListener('click', startGame);
  }

  // ---------- 游戏流程 ----------
  function startGame() {
    ensureAudio();
    targets.forEach(function (t) { t.el.remove(); });
    targets = [];
    score = 0;
    combo = 0;
    bestCombo = 0;
    hits = 0;
    misses = 0;
    lives = MAX_LIVES;
    level = 1;
    slowUntil = 0;
    doubleUntil = 0;
    over = false;
    paused = false;
    running = true;
    lastSpawn = 0;
    lastPowerup = 0;
    renderHud();
    renderLives();
    overlay.hidden = true;
    pauseBtn.textContent = '暂停';
    sfx.start();
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
    sfx.over();
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

  // ---------- 生成道具 ----------
  function spawnPowerup() {
    var types = Object.keys(POWERUPS);
    var type = types[Math.floor(Math.random() * types.length)];
    var pu = POWERUPS[type];
    var el = document.createElement('span');
    el.className = 'tg-powerup';
    el.innerHTML =
      '<span class="tg-pu-icon">' + pu.icon + '</span>' +
      '<span class="tg-pu-key">' + pu.key + '</span>';
    var w = screen.clientWidth;
    var x = 24 + Math.random() * Math.max(40, w - 90);
    el.style.left = x + 'px';
    screen.appendChild(el);
    var t = { el: el, isPowerup: true, puType: type, x: x, y: -56, dead: false };
    el.addEventListener('pointerdown', function () {
      pressTarget(pu.key);
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

  // ---------- 全屏大字（连击称号 / 升级提示） ----------
  function bigText(text, cls) {
    var b = document.createElement('div');
    b.className = 'tg-big' + (cls ? ' ' + cls : '');
    b.textContent = text;
    screen.appendChild(b);
    setTimeout(function () { b.remove(); }, 1100);
  }

  // ---------- 粒子爆炸 ----------
  function burstParticles(x, y, colors, count) {
    if (typeof colors === 'string') colors = [colors];
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'tg-particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = colors[i % colors.length];
      var size = 4 + Math.random() * 5;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      var angle = Math.random() * Math.PI * 2;
      var dist = 26 + Math.random() * 46;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      screen.appendChild(p);
      (function (el) {
        setTimeout(function () { el.remove(); }, 620);
      })(p);
    }
  }

  // ---------- 屏幕震动 ----------
  function shakeScreen() {
    screen.classList.remove('tg-shake');
    void screen.offsetWidth; // 强制重排以重置动画
    screen.classList.add('tg-shake');
    setTimeout(function () { screen.classList.remove('tg-shake'); }, 400);
  }

  // ---------- 等级 / 连击检查 ----------
  function checkLevel() {
    var newLevel = 1 + Math.floor(score / LEVEL_SCORE);
    if (newLevel > level) {
      level = newLevel;
      sfx.levelup();
      bigText('⬆ LEVEL ' + level, 'tg-big-level');
    }
  }

  function checkComboTitle() {
    for (var i = COMBO_TITLES.length - 1; i >= 0; i--) {
      if (combo === COMBO_TITLES[i].at) {
        bigText(COMBO_TITLES[i].text + ' ×' + combo, 'tg-big-combo');
        sfx.combo();
        return;
      }
    }
  }

  // ---------- 道具激活 ----------
  function activatePowerup(t) {
    t.dead = true;
    t.el.classList.add('hit');
    sfx.powerup();
    var now = performance.now();

    if (t.puType === 'bomb') {
      activateBomb(t);
    } else if (t.puType === 'heart') {
      if (lives < MAX_LIVES) {
        lives++;
        renderLives();
        popText(t.x, t.y, '❤️ +1 生命', false);
      } else {
        score += 30;
        checkLevel();
        popText(t.x, t.y, '❤️ 生命已满 +30', false);
      }
      burstParticles(t.x + 18, t.y + 18, ['#e05555', '#ff8a8a', '#ffb3b3'], 10);
    } else if (t.puType === 'slow') {
      slowUntil = now + SLOW_MS;
      popText(t.x, t.y, '⏱️ 时间变慢!', false);
      burstParticles(t.x + 18, t.y + 18, ['#2d9cdb', '#4fb3e8', '#9bd4f5'], 10);
    } else if (t.puType === 'double') {
      doubleUntil = now + DOUBLE_MS;
      popText(t.x, t.y, '✨ 双倍得分!', false);
      burstParticles(t.x + 18, t.y + 18, ['#f5a623', '#ffd57e', '#ffb340'], 10);
    }
    renderHud();
    setTimeout(function () {
      t.el.remove();
      targets = targets.filter(function (o) { return o !== t; });
    }, 300);
  }

  function activateBomb(bombT) {
    sfx.bomb();
    shakeScreen();
    // 全屏闪光
    var flash = document.createElement('div');
    flash.className = 'tg-flash';
    screen.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 450);

    // 清除屏幕上所有目标
    var cleared = 0;
    targets.forEach(function (t) {
      if (t.dead || t === bombT) return;
      t.dead = true;
      t.el.classList.add('hit');
      if (!t.isPowerup) {
        cleared++;
        burstParticles(t.x + 14, t.y + 16, ['#2d9cdb', '#f5a623', '#e05555'], 6);
      }
      setTimeout(function () { t.el.remove(); }, 300);
    });
    var gain = cleared * 5;
    score += gain;
    checkLevel();
    popText(bombT.x, bombT.y, '💥 ' + (cleared > 0 ? '+' + gain : '空爆!'), false);
  }

  // ---------- 击中 / 漏接 ----------
  function hitLetter(t) {
    t.dead = true;
    t.el.classList.add('hit');
    hits++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    checkComboTitle();
    var gain = BASE_SCORE + (combo - 1) * COMBO_BONUS;
    if (performance.now() < doubleUntil) gain *= 2;
    score += gain;
    checkLevel();
    sfx.hit(combo);
    burstParticles(t.x + 14, t.y + 18, '#2d9cdb', 7);
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
    checkComboTitle();
    var gain = BASE_SCORE + (combo - 1) * COMBO_BONUS;
    if (performance.now() < doubleUntil) gain *= 2;
    score += gain;
    checkLevel();
    sfx.hit(combo);
    renderHud();

    if (t.typed >= t.word.length) {
      // 打完整单词 → 爆炸消失 + 奖励分
      t.dead = true;
      t.el.classList.add('hit');
      var bonus = t.word.length * 10;
      if (performance.now() < doubleUntil) bonus *= 2;
      score += bonus;
      checkLevel();
      sfx.word();
      burstParticles(t.x + t.el.offsetWidth / 2, t.y + 16,
        ['#28a745', '#2d9cdb', '#f5a623'], 14);
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
    sfx.miss();
    shakeScreen();
    popText(t.x, screen.clientHeight - 60, 'MISS', true);
    renderHud();
    renderLives();
    setTimeout(function () {
      t.el.remove();
      targets = targets.filter(function (o) { return o !== t; });
    }, 340);
    if (lives <= 0) endGame();
  }

  // 道具落底：消失但不扣生命（错失奖励）
  function missPowerup(t) {
    if (t.dead) return;
    t.dead = true;
    t.el.classList.add('miss');
    setTimeout(function () {
      t.el.remove();
      targets = targets.filter(function (o) { return o !== t; });
    }, 340);
  }

  // ---------- 按键处理（统一入口） ----------
  function pressTarget(ch) {
    if (!running || paused || over) return;
    if (LETTERS.indexOf(ch) === -1) return;

    // 1. 优先匹配道具（按道具标注的字母键激活）
    var pu = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.dead || !t.isPowerup) continue;
      if (POWERUPS[t.puType].key === ch) {
        if (!pu || t.y > pu.y) pu = t;
      }
    }
    if (pu) {
      activatePowerup(pu);
      return;
    }

    // 2. 匹配普通目标：最靠下的优先（最紧急）
    var target = null;
    for (var j = 0; j < targets.length; j++) {
      var o = targets[j];
      if (o.dead || o.isPowerup) continue;
      var need = o.isWord ? o.word.charAt(o.typed) : o.ch;
      if (need === ch) {
        if (!target || o.y > target.y) target = o;
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

  // ---------- 道具状态条 ----------
  function updatePowerupBar(now) {
    var html = '';
    if (now < doubleUntil) {
      html += '<span class="tg-pu-chip tg-pu-chip-double">✨ 双倍 ' +
        Math.ceil((doubleUntil - now) / 1000) + 's</span>';
    }
    if (now < slowUntil) {
      html += '<span class="tg-pu-chip tg-pu-chip-slow">⏱️ 慢速 ' +
        Math.ceil((slowUntil - now) / 1000) + 's</span>';
    }
    if (puBar.innerHTML !== html) puBar.innerHTML = html;
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

    // 等级加成：等级越高下落越快、生成越密
    fall *= 1 + (level - 1) * LEVEL_SPEEDUP;
    spawn *= Math.max(0.55, 1 - (level - 1) * 0.05);

    // 慢速道具：下落减速
    if (now < slowUntil) fall *= 0.4;

    // 激活状态视觉反馈
    screen.classList.toggle('tg-slowmo', now < slowUntil);
    screen.classList.toggle('tg-double', now < doubleUntil);
    updatePowerupBar(now);

    if (now - lastSpawn > spawn) {
      // 道具生成：概率 + 间隔限制 + 屏幕上无其他道具
      var hasPu = false;
      for (var k = 0; k < targets.length; k++) {
        if (targets[k].isPowerup && !targets[k].dead) { hasPu = true; break; }
      }
      if (!hasPu && now - lastPowerup > POWERUP_GAP && Math.random() < POWERUP_CHANCE) {
        spawnPowerup();
        lastPowerup = now;
      } else if (mode === 'words') {
        spawnWord();
      } else {
        spawnLetter();
      }
      lastSpawn = now;
    }

    var floorY = screen.clientHeight - 40;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.dead) continue;
      t.y += fall * dt;
      t.el.style.transform = 'translateY(' + t.y + 'px)';
      if (t.y >= floorY) {
        if (t.isPowerup) missPowerup(t);
        else missTarget(t);
      }
    }
  }

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (running && !over) togglePause();
      return;
    }
    if (!running || paused || over) return;
    ensureAudio();
    pressTarget(e.key.toUpperCase());
  });

  // ---------- 启动 ----------
  renderHud();
  renderLives();
  showStart();
})();
