// ============================================
// 手牌强度判定与下注/跟注规则
//
// 所有"拍脑袋"的常数都集中在本文件顶部。它们不是从 GTO 解算器里标定出来的，
// 而是把常见打法写成一张可读的表 —— 想试别的打法，改这里就够了，
// 不用碰模拟引擎和评估器
// ============================================

import { categoryOf, evaluate, straightHigh } from './evaluator';

export type Street = 'flop' | 'turn' | 'river';

/** 一套策略：开池尺度 + 各档强度的下注频率 */
export interface StrategyConfig {
  name: string;
  /** 开池加到多少 BB */
  openBb: number;
  /** 开池范围宽度（占全部组合的比例） */
  openRangePct: number;
  /** 成牌时的下注频率 */
  valueBetFreq: number;
  /** 听牌时的半诈唬频率 */
  semiBluffFreq: number;
  /** 完全没中时的诈唬频率 —— 这就是"没中牌丢不丢"的旋钮 */
  airBluffFreq: number;
  /** 下注尺度，底池的百分之多少 */
  betSizePct: number;
}

// ---------------------------------------------------------------
// 可调常数
// ---------------------------------------------------------------

/** power 达到这个值算"成牌"，按 valueBetFreq 下注 */
const VALUE_TIER = 0.5;
/** power 达到这个值算"有听牌/弱成牌"，按 semiBluffFreq 下注；低于它按 airBluffFreq */
const SEMI_TIER = 0.3;

/** 听牌的 power 加分。数值偏大是有意的：听牌的实际胜率不低，但纯靠牌型算不出来 */
const FLUSH_DRAW_BONUS = 0.35;
const OESD_BONUS = 0.32;
const GUTSHOT_BONUS = 0.15;
/** 纯粹的空气 + 听牌，power 上限就压到这里为止，免得听牌被当成成牌打 */
const PURE_DRAW_CAP = 0.5;
/** 已经成牌时听牌只是加分项，按这个比例折算 */
const MADE_HAND_DRAW_SCALE = 0.6;

/**
 * 后面几条街继续下注的意愿衰减。
 * 没成牌还一条街一条街接着开枪，被抓的概率会明显变大 ——
 * 衰减就是这件事的粗略表达
 */
const STREET_SCALE: Record<Street, { value: number; semi: number; air: number }> = {
  flop: { value: 1.0, semi: 1.0, air: 1.0 },
  turn: { value: 0.8, semi: 0.65, air: 0.55 },
  river: { value: 0.7, semi: 0.35, air: 0.5 },
};

/**
 * 对手跟注的门槛：power 高于 threshold 必跟，否则按 floatFreq 飘一手。
 * threshold = 基准 + 底池赔率要求的胜率 × 斜率 + 街道上浮 ——
 * 下注越大，要求越高，跟注范围自然收紧
 */
const CALL_THRESHOLD_BASE = 0.15;
const CALL_THRESHOLD_SLOPE = 1.0;

/**
 * 跟注门槛随街道上浮。
 *
 * 这一项不是装饰：没有它，对手会用同一套标准在翻牌、转牌、河牌一路跟到底，
 * 中间对子会跟完三条街的重注。后果是底池每街翻三倍，100bb 的筹码到河牌必然全下 ——
 * 模拟就变成了"谁的牌大"，而不成牌该不该继续下注这件事完全被淹掉
 */
const STREET_CALL_BUMP: Record<Street, number> = { flop: 0, turn: 0.06, river: 0.12 };

/**
 * 我过牌后对手主动下注的概率，随街道递减。
 * 同样不能是常数：一条街一条街地对着过牌的人开枪，现实中没人这么干
 */
const STREET_STAB_SCALE: Record<Street, number> = { flop: 1.0, turn: 0.65, river: 0.5 };

export function stabFrequency(base: number, street: Street): number {
  return base * STREET_STAB_SCALE[street];
}

