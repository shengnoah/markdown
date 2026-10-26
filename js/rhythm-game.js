/* ============================================================
   Rhythm Game（节奏敲击 - 品牌蓝透明玻璃风格）
   8-bit 背景音乐（Web Audio 合成：方波旋律 + 三角波低音 + 鼓点）
   音符随节拍掉落，按 D / F / J / K 跟随节奏敲击：
   PERFECT(±50ms) / GREAT(±100ms) / GOOD(±160ms) / MISS
   音乐播放、音符下落、判定全部基于 audioCtx.currentTime 统一时钟，
   暂停使用 audioCtx.suspend() —— 时钟冻结，音画无缝恢复。
   ============================================================ */
(function () {
  var app = document.getElementById('rg-app');
  if (!app) return;

  // ---------- 配置 ----------
  var DIFFS = [
    { name: '慢速', bpm: 80 },
    { name: '中速', bpm: 100 },
    { name: '快速', bpm: 120 }
  ];
  var KEYS = ['D', 'F', 'J', 'K'];
  var LANE_COLORS = ['#2d9cdb', '#28a745', '#f5a623', '#e05555'];
  var LANE_LIGHT = ['#9bd4f5', '#8fdca6', '#ffd57e', '#ff9d9d'];
  var TRAVEL = 2.0;                       // 音符下落时长（秒）
  var JUDGE = { perfect: 0.05, great: 0.10, good: 0.16 };
  var SCORE_MAP = { perfect: 100, great: 70, good: 40 };
  var COMBO_BONUS = 2;                    // 每级连击额外加分
  var MAX_LIVES = 5;
  var LOOKAHEAD = 0.15;                   // 音频调度提前量（秒）
  var TIMER_MS = 40;                      // 调度器间隔
  var COUNTDOWN = 3.5;                    // 开始倒计时（秒）

  // ---------- 8-bit 谱面（C 大调，8 小节 × 4 拍 = 32 拍，循环 2 遍） ----------
  // 旋律：{ beat, freq, dur, lane }
  var N = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33,
    C2: 65.41, F2: 87.31, G2: 98.00, A2: 110.00
  };
  var MELODY = [
    // 小节 1：C 和弦上行
    { beat: 0,  f: N.C4, dur: 1, lane: 0 },
    { beat: 1,  f: N.E4, dur: 1, lane: 1 },
    { beat: 2,  f: N.G4, dur: 1, lane: 2 },
    { beat: 3,  f: N.E4, dur: 1, lane: 1 },
    // 小节 2：F 和弦
    { beat: 4,  f: N.F4, dur: 1, lane: 1 },
    { beat: 5,  f: N.A4, dur: 1, lane: 2 },
    { beat: 6,  f: N.C5, dur: 1, lane: 3 },
    { beat: 7,  f: N.A4, dur: 1, lane: 2 },
    // 小节 3：G 和弦
    { beat: 8,  f: N.G4, dur: 1, lane: 2 },
    { beat: 9,  f: N.B4, dur: 1, lane: 3 },
    { beat: 10, f: N.D5, dur: 1, lane: 3 },
    { beat: 11, f: N.B4, dur: 1, lane: 2 },
    // 小节 4：回落
    { beat: 12, f: N.C5, dur: 1, lane: 3 },
    { beat: 13, f: N.G4, dur: 1, lane: 2 },
    { beat: 14, f: N.E4, dur: 1, lane: 1 },
    { beat: 15, f: N.C4, dur: 1, lane: 0 },
    // 小节 5：变化重复
    { beat: 16, f: N.E4, dur: 1, lane: 1 },
    { beat: 17, f: N.G4, dur: 1, lane: 2 },
    { beat: 18, f: N.C5, dur: 1, lane: 3 },
    { beat: 19, f: N.G4, dur: 1, lane: 2 },
    // 小节 6：F 上行
    { beat: 20, f: N.F4, dur: 1, lane: 1 },
    { beat: 21, f: N.A4, dur: 1, lane: 2 },
    { beat: 22, f: N.C5, dur: 1, lane: 3 },
    { beat: 23, f: N.C5, dur: 1, lane: 3 },
    // 小节 7：G 下行
    { beat: 24, f: N.D5, dur: 1, lane: 3 },
    { beat: 25, f: N.B4, dur: 1, lane: 2 },
    { beat: 26, f: N.G4, dur: 1, lane: 2 },
    { beat: 27, f: N.E4, dur: 1, lane: 1 },
    // 小节 8：终止长音（后两拍休止）
    { beat: 28, f: N.C4, dur: 2, lane: 0 },
    { beat: 29, f: N.C4, dur: 2, lane: 0 }
  ];
  // 低音：每小节 1、3 拍
  var BASS = [
    { beat: 0,  f: N.C2 }, { beat: 2,  f: N.C2 },
    { beat: 4,  f: N.F2 }, { beat: 6,  f: N.F2 },
    { beat: 8,  f: N.G2 }, { beat: 10, f: N.G2 },
    { beat: 12, f: N.C2 }, { beat: 14, f: N.G2 },
    { beat: 16, f: N.A2 }, { beat: 18, f: N.A2 },
    { beat: 20, f: N.F2 }, { beat: 22, f: N.F2 },
    { beat: 24, f: N.G2 }, { beat: 26, f: N.G2 },
    { beat: 28, f: N.C2 }, { beat: 30, f: N.C2 }
  ];
  var LOOP_BEATS = 32;   // 单循环拍数
  var LOOPS = 2;         // 循环遍数

  // ---------- 状态 ----------
  var diffIndex = 1;
  var running = false;
  var paused = false;
  var over = false;
  var score = 0;
  var combo = 0;
  var bestCombo = 0;
  var counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  var lives = MAX_LIVES;
  var notes = [];          // 活动音符 {el, time, lane, hit, missed}
  var musicEvents = [];    // 音乐事件 {time, type, freq, dur}
  var totalNotes = 0;
  var songEnd = 0;
  var startTime = 0;       // 音乐起始时刻（audioCtx 时钟）
  var nextMusicIdx = 0;
  var nextNoteIdx = 0;
  var timerId = null;
  var rafId = null;
  var soundOn = true;
  var audioCtx = null;

  // ---------- DOM ----------
  var crt = document.createElement('div');
  crt.className = 'rg-crt';
  app.appendChild(crt);

  var hud = document.createElement('div');
  hud.className = 'rg-hud';
  hud.innerHTML =
    '<div class="rg-hud-group">' +
      '<span class="rg-stat">得分 <strong id="rg-score">0</strong></span>' +
      '<span class="rg-stat">连击 <strong id="rg-combo">0</strong></span>' +
      '<span class="rg-stat">准确率 <strong id="rg-acc">100%</strong></span>' +
      '<span class="rg-stat rg-danger">MISS <strong id="rg-miss">0</strong></span>' +
    '</div>' +
    '<div class="rg-stat">生命 <span class="rg-lives" id="rg-lives"></span></div>';
  crt.appendChild(hud);

  var controls = document.createElement('div');
  controls.className = 'rg-controls';
  crt.appendChild(controls);

  var screen = document.createElement('div');
  screen.className = 'rg-screen';
  crt.appendChild(screen);

  // 轨道容器
  var lanesWrap = document.createElement('div');
  lanesWrap.className = 'rg-lanes';
  screen.appendChild(lanesWrap);

  var laneEls = [];
  var keyEls = [];
  for (var li = 0; li < 4; li++) {
    var lane = document.createElement('div');
    lane.className = 'rg-lane';
    lane.style.setProperty('--lane-color', LANE_COLORS[li]);
    lanesWrap.appendChild(lane);
    laneEls.push(lane);

    var key = document.createElement('div');
    key.className = 'rg-key';
    key.textContent = KEYS[li];
    key.style.setProperty('--lane-color', LANE_COLORS[li]);
    lane.appendChild(key);
    keyEls.push(key);
  }

  // 判定线
  var hitLine = document.createElement('div');
  hitLine.className = 'rg-hitline';
  screen.appendChild(hitLine);

  // 进度条
  var progress = document.createElement('div');
  progress.className = 'rg-progress';
  progress.innerHTML = '<div class="rg-progress-bar" id="rg-progress-bar"></div>';
  screen.appendChild(progress);

  var overlay = document.createElement('div');
  overlay.className = 'rg-overlay';
  screen.appendChild(overlay);

  var elScore = hud.querySelector('#rg-score');
  var elCombo = hud.querySelector('#rg-combo');
  var elAcc = hud.querySelector('#rg-acc');
  var elMiss = hud.querySelector('#rg-miss');
  var elLives = hud.querySelector('#rg-lives');
  var elProgressBar = progress.querySelector('#rg-progress-bar');

  // ---------- 音频 ----------
  function ensureAudio() {
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended' && !paused) {
      audioCtx.resume();
    }
  }

  // 合成音：指定 audioCtx 时钟的精确时刻播放
  function playTone(freq, when, dur, type, vol) {
    if (!soundOn || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(vol || 0.06, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    } catch (e) { /* 忽略 */ }
  }

  // 底鼓：低频快速下滑
  function playKick(when) {
    if (!soundOn || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      gain.gain.setValueAtTime(0.16, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(when);
      osc.stop(when + 0.16);
    } catch (e) { /* 忽略 */ }
  }

  // 踩镲：高频短促方波
  function playHat(when) {
    if (!soundOn || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(7000, when);
      gain.gain.setValueAtTime(0.025, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(when);
      osc.stop(when + 0.06);
    } catch (e) { /* 忽略 */ }
  }

  // 击打音效（随判定等级）
  function sfxHit(level) {
    if (!soundOn || !audioCtx) return;
    var now = audioCtx.currentTime;
    if (level === 'perfect') {
      playTone(1046, now, 0.06, 'square', 0.05);
      playTone(1568, now + 0.03, 0.08, 'square', 0.04);
    } else if (level === 'great') {
      playTone(784, now, 0.06, 'square', 0.05);
    } else {
      playTone(523, now, 0.06, 'triangle', 0.05);
    }
  }

  function sfxMiss() {
    if (!soundOn || !audioCtx) return;
    var now = audioCtx.currentTime;
    playTone(180, now, 0.12, 'sawtooth', 0.05);
    playTone(120, now + 0.06, 0.16, 'sawtooth', 0.05);
  }

  function sfxOver() {
    if (!soundOn || !audioCtx) return;
    var now = audioCtx.currentTime;
    playTone(523, now, 0.14, 'square', 0.06);
    playTone(392, now + 0.15, 0.14, 'square', 0.06);
    playTone(330, now + 0.30, 0.14, 'square', 0.06);
    playTone(262, now + 0.45, 0.4, 'square', 0.07);
  }

  // ---------- 控制按钮 ----------
  var diffLabel = document.createElement('span');
  diffLabel.className = 'rg-diff-label';
  diffLabel.textContent = '速度:';
  controls.appendChild(diffLabel);

  var diffBtns = DIFFS.map(function (d, i) {
    var b = document.createElement('button');
    b.className = 'rg-diff-btn' + (i === diffIndex ? ' active' : '');
    b.type = 'button';
    b.textContent = d.name + ' ' + d.bpm + 'BPM';
    b.addEventListener('click', function () {
      diffIndex = i;
      diffBtns.forEach(function (btn, j) {
        btn.classList.toggle('active', j === i);
      });
    });
    controls.appendChild(b);
    return b;
  });

  var soundBtn = document.createElement('button');
  soundBtn.className = 'rg-btn rg-sound-btn';
  soundBtn.type = 'button';
  soundBtn.textContent = '🔊';
  soundBtn.title = '声音开关';
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !soundOn);
  });
  controls.appendChild(soundBtn);

  var pauseBtn = document.createElement('button');
  pauseBtn.className = 'rg-btn';
  pauseBtn.type = 'button';
  pauseBtn.textContent = '暂停';
  pauseBtn.addEventListener('click', function () {
    if (running && !over) togglePause();
  });
  controls.appendChild(pauseBtn);

  // ---------- HUD ----------
  function renderLives() {
    elLives.innerHTML = '';
    for (var i = 0; i < MAX_LIVES; i++) {
      var d = document.createElement('span');
      d.className = 'rg-life' + (i < lives ? '' : ' lost');
      elLives.appendChild(d);
    }
  }

  function accuracy() {
    var judged = counts.perfect + counts.great + counts.good + counts.miss;
    if (judged === 0) return 100;
    return Math.round((counts.perfect * 100 + counts.great * 70 + counts.good * 40) /
      (judged * 100) * 100);
  }

  function renderHud() {
    elScore.textContent = score;
    elCombo.textContent = combo;
    elAcc.textContent = accuracy() + '%';
    elMiss.textContent = counts.miss;
    elCombo.classList.toggle('hot', combo >= 10);
  }

  // ---------- 最高分 ----------
  function loadBest() {
    try {
      return parseInt(localStorage.getItem('rg-best-' + diffIndex) || '0', 10) || 0;
    } catch (e) { return 0; }
  }

  function saveBest(v) {
    try { localStorage.setItem('rg-best-' + diffIndex, String(v)); } catch (e) {}
  }

  // ---------- 覆盖层 ----------
  function showStart() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="rg-title">节奏敲击</h2>' +
      '<p class="rg-subtitle">8-bit 音乐响起后，音符会沿四条轨道<strong>随节拍掉落</strong>。<br>' +
      '当音符到达底部<strong>判定线</strong>时，按下对应轨道按键 <strong>D / F / J / K</strong>。<br>' +
      '踩点越准得分越高：<strong class="rg-jp">PERFECT</strong> ±50ms ／ <strong class="rg-jg">GREAT</strong> ±100ms ／ ' +
      '<strong class="rg-jgd">GOOD</strong> ±160ms，错过即 <strong class="rg-jm">MISS</strong> 并损失生命。</p>' +
      '<p class="rg-best-line">🏆 当前速度最高分 <strong>' + loadBest() + '</strong></p>' +
      '<button class="rg-btn rg-blink" id="rg-start" type="button">▶ 开始演奏</button>';
    overlay.querySelector('#rg-start').addEventListener('click', startGame);
  }

  function showPause() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="rg-title">已暂停</h2>' +
      '<p class="rg-subtitle rg-blink">按 Esc 或点击按钮继续</p>' +
      '<button class="rg-btn" id="rg-resume" type="button">继续</button>';
    overlay.querySelector('#rg-resume').addEventListener('click', togglePause);
  }

  function rankOf(acc) {
    if (acc >= 95) return 'S';
    if (acc >= 88) return 'A';
    if (acc >= 75) return 'B';
    if (acc >= 60) return 'C';
    return 'D';
  }

  function showOver(failed) {
    var acc = accuracy();
    var best = loadBest();
    var isNew = score > best;
    if (isNew) { best = score; saveBest(best); }
    overlay.hidden = false;
    overlay.innerHTML =
      '<h2 class="rg-title">' + (failed ? '💔 演奏中断' : '🎼 演奏完成!') + '</h2>' +
      '<div class="rg-rank rank-' + rankOf(acc) + '">' + rankOf(acc) + '</div>' +
      '<p class="rg-final">得分 <strong>' + score + '</strong>　准确率 <strong>' + acc + '%</strong>' +
      '　最大连击 <strong>' + bestCombo + '</strong><br>' +
      '<span class="rg-jp">PERFECT ' + counts.perfect + '</span>　' +
      '<span class="rg-jg">GREAT ' + counts.great + '</span>　' +
      '<span class="rg-jgd">GOOD ' + counts.good + '</span>　' +
      '<span class="rg-jm">MISS ' + counts.miss + '</span><br>' +
      '历史最高分 <strong>' + best + '</strong>' + (isNew ? ' 🏆 新纪录!' : '') + '</p>' +
      '<button class="rg-btn" id="rg-restart" type="button">↻ 再来一次</button>';
    overlay.querySelector('#rg-restart').addEventListener('click', startGame);
  }

  // ---------- 时间轴构建 ----------
  function buildTimeline() {
    var bpm = DIFFS[diffIndex].bpm;
    var spb = 60 / bpm;   // 每拍秒数
    musicEvents = [];
    notes = [];
    totalNotes = 0;

    for (var loop = 0; loop < LOOPS; loop++) {
      var base = loop * LOOP_BEATS;
      // 旋律（同时生成游戏音符）
      for (var i = 0; i < MELODY.length; i++) {
        var m = MELODY[i];
        var t = (base + m.beat) * spb;
        musicEvents.push({ time: t, type: 'melody', freq: m.f, dur: m.dur * spb * 0.9 });
        notes.push({ time: t, lane: m.lane, hit: false, missed: false, el: null, spawned: false });
        totalNotes++;
      }
      // 低音
      for (var j = 0; j < BASS.length; j++) {
        var b = BASS[j];
        musicEvents.push({ time: (base + b.beat) * spb, type: 'bass', freq: b.f, dur: spb * 0.8 });
      }
      // 鼓：kick 1/3 拍，hihat 2/4 拍（每拍都有）
      for (var beat = 0; beat < LOOP_BEATS; beat++) {
        var bt = (base + beat) * spb;
        if (beat % 2 === 0) {
          musicEvents.push({ time: bt, type: 'kick' });
        } else {
          musicEvents.push({ time: bt, type: 'hat' });
        }
      }
    }
    musicEvents.sort(function (a, b) { return a.time - b.time; });
    songEnd = LOOPS * LOOP_BEATS * spb + 1.5;
  }

  // ---------- 游戏流程 ----------
  function startGame() {
    ensureAudio();
    if (!audioCtx) {
      overlay.hidden = false;
      overlay.innerHTML = '<h2 class="rg-title">无法启动</h2>' +
        '<p class="rg-subtitle">当前浏览器不支持 Web Audio，无法演奏。</p>';
      return;
    }
    // 清场
    notes.forEach(function (n) { if (n.el) n.el.remove(); });
    buildTimeline();
    score = 0;
    combo = 0;
    bestCombo = 0;
    counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    lives = MAX_LIVES;
    over = false;
    paused = false;
    running = true;
    nextMusicIdx = 0;
    nextNoteIdx = 0;
    renderHud();
    renderLives();
    overlay.hidden = true;
    pauseBtn.textContent = '暂停';

    // 倒计时后音乐开始
    startTime = audioCtx.currentTime + COUNTDOWN;
    var cd = 3;
    var cdTimer = setInterval(function () {
      if (!running || over) { clearInterval(cdTimer); return; }
      if (cd > 0) {
        playTone(440, audioCtx.currentTime, 0.1, 'square', 0.06);
        bigText(String(cd), 'rg-big-count');
        cd--;
      } else {
        clearInterval(cdTimer);
        playTone(880, audioCtx.currentTime, 0.2, 'square', 0.07);
        bigText('GO!', 'rg-big-count');
      }
    }, 1000);

    if (timerId) clearInterval(timerId);
    timerId = setInterval(schedulerTick, TIMER_MS);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(render);
  }

  function togglePause() {
    if (!running || over) return;
    paused = !paused;
    if (paused) {
      if (audioCtx) audioCtx.suspend();   // 时钟冻结，音画同步暂停
      showPause();
      pauseBtn.textContent = '继续';
    } else {
      if (audioCtx) audioCtx.resume();
      overlay.hidden = true;
      pauseBtn.textContent = '暂停';
    }
  }

  function endGame(failed) {
    running = false;
    over = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    sfxOver();
    showOver(failed);
  }

  // ---------- 调度器（音乐播放 + 音符生成 + MISS 检测） ----------
  function schedulerTick() {
    if (!running || paused || over) return;
    var now = audioCtx.currentTime;
    var songNow = now - startTime;

    // 1. 音乐事件：进入 LOOKAHEAD 窗口即精确调度
    while (nextMusicIdx < musicEvents.length &&
           musicEvents[nextMusicIdx].time < songNow + LOOKAHEAD) {
      var ev = musicEvents[nextMusicIdx];
      var when = startTime + ev.time;
      if (ev.type === 'melody') playTone(ev.freq, when, ev.dur, 'square', 0.055);
      else if (ev.type === 'bass') playTone(ev.freq, when, ev.dur, 'triangle', 0.09);
      else if (ev.type === 'kick') playKick(when);
      else if (ev.type === 'hat') playHat(when);
      nextMusicIdx++;
    }

    // 2. 音符 DOM：提前 TRAVEL 秒生成
    while (nextNoteIdx < notes.length &&
           notes[nextNoteIdx].time < songNow + TRAVEL) {
      spawnNote(notes[nextNoteIdx]);
      nextNoteIdx++;
    }

    // 3. MISS 检测：超过 GOOD 窗口未击
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.hit || n.missed || !n.spawned) continue;
      if (songNow - n.time > JUDGE.good) missNote(n);
    }

    // 4. 曲终
    if (songNow > songEnd && !over) endGame(false);
  }

  // ---------- 音符 ----------
  function spawnNote(note) {
    note.spawned = true;
    var el = document.createElement('div');
    el.className = 'rg-note';
    el.style.setProperty('--lane-color', LANE_COLORS[note.lane]);
    laneEls[note.lane].appendChild(el);
    note.el = el;
  }

  function removeNote(note) {
    if (note.el) {
      note.el.remove();
      note.el = null;
    }
  }

  function missNote(note) {
    note.missed = true;
    counts.miss++;
    combo = 0;
    lives--;
    sfxMiss();
    popJudge(note.lane, 'MISS');
    shakeScreen();
    renderHud();
    renderLives();
    removeNote(note);
    if (lives <= 0) endGame(true);
  }

  // ---------- 判定 ----------
  function judge(lane) {
    if (!running || paused || over) return;
    var now = audioCtx.currentTime;
    var songNow = now - startTime;

    // 找该轨道时间最近的未击音符
    var best = null;
    var bestDiff = Infinity;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.hit || n.missed || n.lane !== lane) continue;
      var diff = Math.abs(songNow - n.time);
      if (diff < bestDiff) { bestDiff = diff; best = n; }
    }

    if (best && bestDiff <= JUDGE.good) {
      best.hit = true;
      var level;
      if (bestDiff <= JUDGE.perfect) level = 'perfect';
      else if (bestDiff <= JUDGE.great) level = 'great';
      else level = 'good';

      counts[level]++;
      combo++;
      if (combo > bestCombo) bestCombo = combo;
      var gain = SCORE_MAP[level] + (combo - 1) * COMBO_BONUS;
      score += gain;
      sfxHit(level);
      popJudge(lane, level.toUpperCase());
      burstParticles(lane, LANE_COLORS[lane], level === 'perfect' ? 10 : 6);
      renderHud();
      removeNote(best);
    }
    // 空按不惩罚（节奏游戏惯例）
  }

  // ---------- 特效 ----------
  function popJudge(lane, text) {
    var p = document.createElement('div');
    p.className = 'rg-judge j-' + text.toLowerCase();
    p.textContent = text;
    laneEls[lane].appendChild(p);
    setTimeout(function () { p.remove(); }, 620);
  }

  function bigText(text, cls) {
    var b = document.createElement('div');
    b.className = 'rg-big' + (cls ? ' ' + cls : '');
    b.textContent = text;
    screen.appendChild(b);
    setTimeout(function () { b.remove(); }, 900);
  }

  function burstParticles(lane, color, count) {
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'rg-particle';
      p.style.background = color;
      p.style.setProperty('--lane-color', color);
      var size = 4 + Math.random() * 5;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      var angle = Math.random() * Math.PI * 2;
      var dist = 24 + Math.random() * 44;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      laneEls[lane].appendChild(p);
      (function (el) {
        setTimeout(function () { el.remove(); }, 560);
      })(p);
    }
  }

  function shakeScreen() {
    screen.classList.remove('rg-shake');
    void screen.offsetWidth;
    screen.classList.add('rg-shake');
    setTimeout(function () { screen.classList.remove('rg-shake'); }, 380);
  }

  // ---------- 渲染循环（音符位置 + 进度条） ----------
  function render() {
    if (!running || over) return;
    rafId = requestAnimationFrame(render);
    if (paused) return;

    var now = audioCtx.currentTime;
    var songNow = now - startTime;
    var laneH = lanesWrap.clientHeight;
    var hitY = laneH - 72;   // 判定线位置（距底 72px）

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (!n.spawned || n.hit || n.missed) continue;
      var progress = (songNow - (n.time - TRAVEL)) / TRAVEL;  // 0 → 1
      var y = progress * hitY;
      n.el.style.transform = 'translateY(' + y + 'px)';
    }

    // 进度条
    var pct = Math.max(0, Math.min(100, songNow / (songEnd - 1.5) * 100));
    elProgressBar.style.width = pct + '%';
  }

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (running && !over) togglePause();
      return;
    }
    if (!running || paused || over) return;
    var ch = e.key.toUpperCase();
    var lane = KEYS.indexOf(ch);
    if (lane === -1) return;
    ensureAudio();
    // 键帽按下反馈
    keyEls[lane].classList.add('pressed');
    setTimeout(function () { keyEls[lane].classList.remove('pressed'); }, 110);
    judge(lane);
  });

  // ---------- 启动 ----------
  renderHud();
  renderLives();
  showStart();
})();
