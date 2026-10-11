// ============================================
// 4 人 push/fold（all-in or fold）纳什均衡求解器 —— 临时分析脚本
//
// 博弈：4 个位置 UTG / BTN / SB / BB，盲注 0.5/1，每人 8BB。
// 翻前只有一个下注尺度：全下 8BB，否则弃牌。没有翻后。
// 等筹码，所以任意人数的全下都只有一个主池，不需要边池。
//
// 位置顺序即翻前行动顺序：UTG -> BTN -> SB -> BB。
// 每个决策 = 弃牌 或 全下（第一个全下之后，后续玩家的「全下」即跟注）。
//
//   座位          可能的局面（先于我行动的人里，谁已经全下）
//   UTG(0)        空（开池）
//   BTN(1)        空（UTG 弃）、{UTG}
//   SB (2)        空、{UTG}、{BTN}、{UTG,BTN}
//   BB (3)        {UTG}、{BTN}、{SB}、{UTG,BTN}、{UTG,SB}、{BTN,SB}、{UTG,BTN,SB}
//                 （无人全下时 BB 直接收盲注，没有决策）
//   合计 14 个决策节点，每个节点一份「169 手牌类 -> 全下/跟注概率」的策略
//
// 求解：虚拟对局（fictitious play）。
//   每轮：对每个节点、每个手牌类，算「全下」相对于「弃牌」的 EV，
//         取更优的那个作为最优反应；再把最优反应并入历史平均。
//   对手行为用「历史平均策略」（混合），所以求的是纳什均衡而非某个纯策略。
//
// 期望值怎么算：
//   弃牌的价值是确定的（丢盲注，UTG/BTN 为 0，SB -0.5，BB -1）。
//   全下的价值 = 对「后续每个玩家 call/fold」的所有组合求和：
//     概率 = 各人 call 概率之积；收益 = 摊牌时我在池里的份额 × 池 - 8。
//   多人摊牌份额用评估器直接比七张牌，平局按人数均分。
//
// 抽样：每个发牌样本固定「3 名对手的 6 张牌 + 5 张公共牌」，剩下 41 张里
//   枚举英雄所有可能的底牌（按手牌类去重，每类随机取一个组合）。
// 这样一次发牌能覆盖全部 169 个手牌类，且扑克牌去除（blocker）是精确的。
//
// 已知近似（会写进结论）：
//   1. 每个手牌类每个发牌样本只取一个具体组合，组合内部的细微差异靠样本平均。
//   2. 公共牌从「去掉 6 张对手牌」后的 46 张里发，再由英雄合法组合条件化，
//      条件化是精确的（见上），但当类为口袋里没有可用组合时会跳过该类。
// ============================================

import { evaluate, RANK_CHARS } from './evaluator';
import { createRng, Rng } from './rng';
import { allStartingHands, handKeyOf } from './range';

const SEAT_NAMES = ['UTG', 'BTN', 'SB', 'BB'];
const BLIND = [0, 0, 0.5, 1];
const STACK = 8;

// ---------- 169 个手牌类 ----------

const SPECS = allStartingHands();
const CLASS_KEYS = SPECS.map((s) => s.key);
const CLASS_COMBOS = SPECS.map((s) => s.pairs.length);
const KEY_TO_CLASS = new Map<string, number>();
CLASS_KEYS.forEach((k, i) => KEY_TO_CLASS.set(k, i));
const CLASS_COUNT = CLASS_KEYS.length;

const classOfPair = new Int32Array(52 * 52).fill(-1);
for (let a = 0; a < 52; a += 1) {
  for (let b = 0; b < 52; b += 1) {
    if (a === b) continue;
    classOfPair[a * 52 + b] = KEY_TO_CLASS.get(handKeyOf([a, b]))!;
  }
}

// ---------- 决策节点 ----------

interface NodeSpec {
  seat: number;
  mask: number;
}

const NODES: NodeSpec[] = [];
for (let seat = 0; seat < 4; seat += 1) {
  for (let mask = 0; mask < 1 << seat; mask += 1) {
    if (seat === 3 && mask === 0) continue; // 无人全下，BB 无决策
    NODES.push({ seat, mask });
  }
}

function nodeKey(seat: number, mask: number): number {
  return seat * 16 + mask;
}

function maskLabel(mask: number): string {
  if (mask === 0) return '开池(无人全下)';
  const who: string[] = [];
  for (let s = 0; s < 4; s += 1) if (mask & (1 << s)) who.push(SEAT_NAMES[s]);
  return `跟注 ${who.join('+')} 的全下`;
}

function popcount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n += 1;
  }
  return n;
}

// ---------- 发牌样本 ----------