/**
 * 下注尺度随街道变化：多人底池里翻牌下小注、后面两条街再加大，是常见打法。
 *
 * 尺度不缩放的话，55% 底池 × 三条街 × 多人跟注会让底池几何级增长，
 * 100bb 的筹码到河牌必然全下 —— 模拟就退化成了"河牌谁的牌大"
 */
const STREET_SIZE_SCALE: Record<Street, number> = { flop: 0.6, turn: 0.8, river: 0.9 };

export function betSizePctFor(strategy: StrategyConfig, street: Street): number {
  return strategy.betSizePct * STREET_SIZE_SCALE[street];
}

// ---------------------------------------------------------------

export interface DrawInfo {
  /** 同花听牌：四张同花色，且其中至少一张是我的底牌 */
  flushDraw: boolean;
  /** 顺子听牌的补牌张数（每个能成顺的点数算 4 张） */
  straightOuts: number;
}

export interface HandInfo {
  /** 底牌 + 公共牌的最佳五张牌分值 */
  score: number;
  /** 牌型编号，见 evaluator.CATEGORY_NAMES */
  category: number;
  /** 启发式强度 0..1。不是胜率，只是本文件里各处门槛统一的计价单位 */
  power: number;
  /** 是否用底牌连上了牌面。牌面自己成对不算 */
  hit: boolean;
}

/**
 * 判断听牌。
 *
 * 顺子听牌的做法是"逐个试再发哪张点数能成顺"，而且要求成出来的顺子**必须用到我的底牌**——
 * 否则公共牌自己成顺也会被算成我的听牌
 */
export function drawInfo(hole: number[], board: number[]): DrawInfo {
  const suitCount = [0, 0, 0, 0];
  for (const card of hole) suitCount[card & 3] += 1;
  for (const card of board) suitCount[card & 3] += 1;

  let flushDraw = false;
  for (const card of hole) {
    if (suitCount[card & 3] === 4) flushDraw = true;
  }

  let holeMask = 0;
  for (const card of hole) holeMask |= 1 << (card >> 2);
  let mask = holeMask;
  for (const card of board) mask |= 1 << (card >> 2);

  let straightOuts = 0;
  for (let rank = 0; rank < 13; rank += 1) {
    if (mask & (1 << rank)) continue;
    const high = straightHigh(mask | (1 << rank));
    if (high < 0) continue;
    // 顺子的五张是 high-4 .. high；轮子时 high=3，下界绕回 A（下标 12）
    let usesHole = false;
    for (let k = high - 4; k <= high; k += 1) {
      const rank2 = k < 0 ? k + 13 : k;
      if (holeMask & (1 << rank2)) {
        usesHole = true;
        break;
      }
    }
    if (usesHole) straightOuts += 4;
  }

  return { flushDraw, straightOuts };
}

/**
 * 给一手牌打分。
 *
 * isRiver 为真时不算听牌加分 —— 河牌之后没有下一张牌，听牌已经作废，
 * 这时候再下注就是纯诈唬，该走 airBluffFreq 那一档
 */
