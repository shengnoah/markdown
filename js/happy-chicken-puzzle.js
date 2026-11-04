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

  // scene 决定用哪套场景绘制器；农场之外还有海底 / 太空 / 城市 / 雪山 / 沙滩
  var PICS = {
    chicken: {
      id: 'chicken',
      name: '晴日农场',
      tag: '农场 · 鸡太太',
      emoji: '🐔',
      scene: 'farm',
      pal: 'day',
      star: 'chicken',
      fx: []
    },
    snake: {
      id: 'snake',
      name: '黄昏农场',
      tag: '农场 · 下蛋小蛇',
      emoji: '🐍',
      scene: 'farm',
      pal: 'dusk',
      star: 'snake',
      fx: []
    },
    ocean: {
      id: 'ocean',
      name: '海底世界',
      tag: '珊瑚 · 小鱼',
      emoji: '🐠',
      scene: 'ocean',
      pal: 'ocean',
      star: 'snake',
      fx: []
    },
    space: {
      id: 'space',
      name: '太空漫步',
      tag: '星球 · 小行星',
      emoji: '🚀',
      scene: 'space',
      pal: 'space',
      star: 'chicken',
      fx: []
    },
    city: {
      id: 'city',
      name: '城市夜色',
      tag: '高楼 · 霓虹',
      emoji: '🌃',
      scene: 'city',
      pal: 'city',
      star: 'snake',
      fx: []
    },
    snow: {
      id: 'snow',
      name: '雪山日出',
      tag: '雪峰 · 松林',
      emoji: '🏔️',
      scene: 'snow',
      pal: 'snow',
      star: 'chicken',
      fx: []
    },
    beach: {
      id: 'beach',
      name: '海边度假',
      tag: '椰树 · 海浪',
      emoji: '🏖️',
      scene: 'beach',
      pal: 'beach',
      star: 'snake',
      fx: []
    },
    desert: {
      id: 'desert',
      name: '沙漠绿洲',
      tag: '仙人掌 · 沙丘',
      emoji: '🏜️',
      scene: 'desert',
      pal: 'desert',
      star: 'chicken',
      fx: []
    }
  };
  var PIC_ORDER = ['chicken', 'snake', 'ocean', 'space', 'city', 'snow', 'beach', 'desert'];

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
    },
    ocean: {
      sky0: '#0b3d63', sky1: '#12688f', sky2: '#2fa3bf',
      sun: '#bfefff', sunGlow: 'rgba(150,230,255,.4)', sunFace: '#7ec8e0',
      cloud: '#a8e6f5', hillFar: '#1a7a92',
      yard0: '#e6d3a8', yard1: '#d4bd8c', yard2: '#bda574',
      grass: 'rgba(70,170,160,.4)', flowerA: '#ffd6e8', flowerB: '#ffe9b0',
      fence: '#d9c9a3', barn: '#e07a6a', barnDark: '#c05f52', hay: '#d9b45e',
      shade: 'rgba(10,60,80,.24)',
      bunting: ['#ff9bb5', '#ffd15c', '#6fd0c8', '#a9a7ff', '#ff8a5c'],
      haze: 'rgba(60,190,215,.2)',
      vignette: 'rgba(6,36,60,.3)'
    },
    space: {
      sky0: '#0a0a1f', sky1: '#161238', sky2: '#2b1f52',
      sun: '#fff2b8', sunGlow: 'rgba(255,220,150,.4)', sunFace: '#c9a04a',
      cloud: '#5a4a8c', hillFar: '#3a2a68',
      yard0: '#3d2f6b', yard1: '#302452', yard2: '#231a3c',
      grass: 'rgba(160,140,255,.3)', flowerA: '#c9b6ff', flowerB: '#8fe8ff',
      fence: '#8f7fc0', barn: '#7a4a8c', barnDark: '#5c3669', hay: '#b08a3a',
      shade: 'rgba(10,8,30,.34)',
      bunting: ['#ffd166', '#8fe8ff', '#ff9bb5', '#a6ffcb', '#c7a1ff'],
      haze: 'rgba(40,20,70,.3)',
      vignette: 'rgba(4,4,16,.42)'
    },
    city: {
      sky0: '#141c3a', sky1: '#2d2a55', sky2: '#6b3f6e',
      sun: '#ffe9b8', sunGlow: 'rgba(255,200,140,.42)', sunFace: '#c9924a',
      cloud: '#4a4470', hillFar: '#2a2450',
      yard0: '#3a3a52', yard1: '#2f2f45', yard2: '#24242f',
      grass: 'rgba(120,120,180,.3)', flowerA: '#ffd6a8', flowerB: '#ffb0d0',
      fence: '#5d5d7a', barn: '#6b4a6e', barnDark: '#523850', hay: '#a88a48',
      shade: 'rgba(10,10,30,.34)',
      bunting: ['#ff9bb5', '#ffd15c', '#6fd0c8', '#a9a7ff', '#ff8a5c'],
      haze: 'rgba(70,40,90,.3)',
      vignette: 'rgba(8,8,24,.36)'
    },
    snow: {
      sky0: '#8fb8e0', sky1: '#c3dcf0', sky2: '#eef7ff',
      sun: '#ffe9b0', sunGlow: 'rgba(255,230,170,.5)', sunFace: '#c9a05a',
      cloud: '#ffffff', hillFar: '#dbeaf7',
      yard0: '#ffffff', yard1: '#eaf4ff', yard2: '#d3e6f7',
      grass: 'rgba(130,170,210,.35)', flowerA: '#ffffff', flowerB: '#d6ebff',
      fence: '#f4faff', barn: '#c26a6a', barnDark: '#a05454', hay: '#d9c48a',
      shade: 'rgba(90,130,170,.2)',
      bunting: ['#ff9bb5', '#ffd15c', '#6fd0c8', '#a9a7ff', '#ff8a5c'],
      haze: 'rgba(220,240,255,.28)',
      vignette: 'rgba(60,100,140,.16)'
    },
    beach: {
      sky0: '#7fd0f5', sky1: '#c3ecff', sky2: '#fff6e2',
      sun: '#ffe27a', sunGlow: 'rgba(255,235,150,.55)', sunFace: '#cf9b3a',
      cloud: '#ffffff', hillFar: '#8fd8d8',
      yard0: '#f5e3bd', yard1: '#efd8a8', yard2: '#e2c88c',
      grass: 'rgba(120,180,140,.35)', flowerA: '#ffd6e8', flowerB: '#fff0b8',
      fence: '#fffdf6', barn: '#e08a5a', barnDark: '#c06f45', hay: '#e8c257',
      shade: 'rgba(140,110,60,.18)',
      bunting: ['#ff9bb5', '#ffd15c', '#6fd0c8', '#a9a7ff', '#ff8a5c'],
      haze: 'rgba(255,235,190,.2)',
      vignette: 'rgba(120,100,50,.12)'
    },
    desert: {
      sky0: '#ffc98a', sky1: '#ffdcae', sky2: '#fff3dc',
      sun: '#ffd166', sunGlow: 'rgba(255,210,120,.55)', sunFace: '#b9762a',
      cloud: '#fff2d8', hillFar: '#e8b478',
      yard0: '#e8c48a', yard1: '#dcb271', yard2: '#c99c5c',
      grass: 'rgba(150,120,60,.35)', flowerA: '#ffd6a8', flowerB: '#f0b0c0',
      fence: '#e8d4a8', barn: '#c98a5a', barnDark: '#a86f45', hay: '#d9b45e',
      shade: 'rgba(130,90,40,.2)',
      bunting: ['#e8994a', '#f2c14e', '#a8c46a', '#d9754b', '#f0d9a8'],
      haze: 'rgba(255,215,160,.26)',
      vignette: 'rgba(130,90,40,.16)'
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
          '<div class="hp-pic-pick" role="group" aria-label="选择画面" id="hp-pic-pick"></div>' +
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

  // 画面选择器按 PICS 自动生成，新增图片无需改 HTML
  (function buildPicPicker() {
    var host = crt.querySelector('#hp-pic-pick');
    if (!host) return;
    var html = '';
    for (var i = 0; i < PIC_ORDER.length; i++) {
      var p = PICS[PIC_ORDER[i]];
      html +=
        '<button type="button" class="hp-pic-opt' + (i === 0 ? ' is-active' : '') + '" data-pic="' + p.id + '" title="' + p.tag + '">' +
          '<span class="hp-pic-thumb-wrap">' +
            '<canvas class="hp-pic-thumb" width="200" height="150" aria-hidden="true"></canvas>' +
            '<span class="hp-pic-emoji" aria-hidden="true">' + p.emoji + '</span>' +
          '</span>' +
          '<span class="hp-pic-name">' + p.name + '</span>' +
          '<span class="hp-pic-tag">' + p.tag.split(' · ')[0] + '</span>' +
        '</button>';
    }
    host.innerHTML = html;
  })();

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
  function drawMoon(g, x, y, r) {
    g.save();
    g.translate(x, y);
    var glow = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.8);
    glow.addColorStop(0, 'rgba(224,236,255,.42)');
    glow.addColorStop(1, 'rgba(224,236,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, r * 2.8, 0, TAU);
    g.fill();

    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fillStyle = '#fdfbe8';
    g.fill();

    // 环形山
    g.fillStyle = 'rgba(198,200,180,.5)';
    var craters = [[-0.3, -0.24, 0.2], [0.26, 0.1, 0.14], [-0.06, 0.36, 0.11], [0.34, -0.36, 0.09]];
    for (var i = 0; i < craters.length; i++) {
      g.beginPath();
      g.arc(craters[i][0] * r, craters[i][1] * r, craters[i][2] * r, 0, TAU);
      g.fill();
    }

    // 睡脸
    g.strokeStyle = 'rgba(150,150,130,.85)';
    g.lineWidth = Math.max(1.4, r * 0.06);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-r * 0.26, -r * 0.02, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.beginPath();
    g.arc(r * 0.24, -r * 0.02, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.restore();
  }

  function drawStars(g, rnd, count, maxY, color) {
    for (var i = 0; i < count; i++) {
      var x = rnd() * SCENE_W;
      var y = rnd() * maxY;
      var r = 0.8 + rnd() * 1.9;
      var a = 0.35 + rnd() * 0.6;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      g.fill();
      // 少数大星带十字光芒
      if (r > 2.3) {
        g.strokeStyle = 'rgba(255,255,255,' + (a * 0.55).toFixed(2) + ')';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - r * 2.4, y); g.lineTo(x + r * 2.4, y);
        g.moveTo(x, y - r * 2.4); g.lineTo(x, y + r * 2.4);
        g.stroke();
      }
    }
  }






  function shadeColor(hex, amount) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return hex;
    function c(i) { return clamp(parseInt(m[i], 16) + amount, 0, 255); }
    return '#' + ((1 << 24) + (c(1) << 16) + (c(2) << 8) + c(3)).toString(16).slice(1);
  }


  function drawBlossom(g, x, y, s, petal, center) {
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5 - Math.PI / 2;
      ell(g, x + Math.cos(a) * 3.6 * s, y + Math.sin(a) * 3.6 * s, 3.4 * s, 3.4 * s, 0, petal);
    }
    ell(g, x, y, 2.2 * s, 2.2 * s, 0, center);
  }

