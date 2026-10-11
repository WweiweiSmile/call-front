// 独立对拍：单挑（HU）8BB push/fold 纳什均衡
// 用于校验 allin-nash.ts 里 SB 开池 / BB 跟注 SB 两个节点 —— 那两节点在 4 人局中
// UTG、BTN 已弃牌且无死钱，与单挑完全同构。这里是一份独立实现，只看两个策略向量。

import { evaluate } from './evaluator';
import { createRng, Rng } from './rng';
import { allStartingHands, handKeyOf } from './range';

const STACK = 8;
const POT_CALLED = 2 * STACK; // 双方各 8，盲注已含在内
const FOLD_SB = -0.5; // 小盲弃牌损失
const FOLD_BB = -1; // 大盲弃牌损失

const SPECS = allStartingHands();
const CLASS_COUNT = SPECS.length; // 169
const CLASS_COMBOS = SPECS.map((s) => s.pairs.length);
const KEY_TO_CLASS = new Map<string, number>();
SPECS.forEach((s, i) => KEY_TO_CLASS.set(s.key, i));

const classOfPair = new Int32Array(52 * 52).fill(-1);
for (let a = 0; a < 52; a += 1) {
  for (let b = 0; b < 52; b += 1) {
    if (a !== b) classOfPair[a * 52 + b] = KEY_TO_CLASS.get(handKeyOf([a, b]))!;
  }
}

interface Entry {
  cls: number;
  score: number;
  /** 该类在当前牌池里还剩几个可用组合。聚合时必须按它加权：
   *  每类只抽一个组合，若不平掉「可选组合数」，估计量会有偏
   *  （实测 72o 会被高估 6 个百分点） */
  n: number;
}

/** pool 里每个手牌类随机取一个组合，返回其七张牌分值 */
function samplePerClass(rng: Rng, pool: number[], board: number[]): Entry[] {
  const buckets: number[][] = [];
  for (let c = 0; c < CLASS_COUNT; c += 1) buckets.push([]);
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      buckets[classOfPair[pool[i] * 52 + pool[j]]].push(pool[i], pool[j]);
    }
  }
  const out: Entry[] = [];
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const b = buckets[cls];
    if (b.length === 0) continue;
    const k = rng.int(b.length / 2);
    out.push({ cls, score: evaluate([b[k * 2], b[k * 2 + 1], ...board]), n: b.length / 2 });
  }
  return out;
}

function share(a: number, b: number): number {
  return a > b ? 1 : a === b ? 0.5 : 0;
}