export function classify(hole: number[], board: number[], isRiver: boolean): HandInfo {
  const holeA = hole[0] >> 2;
  const holeB = hole[1] >> 2;
  const pocketPair = holeA === holeB;
  const holeHi = Math.max(holeA, holeB);
  const holeLo = Math.min(holeA, holeB);

  const boardRanks: number[] = [];
  for (const card of board) boardRanks.push(card >> 2);
  const boardSorted = boardRanks.slice().sort((a, b) => b - a);
  const boardHi = boardSorted[0];

  const pairedA = boardRanks.indexOf(holeA) >= 0;
  const pairedB = boardRanks.indexOf(holeB) >= 0;
  const pairedHole = pairedA || pairedB;

  const score = evaluate([...hole, ...board]);
  const category = categoryOf(score);

  // 「连上牌面」= 两对及以上，或一对且这一对确实用到了底牌
  const hit = category >= 2 || (category === 1 && (pairedHole || pocketPair));

  let power: number;
  if (category >= 3) {
    // 三条 .80 / 顺子 .84 / 同花 .88 / 葫芦 .92 / 四条 .96 / 同花顺 1.00
    power = 0.8 + (category - 3) * 0.04;
  } else if (category === 2) {
    power = 0.7;
  } else if (category === 1) {
    if (pocketPair) {
      // 比牌面最大的牌还大 = 超对；否则是被盖住的小对
      power = holeHi > boardHi ? 0.62 : 0.34;
    } else if (pairedHole) {
      const pairedRank = pairedA ? holeA : holeB;
      const otherHole = pairedA ? holeB : holeA;
      const pairIndex = boardSorted.indexOf(pairedRank);
      if (pairIndex === 0) {
        // 顶对：踢脚比牌面顶张大才算好踢脚
        power = otherHole > boardHi ? 0.6 : 0.54;
      } else if (pairIndex === 1) {
        power = 0.44;
      } else {
        power = 0.36;
      }
    } else {
      // 只有公共牌成对，我的底牌没参与
      power = 0.2;
    }
  } else {
    // 高牌：两张底牌都比牌面大 = 两张高张，还值点钱；
    // 只有一张比牌面大时，它多半能当个后门听牌，给一点点分
    power = holeLo > boardHi ? 0.28 : holeHi > boardHi ? 0.18 : 0.1;
  }

  if (!isRiver) {
    const draw = drawInfo(hole, board);
    let bonus = 0;
    if (draw.flushDraw) bonus += FLUSH_DRAW_BONUS;
    if (draw.straightOuts >= 6) bonus += OESD_BONUS;
    else if (draw.straightOuts >= 4) bonus += GUTSHOT_BONUS;

    if (bonus > 0) {
      power =
        category === 0
          ? Math.min(PURE_DRAW_CAP, power + bonus)
          : Math.min(1, power + bonus * MADE_HAND_DRAW_SCALE);
    }
  }

  return { score, category, power, hit };
}

/** 把策略配置和街道折算成这一条街的三档下注频率 */
export function tiersForStreet(
  strategy: StrategyConfig,
  street: Street
): { value: number; semi: number; air: number } {
  const scale = STREET_SCALE[street];
  return {
    value: Math.min(1, strategy.valueBetFreq * scale.value),
    semi: Math.min(1, strategy.semiBluffFreq * scale.semi),
    air: Math.min(1, strategy.airBluffFreq * scale.air),
  };
}

/** 我这一手按哪一档下注 */
export function betFrequency(
  info: HandInfo,
  tiers: { value: number; semi: number; air: number }
): number {
  if (info.power >= VALUE_TIER) return tiers.value;
  if (info.power >= SEMI_TIER) return tiers.semi;
  return tiers.air;
}

/** 这一手是不是"完全没中"那一档 —— 报表里用它把纯诈唬单独拎出来看 */
export function isAirBet(info: HandInfo): boolean {
  return info.power < SEMI_TIER;
}

/**
 * 对手面对下注时的跟注概率。
 *
 * potBefore 是**我下注之前**的底池，required 是他跟注需要的胜率。
 * 门槛随下注尺度上浮，这样"底池赔率"这件事在模型里是有体现的
 */
export function opponentCallProbability(
  power: number,
  bet: number,
  potBefore: number,
  floatFreq: number,
  street: Street
): number {
  const required = bet / (potBefore + 2 * bet);
  const threshold = CALL_THRESHOLD_BASE + required * CALL_THRESHOLD_SLOPE + STREET_CALL_BUMP[street];
  return power >= threshold ? 1 : floatFreq;
}

/** 我面对下注时的跟注门槛，规则与对手一致（是否飘一手由调用方决定） */
export function heroCalls(power: number, bet: number, potBefore: number, street: Street): boolean {
  const required = bet / (potBefore + 2 * bet);
  return power >= CALL_THRESHOLD_BASE + required * CALL_THRESHOLD_SLOPE + STREET_CALL_BUMP[street];
}
