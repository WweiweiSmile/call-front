// ============================================
// 自检
//
// 最重要的一项是**暴力对拍**：从 7 张里枚举全部 21 种五张组合，各自按五张牌评估，
// 取最大值，和评估器一把梭的结果比。两者必须永远相等。
// 评估器里那些"同花不可能和葫芦共存，所以命中同花可以直接返回"的剪枝，
// 靠的就是这种对拍来兜底 —— 推理可能漏掉某种牌型组合，枚举不会
// ============================================

import { CATEGORY_NAMES, categoryOf, cardsToString, evaluate, parseCards } from './evaluator';
import { keysForTopPercent, buildRangeTable, allStartingHands, handKeyOf } from './range';
import { createRng, shuffledDeck } from './rng';
import { createStats, deadMoneyBb, runBlock, SimContext, TableConfig } from './sim';
import { StrategyConfig } from './strategy';

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

/** 枚举 7 张里全部 21 种五张组合，取最高分。慢，只用于对拍 */
function bruteForceBest(cards: number[]): number {
  let best = -1;
  for (let skipA = 0; skipA < cards.length; skipA += 1) {
    for (let skipB = skipA + 1; skipB < cards.length; skipB += 1) {
      const five: number[] = [];
      for (let k = 0; k < cards.length; k += 1) {
        if (k !== skipA && k !== skipB) five.push(cards[k]);
      }
      const value = evaluate(five);
      if (value > best) best = value;
    }
  }
  return best;
}

/** 牌型名必须严格从大到小，且 categoryOf 与名字对得上 */
function checkCategoryOrder(): CheckResult {
  const cases: [string, string][] = [
    ['AsKsQsJsTs', '同花顺'],
    ['AcAdAhAsKd', '四条'],
    ['AcAdAhKsKd', '葫芦'],
    ['AsKs9s5s2s', '同花'],
    ['9c8d7h6s5c', '顺子'],
    ['AcAdAhKsQd', '三条'],
    ['AcAdKhKsQd', '两对'],
    ['AcAdKhQsJd', '一对'],
    ['AcKhQsJd9c', '高牌'],
  ];

  const problems: string[] = [];
  let previous = Number.POSITIVE_INFINITY;
  for (const [text, expected] of cases) {
    const value = evaluate(parseCards(text));
    const actual = CATEGORY_NAMES[categoryOf(value)];
    if (actual !== expected) problems.push(`${text} 判成 ${actual}，应为 ${expected}`);
    if (value >= previous) problems.push(`${text} 没有严格小于上一种牌型`);
    previous = value;
  }
  return {
    name: '牌型大小顺序',
    passed: problems.length === 0,
    detail: problems.length === 0 ? `9 种牌型顺序正确（${cases.length} 个样例）` : problems.join('；'),
  };
}

/** 轮子：A2345 是顺子，顶张算 5，所以输给 23456 */
function checkWheel(): CheckResult {
  const problems: string[] = [];
  const wheel = parseCards('Ac2d3h4s5c');
  const six = parseCards('2c3d4h5s6c');
  const broadway = parseCards('AcKdQhJsTc');

  if (categoryOf(evaluate(wheel)) !== 4) problems.push('A2345 没被判成顺子');
  if (evaluate(wheel) >= evaluate(six)) problems.push('A2345 没有输给 23456');
  if (evaluate(broadway) <= evaluate(wheel)) problems.push('AKQJT 没有赢过 A2345');

  // 七张里的轮子：A2345 + K，成手仍是轮子顺子，不能被 K 干扰
  const sevenCardWheel = evaluate(parseCards('Ac2d3h4s5cKd'));
  if (categoryOf(sevenCardWheel) !== 4) problems.push('七张里的 A2345 没被判成顺子');
  if (sevenCardWheel !== evaluate(wheel)) problems.push('七张轮子的分值不等于纯五张轮子');

  return {
    name: '轮子顺子（A 当 1）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? 'A2345 < 23456 < AKQJT，七张口径一致' : problems.join('；'),
  };
}

/** 同花与葫芦/三条共存时的取舍 */
function checkFlushVsMade(): CheckResult {
  const problems: string[] = [];
  // 五张黑桃（2 3 4 5 7，不连号）+ 三张 7：同花赢三条
  const flushAndTrips = parseCards('7s7h7d2s3s4s5s');
  if (categoryOf(evaluate(flushAndTrips)) !== 5) problems.push('同花 + 三条 应判同花');

  // 同花顺压倒一切
  const straightFlush = parseCards('2s3s4s5s6s7h7d');
  if (categoryOf(evaluate(straightFlush)) !== 8) problems.push('同花顺 + 一对 应判同花顺');

  // 葫芦压同花：这里用两组三条凑葫芦，且不成同花
  const fullHouse = parseCards('AcAdAhKcKdKh2s');
  if (categoryOf(evaluate(fullHouse)) !== 6) problems.push('两个三条 应判葫芦');

  return {
    name: '同花与已成牌的取舍',
    passed: problems.length === 0,
    detail: problems.length === 0 ? '同花压三条、同花顺压一切、葫芦压同花' : problems.join('；'),
  };
}

