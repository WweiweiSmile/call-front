// ============================================
// 起手牌范围
//
// 范围的强弱排序不手抄"某某表"，而是跑一遍蒙特卡洛算出来：
// 每种起手牌对一名随机对手的胜率（平局折半），按胜率降序排。
// 好处是口径自洽 —— "前 40% 的手牌" 就是胜率排前 40% 的那些组合，
// 换个说法（比如想改成对两个对手的胜率）只需要换这个函数
// ============================================

import { evaluate, RANK_CHARS } from './evaluator';
import { Rng } from './rng';

/** 一种起手牌（169 个格子里的一格） */
export interface StartingHand {
  /** 'AA' / 'AKs' / 'AKo' */
  key: string;
  /** 包含多少个具体组合：对子 6、同花 4、非同花 12 */
  combos: number;
  /** 对一名随机对手的胜率，平局算半胜 */
  equity: number;
  /** 范围截断用：按胜率降序累加的组合数 */
  cumCombos: number;
  cumPct: number;
}

export interface RangeTable {
  /** 按胜率降序 */
  ordered: StartingHand[];
  byKey: Map<string, StartingHand>;
  totalCombos: number;
}

/**
 * 一种起手牌的**具体组合**。
 *
 * 必须存成对的牌，不能存一维的候选牌列表：后者抽样时会抽出"A♠ + K♥"去代表 AKs，
 * 或者抽出"A♠ + A♥"去代表 AKo —— 范围表会被悄悄算成另一副牌。
 * 这个坑第一版就踩了，AKo 的胜率因此虚高到接近对子
 */
export interface StartingHandSpec {
  key: string;
  pairs: [number, number][];
}

/** 全部 169 种起手牌，按格子顺序（不按强弱） */
export function allStartingHands(): StartingHandSpec[] {
  const out: StartingHandSpec[] = [];

  for (let hi = 12; hi >= 0; hi -= 1) {
    for (let lo = hi; lo >= 0; lo -= 1) {
      if (hi === lo) {
        // 对子：C(4,2) = 6
        const pairs: [number, number][] = [];
        for (let a = 0; a < 4; a += 1) {
          for (let b = a + 1; b < 4; b += 1) pairs.push([(hi << 2) | a, (hi << 2) | b]);
        }
        out.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo], pairs });
        continue;
      }

      // 同花：4 种花色各一个组合
      const suited: [number, number][] = [];
      for (let suit = 0; suit < 4; suit += 1) {
        suited.push([(hi << 2) | suit, (lo << 2) | suit]);
      }
      out.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo] + 's', pairs: suited });

      // 非同花：4 × 3 = 12 个组合
      const offsuit: [number, number][] = [];
      for (let sa = 0; sa < 4; sa += 1) {
        for (let sb = 0; sb < 4; sb += 1) {
          if (sa !== sb) offsuit.push([(hi << 2) | sa, (lo << 2) | sb]);
        }
      }
      out.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo] + 'o', pairs: offsuit });
    }
  }

  return out;
}

/** 两张底牌属于哪个格子，如 'AKs' */
export function handKeyOf(hole: number[]): string {
  const r0 = hole[0] >> 2;
  const r1 = hole[1] >> 2;
  if (r0 === r1) return RANK_CHARS[r0] + RANK_CHARS[r1];
  const hi = Math.max(r0, r1);
  const lo = Math.min(r0, r1);
  const suited = (hole[0] & 3) === (hole[1] & 3);
  return RANK_CHARS[hi] + RANK_CHARS[lo] + (suited ? 's' : 'o');
}

/**
 * 从 pool 里随机抽两张**不同的**牌。
 * 用拒绝采样：pool 最多 50 张，抽到重复的概率很低，比重建数组快
 */
function drawTwo(rng: Rng, pool: number[]): [number, number] {
  const i = rng.int(pool.length);
  let j = rng.int(pool.length - 1);
  if (j >= i) j += 1;
  return [pool[i], pool[j]];
}

