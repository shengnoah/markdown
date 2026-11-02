// C 教学代码和 JavaScript 对应模型；浏览器不会编译或执行 C。
(() => {
  'use strict';
  const GUIDE_HEADER = `#include <stdlib.h>   // 声明 malloc / free，用于分配和释放节点
#include <stdbool.h>  // 提供 bool、true、false（C99 起）
#include <stdio.h>    // 声明 snprintf，用于向缓冲区写入字符串
#include <string.h>   // 声明 strcpy / strcmp，用于复制和比较字符串
typedef struct Node { // 将节点结构体命名为 Node
    char value[13];   // 最多 12 字节内容，另留 1 字节给字符串结束符
    struct Node *next; // 保存后继节点的地址；NULL 表示没有后继
} Node;`;
  const GUIDE_CODE = {
    insert: `bool insert(Node **head, int index, const char *value) { // 位置从 0 开始；通过二级指针修改头指针
    if (index < 0) return false; // 拒绝负数位置，不改变链表
    Node **link = head; // link 指向 head 或前驱的 next 字段，*link 是当前位置的节点
    for (int i = 0; i < index; ++i) { // 沿链表移动到待插入位置
        if (*link == NULL) return false; // 提前到达末尾，说明位置超过链表长度
        link = &(*link)->next; // 取 next 字段的地址，统一处理头部与中间插入
    }
    Node *node = malloc(sizeof *node); // 为新节点分配空间；sizeof *node 是节点结构体的大小
    if (node == NULL) return false; // 分配失败则返回，原链表不变
    snprintf(node->value, 13, "%s", value); // 复制字符串，最多保存 12 字节；教学示例未检查截断
    node->next = *link; // 先把新节点接到原后继，避免丢失后面的链
    *link = node; // 再更新 head 或前驱的 next，让新节点正式进入链表
    return true; // 插入成功；头插用 index=0，尾插用 index=链表长度
}`,
    remove: `bool remove_at(Node **head, int index, char out[13]) { // 返回成功标志；out 须指向至少 13 字节的可写缓冲区
    if (index < 0) return false; // 删除位置不能是负数
    Node **link = head; // 指向连接待删除节点的指针字段
    for (int i = 0; i < index; ++i) { // 沿 next 定位待删除节点
        if (*link == NULL) return false; // 位置越界，不能继续解引用
        link = &(*link)->next; // 移动到下一个连接字段
    }
    Node *node = *link; // 保存待删除节点，供复制数据和释放使用
    if (node == NULL) return false; // 空链表或位置等于长度时，没有可删除节点
    strcpy(out, node->value); // 释放前复制字符串；out 容量须足够且不能与源重叠
    *link = node->next; // head 或前驱的 next 绕过待删除节点，接上其后继
    free(node); // 释放节点；之后不能再读取 node 指向的内存
    return true; // 删除成功，取出的字符串已经写入 out
}`,
    find: `int find(const Node *head, const char *value) { // 只读查找，返回第一个匹配位置
    int index = 0; // 从头节点的位置 0 开始计数
    for (const Node *cur = head; cur; cur = cur->next) { // cur 非空时访问节点，然后沿 next 前进
        if (strcmp(cur->value, value) == 0) return index; // strcmp 返回 0 表示字符串相等
        ++index; // 本节点不匹配，继续检查下一个位置
    }
    return -1; // 到达 NULL 仍未匹配，返回未找到标志
}`,
    reverse: `void reverse(Node **head) { // 原地反转，通过 head 的地址更新调用者的头指针
    Node *prev = NULL; // 已反转部分的头节点；开始时为空
    Node *cur = *head; // 从原头节点开始处理
    while (cur != NULL) { // 逐个处理节点；空链表会直接跳过循环
        Node *next = cur->next; // 必须先保存原后继，否则修改 next 后会丢失剩余链
        cur->next = prev; // 当前节点改为指向前驱，反转这一条连接
        prev = cur; // 已反转部分的头节点移动到当前节点
        cur = next; // 沿保存的原后继，继续处理剩余节点
    }
    *head = prev; // 所有节点处理完毕，原尾节点成为新头节点
}`
  };
  // 操作面板保留简洁源码；带注释的完整版只用于页面下方的代码解释。
  const withoutComments = source => source.split('\n').map(line => line.replace(/\s+\/\/.*$/, '')).join('\n');
  const HEADER = withoutComments(GUIDE_HEADER);
  const CODE = Object.fromEntries(Object.entries(GUIDE_CODE).map(([type, source]) => [type, withoutComments(source)]));
  // 按词法拆分教学 C 代码；渲染时只使用 textContent，不解析源代码中的 HTML。
  function tokenizeC(source) {
    const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^[ \t]*#\s*\w+|<[^>\n]+\.h>|\b\d+\b|\b[A-Za-z_]\w*\b|->|\+\+|--|==|!=|<=|>=|&&|\|\||[+\-*/%=<>&!|]/gm;
    const tokens = [];
    let end = 0;
    for (const match of source.matchAll(pattern)) {
      if (match.index > end) tokens.push({ text: source.slice(end, match.index), type: 'plain' });
      const text = match[0];
      let type = 'plain';
      if (/^\/[/\*]/.test(text)) type = 'comment';
      else if (/^["']|^<.*\.h>$/.test(text)) type = 'string';
      else if (/^[ \t]*#/.test(text)) type = 'preprocessor';
      else if (/^\d+$/.test(text)) type = 'number';
      else if (/^(typedef|struct|const|if|for|while|return|sizeof)$/.test(text)) type = 'keyword';
      else if (/^(bool|char|int|void|Node)$/.test(text)) type = 'type';
      else if (/^(NULL|true|false)$/.test(text)) type = 'constant';
      else if (/^[A-Za-z_]\w*$/.test(text) && /^\s*\(/.test(source.slice(match.index + text.length))) type = 'function';
      else if (/^[+\-*/%=<>&!|]/.test(text)) type = 'operator';
      tokens.push({ text, type });
      end = match.index + text.length;
    }
    if (end < source.length) tokens.push({ text: source.slice(end), type: 'plain' });
    return tokens;
  }
  class LinkedList {
    constructor(values = [], limit = 12) {
      this.head = null; this.nodes = new Map(); this.serial = 0; this.limit = limit;
      if (values.length > limit) throw new Error('超出演示容量');
      let prev = null;
      for (const value of values) { const node = this.create(value); if (prev) prev.next = node; else this.head = node; prev = node; }
    }
    create(value) { const node = { id: 'N' + (++this.serial), value, next: null }; this.nodes.set(node.id, node); return node; }
    values() { const out = []; for (let n = this.head; n; n = n.next) out.push(n.value); return out; }
    snapshot(line, message, pointers = {}, active = null, extra = {}) {
      return { line, message, head: this.head?.id || null, nodes: [...this.nodes.values()].map(n => ({ id: n.id, value: n.value, next: n.next?.id || null })), pointers: Object.fromEntries(Object.entries(pointers).map(([k, n]) => [k, n?.id || null])), active, ...extra };
    }
    *operate(type, index, value) {
      if (type === 'prepend') { type = 'insert'; index = 0; }
      if (type === 'append') { type = 'insert'; index = this.values().length; }
      if (['insert', 'remove'].includes(type) && (!Number.isInteger(index) || index < 0 || index > this.values().length - (type === 'remove' ? 1 : 0))) throw new Error('位置越界');
      if (type === 'insert' && this.nodes.size >= this.limit) throw new Error('达到 12 个节点的演示上限');
      if (type === 'insert' && (!value || value.length > 12)) throw new Error('请输入 1–12 个字符');
      let prev = null, current = this.head;
      if (type === 'insert' || type === 'remove') {
        yield this.snapshot(3, 'link 初始指向 head 指针的存储位置。', { current });
        for (let i = 0; i < index; i++) {
          prev = current; current = current.next;
          yield this.snapshot(6, `link 改为 &${prev.id}->next，*link 为 ${current?.id || 'NULL'}。`, { prev, current }, prev.id, { visit: true });
        }
        if (type === 'insert') {
          const node = this.create(value);
          yield this.snapshot(8, `malloc 分配新节点 ${node.id}（模型模拟分配成功）。`, { node, current }, node.id, { fresh: node.id });
          yield this.snapshot(10, `将值 ${value} 写入新节点。`, { node }, node.id, { fresh: node.id });
          node.next = current;
          yield this.snapshot(11, `${node.id}->next = *link，接上原后继。`, { node, current }, node.id, { fresh: node.id });
          if (prev) prev.next = node; else this.head = node;
          yield this.snapshot(12, `*link = ${node.id}，更新${prev ? prev.id + ' 的 next' : '头指针'}。`, { node }, node.id);
          yield this.snapshot(13, '插入完成，返回 true。', {}, node.id, { result: true, done: true });
        } else {
          yield this.snapshot(8, `node = *link，准备删除 ${current.id}。`, { current }, current.id);
          yield this.snapshot(10, `复制返回值 ${current.value}，尚未释放节点。`, { current }, current.id);
          if (prev) prev.next = current.next; else this.head = current.next;
          yield this.snapshot(11, `*link = node->next，绕过 ${current.id}。`, { current }, current.id, { removed: current.id });
          this.nodes.delete(current.id);
          yield this.snapshot(12, `free(${current.id})，释放被删除节点。`, {}, null, { result: current.value });
          yield this.snapshot(13, `删除成功，out=${current.value}，返回 true。`, {}, null, { result: current.value, done: true });
        }
      } else if (type === 'find') {
        let i = 0;
        while (current) {
          const match = current.value === value;
          yield this.snapshot(4, `strcmp(${current.value}, ${value}) ${match ? '= 0，返回位置 ' + i : '不为 0'}。`, { current }, current.id, { visit: true, ...(match ? { result: i, done: true } : {}) });
          if (match) return;
          current = current.next; i++;
          yield this.snapshot(5, '位置递增，随后沿 next 继续遍历。', { current }, current?.id);
        }
        yield this.snapshot(7, '查找完成，未找到，返回 -1。', {}, null, { result: -1, done: true });
      } else if (type === 'reverse') {
        yield this.snapshot(3, 'prev=NULL，cur=*head。', { prev, current });
        while (current) {
          const next = current.next;
          yield this.snapshot(5, `保存 ${current.id} 的后继 ${next?.id || 'NULL'}。`, { prev, current, next }, current.id, { visit: true });
          current.next = prev;
          yield this.snapshot(6, `${current.id}->next 改为 ${prev?.id || 'NULL'}。`, { prev, current, next }, current.id);
          prev = current;
          yield this.snapshot(7, `prev 移动到 ${prev.id}。`, { prev, current, next }, prev.id);
          current = next;
          yield this.snapshot(8, 'cur 移动到保存的后继。', { prev, current }, current?.id);
        }
        this.head = prev;
        yield this.snapshot(10, `*head = ${prev?.id || 'NULL'}，反转完成。`, {}, prev?.id, { result: '完成', done: true });
      } else throw new Error('未知操作');
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { LinkedList, CODE, HEADER, GUIDE_CODE, GUIDE_HEADER, tokenizeC };
  if (typeof document === 'undefined') return;
  const el = name => document.getElementById('ll-' + name);
  if (!el('graph')) return;
  let list, events = [], cursor = 0, playing = false, running = false, timer;
  let visits = 0, result = '—', lines = [], history = [];
  const buttons = [...el('operations').querySelectorAll('button')];
  function renderCode(container, content) {
    const rows = []; container.replaceChildren();
    content.split('\n').forEach((text, i) => {
      const row = document.createElement('div'); row.className = 'll-code-line';
      const n = document.createElement('span'); n.className = 'll-ln'; n.textContent = i + 1;
      n.setAttribute('aria-hidden', 'true');
      const source = document.createElement('code'); source.className = 'll-code-source language-c';
      for (const token of tokenizeC(text)) {
        const span = document.createElement('span'); span.className = 'll-token-' + token.type; span.textContent = token.text;
        source.append(span);
      }
      row.append(n, source); container.append(row); rows.push(row);
    });
    return rows;
  }
  function code(type) {
    lines = renderCode(el('code'), HEADER + '\n\n' + CODE[type]);
  }
  for (const [type, source] of Object.entries({ header: GUIDE_HEADER, ...GUIDE_CODE })) {
    const container = el('guide-' + type);
    if (container) renderCode(container, source);
  }
  function controls() {
    buttons.forEach(button => button.disabled = running); el('value').disabled = el('index').disabled = running;
    el('play').disabled = !running || playing; el('pause').disabled = !playing; el('step').disabled = !running;
    el('progress').textContent = `${cursor} / ${events.length}`; el('status').textContent = playing ? 'RUNNING' : running ? 'PAUSED' : 'READY';
  }
  function draw(event) {
    const map = new Map(event.nodes.map(n => [n.id, n])); const order = [], seen = new Set();
    for (let id = event.head; id && map.has(id) && !seen.has(id); id = map.get(id).next) { seen.add(id); order.push(map.get(id)); }
    el('graph').replaceChildren();
    function chain(nodes, title, linked) {
      const label = document.createElement('p'); label.className = 'll-chain-title'; label.textContent = title;
      const row = document.createElement('div'); row.className = 'll-chain';
      for (const node of nodes) {
        const card = document.createElement('div'); card.className = 'll-node';
        if (event.active === node.id) card.classList.add('current'); if (event.fresh === node.id) card.classList.add('new'); if (event.removed === node.id) card.classList.add('removed');
        const name = document.createElement('strong'); name.textContent = node.id;
        const value = document.createElement('b'); value.textContent = node.value;
        const pointer = document.createElement('small'); pointer.textContent = 'next → ' + (node.next || 'NULL');
        card.append(name, value, pointer); row.append(card);
        if (linked) { const arrow = document.createElement('span'); arrow.className = 'll-arrow'; arrow.textContent = '→'; row.append(arrow); }
      }
      if (linked) { const end = document.createElement('span'); end.className = 'll-null'; end.textContent = 'NULL'; row.append(end); }
      el('graph').append(label, row);
    }
    chain(order, 'head 可达链（可横向滚动）', true);
    const detached = event.nodes.filter(n => !seen.has(n.id)); if (detached.length) chain(detached, '暂未从 head 连通的节点（以 next 字段为准）', false);
    el('pointers').replaceChildren();
    for (const [name, target] of Object.entries({ head: event.head, ...event.pointers })) { const badge = document.createElement('span'); badge.textContent = `${name} → ${target || 'NULL'}`; el('pointers').append(badge); }
    el('size').textContent = order.length; el('visits').textContent = visits; el('result').textContent = result;
    el('order').textContent = order.map(n => n.value).concat('NULL').join(' → ');
    const line = event.line ? event.line + HEADER.split('\n').length + 1 : 0;
    lines.forEach((row, i) => row.classList.toggle('active', i + 1 === line)); el('line').textContent = line ? 'C LINE ' + line : 'READY';
    if (line) el('code').scrollTop = Math.max(0, lines[line - 1].offsetTop - el('code').clientHeight / 2);
    controls();
  }
  function step() {
    if (!running) return;
    const event = events[cursor++]; if (event.visit) visits++; if ('result' in event) result = event.result;
    history.push(event.message); el('log').textContent = history.join('\n'); el('log').scrollTop = el('log').scrollHeight;
    el('message').textContent = event.message;
    if (cursor === events.length) { playing = running = false; clearTimeout(timer); }
    draw(event);
  }
  function schedule() { clearTimeout(timer); if (playing) timer = setTimeout(() => { step(); schedule(); }, Number(el('speed').value)); }
  function start(type) {
    if (running) return;
    const index = el('index').value === '' ? NaN : Number(el('index').value);
    try {
      const before = list.snapshot(0, '准备开始');
      events = [...list.operate(type, index, el('value').value.trim())];
      cursor = visits = 0; result = '—'; history = []; running = true; playing = el('auto').checked;
      code(['prepend', 'append'].includes(type) ? 'insert' : type);
      el('message').classList.remove('error'); el('log').textContent = ''; draw(before); step(); schedule();
    } catch (error) { el('message').textContent = error.message; el('message').classList.add('error'); }
  }
  function reset(values) {
    clearTimeout(timer); list = new LinkedList(values); events = []; cursor = visits = 0; result = '—'; history = []; playing = running = false;
    code('insert'); el('log').textContent = ''; el('message').classList.remove('error'); el('message').textContent = 'C 代码用于教学展示，JavaScript 模型同步演示操作。'; draw(list.snapshot(0, 'READY'));
  }
  buttons.forEach(button => button.addEventListener('click', () => start(button.dataset.op)));
  el('play').addEventListener('click', () => { playing = true; controls(); schedule(); });
  el('pause').addEventListener('click', () => { playing = false; clearTimeout(timer); controls(); });
  el('step').addEventListener('click', () => { playing = false; clearTimeout(timer); step(); });
  el('reset').addEventListener('click', () => reset(['10', '20', '30'])); el('clear').addEventListener('click', () => reset([]));
  el('speed').addEventListener('input', () => { el('speed-value').textContent = el('speed').value + 'ms'; schedule(); });
  window.addEventListener('pagehide', () => clearTimeout(timer)); reset(['10', '20', '30']);
})();
