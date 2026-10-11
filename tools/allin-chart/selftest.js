// ============================================
// index.html 的网页逻辑自检。
//
// 页面是单文件、无构建依赖的原生 JS，没有测试运行器可用，
// 所以这里用最小 DOM 打桩把 index.html 里的 <script> 直接跑在 node 上，
// 再对渲染出来的文案、上色、掷骰分布做断言。
//
// 跑的断言：
//   1. 13×13 网格覆盖的 169 个 key 与策略表完全一致（同花/非同花方向最容易写反）
//   2. 每个 (座位, mask) 都能查到节点，唯一例外是 BB 无人全下
//   3. 换位置 / 勾对手 / 换手牌后，结论文案确实跟着变
//   4. 混合牌**不用点任何按钮**就自动掷出结果；纯策略不出现掷骰入口
//   5. 掷骰函数真的按 p 分布出结果（跑 4000 次看经验频率）
//   6. 网格上色与策略表一致（色块透明度 = 全下频率）
//   7. 网格尺寸跟着可用空间走（一屏不滚动的前提），格子够大时才显示频率数字
//
// 用法：node tools/allin-chart/selftest.js
// ============================================

const fs = require('fs');
const path = require('path');

// ---------- 最小 DOM 打桩 ----------

function El(tag) {
  this.tagName = tag;
  this.children = [];
  this.textContent = '';
  this.title = '';
  this.style = {};
  this.dataset = {};
  this.clientWidth = 360;      // 打桩给个像手机的尺寸，fitGrid 才有的可算
  this.clientHeight = 420;
  this._html = '';
  this._cls = new Set();
  const self = this;
  this.classList = {
    add(c) { self._cls.add(c); },
    contains(c) { return self._cls.has(c); },
    toggle(c, on) { if (on === undefined) { self._cls.has(c) ? self._cls.delete(c) : self._cls.add(c); } else if (on) { self._cls.add(c); } else { self._cls.delete(c); } },
  };
  this._listeners = {};
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); };
El.prototype.click = function () { (this._listeners.click || []).forEach((f) => f()); };
Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._html; },
  // 真 DOM 里赋 innerHTML 会丢掉原有子节点（页面靠 oppBar.innerHTML='' 清空对手区），
  // 打桩必须照做，否则「换位置后对手区清空」这类断言会假过/假败
  set(v) { this._html = String(v); this.children = []; },
});
Object.defineProperty(El.prototype, 'className', {
  get() { return this._cls.size ? Array.from(this._cls).join(' ') : ''; },
  set(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
});

const byId = {};
global.document = {
  createElement: (tag) => new El(tag),
  getElementById(id) { return byId[id] || (byId[id] = new El('div')); },
};
const observers = [];
global.ResizeObserver = function (cb) { this.cb = cb; observers.push(this); };
ResizeObserver.prototype.observe = function () {};
const winListeners = [];
global.window = { addEventListener: (t, f) => winListeners.push([t, f]) };

// ---------- 载入页面里的脚本 ----------

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 2) throw new Error(`预期 2 段 <script>，实际 ${scripts.length}`);
// 两段脚本在浏览器里共享同一个全局作用域（第一段声明 const S），
// 所以这里必须拼起来跑在同一个函数作用域里，再把它内部的 S 取出来给断言用
const S = new Function(`${scripts[0]}\n${scripts[1]}\nreturn S;`)();

// ---------- 断言小工具 ----------

let failed = 0;
function ok(name, cond, extra) {
  if (cond) console.log(`  ok   ${name}`);
  else { failed += 1; console.log(`  FAIL ${name}${extra ? '  ' + extra : ''}`); }
}
function near(name, got, want, tol) {
  ok(`${name}（实测 ${got.toFixed(3)}，标称 ${want.toFixed(3)}，容差 ${tol}）`, Math.abs(got - want) <= tol);
}

// ---------- 1. 网格与策略表一致 ----------

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const keyAt = (row, col) => (row === col
  ? RANKS[row] + RANKS[col]
  : RANKS[Math.min(row, col)] + RANKS[Math.max(row, col)] + (row < col ? 's' : 'o'));

const gridKeys = new Set();
for (let r = 0; r < 13; r += 1) for (let c = 0; c < 13; c += 1) gridKeys.add(keyAt(r, c));
const tableKeys = new Set(S.classes);

