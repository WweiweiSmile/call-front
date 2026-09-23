// ============================================
// 模拟引擎
//
// 一手牌的流程：
//   翻前：抽对手 → 3-bet / 跟注 / 弃牌 → 没人跟就是收盲
//   翻后：我下注或过牌 → 对手按底池赔率跟或弃 → 转牌河牌同理 → 摊牌比大小
//
// 两条重要的简化（都会影响结论，README 里有专门一节）：
//   1. 翻后对手只会跟或弃，不会加注 —— 底池不会因为加注而失控，但我也拿不到
//      被加注时的信息
//   2. 我过牌之后，只可能有一个对手下注，其余人弃牌
// ============================================

import { evaluate } from './evaluator';
import { handKeyOf, sampleHandInRange } from './range';
import { createRng, removeCard, Rng, shuffledDeck } from './rng';
import {
  betFrequency,
  betSizePctFor,
  classify,
  heroCalls,
  isAirBet,
  opponentCallProbability,
  stabFrequency,
  StrategyConfig,
  Street,
  tiersForStreet,
} from './strategy';

export interface TableConfig {
  /** 几人桌 */
  tableSize: number;
  stackBb: number;
  smallBlindBb: number;
  bigBlindBb: number;
  /**
   * 每名玩家的前注（BB），每人一份、死钱里要乘人数。
   *
   * 前注是**所有人**都下的，包括我 —— 所以我的投入从 `ante + 开池额` 起算，
   * 而底池里的死钱是 `小盲 + 大盲 + 前注 × 人数`。
   * 9 人桌取 0.5 时死钱合计 6bb（0.5 + 1 + 4.5），是常见的带前注结构
   */
  anteBb: number;
  rakePct: number;
  rakeCapBb: number;
  /**
   * 目标平均跟注人数（**不含我**）。
   * 这是把"7BB 平均 3-4 人底池 / 10BB 平均 2-3 人底池"翻译成模型参数的接口：
   * 每名对手的跟注概率 = 目标人数 / 对手数，跟注范围就是胜率前这么多比例
   */
  targetCallers: number;
  /** 每名对手 3-bet 的概率 */
  threeBetFreq: number;
  /** 3-bet 加到开池额的几倍 */
  threeBetMultiple: number;
  /** 3-bettor 的范围宽度 */
  threeBetRangePct: number;
  /** 面对 3-bet，我拿自己开池范围的前多少比例去跟 */
  continueVs3BetPct: number;
  /** 对手用空气飘一手（float）的概率 */
  floatFreq: number;
  /** 我过牌后，对手主动下注的概率 */
  stabFreq: number;
}

export interface StrategyStats {
  name: string;
  hands: number;
  opens: number;
  foldPreflop: number;
  steals: number;
  threeBetFaced: number;
  threeBetFolds: number;
  sawFlop: number;
  /** 进翻牌时跟注人数的累计。这是**条件**均值（已经进了翻牌的那些局） */
  callerTotal: number;
  /**
   * 全部开池（含收盲那些 0 跟注的局）的跟注人数累计，与 openCounted 配对。
   *
   * 校准目标 `targetCallers` 是**无条件**期望，所以必须用这一对来验证，
   * 不能用 callerTotal/sawFlop —— 收盲的局不进翻牌，那个比值天生偏高
   */
  openCallerTotal: number;
  openCounted: number;
  flopBets: number;
  flopBetTookDown: number;
  /** 翻前就完全没中的手牌，在翻牌开枪的次数（airBluffFreq 的实际落点） */
  airBluffBets: number;
  airBluffTookDown: number;
  stabsFaced: number;
  stabsFolded: number;
  showdowns: number;
  showdownWins: number;
  potWonTotal: number;
  potLostTotal: number;
  net: number;
}

export function createStats(name: string): StrategyStats {
  return {
    name,
    hands: 0,
    opens: 0,
    foldPreflop: 0,
    steals: 0,
    threeBetFaced: 0,
    threeBetFolds: 0,
    sawFlop: 0,
    callerTotal: 0,
    openCallerTotal: 0,
    openCounted: 0,
    flopBets: 0,
    flopBetTookDown: 0,
    airBluffBets: 0,
    airBluffTookDown: 0,
    stabsFaced: 0,
    stabsFolded: 0,
    showdowns: 0,
    showdownWins: 0,
    potWonTotal: 0,
    potLostTotal: 0,
    net: 0,
  };
}

export interface SimContext {
  table: TableConfig;
  /** 每名对手的跟注概率，由 targetCallers 反推 */
  callProbability: number;
  openKeys: Set<string>;
  /** 我开池范围里最强的那一段，面对 3-bet 用它决定跟不跟 */
  continueKeys: Set<string>;
  callKeys: Set<string>;
  threeBetKeys: Set<string>;
  rng: Rng;
  stats: StrategyStats;
}

