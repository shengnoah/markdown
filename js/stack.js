// C 代码用于教学展示；对应操作由 JavaScript 模型执行，并非 C 编译执行。
(() => {
  'use strict';
  const SOURCE = `#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#define MAX_CAPACITY 8
typedef struct {
    char data[MAX_CAPACITY][13];
    int top, capacity;
} Stack;

bool push(Stack *s, const char *value) {
    if (s->top + 1 >= s->capacity) return false;
    ++s->top;
    snprintf(s->data[s->top], 13, "%s", value);
    return true;
}
bool pop(Stack *s, char out[13]) {
    if (s->top < 0) return false;
    strcpy(out, s->data[s->top]);
    --s->top;
    return true;
}
bool peek(const Stack *s, char out[13]) {
    if (s->top < 0) return false;
    strcpy(out, s->data[s->top]);
    return true;
}
void clear(Stack *s) {
    s->top = -1;
}`;
  class Stack {
    constructor(capacity = 6) {
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new Error('容量必须为 1–8 的整数');
      this.capacity = capacity; this.items = [];
    }
    push(value) { if (this.items.length >= this.capacity) throw new Error('栈满：上溢'); this.items.push(value); }
    pop() { if (!this.items.length) throw new Error('栈空：下溢'); return this.items.pop(); }
    peek() { if (!this.items.length) throw new Error('栈空：没有栈顶'); return this.items[this.items.length - 1]; }
    clear() { this.items.length = 0; }
  }
  const DEMO = [['push', '10'], ['push', '20'], ['push', '30'], ['peek'], ['pop'], ['push', '40'], ['pop'], ['pop'], ['pop'], ['pop']];
  if (typeof module !== 'undefined' && module.exports) module.exports = { Stack, DEMO, SOURCE };
  if (typeof document === 'undefined') return;
  const el = name => document.getElementById('st-' + name);
  if (!el('stack')) return;
  const rows = [];
  SOURCE.split('\n').forEach((source, i) => {
    const row = document.createElement('div'); row.className = 'st-code-line';
    const n = document.createElement('span'); n.className = 'st-ln'; n.textContent = i + 1;
    const text = document.createElement('span'); text.textContent = source;
    row.append(n, text); el('code').append(row); rows.push(row);
  });
  let stack, count = 0, history = [], busy = false, playing = false, demoActive = false, demoIndex = 0;
  let timer, animationTimer, generation = 0, result = '—';
  function controls() {
    ['push', 'pop', 'peek', 'clear', 'capacity', 'value'].forEach(name => el(name).disabled = busy || demoActive);
    el('play').disabled = playing || busy;
    el('step').disabled = playing || busy;
    el('pause').disabled = !playing;
    el('progress').textContent = demoActive ? `示例进度 ${demoIndex} / ${DEMO.length}（${playing ? '播放中' : '已暂停'}）` : demoIndex === DEMO.length ? '示例完成 10 / 10。' : '启动示例会清空当前栈；单步执行一个栈操作。';
  }
  function render(effect) {
    el('stack').replaceChildren(); el('array').replaceChildren();
    el('array').style.setProperty('--capacity', stack.capacity);
    const top = stack.items.length - 1;
    for (let i = stack.capacity - 1; i >= 0; i--) {
      const slot = document.createElement('div'); slot.className = 'st-slot';
      if (i <= top) slot.classList.add('filled'); if (i === top) slot.classList.add('top');
      if (effect?.index === i) slot.classList.add(effect.type);
      const index = document.createElement('span'); index.className = 'st-index'; index.textContent = i;
      const value = document.createElement('span'); value.textContent = effect?.type === 'pop' && effect.index === i ? effect.value : stack.items[i] ?? '·';
      slot.append(index, value);
      if (i === top) { const marker = document.createElement('span'); marker.className = 'st-marker'; marker.textContent = '← top'; slot.append(marker); }
      el('stack').append(slot);
    }
    for (let i = 0; i < stack.capacity; i++) {
      const item = document.createElement('div'); item.className = 'st-array-item' + (i === top ? ' top' : '');
      const value = document.createElement('b'); value.textContent = stack.items[i] ?? '—'; value.title = value.textContent;
      const index = document.createElement('span'); index.textContent = '[' + i + ']';
      item.append(value, index); el('array').append(item);
    }
    el('size').textContent = stack.items.length; el('top').textContent = top;
    el('limit').textContent = stack.capacity; el('count').textContent = count; el('result').textContent = result;
    el('status').textContent = top < 0 ? 'EMPTY' : stack.items.length === stack.capacity ? 'FULL' : 'READY';
    el('stack').setAttribute('aria-label', `从栈底到栈顶：${stack.items.join(', ') || '空栈'}`);
    controls();
  }
  function highlight(line) {
    rows.forEach((row, i) => row.classList.toggle('active', i + 1 === line));
    el('line').textContent = line ? 'C LINE ' + line : 'READY';
    if (line) el('code').scrollTop = Math.max(0, rows[line - 1].offsetTop - el('code').clientHeight / 2);
  }
  function operate(type, value) {
    if (busy) return;
    let effect, line, message, error = false;
    const top = stack.items.length - 1;
    try {
      if (type === 'push') { stack.push(value); result = '—'; effect = { type: 'push', index: top + 1 }; line = 13; message = `入栈 ${value}，top=${top + 1}，push 返回 true。`; }
      else if (type === 'pop') { result = stack.pop(); effect = { type: 'pop', index: top, value: result }; line = 19; message = `出栈 ${result}，top=${top - 1}，pop 返回 true。`; }
      else if (type === 'peek') { result = stack.peek(); effect = { type: 'peek', index: top }; line = 24; message = `读取栈顶 ${result}，节点数不变，peek 返回 true。`; }
      else { stack.clear(); result = '—'; line = 28; message = '清空完成，top=-1。'; }
      count++;
    } catch (err) { error = true; result = 'false'; line = type === 'push' ? 11 : type === 'pop' ? 17 : 23; message = err.message + '，对应 C 函数返回 false，数据不变。'; }
    history.push(`${history.length + 1}. ${type} ${value ?? ''} → ${message}`);
    el('log').textContent = history.slice(-100).join('\n'); el('log').scrollTop = el('log').scrollHeight;
    el('message').textContent = message; el('message').classList.toggle('error', error);
    highlight(line); busy = true; render(effect);
    const token = generation;
    animationTimer = setTimeout(() => { if (token !== generation) return; busy = false; render(); if (playing) schedule(); }, 300);
  }
  function reset() {
    generation++; clearTimeout(timer); clearTimeout(animationTimer);
    stack = new Stack(Number(el('capacity').value)); count = demoIndex = 0; history = [];
    busy = playing = demoActive = false; result = '—';
    el('log').textContent = ''; el('message').textContent = '栈已初始化。C 代码用于展示，JavaScript 模拟对应操作。'; el('message').classList.remove('error'); highlight(0); render();
  }
  function demoStep() {
    if (demoIndex >= DEMO.length) { playing = demoActive = false; render(); return; }
    const [type, value] = DEMO[demoIndex++]; operate(type, value);
  }
  function schedule() {
    clearTimeout(timer); const token = generation;
    timer = setTimeout(() => { if (token === generation && playing && !busy) demoStep(); }, Math.max(0, Number(el('speed').value) - 300));
  }
  function demoStart(auto) {
    if (!demoActive) { reset(); demoActive = true; }
    playing = auto; demoStep();
  }
  el('form').addEventListener('submit', e => { e.preventDefault(); const value = el('value').value.trim(); if (!busy && !demoActive && value) operate('push', value); });
  ['pop', 'peek', 'clear'].forEach(type => el(type).addEventListener('click', () => operate(type)));
  el('play').addEventListener('click', () => demoStart(true)); el('step').addEventListener('click', () => demoStart(false));
  el('pause').addEventListener('click', () => { playing = false; clearTimeout(timer); controls(); });
  el('reset').addEventListener('click', reset); el('capacity').addEventListener('change', reset);
  el('speed').addEventListener('input', () => el('speed-value').textContent = el('speed').value + 'ms');
  window.addEventListener('pagehide', () => { generation++; clearTimeout(timer); clearTimeout(animationTimer); });
  reset();
})();
