// ============================================
// 把求解器 dump 的策略表内嵌进 page.template.html，产出单文件 index.html。
// 为什么要内嵌而不是 fetch：目标是双击就能用（file:// 下 fetch 本地 json 会被浏览器拦），
// 所以数据必须长在 HTML 里。
//
// 用法：
//   node tools/allin-chart/build.js                      # 用同目录的 strategy-8bb.json
//   node tools/allin-chart/build.js a.json b.json        # 换一份策略表 + 换一份对照表
//
// 第二份表（另一个随机种子跑出来的同一份策略表）只用来算「数值稳定性」：
// 同一手牌在全下频率上的最大跨种子抖动。均衡边界附近的牌本来就该抖动，
// 但抖动大到什么程度，使用者有权知道 —— 所以这个数会印在网页上。
//
// 策略表怎么来的：
//   node tools/open-size-ev/dist/allin-nash.js --json=1 --avg=linear --iters=600 --seed=1 --deals=2000 > tools/allin-chart/strategy-8bb.json
//   node tools/open-size-ev/dist/allin-nash.js --json=1 --avg=linear --iters=600 --seed=3 --deals=2000 > tools/allin-chart/strategy-8bb.seed3.json
// ============================================

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const srcPath = process.argv[2] || path.join(dir, 'strategy-8bb.json');
const noisePath = process.argv[3] || path.join(dir, 'strategy-8bb.seed3.json');
const outPath = path.join(dir, 'index.html');

const tpl = fs.readFileSync(path.join(dir, 'page.template.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

// ---------- 上网页前先校验，宁可构建失败也别发布一份缺节点的表 ----------

// 1. 手牌类必须是完整的 169 个
if (!Array.isArray(data.classes) || data.classes.length !== 169) {
  throw new Error(`手牌类数应为 169，实际 ${data.classes && data.classes.length}`);
}
if (new Set(data.classes).size !== 169) throw new Error('手牌类有重复');

// 2. 决策节点必须齐全：每个座位「先于我行动的人」的所有子集，
//    唯一的例外是 BB 在无人全下时（直接收盲，没有决策）
const expected = [];
for (let seat = 0; seat < 4; seat += 1) {
  for (let mask = 0; mask < 1 << seat; mask += 1) {
    if (seat === 3 && mask === 0) continue;
    expected.push(`${seat}:${mask}`);
  }
}
const got = new Set(data.nodes.map((n) => `${n.seat}:${n.mask}`));
const missing = expected.filter((k) => !got.has(k));
if (missing.length) throw new Error(`策略表缺少节点 seat:mask = ${missing.join(', ')}`);

// 3. 每个节点的概率向量长度、取值范围
for (const n of data.nodes) {
  if (n.probs.length !== 169) throw new Error(`节点 ${n.seat}:${n.mask} 的概率数不是 169`);
  for (const p of n.probs) {
    if (!(p >= 0 && p <= 1)) throw new Error(`节点 ${n.seat}:${n.mask} 有非法概率 ${p}`);
  }
}

// ---------- 数值稳定性：跟另一份种子的表逐格对比 ----------
// 单位是「百分点」（频率差 ×100），页面直接印这个数，别再换算

if (fs.existsSync(noisePath)) {
  const other = JSON.parse(fs.readFileSync(noisePath, 'utf8'));
  if (other.meta.seed === data.meta.seed) {
    throw new Error('对照表跟主表是同一个种子，算不出抖动');
  }
  const otherNodes = new Map(other.nodes.map((n) => [`${n.seat}:${n.mask}`, n]));
  let worst = { node: '', nodeLabel: '', maxPP: 0 };
  for (const n of data.nodes) {
    const o = otherNodes.get(`${n.seat}:${n.mask}`);
    if (!o) throw new Error(`对照表缺少节点 ${n.seat}:${n.mask}`);
    let maxPP = 0;
    let sumPP = 0;
    for (let i = 0; i < 169; i += 1) {
      const d = Math.abs(n.probs[i] - o.probs[i]) * 100;
      if (d > maxPP) maxPP = d;
      sumPP += d;
    }
    n.noiseMaxPP = Number(maxPP.toFixed(1));
    n.noiseMeanPP = Number((sumPP / 169).toFixed(2));
    if (n.noiseMaxPP > worst.maxPP) worst = { node: `${n.seat}:${n.mask}`, nodeLabel: `${data.meta.seats[n.seat]} ${n.label}`, maxPP: n.noiseMaxPP };
  }
  data.meta.noiseSeed = other.meta.seed;
  data.meta.noiseWorst = worst;
  console.log(`数值稳定性（对照种子 ${other.meta.seed}）：最差的局面是 ${worst.nodeLabel}，单手牌最大抖动 ${worst.maxPP} 个百分点`);
} else {
  console.log(`没找到对照表 ${path.basename(noisePath)}，跳过数值稳定性标注`);
}

const html = tpl.replace('__STRATEGY_JSON__', () => JSON.stringify(data));
if (html.indexOf('__STRATEGY_JSON__') >= 0) throw new Error('占位符没被替换掉');
fs.writeFileSync(outPath, html);

const kb = (html.length / 1024).toFixed(0);
console.log(`已生成 ${path.basename(outPath)}：内嵌 ${data.nodes.length} 个节点 × 169 个手牌类，${kb} KB`);
console.log(`数据来源 ${data.meta.source}（种子 ${data.meta.seed}，${data.meta.deals} 组发牌 × ${data.meta.iters} 轮）`);