function main(): void {
  const arg = (name: string, dflt: number): number => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? Number(hit.slice(name.length + 3)) : dflt;
  };
  const iters = arg('iters', 1500);
  const dealsPerIter = arg('deals', 1500);
  const seed = arg('seed', 1);
  const verbose = arg('verbose', 0) === 1;

  const rng = createRng(seed);
  const sbShove = new Float64Array(CLASS_COUNT);
  const bbCall = new Float64Array(CLASS_COUNT);
  const sumBB = new Float64Array(CLASS_COUNT);
  const wBB = new Float64Array(CLASS_COUNT); // reach 权重（SB 全下的概率）
  const t0 = Date.now();

  const pct = (v: Float64Array): number => {
    let c = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) c += v[cls] * CLASS_COMBOS[cls];
    return c / 1326;
  };

  for (let iter = 1; iter <= iters; iter += 1) {
    const sumSB = new Float64Array(CLASS_COUNT);
    const nSB = new Int32Array(CLASS_COUNT);
    sumBB.fill(0);
    wBB.fill(0);

    for (let d = 0; d < dealsPerIter; d += 1) {
      const deck: number[] = [];
      for (let i = 0; i < 52; i += 1) deck.push(i);
      for (let i = 51; i > 0; i -= 1) {
        const j = rng.int(i + 1);
        const t = deck[i];
        deck[i] = deck[j];
        deck[j] = t;
      }
      const sb = [deck[0], deck[1]];
      const bb = [deck[2], deck[3]];
      const board = [deck[4], deck[5], deck[6], deck[7], deck[8]];

      const usedSB = new Set([sb[0], sb[1], ...board]);
      const usedBB = new Set([bb[0], bb[1], ...board]);
      const poolSB = deck.filter((c) => !usedBB.has(c)); // 排除对手与公共牌
      const poolBB = deck.filter((c) => !usedSB.has(c));

      const bbCls = classOfPair[bb[0] * 52 + bb[1]];
      const sbCls = classOfPair[sb[0] * 52 + sb[1]];
      const bbScore = evaluate([bb[0], bb[1], ...board]);
      const sbScore = evaluate([sb[0], sb[1], ...board]);

      const pBBcall = bbCall[bbCls];
      const pSBshove = sbShove[sbCls];

      // SB 的全下 EV：BB 跟则摊牌，不跟则收下 1bb。权重 = 可用组合数
      for (const e of samplePerClass(rng, poolSB, board)) {
        const ev =
          (1 - pBBcall) * 1 + pBBcall * (share(e.score, bbScore) * POT_CALLED - STACK);
        sumSB[e.cls] += e.n * ev;
        nSB[e.cls] += e.n;
      }

      // BB 的跟注 EV：只在 SB 全下时才有意义，权重 = SB 全下概率 × 可用组合数
      if (pSBshove > 0) {
        for (const e of samplePerClass(rng, poolBB, board)) {
          const ev = share(e.score, sbScore) * POT_CALLED - STACK;
          sumBB[e.cls] += e.n * pSBshove * ev;
          wBB[e.cls] += e.n * pSBshove;
        }
      }
    }

    for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
      if (nSB[cls] > 0) {
        const mean = sumSB[cls] / nSB[cls];
        const br = mean > FOLD_SB ? 1 : 0;
        sbShove[cls] += (br - sbShove[cls]) / iter;
      }
      if (wBB[cls] > 0) {
        const mean = sumBB[cls] / wBB[cls];
        const br = mean > FOLD_BB ? 1 : 0;
        bbCall[cls] += (br - bbCall[cls]) / iter;
      }
    }

    if (verbose && iter % 500 === 0) {
      console.log(`iter ${iter}: SB=${(pct(sbShove) * 100).toFixed(1)}  BB=${(pct(bbCall) * 100).toFixed(1)}`);
    }
  }

  console.log(`单挑 8BB：${dealsPerIter} 组/轮 × ${iters} 轮，种子 ${seed}，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`SB 全下范围：${(pct(sbShove) * 100).toFixed(1)}%`);
  console.log(`BB 跟注范围：${(pct(bbCall) * 100).toFixed(1)}%`);

  // 独立检验：BB 的盈亏平衡是「对 SB 全下范围的胜率 > 7/16 = 43.75% 才跟」。
  // 用另一条代码路径（直接对 SB 范围抽样求胜率）复算这个比例，
  // 必须与求解器给出的 BB 跟注范围一致
  const breakEven = bbBreakEven(rng, sbShove);
  console.log(`独立复算「胜率 > 43.75%」的手牌占比：${(breakEven * 100).toFixed(1)}%`);
}

function bbBreakEven(rng: Rng, sbShove: Float64Array): number {
  const N = 20000;
  const eq = new Float64Array(CLASS_COUNT);
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    const pairs = SPECS[cls].pairs;
    let pts = 0;
    let cnt = 0;
    for (let s = 0; s < N; s += 1) {
      const bb = pairs[rng.int(pairs.length)];
      // 从 SB 的全下范围里抽一手（拒绝采样）
      let sbHand: [number, number] | null = null;
      for (let t = 0; t < 300; t += 1) {
        const a = rng.int(52);
        const b = rng.int(52);
        if (a === b || a === bb[0] || a === bb[1] || b === bb[0] || b === bb[1]) continue;
        if (rng.next() < sbShove[classOfPair[a * 52 + b]]) {
          sbHand = [a, b];
          break;
        }
      }
      if (!sbHand) continue;
      const used = new Set([bb[0], bb[1], sbHand[0], sbHand[1]]);
      const board: number[] = [];
      while (board.length < 5) {
        const c = rng.int(52);
        if (used.has(c) || board.indexOf(c) >= 0) continue;
        board.push(c);
      }
      const hs = evaluate([bb[0], bb[1], ...board]);
      const os = evaluate([sbHand[0], sbHand[1], ...board]);
      pts += hs > os ? 1 : hs === os ? 0.5 : 0;
      cnt += 1;
    }
    eq[cls] = cnt > 0 ? pts / cnt : 0;
  }

  // 与 solver 完全同算法的加权版本：SB 手牌均匀抽样，再按 全下概率 加权
  const wsum = new Float64Array(CLASS_COUNT);
  const wden = new Float64Array(CLASS_COUNT);
  for (let i = 0; i < N * 6; i += 1) {
    const a1 = rng.int(52);
    const a2 = rng.int(52);
    if (a1 === a2) continue;
    const used0 = new Set([a1, a2]);
    const board: number[] = [];
    while (board.length < 5) {
      const c = rng.int(52);
      if (used0.has(c) || board.indexOf(c) >= 0) continue;
      board.push(c);
    }
    const used = new Set([a1, a2, ...board]);
    const pool: number[] = [];
    for (let c = 0; c < 52; c += 1) if (!used.has(c)) pool.push(c); // 45 张
    const p = sbShove[classOfPair[a1 * 52 + a2]];
    if (p <= 0) continue;
    const sbScore = evaluate([a1, a2, ...board]);
    for (const e of samplePerClass(rng, pool, board)) {
      wsum[e.cls] += e.n * p * share(e.score, sbScore);
      wden[e.cls] += e.n * p;
    }
  }

  for (const key of ['AA', 'TT', '55', 'QJs', 'Q5o', 'T9s', 'A2o', '72o', '32o']) {
    const cls = KEY_TO_CLASS.get(key)!;
    const weighted = wden[cls] > 0 ? (wsum[cls] / wden[cls]) * 100 : NaN;
    console.log(
      `  ${key}\t范围抽样=${(eq[cls] * 100).toFixed(1)}%  加权=${weighted.toFixed(1)}%`
    );
  }

  let hit = 0;
  let tot = 0;
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
    tot += CLASS_COMBOS[cls];
    if (eq[cls] > 7 / 16) hit += CLASS_COMBOS[cls];
  }
  return hit / tot;
}

main();