/** 与暴力枚举对拍 —— 本文件里最重要的一项 */
function checkAgainstBruteForce(trials: number, seed: number): CheckResult {
  const rng = createRng(seed);
  const mismatches: string[] = [];

  for (let i = 0; i < trials; i += 1) {
    const deck = shuffledDeck(rng);
    const seven = deck.slice(0, 7);
    const fast = evaluate(seven);
    const slow = bruteForceBest(seven);
    if (fast !== slow) {
      mismatches.push(`${cardsToString(seven)}：快速 ${categoryOf(fast)} vs 枚举 ${categoryOf(slow)}`);
      if (mismatches.length >= 5) break;
    }
  }

  return {
    name: '对拍暴力枚举',
    passed: mismatches.length === 0,
    detail:
      mismatches.length === 0
        ? `${trials.toLocaleString('en-US')} 组随机七张，全部与 21 种组合枚举一致`
        : mismatches.join('；'),
  };
}

/** 起手牌格子与范围截断 */
function checkRangeTable(seed: number, samples: number): CheckResult {
  const problems: string[] = [];
  const specs = allStartingHands();
  if (specs.length !== 169) problems.push(`起手牌格子数 ${specs.length}，应为 169`);

  // 逐个格子校验组合本身。第一版把候选牌拍平成一维列表，导致 AKs 里抽出了 A♠K♥、
  // AKo 里抽出了 A♠A♥（对子），范围表被静默算歪。这条断言就是钉住那个 bug 的
  let combos = 0;
  for (const spec of specs) {
    combos += spec.pairs.length;
    const isPair = spec.key.length === 2;
    const wantSuited = spec.key.endsWith('s');
    const expected = isPair ? 6 : wantSuited ? 4 : 12;
    if (spec.pairs.length !== expected) {
      problems.push(`${spec.key} 有 ${spec.pairs.length} 个组合，应为 ${expected}`);
    }
    for (const [a, b] of spec.pairs) {
      const sameRank = a >> 2 === (b >> 2);
      const sameSuit = (a & 3) === (b & 3);
      if (isPair && !sameRank) problems.push(`${spec.key} 里出现了不同点数的组合`);
      if (!isPair && sameRank) problems.push(`${spec.key} 里出现了对子组合`);
      if (!isPair && wantSuited && !sameSuit) problems.push(`${spec.key} 里出现了不同花色的组合`);
      if (!isPair && !wantSuited && sameSuit) problems.push(`${spec.key} 里出现了同花色的组合`);
    }
  }
  if (combos !== 1326) problems.push(`组合总数 ${combos}，应为 1326`);

  const table = buildRangeTable(createRng(seed), samples);
  if (table.totalCombos !== 1326) problems.push(`范围表组合总数 ${table.totalCombos}`);

  if (table.ordered[0].key !== 'AA') problems.push(`最强的起手牌是 ${table.ordered[0].key}，应为 AA`);

  const aces = table.byKey.get('AA')?.equity ?? 0;
  if (aces < 0.8 || aces > 0.9) problems.push(`AA 对随机手胜率 ${(aces * 100).toFixed(1)}%，应落在 80-90%`);

  // 注意 72o 是"最难打"的牌，不是"冷胜率最低"的牌 ——
  // 32o / 42o / 43o 的对随机手胜率都比它低。所以这里断言的是数值区间和大致名次，
  // 不是"排最后"：这些废牌之间只差一两个百分点，蒙特卡洛噪声足以让名次互换
  const worstKey = table.ordered[table.ordered.length - 1].key;
  const worst = table.ordered[table.ordered.length - 1].equity;
  if (worst < 0.26 || worst > 0.4) {
    problems.push(`最弱起手牌 ${worstKey} 胜率 ${(worst * 100).toFixed(1)}%，应落在 26-40%`);
  }
  if (!worstKey.endsWith('o')) problems.push(`最弱起手牌 ${worstKey} 不该是同花牌`);

  const bottom = table.ordered.slice(-15).map((h) => h.key);
  if (bottom.indexOf('72o') < 0) {
    problems.push(`72o 没进最弱十五名，后十五名是 ${bottom.join(' ')}`);
  }

  // 对称性不变量：我这一手和对手那一手在发牌上完全平权，所以
  // 把 169 格的胜率按组合数加权平均，必须**精确等于 50%**。
  // 这条比"某个具体牌值等于多少"可靠得多 —— 它不依赖我记不记得住公开表格，
  // 而且任何采样偏差（漏抽、重复、把对手和公共牌的发牌顺序搞错）都会把它推开
  let equitySum = 0;
  for (const hand of table.ordered) equitySum += hand.combos * hand.equity;
  const averageEquity = equitySum / table.totalCombos;
  if (Math.abs(averageEquity - 0.5) > 0.005) {
    problems.push(`加权平均胜率 ${(averageEquity * 100).toFixed(1)}%，应精确等于 50%（采样有偏）`);
  }

  const top40 = keysForTopPercent(table, 0.4);
  if (top40.achievedPct < 0.38 || top40.achievedPct > 0.44) {
    problems.push(`前 40% 实际截到 ${(top40.achievedPct * 100).toFixed(1)}%`);
  }

  // 具体两张牌要落到正确的格子
  if (handKeyOf(parseCards('AsAh')) !== 'AA') problems.push('AsAh 没落到 AA');
  if (handKeyOf(parseCards('AsKs')) !== 'AKs') problems.push('AsKs 没落到 AKs');
  if (handKeyOf(parseCards('AsKh')) !== 'AKo') problems.push('AsKh 没落到 AKo');

  const top3 = table.ordered
    .slice(0, 3)
    .map((h) => `${h.key} ${(h.equity * 100).toFixed(1)}%`)
    .join(' / ');
  const bottom3 = table.ordered
    .slice(-3)
    .map((h) => `${h.key} ${(h.equity * 100).toFixed(1)}%`)
    .join(' / ');

  return {
    name: '起手牌范围表',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? [
            `169 格 / 1326 组合，每种抽样 ${samples} 次`,
            `最强三名 ${top3}`,
            `最弱三名 ${bottom3}`,
            `加权平均胜率 ${(averageEquity * 100).toFixed(2)}%（对称性要求精确 50%）`,
            `前 40% 截到 ${(top40.achievedPct * 100).toFixed(1)}%`,
          ].join('\n      ')
        : problems.join('；'),
  };
}