interface Seat {
  hole: number[];
  invested: number;
}

/** 翻前第一条行动之前的死钱：小盲 + 大盲 + 前注 × 人数 */
export function deadMoneyBb(table: TableConfig): number {
  return table.smallBlindBb + table.bigBlindBb + table.anteBb * table.tableSize;
}

function applyRake(pot: number, table: TableConfig): number {
  if (table.rakePct <= 0) return pot;
  return pot - Math.min(pot * table.rakePct, table.rakeCapBb);
}

function collect(pot: number, invested: number, ctx: SimContext): number {
  const won = applyRake(pot, ctx.table);
  ctx.stats.potWonTotal += won;
  return won - invested;
}

/**
 * 打一手牌，返回净收益（BB）。调用方负责确认这一手在开池范围内。
 *
 * deck 是**去掉我两张底牌后**的 50 张，且已经洗好、顺序无偏
 */
function playHand(hole: number[], deck: number[], strategy: StrategyConfig, ctx: SimContext): number {
  const { table, stats, rng } = ctx;
  const deadMoney = deadMoneyBb(table);
  const ante = table.anteBb;
  const open = strategy.openBb;
  const stack = table.stackBb;
  const opponentCount = table.tableSize - 1;

  // 前注是我先下的，所以我的投入从 ante + 开池额 起算
  let pot = deadMoney + open;
  let invested = ante + open;
  const pool = deck.slice();
  const opponents: Seat[] = [];
  let heroIsAggressor = true;

  // ---- 翻前：逐个对手掷骰子
  let threeBet = false;
  for (let i = 0; i < opponentCount; i += 1) {
    const roll = rng.next();
    if (roll < table.threeBetFreq) {
      threeBet = true;
      break;
    }
    if (roll < table.threeBetFreq + ctx.callProbability) {
      const oppHole = sampleHandInRange(rng, ctx.callKeys, pool);
      if (!oppHole) continue;
      removeCard(pool, oppHole[0]);
      removeCard(pool, oppHole[1]);
      opponents.push({ hole: oppHole, invested: ante + open });
      pot += open;
    }
  }

  // 校准核对：未遇 3-bet 的开池（含收盲）都计入无条件均值。
  // 遇 3-bet 的局不算 —— 那是另一条分支，不该混进跟注人数的统计
  if (!threeBet) {
    stats.openCallerTotal += opponents.length;
    stats.openCounted += 1;
  }

  if (threeBet) {
    // 简化：3-bet 一出，翻前就结束，之前跟注的人一概退出
    stats.threeBetFaced += 1;
    pot = deadMoney + open;
    invested = ante + open;
    opponents.length = 0;

    if (!ctx.continueKeys.has(handKeyOf(hole))) {
      stats.threeBetFolds += 1;
      return -invested;
    }
    const oppHole = sampleHandInRange(rng, ctx.threeBetKeys, pool);
    if (!oppHole) {
      stats.threeBetFolds += 1;
      return -invested;
    }
    const threeBetTo = open * table.threeBetMultiple;
    invested = ante + threeBetTo;
    pot = deadMoney + threeBetTo * 2;
    opponents.push({ hole: oppHole, invested: ante + threeBetTo });
    // 跟注 3-bet 的人是跟注方，翻牌不该由我先开枪
    heroIsAggressor = false;
  }

  if (opponents.length === 0) {
    // 收盲：底池全归我，净收益要减掉自己那份前注和开池额
    stats.steals += 1;
    return pot - invested;
  }

  stats.sawFlop += 1;
  stats.callerTotal += opponents.length;

  // ---- 翻后
  const board: number[] = [];
  const streets: Street[] = ['flop', 'turn', 'river'];

  for (let si = 0; si < streets.length; si += 1) {
    const street = streets[si];
    const dealCount = street === 'flop' ? 3 : 1;
    for (let k = 0; k < dealCount; k += 1) board.push(pool.pop() as number);

    const isRiver = street === 'river';
    const heroInfo = classify(hole, board, isRiver);
    const tiers = tiersForStreet(strategy, street);

    // 跟了 3-bet 的线，翻牌我作为跟注方先过牌，后面的街再恢复正常
    const canBet = !(street === 'flop' && !heroIsAggressor);
    const frequency = canBet ? betFrequency(heroInfo, tiers) : 0;

    if (canBet && rng.next() < frequency) {
      const bet = Math.min(pot * betSizePctFor(strategy, street), stack - invested);
      // 下注额被筹码上限压没了就退回过牌分支，不能直接跳街
      if (bet > 0.01) {
        const potBefore = pot;
        invested += bet;
        pot += bet;

        const isAir = isAirBet(heroInfo);
        if (street === 'flop') {
          stats.flopBets += 1;
          if (isAir) stats.airBluffBets += 1;
        }

        const callers: Seat[] = [];
        let maxMatched = 0;
        for (const opp of opponents) {
          const oppInfo = classify(opp.hole, board, isRiver);
          const probability = opponentCallProbability(
            oppInfo.power,
            bet,
            potBefore,
            table.floatFreq,
            street
          );
          if (rng.next() < probability) {
            const callAmount = Math.min(bet, stack - opp.invested);
            opp.invested += callAmount;
            pot += callAmount;
            if (callAmount > maxMatched) maxMatched = callAmount;
            callers.push(opp);
          }
        }

        // 没人跟到的部分要退给我。不退的话，我把超过对手承受能力的钱推进底池后，
        // 这笔钱只有赢下底池才能拿回来 —— 输了就白丢，凭空放大我的损失
        const refund = bet - maxMatched;
        if (refund > 0.01) {
          invested -= refund;
          pot -= refund;
        }

        opponents.length = 0;
        for (const caller of callers) opponents.push(caller);

        if (opponents.length === 0) {
          // 全弃，底池直接归我
          if (street === 'flop') {
            stats.flopBetTookDown += 1;
            if (isAir) stats.airBluffTookDown += 1;
          }
          return collect(pot, invested, ctx);
        }
        heroIsAggressor = true;
        continue;
      }
    }

    // ---- 我过牌
    if (opponents.length > 0 && rng.next() < stabFrequency(table.stabFreq, street)) {
      const stabber = opponents[rng.int(opponents.length)];
      const stabBet = Math.min(pot * betSizePctFor(strategy, street), stack - stabber.invested);
      if (stabBet > 0.01) {
        const potBefore = pot;
        stabber.invested += stabBet;
        pot += stabBet;
        stats.stabsFaced += 1;

        // 跟不动也可以飘一手 —— 与对手的 floatFreq 对称，
        // 否则我过牌就等于必被抢，过牌这条路会被系统性地低估
        if (
          !heroCalls(heroInfo.power, stabBet, potBefore, street) &&
          rng.next() >= table.floatFreq
        ) {
          stats.stabsFolded += 1;
          return -invested;
        }
        invested += stabBet;
        pot += stabBet;
        heroIsAggressor = false;
      }
    }
  }

  // ---- 摊牌
  stats.showdowns += 1;
  const heroScore = evaluate([...hole, ...board]);
  const oppScores: number[] = [];
  let best = heroScore;
  for (const opp of opponents) {
    const s = evaluate([...opp.hole, ...board]);
    oppScores.push(s);
    if (s > best) best = s;
  }

  const raked = applyRake(pot, table);
  if (heroScore < best) {
    stats.potLostTotal += raked;
    return -invested;
  }

  let winners = 1;
  for (const s of oppScores) if (s === best) winners += 1;
  const share = raked / winners;
  stats.showdownWins += 1;
  stats.potWonTotal += share;
  return share - invested;
}