interface Deal {
  /** views[英雄座位][座位] = 该座位的两张底牌；英雄自己那一格为空 */
  seatHands: number[][][];
  /** views[英雄座位][座位] 的七张牌分值，英雄自己那一格为 0 */
  seatScores: number[][];
  /** 英雄的每个手牌类取一个组合：类号、分值、该类的可用组合数 */
  heroCls: number[];
  heroScore: number[];
  /** 该类在当前牌池里还剩几个组合。每类只抽一个组合时必须按它加权，
   *  否则估计量有偏（实测会把弱牌胜率抬高 ~6 个百分点） */
  heroN: number[];
}

function makeDeal(rng: Rng): Deal {
  const deck: number[] = [];
  for (let i = 0; i < 52; i += 1) deck.push(i);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  const others: number[][] = [
    [deck[0], deck[1]],
    [deck[2], deck[3]],
    [deck[4], deck[5]],
  ];
  const board = [deck[6], deck[7], deck[8], deck[9], deck[10]];
  const pool = deck.slice(11); // 41 张

  // 每个手牌类一个组合
  const buckets: number[][] = [];
  for (let c = 0; c < CLASS_COUNT; c += 1) buckets.push([]);
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const cls = classOfPair[pool[i] * 52 + pool[j]];
      buckets[cls].push(pool[i], pool[j]);
    }
  }

  const heroCls: number[] = [];
  const heroScore: number[] = [];
  const heroN: number[] = [];
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const b = buckets[cls];
    if (b.length === 0) continue;
    const pick = rng.int(b.length / 2);
    const c1 = b[pick * 2];
    const c2 = b[pick * 2 + 1];
    heroCls.push(cls);
    heroScore.push(evaluate([c1, c2, ...board]));
    heroN.push(b.length / 2);
  }

  const seatHands: number[][][] = [];
  const seatScores: number[][] = [];
  for (let h = 0; h < 4; h += 1) {
    const hands: number[][] = [];
    const scores: number[] = [];
    let k = 0;
    for (let s = 0; s < 4; s += 1) {
      if (s === h) {
        hands.push([]);
        scores.push(0);
        continue;
      }
      hands.push(others[k]);
      scores.push(evaluate([others[k][0], others[k][1], ...board]));
      k += 1;
    }
    seatHands.push(hands);
    seatScores.push(scores);
  }

  return { seatHands, seatScores, heroCls, heroScore, heroN };
}

// ---------- 一次全下的期望值 ----------

function aggressiveEV(
  hero: number,
  mask: number,
  heroScore: number,
  viewHands: number[][],
  viewScores: number[],
  strat: Map<number, Float64Array>
): number {
  const subs: number[] = [];
  for (let s = hero + 1; s < 4; s += 1) subs.push(s);

  let total = 0;

  const rec = (idx: number, allInMask: number, prob: number): void => {
    if (idx === subs.length) {
      const k = popcount(allInMask);
      let pot = STACK * k;
      for (let s = 0; s < 4; s += 1) if (!(allInMask & (1 << s))) pot += BLIND[s];

      let ev: number;
      if (k === 1) {
        ev = pot - STACK; // 无人跟，直接收下死钱
      } else {
        let maxScore = -1;
        let tie = 0;
        for (let s = 0; s < 4; s += 1) {
          if (!(allInMask & (1 << s))) continue;
          const sc = s === hero ? heroScore : viewScores[s];
          if (sc > maxScore) {
            maxScore = sc;
            tie = 1;
          } else if (sc === maxScore) {
            tie += 1;
          }
        }
        ev = heroScore === maxScore ? pot / tie - STACK : -STACK;
      }
      total += prob * ev;
      return;
    }

    const j = subs[idx];
    const cls = classOfPair[viewHands[j][0] * 52 + viewHands[j][1]];
    const pCall = strat.get(nodeKey(j, allInMask))![cls];

    rec(idx + 1, allInMask | (1 << j), prob * pCall);
    rec(idx + 1, allInMask, prob * (1 - pCall));
  };

  rec(0, mask | (1 << hero), 1);
  return total;
}

// ---------- 一轮虚拟对局 ----------

interface Accum {
  sum: Map<number, Float64Array>;
  cnt: Map<number, Int32Array>;
}