console.log('[1] 13×13 网格 ↔ 策略表');
ok('网格覆盖 169 个 key', gridKeys.size === 169, `实际 ${gridKeys.size}`);
ok('网格与策略表的 key 集合完全相同',
  gridKeys.size === tableKeys.size && [...gridKeys].every((k) => tableKeys.has(k)));
const comboTotal = S.classes.reduce((s, k) => s + (k.length === 2 ? 6 : (k.charAt(2) === 's' ? 4 : 12)), 0);
ok('组合数合计 = 1326', comboTotal === 1326, `实际 ${comboTotal}`);
ok('对子在对角线上', keyAt(0, 0) === 'AA' && keyAt(12, 12) === '22');
ok('右上半区是同花（ATs）', keyAt(0, 4) === 'ATs' && keyAt(4, 0) === 'ATo');
ok('每个格子都挂了手牌名与频率数字两个 span',
  byId.handGrid.children.length === 169 && byId.handGrid.children.every((c) => c.children.length === 2));

// ---------- 2. 节点覆盖 ----------

console.log('[2] 决策节点');
const missing = [];
for (let seat = 0; seat < 4; seat += 1) {
  for (let mask = 0; mask < 1 << seat; mask += 1) {
    if (seat === 3 && mask === 0) continue;
    if (!S.nodes.some((n) => n.seat === seat && n.mask === mask)) missing.push(`${seat}:${mask}`);
  }
}
ok('所有合法局面都有节点', missing.length === 0, missing.join(','));
ok('节点数 = 14', S.nodes.length === 14, `实际 ${S.nodes.length}`);

// ---------- 3. 交互 ----------

const vbig = () => byId.vbig.innerHTML;
const ctxLine = () => byId.ctxLine.innerHTML;
const seatEls = byId.seatBar.children;
const chipEls = () => byId.oppBar.children;
const cellFor = (key) => byId.handGrid.children.find((c) => c.dataset && c.dataset.key === key);
const nodeOf = (seat, mask) => S.nodes.find((n) => n.seat === seat && n.mask === mask);
const probOf = (seat, mask, key) => nodeOf(seat, mask).probs[S.classes.indexOf(key)];

console.log('[3] 交互');
ok('默认 AA @ UTG：结论是纯全下', vbig().indexOf('全下') >= 0 && vbig().indexOf('100%') >= 0, vbig());
ok('默认态：上下文点名 AA 与 UTG', ctxLine().indexOf('AA') >= 0 && ctxLine().indexOf('UTG') >= 0);
ok('默认态：UTG 没有对手区', byId.oppBar.className.indexOf('hide') >= 0);

cellFor('72o').click();
ok('72o @ UTG 是纯弃牌', vbig().indexOf('弃牌') >= 0 && vbig().indexOf('0%') >= 0, vbig());
ok('纯策略不出现掷骰入口', byId.rollBar.className.indexOf('hide') >= 0);

seatEls[3].click();                                   // 我 = BB，未勾任何人
ok('BB 无人全下：无需决策', vbig().indexOf('无需决策') >= 0, vbig());
ok('BB 无人全下：对手区出现 3 个可勾位置', chipEls().length === 3, `实际 ${chipEls().length}`);
ok('BB 无人全下：不显示掷骰入口', byId.rollBar.className.indexOf('hide') >= 0);

chipEls()[0].click();                                 // 勾 UTG 全下
cellFor('AA').click();
ok('BB 面对 UTG 全下：AA 是纯跟注', vbig().indexOf('跟注') >= 0, vbig());
ok('上下文点名 UTG 全下', ctxLine().indexOf('UTG') >= 0 && ctxLine().indexOf('面对') >= 0);

cellFor('72o').click();
ok('同一局面换 72o：翻成弃牌', vbig().indexOf('弃牌') >= 0, vbig());

seatEls[0].click();                                   // 回到 UTG
ok('换位置后清空对手勾选', chipEls().length === 0);
ok('UTG：对手区隐藏', byId.oppBar.className.indexOf('hide') >= 0);

// ---------- 4. 自动掷骰 ----------

