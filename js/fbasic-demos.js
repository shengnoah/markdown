// FBASIC 程序及共享逐行执行器。算法只存在于下方 BASIC 源码中。
(() => {
  'use strict';
  const queens = `10 DIM Q(8)
20 R = 1
30 C = 0
40 S = 0
50 A = 0
60 B = 0
70 T = 0
100 C = C + 1
110 IF C > 8 THEN 400
120 A = A + 1
130 J = 1
140 IF J >= R THEN 250
150 IF Q(J) = C THEN 210
160 IF ABS(Q(J) - C) = R - J THEN 210
170 J = J + 1
180 GOTO 140
210 B = B + 1
220 GOTO 100
250 Q(R) = C
260 IF R = 8 THEN 350
270 R = R + 1
280 C = 0
290 GOTO 100
350 S = S + 1
360 PRINT "SOLUTION "; S
370 GOTO 100
400 Q(R) = 0
410 R = R - 1
420 IF R = 0 THEN 500
430 C = Q(R)
440 Q(R) = 0
450 T = T + 1
460 GOTO 100
500 PRINT "TOTAL "; S
510 END`;
  const stackInit = `10 DIM A$(8)
20 TOP = -1
30 COUNT = 0
40 END`;
  const stack = `10 ERR = 0
20 RES$ = "-"
30 IF OP = 1 THEN 100
40 IF OP = 2 THEN 200
50 IF OP = 3 THEN 300
60 TOP = -1
70 COUNT = COUNT + 1
80 GOTO 900
100 IF TOP >= CAP - 1 THEN 800
110 TOP = TOP + 1
120 A$(TOP) = V$
130 COUNT = COUNT + 1
140 GOTO 900
200 IF TOP < 0 THEN 810
210 RES$ = A$(TOP)
220 A$(TOP) = ""
230 TOP = TOP - 1
240 COUNT = COUNT + 1
250 GOTO 900
300 IF TOP < 0 THEN 810
310 RES$ = A$(TOP)
320 COUNT = COUNT + 1
330 GOTO 900
800 ERR = 1
805 GOTO 900
810 ERR = 2
900 PRINT "OP="; OP; " TOP="; TOP; " RESULT="; RES$; " ERROR="; ERR
910 END`;
  const listInit = `10 DIM V$(12), NX(12), USED(12)
20 H = 0
30 SIZE = 0
40 END`;
  const list = `10 ERR = 0
20 RES$ = "-"
30 VISITS = 0
40 P = 0
50 C = H
60 N = 0
70 IF OP = 3 THEN 500
80 IF OP = 4 THEN 600
90 IF IDX < 0 THEN 800
100 IF IDX <> INT(IDX) THEN 800
110 IF OP = 1 THEN 150
120 IF IDX >= SIZE THEN 800
130 GOTO 170
150 IF IDX > SIZE THEN 800
160 IF SIZE >= 12 THEN 810
170 I = 0
180 IF I >= IDX THEN 250
190 P = C
200 C = NX(C)
210 I = I + 1
220 VISITS = VISITS + 1
230 GOTO 180
250 IF OP = 2 THEN 400
260 N = 1
270 IF USED(N) = 0 THEN 300
280 N = N + 1
290 GOTO 270
300 V$(N) = VALUE$
310 USED(N) = 1
320 NX(N) = C
330 IF P = 0 THEN 360
340 NX(P) = N
350 GOTO 370
360 H = N
370 SIZE = SIZE + 1
380 RES$ = STR$(N)
390 GOTO 900
400 RES$ = V$(C)
410 IF P = 0 THEN 440
420 NX(P) = NX(C)
430 GOTO 450
440 H = NX(C)
450 NX(C) = 0
460 USED(C) = 0
470 SIZE = SIZE - 1
480 GOTO 900
500 I = 0
510 IF C = 0 THEN 570
520 VISITS = VISITS + 1
530 IF V$(C) = VALUE$ THEN 580
540 C = NX(C)
550 I = I + 1
560 GOTO 510
570 I = -1
580 RES$ = STR$(I)
590 GOTO 900
600 IF C = 0 THEN 670
610 N = NX(C)
620 VISITS = VISITS + 1
630 NX(C) = P
640 P = C
650 C = N
660 GOTO 600
670 H = P
680 RES$ = "OK"
690 GOTO 900
800 ERR = 1
805 GOTO 900
810 ERR = 2
900 PRINT "SIZE="; SIZE; " RESULT="; RES$; " ERROR="; ERR
910 END`;

  class Execution {
    constructor(Interpreter, screen) { this.fb = new Interpreter(screen); this.steps = 0; }
    start(source, input = {}, preserve = true) {
      const variables = this.fb.variables;
      const arrays = this.fb.arrays;
      this.epoch = (this.epoch || 0) + 1;
      this.fb.load(source);
      if (preserve) { this.fb.variables = variables; this.fb.arrays = arrays; }
      for (const [name, value] of Object.entries(input)) this.fb.setVariable(name, value);
      this.fb.running = true;
      this.steps = 0;
    }
    async next() {
      const fb = this.fb;
      if (!fb.running || fb.pc >= fb.program.length) return null;
      if (++this.steps > 500000) throw new Error('演示执行超出安全步数限制');
      const current = fb.program[fb.pc];
      const pc = fb.pc;
      const epoch = this.epoch;
      await fb.executeStatement(current.code, current.number);
      if (epoch !== this.epoch) return null;
      if (fb.pc === pc) fb.pc++;
      if (fb.pc >= fb.program.length) fb.running = false;
      return current.number;
    }
    async drain() { while (await this.next() !== null) {} }
  }
  function code(element, source, prefix) {
    const rows = new Map();
    element.replaceChildren();
    for (const text of source.split('\n')) {
      const [number, ...parts] = text.split(' ');
      const row = document.createElement('div'); row.className = prefix + '-code-line';
      const n = document.createElement('span'); n.className = prefix + '-ln'; n.textContent = number;
      const s = document.createElement('span'); s.textContent = parts.join(' ');
      row.append(n, s); element.append(row); rows.set(Number(number), row);
    }
    return line => {
      rows.forEach((row, n) => row.classList.toggle('active', n === line));
      const row = rows.get(line);
      if (row) element.scrollTop = Math.max(0, row.offsetTop - element.clientHeight / 2);
    };
  }
  // 每次最多一个解释器语句在执行；暂停和重置均使旧异步任务失效。
  class Player {
    constructor(execution, speed, update, done, error) {
      Object.assign(this, { execution, speed, update, done, error });
      this.token = 0; this.playing = false; this.fast = false; this.timer = null;
    }
    stop() { this.token++; clearTimeout(this.timer); this.playing = this.fast = false; }
    async step(auto = false) {
      if (this.pending) return;
      this.pending = true;
      const token = this.token;
      try {
        const line = await this.execution.next();
        if (token !== this.token) return;
        if (line === null) { this.stop(); this.done(); return; }
        this.update(line);
        if (!this.execution.fb.running) { this.stop(); this.done(); return; }
        if (auto && this.playing) this.timer = setTimeout(() => this.step(true), this.speed());
      } catch (err) { if (token === this.token) { this.stop(); this.error(err); } }
      finally { this.pending = false; }
    }
    play() { this.stop(); this.playing = true; this.step(true); }
    single() { this.stop(); this.step(); }
    quick() {
      this.stop(); this.playing = this.fast = true;
      const token = this.token;
      const batch = async () => {
        try {
          for (let i = 0; i < 300 && token === this.token; i++) {
            const line = await this.execution.next();
            if (token !== this.token) return;
            if (line === null) { this.stop(); this.done(); return; }
            this.update(line);
          }
          if (token === this.token) this.timer = setTimeout(batch, 0);
        } catch (err) { if (token === this.token) { this.stop(); this.error(err); } }
      };
      batch();
    }
  }
  const api = { queens, stackInit, stack, listInit, list, Execution, Player, code };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FBasicDemos = api;
})();