function runRound(
  deals: Deal[],
  strat: Map<number, Float64Array>,
  uniform: Float64Array
): Accum {
  const sum = new Map<number, Float64Array>();
  const cnt = new Map<number, Int32Array>();
  for (const n of NODES) {
    const key = nodeKey(n.seat, n.mask);
    sum.set(key, new Float64Array(CLASS_COUNT));
    cnt.set(key, new Int32Array(CLASS_COUNT));
  }

  for (let d = 0; d < deals.length; d += 1) {
    const deal = deals[d];
    for (let h = 0; h < 4; h += 1) {
      const viewHands = deal.seatHands[h];
      const viewScores = deal.seatScores[h];

      // 模拟先于我行动的人：全下 / 弃牌
      let mask = 0;
      for (let j = 0; j < h; j += 1) {
        const cls = classOfPair[viewHands[j][0] * 52 + viewHands[j][1]];
        const p = strat.get(nodeKey(j, mask))![cls];
        if (uniform[d * 4 + j] < p) mask |= 1 << j;
      }
      if (h === 3 && mask === 0) continue; // BB 收盲，无决策

      const key = nodeKey(h, mask);
      const sArr = sum.get(key)!;
      const cArr = cnt.get(key)!;

      for (let e = 0; e < deal.heroCls.length; e += 1) {
        const cls = deal.heroCls[e];
        // 只累计「全下」的 EV；最优反应在更新时与弃牌价值(-盲注)比较。
        // 权重取该类的可用组合数（见 Deal.heroN 的说明）
        const n = deal.heroN[e];
        const ev = aggressiveEV(h, mask, deal.heroScore[e], viewHands, viewScores, strat);
        sArr[cls] += ev * n;
        cArr[cls] += n;
      }
    }
  }

  return { sum, cnt };
}

// ---------- 主流程 ----------

function parseArg(argv: string[], name: string, dflt: number): number {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return Number(hit.slice(name.length + 3));
}

function main(): void {
  const argv = process.argv;
  const dealCount = parseArg(argv, 'deals', 2000);
  const iters = parseArg(argv, 'iters', 150);
  const seed = parseArg(argv, 'seed', 1);
  const verbose = parseArg(argv, 'verbose', 0) === 1;
  // --json=1：只往 stdout 打一份策略表的 JSON（给 tools/allin-chart 的静态网页吃），
  // 文本报告与迭代日志全部抑制，方便直接重定向到文件
  const asJson = parseArg(argv, 'json', 0) === 1;

  const rng = createRng(seed);
  const t0 = Date.now();

  // 平均策略：P(全下 / 跟注)，初始为 0（从不全下）
  const strat = new Map<number, Float64Array>();
  for (const n of NODES) strat.set(nodeKey(n.seat, n.mask), new Float64Array(CLASS_COUNT));

  // 历史平均的权重。fp：每轮权重 1（vec += (br-vec)/iter，调和式）；
  // linear：第 t 轮权重 t（vec += (br-vec)*2/(t+1)），后期轮次说话更管用。
  // 用 fp 时，第 1 轮的噪声权重是 1/H(iters)（150 轮 ≈ 18%），
  // 而第一轮对手还是「从不全下」，于是「推垃圾牌」会被记进平均且再也洗不掉 —— 线性平均正是治这个。
  const avgMode = (argv.find((a) => a.startsWith('--avg=')) || '--avg=fp').slice(6);
  if (avgMode !== 'fp' && avgMode !== 'linear') throw new Error(`--avg 只认 fp / linear，收到 ${avgMode}`);
  let weight = 0;

  let lastAcc: Accum | null = null;
  for (let iter = 1; iter <= iters; iter += 1) {
    // 每轮重新发牌：最优反应的抽样噪声在历史平均里被抹掉，
    // 否则稀有节点（如 BB 对三家全下）的噪声会被冻进不动点
    const deals: Deal[] = [];
    for (let d = 0; d < dealCount; d += 1) deals.push(makeDeal(rng));
    const uniform = new Float64Array(dealCount * 4);
    for (let i = 0; i < uniform.length; i += 1) uniform[i] = rng.next();

    const acc = runRound(deals, strat, uniform);
    lastAcc = acc;
    const w = avgMode === 'linear' ? iter : 1;
    weight += w;
    for (const n of NODES) {
      const key = nodeKey(n.seat, n.mask);
      const sArr = acc.sum.get(key)!;
      const cArr = acc.cnt.get(key)!;
      const vec = strat.get(key)!;
      const foldVal = -BLIND[n.seat];
      for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
        if (cArr[cls] === 0) continue;
        // 用「对当前平均策略的最优反应」并入历史平均（虚拟对局）
        const br = sArr[cls] / cArr[cls] > foldVal ? 1 : 0;
        vec[cls] += (br - vec[cls]) * (w / weight);
      }
    }
    if (verbose && !asJson && (iter % 25 === 0 || iter === 1)) {
      const parts = NODES.map((n) => {
        const vec = strat.get(nodeKey(n.seat, n.mask))!;
        return `${SEAT_NAMES[n.seat]}#${n.mask}=${(pctOf(vec) * 100).toFixed(1)}`;
      });
      console.log(`iter ${iter}: ${parts.join('  ')}`);
    }
  }

  const tEnd = Date.now();
  if (asJson) {
    dumpJson(strat, lastAcc!, { dealCount, iters, seed, seconds: (tEnd - t0) / 1000, avgMode });
    return;
  }
  console.log(
    `\n每轮 ${dealCount} 组发牌 × ${iters} 轮，种子 ${seed}；用时 ${((tEnd - t0) / 1000).toFixed(1)}s`
  );

  report(strat, lastAcc!);
}