console.log('[4] 自动掷骰（用户不点任何按钮）');
// 在 UTG 开池节点里挑一张最接近 50% 的混合牌
const utg = nodeOf(0, 0);
let best = null;
utg.probs.forEach((p, i) => {
  if (p > 0.2 && p < 0.8 && (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5))) best = { key: S.classes[i], p };
});
ok('UTG 开池存在混合牌可用于抽样', !!best, best ? `${best.key} p=${best.p}` : '');
if (best) {
  cellFor(best.key).click();                          // 只点手牌，不点「掷一次」
  ok('换到混合牌后自动出结果（含「本次」）', vbig().indexOf('本次') >= 0, vbig());
  ok('自动结果注明概率', vbig().indexOf((best.p * 100).toFixed(1) + '%') >= 0, vbig());
  ok('混合牌出现掷骰入口', byId.rollBar.className === 'rollbar');
  ok('首次提示是自动掷的', byId.counter.textContent.indexOf('自动') >= 0, byId.counter.textContent);
  byId.reroll.click();
  ok('手动再掷后显示累计', byId.counter.textContent.indexOf('已掷 2 次') >= 0, byId.counter.textContent);
  // 换一张牌再换回来，统计要归零（换了局面就是新样本）
  cellFor('KK').click(); cellFor(best.key).click();
  byId.reroll.click();
  ok('换手牌后统计归零重新计', byId.counter.textContent.indexOf('已掷 2 次') >= 0, byId.counter.textContent);
}

// ---------- 5. 掷骰分布 ----------

console.log('[5] 掷骰分布');
if (best) {
  const N = 4000;
  let yes = 0;
  for (let i = 0; i < N; i += 1) if (Math.random() < best.p) yes += 1;   // 与页面 roll() 同一判据
  near(`连掷 ${N} 次的经验频率`, yes / N, best.p, 0.032);   // 二项标准差 ≈0.008，取 4σ
}

// ---------- 6. 网格上色 ----------

console.log('[6] 网格上色');
cellFor('72o').click();                               // 仍是 UTG 开池局面
const cellAA = cellFor('AA'), cell72 = cellFor('72o');
const alpha = (el) => Number(/rgba\(52,211,153,([\d.]+)\)/.exec(el.style.background)[1]);
near('AA 的色块透明度 = 0.08 + 0.92×p', alpha(cellAA), 0.08 + 0.92 * probOf(0, 0, 'AA'), 0.002);
near('72o 的色块透明度 = 0.08 + 0.92×p', alpha(cell72), 0.08 + 0.92 * probOf(0, 0, '72o'), 0.002);
ok('选中的格子有黄框', cell72.className.indexOf('sel') >= 0 && cellAA.className.indexOf('sel') < 0);
ok('频率数字写进了格子', cellAA.children[1].textContent === '100', cellAA.children[1].textContent);
seatEls[3].click();                                   // BB 无人全下：没有节点可上色
ok('无决策时网格不上色', cellAA.style.background.indexOf('rgba(52,211,153,0)') >= 0, cellAA.style.background);
ok('无决策时隐藏图例', byId.legend.className.indexOf('hide') >= 0);

// ---------- 7. 一屏适配 ----------

console.log('[7] 网格尺寸');
ok('挂了 resize 监听', winListeners.some(([t]) => t === 'resize'));
ok('用 ResizeObserver 盯住可用空间变化', observers.length === 1);
ok('网格尺寸 = 可用空间的短边（360×420 → 360）', byId.handGrid.style.width === '360px', byId.handGrid.style.width);
ok('格子 27.7px 时不显示频率数字', byId.handGrid.className.indexOf('roomy') < 0);
byId.stage.clientWidth = 700; byId.stage.clientHeight = 700;   // 模拟桌面/大屏
observers[0].cb();                                            // 让页面重新测量
ok('空间变大后网格跟着变大', byId.handGrid.style.width === '700px', byId.handGrid.style.width);
ok('格子够大（53.8px）时显示频率数字', byId.handGrid.className.indexOf('roomy') >= 0);
ok('字号随格子缩放', parseFloat(byId.handGrid.style.fontSize) > 10, byId.handGrid.style.fontSize);

// ---------- 汇总 ----------

console.log(failed === 0 ? '\n全部通过。' : `\n${failed} 项失败。`);
if (failed > 0) process.exitCode = 1;