// ---------- 角色配件（不同场景的小道具） ----------
  function chickenHead(x, groundY, s, dir) {
    return { x: x + dir * 26 * s, y: groundY - 98 * s, r: 23 * s, s: s, dir: dir };
  }

  function drawDiveMask(g, hp) {
    var s = hp.s;
    var d = hp.dir;
    g.save();
    // 面镜玻璃
    g.beginPath();
    g.ellipse(hp.x + d * 8 * s, hp.y - 5 * s, 17 * s, 11 * s, -0.08 * d, 0, TAU);
    g.fillStyle = 'rgba(150,230,255,.45)';
    g.fill();
    g.strokeStyle = 'rgba(36,64,74,.8)';
    g.lineWidth = 2.6 * s;
    g.stroke();
    // 玻璃高光
    g.beginPath();
    g.ellipse(hp.x + d * 2 * s, hp.y - 9 * s, 5.5 * s, 2.8 * s, -0.4 * d, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.fill();
    // 头带
    g.strokeStyle = 'rgba(232,120,90,.9)';
    g.lineWidth = 4 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hp.x - d * 9 * s, hp.y - 5 * s);
    g.quadraticCurveTo(hp.x - d * 22 * s, hp.y - 12 * s, hp.x - d * 26 * s, hp.y + 2 * s);
    g.stroke();
    // 呼吸管
    g.strokeStyle = '#ffd166';
    g.lineWidth = 4.2 * s;
    g.beginPath();
    g.moveTo(hp.x - d * 16 * s, hp.y + 4 * s);
    g.quadraticCurveTo(hp.x - d * 30 * s, hp.y + 12 * s, hp.x - d * 32 * s, hp.y - 26 * s);
    g.stroke();
    g.restore();
  }

  function drawSpaceHelmet(g, hp) {
    var s = hp.s;
    g.save();
    g.beginPath();
    g.arc(hp.x, hp.y - 2 * s, 28 * s, 0, TAU);
    g.fillStyle = 'rgba(180,235,255,.24)';
    g.fill();
    g.strokeStyle = 'rgba(200,230,255,.85)';
    g.lineWidth = 2.6 * s;
    g.stroke();
    // 高光
    g.beginPath();
    g.arc(hp.x - 9 * s, hp.y - 13 * s, 8 * s, Math.PI * 0.9, Math.PI * 1.55);
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 3 * s;
    g.stroke();
    // 颈环
    g.fillStyle = 'rgba(190,205,225,.85)';
    g.fillRect(hp.x - 20 * s, hp.y + 24 * s, 40 * s, 7 * s);
    g.restore();
  }

  function drawScarf(g, hp) {
    var s = hp.s;
    var d = hp.dir;
    g.save();
    g.fillStyle = '#e8543f';
    // 围巾主体
    g.beginPath();
    g.ellipse(hp.x - d * 8 * s, hp.y + 24 * s, 19 * s, 7 * s, -0.06 * d, 0, TAU);
    g.fill();
    // 飘带
    g.beginPath();
    g.moveTo(hp.x - d * 20 * s, hp.y + 24 * s);
    g.quadraticCurveTo(hp.x - d * 38 * s, hp.y + 18 * s, hp.x - d * 44 * s, hp.y + 34 * s);
    g.lineTo(hp.x - d * 38 * s, hp.y + 40 * s);
    g.quadraticCurveTo(hp.x - d * 32 * s, hp.y + 28 * s, hp.x - d * 26 * s, hp.y + 30 * s);
    g.closePath();
    g.fillStyle = '#d8462f';
    g.fill();
    g.restore();
  }

  function drawShades(g, hp) {
    var s = hp.s;
    var d = hp.dir;
    g.save();
    g.fillStyle = 'rgba(38,48,62,.88)';
    g.beginPath();
    g.ellipse(hp.x + d * 4 * s, hp.y - 5 * s, 10 * s, 7 * s, -0.1 * d, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(hp.x + d * 20 * s, hp.y - 4 * s, 8 * s, 6 * s, -0.1 * d, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(38,48,62,.88)';
    g.lineWidth = 2.4 * s;
    g.beginPath();
    g.moveTo(hp.x + d * 12 * s, hp.y - 6 * s);
    g.lineTo(hp.x + d * 14 * s, hp.y - 6 * s);
    g.stroke();
    // 高光
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath();
    g.ellipse(hp.x + d * 1 * s, hp.y - 7 * s, 3 * s, 1.6 * s, -0.3, 0, TAU);
    g.fill();
    g.restore();
  }

  function drawStrawHat(g, hp) {
    var s = hp.s;
    g.save();
    // 帽檐
    g.beginPath();
    g.ellipse(hp.x, hp.y - 20 * s, 34 * s, 10 * s, 0, 0, TAU);
    g.fillStyle = '#f0cf82';
    g.fill();
    g.strokeStyle = 'rgba(160,120,50,.45)';
    g.lineWidth = 1.6 * s;
    g.stroke();
    // 帽顶
    g.beginPath();
    g.ellipse(hp.x, hp.y - 28 * s, 19 * s, 12 * s, 0, 0, TAU);
    g.fillStyle = '#f7dc9a';
    g.fill();
    // 帽带
    g.beginPath();
    g.ellipse(hp.x, hp.y - 22 * s, 19 * s, 5 * s, 0, 0, TAU);
    g.fillStyle = '#e0614f';
    g.fill();
    g.restore();
  }

  // ---------- 角色阵容 ----------
  function drawCast(g, groundY, starIsChicken, acc) {
    var chickScale = starIsChicken ? 1.5 : 1.14;
    var snakeScale = starIsChicken ? 1.2 : 1.48;
    var cx = starIsChicken ? 322 : 272;
    var sx = starIsChicken ? 700 : 662;
    var su = 1;

    artChicken(g, cx, groundY, chickScale, 1, 2.4);
    artSnake(g, sx, groundY + 6, snakeScale, -1, 1.7);

    // 配件
    var hp = chickenHead(cx, groundY, chickScale * su, 1);
    if (acc === 'mask') drawDiveMask(g, hp);
    else if (acc === 'helmet') drawSpaceHelmet(g, hp);
    else if (acc === 'scarf') drawScarf(g, hp);
    else if (acc === 'shades') drawShades(g, hp);
    else if (acc === 'hat') drawStrawHat(g, hp);

    // 蛋和小鸡
    artEgg(g, 512, groundY + 4, 56, 74, -0.06, true);
    artEgg(g, 578, groundY + 10, 44, 58, 0.1, false);
    artEgg(g, 790, groundY + 14, 40, 54, -0.12, false);
    artChick(g, 208, groundY + 4, 1.24, 1, 0.4);
    artChick(g, 256, groundY + 14, 0.94, 1, 1.9);
  }

  function drawSceneVignette(g, P) {
    var vg = g.createRadialGradient(SCENE_W / 2, SCENE_H * 0.42, SCENE_H * 0.32, SCENE_W / 2, SCENE_H * 0.5, SCENE_H * 0.8);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, P.vignette);
    g.fillStyle = vg;
    g.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  function skyGradient(g, P) {
    var sky = g.createLinearGradient(0, 0, 0, SCENE_H);
    sky.addColorStop(0, P.sky0);
    sky.addColorStop(0.55, P.sky1);
    sky.addColorStop(1, P.sky2);
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  // ============================================================
  //  场景 1：农场
  // ============================================================
  function drawFarmScene(g, P, p) {
    var starIsChicken = p.star === 'chicken';
    var groundY = 648;
    var rnd = mulberry32(20261103);

    skyGradient(g, P);

    drawSun(g, starIsChicken ? 806 : 742, starIsChicken ? 166 : 210, 44, P);

    drawCloud(g, 146, 112, 1.12, P.cloud);
    drawCloud(g, 392, 208, 0.74, P.cloud);
    drawCloud(g, 700, 238, 0.9, P.cloud);
    drawCloud(g, 862, 150, 0.6, P.cloud);

    drawBird(g, 296, 172, 0.95, 'rgba(90,110,120,.55)');
    drawBird(g, 334, 150, 0.72, 'rgba(90,110,120,.45)');
    drawBird(g, 700, 226, 0.82, 'rgba(90,110,120,.5)');

    drawBunting(g, P);
    drawFarHills(g, P);
    drawBarn(g, 206, 396, 238, 156, P);
    drawYard(g, P);
    drawFence(g, 520, 78, P);
    drawHay(g, 802, 449, 116, 70, P);
    drawGroundDecor(g, P);

    if (P.haze !== 'rgba(255,255,255,0)') {
      g.fillStyle = P.haze;
      g.fillRect(0, 300, SCENE_W, 120);
    }

    drawCast(g, groundY, starIsChicken, p.holiday || null);

    drawButterfly(g, 468, 388, 1.0, 0.28);
    drawButterfly(g, 760, 356, 0.86, 1);
    drawButterfly(g, 178, 552, 0.8, 0.6);

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 2：海底世界
  // ============================================================
  function drawCoral(g, x, y, s, color) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineWidth = 9 * s;
    // 主干
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-3 * s, -22 * s, 0, -42 * s);
    g.stroke();
    // 分枝
    g.lineWidth = 7 * s;
    g.beginPath();
    g.moveTo(0, -20 * s);
    g.quadraticCurveTo(12 * s, -30 * s, 16 * s, -46 * s);
    g.moveTo(-1 * s, -30 * s);
    g.quadraticCurveTo(-14 * s, -38 * s, -17 * s, -52 * s);
    g.moveTo(1 * s, -12 * s);
    g.quadraticCurveTo(14 * s, -14 * s, 22 * s, -24 * s);
    g.stroke();
    g.restore();
  }

  function drawSeaweed(g, x, y, h, s, color) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineWidth = 7 * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-14 * s, -h * 0.32, 14 * s, -h * 0.62, -5 * s, -h);
    g.stroke();
    g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(-2 * s, -h * 0.45);
    g.quadraticCurveTo(12 * s, -h * 0.6, 15 * s, -h * 0.78);
    g.stroke();
    g.restore();
  }

  function drawFish(g, x, y, s, dir, body, fin) {
    g.save();
    g.translate(x, y);
    g.scale(dir, 1);
    var grad = g.createLinearGradient(0, -12 * s, 0, 12 * s);
    grad.addColorStop(0, body);
    grad.addColorStop(1, shadeColor(body, -28));
    g.beginPath();
    g.ellipse(0, 0, 22 * s, 13 * s, 0, 0, TAU);
    g.fillStyle = grad;
    g.fill();
    // 尾鳍
    g.beginPath();
    g.moveTo(-19 * s, 0);
    g.lineTo(-34 * s, -11 * s);
    g.lineTo(-30 * s, 0);
    g.lineTo(-34 * s, 11 * s);
    g.closePath();
    g.fillStyle = fin;
    g.fill();
    // 背鳍
    g.beginPath();
    g.moveTo(-2 * s, -11 * s);
    g.quadraticCurveTo(4 * s, -22 * s, 13 * s, -10 * s);
    g.closePath();
    g.fillStyle = fin;
    g.fill();
    // 眼
    g.beginPath();
    g.arc(13 * s, -2 * s, 3.4 * s, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();
    g.beginPath();
    g.arc(14.2 * s, -2 * s, 1.8 * s, 0, TAU);
    g.fillStyle = '#22303a';
    g.fill();
    // 鳃线
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 1.6 * s;
    g.beginPath();
    g.arc(8 * s, 0, 9 * s, -1.1, 1.1);
    g.stroke();
    g.restore();
  }

  function drawBubble(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = 'rgba(220,248,255,.26)';
    g.fill();
    g.strokeStyle = 'rgba(240,255,255,.7)';
    g.lineWidth = 1.4;
    g.stroke();
    g.beginPath();
    g.arc(x - r * 0.32, y - r * 0.34, r * 0.24, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fill();
  }

  function drawStarfish(g, x, y, r, color) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.42;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath();
    g.arc(0, 0, r * 0.22, 0, TAU);
    g.fill();
    g.restore();
  }

  function drawOceanScene(g, P, p) {
    var rnd = mulberry32(20261205);
    var groundY = 640;

    // 海水：上方亮、下方深，底部接近海床
    var water = g.createLinearGradient(0, 0, 0, SCENE_H);
    water.addColorStop(0, '#3fb4cf');
    water.addColorStop(0.35, '#1c86ab');
    water.addColorStop(0.72, '#0e6288');
    water.addColorStop(1, '#07405e');
    g.fillStyle = water;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // 水面波纹（顶部）
    g.save();
    g.strokeStyle = 'rgba(230,255,255,.5)';
    g.lineWidth = 3;
    for (var w = 0; w < 5; w++) {
      g.beginPath();
      var wy = 14 + w * 12;
      g.moveTo(-20, wy);
      for (var wx = 0; wx <= SCENE_W + 40; wx += 40) {
        g.quadraticCurveTo(wx + 10, wy - 7, wx + 20, wy);
        g.quadraticCurveTo(wx + 30, wy + 7, wx + 40, wy);
      }
      g.stroke();
    }
    g.restore();

    // 光柱
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var r = 0; r < 5; r++) {
      var x0 = 130 + r * 175;
      var grad2 = g.createLinearGradient(x0, 0, x0 + 90, SCENE_H);
      grad2.addColorStop(0, 'rgba(190,250,255,.22)');
      grad2.addColorStop(1, 'rgba(190,250,255,0)');
      g.fillStyle = grad2;
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + 46, 0);
      g.lineTo(x0 + 150, SCENE_H);
      g.lineTo(x0 + 60, SCENE_H);
      g.closePath();
      g.fill();
    }
    g.restore();

    // 海床
    g.beginPath();
    g.moveTo(0, 640);
    g.quadraticCurveTo(180, 604, 380, 636);
    g.quadraticCurveTo(580, 668, 760, 630);
    g.quadraticCurveTo(880, 608, SCENE_W, 634);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var sand = g.createLinearGradient(0, 610, 0, SCENE_H);
    sand.addColorStop(0, '#e8d6ac');
    sand.addColorStop(1, '#cbb184');
    g.fillStyle = sand;
    g.fill();

    // 海床上的小石子与贝壳
    for (var st = 0; st < 16; st++) {
      var stx = 30 + rnd() * (SCENE_W - 60);
      var sty = 664 + rnd() * 46;
      ell(g, stx, sty, 4 + rnd() * 7, 3 + rnd() * 4, 0, 'rgba(160,135,95,.5)');
    }

    // 珊瑚
    drawCoral(g, 96, 664, 1.25, '#ff8f9e');
    drawCoral(g, 148, 676, 0.95, '#ffb36b');
    drawCoral(g, 806, 662, 1.2, '#b48bff');
    drawCoral(g, 858, 674, 0.9, '#6fd8c8');

    // 海草
    drawSeaweed(g, 208, 684, 150, 1.1, '#3f9f74');
    drawSeaweed(g, 240, 690, 116, 0.9, '#4fb884');
    drawSeaweed(g, 730, 682, 132, 1.0, '#3f9f74');
    drawSeaweed(g, 764, 692, 104, 0.85, '#4fb884');

    // 礁石
    ell(g, 400, 700, 64, 26, 0, '#2c6f86');
    ell(g, 372, 690, 30, 18, 0, '#35809a');

    // 海星
    drawStarfish(g, 610, 694, 16, '#ff9f6b');
    drawStarfish(g, 300, 706, 12, '#ffd166');

    // 鱼群
    drawFish(g, 300, 300, 1.05, 1, '#ffd166', '#ff9f43');
    drawFish(g, 396, 250, 0.8, 1, '#7fe0ff', '#3fb4d8');
    drawFish(g, 660, 320, 0.95, -1, '#ff9bb5', '#e0668a');
    drawFish(g, 740, 250, 0.7, -1, '#a9e77f', '#63b74c');
    drawFish(g, 520, 200, 0.62, 1, '#c7a1ff', '#8f6fd8');
    drawFish(g, 178, 420, 0.72, 1, '#7fe0ff', '#3fb4d8');
    drawFish(g, 880, 420, 0.66, -1, '#ffd166', '#e0a83f');

    // 气泡
    var bubbles = [[360, 250, 5], [372, 210, 3.4], [356, 176, 2.6], [700, 240, 4], [712, 200, 3], [150, 330, 3.6], [160, 292, 2.6]];
    for (var b = 0; b < bubbles.length; b++) {
      drawBubble(g, bubbles[b][0], bubbles[b][1], bubbles[b][2]);
    }

    drawCast(g, groundY, p.star === 'chicken', 'mask');

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 3：太空
  // ============================================================
  function drawPlanet(g, x, y, r) {
    g.save();
    // 光环
    g.save();
    g.translate(x, y);
    g.rotate(-0.32);
    g.beginPath();
    g.ellipse(0, 0, r * 1.72, r * 0.44, 0, 0, TAU);
    g.strokeStyle = 'rgba(255,220,160,.42)';
    g.lineWidth = r * 0.14;
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, r * 1.95, r * 0.52, 0, 0, TAU);
    g.strokeStyle = 'rgba(255,235,190,.24)';
    g.lineWidth = r * 0.07;
    g.stroke();
    g.restore();

    // 星球本体
    var grad = g.createRadialGradient(x - r * 0.34, y - r * 0.36, r * 0.16, x, y, r);
    grad.addColorStop(0, '#ffd9a8');
    grad.addColorStop(0.45, '#f0a06a');
    grad.addColorStop(1, '#a85a44');
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = grad;
    g.fill();

    // 条纹
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.clip();
    g.fillStyle = 'rgba(255,240,210,.28)';
    for (var i = -2; i <= 2; i++) {
      g.beginPath();
      g.ellipse(x, y + i * r * 0.42, r * 1.05, r * 0.11, 0.06, 0, TAU);
      g.fill();
    }
    g.restore();

    // 明暗交界
    g.beginPath();
    g.arc(x + r * 0.3, y + r * 0.18, r, 0, TAU);
    g.fillStyle = 'rgba(20,10,40,.18)';
    g.fill();
    g.restore();
  }

  function drawAsteroid(g, x, y, r, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    g.beginPath();
    var pts = 8;
    for (var i = 0; i < pts; i++) {
      var a = i / pts * TAU;
      var rr = r * (0.78 + ((i * 37) % 11) / 34);
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#6b6480';
    g.fill();
    g.strokeStyle = 'rgba(40,36,60,.6)';
    g.lineWidth = 1.2;
    g.stroke();
    // 坑
    ell(g, -r * 0.2, -r * 0.1, r * 0.22, r * 0.17, 0, 'rgba(40,36,60,.45)');
    ell(g, r * 0.28, r * 0.22, r * 0.14, r * 0.11, 0, 'rgba(40,36,60,.38)');
    g.restore();
  }

  function drawSpaceScene(g, P, p) {
    var rnd = mulberry32(20261207);
    var groundY = 636;

    // 深空
    var space = g.createLinearGradient(0, 0, 0, SCENE_H);
    space.addColorStop(0, '#07071a');
    space.addColorStop(0.5, '#141033');
    space.addColorStop(1, '#2a1c4e');
    g.fillStyle = space;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // 星云
    g.save();
    g.globalCompositeOperation = 'lighter';
    var neb = [
      [190, 170, 300, 'rgba(120,80,220,.20)'],
      [780, 120, 250, 'rgba(60,140,240,.16)'],
      [520, 300, 340, 'rgba(200,80,180,.11)'],
      [880, 360, 200, 'rgba(80,200,220,.12)']
    ];
    for (var n = 0; n < neb.length; n++) {
      var ng = g.createRadialGradient(neb[n][0], neb[n][1], 0, neb[n][0], neb[n][1], neb[n][2]);
      ng.addColorStop(0, neb[n][3]);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng;
      g.beginPath();
      g.arc(neb[n][0], neb[n][1], neb[n][2], 0, TAU);
      g.fill();
    }
    g.restore();

    drawStars(g, rnd, 150, 640);

    // 带环行星
    drawPlanet(g, 796, 168, 74);

    // 卫星
    drawMoon(g, 206, 132, 30);

    // 小行星
    drawAsteroid(g, 420, 168, 17, 0.4);
    drawAsteroid(g, 486, 236, 11, 1.2);
    drawAsteroid(g, 636, 120, 13, -0.6);
    drawAsteroid(g, 120, 300, 9, 0.8);

    // 流星
    g.save();
    var mg = g.createLinearGradient(600, 300, 700, 380);
    mg.addColorStop(0, 'rgba(255,255,255,0)');
    mg.addColorStop(0.7, 'rgba(200,230,255,.7)');
    mg.addColorStop(1, 'rgba(255,255,255,.95)');
    g.strokeStyle = mg;
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(600, 300);
    g.lineTo(706, 384);
    g.stroke();
    g.restore();

    // 月面地平线
    g.beginPath();
    g.moveTo(0, 660);
    g.quadraticCurveTo(200, 616, 420, 648);
    g.quadraticCurveTo(660, 682, 900, 640);
    g.quadraticCurveTo(940, 632, SCENE_W, 636);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var moonGrad = g.createLinearGradient(0, 620, 0, SCENE_H);
    moonGrad.addColorStop(0, '#b9b4c9');
    moonGrad.addColorStop(1, '#8b86a0');
    g.fillStyle = moonGrad;
    g.fill();

    // 环形山
    var craters = [[120, 690, 34, 12], [250, 706, 22, 8], [640, 700, 30, 11], [810, 686, 20, 7], [420, 712, 16, 6]];
    for (var c = 0; c < craters.length; c++) {
      ell(g, craters[c][0], craters[c][1], craters[c][2], craters[c][3], 0, 'rgba(96,92,120,.55)');
      ell(g, craters[c][0], craters[c][1] - 2, craters[c][2] * 0.82, craters[c][3] * 0.72, 0, 'rgba(140,136,164,.7)');
    }

    drawCast(g, groundY, p.star === 'chicken', 'helmet');

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 4：城市夜色
  // ============================================================
  function drawBuildings(g, baseY, rnd, opts) {
    var x = -20;
    while (x < SCENE_W + 40) {
      var w = 52 + rnd() * 62;
      var h = opts.minH + rnd() * opts.hRange;
      var top = baseY - h;
      var shade = opts.tint;
      g.fillStyle = shade;
      g.fillRect(x, top, w, h + 40);

      // 楼顶结构
      if (rnd() < 0.4) {
        g.fillRect(x + w * 0.3, top - 12, w * 0.32, 12);
      }

      // 窗户
      var cols = Math.max(2, Math.floor(w / 16));
      var rows = Math.max(3, Math.floor(h / 24));
      var gapX = w / cols;
      var gapY = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rnd() < opts.darkChance) continue;
          var wx = x + gapX * (c + 0.26);
          var wy = top + gapY * (r + 0.28);
          var lit = rnd();
          var col = lit < 0.55 ? '#ffd98a' : (lit < 0.82 ? '#ffe9b8' : '#a9e7ff');
          g.fillStyle = col;
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.fillRect(wx, wy, gapX * 0.44, gapY * 0.42);
          g.globalAlpha = 1;
        }
      }
      x += w + 6 + rnd() * 10;
    }
  }

  function drawCityScene(g, P, p) {
    var rnd = mulberry32(20261209);
    var groundY = 626;

    // 夜空
    var sky = g.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#0e1430');
    sky.addColorStop(0.45, '#2b2450');
    sky.addColorStop(0.8, '#63356b');
    sky.addColorStop(1, '#8f4a63');
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    drawStars(g, rnd, 80, 360);
    drawMoon(g, 806, 124, 38);

    // 远处楼群（更暗更矮）
    drawBuildings(g, 610, rnd, { minH: 120, hRange: 150, tint: '#241d43', darkChance: 0.6 });

    // 近处楼群
    drawBuildings(g, 646, rnd, { minH: 170, hRange: 210, tint: '#171431', darkChance: 0.42 });

    // 霓虹招牌
    var neons = [['#ff6ba8', 150, 400, 44, 16], ['#5fe0ff', 300, 350, 34, 14], ['#ffd166', 690, 380, 40, 15], ['#a9ff9b', 838, 320, 30, 13]];
    for (var i = 0; i < neons.length; i++) {
      var n = neons[i];
      g.save();
      g.shadowColor = n[0];
      g.shadowBlur = 16;
      fillRScreen(g, n[1], n[2], n[3], n[4], 4, n[0]);
      g.restore();
    }

    // 前景天台地面
    g.beginPath();
    g.moveTo(0, 640);
    g.lineTo(SCENE_W, 640);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var roof = g.createLinearGradient(0, 636, 0, SCENE_H);
    roof.addColorStop(0, '#241f3d');
    roof.addColorStop(1, '#15122a');
    g.fillStyle = roof;
    g.fill();

    // 天台边缘
    fillRScreen(g, 0, 630, SCENE_W, 10, 3, '#332c53');

    // 路灯
    g.save();
    g.strokeStyle = '#3c3559';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(96, 640);
    g.lineTo(96, 528);
    g.stroke();
    g.beginPath();
    g.arc(96, 522, 8, 0, TAU);
    g.fillStyle = '#ffe9b8';
    g.fill();
    var lg = g.createRadialGradient(96, 522, 2, 96, 522, 46);
    lg.addColorStop(0, 'rgba(255,233,184,.5)');
    lg.addColorStop(1, 'rgba(255,233,184,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(96, 522, 46, 0, TAU);
    g.fill();
    g.restore();

    drawCast(g, groundY, p.star === 'chicken', null);

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 5：雪山日出
  // ============================================================
  function drawPine(g, x, y, s, dark) {
    g.save();
    g.translate(x, y);
    // 树干
    g.fillStyle = '#5b4634';
    g.fillRect(-3 * s, -18 * s, 6 * s, 20 * s);
    // 三层树冠
    for (var i = 0; i < 3; i++) {
      var w = (38 - i * 9) * s;
      var top = (-30 - i * 26) * s;
      var bot = (-6 - i * 20) * s;
      g.beginPath();
      g.moveTo(0, top);
      g.lineTo(w * 0.5, bot);
      g.lineTo(-w * 0.5, bot);
      g.closePath();
      g.fillStyle = i === 0 ? dark : shadeColor(dark, 10 + i * 6);
      g.fill();
      // 积雪
      g.beginPath();
      g.moveTo(0, top);
      g.lineTo(w * 0.26, top + (bot - top) * 0.42);
      g.quadraticCurveTo(0, top + (bot - top) * 0.56, -w * 0.26, top + (bot - top) * 0.42);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fill();
    }
    g.restore();
  }

  function drawSnowPeak(g, x, baseY, w, h, P) {
    g.save();
    // 山体：圆润的三角峰
    g.beginPath();
    g.moveTo(x - w / 2, baseY);
    g.quadraticCurveTo(x - w * 0.18, baseY - h * 0.72, x, baseY - h);
    g.quadraticCurveTo(x + w * 0.2, baseY - h * 0.7, x + w / 2, baseY);
    g.closePath();
    var grad = g.createLinearGradient(x - w / 2, baseY - h, x + w / 2, baseY);
    grad.addColorStop(0, '#c2dcef');
    grad.addColorStop(0.48, '#93b8d8');
    grad.addColorStop(1, '#6b90b6');
    g.fillStyle = grad;
    g.fill();

    // 雪顶：裁剪在山体内部，底缘做成参差的雪线
    g.save();
    g.beginPath();
    g.moveTo(x - w / 2, baseY);
    g.quadraticCurveTo(x - w * 0.18, baseY - h * 0.72, x, baseY - h);
    g.quadraticCurveTo(x + w * 0.2, baseY - h * 0.7, x + w / 2, baseY);
    g.closePath();
    g.clip();

    var snowY = baseY - h * 0.62;
    g.beginPath();
    g.moveTo(x - w / 2, snowY + 16);
    var steps = 7;
    for (var i = 0; i <= steps; i++) {
      var px = x - w / 2 + (w * i) / steps;
      var py = snowY + ((i % 2 === 0) ? 0 : 14) + Math.sin(i * 1.7) * 5;
      g.lineTo(px, py);
    }
    g.lineTo(x + w / 2, baseY - h - 20);
    g.lineTo(x - w / 2, baseY - h - 20);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.restore();

    // 背光面
    g.save();
    g.beginPath();
    g.moveTo(x, baseY - h);
    g.quadraticCurveTo(x + w * 0.2, baseY - h * 0.7, x + w / 2, baseY);
    g.lineTo(x + w * 0.02, baseY);
    g.closePath();
    g.fillStyle = 'rgba(86,124,162,.26)';
    g.fill();
    g.restore();

    // 山脊高光
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, baseY - h + 2);
    g.quadraticCurveTo(x - w * 0.1, baseY - h * 0.7, x - w * 0.24, baseY - h * 0.34);
    g.stroke();
    g.restore();
  }

  function drawSnowScene(g, P, p) {
    var rnd = mulberry32(20261211);
    var groundY = 632;

    var sky = g.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#7fb0dc');
    sky.addColorStop(0.5, '#bcd8ee');
    sky.addColorStop(1, '#f0f7ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // 日出暖光
    var sg = g.createRadialGradient(780, 210, 10, 780, 210, 260);
    sg.addColorStop(0, 'rgba(255,226,160,.55)');
    sg.addColorStop(1, 'rgba(255,226,160,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, SCENE_W, 600);
    drawSun(g, 780, 210, 38, P);

    // 远山
    drawSnowPeak(g, 200, 560, 420, 300, P);
    drawSnowPeak(g, 560, 566, 360, 250, P);
    drawSnowPeak(g, 860, 560, 300, 200, P);

    // 中景雪坡
    g.beginPath();
    g.moveTo(0, 560);
    g.quadraticCurveTo(240, 528, 480, 556);
    g.quadraticCurveTo(720, 584, SCENE_W, 548);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var snowGrad = g.createLinearGradient(0, 530, 0, SCENE_H);
    snowGrad.addColorStop(0, '#ffffff');
    snowGrad.addColorStop(1, '#d7e8f7');
    g.fillStyle = snowGrad;
    g.fill();

    // 松树
    drawPine(g, 92, 622, 1.25, '#2c5a48');
    drawPine(g, 148, 634, 0.95, '#2c5a48');
    drawPine(g, 828, 618, 1.35, '#2c5a48');
    drawPine(g, 888, 634, 1.0, '#2c5a48');
    drawPine(g, 730, 640, 0.8, '#2c5a48');

    // 地面雪堆
    ell(g, 420, 700, 120, 26, 0, 'rgba(255,255,255,.75)');
    ell(g, 640, 712, 90, 20, 0, 'rgba(255,255,255,.6)');

    // 雪花
    for (var i = 0; i < 90; i++) {
      var fx = rnd() * SCENE_W;
      var fy = rnd() * SCENE_H;
      var fr = 1 + rnd() * 2.6;
      g.beginPath();
      g.arc(fx, fy, fr, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,' + (0.45 + rnd() * 0.5).toFixed(2) + ')';
      g.fill();
    }

    drawCast(g, groundY, p.star === 'chicken', 'scarf');

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 6：海边度假
  // ============================================================
  function drawPalm(g, x, baseY, s, lean) {
    g.save();
    g.translate(x, baseY);
    // 树干
    g.strokeStyle = '#a8783f';
    g.lineWidth = 13 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(lean * 0.4 * s, -80 * s, lean * s, -152 * s);
    g.stroke();
    // 树干纹路
    g.strokeStyle = 'rgba(120,80,35,.45)';
    g.lineWidth = 2 * s;
    for (var t = 1; t < 9; t++) {
      var ty = -t * 17 * s;
      var tx = lean * Math.pow(t / 9, 1.4) * s;
      g.beginPath();
      g.moveTo(tx - 6 * s, ty);
      g.lineTo(tx + 6 * s, ty - 2 * s);
      g.stroke();
    }
    // 叶子
    var topX = lean * s;
    var topY = -152 * s;
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + (i - 2.5) * 0.52;
      g.save();
      g.translate(topX, topY);
      g.rotate(a);
      var lg = g.createLinearGradient(0, 0, 0, -60 * s);
      lg.addColorStop(0, '#2f8b4a');
      lg.addColorStop(1, '#63c96a');
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(20 * s, -30 * s, 2 * s, -62 * s);
      g.quadraticCurveTo(-18 * s, -30 * s, 0, 0);
      g.fillStyle = lg;
      g.fill();
      g.strokeStyle = 'rgba(30,90,45,.4)';
      g.lineWidth = 1.4 * s;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(1 * s, -58 * s);
      g.stroke();
      g.restore();
    }
    // 椰子
    ell(g, topX - 6 * s, topY + 8 * s, 7 * s, 7 * s, 0, '#8a5a2a');
    ell(g, topX + 7 * s, topY + 10 * s, 6 * s, 6 * s, 0, '#7a4a22');
    g.restore();
  }

  function drawUmbrella(g, x, baseY, s) {
    g.save();
    g.translate(x, baseY);
    // 伞杆
    g.strokeStyle = '#c9a878';
    g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -104 * s);
    g.stroke();
    // 伞面
    var cols = ['#ff8a8a', '#fff4e2', '#ffd166', '#fff4e2', '#7fd4ff', '#fff4e2'];
    for (var i = 0; i < 6; i++) {
      var a0 = Math.PI + i * Math.PI / 6;
      var a1 = Math.PI + (i + 1) * Math.PI / 6;
      g.beginPath();
      g.moveTo(0, -104 * s);
      g.arc(0, -104 * s, 76 * s, a0, a1);
      g.closePath();
      g.fillStyle = cols[i];
      g.fill();
    }
    g.strokeStyle = 'rgba(150,110,70,.35)';
    g.lineWidth = 2 * s;
    g.beginPath();
    g.arc(0, -104 * s, 76 * s, Math.PI, TAU);
    g.stroke();
    g.restore();
  }

  function drawBeachScene(g, P, p) {
    var rnd = mulberry32(20261213);
    var groundY = 656;

    // 天空
    var sky = g.createLinearGradient(0, 0, 0, 460);
    sky.addColorStop(0, '#67c4f0');
    sky.addColorStop(0.6, '#b6e6fb');
    sky.addColorStop(1, '#fff3dd');
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    drawSun(g, 782, 148, 42, P);
    drawCloud(g, 170, 104, 1.05, '#ffffff');
    drawCloud(g, 430, 168, 0.7, '#ffffff');
    drawCloud(g, 646, 118, 0.82, '#ffffff');

    // 海鸥
    for (var b = 0; b < 3; b++) {
      drawBird(g, 300 + b * 44, 210 + b * 18, 0.8 - b * 0.1, 'rgba(80,100,120,.55)');
    }

    // 海面（远景 → 近景颜色逐渐变亮）
    var sea = g.createLinearGradient(0, 336, 0, 566);
    sea.addColorStop(0, '#2b8fc4');
    sea.addColorStop(0.35, '#33a8d3');
    sea.addColorStop(0.75, '#5cc6e0');
    sea.addColorStop(1, '#9fe6e6');
    g.fillStyle = sea;
    g.fillRect(0, 336, SCENE_W, 230);

    // 海平线
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 337);
    g.lineTo(SCENE_W, 337);
    g.stroke();

    // 海浪：越靠前越粗越缓
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.62)';
    for (var w = 0; w < 9; w++) {
      var wy = 352 + w * 24;
      var amp = 4 + w * 0.9;
      g.lineWidth = 1.8 + w * 0.45;
      g.beginPath();
      g.moveTo(-20, wy);
      for (var wx = 0; wx <= SCENE_W + 60; wx += 60) {
        g.quadraticCurveTo(wx + 15, wy - amp, wx + 30, wy);
        g.quadraticCurveTo(wx + 45, wy + amp, wx + 60, wy);
      }
      g.stroke();
    }
    g.restore();

    // 远处帆船
    g.save();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath();
    g.moveTo(232, 344);
    g.lineTo(232, 318);
    g.lineTo(250, 344);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(210,120,90,.8)';
    g.beginPath();
    g.moveTo(222, 345);
    g.lineTo(256, 345);
    g.lineTo(249, 352);
    g.lineTo(229, 352);
    g.closePath();
    g.fill();
    g.restore();

    // 沙滩
    g.beginPath();
    g.moveTo(0, 566);
    g.quadraticCurveTo(240, 548, 480, 568);
    g.quadraticCurveTo(720, 588, SCENE_W, 560);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    var sand = g.createLinearGradient(0, 552, 0, SCENE_H);
    sand.addColorStop(0, '#f7e7c4');
    sand.addColorStop(1, '#e6cf9f');
    g.fillStyle = sand;
    g.fill();

    // 浪花边缘
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, 568);
    g.quadraticCurveTo(240, 550, 480, 570);
    g.quadraticCurveTo(720, 590, SCENE_W, 562);
    g.stroke();

    // 沙粒点
    for (var s = 0; s < 60; s++) {
      var sx = rnd() * SCENE_W;
      var sy = 580 + rnd() * 130;
      g.beginPath();
      g.arc(sx, sy, 1 + rnd() * 1.6, 0, TAU);
      g.fillStyle = 'rgba(190,160,110,.35)';
      g.fill();
    }

    // 椰树 / 遮阳伞 / 沙滩球
    drawPalm(g, 120, 706, 1.15, 46);
    drawUmbrella(g, 842, 700, 1.0);

    ell(g, 700, 706, 16, 16, 0, '#ffffff');
    ell(g, 700, 706, 15, 15, 0, '#ff8a8a');
    g.save();
    g.beginPath();
    g.arc(700, 706, 15, 0, TAU);
    g.clip();
    g.fillStyle = '#fff4e2';
    g.beginPath();
    g.ellipse(700, 706, 15, 5, 0.4, 0, TAU);
    g.fill();
    g.fillStyle = '#7fd4ff';
    g.beginPath();
    g.ellipse(700, 706, 5, 15, 0.2, 0, TAU);
    g.fill();
    g.restore();

    // 贝壳
    drawStarfish(g, 560, 706, 12, '#ffb36b');
    ell(g, 380, 712, 11, 7, -0.2, '#ffe0d0');
    ell(g, 300, 700, 8, 5, 0.3, '#ffd6e8');

    drawCast(g, groundY, p.star === 'chicken', 'shades');

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  场景 7：沙漠绿洲
  // ============================================================
  function drawCactus(g, x, baseY, s, color) {
    g.save();
    g.translate(x, baseY);
    g.fillStyle = color;
    // 主干
    fillRR(g, -10 * s, -96 * s, 20 * s, 96 * s, 10 * s, color);
    // 左臂
    fillRR(g, -30 * s, -70 * s, 12 * s, 44 * s, 6 * s, color);
    fillRR(g, -30 * s, -34 * s, 24 * s, 12 * s, 6 * s, color);
    // 右臂
    fillRR(g, 18 * s, -82 * s, 12 * s, 34 * s, 6 * s, color);
    fillRR(g, 4 * s, -56 * s, 26 * s, 12 * s, 6 * s, color);
    // 纹理
    g.strokeStyle = 'rgba(20,70,40,.3)';
    g.lineWidth = 1.4 * s;
    for (var i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(-3 * s + i * 5 * s, -88 * s);
      g.lineTo(-3 * s + i * 5 * s, -6 * s);
      g.stroke();
    }
    // 花
    ell(g, 0, -100 * s, 5 * s, 4 * s, 0, '#ff8fa8');
    g.restore();
  }

  function drawDune(g, y, amp, color, phase) {
    g.beginPath();
    g.moveTo(0, y + amp);
    g.bezierCurveTo(SCENE_W * 0.22, y - amp, SCENE_W * 0.36, y + amp * 0.6, SCENE_W * 0.55, y - amp * 0.2);
    g.bezierCurveTo(SCENE_W * 0.74, y - amp * 1.1, SCENE_W * 0.86, y + amp * 0.5, SCENE_W, y - amp * 0.3);
    g.lineTo(SCENE_W, SCENE_H);
    g.lineTo(0, SCENE_H);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  function drawMesa(g, x, baseY, w, h, color) {
    // 平顶台地：陡峭崖壁 + 平坦顶部，底部延伸到地平线以下
    var topW = w * 0.52;
    var topX = x - topW / 2;
    var topY = baseY - h;
    var bottom = baseY + 60;

    g.beginPath();
    g.moveTo(x - w / 2, bottom);
    g.lineTo(x - w * 0.34, baseY - h * 0.16);
    g.lineTo(topX - 4, topY + h * 0.05);
    g.lineTo(topX + topW * 0.16, topY);
    g.lineTo(topX + topW * 0.84, topY);
    g.lineTo(topX + topW + 4, topY + h * 0.05);
    g.lineTo(x + w * 0.34, baseY - h * 0.16);
    g.lineTo(x + w / 2, bottom);
    g.closePath();
    g.fillStyle = color;
    g.fill();

    // 崖壁阴影：右侧背光
    g.save();
    g.beginPath();
    g.moveTo(x - w / 2, bottom);
    g.lineTo(x - w * 0.34, baseY - h * 0.16);
    g.lineTo(topX - 4, topY + h * 0.05);
    g.lineTo(topX + topW * 0.16, topY);
    g.lineTo(topX + topW * 0.84, topY);
    g.lineTo(topX + topW + 4, topY + h * 0.05);
    g.lineTo(x + w * 0.34, baseY - h * 0.16);
    g.lineTo(x + w / 2, bottom);
    g.closePath();
    g.clip();

    g.fillStyle = 'rgba(140,82,42,.22)';
    g.beginPath();
    g.moveTo(x + w * 0.1, topY - 6);
    g.lineTo(x + w / 2, bottom);
    g.lineTo(x + w * 0.02, bottom);
    g.closePath();
    g.fill();

    // 不规则的竖向岩缝（不是横条纹，避免像蛋糕）
    g.strokeStyle = 'rgba(140,82,42,.14)';
    g.lineWidth = 2;
    var seams = [-0.28, -0.12, 0.06, 0.2, 0.32];
    for (var i = 0; i < seams.length; i++) {
      var sx = x + w * seams[i];
      g.beginPath();
      g.moveTo(sx, topY + 2);
      g.quadraticCurveTo(sx + 5, topY + h * 0.5, sx - 4, bottom);
      g.stroke();
    }
    g.restore();

    // 顶部台面（受光）
    g.beginPath();
    g.ellipse(x, topY + 2, topW * 0.5, 5, 0, 0, TAU);
    g.fillStyle = 'rgba(255,236,196,.5)';
    g.fill();

    // 顶部的碎石与稀疏灌木
    ell(g, topX + topW * 0.24, topY - 1, 9, 4, 0, 'rgba(150,96,50,.3)');
    ell(g, topX + topW * 0.7, topY - 2, 6, 3, 0, 'rgba(150,96,50,.22)');
    g.strokeStyle = 'rgba(110,100,50,.34)';
    g.lineWidth = 1.6;
    for (var b2 = 0; b2 < 3; b2++) {
      var bx2 = topX + topW * (0.34 + b2 * 0.16);
      g.beginPath();
      g.moveTo(bx2, topY);
      g.lineTo(bx2 - 3, topY - 8);
      g.moveTo(bx2, topY);
      g.lineTo(bx2 + 4, topY - 7);
      g.stroke();
    }
  }

  function drawDesertScene(g, P, p) {
    var rnd = mulberry32(20261215);
    var groundY = 640;

    // 天空
    var sky = g.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#f7a96b');
    sky.addColorStop(0.45, '#ffd39a');
    sky.addColorStop(1, '#fff2d8');
    g.fillStyle = sky;
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // 大太阳
    g.save();
    var sg = g.createRadialGradient(700, 200, 20, 700, 200, 300);
    sg.addColorStop(0, 'rgba(255,225,150,.6)');
    sg.addColorStop(1, 'rgba(255,225,150,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, SCENE_W, 560);
    g.restore();
    drawSun(g, 700, 200, 54, P);

    // 远山（台地）
    // 台地都放在角色两侧的空白区，中间留给角色
    drawMesa(g, 118, 552, 200, 92, '#d9a06a');
    drawMesa(g, 872, 550, 186, 86, '#d9a06a');
    drawMesa(g, 700, 556, 120, 58, '#cf945f');

    // 沙丘三层
    drawDune(g, 540, 34, '#e8c08a', 0);
    drawDune(g, 598, 28, '#dcae74', 1);
    drawDune(g, 652, 22, '#cfa062', 2);

    // 沙子纹理
    g.save();
    g.strokeStyle = 'rgba(180,130,70,.28)';
    g.lineWidth = 1.6;
    for (var i = 0; i < 16; i++) {
      var sy2 = 600 + i * 8;
      g.beginPath();
      g.moveTo(30 + rnd() * 120, sy2);
      g.quadraticCurveTo(300, sy2 - 6, 640 + rnd() * 120, sy2);
      g.stroke();
    }
    g.restore();

    // 仙人掌
    drawCactus(g, 132, 700, 1.25, '#3f8f5a');
    drawCactus(g, 200, 712, 0.85, '#4aa066');
    drawCactus(g, 852, 700, 1.1, '#3f8f5a');

    // 石块
    ell(g, 330, 712, 26, 12, 0, '#b98c58');
    ell(g, 690, 700, 20, 9, 0, '#c49a63');
    ell(g, 760, 716, 14, 7, 0, '#b98c58');

    // 风滚草
    g.save();
    g.translate(480, 690);
    g.strokeStyle = 'rgba(150,110,60,.75)';
    g.lineWidth = 2;
    for (var k = 0; k < 7; k++) {
      g.beginPath();
      g.ellipse(0, 0, 13, 13, k * 0.45, 0, TAU);
      g.stroke();
    }
    g.restore();

    // 秃鹫
    drawBird(g, 300, 150, 1.1, 'rgba(110,80,55,.5)');
    drawBird(g, 356, 126, 0.8, 'rgba(110,80,55,.4)');

    drawCast(g, groundY, p.star === 'chicken', 'hat');

    drawSceneVignette(g, P);
  }

  // ============================================================
  //  入口：按 scene 分发
  // ============================================================
  function drawScene(g, picId) {
    var p = PICS[picId] || PICS.chicken;
    var P = PALETTES[p.pal];

    g.clearRect(0, 0, SCENE_W, SCENE_H);

    switch (p.scene) {
      case 'ocean': drawOceanScene(g, P, p); break;
      case 'space': drawSpaceScene(g, P, p); break;
      case 'city': drawCityScene(g, P, p); break;
      case 'snow': drawSnowScene(g, P, p); break;
      case 'beach': drawBeachScene(g, P, p); break;
      case 'desert': drawDesertScene(g, P, p); break;
      default: drawFarmScene(g, P, p);
    }
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
      var opt = cv.closest('.hp-pic-opt');
      if (!opt) continue;
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