/**
 * 全局手数计数。
 * 报表里的吞吐量要按**全部**跑过的手数算 —— 只算主对比那一部分的话，
 * 敏感性扫描的工作量就白干了，报出来的速度会偏高好几倍
 */
let handsPlayed = 0;

export function totalHandsPlayed(): number {
  return handsPlayed;
}

export interface BlockOutcome {
  net: number;
  /** 这一局里我开池的手数。逐局的开池次数不一样，所以要一并带出来才能算每次开池期望的误差 */
  opens: number;
}

/**
 * 跑一个 block（默认 1000 手），返回总净收益与本局开池手数。
 *
 * 发牌用一个**只由 blockSeed 决定**的独立随机流，动作随机另走 ctx.rng。
 * 这样两条策略在同一 block 里拿到的底牌完全一样 ——
 * 比较它们时"今天发牌好不好"这部分运气就被消掉了，剩下的差异只来自策略本身
 */
export function runBlock(
  blockSeed: number,
  hands: number,
  strategy: StrategyConfig,
  ctx: SimContext
): BlockOutcome {
  const dealRng = createRng(blockSeed);
  const opensBefore = ctx.stats.opens;
  let net = 0;

  for (let i = 0; i < hands; i += 1) {
    const deck = shuffledDeck(dealRng);
    const hole = [deck[0], deck[1]];
    ctx.stats.hands += 1;
    handsPlayed += 1;

    if (!ctx.openKeys.has(handKeyOf(hole))) {
      ctx.stats.foldPreflop += 1;
      continue;
    }
    ctx.stats.opens += 1;
    net += playHand(hole, deck.slice(2), strategy, ctx);
  }

  ctx.stats.net += net;
  return { net, opens: ctx.stats.opens - opensBefore };
}
