/* ============================================================
   Happy Mrs Chicken（快乐小鸡 · 小鸡下蛋收集游戏）
   灵感来自《小猪佩奇》里佩奇和乔治玩的「快乐鸡太太」：
   鸡太太在农场里散步、下蛋；玩家要在鸡蛋孵出小鸡之前
   点击鸡蛋把它们收进篮子。
   玩法：连击倍率 / 金蛋慢动作与回血 / 等级加速 / 最高分 /
   换角色（鸡太太 ↔ 下蛋小蛇，小蛇每 3 次下蛋双蛋齐发）。
   画面全部由 Canvas 矢量绘制，无外部图片与音频资源。
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('hc-app');
  if (!app) return;

  var TAU = Math.PI * 2;

  // ---------- 玩法参数 ----------
  var START_LIVES = 3;
  var MAX_LIVES = 5;
  var EGGS_PER_LEVEL = 8;
  var BASE_EGG_LIFE = 4.2;   // 鸡蛋从下出来到孵化的秒数（1 级）
  var MIN_EGG_LIFE = 1.9;
  var BASE_INTERVAL = 2.2;   // 两次下蛋的间隔（1 级）
  var MIN_INTERVAL = 0.8;
  var GOLDEN_CHANCE = 0.09;
  var SLOW_SECONDS = 3.5;
  var BEST_KEY = 'hc_best_v1';
  var SOUND_KEY = 'hc_sound_v1';
  var CHAR_KEY = 'hc_char_v1';

  var CHAR_ORDER = ['chicken', 'snake'];

  // 可选角色：造型不同，下蛋手感也略有差异
  var CHARS = {
    chicken: {
      id: 'chicken',
      name: '鸡太太',
      emoji: '🐔',
      en: 'Happy Mrs Chicken',
      desc: '鸡太太在院子里下蛋啦！在她孵出小鸡之前，快点点破鸡蛋，把鸡蛋收进篮子。',
      trait: '经典均衡：移动、下蛋、孵化速度都很标准。',
      hatchName: '小鸡',
      hatchEmoji: '🐣',
      overEn: 'The chicks flew away',
      speech: '咯咯哒！',
      speechColor: '#8a5a1c',
      speechY: 158,
      margin: 48,
      speed: 1,
      interval: 1,
      life: 1,
      eggOffset: 98,
      doubleEvery: 0,
      startToast: '鸡太太来啦，准备接蛋！',
      levelToast: '鸡太太跑得更快啦！',
      switchToast: '换回鸡太太，稳稳地下蛋！'
    },
    snake: {
      id: 'snake',
      name: '下蛋小蛇',
      emoji: '🐍',
      en: 'Happy Mrs Snake',
      desc: '下蛋小蛇扭进院子里下蛋啦！在她孵出小蛇之前，快点点破鸡蛋，把鸡蛋收进篮子。',
      trait: '每下 3 次蛋就双蛋齐发；蛇蛋孵化稍慢，但爬行有点懒。',
      hatchName: '小蛇',
      hatchEmoji: '🐍',
      overEn: 'The snakes slithered away',
      speech: '嘶嘶~',
      speechColor: '#2f6b3d',
      speechY: 132,
      margin: 72,
      speed: 0.86,
      interval: 1.4,
      life: 1.06,
      eggOffset: 64,
      doubleEvery: 3,
      startToast: '下蛋小蛇来啦，小心双蛋齐发！',
      levelToast: '小蛇扭得更快啦！',
      switchToast: '换上下蛋小蛇，每 3 次下蛋双蛋齐发！'
    }
  };

  var character = CHARS.chicken;
  try {
    var savedChar = localStorage.getItem(CHAR_KEY);
    if (savedChar && CHARS[savedChar]) character = CHARS[savedChar];
  } catch (e) { /* 忽略 */ }

  var FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif";
  var MONO = "'SF Mono', Monaco, Consolas, monospace";

  // ---------- DOM ----------
  var crt = document.createElement('div');
  crt.className = 'hc-crt';
  crt.innerHTML =
    '<div class="hc-hud">' +
      '<div class="hc-hud-group">' +
        '<span class="hc-stat">得分 <strong id="hc-score">0</strong></span>' +
        '<span class="hc-stat hc-stat-best">最高 <strong id="hc-best">0</strong></span>' +
        '<span class="hc-stat">等级 <strong id="hc-level">1</strong></span>' +
        '<span class="hc-stat">连击 <strong id="hc-combo">0</strong><em id="hc-mult">×1</em></span>' +
        '<span class="hc-stat hc-stat-collected">收集 <strong id="hc-collected">0</strong></span>' +
      '</div>' +
      '<div class="hc-hud-right">' +
        '<button type="button" class="hc-char-btn" id="hc-char" title="切换角色（C）" aria-label="切换角色">' +
          '<span class="hc-char-emoji" id="hc-char-emoji">🐔</span>' +
          '<span class="hc-char-name" id="hc-char-name">鸡太太</span>' +
          '<span class="hc-char-swap">⇄</span>' +
        '</button>' +
        '<span class="hc-hearts" id="hc-lives" aria-label="剩余生命"></span>' +
        '<button type="button" class="hc-icon-btn" id="hc-sound" title="开关音效" aria-label="开关音效">🔊</button>' +
        '<button type="button" class="hc-icon-btn hc-pause-btn" id="hc-pause"><span id="hc-pause-icon">⏸</span><span class="hc-pause-text" id="hc-pause-text">暂停</span></button>' +
      '</div>' +
    '</div>' +
    '<div class="hc-stage" id="hc-stage">' +
      '<canvas id="hc-canvas" aria-label="快乐小鸡游戏画面">你的浏览器不支持 Canvas 画布。</canvas>' +
      '<div class="hc-toast" id="hc-toast" role="status"></div>' +
      '<div class="hc-overlay" id="hc-start">' +
        '<div class="hc-card">' +
          '<div class="hc-mascot" id="hc-mascot">🐔</div>' +
          '<h2 class="hc-card-title">快乐小鸡</h2>' +
          '<p class="hc-card-en" id="hc-card-en">Happy Mrs Chicken</p>' +
          '<p class="hc-card-desc" id="hc-card-desc">鸡太太在院子里下蛋啦！在她孵出小鸡之前，快点点破鸡蛋，把鸡蛋收进篮子。</p>' +
          '<div class="hc-char-pick" role="group" aria-label="选择角色">' +
            '<button type="button" class="hc-char-opt is-active" data-char="chicken">' +
              '<span class="hc-char-opt-emoji">🐔</span>' +
              '<span class="hc-char-opt-text">' +
                '<span class="hc-char-opt-name">鸡太太</span>' +
                '<span class="hc-char-opt-tag">经典均衡</span>' +
              '</span>' +
            '</button>' +
            '<button type="button" class="hc-char-opt" data-char="snake">' +
              '<span class="hc-char-opt-emoji">🐍</span>' +
              '<span class="hc-char-opt-text">' +
                '<span class="hc-char-opt-name">下蛋小蛇</span>' +
                '<span class="hc-char-opt-tag">双蛋齐发</span>' +
              '</span>' +
            '</button>' +
          '</div>' +
          '<p class="hc-char-trait" id="hc-char-trait">经典均衡：移动、下蛋、孵化速度都很标准。</p>' +
          '<ul class="hc-rules">' +
            '<li><b>点一点</b>刚下的蛋，立刻得分；连击越高倍率越高（最高 ×5）</li>' +
            '<li><b>金蛋</b>出现时抓住它：加分、回血、全场慢动作</li>' +
            '<li>蛋放太久会孵出<b id="hc-rule-hatch">小鸡</b>跑掉，<b>扣一条命</b></li>' +
          '</ul>' +
          '<button type="button" class="hc-btn hc-btn-primary" id="hc-start-btn">开始游戏</button>' +
          '<p class="hc-start-best" id="hc-start-best">🏆 最高分 <strong>0</strong></p>' +
          '<p class="hc-hint">Enter 开始 · Esc 暂停 · M 静音 · C 换角色</p>' +
        '</div>' +
      '</div>' +
      '<div class="hc-overlay is-hidden" id="hc-pause-overlay">' +
        '<div class="hc-card">' +
          '<div class="hc-mascot" id="hc-pause-mascot">🐔</div>' +
          '<h2 class="hc-card-title">暂停中</h2>' +
          '<p class="hc-card-desc" id="hc-pause-desc">鸡太太在院子里等你回来。</p>' +
          '<div class="hc-btn-row">' +
            '<button type="button" class="hc-btn hc-btn-primary" id="hc-resume-btn">继续游戏</button>' +
            '<button type="button" class="hc-btn" id="hc-switch-btn">换个角色</button>' +
            '<button type="button" class="hc-btn" id="hc-restart-btn">重新开始</button>' +
          '</div>' +
          '<p class="hc-hint">按 Esc 继续 · 按 C 换角色</p>' +
        '</div>' +
      '</div>' +
      '<div class="hc-overlay is-hidden" id="hc-overlay">' +
        '<div class="hc-card">' +
          '<div class="hc-over-emoji" id="hc-over-emoji">🐣</div>' +
          '<h2 class="hc-card-title">游戏结束</h2>' +
          '<p class="hc-card-en" id="hc-over-en">The chicks flew away</p>' +
          '<div class="hc-over-stats">' +
            '<div><span>得分</span><strong id="hc-final-score">0</strong></div>' +
            '<div><span>收集鸡蛋</span><strong id="hc-final-eggs">0</strong></div>' +
            '<div><span>最高连击</span><strong id="hc-final-combo">0</strong></div>' +
          '</div>' +
          '<p class="hc-record is-hidden" id="hc-record">🏆 新纪录！</p>' +
          '<div class="hc-btn-row">' +
            '<button type="button" class="hc-btn hc-btn-primary" id="hc-again-btn">再玩一次</button>' +
            '<button type="button" class="hc-btn" id="hc-switch-btn-over">换个角色</button>' +
          '</div>' +
          '<p class="hc-hint">按 Enter 重新开始 · 按 C 换角色</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  app.appendChild(crt);

  var stage = crt.querySelector('#hc-stage');
  var canvas = crt.querySelector('#hc-canvas');
  var ctx = canvas.getContext('2d');

  var elScore = crt.querySelector('#hc-score');
  var elBest = crt.querySelector('#hc-best');
  var elLevel = crt.querySelector('#hc-level');
  var elCombo = crt.querySelector('#hc-combo');
  var elMult = crt.querySelector('#hc-mult');
  var elCollected = crt.querySelector('#hc-collected');
  var elLives = crt.querySelector('#hc-lives');
  var soundBtn = crt.querySelector('#hc-sound');
  var pauseBtn = crt.querySelector('#hc-pause');
  var pauseIcon = crt.querySelector('#hc-pause-icon');
  var pauseText = crt.querySelector('#hc-pause-text');
  var charBtn = crt.querySelector('#hc-char');
  var charEmoji = crt.querySelector('#hc-char-emoji');
  var charName = crt.querySelector('#hc-char-name');
  var mascot = crt.querySelector('#hc-mascot');
  var cardEn = crt.querySelector('#hc-card-en');
  var cardDesc = crt.querySelector('#hc-card-desc');
  var charTrait = crt.querySelector('#hc-char-trait');
  var ruleHatch = crt.querySelector('#hc-rule-hatch');
  var charOpts = crt.querySelectorAll('.hc-char-opt');
  var pauseMascot = crt.querySelector('#hc-pause-mascot');
  var pauseDesc = crt.querySelector('#hc-pause-desc');
  var overEmoji = crt.querySelector('#hc-over-emoji');
  var overEn = crt.querySelector('#hc-over-en');
  var switchBtn = crt.querySelector('#hc-switch-btn');
  var switchBtnOver = crt.querySelector('#hc-switch-btn-over');
  var startBest = crt.querySelector('#hc-start-best');
  var startOverlay = crt.querySelector('#hc-start');
  var pauseOverlay = crt.querySelector('#hc-pause-overlay');
  var overOverlay = crt.querySelector('#hc-overlay');
  var startBtn = crt.querySelector('#hc-start-btn');
  var resumeBtn = crt.querySelector('#hc-resume-btn');
  var restartBtn = crt.querySelector('#hc-restart-btn');
  var againBtn = crt.querySelector('#hc-again-btn');
  var toastEl = crt.querySelector('#hc-toast');
  var finalScore = crt.querySelector('#hc-final-score');
  var finalEggs = crt.querySelector('#hc-final-eggs');
  var finalCombo = crt.querySelector('#hc-final-combo');
  var recordEl = crt.querySelector('#hc-record');

  // ---------- 状态 ----------
  var best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { best = 0; }
  var soundOn = true;
  try { if (localStorage.getItem(SOUND_KEY) === '0') soundOn = false; } catch (e) { /* 忽略 */ }

  var state = 'idle';  // idle | playing | paused | over
  var score = 0;
  var lives = START_LIVES;
  var level = 1;
  var collected = 0;
  var combo = 0;
  var bestCombo = 0;
  var comboTimer = 0;
  var layCount = 0;

  var eggs = [];
  var chicks = [];
  var particles = [];
  var floaters = [];

  var chicken = {
    x: 0, dir: 1, targetX: 0,
    state: 'walk', walkPhase: 0, layTimer: 1.2, layAnim: 0, laid: true,
    speech: 0, blinkT: 0, nextBlink: 2.5
  };

  var W = 960, H = 500, DPR = 1, u = 1;
  var horizonY = 270, groundY = 440;
  var gameTime = 0;
  var ambientT = 0;
  var slowUntil = 0;
  var timeScale = 1;
  var shake = 0;
  var lastTs = 0;
  var rafId = null;
  var toastTimer = null;
  var decor = [];
  var tufts = [];
  var butterflies = [];
  var clouds = [
    { x: 0.08, y: 0.16, s: 1.0, sp: 0.010 },
    { x: 0.38, y: 0.09, s: 0.7, sp: 0.007 },
    { x: 0.62, y: 0.22, s: 0.88, sp: 0.0085 },
    { x: 0.88, y: 0.12, s: 0.6, sp: 0.012 }
  ];

  var audioCtx = null;

  // ---------- 小工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ellipse(x, y, rx, ry, fill) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRR(x, y, w, h, r, color) {
    roundRectPath(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function comboMult() {
    return Math.min(5, 1 + Math.floor(combo / 5));
  }

  function eggLife() {
    return Math.max(MIN_EGG_LIFE, BASE_EGG_LIFE - (level - 1) * 0.2) * character.life;
  }

  function layInterval() {
    var base = Math.max(MIN_INTERVAL, BASE_INTERVAL - (level - 1) * 0.155);
    return base * character.interval * rand(0.86, 1.14);
  }

  // ---------- 音效（Web Audio 实时合成） ----------
  function ensureAudio() {
    if (!soundOn) return;
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch (e) { /* 忽略 */ }
    }
  }

  function tone(freq, dur, type, vol, delay, freqTo) {
    if (!soundOn || !audioCtx) return;
    try {
      var t0 = audioCtx.currentTime + (delay || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    } catch (e) { /* 忽略音频错误 */ }
  }

  var sfx = {
    cluck: function () {
      tone(720, 0.07, 'triangle', 0.06, 0, 520);
      tone(600, 0.09, 'triangle', 0.05, 0.09, 380);
    },
    lay: function () {
      tone(480, 0.07, 'sine', 0.05, 0, 660);
    },
    collect: function (n) {
      var base = 720 + Math.min(n, 14) * 26;
      tone(base, 0.07, 'sine', 0.07, 0, base * 1.35);
      tone(base * 1.5, 0.06, 'sine', 0.035, 0.05);
    },
    crack: function () {
      tone(250, 0.06, 'square', 0.035, 0, 170);
    },
    hatch: function () {
      tone(520, 0.11, 'sawtooth', 0.045, 0, 320);
      tone(380, 0.2, 'sawtooth', 0.045, 0.11, 150);
      tone(900, 0.05, 'triangle', 0.03, 0.22, 1200);
    },
    golden: function () {
      [880, 1108, 1318, 1760].forEach(function (f, i) {
        tone(f, 0.1, 'triangle', 0.055, i * 0.07);
      });
    },
    spawnGolden: function () {
      tone(1318, 0.07, 'sine', 0.03, 0);
      tone(1760, 0.1, 'sine', 0.025, 0.07);
    },
    level: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, 0.09, 'triangle', 0.05, i * 0.08);
      });
    },
    combo: function () {
      tone(784, 0.06, 'sine', 0.05, 0);
      tone(988, 0.06, 'sine', 0.05, 0.07);
      tone(1175, 0.11, 'sine', 0.05, 0.14);
    },
    start: function () {
      tone(523, 0.08, 'triangle', 0.05, 0);
      tone(784, 0.14, 'triangle', 0.06, 0.1);
    },
    over: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone(f, 0.18, 'triangle', 0.055, i * 0.17);
      });
    }
  };

  // ---------- 角色切换 ----------
  function syncCharUI() {
    var c = character;
    charEmoji.textContent = c.emoji;
    charName.textContent = c.name;
    charBtn.title = '切换角色（C）· 当前：' + c.name;
    charBtn.setAttribute('aria-label', '切换角色，当前角色：' + c.name);

    mascot.textContent = c.emoji;
    cardEn.textContent = c.en;
    cardDesc.textContent = c.desc;
    charTrait.textContent = c.trait;
    ruleHatch.textContent = c.hatchName;
    pauseMascot.textContent = c.emoji;
    pauseDesc.textContent = c.name + '在院子里等你回来。';
    overEmoji.textContent = c.hatchEmoji;
    overEn.textContent = c.overEn;

    for (var i = 0; i < charOpts.length; i++) {
      charOpts[i].classList.toggle('is-active', charOpts[i].getAttribute('data-char') === c.id);
      charOpts[i].setAttribute('aria-pressed', charOpts[i].getAttribute('data-char') === c.id ? 'true' : 'false');
    }
  }

  function chooseCharacter(id, force) {
    var next = CHARS[id];
    if (!next || (next === character && !force)) return false;
    character = next;
    try { localStorage.setItem(CHAR_KEY, character.id); } catch (e) { /* 忽略 */ }
    syncCharUI();

    // 换角色后重新安排下蛋节奏，避免旧角色的计时残留
    chicken.layTimer = Math.min(chicken.layTimer, 1.1);
    chicken.layAnim = 0;
    chicken.laid = true;
    chicken.state = 'walk';
    chicken.x = clamp(chicken.x, character.margin * u, W - character.margin * u);
    chicken.targetX = clamp(chicken.targetX, character.margin * u, W - character.margin * u);
    return true;
  }

  function cycleCharacter() {
    var idx = CHAR_ORDER.indexOf(character.id);
    var id = CHAR_ORDER[(idx + 1) % CHAR_ORDER.length];
    chooseCharacter(id, true);
    ensureAudio();
    if (state === 'playing') {
      showToast(character.switchToast);
      chicken.layTimer = Math.min(chicken.layTimer, 0.8);
    }
    return character;
  }

  // ---------- HUD ----------
  function updateHud() {
    elScore.textContent = score;
    elBest.textContent = Math.max(best, score);
    elLevel.textContent = level;
    elCombo.textContent = combo;
    var mult = comboMult();
    elMult.textContent = '×' + mult;
    elMult.classList.toggle('is-hot', mult > 1);
    elCollected.textContent = collected;

    var total = Math.max(START_LIVES, lives);
    var html = '';
    for (var i = 0; i < total; i++) {
      html += '<span class="hc-heart' + (i >= lives ? ' lost' : '') + '">❤️</span>';
    }
    elLives.innerHTML = html;
    elLives.setAttribute('aria-label', '剩余生命 ' + lives);

    var bestShown = Math.max(best, score);
    startBest.innerHTML = bestShown > 0
      ? '🏆 最高分 <strong>' + bestShown + '</strong>'
      : '还没有记录，来创造第一个最高分吧';
    startBest.classList.toggle('is-empty', bestShown <= 0);
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    // 强制回流以重启动画
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1900);
  }

  function setOverlay(el, show) {
    el.classList.toggle('is-hidden', !show);
  }

  // ---------- 布局与装饰 ----------
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var oldW = W;
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    u = clamp(W / 840, 0.68, 1.2);
    horizonY = H * 0.55;
    groundY = H - Math.max(56 * u, H * 0.1);

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    if (oldW && oldW !== W) {
      var k = W / oldW;
      chicken.x *= k;
      chicken.targetX *= k;
      eggs.forEach(function (e) { e.x *= k; });
      chicks.forEach(function (c) { c.x *= k; });
      floaters.forEach(function (f) { f.x *= k; });
      particles.forEach(function (p) { p.x *= k; });
    }

    eggs.forEach(function (e) {
      e.w = 34 * u;
      e.h = 46 * u;
      e.baseY = groundY - e.h * 0.5 - 2 * u;
    });

    chicken.x = clamp(chicken.x, character.margin * u, W - character.margin * u);
    chicken.targetX = clamp(chicken.targetX, character.margin * u, W - character.margin * u);

    buildDecor();
  }

  function buildDecor() {
    var rnd = mulberry32(20261101);
    decor = [];
    tufts = [];
    var top = horizonY + 96 * u;
    var bottom = H - 16 * u;
    var i;

    for (i = 0; i < 16; i++) {
      decor.push({
        x: 12 * u + rnd() * Math.max(1, W - 24 * u),
        y: top + rnd() * Math.max(1, bottom - top),
        s: 0.75 + rnd() * 0.6,
        kind: rnd() < 0.55 ? 0 : 1
      });
    }
    for (i = 0; i < 34; i++) {
      tufts.push({
        x: rnd() * W,
        y: top - 16 * u + rnd() * Math.max(1, bottom - top + 16 * u),
        s: 0.7 + rnd() * 0.9
      });
    }
    butterflies = [
      { x: 0.26, y: 0.68, ph: 0.5, range: 0.055 },
      { x: 0.68, y: 0.62, ph: 2.2, range: 0.045 }
    ];
  }

  // ---------- 游戏流程 ----------
  function resetGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    collected = 0;
    combo = 0;
    bestCombo = 0;
    comboTimer = 0;
    layCount = 0;
    eggs.length = 0;
    chicks.length = 0;
    particles.length = 0;
    floaters.length = 0;
    gameTime = 0;
    slowUntil = 0;
    timeScale = 1;
    shake = 0;

    chicken.x = W * 0.3;
    chicken.dir = 1;
    chicken.targetX = W * 0.72;
    chicken.state = 'walk';
    chicken.walkPhase = 0;
    chicken.layTimer = 1.3;
    chicken.layAnim = 0;
    chicken.laid = true;
    chicken.speech = 0;
    chicken.blinkT = 0;
    chicken.nextBlink = 2.5;

    updateHud();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    state = 'playing';
    setOverlay(startOverlay, false);
    setOverlay(pauseOverlay, false);
    setOverlay(overOverlay, false);
    pauseBtn.disabled = false;
    setPauseLabel(false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    sfx.start();
    showToast(character.startToast);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    setOverlay(pauseOverlay, true);
    setPauseLabel(true);
    pauseBtn.disabled = false;
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    setOverlay(pauseOverlay, false);
    setPauseLabel(false);
  }

  function setPauseLabel(paused) {
    pauseIcon.textContent = paused ? '▶' : '⏸';
    pauseText.textContent = paused ? '继续' : '暂停';
    pauseBtn.setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
  }

  function togglePause() {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  function endGame() {
    if (state === 'over') return;
    state = 'over';
    sfx.over();

    var isRecord = score > best;
    if (isRecord) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 忽略 */ }
    }

    finalScore.textContent = score;
    finalEggs.textContent = collected;
    finalCombo.textContent = bestCombo;
    recordEl.classList.toggle('is-hidden', !(isRecord && score > 0));

    setOverlay(overOverlay, true);
    setOverlay(pauseOverlay, false);
    setPauseLabel(false);
    pauseBtn.disabled = true;
    updateHud();
  }

  function checkLevel() {
    var lv = 1 + Math.floor(collected / EGGS_PER_LEVEL);
    if (lv > level) {
      level = lv;
      sfx.level();
      showToast('第 ' + level + ' 关 · ' + character.levelToast);
    }
  }

  // ---------- 鸡太太 ----------
  function pickTarget() {
    var pad = Math.max(60, character.margin) * u;
    var minMove = W * 0.24;
    var nx = chicken.targetX;
    for (var i = 0; i < 8; i++) {
      nx = pad + Math.random() * Math.max(1, W - pad * 2);
      if (Math.abs(nx - chicken.x) > minMove) break;
    }
    chicken.targetX = nx;
  }

  function startLay() {
    chicken.state = 'lay';
    chicken.layAnim = 0;
    chicken.laid = false;
    chicken.speech = 1.15;
    chicken.layTimer = layInterval();
    layCount += 1;
    sfx.cluck();
  }

  function layEgg() {
    var count = character.doubleEvery > 0 && layCount % character.doubleEvery === 0 ? 2 : 1;
    for (var n = 0; n < count; n++) {
      spawnEgg(n, count);
    }
  }

  function spawnEgg(slot, total) {
    var w = 34 * u;
    var h = 46 * u;
    var side = chicken.dir;
    var off = character.eggOffset * u;
    // 双蛋时分列在角色两侧
    var baseX = total > 1
      ? chicken.x + (slot === 0 ? -off : off)
      : chicken.x - side * off;
    var x = clamp(baseX, 28 * u + w / 2, W - 28 * u - w / 2);

    // 如果被屏幕边缘挤到角色脚下，就换到另一侧下蛋（单蛋时）
    var minSide = off * 0.78;
    if (total === 1 && Math.abs(x - chicken.x) < minSide) {
      var alt = clamp(chicken.x + (x >= chicken.x ? -1 : 1) * off, 28 * u + w / 2, W - 28 * u - w / 2);
      if (Math.abs(alt - chicken.x) > Math.abs(x - chicken.x)) x = alt;
    }

    // 尽量别和已有的蛋叠在一起：向两侧找最近的空位
    x = findFreeSpot(x, w);

    var golden = collected > 2 && Math.random() < GOLDEN_CHANCE;
    var speckles = [];
    for (var k = 0; k < 5; k++) {
      speckles.push({
        x: rand(-0.28, 0.28),
        y: rand(-0.26, 0.3),
        r: rand(0.04, 0.075)
      });
    }

    eggs.push({
      x: x,
      w: w,
      h: h,
      baseY: groundY - h * 0.5 - 2 * u,
      age: 0,
      ttl: eggLife(),
      golden: golden,
      snake: character.id === 'snake',
      crackT: -1,
      wob: Math.random() * TAU,
      speckles: speckles
    });

    sfx.lay();
    for (var p = 0; p < 5; p++) {
      particles.push({
        x: x + rand(-12, 12) * u,
        y: groundY - 2 * u,
        vx: rand(-30, 30) * u,
        vy: rand(-60, -20) * u,
        g: 220 * u,
        life: rand(0.25, 0.5),
        max: 0.5,
        size: rand(1.5, 3) * u,
        color: 'rgba(255,255,255,.8)',
        shape: 'dot',
        rot: 0,
        vr: 0
      });
    }

    if (golden) {
      floaters.push({
        x: x,
        y: groundY - 74 * u,
        text: '金蛋！',
        color: '#c9860a',
        size: 17,
        life: 1.3,
        max: 1.3
      });
      sfx.spawnGolden();
    }
  }

  function findFreeSpot(x0, w) {
    var minGap = w * 1.7;
    var lo = 28 * u + w / 2;
    var hi = W - 28 * u - w / 2;
    var maxStep = Math.max(1, Math.floor((hi - lo) / (w * 1.7)));

    function isFree(x) {
      for (var i = 0; i < eggs.length; i++) {
        if (Math.abs(eggs[i].x - x) < minGap) return false;
      }
      return true;
    }

    for (var k = 0; k <= maxStep; k++) {
      var right = clamp(x0 + k * w * 1.7, lo, hi);
      if (isFree(right)) return right;
      var left = clamp(x0 - k * w * 1.7, lo, hi);
      if (isFree(left)) return left;
    }
    return clamp(x0, lo, hi);
  }

  function drawLeg(x, swing, s) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.strokeStyle = '#e58b2b';
    ctx.lineWidth = 4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -22 * s);
    ctx.quadraticCurveTo(swing * 0.4, -10 * s, swing, -2 * s);
    ctx.stroke();

    var fx = swing;
    var fy = -1 * s;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.moveTo(fx, fy); ctx.lineTo(fx + 8 * s, fy + 1 * s);
    ctx.moveTo(fx, fy); ctx.lineTo(fx + 3 * s, fy + 5 * s);
    ctx.moveTo(fx, fy); ctx.lineTo(fx - 5 * s, fy + 4 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawChicken() {
    var s = u;
    var c = chicken;
    var moving = c.state === 'walk';
    var bob = moving ? Math.abs(Math.sin(c.walkPhase)) * 3.5 * s : 0;
    var layDip = c.state === 'lay' ? Math.sin(Math.min(1, c.layAnim / 0.72) * Math.PI) * 6 * s : 0;

    // 地面影子
    ellipse(c.x, groundY + 1 * s, 46 * s, 9 * s, 'rgba(58,105,38,.18)');

    ctx.save();
    ctx.translate(c.x, groundY - bob + layDip);
    ctx.scale(c.dir, 1);

    // 腿
    var swing = moving ? Math.sin(c.walkPhase) * 8 * s : 0;
    drawLeg(-12 * s, swing, s);
    drawLeg(13 * s, -swing, s);

    // 尾巴
    ctx.save();
    ctx.translate(-40 * s, -72 * s);
    ctx.rotate(-0.3);
    var tailCols = ['#d98a25', '#e69a2e', '#c97c1f'];
    for (var i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i - 1) * 0.34);
      ellipse(0, -14 * s, 8.5 * s, 23 * s, tailCols[i]);
      ctx.restore();
    }
    ctx.restore();

    // 身体
    var bodyGrad = ctx.createLinearGradient(0, -98 * s, 0, -18 * s);
    bodyGrad.addColorStop(0, '#f7b64b');
    bodyGrad.addColorStop(1, '#e59a2e');
    ctx.beginPath();
    ctx.ellipse(0, -58 * s, 45 * s, 40 * s, 0, 0, TAU);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // 肚子
    ellipse(9 * s, -43 * s, 26 * s, 19 * s, '#ffd88f');

    // 翅膀
    ctx.save();
    ctx.translate(-8 * s, -62 * s);
    var wingLift = c.state === 'lay'
      ? Math.sin(c.layAnim * 13) * 0.35
      : (moving ? Math.sin(c.walkPhase) * 0.08 : 0);
    ctx.rotate(-0.15 + wingLift);
    ellipse(0, 0, 22 * s, 17 * s, '#dc8f2a');
    ctx.strokeStyle = 'rgba(160,95,20,.5)';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9 * s, 3 * s);
    ctx.quadraticCurveTo(2 * s, 8 * s, 12 * s, 2 * s);
    ctx.moveTo(-8 * s, -4 * s);
    ctx.quadraticCurveTo(0, 0, 9 * s, -3 * s);
    ctx.stroke();
    ctx.restore();

    // 头
    ctx.beginPath();
    ctx.ellipse(26 * s, -98 * s, 23 * s, 22 * s, 0, 0, TAU);
    ctx.fillStyle = '#f6aa3a';
    ctx.fill();

    // 鸡冠
    ctx.fillStyle = '#e8543f';
    ctx.beginPath();
    ctx.arc(15 * s, -117 * s, 7 * s, 0, TAU);
    ctx.arc(24 * s, -121 * s, 8 * s, 0, TAU);
    ctx.arc(33 * s, -116 * s, 6 * s, 0, TAU);
    ctx.fill();

    // 喙
    ctx.beginPath();
    ctx.moveTo(46 * s, -101 * s);
    ctx.lineTo(66 * s, -94 * s);
    ctx.lineTo(46 * s, -87 * s);
    ctx.closePath();
    ctx.fillStyle = '#f7b733';
    ctx.fill();
    ctx.strokeStyle = 'rgba(184,112,10,.35)';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(49 * s, -94 * s);
    ctx.lineTo(62 * s, -94 * s);
    ctx.stroke();

    // 肉垂
    ctx.beginPath();
    ctx.ellipse(45 * s, -83 * s, 5.5 * s, 7 * s, 0.2, 0, TAU);
    ctx.fillStyle = '#e8543f';
    ctx.fill();

    // 眼睛
    if (c.blinkT > 0) {
      ctx.strokeStyle = '#4a2c12';
      ctx.lineWidth = 2 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(31 * s, -103 * s);
      ctx.lineTo(38 * s, -103 * s);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(34 * s, -103 * s, 6.5 * s, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(36 * s, -103 * s, 3.4 * s, 0, TAU);
      ctx.fillStyle = '#3a2a1a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(37.4 * s, -104.4 * s, 1.2 * s, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    // 腮红
    ctx.beginPath();
    ctx.arc(39 * s, -87 * s, 5 * s, 0, TAU);
    ctx.fillStyle = 'rgba(233,120,96,.2)';
    ctx.fill();

    ctx.restore();
  }

  // ---------- 下蛋小蛇 ----------
  // 蛇身骨架：地面上一圈盘绕 + 从盘心立起的脖子；y 向上为负
  function snakeSpine(phase, amp, s) {
    var pts = [];
    var cx = -6;
    var cy = -16;
    var rx = 45;
    var ry = 16;

    // 1) 盘绕的下半身：从右侧贴着地面探出，向内盘旋，最后收进盘心
    var N = 52;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var ang = Math.PI * 0.2 + t * Math.PI * 1.52;
      var k = 1 - Math.pow(t, 1.6);
      var wob = Math.sin(t * Math.PI * 4 + phase) * amp * 0.5 * t;
      pts.push({
        x: (cx + Math.cos(ang) * rx * k) * s,
        y: (cy + Math.sin(ang) * ry * k + wob) * s,
        r: (2.0 + Math.pow(t, 0.55) * 9.6) * s,
        t: t * 0.5
      });
    }

    // 2) 脖子：从盘心立起，S 形向前探（起点与盘心重叠，接缝藏在脖子根部）
    var M = 16;
    for (var j = 1; j <= M; j++) {
      var v = j / M;
      var sway = Math.sin(phase * 0.7) * 2.4 * v;
      var lean = Math.sin(v * Math.PI) * -5 + Math.pow(v, 2.0) * 11;
      pts.push({
        x: (cx + 2 + lean + sway) * s,
        y: (cy + 3 - v * 62 + Math.sin(v * Math.PI) * 2) * s,
        r: (9.4 + Math.sin(v * Math.PI * 1.1) * 2.2 - v * 1.4) * s,
        t: 0.5 + v * 0.5
      });
    }

    // 3) 平滑接缝
    for (var pass = 0; pass < 5; pass++) {
      for (var m = 1; m < pts.length - 1; m++) {
        pts[m].x = (pts[m - 1].x + pts[m].x * 2 + pts[m + 1].x) / 4;
        pts[m].y = (pts[m - 1].y + pts[m].y * 2 + pts[m + 1].y) / 4;
        pts[m].r = (pts[m - 1].r + pts[m].r * 2 + pts[m + 1].r) / 4;
      }
    }
    return pts;
  }

  function drawSnake() {
    var s = u;
    var c = chicken;
    var moving = c.state === 'walk';
    var bob = moving ? Math.abs(Math.sin(c.walkPhase * 0.9)) * 1.6 * s : 0;
    var layDip = c.state === 'lay' ? Math.sin(Math.min(1, c.layAnim / 0.72) * Math.PI) * 5 * s : 0;
    var phase = c.walkPhase * 0.7 + (moving ? 0 : 1.4);
    var amp = moving ? 1.5 : 0.5;
    var bulge = c.state === 'lay' ? Math.sin(Math.min(1, c.layAnim / 0.72) * Math.PI) : 0;

    // 地面影子
    ellipse(c.x - 8 * s, groundY + 1 * s, 50 * s, 8 * s, 'rgba(58,105,38,.18)');

    ctx.save();
    ctx.translate(c.x, groundY - bob + layDip);
    ctx.scale(c.dir, 1);

    var pts = snakeSpine(phase, amp, s);

    // 尾巴尖：骨架首端半径已收到很细，圆头线段自然收尖，无需额外绘制

    // 身体：沿骨架用「渐宽的圆头线段」描出来，光滑无接缝
    var bodyGrad = ctx.createLinearGradient(-24 * s, -96 * s, -8 * s, -2 * s);
    bodyGrad.addColorStop(0, '#c2f39c');
    bodyGrad.addColorStop(0.32, '#86d97f');
    bodyGrad.addColorStop(0.68, '#4fae5b');
    bodyGrad.addColorStop(1, '#2f8342');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 深色轮廓（尾尖处收细，避免末端像被切断）
    ctx.strokeStyle = 'rgba(34,102,54,.75)';
    for (var o = 1; o < pts.length; o++) {
      var oa = pts[o - 1];
      var ob = pts[o];
      var rim = 3 * s * clamp((oa.r + ob.r) / (14 * s), 0.25, 1);
      ctx.beginPath();
      ctx.moveTo(oa.x, oa.y);
      ctx.lineTo(ob.x, ob.y);
      ctx.lineWidth = (oa.r + ob.r) + rim;
      ctx.stroke();
    }

    // 主体
    ctx.strokeStyle = bodyGrad;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1];
      var b = pts[i];
      var br = (a.r + b.r) * (1 + bulge * b.t * 0.16);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = br;
      ctx.stroke();
    }
    ctx.restore();

    // 背部侧光：只在盘绕段沿上缘描一点点高光，避免整条线把身体一分为二
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var h = 2; h < pts.length * 0.5; h++) {
      var hp = pts[h];
      var hn = pts[h + 1] || hp;
      var hdx = hn.x - hp.x;
      var hdy = hn.y - hp.y;
      var hlen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
      var hx0 = hp.x + (hdy / hlen) * hp.r * 0.5;
      var hy0 = hp.y - (hdx / hlen) * hp.r * 0.5;
      if (h === 2) ctx.moveTo(hx0, hy0);
      else ctx.lineTo(hx0, hy0);
    }
    ctx.strokeStyle = 'rgba(232,255,206,.42)';
    ctx.lineWidth = 2.4 * s;
    ctx.stroke();
    ctx.restore();

    // 腹部浅色：盘绕的外圈下缘一条很淡的亮带
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var bl = 1; bl < pts.length * 0.34; bl++) {
      var bp = pts[bl];
      var bx0 = bp.x;
      var by0 = bp.y + bp.r * 0.42;
      if (bl === 1) ctx.moveTo(bx0, by0);
      else ctx.lineTo(bx0, by0);
    }
    ctx.strokeStyle = 'rgba(246,255,218,.34)';
    ctx.lineWidth = 3.4 * s;
    ctx.stroke();
    ctx.restore();

    // 背部花纹：沿身体走向的小椭圆斑纹
    for (var k = 6; k < pts.length - 6; k += 4) {
      var d = pts[k];
      var da = pts[k - 1];
      var db = pts[k + 1];
      var ta = Math.atan2(db.y - da.y, db.x - da.x);
      ctx.save();
      ctx.translate(d.x, d.y - d.r * 0.3);
      ctx.rotate(ta);
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r * 0.24, d.r * 0.1, 0, 0, TAU);
      ctx.fillStyle = 'rgba(36,110,58,.26)';
      ctx.fill();
      ctx.restore();
    }

    // 头
    var neck = pts[pts.length - 1];
    var hx = neck.x + 6 * s;
    var hy = neck.y - 10 * s;
    var headTilt = c.state === 'lay' ? -0.26 : (moving ? Math.sin(c.walkPhase * 0.7) * 0.05 : 0.02);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(headTilt);

    // 头部
    var hg = ctx.createLinearGradient(0, -20 * s, 0, 14 * s);
    hg.addColorStop(0, '#b6f09a');
    hg.addColorStop(0.5, '#6dd06c');
    hg.addColorStop(1, '#339147');
    ctx.beginPath();
    ctx.ellipse(0, 0, 24 * s, 17.5 * s, 0.06, 0, TAU);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(31,105,52,.32)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // 吻部
    ctx.beginPath();
    ctx.ellipse(17 * s, 4 * s, 11 * s, 8 * s, 0.12, 0, TAU);
    ctx.fillStyle = '#5cbb60';
    ctx.fill();

    // 下颚浅色
    ctx.beginPath();
    ctx.ellipse(7 * s, 10 * s, 12 * s, 5.2 * s, 0.08, 0, TAU);
    ctx.fillStyle = 'rgba(240,252,212,.95)';
    ctx.fill();

    // 眼睛
    if (c.blinkT > 0) {
      ctx.strokeStyle = '#1f4a2a';
      ctx.lineWidth = 2.2 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4 * s, -7 * s);
      ctx.lineTo(13 * s, -7 * s);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(8 * s, -7 * s, 6.6 * s, 0, TAU);
      ctx.fillStyle = '#fffdf2';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(10 * s, -7 * s, 3.4 * s, 0, TAU);
      ctx.fillStyle = '#243d22';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(11.2 * s, -8.2 * s, 1.15 * s, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    // 鼻孔
    ctx.beginPath();
    ctx.arc(23 * s, -1 * s, 1.1 * s, 0, TAU);
    ctx.fillStyle = 'rgba(25,74,38,.6)';
    ctx.fill();

    // 嘴
    ctx.strokeStyle = 'rgba(25,74,38,.5)';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18 * s, 8 * s);
    ctx.quadraticCurveTo(24 * s, 9 * s, 27 * s, 5 * s);
    ctx.stroke();

    // 信子：偶尔吐出来
    var flick = Math.sin(ambientT * 5.2);
    if (flick > 0.72) {
      var reach = 12 * s * (flick - 0.72) / 0.28;
      ctx.strokeStyle = '#e8637e';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(26 * s, 5 * s);
      ctx.lineTo(26 * s + reach, 5 * s - 1 * s);
      ctx.lineTo(26 * s + reach + 4 * s, 5 * s - 4 * s);
      ctx.moveTo(26 * s + reach, 5 * s - 1 * s);
      ctx.lineTo(26 * s + reach + 4 * s, 5 * s + 3 * s);
      ctx.stroke();
    }

    // 腮红
    ctx.beginPath();
    ctx.arc(1 * s, 3 * s, 4.4 * s, 0, TAU);
    ctx.fillStyle = 'rgba(233,120,140,.24)';
    ctx.fill();

    // 小蝴蝶结
    ctx.save();
    ctx.translate(-7 * s, -16 * s);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#ff9bb5';
    ctx.beginPath();
    ctx.ellipse(-5 * s, 0, 5 * s, 3.5 * s, -0.35, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5 * s, 0, 5 * s, 3.5 * s, 0.35, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2.1 * s, 0, TAU);
    ctx.fillStyle = '#ffd0dd';
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  function drawCharacter() {
    if (character.id === 'snake') drawSnake();
    else drawChicken();
  }

  function drawSpeech() {
    if (chicken.speech <= 0) return;
    var s = u;
    var alpha = Math.min(1, chicken.speech * 3);
    var bx = clamp(chicken.x + chicken.dir * 28 * s, 80 * s, W - 80 * s);
    var by = groundY - character.speechY * s;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 ' + (15 * s).toFixed(1) + 'px ' + FONT;
    var txt = character.speech;
    var tw = ctx.measureText(txt).width + 26 * s;
    var bh = 34 * s;

    ctx.shadowColor = 'rgba(60,80,30,.18)';
    ctx.shadowBlur = 8 * s;
    ctx.shadowOffsetY = 3 * s;
    roundRectPath(bx - tw / 2, by - bh / 2, tw, bh, 14 * s);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.beginPath();
    ctx.moveTo(bx - 7 * s, by + bh / 2 - 2 * s);
    ctx.lineTo(bx + 1 * s, by + bh / 2 + 9 * s);
    ctx.lineTo(bx + 9 * s, by + bh / 2 - 2 * s);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = character.speechColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, bx, by + 1 * s);
    ctx.restore();
  }

  // ---------- 鸡蛋 ----------
  function eggPos(e) {
    var t = Math.min(1, e.age / 0.3);
    var lift = Math.sin(t * Math.PI) * 16 * u;
    return { x: e.x, y: e.baseY - lift };
  }

  function eggPath(w, h) {
    var rx = w / 2;
    var ry = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.bezierCurveTo(-rx * 0.93, ry * 0.86, -rx * 1.04, -ry * 0.3, -rx * 0.62, -ry * 0.76);
    ctx.bezierCurveTo(-rx * 0.34, -ry * 1.05, rx * 0.34, -ry * 1.05, rx * 0.62, -ry * 0.76);
    ctx.bezierCurveTo(rx * 1.04, -ry * 0.3, rx * 0.93, ry * 0.86, 0, ry);
    ctx.closePath();
  }

  function sparkle(x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.2, r, 0);
    ctx.quadraticCurveTo(r * 0.2, r * 0.2, 0, r);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.2, -r, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.2, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  function drawEgg(e) {
    var s = u;
    var p = eggPos(e);

    // 影子
    ellipse(e.x, groundY + 2 * s, e.w * 0.62, e.w * 0.19, 'rgba(58,105,38,.16)');

    var crack = e.crackT >= 0;
    var wob = crack
      ? Math.sin(e.age * 26) * 0.12
      : Math.sin(e.age * 5 + e.wob) * 0.05;

    if (e.golden) {
      var glow = ctx.createRadialGradient(p.x, p.y, e.w * 0.15, p.x, p.y, e.w * 1.25);
      glow.addColorStop(0, 'rgba(255,222,110,.45)');
      glow.addColorStop(1, 'rgba(255,222,110,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.w * 1.25, 0, TAU);
      ctx.fill();
      for (var si = 0; si < 3; si++) {
        var ang = gameTime * 2 + si * TAU / 3;
        sparkle(
          p.x + Math.cos(ang) * e.w * 0.85,
          p.y + Math.sin(ang) * e.h * 0.62,
          3.6 * s,
          'rgba(255,246,180,.95)'
        );
      }
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(wob);
    if (crack) {
      var pulse = 1 + Math.sin(e.age * 24) * 0.035;
      ctx.scale(pulse, pulse);
    }

    eggPath(e.w, e.h);
    var grad = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
    if (e.golden) {
      grad.addColorStop(0, '#fff0a6');
      grad.addColorStop(0.55, '#ffd45e');
      grad.addColorStop(1, '#e9a923');
    } else if (e.snake) {
      grad.addColorStop(0, '#f5fff0');
      grad.addColorStop(0.65, '#e4f5da');
      grad.addColorStop(1, '#c9e4bb');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.65, '#f7f6ef');
      grad.addColorStop(1, '#dfe4dd');
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = e.golden ? 'rgba(180,120,10,.4)' : (e.snake ? 'rgba(104,152,84,.4)' : 'rgba(126,138,116,.32)');
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // 底部阴影
    ctx.beginPath();
    ctx.ellipse(e.w * 0.06, e.h * 0.24, e.w * 0.32, e.h * 0.18, 0, 0, TAU);
    ctx.fillStyle = e.golden ? 'rgba(200,140,20,.12)' : 'rgba(150,160,140,.14)';
    ctx.fill();

    // 斑点
    for (var k = 0; k < e.speckles.length; k++) {
      var sp = e.speckles[k];
      ctx.beginPath();
      ctx.arc(sp.x * e.w, sp.y * e.h, sp.r * e.w, 0, TAU);
      ctx.fillStyle = e.golden
        ? 'rgba(190,125,10,.35)'
        : (e.snake ? 'rgba(120,166,96,.5)' : 'rgba(196,182,148,.55)');
      ctx.fill();
    }

    // 高光
    ctx.save();
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(-e.w * 0.16, -e.h * 0.2, e.w * 0.1, e.h * 0.16, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fill();
    ctx.restore();

    if (crack) {
      ctx.strokeStyle = 'rgba(118,96,64,.7)';
      ctx.lineWidth = 1.6 * s;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-e.w * 0.06, -e.h * 0.42);
      ctx.lineTo(e.w * 0.06, -e.h * 0.2);
      ctx.lineTo(-e.w * 0.07, -e.h * 0.02);
      ctx.lineTo(e.w * 0.09, e.h * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-e.w * 0.38, -e.h * 0.06);
      ctx.lineTo(-e.w * 0.2, -e.h * 0.12);
      ctx.lineTo(-e.w * 0.06, -e.h * 0.02);
      ctx.stroke();
    }

    ctx.restore();

    // 快孵化的提示：鸡蛋上方冒出感叹号
    var prog = e.age / e.ttl;
    if (prog > 0.62 && !crack) {
      var pulse = 0.75 + 0.25 * Math.sin(e.age * 12);
      var bx = p.x;
      var by = p.y - e.h * 0.78 - 14 * s;
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.beginPath();
      ctx.arc(bx, by, 6.5 * s, 0, TAU);
      ctx.fillStyle = '#e8543f';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 ' + (10 * s).toFixed(1) + 'px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 0.5 * s);
      ctx.restore();
    }
  }

  function drawEggs() {
    for (var i = 0; i < eggs.length; i++) drawEgg(eggs[i]);
  }

  function drawChick(c) {
    if (c.snake) {
      drawBabySnake(c);
      return;
    }
    var s = u;
    var hop = Math.abs(Math.sin(c.t * 11)) * 9 * s;
    var y = groundY - hop;

    ellipse(c.x, groundY + 2 * s, 12 * s, 4 * s, 'rgba(58,105,38,.16)');

    ctx.save();
    ctx.translate(c.x, y);
    ctx.scale(c.dir, 1);

    // 腿
    ctx.strokeStyle = '#e58b2b';
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    var sw = Math.sin(c.t * 22) * 3 * s;
    ctx.beginPath();
    ctx.moveTo(-2 * s, -3 * s); ctx.lineTo(-4 * s + sw, 4 * s);
    ctx.moveTo(3 * s, -3 * s); ctx.lineTo(5 * s - sw, 4 * s);
    ctx.stroke();

    // 身体
    ellipse(0, -12 * s, 11 * s, 10 * s, '#ffd94a');
    // 翅膀
    ctx.save();
    ctx.translate(-2 * s, -14 * s);
    ctx.rotate(-0.5 - Math.abs(Math.sin(c.t * 18)) * 0.4);
    ellipse(0, 0, 6 * s, 4 * s, '#f5c426');
    ctx.restore();
    // 头
    ellipse(8 * s, -22 * s, 8 * s, 8 * s, '#ffe066');
    // 喙
    ctx.beginPath();
    ctx.moveTo(15 * s, -23 * s);
    ctx.lineTo(22 * s, -21 * s);
    ctx.lineTo(15 * s, -19 * s);
    ctx.closePath();
    ctx.fillStyle = '#f09b28';
    ctx.fill();
    // 眼
    ctx.beginPath();
    ctx.arc(11 * s, -24 * s, 2.2 * s, 0, TAU);
    ctx.fillStyle = '#3a2a1a';
    ctx.fill();

    ctx.restore();
  }

  function drawChicks() {
    for (var i = 0; i < chicks.length; i++) drawChick(chicks[i]);
  }

  function drawBabySnake(c) {
    var s = u;
    var hop = Math.abs(Math.sin(c.t * 12)) * 6 * s;
    var y = groundY - hop;

    ellipse(c.x, groundY + 2 * s, 12 * s, 3.6 * s, 'rgba(58,105,38,.16)');

    ctx.save();
    ctx.translate(c.x, y);
    ctx.scale(c.dir, 1);

    // 身体：一小串随扭动起伏的圆
    for (var i = 0; i < 6; i++) {
      var p = i / 5;
      var wobble = Math.sin(c.t * 16 - i * 0.85) * (1.2 + i * 0.45) * s;
      var bx = (-15 + i * 6.2) * s;
      var by = (-4 - p * 7) * s + wobble;
      var r = (2.8 + p * 3.4) * s;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fillStyle = i < 3 ? '#69c96c' : '#8fdc76';
      ctx.fill();
    }

    // 头
    var hx = 17 * s;
    var hy = -15 * s + Math.sin(c.t * 16) * 1.4 * s;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 8 * s, 6.4 * s, 0.08, 0, TAU);
    ctx.fillStyle = '#79d478';
    ctx.fill();

    // 眼睛
    ctx.beginPath();
    ctx.arc(hx + 2.6 * s, hy - 2.4 * s, 2.2 * s, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx + 3.3 * s, hy - 2.4 * s, 1.15 * s, 0, TAU);
    ctx.fillStyle = '#243d22';
    ctx.fill();

    // 吐信子
    ctx.strokeStyle = '#e8637e';
    ctx.lineWidth = 1.3 * s;
    ctx.lineCap = 'round';
    var flick = 3 * s + Math.abs(Math.sin(c.t * 9)) * 4 * s;
    ctx.beginPath();
    ctx.moveTo(hx + 7 * s, hy + 1 * s);
    ctx.lineTo(hx + 7 * s + flick, hy + 1 * s);
    ctx.moveTo(hx + 7 * s + flick, hy + 1 * s);
    ctx.lineTo(hx + 9 * s + flick, hy - 1.2 * s);
    ctx.moveTo(hx + 7 * s + flick, hy + 1 * s);
    ctx.lineTo(hx + 9 * s + flick, hy + 3.2 * s);
    ctx.stroke();

    ctx.restore();
  }

  // ---------- 粒子 / 飘字 ----------
  function burstAt(x, y, n, color, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      var sp = rand(60, 150) * power * u;
      var life = rand(0.5, 0.9);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40 * u,
        g: 420 * u,
        life: life,
        max: life,
        size: rand(2, 4.5) * u,
        color: color,
        shape: Math.random() < 0.28 ? 'tri' : 'dot',
        rot: Math.random() * TAU,
        vr: rand(-9, 9)
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'tri') {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.9, p.size * 0.8);
        ctx.lineTo(-p.size * 0.9, p.size * 0.8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function updateFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.y -= 32 * u * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var a = clamp(f.life / 0.35, 0, 1);
      var scale = 1 + (1 - clamp(f.life / f.max, 0, 1)) * 0.08;
      ctx.globalAlpha = a;
      ctx.font = '800 ' + (f.size * u * scale).toFixed(1) + 'px ' + FONT;
      ctx.lineWidth = 3.5 * u;
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  // ---------- 场景 ----------
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, horizonY + 60 * u);
    g.addColorStop(0, '#8ed6ff');
    g.addColorStop(0.62, '#c6ecff');
    g.addColorStop(1, '#eafaff');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  function drawSun() {
    var sx = W * 0.855;
    var sy = H * 0.145;
    var sr = 24 * u;

    ctx.save();
    ctx.translate(sx, sy);

    var glow = ctx.createRadialGradient(0, 0, sr * 0.5, 0, 0, sr * 2.4);
    glow.addColorStop(0, 'rgba(255,236,150,.55)');
    glow.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, sr * 2.4, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.rotate(ambientT * 0.12);
    ctx.strokeStyle = 'rgba(255,214,84,.5)';
    ctx.lineWidth = 3.5 * u;
    ctx.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * sr * 1.38, Math.sin(a) * sr * 1.38);
      ctx.lineTo(Math.cos(a) * sr * 1.72, Math.sin(a) * sr * 1.72);
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, TAU);
    ctx.fillStyle = '#ffdf6b';
    ctx.fill();

    // 笑脸
    ctx.fillStyle = '#c9862a';
    ctx.beginPath(); ctx.arc(-sr * 0.32, -sr * 0.12, sr * 0.085, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(sr * 0.32, -sr * 0.12, sr * 0.085, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c9862a';
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, sr * 0.02, sr * 0.36, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function drawClouds() {
    ctx.save();
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      var x = cl.x * W;
      var y = cl.y * horizonY;
      var s = cl.s * u;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 20 * s, 0, TAU);
      ctx.arc(x + 24 * s, y + 4 * s, 15 * s, 0, TAU);
      ctx.arc(x - 24 * s, y + 6 * s, 13 * s, 0, TAU);
      ctx.arc(x + 6 * s, y - 10 * s, 14 * s, 0, TAU);
      ctx.fill();
      fillRR(x - 33 * s, y + 4 * s, 66 * s, 13 * s, 6.5 * s, '#ffffff');
    }
    ctx.restore();
  }

  function drawFarHills() {
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 54 * u);
    ctx.quadraticCurveTo(W * 0.22, horizonY - 38 * u, W * 0.48, horizonY + 16 * u);
    ctx.quadraticCurveTo(W * 0.72, horizonY + 58 * u, W, horizonY - 4 * u);
    ctx.lineTo(W, H + 24);
    ctx.lineTo(0, H + 24);
    ctx.closePath();
    ctx.fillStyle = '#b7e884';
    ctx.fill();

    // 远处的浅色草地
    ctx.beginPath();
    ctx.ellipse(W * 0.72, horizonY + 40 * u, W * 0.3, 22 * u, 0, 0, TAU);
    ctx.fillStyle = 'rgba(150, 214, 104, .4)';
    ctx.fill();
  }

  function drawBarn() {
    var bw = Math.min(152 * u, W * 0.3);
    var bh = bw * 0.68;
    var cx = Math.max(bw * 0.55 + 6, W * 0.14);
    var by = horizonY + 44 * u;
    var x = cx - bw / 2;
    var y = by - bh;

    // 仓身
    fillRR(x, y, bw, bh, 2 * u, '#e5584b');
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    ctx.fillRect(x + bw * 0.8, y + bh * 0.06, bw * 0.2, bh * 0.94);

    // 屋顶
    ctx.beginPath();
    ctx.moveTo(x - 9 * u, y + 2 * u);
    ctx.lineTo(cx, y - bh * 0.6);
    ctx.lineTo(x + bw + 9 * u, y + 2 * u);
    ctx.closePath();
    ctx.fillStyle = '#c9453c';
    ctx.fill();
    ctx.strokeStyle = '#fff5e8';
    ctx.lineWidth = 4 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 门
    var dw = bw * 0.38;
    var dh = bh * 0.56;
    var dx = cx - dw / 2;
    var dy = by - dh;
    fillRR(dx, dy, dw, dh, 1.5 * u, '#fff7ec');
    ctx.strokeStyle = '#e5584b';
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    ctx.moveTo(dx + 3 * u, dy + 3 * u);
    ctx.lineTo(dx + dw - 3 * u, dy + dh - 3 * u);
    ctx.moveTo(dx + dw - 3 * u, dy + 3 * u);
    ctx.lineTo(dx + 3 * u, dy + dh - 3 * u);
    ctx.stroke();

    // 小窗
    var ww = bw * 0.16;
    fillRR(cx - ww / 2, y + bh * 0.16, ww, ww, 1.5 * u, '#fff7ec');
    ctx.strokeStyle = '#e5584b';
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(cx - ww / 2, y + bh * 0.16, ww, ww);
  }

  function drawYard() {
    var top = horizonY + 62 * u;
    var g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, '#8ed95f');
    g.addColorStop(0.5, '#72c94b');
    g.addColorStop(1, '#5bb43a');
    ctx.beginPath();
    ctx.moveTo(0, top + 8 * u);
    ctx.quadraticCurveTo(W * 0.3, top - 16 * u, W * 0.56, top + 6 * u);
    ctx.quadraticCurveTo(W * 0.8, top + 24 * u, W, top - 4 * u);
    ctx.lineTo(W, H + 24);
    ctx.lineTo(0, H + 24);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawFence() {
    var baseY = horizonY + 108 * u;
    var h = 46 * u;
    var pw = 9 * u;
    var gap = 30 * u;
    var x;

    // 横栏
    fillRR(-8, baseY - h * 0.7, W + 16, 7 * u, 3.5 * u, '#fdfaf0');
    fillRR(-8, baseY - h * 0.34, W + 16, 7 * u, 3.5 * u, '#fdfaf0');
    ctx.fillStyle = 'rgba(120,140,90,.1)';
    ctx.fillRect(-8, baseY - h * 0.7 + 6 * u, W + 16, 1.5 * u);

    for (x = -pw; x < W + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h + 7 * u);
      ctx.lineTo(x + pw / 2, baseY - h);
      ctx.lineTo(x + pw, baseY - h + 7 * u);
      ctx.lineTo(x + pw, baseY);
      ctx.closePath();
      ctx.fillStyle = '#fdfaf0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,160,130,.22)';
      ctx.lineWidth = 1 * u;
      ctx.stroke();
    }
  }

  function drawHay() {
    var hw = 74 * u;
    var hh = 44 * u;
    var hx = W - hw - 14 * u;
    var hy = horizonY + 108 * u - hh;
    fillRR(hx, hy, hw, hh, 6 * u, '#e7bb46');

    // 捆扎带
    fillRR(hx + hw * 0.28, hy, 5 * u, hh, 2 * u, '#c99a2a');
    fillRR(hx + hw * 0.66, hy, 5 * u, hh, 2 * u, '#c99a2a');

    // 干草纹理
    ctx.strokeStyle = 'rgba(160,112,18,.5)';
    ctx.lineWidth = 1.4 * u;
    ctx.lineCap = 'round';
    for (var i = 0; i < 9; i++) {
      var yy = hy + hh * (0.16 + i * 0.085);
      ctx.beginPath();
      ctx.moveTo(hx + 5 * u + (i % 3) * 4 * u, yy);
      ctx.lineTo(hx + hw - 6 * u - (i % 2) * 6 * u, yy - 2 * u);
      ctx.stroke();
    }

    // 顶部散落的草
    ctx.strokeStyle = '#d8a72e';
    ctx.lineWidth = 2 * u;
    for (var j = 0; j < 5; j++) {
      var sx = hx + hw * (0.15 + j * 0.18);
      ctx.beginPath();
      ctx.moveTo(sx, hy + 2 * u);
      ctx.quadraticCurveTo(sx - 4 * u, hy - 7 * u, sx + 2 * u, hy - 12 * u);
      ctx.stroke();
    }
  }

  function drawDecor() {
    for (var i = 0; i < tufts.length; i++) {
      var t = tufts[i];
      var s = t.s * u;
      ctx.strokeStyle = 'rgba(58,132,38,.5)';
      ctx.lineWidth = 1.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.quadraticCurveTo(t.x - 3 * s, t.y - 5 * s, t.x - 4 * s, t.y - 9 * s);
      ctx.moveTo(t.x, t.y);
      ctx.quadraticCurveTo(t.x + 1 * s, t.y - 6 * s, t.x + 2 * s, t.y - 11 * s);
      ctx.moveTo(t.x, t.y);
      ctx.quadraticCurveTo(t.x + 4 * s, t.y - 4 * s, t.x + 6 * s, t.y - 8 * s);
      ctx.stroke();
    }

    for (var j = 0; j < decor.length; j++) {
      var f = decor[j];
      var fs = f.s * u;
      ctx.strokeStyle = 'rgba(53,128,35,.6)';
      ctx.lineWidth = 1.4 * fs;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x, f.y - 10 * fs);
      ctx.stroke();

      var petal = f.kind === 0 ? '#ffffff' : '#ffc7d9';
      for (var p = 0; p < 5; p++) {
        var a = p * TAU / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(
          f.x + Math.cos(a) * 3 * fs,
          f.y - 12 * fs + Math.sin(a) * 3 * fs,
          2.4 * fs, 0, TAU
        );
        ctx.fillStyle = petal;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(f.x, f.y - 12 * fs, 1.9 * fs, 0, TAU);
      ctx.fillStyle = '#ffd04d';
      ctx.fill();
    }
  }

  function drawButterflies() {
    for (var i = 0; i < butterflies.length; i++) {
      var b = butterflies[i];
      var x = (b.x + Math.sin(ambientT * 0.5 + b.ph) * b.range) * W;
      var y = (b.y + Math.sin(ambientT * 0.9 + b.ph * 2) * 0.03) * H;
      var flap = 0.35 + Math.abs(Math.sin(ambientT * 7 + b.ph)) * 0.65;
      var bf = u;

      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(255,170,205,.92)';
      ctx.beginPath();
      ctx.ellipse(-4 * bf * flap, -3 * bf, 4.5 * bf * flap, 6 * bf, -0.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4 * bf * flap, -3 * bf, 4.5 * bf * flap, 6 * bf, 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,246,.85)';
      ctx.beginPath();
      ctx.ellipse(-3.4 * bf * flap, -2 * bf, 2 * bf * flap, 2.6 * bf, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3.4 * bf * flap, -2 * bf, 2 * bf * flap, 2.6 * bf, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7a4a1a';
      ctx.lineWidth = 1.4 * bf;
      ctx.beginPath();
      ctx.moveTo(0, -8 * bf);
      ctx.lineTo(0, 4 * bf);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSlowTint() {
    var a = (1 - timeScale) * 0.32;
    ctx.fillStyle = 'rgba(120, 185, 255,' + a.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(20,60,40,0)');
    g.addColorStop(1, 'rgba(20,60,40,.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- 更新 ----------
  function updateChicken(dt) {
    var c = chicken;

    c.nextBlink -= dt;
    if (c.blinkT > 0) c.blinkT -= dt;
    if (c.nextBlink <= 0) {
      c.blinkT = 0.13;
      c.nextBlink = rand(2.4, 5.2);
    }

    if (c.layTimer > 0) c.layTimer -= dt;
    if (c.speech > 0) c.speech -= dt;

    if (c.state === 'lay') {
      c.layAnim += dt;
      if (!c.laid && c.layAnim >= 0.32) {
        c.laid = true;
        layEgg();
      }
      if (c.layAnim >= 0.72) {
        c.state = 'walk';
        pickTarget();
      }
      return;
    }

    var speed = (state === 'playing' ? (96 + level * 10) : 62) * character.speed * u;
    var dx = c.targetX - c.x;
    var ad = Math.abs(dx);

    if (ad < 6) {
      pickTarget();
    } else {
      c.dir = dx > 0 ? 1 : -1;
      c.x += Math.sign(dx) * Math.min(ad, speed * dt);
      c.walkPhase += dt * (6 + speed / (60 * u));
    }

    if (state === 'playing' && c.layTimer <= 0) startLay();
  }

  function updateEggs(dt) {
    for (var i = eggs.length - 1; i >= 0; i--) {
      var e = eggs[i];
      e.age += dt;

      if (e.crackT >= 0) {
        e.crackT -= dt;
        if (e.crackT <= 0) {
          hatchEgg(i);
          if (state !== 'playing') return;
          continue;
        }
      } else if (e.age >= e.ttl) {
        e.crackT = 0.5;
        shake = Math.max(shake, 0.2);
        sfx.crack();
      }
    }
  }

  function hatchEgg(index) {
    var e = eggs[index];
    if (!e) return;
    eggs.splice(index, 1);

    var dir = e.x < W / 2 ? -1 : 1;
    chicks.push({
      x: e.x,
      dir: dir,
      snake: !!e.snake,
      vx: dir * rand(100, 150) * u,
      t: 0
    });

    burstAt(e.x, groundY - 18 * u, 16, e.snake ? '#dff5d4' : '#f6f1e4', 1);
    burstAt(e.x, groundY - 16 * u, 7, e.snake ? '#8fdc76' : '#ffd94a', 0.8);

    lives = Math.max(0, lives - 1);
    combo = 0;
    comboTimer = 0;
    shake = Math.max(shake, 0.55);
    sfx.hatch();

    floaters.push({
      x: e.x,
      y: groundY - 54 * u,
      text: '-1 ❤️',
      color: '#e05555',
      size: 17,
      life: 1.2,
      max: 1.2
    });

    updateHud();

    if (lives <= 0) endGame();
  }

  function updateChicks(dt) {
    for (var i = chicks.length - 1; i >= 0; i--) {
      var c = chicks[i];
      c.t += dt;
      c.x += c.vx * dt;
      if (c.t > 1.6 || c.x < -70 * u || c.x > W + 70 * u) chicks.splice(i, 1);
    }
  }

  function updateAmbient(dt) {
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      cl.x += cl.sp * dt;
      if (cl.x > 1.2) cl.x = -0.2;
    }
  }

  function update(dt) {
    ambientT += dt;
    updateAmbient(dt);

    if (state === 'idle') {
      updateChicken(dt);
      return;
    }
    if (state !== 'playing') return;

    gameTime += dt;

    var targetScale = gameTime < slowUntil ? 0.5 : 1;
    timeScale += (targetScale - timeScale) * Math.min(1, dt * 6);
    var sdt = dt * timeScale;

    updateChicken(sdt);
    updateEggs(sdt);
    updateChicks(dt);
    updateParticles(dt);
    updateFloaters(dt);

    if (comboTimer > 0) {
      comboTimer -= sdt;
      if (comboTimer <= 0) {
        combo = 0;
        updateHud();
      }
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 1.7);
  }

  function collectEgg(index) {
    var e = eggs[index];
    if (!e) return;
    eggs.splice(index, 1);

    var mult = comboMult();
    var pts;
    var label;

    if (e.golden) {
      pts = 50 * mult;
      score += pts;
      slowUntil = gameTime + SLOW_SECONDS;
      label = '金蛋 +' + pts;
      if (lives < MAX_LIVES) {
        lives += 1;
        label += '  ❤️';
      } else {
        score += 25;
      }
      sfx.golden();
      burstAt(e.x, e.baseY, 22, '#ffd45e', 1.1);
      burstAt(e.x, e.baseY, 8, '#fff3b0', 1);
    } else {
      pts = 10 * mult;
      score += pts;
      label = '+' + pts;
      sfx.collect(combo);
      burstAt(e.x, e.baseY, 10, '#fff6d8', 0.85);
    }

    collected += 1;
    combo += 1;
    comboTimer = 3.0;
    bestCombo = Math.max(bestCombo, combo);

    floaters.push({
      x: e.x,
      y: e.baseY - 22 * u,
      text: label,
      color: e.golden ? '#c9860a' : '#2f7d32',
      size: e.golden ? 19 : 16,
      life: 1,
      max: 1
    });

    if (combo % 5 === 0) {
      floaters.push({
        x: clamp(chicken.x, 90 * u, W - 90 * u),
        y: groundY - 176 * u,
        text: comboName(combo),
        color: '#2d9cdb',
        size: 18,
        life: 1.3,
        max: 1.3
      });
      sfx.combo();
    }

    checkLevel();
    updateHud();
  }

  function comboName(n) {
    var names = {
      5: '不错哦！',
      10: '太棒了！',
      15: '快手小达人！',
      20: character.name + '惊呆了！',
      25: '无敌啦！'
    };
    return names[n] || ('连击 ×' + n + '！');
  }

  function hitTestEgg(x, y) {
    for (var i = eggs.length - 1; i >= 0; i--) {
      var e = eggs[i];
      var p = eggPos(e);
      var pad = 12 * u;
      var dx = (x - p.x) / (e.w * 0.5 + pad);
      var dy = (y - p.y) / (e.h * 0.5 + pad);
      if (dx * dx + dy * dy <= 1) return i;
    }
    return -1;
  }

  // ---------- 绘制主循环 ----------
  function render() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * 9 * shake * u,
        (Math.random() - 0.5) * 6 * shake * u
      );
    }

    drawSky();
    drawSun();
    drawClouds();
    drawFarHills();
    drawBarn();
    drawYard();
    drawFence();
    drawHay();
    drawDecor();
    drawButterflies();

    drawChicks();
    drawCharacter();
    drawEggs();
    drawParticles();
    drawFloaters();
    drawSpeech();

    if (state === 'playing' && timeScale < 0.96) drawSlowTint();
    drawVignette();

    ctx.restore();
  }

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    update(dt);
    render();
  }

  // ---------- 交互 ----------
  canvas.addEventListener('pointerdown', function (ev) {
    if (state !== 'playing') return;
    var rect = canvas.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var y = ev.clientY - rect.top;
    var idx = hitTestEgg(x, y);
    if (idx >= 0) {
      ev.preventDefault();
      collectEgg(idx);
    }
    ensureAudio();
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (state !== 'playing') {
      canvas.style.cursor = 'default';
      return;
    }
    var rect = canvas.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var y = ev.clientY - rect.top;
    canvas.style.cursor = hitTestEgg(x, y) >= 0 ? 'pointer' : 'default';
  });

  startBtn.addEventListener('click', function () {
    ensureAudio();
    startGame();
  });
  againBtn.addEventListener('click', function () {
    ensureAudio();
    startGame();
  });
  resumeBtn.addEventListener('click', resumeGame);
  restartBtn.addEventListener('click', function () {
    ensureAudio();
    startGame();
  });

  charBtn.addEventListener('click', function () {
    cycleCharacter();
  });
  switchBtn.addEventListener('click', cycleCharacter);
  switchBtnOver.addEventListener('click', cycleCharacter);

  for (var oi = 0; oi < charOpts.length; oi++) {
    charOpts[oi].addEventListener('click', function (ev) {
      var id = ev.currentTarget.getAttribute('data-char');
      chooseCharacter(id, false);
      ensureAudio();
      sfx.collect(1);
    });
  }

  pauseBtn.addEventListener('click', togglePause);

  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.title = soundOn ? '关闭音效' : '开启音效';
    soundBtn.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (soundOn) {
      ensureAudio();
      sfx.collect(1);
    }
  });

  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (ev.key === 'Enter') {
      if (tag === 'BUTTON') return;
      if (state === 'idle' || state === 'over') {
        ev.preventDefault();
        ensureAudio();
        startGame();
      } else if (state === 'paused') {
        ev.preventDefault();
        resumeGame();
      }
    } else if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P') {
      if (state === 'playing' || state === 'paused') {
        ev.preventDefault();
        togglePause();
      }
    } else if (ev.key === 'm' || ev.key === 'M') {
      soundBtn.click();
    } else if (ev.key === 'c' || ev.key === 'C') {
      ev.preventDefault();
      cycleCharacter();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') pauseGame();
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    new ResizeObserver(function () { resize(); }).observe(stage);
  }

  // ---------- 初始化 ----------
  chicken.x = W * 0.3;
  chicken.targetX = W * 0.7;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.title = soundOn ? '关闭音效' : '开启音效';
  soundBtn.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
  pauseBtn.disabled = true;

  syncCharUI();
  updateHud();
  resize();
  chicken.x = W * 0.3;
  chicken.targetX = W * 0.7;
  pickTarget();

  rafId = requestAnimationFrame(frame);
})();