/** 把 14 个决策节点的策略表打成 JSON。手牌类顺序 = allStartingHands() 的顺序，
 *  概率保留 4 位小数（求解器本身是虚构对局的历史平均，精度高于此） */
function dumpJson(
  strat: Map<number, Float64Array>,
  acc: Accum,
  meta: { dealCount: number; iters: number; seed: number; seconds: number; avgMode: string }
): void {
  const nodes = NODES.map((n) => {
    const key = nodeKey(n.seat, n.mask);
    const vec = strat.get(key)!;
    const cArr = acc.cnt.get(key)!;
    let sampled = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) sampled += cArr[cls];
    const probs: number[] = [];
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) probs.push(Number(vec[cls].toFixed(4)));
    return {
      seat: n.seat,
      mask: n.mask,
      label: maskLabel(n.mask),
      foldValueBb: -BLIND[n.seat],
      shovePct: Number((pctOf(vec) * 100).toFixed(2)),
      sampled,
      probs,
    };
  });

  console.log(
    JSON.stringify(
      {
        meta: {
          source: 'tools/open-size-ev/allin-nash.ts',
          game: '4 人桌 push/fold 纳什均衡（等筹码，无翻后）',
          seats: SEAT_NAMES,
          blinds: { sb: BLIND[2], bb: BLIND[3] },
          stackBb: STACK,
          deals: meta.dealCount,
          iters: meta.iters,
          averaging: meta.avgMode,
          seed: meta.seed,
          seconds: Number(meta.seconds.toFixed(1)),
          generatedAt: new Date().toISOString().slice(0, 10),
        },
        classes: CLASS_KEYS,
        nodes,
      },
      null,
      1
    )
  );
}

function sumOf(acc: Accum, key: number, cls: number): number {
  return acc.sum.get(key)![cls];
}

/** 组合加权的全下/跟注比例 */
function pctOf(vec: Float64Array): number {
  let combos = 0;
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) combos += vec[cls] * CLASS_COMBOS[cls];
  return combos / 1326;
}

function report(strat: Map<number, Float64Array>, acc: Accum): void {
  for (const n of NODES) {
    const key = nodeKey(n.seat, n.mask);
    const vec = strat.get(key)!;
    const cArr = acc.cnt.get(key)!;

    let sampled = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) sampled += cArr[cls];

    const header = `${SEAT_NAMES[n.seat]}  ${maskLabel(n.mask)}`;
    console.log(`\n================ ${header} ================`);
    console.log(`全下/跟注比例：${(pctOf(vec) * 100).toFixed(1)}%   样本类次：${sampled}`);

    const foldVal = -BLIND[n.seat];
    const dbg = ['AA', '72o', '32o'].map((k) => {
      const cls = KEY_TO_CLASS.get(k)!;
      const c = cArr[cls];
      const mean = c > 0 ? (sumOf(acc, key, cls) / c).toFixed(2) : 'n/a';
      return `${k}: P=${vec[cls].toFixed(2)} EV=${mean} n=${c}`;
    });
    console.log(`  弃牌价值 ${foldVal.toFixed(2)}  |  ${dbg.join('   ')}`);

    // 悔值：当前混合策略相对「全下/弃牌里更优那个」的损失，按组合数加权。
    // 纳什均衡处每个手牌类都应为 0
    let regret = 0;
    let regretN = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
      if (cArr[cls] === 0) continue;
      const ev = sumOf(acc, key, cls) / cArr[cls];
      const p = vec[cls];
      const best = Math.max(ev, foldVal);
      regret += (best - (p * ev + (1 - p) * foldVal)) * CLASS_COMBOS[cls];
      regretN += CLASS_COMBOS[cls];
    }
    console.log(`  平均悔值 ${(regret / regretN).toFixed(3)} bb`);
    printGrid(vec);
  }
}

function printGrid(vec: Float64Array): void {
  const head = '    ' + RANK_CHARS.slice().reverse().join('     ');
  console.log(head);
  for (let row = 12; row >= 0; row -= 1) {
    const cells: string[] = [];
    for (let col = 12; col >= 0; col -= 1) {
      const hi = Math.max(row, col);
      const lo = Math.min(row, col);
      let key = RANK_CHARS[hi] + RANK_CHARS[lo];
      if (row !== col) key += col > row ? 's' : 'o';
      const p = vec[KEY_TO_CLASS.get(key)!];
      cells.push((p <= 0.005 ? '--' : (p * 100).toFixed(0).padStart(2)).padStart(5));
    }
    console.log(RANK_CHARS[row] + '  ' + cells.join(' '));
  }
}

main();