/**
 * 翻前收盲的账目。
 *
 * 把跟注概率和 3-bet 概率都设成 0，于是每次开池都必然收盲，
 * 净收益就有一个精确的解析值：`开池次数 × (死钱 − 我那份前注)`。
 * 前注是我先下的，收盲时拿回来，所以要从死钱里扣掉自己那一份 ——
 * 这一步很容易写成 `死钱 − 开池额` 或漏掉前注，用解析值钉住它
 */
function checkStealAccounting(seed: number): CheckResult {
  const problems: string[] = [];

  for (const ante of [0, 0.5]) {
    const table: TableConfig = {
      tableSize: 9,
      stackBb: 100,
      smallBlindBb: 0.5,
      bigBlindBb: 1,
      anteBb: ante,
      rakePct: 0,
      rakeCapBb: 0,
      targetCallers: 0,
      threeBetFreq: 0,
      threeBetMultiple: 3,
      threeBetRangePct: 0.05,
      continueVs3BetPct: 0.4,
      floatFreq: 0,
      stabFreq: 0,
    };
    const rangeTable = buildRangeTable(createRng(seed), 200);
    const strategy: StrategyConfig = {
      name: '收盲测试',
      openBb: 7,
      openRangePct: 0.5,
      valueBetFreq: 0,
      semiBluffFreq: 0,
      airBluffFreq: 0,
      betSizePct: 0,
    };
    const ctx: SimContext = {
      table,
      callProbability: 0,
      openKeys: keysForTopPercent(rangeTable, 0.5).keys,
      continueKeys: new Set<string>(),
      callKeys: new Set<string>(),
      threeBetKeys: new Set<string>(),
      rng: createRng(seed + 1),
      stats: createStats('收盲测试'),
    };

    runBlock(seed + 2, 2000, strategy, ctx);

    if (ctx.stats.sawFlop !== 0) problems.push(`前注 ${ante}：没人跟注却见了翻牌`);
    const expected = ctx.stats.opens * (deadMoneyBb(table) - ante);
    if (Math.abs(ctx.stats.net - expected) > 0.01) {
      problems.push(
        `前注 ${ante}：收盲 ${ctx.stats.opens} 次净收益 ${ctx.stats.net.toFixed(2)}，解析值应为 ${expected.toFixed(2)}`
      );
    }
  }

  return {
    name: '翻前收盲的账目',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? '前注 0 与 0.5 两档，收盲净收益都与"开池次数 ×（死钱 − 我的前注）"精确相符'
        : problems.join('；'),
  };
}

export function runSelfTest(seed: number, bruteTrials: number, rangeSamples: number): CheckResult[] {
  return [
    checkCategoryOrder(),
    checkWheel(),
    checkFlushVsMade(),
    checkAgainstBruteForce(bruteTrials, seed),
    checkRangeTable(seed, rangeSamples),
    checkStealAccounting(seed),
  ];
}

export function printSelfTest(results: CheckResult[]): boolean {
  console.log('自检');
  console.log('─'.repeat(72));
  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    console.log(`${r.passed ? '通过' : '失败'}  ${r.name}`);
    console.log(`      ${r.detail}`);
  }
  console.log('─'.repeat(72));
  console.log(allPassed ? '全部通过' : '有失败项，先修好再看模拟结果');
  return allPassed;
}
