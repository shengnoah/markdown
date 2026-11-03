/* ============================================================
   Happy Chicken Jigsaw（快乐小鸡拼图）
   用「快乐小鸡」的农场插画做拼图：把散落在画框周围的拼图块
   拖回画框，拼出完整画面。
   - 两种画面：晴日农场（鸡太太）/ 黄昏农场（下蛋小蛇）
   - 三档难度：6 / 12 / 20 片
   - 计时、步数、最佳用时、原图提示、音效
   画面全部由 Canvas 矢量绘制，无外部图片与音频资源。
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('hp-app');
  if (!app) return;

  var TAU = Math.PI * 2;
  var SCENE_W = 960, SCENE_H = 720;
  var BW = 480, BH = 360;          // 画框逻辑尺寸（拼图坐标系）
  var SS = 2;                       // 拼图块画布超采样倍数
  var STORE_KEY = 'hc_puzzle_v1';

  var FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif";

  // ---------- 难度 / 画面 ----------
  var DIFFS = {
    easy: { id: 'easy', name: '轻松', cols: 3, rows: 2 },
    normal: { id: 'normal', name: '标准', cols: 4, rows: 3 },
    hard: { id: 'hard', name: '挑战', cols: 5, rows: 4 }
  };
  var DIFF_ORDER = ['easy', 'normal', 'hard'];

  var PICS = {
    chicken: {
      id: 'chicken',
      name: '晴日农场',
      tag: '鸡太太 · 蓝天白云',
      emoji: '🐔',
      pal: 'day',
      star: 'chicken'
    },
    snake: {
      id: 'snake',
      name: '黄昏农场',
      tag: '下蛋小蛇 · 落日余晖',
      emoji: '🐍',
      pal: 'dusk',
      star: 'snake'
    }
  };
  var PIC_ORDER = ['chicken', 'snake'];

  // ---------- 调色板 ----------
  var PALETTES = {
    day: {
      sky0: '#7fd0ff', sky1: '#c3ecff', sky2: '#eafaff',
      sun: '#ffdf6b', sunGlow: 'rgba(255,236,150,.55)', sunFace: '#c9862a',
      cloud: '#ffffff', hillFar: '#b7e884',
      yard0: '#8ed95f', yard1: '#72c94b', yard2: '#5bb43a',
      grass: 'rgba(58,132,38,.5)', flowerA: '#ffffff', flowerB: '#ffc7d9',
      fence: '#fdfaf0', barn: '#e5584b', barnDark: '#c9453c', hay: '#e7bb46',
      shade: 'rgba(58,105,38,.18)',
      bunting: ['#ff9bb5', '#ffd15c', '#6fd0c8', '#b9a4ff', '#ff8a5c'],
      haze: 'rgba(255,255,255,0)',
      vignette: 'rgba(60,90,40,.14)'
    },
    dusk: {
      sky0: '#ff9d6b', sky1: '#ffc990', sky2: '#fff0d2',
      sun: '#ffb15e', sunGlow: 'rgba(255,180,90,.55)', sunFace: '#b25f22',
      cloud: '#ffe9d2', hillFar: '#a9cd6c',
      yard0: '#7cc153', yard1: '#5faa41', yard2: '#4a8f33',
      grass: 'rgba(40,102,32,.5)', flowerA: '#fff4dd', flowerB: '#ffb9c7',
      fence: '#f7ecd6', barn: '#d64a41', barnDark: '#b83a34', hay: '#d9a93c',
      shade: 'rgba(46,86,32,.2)',
      bunting: ['#ff8a7a', '#ffd15c', '#6fd0c8', '#c7a1ff', '#ff9f5c'],
      haze: 'rgba(255,206,140,.28)',
      vignette: 'rgba(120,60,30,.16)'
    }
  };

  // ---------- DOM ----------
  var crt = document.createElement('div');
  crt.className = 'hp-crt';
  crt.innerHTML =
    '<div class="hp-hud">' +
      '<div class="hp-hud-group">' +
        '<span class="hp-stat">用时 <strong id="hp-time">00:00</strong></span>' +
        '<span class="hp-stat">进度 <strong id="hp-progress">0/12</strong></span>' +
        '<span class="hp-stat hp-stat-moves">步数 <strong id="hp-moves">0</strong></span>' +
        '<span class="hp-stat hp-stat-best">最佳 <strong id="hp-best">--:--</strong></span>' +
      '</div>' +
      '<div class="hp-hud-right">' +
        '<button type="button" class="hp-icon-btn hp-diff-btn" id="hp-diff-btn" title="切换难度（自动重开）">标准 · 12 片</button>' +
        '<button type="button" class="hp-icon-btn hp-hint-btn is-on" id="hp-hint-btn" title="显示 / 隐藏底图（G）">底图</button>' +
        '<button type="button" class="hp-icon-btn" id="hp-peek-btn" title="看一眼原图（H）">👁</button>' +
        '<button type="button" class="hp-icon-btn" id="hp-pic-btn" title="换一张图（C）">🔄</button>' +
        '<button type="button" class="hp-icon-btn" id="hp-sound-btn" title="开关音效（M）">🔊</button>' +
        '<button type="button" class="hp-icon-btn hp-pause-btn" id="hp-pause-btn" title="暂停（Esc）"><span id="hp-pause-icon">⏸</span><span class="hp-pause-text" id="hp-pause-text">暂停</span></button>' +
      '</div>' +
    '</div>' +
    '<div class="hp-bar"><span id="hp-bar-fill"></span></div>' +
    '<div class="hp-stage" id="hp-stage">' +
      '<canvas id="hp-canvas" aria-label="快乐小鸡拼图游戏画面">你的浏览器不支持 Canvas 画布。</canvas>' +
      '<div class="hp-toast" id="hp-toast" role="status"></div>' +

      '<div class="hp-overlay" id="hp-start">' +
        '<div class="hp-card">' +
          '<div class="hp-mascot">🧩</div>' +
          '<h2 class="hp-card-title">快乐小鸡拼图</h2>' +
          '<p class="hp-card-en">Happy Chicken Jigsaw</p>' +
          '<p class="hp-card-desc">把散落的拼图块拖回画框，拼出这张农场合影。拖到正确位置附近会自动吸附。</p>' +
          '<div class="hp-pic-pick" role="group" aria-label="选择画面">' +
            '<button type="button" class="hp-pic-opt is-active" data-pic="chicken">' +
              '<canvas class="hp-pic-thumb" width="220" height="165" aria-hidden="true"></canvas>' +
              '<span class="hp-pic-name">晴日农场</span>' +
              '<span class="hp-pic-tag">鸡太太</span>' +
            '</button>' +
            '<button type="button" class="hp-pic-opt" data-pic="snake">' +
              '<canvas class="hp-pic-thumb" width="220" height="165" aria-hidden="true"></canvas>' +
              '<span class="hp-pic-name">黄昏农场</span>' +
              '<span class="hp-pic-tag">下蛋小蛇</span>' +
            '</button>' +
          '</div>' +
          '<div class="hp-diff-pick" role="group" aria-label="选择难度">' +
            '<button type="button" data-diff="easy">轻松<em>6 片</em></button>' +
            '<button type="button" data-diff="normal" class="is-active">标准<em>12 片</em></button>' +
            '<button type="button" data-diff="hard">挑战<em>20 片</em></button>' +
          '</div>' +
          '<button type="button" class="hp-btn hp-btn-primary" id="hp-start-btn">开始拼图</button>' +
          '<p class="hp-start-best" id="hp-start-best">🏆 最佳用时 <strong>--:--</strong></p>' +
          '<p class="hp-hint">拖拽拼图块 · H 看原图 · R 重开 · C 换图 · M 静音</p>' +
        '</div>' +
      '</div>' +

      '<div class="hp-overlay is-hidden" id="hp-pause-overlay">' +
        '<div class="hp-card">' +
          '<div class="hp-mascot">🧩</div>' +
          '<h2 class="hp-card-title">休息一下</h2>' +
          '<p class="hp-card-desc" id="hp-pause-desc">拼图已经拼到一半啦，回来继续吧。</p>' +
          '<div class="hp-btn-row">' +
            '<button type="button" class="hp-btn hp-btn-primary" id="hp-resume-btn">继续拼</button>' +
            '<button type="button" class="hp-btn" id="hp-peek-btn2">看看原图</button>' +
            '<button type="button" class="hp-btn" id="hp-restart-btn">重新开始</button>' +
          '</div>' +
          '<p class="hp-hint">按 Esc 继续</p>' +
        '</div>' +
      '</div>' +

      '<div class="hp-overlay is-hidden" id="hp-win">' +
        '<div class="hp-card">' +
          '<div class="hp-win-emoji" id="hp-win-emoji">🎉</div>' +
          '<h2 class="hp-card-title">拼好啦！</h2>' +
          '<p class="hp-card-en">Puzzle Complete</p>' +
          '<p class="hp-win-desc" id="hp-win-desc">整张农场画完整地拼出来了。</p>' +
          '<div class="hp-win-stats">' +
            '<div><span>用时</span><strong id="hp-final-time">00:00</strong></div>' +
            '<div><span>步数</span><strong id="hp-final-moves">0</strong></div>' +
            '<div><span>提示</span><strong id="hp-final-hints">0</strong></div>' +
          '</div>' +
          '<p class="hp-record is-hidden" id="hp-record">🏆 新的最佳用时！</p>' +
          '<p class="hp-win-best" id="hp-win-best">最佳用时 <strong>--:--</strong></p>' +
          '<div class="hp-btn-row">' +
            '<button type="button" class="hp-btn hp-btn-primary" id="hp-again-btn">再来一局</button>' +
            '<button type="button" class="hp-btn" id="hp-switch-btn">换张图</button>' +
          '</div>' +
          '<p class="hp-hint">按 Enter 再来一局</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  app.appendChild(crt);

  var stage = crt.querySelector('#hp-stage');
  var canvas = crt.querySelector('#hp-canvas');
  var ctx = canvas.getContext('2d');

  var elTime = crt.querySelector('#hp-time');
  var elProgress = crt.querySelector('#hp-progress');
  var elMoves = crt.querySelector('#hp-moves');
  var elBest = crt.querySelector('#hp-best');
  var elBar = crt.querySelector('#hp-bar-fill');
  var diffBtn = crt.querySelector('#hp-diff-btn');
  var hintBtn = crt.querySelector('#hp-hint-btn');
  var peekBtn = crt.querySelector('#hp-peek-btn');
  var picBtn = crt.querySelector('#hp-pic-btn');
  var soundBtn = crt.querySelector('#hp-sound-btn');
  var pauseBtn = crt.querySelector('#hp-pause-btn');
  var pauseIcon = crt.querySelector('#hp-pause-icon');
  var pauseText = crt.querySelector('#hp-pause-text');
  var startOverlay = crt.querySelector('#hp-start');
  var pauseOverlay = crt.querySelector('#hp-pause-overlay');
  var winOverlay = crt.querySelector('#hp-win');
  var startBtn = crt.querySelector('#hp-start-btn');
  var resumeBtn = crt.querySelector('#hp-resume-btn');
  var restartBtn = crt.querySelector('#hp-restart-btn');
  var againBtn = crt.querySelector('#hp-again-btn');
  var switchBtn = crt.querySelector('#hp-switch-btn');
  var peekBtn2 = crt.querySelector('#hp-peek-btn2');
  var toastEl = crt.querySelector('#hp-toast');
  var startBest = crt.querySelector('#hp-start-best');
  var picOpts = crt.querySelectorAll('.hp-pic-opt');
  var diffOpts = crt.querySelectorAll('.hp-diff-opt, .hp-diff-pick [data-diff]');
  var thumbs = crt.querySelectorAll('.hp-pic-thumb');
  var finalTime = crt.querySelector('#hp-final-time');
  var finalMoves = crt.querySelector('#hp-final-moves');
  var finalHints = crt.querySelector('#hp-final-hints');
  var recordEl = crt.querySelector('#hp-record');
  var winBest = crt.querySelector('#hp-win-best');
  var winDesc = crt.querySelector('#hp-win-desc');
  var winEmoji = crt.querySelector('#hp-win-emoji');
  var pauseDesc = crt.querySelector('#hp-pause-desc');

  // ---------- 存档 ----------
  var prefs = { pic: 'chicken', diff: 'normal', sound: true, hint: true };
  var bests = {};
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.prefs) {
        if (PICS[data.prefs.pic]) prefs.pic = data.prefs.pic;
        if (DIFFS[data.prefs.diff]) prefs.diff = data.prefs.diff;
        if (typeof data.prefs.sound === 'boolean') prefs.sound = data.prefs.sound;
        if (typeof data.prefs.hint === 'boolean') prefs.hint = data.prefs.hint;
      }
      if (data && data.bests) bests = data.bests;
    }
  } catch (e) { /* 忽略 */ }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ prefs: prefs, bests: bests }));
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 状态 ----------
  var state = 'idle';   // idle | playing | paused | won
  var diff = DIFFS[prefs.diff];
  var pic = PICS[prefs.pic];
  var soundOn = prefs.sound;
  var hintOn = prefs.hint;

  var W = 960, H = 700, DPR = 1, u = 1;
  var board = { x: 0, y: 0, w: 480, h: 360 };
  var scale = 1;
  var cellW = 120, cellH = 120, tabAmp = 18, pad = 30;

  var sceneCv = null;
  var sceneCache = {};
  var pieces = [];
  var dragging = null;
  var dragOffX = 0, dragOffY = 0;
  var placedCount = 0;
  var totalPieces = 12;
  var moves = 0;
  var hintsUsed = 0;
  var elapsed = 0;
  var peekUntil = 0;
  var effects = [];
  var lastTs = 0;
  var rafId = null;
  var toastTimer = null;
  var winAt = 0;
  var winTime = 0;
  var hitCtx = document.createElement('canvas').getContext('2d');

  var audioCtx = null;

  // ---------- 小工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function bestKey() { return diff.id + '_' + pic.id; }
  function bestOf(id, picId) {
    var v = bests[id + '_' + picId];
    return typeof v === 'number' && v > 0 ? v : 0;
  }

  function fillRScreen(x, y, w, h, r, color) {
    rrScreenPath(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function rrScreenPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 音效 ----------
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
    } catch (e) { /* 忽略 */ }
  }

  var sfx = {
    pick: function () { tone(520, 0.05, 'triangle', 0.04, 0, 660); },
    snap: function () {
      tone(700, 0.07, 'sine', 0.06, 0, 900);
      tone(1046, 0.09, 'triangle', 0.04, 0.05);
    },
    wrong: function () { tone(300, 0.06, 'square', 0.025, 0, 240); },
    peek: function () {
      tone(880, 0.07, 'sine', 0.035, 0);
      tone(1174, 0.09, 'sine', 0.03, 0.07);
    },
    shuffle: function () {
      tone(420, 0.05, 'triangle', 0.03, 0);
      tone(500, 0.05, 'triangle', 0.03, 0.06);
      tone(600, 0.06, 'triangle', 0.03, 0.12);
    },
    start: function () {
      tone(523, 0.08, 'triangle', 0.05, 0);
      tone(784, 0.14, 'triangle', 0.06, 0.1);
    },
    win: function () {
      [523, 659, 784, 1047, 1318].forEach(function (f, i) {
        tone(f, 0.16, 'triangle', 0.055, i * 0.09);
      });
      tone(1568, 0.3, 'sine', 0.04, 0.5);
    }
  };

  // ============================================================
  //  农场插画（与快乐小鸡同一套画风，静态版）
  // ============================================================
  function ell(g, x, y, rx, ry, rot, color) {
    g.beginPath();
    g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    g.fillStyle = color;
    g.fill();
  }

  function rrPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function fillRR(g, x, y, w, h, r, color) {
    rrPath(g, x, y, w, h, r);
    g.fillStyle = color;
    g.fill();
  }

  function drawSun(g, x, y, r, P) {
    g.save();
    g.translate(x, y);
    var glow = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.6);
    glow.addColorStop(0, P.sunGlow);
    glow.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, r * 2.6, 0, TAU);
    g.fill();

    g.save();
    g.rotate(0.26);
    g.strokeStyle = P.sunGlow;
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 1.34, Math.sin(a) * r * 1.34);
      g.lineTo(Math.cos(a) * r * 1.72, Math.sin(a) * r * 1.72);
      g.stroke();
    }
    g.restore();

    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fillStyle = P.sun;
    g.fill();

    g.fillStyle = P.sunFace;
    g.beginPath(); g.arc(-r * 0.3, -r * 0.1, r * 0.085, 0, TAU); g.fill();
    g.beginPath(); g.arc(r * 0.3, -r * 0.1, r * 0.085, 0, TAU); g.fill();
    g.strokeStyle = P.sunFace;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, r * 0.04, r * 0.36, 0.22 * Math.PI, 0.78 * Math.PI);
    g.stroke();
    g.restore();
  }

  function drawCloud(g, x, y, s, color) {
    g.save();
    g.translate(x, y);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, 20 * s, 0, TAU);
    g.arc(24 * s, 4 * s, 15 * s, 0, TAU);
    g.arc(-24 * s, 6 * s, 13 * s, 0, TAU);
    g.arc(6 * s, -10 * s, 14 * s, 0, TAU);
    g.fill();
    fillRR(g, -34 * s, 3 * s, 68 * s, 14 * s, 7 * s, color);
    g.restore();
  }

  function drawBird(g, x, y, s, color) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = color;
    g.lineWidth = 2.4 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-9 * s, 0);
    g.quadraticCurveTo(-4 * s, -5 * s, 0, 0);
    g.quadraticCurveTo(4 * s, -5 * s, 9 * s, 0);
    g.stroke();
    g.restore();
  }

  function drawBunting(g, P) {
    var x0 = 16, y0 = 26, x1 = SCENE_W - 16, y1 = 40;
    var cxp = SCENE_W * 0.5, cyp = 116;
    var flags = 15;
    g.save();
    g.strokeStyle = 'rgba(120,96,64,.55)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cxp, cyp, x1, y1);
    g.stroke();

    for (var i = 0; i < flags; i++) {
      var t = (i + 0.5) / flags;
      var mt = 1 - t;
      var x = mt * mt * x0 + 2 * mt * t * cxp + t * t * x1;
      var y = mt * mt * y0 + 2 * mt * t * cyp + t * t * y1;
      var col = P.bunting[i % P.bunting.length];
      g.beginPath();
      g.moveTo(x - 14, y);
      g.lineTo(x + 14, y);
      g.lineTo(x + 2, y + 26);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.restore();
  }

  function drawBarn(g, cx, baseY, w, h, P) {
    var x = cx - w / 2;
    var y = baseY - h;
    var roofH = h * 0.62;

    // 阴影
    ell(g, cx, baseY + 5, w * 0.56, 13, 0, 'rgba(50,80,30,.14)');

    // 仓身
    fillRR(g, x, y, w, h, 3, P.barn);
    g.fillStyle = 'rgba(0,0,0,.06)';
    g.fillRect(x + w * 0.8, y + h * 0.05, w * 0.2, h * 0.95);

    // 屋檐
    g.beginPath();
    g.moveTo(x - 11, y + 3);
    g.lineTo(cx, y - roofH);
    g.lineTo(x + w + 11, y + 3);
    g.closePath();
    g.fillStyle = P.barnDark;
    g.fill();
    g.strokeStyle = '#fff4e2';
    g.lineWidth = 4.5;
    g.lineJoin = 'round';
    g.stroke();

    // 屋顶小窗
    fillRR(g, cx - w * 0.07, y - roofH * 0.52, w * 0.14, w * 0.13, 2, '#fff4e2');
    g.strokeStyle = P.barnDark;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(cx, y - roofH * 0.52);
    g.lineTo(cx, y - roofH * 0.52 + w * 0.13);
    g.moveTo(cx - w * 0.07, y - roofH * 0.52 + w * 0.065);
    g.lineTo(cx + w * 0.07, y - roofH * 0.52 + w * 0.065);
    g.stroke();

    // 门
    var dw = w * 0.4;
    var dh = h * 0.58;
    var dx = cx - dw / 2;
    var dy = baseY - dh;
    fillRR(g, dx, dy, dw, dh, 2, '#fff7ec');
    g.strokeStyle = P.barn;
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(dx + 4, dy + 4);
    g.lineTo(dx + dw - 4, dy + dh - 4);
    g.moveTo(dx + dw - 4, dy + 4);
    g.lineTo(dx + 4, dy + dh - 4);
    g.stroke();
    g.strokeStyle = P.barn;
    g.lineWidth = 3;
    g.strokeRect(dx, dy, dw, dh);

    // 侧窗
    var ww = w * 0.15;
    fillRR(g, x + w * 0.12, y + h * 0.18, ww, ww, 2, '#fff7ec');
    g.strokeStyle = P.barn;
    g.lineWidth = 1.8;
    g.strokeRect(x + w * 0.12, y + h * 0.18, ww, ww);

    // 屋顶边上的小星星
    starShape(g, x + w * 0.86, y + h * 0.26, w * 0.07, '#ffe9a8');
  }

  function starShape(g, x, y, r, color) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr2 = i % 2 === 0 ? r : r * 0.46;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) g.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      else g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  function drawYard(g, P) {
    var top = 372;
    g.beginPath();
    g.moveTo(0, top + 14);
    g.quadraticCurveTo(SCENE_W * 0.3, top - 22, SCENE_W * 0.56, top + 6);
    g.quadraticCurveTo(SCENE_W * 0.82, top + 30, SCENE_W, top - 4);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var grad = g.createLinearGradient(0, top, 0, SCENE_H);
    grad.addColorStop(0, P.yard0);
    grad.addColorStop(0.5, P.yard1);
    grad.addColorStop(1, P.yard2);
    g.fillStyle = grad;
    g.fill();

    // 远处浅色草地
    g.beginPath();
    g.ellipse(SCENE_W * 0.72, top + 52, SCENE_W * 0.3, 26, 0, 0, TAU);
    g.fillStyle = 'rgba(180,235,130,.28)';
    g.fill();
  }

  function drawFarHills(g, P) {
    g.beginPath();
    g.moveTo(0, 330);
    g.quadraticCurveTo(SCENE_W * 0.2, 262, SCENE_W * 0.46, 318);
    g.quadraticCurveTo(SCENE_W * 0.7, 360, SCENE_W, 292);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    g.fillStyle = P.hillFar;
    g.fill();
  }

  function drawFence(g, baseY, h, P) {
    var pw = 16;
    var gap = 52;
    var x;
    g.save();
    g.fillStyle = P.fence;
    fillRR(g, -10, baseY - h * 0.72, SCENE_W + 20, 9, 4.5, P.fence);
    fillRR(g, -10, baseY - h * 0.34, SCENE_W + 20, 9, 4.5, P.fence);
    for (x = -pw; x < SCENE_W + gap; x += gap) {
      g.beginPath();
      g.moveTo(x, baseY);
      g.lineTo(x, baseY - h + 9);
      g.lineTo(x + pw / 2, baseY - h);
      g.lineTo(x + pw, baseY - h + 9);
      g.lineTo(x + pw, baseY);
      g.closePath();
      g.fillStyle = P.fence;
      g.fill();
      g.strokeStyle = 'rgba(150,130,100,.18)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    // 横栏阴影
    g.fillStyle = 'rgba(120,100,70,.10)';
    g.fillRect(-10, baseY - h * 0.72 + 8, SCENE_W + 20, 1.6);
    g.fillRect(-10, baseY - h * 0.34 + 8, SCENE_W + 20, 1.6);
    g.restore();
  }

  function drawHay(g, x, y, w, h, P) {
    fillRR(g, x, y, w, h, 8, P.hay);
    fillRR(g, x + w * 0.28, y, 6, h, 3, 'rgba(150,105,20,.45)');
    fillRR(g, x + w * 0.66, y, 6, h, 3, 'rgba(150,105,20,.45)');

    g.strokeStyle = 'rgba(150,105,20,.5)';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (var i = 0; i < 9; i++) {
      var yy = y + h * (0.14 + i * 0.088);
      g.beginPath();
      g.moveTo(x + 8 + (i % 3) * 5, yy);
      g.lineTo(x + w - 9 - (i % 2) * 7, yy - 2);
      g.stroke();
    }

    g.strokeStyle = '#d8a72e';
    g.lineWidth = 2.2;
    for (var j = 0; j < 5; j++) {
      var sx = x + w * (0.15 + j * 0.18);
      g.beginPath();
      g.moveTo(sx, y + 2);
      g.quadraticCurveTo(sx - 5, y - 8, sx + 2, y - 14);
      g.stroke();
    }
  }

  function drawGroundDecor(g, P) {
    var rnd = mulberry32(20261102);
    var i;
    // 草丛
    for (i = 0; i < 56; i++) {
      var tx = 10 + rnd() * (SCENE_W - 20);
      var ty = 520 + rnd() * (SCENE_H - 530);
      var ts = 0.8 + rnd() * 1.1;
      g.strokeStyle = P.grass;
      g.lineWidth = 1.9 * ts;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx - 4 * ts, ty - 6 * ts, tx - 5 * ts, ty - 11 * ts);
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + 1 * ts, ty - 7 * ts, tx + 3 * ts, ty - 14 * ts);
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + 5 * ts, ty - 5 * ts, tx + 8 * ts, ty - 10 * ts);
      g.stroke();
    }
    // 小花
    for (i = 0; i < 30; i++) {
      var fx = 18 + rnd() * (SCENE_W - 36);
      var fy = 505 + rnd() * (SCENE_H - 518);
      var fs = 0.8 + rnd() * 0.8;
      var petal = rnd() < 0.55 ? P.flowerA : P.flowerB;
      g.strokeStyle = P.grass;
      g.lineWidth = 1.5 * fs;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx, fy - 13 * fs);
      g.stroke();
      for (var p = 0; p < 5; p++) {
        var a = p * TAU / 5 - Math.PI / 2;
        ell(g, fx + Math.cos(a) * 4 * fs, fy - 15 * fs + Math.sin(a) * 4 * fs, 3.2 * fs, 3.2 * fs, 0, petal);
      }
      ell(g, fx, fy - 15 * fs, 2.4 * fs, 2.4 * fs, 0, '#ffd04d');
    }
  }

  function drawButterfly(g, x, y, s, flap) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(255,170,205,.94)';
    g.beginPath();
    g.ellipse(-4 * s * flap, -3 * s, 4.6 * s * flap, 6 * s, -0.4, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(4 * s * flap, -3 * s, 4.6 * s * flap, 6 * s, 0.4, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,240,248,.9)';
    g.beginPath();
    g.ellipse(-3.2 * s * flap, -2 * s, 2 * s * flap, 2.8 * s, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(3.2 * s * flap, -2 * s, 2 * s * flap, 2.8 * s, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#7a4a1a';
    g.lineWidth = 1.4 * s;
    g.beginPath();
    g.moveTo(0, -8 * s);
    g.lineTo(0, 4 * s);
    g.stroke();
    g.restore();
  }

  // ---------- 角色：鸡太太 ----------
  function artLeg(g, x, swing, s) {
    g.save();
    g.translate(x, 0);
    g.strokeStyle = '#e58b2b';
    g.lineWidth = 4 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -22 * s);
    g.quadraticCurveTo(swing * 0.4, -10 * s, swing, -2 * s);
    g.stroke();

    var fx = swing;
    var fy = -1 * s;
    g.lineWidth = 2.6 * s;
    g.beginPath();
    g.moveTo(fx, fy); g.lineTo(fx + 8 * s, fy + 1 * s);
    g.moveTo(fx, fy); g.lineTo(fx + 3 * s, fy + 5 * s);
    g.moveTo(fx, fy); g.lineTo(fx - 5 * s, fy + 4 * s);
    g.stroke();
    g.restore();
  }

  function artChicken(g, x, groundY, s, dir, phase) {
    var moving = true;
    var swing = Math.sin(phase) * 8 * s;

    ell(g, x, groundY + 1 * s, 46 * s, 9 * s, 0, 'rgba(58,105,38,.18)');

    g.save();
    g.translate(x, groundY);
    g.scale(dir, 1);

    artLeg(g, -12 * s, swing, s);
    artLeg(g, 13 * s, -swing, s);

    // 尾巴
    g.save();
    g.translate(-40 * s, -72 * s);
    g.rotate(-0.3);
    var tailCols = ['#d98a25', '#e69a2e', '#c97c1f'];
    for (var i = 0; i < 3; i++) {
      g.save();
      g.rotate((i - 1) * 0.34);
      ell(g, 0, -14 * s, 8.5 * s, 23 * s, 0, tailCols[i]);
      g.restore();
    }
    g.restore();

    // 身体
    var bodyGrad = g.createLinearGradient(0, -98 * s, 0, -18 * s);
    bodyGrad.addColorStop(0, '#f7b64b');
    bodyGrad.addColorStop(1, '#e59a2e');
    g.beginPath();
    g.ellipse(0, -58 * s, 45 * s, 40 * s, 0, 0, TAU);
    g.fillStyle = bodyGrad;
    g.fill();

    // 肚子
    ell(g, 9 * s, -43 * s, 26 * s, 19 * s, 0, '#ffd88f');

    // 翅膀
    g.save();
    g.translate(-8 * s, -62 * s);
    g.rotate(-0.15 + (moving ? Math.sin(phase) * 0.08 : 0));
    ell(g, 0, 0, 22 * s, 17 * s, 0, '#dc8f2a');
    g.strokeStyle = 'rgba(160,95,20,.5)';
    g.lineWidth = 2 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-9 * s, 3 * s);
    g.quadraticCurveTo(2 * s, 8 * s, 12 * s, 2 * s);
    g.moveTo(-8 * s, -4 * s);
    g.quadraticCurveTo(0, 0, 9 * s, -3 * s);
    g.stroke();
    g.restore();

    // 头
    g.beginPath();
    g.ellipse(26 * s, -98 * s, 23 * s, 22 * s, 0, 0, TAU);
    g.fillStyle = '#f6aa3a';
    g.fill();

    // 鸡冠
    g.fillStyle = '#e8543f';
    g.beginPath();
    g.arc(15 * s, -117 * s, 7 * s, 0, TAU);
    g.arc(24 * s, -121 * s, 8 * s, 0, TAU);
    g.arc(33 * s, -116 * s, 6 * s, 0, TAU);
    g.fill();

    // 喙
    g.beginPath();
    g.moveTo(46 * s, -101 * s);
    g.lineTo(66 * s, -94 * s);
    g.lineTo(46 * s, -87 * s);
    g.closePath();
    g.fillStyle = '#f7b733';
    g.fill();
    g.strokeStyle = 'rgba(184,112,10,.35)';
    g.lineWidth = 1.4 * s;
    g.beginPath();
    g.moveTo(49 * s, -94 * s);
    g.lineTo(62 * s, -94 * s);
    g.stroke();

    // 肉垂
    g.beginPath();
    g.ellipse(45 * s, -83 * s, 5.5 * s, 7 * s, 0.2, 0, TAU);
    g.fillStyle = '#e8543f';
    g.fill();

    // 眼睛
    g.beginPath();
    g.arc(34 * s, -103 * s, 6.5 * s, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();
    g.beginPath();
    g.arc(36 * s, -103 * s, 3.4 * s, 0, TAU);
    g.fillStyle = '#3a2a1a';
    g.fill();
    g.beginPath();
    g.arc(37.4 * s, -104.4 * s, 1.2 * s, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();

    // 腮红
    g.beginPath();
    g.arc(39 * s, -87 * s, 5 * s, 0, TAU);
    g.fillStyle = 'rgba(233,120,96,.2)';
    g.fill();

    g.restore();
  }

  // ---------- 角色：下蛋小蛇 ----------
  function snakeSpineArt(phase, amp, s) {
    var pts = [];
    var cx = -6;
    var cy = -16;
    var rx = 45;
    var ry = 16;

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

    for (var pass = 0; pass < 5; pass++) {
      for (var m = 1; m < pts.length - 1; m++) {
        pts[m].x = (pts[m - 1].x + pts[m].x * 2 + pts[m + 1].x) / 4;
        pts[m].y = (pts[m - 1].y + pts[m].y * 2 + pts[m + 1].y) / 4;
        pts[m].r = (pts[m - 1].r + pts[m].r * 2 + pts[m + 1].r) / 4;
      }
    }
    return pts;
  }

  function artSnake(g, x, groundY, s, dir, phase) {
    var pts = snakeSpineArt(phase, 1.2, s);

    ell(g, x - 6 * s, groundY + 1 * s, 50 * s, 8 * s, 0, 'rgba(58,105,38,.18)');

    g.save();
    g.translate(x, groundY);
    g.scale(dir, 1);

    var bodyGrad = g.createLinearGradient(-24 * s, -96 * s, -8 * s, -2 * s);
    bodyGrad.addColorStop(0, '#c2f39c');
    bodyGrad.addColorStop(0.32, '#86d97f');
    bodyGrad.addColorStop(0.68, '#4fae5b');
    bodyGrad.addColorStop(1, '#2f8342');

    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    g.strokeStyle = 'rgba(34,102,54,.75)';
    for (var o = 1; o < pts.length; o++) {
      var oa = pts[o - 1];
      var ob = pts[o];
      var rim = 3 * clamp((oa.r + ob.r) / (14 * s), 0.25, 1);
      g.beginPath();
      g.moveTo(oa.x, oa.y);
      g.lineTo(ob.x, ob.y);
      g.lineWidth = (oa.r + ob.r) + rim;
      g.stroke();
    }

    g.strokeStyle = bodyGrad;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1];
      var b = pts[i];
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineWidth = a.r + b.r;
      g.stroke();
    }
    g.restore();

    // 背部侧光
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (var h = 2; h < pts.length * 0.5; h++) {
      var hp = pts[h];
      var hn = pts[h + 1] || hp;
      var hdx = hn.x - hp.x;
      var hdy = hn.y - hp.y;
      var hlen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
      var hx0 = hp.x + (hdy / hlen) * hp.r * 0.5;
      var hy0 = hp.y - (hdx / hlen) * hp.r * 0.5;
      if (h === 2) g.moveTo(hx0, hy0);
      else g.lineTo(hx0, hy0);
    }
    g.strokeStyle = 'rgba(232,255,206,.42)';
    g.lineWidth = 2.4 * s;
    g.stroke();
    g.restore();

    // 腹部亮带
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (var bl = 1; bl < pts.length * 0.34; bl++) {
      var bp = pts[bl];
      if (bl === 1) g.moveTo(bp.x, bp.y + bp.r * 0.42);
      else g.lineTo(bp.x, bp.y + bp.r * 0.42);
    }
    g.strokeStyle = 'rgba(246,255,218,.34)';
    g.lineWidth = 3.4 * s;
    g.stroke();
    g.restore();

    // 背部斑纹
    for (var k = 6; k < pts.length - 6; k += 4) {
      var d = pts[k];
      var da = pts[k - 1];
      var db = pts[k + 1];
      var ta = Math.atan2(db.y - da.y, db.x - da.x);
      g.save();
      g.translate(d.x, d.y - d.r * 0.3);
      g.rotate(ta);
      g.beginPath();
      g.ellipse(0, 0, d.r * 0.24, d.r * 0.1, 0, 0, TAU);
      g.fillStyle = 'rgba(36,110,58,.26)';
      g.fill();
      g.restore();
    }

    // 头
    var neck = pts[pts.length - 1];
    var hx = neck.x + 6 * s;
    var hy = neck.y - 10 * s;
    g.save();
    g.translate(hx, hy);
    g.rotate(0.02);

    var hg = g.createLinearGradient(0, -20 * s, 0, 14 * s);
    hg.addColorStop(0, '#b6f09a');
    hg.addColorStop(0.5, '#6dd06c');
    hg.addColorStop(1, '#339147');
    g.beginPath();
    g.ellipse(0, 0, 24 * s, 17.5 * s, 0.06, 0, TAU);
    g.fillStyle = hg;
    g.fill();
    g.strokeStyle = 'rgba(31,105,52,.32)';
    g.lineWidth = 1.4 * s;
    g.stroke();

    // 吻部
    g.beginPath();
    g.ellipse(17 * s, 4 * s, 11 * s, 8 * s, 0.12, 0, TAU);
    g.fillStyle = '#5cbb60';
    g.fill();

    // 下颚
    g.beginPath();
    g.ellipse(7 * s, 10 * s, 12 * s, 5.2 * s, 0.08, 0, TAU);
    g.fillStyle = 'rgba(240,252,212,.95)';
    g.fill();

    // 眼睛
    g.beginPath();
    g.arc(8 * s, -7 * s, 6.6 * s, 0, TAU);
    g.fillStyle = '#fffdf2';
    g.fill();
    g.beginPath();
    g.arc(10 * s, -7 * s, 3.4 * s, 0, TAU);
    g.fillStyle = '#243d22';
    g.fill();
    g.beginPath();
    g.arc(11.2 * s, -8.2 * s, 1.15 * s, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();

    // 鼻孔
    g.beginPath();
    g.arc(23 * s, -1 * s, 1.1 * s, 0, TAU);
    g.fillStyle = 'rgba(25,74,38,.6)';
    g.fill();

    // 嘴
    g.strokeStyle = 'rgba(25,74,38,.5)';
    g.lineWidth = 1.6 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(18 * s, 8 * s);
    g.quadraticCurveTo(24 * s, 9 * s, 27 * s, 5 * s);
    g.stroke();

    // 信子
    g.strokeStyle = '#e8637e';
    g.lineWidth = 2 * s;
    var reach = 11 * s;
    g.beginPath();
    g.moveTo(26 * s, 5 * s);
    g.lineTo(26 * s + reach, 5 * s - 1 * s);
    g.lineTo(26 * s + reach + 4 * s, 5 * s - 4 * s);
    g.moveTo(26 * s + reach, 5 * s - 1 * s);
    g.lineTo(26 * s + reach + 4 * s, 5 * s + 3 * s);
    g.stroke();

    // 腮红
    g.beginPath();
    g.arc(1 * s, 3 * s, 4.4 * s, 0, TAU);
    g.fillStyle = 'rgba(233,120,140,.24)';
    g.fill();

    // 蝴蝶结
    g.save();
    g.translate(-7 * s, -16 * s);
    g.rotate(-0.22);
    g.fillStyle = '#ff9bb5';
    g.beginPath();
    g.ellipse(-5 * s, 0, 5 * s, 3.5 * s, -0.35, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(5 * s, 0, 5 * s, 3.5 * s, 0.35, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(0, 0, 2.1 * s, 0, TAU);
    g.fillStyle = '#ffd0dd';
    g.fill();
    g.restore();

    g.restore();
    g.restore();
  }

  function artEgg(g, x, groundY, w, h, rot, golden) {
    g.save();
    g.translate(x, groundY - h * 0.46);

    if (golden) {
      var glow = g.createRadialGradient(0, 0, w * 0.2, 0, 0, w * 1.5);
      glow.addColorStop(0, 'rgba(255,226,120,.55)');
      glow.addColorStop(1, 'rgba(255,226,120,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(0, 0, w * 1.5, 0, TAU);
      g.fill();
    }

    ell(g, 1, h * 0.5, w * 0.55, w * 0.18, 0, 'rgba(58,105,38,.16)');

    g.rotate(rot || 0);
    eggShape(g, w, h);
    var grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    if (golden) {
      grad.addColorStop(0, '#fff0a6');
      grad.addColorStop(0.55, '#ffd45e');
      grad.addColorStop(1, '#e9a923');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.65, '#f7f6ef');
      grad.addColorStop(1, '#dfe4dd');
    }
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = golden ? 'rgba(180,120,10,.4)' : 'rgba(126,138,116,.32)';
    g.lineWidth = 1.6;
    g.stroke();

    // 斑点
    var rnd = mulberry32(golden ? 7 : 3);
    for (var i = 0; i < 4; i++) {
      g.beginPath();
      g.arc((rnd() - 0.5) * w * 0.5, (rnd() - 0.5) * h * 0.55, w * (0.045 + rnd() * 0.03), 0, TAU);
      g.fillStyle = golden ? 'rgba(190,125,10,.35)' : 'rgba(196,182,148,.55)';
      g.fill();
    }

    // 高光
    g.beginPath();
    g.ellipse(-w * 0.16, -h * 0.18, w * 0.09, h * 0.15, -0.35, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fill();

    g.restore();

    if (golden) {
      var sp = [[-1, -1], [1, -0.4], [0.6, 1.2]];
      for (var j = 0; j < sp.length; j++) {
        starShape(g, x + sp[j][0] * w * 0.75, groundY - h * 0.6 + sp[j][1] * h * 0.55, w * 0.11, 'rgba(255,250,200,.95)');
      }
    }
  }

  function eggShape(g, w, h) {
    var rx = w / 2;
    var ry = h / 2;
    g.beginPath();
    g.moveTo(0, ry);
    g.bezierCurveTo(-rx * 0.93, ry * 0.86, -rx * 1.04, -ry * 0.3, -rx * 0.62, -ry * 0.76);
    g.bezierCurveTo(-rx * 0.34, -ry * 1.05, rx * 0.34, -ry * 1.05, rx * 0.62, -ry * 0.76);
    g.bezierCurveTo(rx * 1.04, -ry * 0.3, rx * 0.93, ry * 0.86, 0, ry);
    g.closePath();
  }

  function artChick(g, x, groundY, s, dir, phase) {
    var hop = Math.abs(Math.sin(phase)) * 5 * s;

    ell(g, x, groundY + 2 * s, 13 * s, 4 * s, 0, 'rgba(58,105,38,.16)');

    g.save();
    g.translate(x, groundY - hop);
    g.scale(dir, 1);

    g.strokeStyle = '#e58b2b';
    g.lineWidth = 2.4 * s;
    g.lineCap = 'round';
    var sw = Math.sin(phase * 2) * 3 * s;
    g.beginPath();
    g.moveTo(-2 * s, -3 * s); g.lineTo(-4 * s + sw, 4 * s);
    g.moveTo(3 * s, -3 * s); g.lineTo(5 * s - sw, 4 * s);
    g.stroke();

    ell(g, 0, -12 * s, 11 * s, 10 * s, 0, '#ffd94a');
    g.save();
    g.translate(-2 * s, -14 * s);
    g.rotate(-0.5 - Math.abs(Math.sin(phase)) * 0.4);
    ell(g, 0, 0, 6 * s, 4 * s, 0, '#f5c426');
    g.restore();

    ell(g, 8 * s, -22 * s, 8 * s, 8 * s, 0, '#ffe066');
    g.beginPath();
    g.moveTo(15 * s, -23 * s);
    g.lineTo(22 * s, -21 * s);
    g.lineTo(15 * s, -19 * s);
    g.closePath();
    g.fillStyle = '#f09b28';
    g.fill();
    g.beginPath();
    g.arc(11 * s, -24 * s, 2.2 * s, 0, TAU);
    g.fillStyle = '#3a2a1a';
    g.fill();

    g.restore();
  }

  // ---------- 场景合成 ----------
  function drawScene(g, picId) {
    var p = PICS[picId] || PICS.chicken;
    var P = PALETTES[p.pal];
    var starIsChicken = p.star === 'chicken';
    var groundY = 648;

    g.clearRect(0, 0, SCENE_W, SCENE_H);

    // 天空
    var sky = g.createLinearGradient(0, 0, 0, 360);
    sky.addColorStop(0, P.sky0);
    sky.addColorStop(0.55, P.sky1);
    sky.addColorStop(1, P.sky2);
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // 太阳（黄昏时更低）
    drawSun(g, starIsChicken ? 806 : 742, starIsChicken ? 166 : 210, 44, P);

    // 云
    drawCloud(g, 146, 112, 1.12, P.cloud);
    drawCloud(g, 392, 208, 0.74, P.cloud);
    drawCloud(g, 700, 238, 0.9, P.cloud);
    drawCloud(g, 862, 150, 0.6, P.cloud);

    // 小鸟
    drawBird(g, 296, 172, 0.95, 'rgba(90,110,120,.55)');
    drawBird(g, 334, 150, 0.72, 'rgba(90,110,120,.45)');
    drawBird(g, 700, 226, 0.82, 'rgba(90,110,120,.5)');

    // 彩旗
    drawBunting(g, P);

    // 远景
    drawFarHills(g, P);
    drawBarn(g, 206, 396, 238, 156, P);
    drawYard(g, P);
    drawFence(g, 520, 78, P);
    drawHay(g, 802, 449, 116, 70, P);
    drawGroundDecor(g, P);

    // 傍晚暖色薄雾
    if (P.haze !== 'rgba(255,255,255,0)') {
      g.fillStyle = P.haze;
      g.fillRect(0, 300, SCENE_W, 120);
    }

    // 角色：主角大一点，另一位在旁边
    var chickScale = starIsChicken ? 1.62 : 1.24;
    var snakeScale = starIsChicken ? 1.26 : 1.58;
    artChicken(g, starIsChicken ? 330 : 286, groundY, chickScale, 1, 2.4);
    artSnake(g, starIsChicken ? 712 : 686, groundY + 8, snakeScale, -1, 1.7);

    // 蛋和小鸡
    artEgg(g, 520, groundY + 6, 58, 76, -0.06, true);
    artEgg(g, 586, groundY + 12, 46, 60, 0.1, false);
    artEgg(g, 790, groundY + 16, 42, 56, -0.12, false);
    artChick(g, 212, groundY + 6, 1.3, 1, 0.4);
    artChick(g, 264, groundY + 16, 0.98, 1, 1.9);

    // 蝴蝶
    drawButterfly(g, 468, 388, 1.0, 0.28);
    drawButterfly(g, 760, 356, 0.86, 1);
    drawButterfly(g, 178, 552, 0.8, 0.6);

    // 暗角
    var vg = g.createRadialGradient(SCENE_W / 2, SCENE_H * 0.42, SCENE_H * 0.32, SCENE_W / 2, SCENE_H * 0.5, SCENE_H * 0.8);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, P.vignette);
    g.fillStyle = vg;
    g.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  function getScene(picId) {
    if (sceneCache[picId]) return sceneCache[picId];
    var cv = document.createElement('canvas');
    cv.width = SCENE_W;
    cv.height = SCENE_H;
    drawScene(cv.getContext('2d'), picId);
    sceneCache[picId] = cv;
    return cv;
  }

  // ============================================================
  //  拼图块生成
  // ============================================================
  // 归一化的拼图凸起曲线：沿边 0..1，垂直方向 0..1（1 = 凸起最高处）
  // 用 4 段三次贝塞尔勾出「细脖子 + 圆脑袋」的蘑菇形。
  var TAB_SEGS = [
    [0.30, 0.00, 0.355, 0.015, 0.325, 0.30, 0.36, 0.50],
    [0.36, 0.50, 0.30, 0.84, 0.375, 1.00, 0.50, 1.00],
    [0.50, 1.00, 0.625, 1.00, 0.70, 0.84, 0.64, 0.50],
    [0.64, 0.50, 0.675, 0.30, 0.645, 0.015, 0.70, 0.00]
  ];

  function tabProfile() {
    var pts = [];
    var i, t;
    for (i = 0; i <= 6; i++) {
      t = i / 6;
      pts.push({ x: 0.30 * t, y: 0 });
    }
    for (var s = 0; s < TAB_SEGS.length; s++) {
      var sg = TAB_SEGS[s];
      for (i = 1; i <= 9; i++) {
        t = i / 9;
        var mt = 1 - t;
        pts.push({
          x: mt * mt * mt * sg[0] + 3 * mt * mt * t * sg[2] + 3 * mt * t * t * sg[4] + t * t * t * sg[6],
          y: mt * mt * mt * sg[1] + 3 * mt * mt * t * sg[3] + 3 * mt * t * t * sg[5] + t * t * t * sg[7]
        });
      }
    }
    for (i = 0; i <= 6; i++) {
      t = i / 6;
      pts.push({ x: 0.70 + 0.30 * t, y: 0 });
    }
    return pts;
  }

  var TAB_PROFILE = tabProfile();

  function edgePoints(x0, y0, x1, y1, sign, amp) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = (-dy / L) * sign;
    var ny = (dx / L) * sign;
    var out = [];
    for (var i = 0; i < TAB_PROFILE.length; i++) {
      var p = TAB_PROFILE[i];
      out.push({
        x: x0 + dx * p.x + nx * amp * p.y,
        y: y0 + dy * p.x + ny * amp * p.y
      });
    }
    return out;
  }

  function straightPoints(x0, y0, x1, y1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
    return out;
  }

  function buildPath(pts) {
    // 去掉重复点
    var clean = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var q = clean[clean.length - 1];
      if (!q || Math.abs(q.x - p.x) > 0.01 || Math.abs(q.y - p.y) > 0.01) clean.push(p);
    }
    var first = clean[0];
    var last = clean[clean.length - 1];
    if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) clean.pop();

    var path = new Path2D();
    var n = clean.length;
    if (n < 3) return path;
    var mx = (clean[n - 1].x + clean[0].x) / 2;
    var my = (clean[n - 1].y + clean[0].y) / 2;
    path.moveTo(mx, my);
    for (var j = 0; j < n; j++) {
      var cur = clean[j];
      var nxt = clean[(j + 1) % n];
      path.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
    }
    path.closePath();
    return path;
  }

  function buildPieces() {
    var cols = diff.cols;
    var rows = diff.rows;
    cellW = BW / cols;
    cellH = BH / rows;
    tabAmp = Math.min(cellW, cellH) * 0.2;
    pad = tabAmp * 1.6 + 5;

    var hEdges = [];
    var vEdges = [];
    var r, c;
    for (r = 0; r <= rows; r++) {
      hEdges[r] = [];
      for (c = 0; c < cols; c++) {
        if (r === 0 || r === rows) {
          hEdges[r][c] = null;
        } else {
          hEdges[r][c] = edgePoints(
            c * cellW, r * cellH, (c + 1) * cellW, r * cellH,
            Math.random() < 0.5 ? 1 : -1, tabAmp
          );
        }
      }
    }
    for (r = 0; r < rows; r++) {
      vEdges[r] = [];
      for (c = 0; c <= cols; c++) {
        if (c === 0 || c === cols) {
          vEdges[r][c] = null;
        } else {
          vEdges[r][c] = edgePoints(
            c * cellW, r * cellH, c * cellW, (r + 1) * cellH,
            Math.random() < 0.5 ? 1 : -1, tabAmp
          );
        }
      }
    }

    pieces = [];
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var x0 = c * cellW;
        var y0 = r * cellH;
        var x1 = x0 + cellW;
        var y1 = y0 + cellH;
        var pts = [];

        pts = pts.concat(r === 0 ? straightPoints(x0, y0, x1, y0, 8) : hEdges[r][c]);
        pts = pts.concat(c === cols - 1 ? straightPoints(x1, y0, x1, y1, 8) : vEdges[r][c + 1]);
        pts = pts.concat(r === rows - 1 ? straightPoints(x1, y1, x0, y1, 8) : hEdges[r + 1][c].slice().reverse());
        pts = pts.concat(c === 0 ? straightPoints(x0, y1, x0, y0, 8) : vEdges[r][c].slice().reverse());

        var path = buildPath(pts);
        pieces.push({
          r: r,
          c: c,
          cx: x0,
          cy: y0,
          path: path,
          canvas: renderPieceCanvas(path, x0, y0),
          x: 0,
          y: 0,
          placed: false,
          snapping: false,
          snapT: 0,
          fromX: 0,
          fromY: 0
        });
      }
    }
    totalPieces = pieces.length;
  }

  function renderPieceCanvas(path, cx, cy) {
    var pw = cellW + pad * 2;
    var ph = cellH + pad * 2;
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(pw * SS);
    cv.height = Math.ceil(ph * SS);
    var g = cv.getContext('2d');
    g.setTransform(SS, 0, 0, SS, 0, 0);

    // 把画框坐标平移到这块拼图的画布里：(cx, cy) 落在 (pad, pad)
    g.save();
    g.translate(pad - cx, pad - cy);
    g.save();
    g.clip(path);
    g.drawImage(sceneCv, 0, 0, SCENE_W, SCENE_H, 0, 0, BW, BH);
    g.restore();

    // 内高光
    g.save();
    g.clip(path);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 3.4;
    g.stroke(path);
    g.restore();

    // 外描边
    g.strokeStyle = 'rgba(72,56,28,.38)';
    g.lineWidth = 1.2;
    g.stroke(path);
    g.restore();

    return cv;
  }

  // ============================================================
  //  布局
  // ============================================================
  function resize() {
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    W = Math.round(rect.width);
    H = Math.round(rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    u = clamp(W / 980, 0.62, 1.15);

    if (W >= 720) {
      var bw = Math.min(W * 0.46, H * 0.66, 520);
      var bh = bw * 3 / 4;
      board = { w: bw, h: bh, x: (W - bw) / 2, y: (H - bh) / 2 };
    } else {
      var bw2 = Math.min(W - 96 * u, H * 0.46);
      var bh2 = bw2 * 3 / 4;
      board = { w: bw2, h: bh2, x: (W - bw2) / 2, y: Math.max(54 * u, H * 0.11) };
    }

    scale = board.w / BW;
    buildStageBg();

    if (pieces.length && state !== 'idle') {
      cancelDrag();
      arrangeLoose();
    }
  }

  function pieceScreenSize() {
    return {
      w: (cellW + tabAmp * 2) * scale,
      h: (cellH + tabAmp * 2) * scale
    };
  }

  function computeSlots(n) {
    var ps = pieceScreenSize();
    var pW = ps.w;
    var pH = ps.h;
    var m = 10 * u;
    var bands = [];
    if (W >= 720) {
      bands.push({ x: m, y: m, w: board.x - m * 2, h: H - m * 2 });
      bands.push({ x: board.x + board.w + m, y: m, w: W - board.x - board.w - m * 2, h: H - m * 2 });
      bands.push({ x: board.x, y: m, w: board.w, h: board.y - m * 2 });
      bands.push({ x: board.x, y: board.y + board.h + m, w: board.w, h: H - board.y - board.h - m * 2 });
    } else {
      bands.push({ x: m, y: m, w: W - m * 2, h: board.y - m * 2 });
      bands.push({ x: m, y: board.y + board.h + m, w: W - m * 2, h: H - board.y - board.h - m * 2 });
    }

    // 只保留放得下拼图块的区域
    bands = bands.filter(function (b) {
      return b.w > pW * 0.55 && b.h > pH * 0.98;
    });
    if (!bands.length) {
      bands.push({ x: m, y: m, w: W - m * 2, h: H - m * 2 });
    }

    var caps = bands.map(function (b) {
      var cols = Math.max(1, Math.floor((b.w * 1.06) / (pW * 0.9)));
      var rows = Math.max(1, Math.floor((b.h * 1.06) / (pH * 0.9)));
      return cols * rows;
    });

    var totalCap = 0;
    for (var i = 0; i < caps.length; i++) totalCap += caps[i];
    if (totalCap <= 0) totalCap = 1;

    var counts = caps.map(function (cap) {
      return Math.floor(n * cap / totalCap);
    });
    var assigned = counts.reduce(function (a, b) { return a + b; }, 0);
    while (assigned < n) {
      var bi = 0;
      var bestGap = -1;
      for (var j = 0; j < bands.length; j++) {
        var gap = caps[j] - counts[j];
        if (gap > bestGap) { bestGap = gap; bi = j; }
      }
      counts[bi]++;
      assigned++;
    }

    var slots = [];
    for (var k = 0; k < bands.length; k++) {
      var b = bands[k];
      var count = counts[k];
      if (!count) continue;

      var best = null;
      for (var cols = 1; cols <= count; cols++) {
        var rows = Math.ceil(count / cols);
        var slotW = b.w / cols;
        var slotH = b.h / rows;
        var fitW = Math.min(1, slotW / pW);
        var fitH = Math.min(1, slotH / pH);
        var score = fitW + fitH + (slotW >= pW && slotH >= pH ? 0.8 : 0);
        if (!best || score > best.score) {
          best = { cols: cols, rows: rows, slotW: slotW, slotH: slotH, score: score };
        }
      }

      for (var q = 0; q < count; q++) {
        var rr2 = Math.floor(q / best.cols);
        var cc = q % best.cols;
        var jx = (Math.random() - 0.5) * Math.min(10 * u, best.slotW * 0.14);
        var jy = (Math.random() - 0.5) * Math.min(10 * u, best.slotH * 0.14);
        slots.push({
          x: b.x + best.slotW * (cc + 0.5) + jx,
          y: b.y + best.slotH * (rr2 + 0.5) + jy
        });
      }
    }
    return shuffle(slots);
  }

  function arrangeLoose() {
    var loose = [];
    for (var i = 0; i < pieces.length; i++) {
      if (!pieces[i].placed) loose.push(pieces[i]);
    }
    if (!loose.length) return;
    var slots = computeSlots(loose.length);
    for (var j = 0; j < loose.length; j++) {
      var p = loose[j];
      var sl = slots[j % slots.length];
      p.x = (sl.x - board.x) / scale - p.cx - cellW / 2;
      p.y = (sl.y - board.y) / scale - p.cy - cellH / 2;
      p.snapping = false;
      p.snapT = 0;
    }
  }

  // ============================================================
  //  游戏流程
  // ============================================================
  function resetTimer() {
    elapsed = 0;
    updateTimeText();
  }

  function newPuzzle() {
    ensureAudio();
    sceneCv = getScene(pic.id);
    buildPieces();
    placedCount = 0;
    moves = 0;
    hintsUsed = 0;
    effects.length = 0;
    dragging = null;
    peekUntil = 0;
    winAt = 0;
    resetTimer();
    arrangeLoose();
    state = 'playing';
    setOverlay(startOverlay, false);
    setOverlay(pauseOverlay, false);
    setOverlay(winOverlay, false);
    pauseBtn.disabled = false;
    setPauseLabel(false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    sfx.start();
    updateHud();
    showToast('把拼图块拖进画框 · ' + pic.name + ' · ' + totalPieces + ' 片');
  }

  function cancelDrag() {
    if (!dragging) return;
    clampPiece(dragging);
    dragging = null;
    canvas.style.cursor = 'default';
  }

  function pauseGame() {
    if (state !== 'playing') return;
    cancelDrag();
    state = 'paused';
    setOverlay(pauseOverlay, true);
    setPauseLabel(true);
    pauseDesc.textContent = placedCount + '/' + totalPieces + ' 片已归位，回来继续吧。';
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    setOverlay(pauseOverlay, false);
    setPauseLabel(false);
  }

  function togglePause() {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  function setPauseLabel(paused) {
    pauseIcon.textContent = paused ? '▶' : '⏸';
    pauseText.textContent = paused ? '继续' : '暂停';
    pauseBtn.setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
  }

  function setOverlay(el, show) {
    el.classList.toggle('is-hidden', !show);
  }

  var lastShownSec = -1;
  function updateTimeText() {
    var sec = Math.floor(elapsed / 1000);
    if (sec === lastShownSec) return;
    lastShownSec = sec;
    elTime.textContent = fmtTime(elapsed);
  }

  function updateHud() {
    elProgress.textContent = placedCount + '/' + totalPieces;
    elMoves.textContent = moves;
    elBar.style.width = (totalPieces ? placedCount / totalPieces * 100 : 0) + '%';
    var best = bestOf(diff.id, pic.id);
    elBest.textContent = best ? fmtTime(best) : '--:--';
    diffBtn.textContent = diff.name + ' · ' + totalPieces + ' 片';
    hintBtn.classList.toggle('is-on', hintOn);
    hintBtn.textContent = '底图';
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.title = soundOn ? '关闭音效（M）' : '开启音效（M）';
    picBtn.textContent = pic.emoji;
    picBtn.title = '换一张图（C）· 当前：' + pic.name;
    updateStartBest();

    for (var i = 0; i < picOpts.length; i++) {
      picOpts[i].classList.toggle('is-active', picOpts[i].getAttribute('data-pic') === pic.id);
      picOpts[i].setAttribute('aria-pressed', picOpts[i].getAttribute('data-pic') === pic.id ? 'true' : 'false');
    }
    for (var j = 0; j < diffOpts.length; j++) {
      diffOpts[j].classList.toggle('is-active', diffOpts[j].getAttribute('data-diff') === diff.id);
      diffOpts[j].setAttribute('aria-pressed', diffOpts[j].getAttribute('data-diff') === diff.id ? 'true' : 'false');
    }
  }

  function updateStartBest() {
    var best = bestOf(diff.id, pic.id);
    startBest.innerHTML = best
      ? '🏆 本图最佳用时 <strong>' + fmtTime(best) + '</strong>'
      : '还没有记录，来创造第一个最佳用时吧';
    startBest.classList.toggle('is-empty', !best);
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2100);
  }

  function setPicture(id) {
    if (!PICS[id] || PICS[id] === pic) return;
    pic = PICS[id];
    prefs.pic = id;
    saveStore();
    sceneCv = getScene(pic.id);
    updateHud();

    if (state === 'playing' || state === 'paused') {
      state = 'paused';
      setOverlay(pauseOverlay, false);
      newPuzzle();
      showToast('换成了「' + pic.name + '」，重新开始');
    } else if (state === 'won') {
      startOverlayShow();
    } else {
      pieces = [];
      buildPieces();
      placedCount = 0;
      totalPieces = pieces.length;
      state = 'idle';
      updateHud();
    }
  }

  function cyclePicture() {
    var idx = PIC_ORDER.indexOf(pic.id);
    setPicture(PIC_ORDER[(idx + 1) % PIC_ORDER.length]);
  }

  function setDiff(id) {
    if (!DIFFS[id] || DIFFS[id] === diff) return;
    diff = DIFFS[id];
    prefs.diff = id;
    saveStore();
    updateHud();

    if (state === 'playing' || state === 'paused') {
      state = 'paused';
      setOverlay(pauseOverlay, false);
      newPuzzle();
      showToast('难度切换为「' + diff.name + '」，重新开局');
    } else if (state === 'won') {
      startOverlayShow();
    } else {
      pieces = [];
      buildPieces();
      placedCount = 0;
      totalPieces = pieces.length;
      state = 'idle';
      updateHud();
    }
  }

  function cycleDiff() {
    var idx = DIFF_ORDER.indexOf(diff.id);
    setDiff(DIFF_ORDER[(idx + 1) % DIFF_ORDER.length]);
  }

  function startOverlayShow() {
    state = 'idle';
    placingPreview();
    setOverlay(winOverlay, false);
    setOverlay(pauseOverlay, false);
    setOverlay(startOverlay, true);
    pauseBtn.disabled = true;
    setPauseLabel(false);
    updateHud();
  }

  function placingPreview() {
    // 回到未开始状态：清空已拼的块，画框显示完整画面
    pieces = [];
    buildPieces();
    placedCount = 0;
    totalPieces = pieces.length;
    moves = 0;
    hintsUsed = 0;
    resetTimer();
    updateHud();
  }

  function endGame() {
    if (state === 'won') return;
    state = 'won';
    winTime = elapsed;
    winAt = performance.now();
    sfx.win();
    burstConfetti();

    var key = bestKey();
    var prev = bests[key] || 0;
    var isRecord = !prev || winTime < prev;
    if (isRecord) {
      bests[key] = winTime;
      saveStore();
    }

    finalTime.textContent = fmtTime(winTime);
    finalMoves.textContent = moves;
    finalHints.textContent = hintsUsed;
    recordEl.classList.toggle('is-hidden', !isRecord);
    var best = bests[key] || winTime;
    winBest.innerHTML = '最佳用时 <strong>' + fmtTime(best) + '</strong>';
    winDesc.textContent = pic.name + ' · ' + totalPieces + ' 片拼图完成。';
    winEmoji.textContent = pic.star === 'snake' ? '🐍' : '🐔';
    winEmoji.classList.remove('is-pop');
    void winEmoji.offsetWidth;
    winEmoji.classList.add('is-pop');

    pauseBtn.disabled = true;
    setPauseLabel(false);
    setOverlay(pauseOverlay, false);
    updateHud();

    setTimeout(function () {
      if (state === 'won') setOverlay(winOverlay, true);
    }, 780);
  }

  // ---------- 提示 ----------
  function peek() {
    if (state !== 'playing') return;
    peekUntil = performance.now() + 2400;
    hintsUsed++;
    sfx.peek();
    showToast('原图出现 2 秒（提示 ' + hintsUsed + ' 次）');
  }

  function toggleHint() {
    hintOn = !hintOn;
    prefs.hint = hintOn;
    saveStore();
    updateHud();
    showToast(hintOn ? '底图已显示' : '底图已隐藏');
  }

  // ============================================================
  //  交互
  // ============================================================
  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function hitPiece(sx, sy) {
    var bx = (sx - board.x) / scale;
    var by = (sy - board.y) / scale;
    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      if (p.placed || p.snapping) continue;
      if (hitCtx.isPointInPath(p.path, bx - p.x, by - p.y)) return p;
    }
    return null;
  }

  function snapDistance(p) {
    return Math.sqrt(p.x * p.x + p.y * p.y) * scale;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (state !== 'playing') return;
    var pt = pointerPos(ev);
    var p = hitPiece(pt.x, pt.y);
    if (!p) return;
    ev.preventDefault();
    ensureAudio();

    // 提到最上层
    var idx = pieces.indexOf(p);
    if (idx >= 0) {
      pieces.splice(idx, 1);
      pieces.push(p);
    }

    dragging = p;
    var targetX = board.x + (p.cx + p.x) * scale;
    var targetY = board.y + (p.cy + p.y) * scale;
    dragOffX = pt.x - targetX;
    dragOffY = pt.y - targetY;
    canvas.style.cursor = 'grabbing';
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    }
    sfx.pick();
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (state !== 'playing') return;
    var pt = pointerPos(ev);

    if (dragging) {
      ev.preventDefault();
      var p = dragging;
      p.x = (pt.x - dragOffX - board.x) / scale - p.cx;
      p.y = (pt.y - dragOffY - board.y) / scale - p.cy;
      return;
    }

    canvas.style.cursor = hitPiece(pt.x, pt.y) ? 'grab' : 'default';
  });

  function releaseDrag(ev) {
    if (!dragging) return;
    var p = dragging;
    dragging = null;
    canvas.style.cursor = 'default';
    if (ev && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    }
    if (state !== 'playing') return;

    moves++;
    clampPiece(p);

    var tol = Math.max(20, 34 * u);
    if (snapDistance(p) <= tol) {
      p.snapping = true;
      p.snapT = 0;
      p.fromX = p.x;
      p.fromY = p.y;
      sfx.snap();
      burstStars(
        board.x + (p.cx + cellW / 2) * scale,
        board.y + (p.cy + cellH / 2) * scale
      );
    } else {
      if (snapDistance(p) < tol * 2.4) sfx.wrong();
    }
    updateHud();
  }

  canvas.addEventListener('pointerup', releaseDrag);
  canvas.addEventListener('pointercancel', releaseDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!dragging) canvas.style.cursor = 'default';
  });

  function clampPiece(p) {
    var ps = pieceScreenSize();
    var margin = 4;
    var left = board.x + (p.cx + p.x - pad) * scale;
    var top = board.y + (p.cy + p.y - pad) * scale;
    var right = left + ps.w;
    var bottom = top + ps.h;
    if (left < margin) p.x += (margin - left) / scale;
    else if (right > W - margin) p.x += ((W - margin) - right) / scale;
    if (top < margin) p.y += (margin - top) / scale;
    else if (bottom > H - margin) p.y += ((H - margin) - bottom) / scale;
  }

  // ============================================================
  //  绘制
  // ============================================================
  var bgCanvas = null;

  function buildStageBg() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.max(1, Math.round(W * DPR));
    bgCanvas.height = Math.max(1, Math.round(H * DPR));
    var g = bgCanvas.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f7fcf5');
    grad.addColorStop(1, '#eaf4e2');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // 淡淡的点阵
    g.fillStyle = 'rgba(110,150,90,.10)';
    var step = 26 * u;
    for (var y = step; y < H; y += step) {
      for (var x = step; x < W; x += step) {
        g.beginPath();
        g.arc(x, y, 1.1 * u, 0, TAU);
        g.fill();
      }
    }
  }

  function drawStageBg() {
    if (!bgCanvas) buildStageBg();
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  function drawBoard() {
    var r = 14 * u;
    ctx.save();
    ctx.shadowColor = 'rgba(40,70,30,.20)';
    ctx.shadowBlur = 20 * u;
    ctx.shadowOffsetY = 9 * u;
    fillRScreen(board.x - 9 * u, board.y - 9 * u, board.w + 18 * u, board.h + 18 * u, r, '#fffdf7');
    ctx.restore();

    ctx.save();
    rrScreenPath(board.x - 9 * u, board.y - 9 * u, board.w + 18 * u, board.h + 18 * u, r);
    ctx.strokeStyle = 'rgba(150,130,95,.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    rrScreenPath(board.x, board.y, board.w, board.h, 8 * u);
    ctx.clip();

    if (state === 'idle' || state === 'won') {
      if (sceneCv) ctx.drawImage(sceneCv, board.x, board.y, board.w, board.h);
      if (state === 'won' && winAt) {
        var t = (performance.now() - winAt) / 1000;
        var flash = Math.max(0, 1 - t / 1.6);
        if (flash > 0) {
          ctx.fillStyle = 'rgba(255,248,220,' + (flash * 0.55).toFixed(3) + ')';
          ctx.fillRect(board.x, board.y, board.w, board.h);
        }
      }
    } else {
      ctx.fillStyle = '#f6f1e4';
      ctx.fillRect(board.x, board.y, board.w, board.h);

      if (hintOn && sceneCv) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.drawImage(sceneCv, board.x, board.y, board.w, board.h);
        ctx.restore();
      }

      // 网格
      ctx.strokeStyle = 'rgba(150,132,96,.20)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4 * u, 5 * u]);
      for (var c = 1; c < diff.cols; c++) {
        var x = board.x + c * cellW * scale;
        ctx.beginPath();
        ctx.moveTo(x, board.y);
        ctx.lineTo(x, board.y + board.h);
        ctx.stroke();
      }
      for (var rr2 = 1; rr2 < diff.rows; rr2++) {
        var y = board.y + rr2 * cellH * scale;
        ctx.beginPath();
        ctx.moveTo(board.x, y);
        ctx.lineTo(board.x + board.w, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();

    // 内框阴影
    ctx.save();
    rrScreenPath(board.x, board.y, board.w, board.h, 8 * u);
    ctx.strokeStyle = 'rgba(120,100,60,.30)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawPiece(p, loose) {
    var pw = (cellW + pad * 2) * scale;
    var ph = (cellH + pad * 2) * scale;
    var px = board.x + (p.cx + p.x) * scale - pad * scale;
    var py = board.y + (p.cy + p.y) * scale - pad * scale;

    ctx.save();
    if (loose) {
      ctx.shadowColor = 'rgba(40,60,25,.30)';
      ctx.shadowBlur = 9 * u;
      ctx.shadowOffsetY = 4 * u;
    }
    if (p === dragging) {
      var cx = px + pw / 2;
      var cy = py + ph / 2;
      ctx.translate(cx, cy);
      ctx.scale(1.045, 1.045);
      ctx.translate(-cx, -cy);
      ctx.shadowBlur = 18 * u;
      ctx.shadowOffsetY = 9 * u;
    }
    ctx.drawImage(p.canvas, px, py, pw, ph);
    ctx.restore();
  }

  function drawSnapHint(p) {
    var d = snapDistance(p);
    var tol = Math.max(20, 34 * u);
    if (d > tol * 2.2) return;
    var a = clamp(1 - (d - tol) / (tol * 1.2), 0.25, 1);
    ctx.save();
    ctx.translate(board.x, board.y);
    ctx.scale(scale, scale);
    ctx.lineWidth = 2.4 / scale;
    ctx.setLineDash([7 / scale, 6 / scale]);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')';
    ctx.stroke(p.path);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.16 * a).toFixed(3) + ')';
    ctx.fill(p.path);
    ctx.restore();
  }

  function drawPeek() {
    var left = peekUntil - performance.now();
    if (left <= 0 || !sceneCv) return;
    var a = Math.min(1, left / 260);
    ctx.save();
    rrScreenPath(board.x, board.y, board.w, board.h, 8 * u);
    ctx.clip();
    ctx.globalAlpha = a;
    ctx.drawImage(sceneCv, board.x, board.y, board.w, board.h);
    ctx.restore();

    // 顶部居中的「原图」小胶囊，避免直接压在画面元素上
    ctx.save();
    var bw = 64 * u;
    var bh = 24 * u;
    var bx = board.x + board.w / 2 - bw / 2;
    var by = board.y + 10 * u;
    fillRScreen(bx, by, bw, bh, bh / 2, 'rgba(255,255,255,' + (0.92 * a).toFixed(3) + ')');
    ctx.fillStyle = 'rgba(70,110,60,' + (0.95 * a).toFixed(3) + ')';
    ctx.font = '700 ' + (12 * u).toFixed(1) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('原图', board.x + board.w / 2, by + bh / 2 + 0.5 * u);
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < effects.length; i++) {
      var p = effects[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'star') {
        starShape(ctx, 0, 0, p.size, p.color);
      } else if (p.shape === 'rect') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawStageBg();
    drawBoard();

    var i;
    if (state === 'playing' || state === 'paused') {
      for (i = 0; i < pieces.length; i++) {
        if (pieces[i].placed) drawPiece(pieces[i], false);
      }
      for (i = 0; i < pieces.length; i++) {
        if (!pieces[i].placed) drawPiece(pieces[i], true);
      }
    }

    if (dragging) drawSnapHint(dragging);
    drawPeek();
    drawEffects();
  }

  // ============================================================
  //  粒子
  // ============================================================
  function burstStars(x, y) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * TAU;
      var sp = rand(40, 130) * u;
      var life = rand(0.35, 0.7);
      effects.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30 * u,
        g: 260 * u,
        life: life,
        max: life,
        size: rand(3, 6) * u,
        color: i % 3 === 0 ? 'rgba(255,240,160,.95)' : 'rgba(255,255,255,.95)',
        shape: 'star',
        rot: Math.random() * TAU,
        vr: rand(-6, 6)
      });
    }
  }

  function burstConfetti() {
    var colors = ['#ff9bb5', '#ffd15c', '#6fd0c8', '#b9a4ff', '#ff8a5c', '#8ed95f'];
    for (var i = 0; i < 90; i++) {
      effects.push({
        x: rand(0, W),
        y: rand(-H * 0.2, H * 0.25),
        vx: rand(-40, 40) * u,
        vy: rand(40, 140) * u,
        g: 180 * u,
        life: rand(1.6, 2.8),
        max: 2.8,
        size: rand(5, 10) * u,
        color: colors[i % colors.length],
        shape: 'rect',
        rot: Math.random() * TAU,
        vr: rand(-8, 8)
      });
    }
  }

  function updateEffects(dt) {
    for (var i = effects.length - 1; i >= 0; i--) {
      var p = effects[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) effects.splice(i, 1);
    }
  }

  // ============================================================
  //  帧循环
  // ============================================================
  function update(dt) {
    if (state === 'playing') {
      elapsed += dt * 1000;
    }

    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (p.snapping) {
        p.snapT += dt;
        var k = Math.min(1, p.snapT / 0.2);
        var e = 1 - Math.pow(1 - k, 3);
        p.x = p.fromX * (1 - e);
        p.y = p.fromY * (1 - e);
        if (k >= 1) {
          p.snapping = false;
          p.placed = true;
          p.x = 0;
          p.y = 0;
          placedCount++;
          updateHud();
          if (placedCount >= totalPieces) endGame();
        }
      }
    }

    updateEffects(dt);

    if (state === 'playing') {
      updateTimeText();
    }
  }

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    update(dt);
    render();
  }

  // ============================================================
  //  按钮和快捷键
  // ============================================================
  startBtn.addEventListener('click', newPuzzle);
  againBtn.addEventListener('click', newPuzzle);
  resumeBtn.addEventListener('click', resumeGame);
  restartBtn.addEventListener('click', newPuzzle);
  pauseBtn.addEventListener('click', togglePause);
  peekBtn.addEventListener('click', peek);
  peekBtn2.addEventListener('click', function () {
    resumeGame();
    peek();
  });
  hintBtn.addEventListener('click', toggleHint);
  picBtn.addEventListener('click', cyclePicture);
  diffBtn.addEventListener('click', cycleDiff);
  switchBtn.addEventListener('click', cyclePicture);

  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    prefs.sound = soundOn;
    saveStore();
    updateHud();
    if (soundOn) {
      ensureAudio();
      sfx.pick();
    }
  });

  for (var pi = 0; pi < picOpts.length; pi++) {
    picOpts[pi].addEventListener('click', function (ev) {
      var id = ev.currentTarget.getAttribute('data-pic');
      if (id === pic.id) return;
      pic = PICS[id];
      prefs.pic = id;
      saveStore();
      sceneCv = getScene(pic.id);
      pieces = [];
      buildPieces();
      placedCount = 0;
      totalPieces = pieces.length;
      updateHud();
      ensureAudio();
      sfx.pick();
    });
  }

  for (var di = 0; di < diffOpts.length; di++) {
    diffOpts[di].addEventListener('click', function (ev) {
      var id = ev.currentTarget.getAttribute('data-diff');
      if (id === diff.id) return;
      diff = DIFFS[id];
      prefs.diff = id;
      saveStore();
      pieces = [];
      buildPieces();
      placedCount = 0;
      totalPieces = pieces.length;
      updateHud();
      ensureAudio();
      sfx.pick();
    });
  }

  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (ev.key === 'Enter') {
      if (tag === 'BUTTON') return;
      if (state === 'idle' || state === 'won') {
        ev.preventDefault();
        newPuzzle();
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
    } else if (ev.key === 'h' || ev.key === 'H') {
      ev.preventDefault();
      peek();
    } else if (ev.key === 'g' || ev.key === 'G') {
      if (state !== 'idle') toggleHint();
    } else if (ev.key === 'c' || ev.key === 'C') {
      ev.preventDefault();
      cyclePicture();
    } else if (ev.key === 'r' || ev.key === 'R') {
      if (state !== 'idle') newPuzzle();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') pauseGame();
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    new ResizeObserver(function () { resize(); }).observe(stage);
  }

  // ============================================================
  //  初始化
  // ============================================================
  function drawThumbs() {
    for (var i = 0; i < thumbs.length; i++) {
      var cv = thumbs[i];
      var opt = cv.parentNode;
      var id = opt.getAttribute('data-pic');
      var src = getScene(id);
      var g = cv.getContext('2d');
      // 缩略图按 4:3 裁切
      var sw = SCENE_W;
      var sh = SCENE_W * 3 / 4;
      var sy = (SCENE_H - sh) / 2;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(src, 0, sy, sw, sh, 0, 0, cv.width, cv.height);
    }
  }

  sceneCv = getScene(pic.id);
  drawThumbs();
  resize();
  pieces = [];
  buildPieces();
  totalPieces = pieces.length;
  updateHud();
  setPauseLabel(false);
  pauseBtn.disabled = true;
  state = 'idle';

  rafId = requestAnimationFrame(frame);
})();