/**
 * 构建范围表。samplesPerHand 是每种起手牌的抽样次数 ——
 * 169 × samples × 2 次评估，是启动时的主要开销
 */
export function buildRangeTable(rng: Rng, samplesPerHand: number): RangeTable {
  const specs = allStartingHands();
  const allCards: number[] = [];
  for (let i = 0; i < 52; i += 1) allCards.push(i);

  const entries: StartingHand[] = [];

  for (const spec of specs) {
    let points = 0;

    for (let s = 0; s < samplesPerHand; s += 1) {
      // 先从这个格子里等概率挑一个具体组合，再从剩下的牌里抽对手两张 + 公共牌五张
      const hole = spec.pairs[rng.int(spec.pairs.length)];
      const rest = allCards.filter((c) => c !== hole[0] && c !== hole[1]);

      // 对手两张和公共牌五张一起抽，前 2 张给对手
      const drawn: number[] = [];
      while (drawn.length < 7) {
        const card = rest[rng.int(rest.length)];
        if (drawn.indexOf(card) < 0) drawn.push(card);
      }

      const board = [drawn[2], drawn[3], drawn[4], drawn[5], drawn[6]];
      const myScore = evaluate([hole[0], hole[1], ...board]);
      const oppScore = evaluate([drawn[0], drawn[1], ...board]);
      points += myScore > oppScore ? 1 : myScore === oppScore ? 0.5 : 0;
    }

    entries.push({
      key: spec.key,
      combos: spec.pairs.length,
      equity: points / samplesPerHand,
      cumCombos: 0,
      cumPct: 0,
    });
  }

  entries.sort((a, b) => b.equity - a.equity);

  let acc = 0;
  let total = 0;
  for (const e of entries) total += e.combos;
  for (const e of entries) {
    acc += e.combos;
    e.cumCombos = acc;
    e.cumPct = acc / total;
  }

  const byKey = new Map<string, StartingHand>();
  for (const e of entries) byKey.set(e.key, e);

  return { ordered: entries, byKey, totalCombos: total };
}

/**
 * 取胜率最高的前 pct 比例组合。
 *
 * 按格子累加，所以实际比例会略微超过 pct（一个格子要么整个进来要么整个不进）——
 * 返回的 achievedPct 是真实值，报表里报的是它，不是请求的 pct
 */
export function keysForTopPercent(
  table: RangeTable,
  pct: number
): { keys: Set<string>; achievedPct: number } {
  return keysForBand(table, 0, pct);
}

/**
 * 取胜率排名在 [loPct, hiPct) 这一段。
 *
 * 对手的跟注范围必须用这个而不是"前 pct%"：**强牌是去 3-bet 的，不是用来跟注的**。
 * 直接把"跟注概率"翻译成"前 31% 的牌跟注"，会让对手拿着比我开池范围更强的牌来跟，
 * 我在多人摊牌里就成了劣势方 —— 这是把模型结论搞反的地方
 */
export function keysForBand(
  table: RangeTable,
  loPct: number,
  hiPct: number
): { keys: Set<string>; achievedPct: number } {
  const lo = loPct * table.totalCombos;
  const hi = hiPct * table.totalCombos;
  const keys = new Set<string>();
  let acc = 0;
  let added = 0;

  for (const hand of table.ordered) {
    if (acc >= hi) break;
    if (acc >= lo) {
      keys.add(hand.key);
      added += hand.combos;
    }
    acc += hand.combos;
  }

  return { keys, achievedPct: added / table.totalCombos };
}

/**
 * 从 pool 里抽一手落在 keys 范围内的牌，抽不到返回 null。
 *
 * 用拒绝采样：命中率就是范围比例（22% 的范围平均试 4.5 次），
 * 不值得为它预先展开组合列表
 */
export function sampleHandInRange(
  rng: Rng,
  keys: Set<string>,
  pool: number[]
): [number, number] | null {
  const attempts = 500;
  for (let i = 0; i < attempts; i += 1) {
    const [a, b] = drawTwo(rng, pool);
    if (keys.has(handKeyOf([a, b]))) return [a, b];
  }
  return null;
}
