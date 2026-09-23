// ============================================
// 命令行入口
//
//   node tools/open-size-ev/dist/index.js [--key=value ...]
//
// 默认跑两个策略：
//   开池 7bb  范围 40%  纯诈唬 10%  目标 2.5 名跟注者
//   开池 10bb 范围 22%  纯诈唬 35%  目标 1.5 名跟注者
// 两条策略吃同一批发牌，逐局相减，消掉发牌运气后再比
// ============================================

import {
  printAssumptions,
  printBlockDistribution,
  printComparison,
  printDecomposition,
  printHeader,
  printSensitivity,
  printStrategyDetail,
  SensitivityRow,
  StrategyRun,
} from './report';
import { buildRangeTable, keysForBand, keysForTopPercent, RangeTable } from './range';
import { createRng } from './rng';
import { createStats, runBlock, SimContext, TableConfig, totalHandsPlayed } from './sim';
import { StrategyConfig } from './strategy';
import { printSelfTest, runSelfTest } from './selftest';

interface Options {
  handsPerBlock: number;
  blocks: number;
  sensitivityBlocks: number;
  seed: number;
  rangeSamples: number;
  bruteTrials: number;
  doSelfTest: boolean;
  doSensitivity: boolean;

  tableSize: number;
  stackBb: number;
  smallBlindBb: number;
  bigBlindBb: number;
  /** 每名玩家的前注。9 人桌取 0.5 时，盲注+前注合计 6bb */
  anteBb: number;
  rakePct: number;
  rakeCapBb: number;
  threeBetFreq: number;
  threeBetMultiple: number;
  threeBetRangePct: number;
  continueVs3BetPct: number;
  floatFreq: number;
  stabFreq: number;

  openA: number;
  rangeA: number;
  airA: number;
  callersA: number;
  betA: number;
  openB: number;
  rangeB: number;
  airB: number;
  callersB: number;
  betB: number;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq < 0) out[body] = 'true';
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}

function numArg(args: Record<string, string>, key: string, fallback: number): number {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${key} 需要一个数字，收到 "${raw}"`);
  return value;
}

function intArg(args: Record<string, string>, key: string, fallback: number): number {
  return Math.round(numArg(args, key, fallback));
}

function resolveOptions(args: Record<string, string>): Options {
  return {
    handsPerBlock: intArg(args, 'hands', 1000),
    blocks: intArg(args, 'blocks', 400),
    sensitivityBlocks: intArg(args, 'sensitivity-blocks', 400),
    seed: intArg(args, 'seed', 20260923),
    // 范围表用于**排序**，逐手噪声不影响范围边界的质量；
    // 6000 次是实测下来排序已经稳定、启动又还能忍受的档位
    rangeSamples: intArg(args, 'range-samples', 6000),
    bruteTrials: intArg(args, 'brute', 20000),
    doSelfTest: numArg(args, 'selftest', 1) !== 0,
    doSensitivity: numArg(args, 'sensitivity', 1) !== 0,

    tableSize: intArg(args, 'table', 9),
    stackBb: numArg(args, 'stack', 100),
    smallBlindBb: numArg(args, 'sb', 0.5),
    bigBlindBb: numArg(args, 'bb', 1),
    anteBb: numArg(args, 'ante', 0),
    rakePct: numArg(args, 'rake', 0),
    rakeCapBb: numArg(args, 'rake-cap', 0),
    threeBetFreq: numArg(args, 'threebet', 0.01),
    threeBetMultiple: numArg(args, 'threebet-multiple', 3),
    threeBetRangePct: numArg(args, 'threebet-range', 0.05),
    continueVs3BetPct: numArg(args, 'continue-vs-3bet', 0.4),
    floatFreq: numArg(args, 'float', 0.12),
    stabFreq: numArg(args, 'stab', 0.35),

    openA: numArg(args, 'openA', 7),
    rangeA: numArg(args, 'rangeA', 0.4),
    airA: numArg(args, 'airA', 0.1),
    callersA: numArg(args, 'callersA', 2.5),
    betA: numArg(args, 'betA', 0.55),
    openB: numArg(args, 'openB', 10),
    rangeB: numArg(args, 'rangeB', 0.22),
    airB: numArg(args, 'airB', 0.35),
    callersB: numArg(args, 'callersB', 1.5),
    betB: numArg(args, 'betB', 0.6),
  };
}

function makeTable(options: Options, targetCallers: number): TableConfig {
  return {
    tableSize: options.tableSize,
    stackBb: options.stackBb,
    smallBlindBb: options.smallBlindBb,
    bigBlindBb: options.bigBlindBb,
    anteBb: options.anteBb,
    rakePct: options.rakePct,
    rakeCapBb: options.rakeCapBb,
    targetCallers,
    threeBetFreq: options.threeBetFreq,
    threeBetMultiple: options.threeBetMultiple,
    threeBetRangePct: options.threeBetRangePct,
    continueVs3BetPct: options.continueVs3BetPct,
    floatFreq: options.floatFreq,
    stabFreq: options.stabFreq,
  };
}

function makeContext(
  strategy: StrategyConfig,
  table: TableConfig,
  rangeTable: RangeTable,
  actionSeed: number
): SimContext {
  const opponentCount = table.tableSize - 1;
  // 目标跟注人数反推每人跟注概率。
  // 不要再减 threeBetFreq —— 3-bet 由骰子单独分流，减一次等于把人数目标做少了
  // 对手数 × threeBetFreq
  const callProbability = Math.max(0, table.targetCallers / opponentCount);

  const open = keysForTopPercent(rangeTable, strategy.openRangePct);
  // 跟注范围从 3-bet 范围**之后**开始：顶端那些牌对手是拿来 3-bet 的
  const call = keysForBand(rangeTable, table.threeBetRangePct, table.threeBetRangePct + callProbability);
  const threeBet = keysForTopPercent(rangeTable, table.threeBetRangePct);

  // 面对 3-bet 去跟的那一段 = 开池范围里最强的前 continueVs3BetPct（按组合数算）
  const orderedOpen = rangeTable.ordered.filter((hand) => open.keys.has(hand.key));
  let openCombos = 0;
  for (const hand of orderedOpen) openCombos += hand.combos;
  const cutoff = openCombos * table.continueVs3BetPct;
  const continueKeys = new Set<string>();
  let accumulated = 0;
  for (const hand of orderedOpen) {
    if (accumulated >= cutoff) break;
    continueKeys.add(hand.key);
    accumulated += hand.combos;
  }

  return {
    table,
    callProbability,
    openKeys: open.keys,
    continueKeys,
    callKeys: call.keys,
    threeBetKeys: threeBet.keys,
    rng: createRng(actionSeed),
    stats: createStats(strategy.name),
  };
}

function runStrategy(
  strategy: StrategyConfig,
  table: TableConfig,
  rangeTable: RangeTable,
  blocks: number,
  handsPerBlock: number,
  dealSeed: number,
  actionSeed: number
): StrategyRun {
  const ctx = makeContext(strategy, table, rangeTable, actionSeed);
  const blockNets: number[] = [];
  const blockOpens: number[] = [];

  for (let b = 0; b < blocks; b += 1) {
    // 两条策略用同一个 blockSeed —— 这就是"同一批发牌"的实现方式
    const blockSeed = (dealSeed + b * 7919) >>> 0;
    const outcome = runBlock(blockSeed, handsPerBlock, strategy, ctx);
    blockNets.push(outcome.net);
    blockOpens.push(outcome.opens);
  }

  const open = keysForTopPercent(rangeTable, strategy.openRangePct);
  const opponentCount = table.tableSize - 1;
  const callProbability = Math.max(0, table.targetCallers / opponentCount);
  const call = keysForBand(
    rangeTable,
    table.threeBetRangePct,
    table.threeBetRangePct + callProbability
  );

  return {
    strategy,
    stats: ctx.stats,
    openPct: open.achievedPct,
    callRangePct: call.achievedPct,
    targetCallers: table.targetCallers,
    blockNets,
    blockOpens,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const options = resolveOptions(args);

  if (options.doSelfTest) {
    const passed = printSelfTest(
      runSelfTest(options.seed, options.bruteTrials, Math.max(1500, options.rangeSamples))
    );
    if (!passed) {
      process.exitCode = 1;
      return;
    }
  }

  const started = Date.now();

  const rangeTable = buildRangeTable(createRng(options.seed), options.rangeSamples);
  const tableA = makeTable(options, options.callersA);
  const tableB = makeTable(options, options.callersB);

  const strategyA: StrategyConfig = {
    name: '开池7BB',
    openBb: options.openA,
    openRangePct: options.rangeA,
    valueBetFreq: 0.85,
    semiBluffFreq: 0.5,
    airBluffFreq: options.airA,
    betSizePct: options.betA,
  };
  const strategyB: StrategyConfig = {
    name: '开池10BB',
    openBb: options.openB,
    openRangePct: options.rangeB,
    valueBetFreq: 0.9,
    semiBluffFreq: 0.55,
    airBluffFreq: options.airB,
    betSizePct: options.betB,
  };

  const runA = runStrategy(
    strategyA,
    tableA,
    rangeTable,
    options.blocks,
    options.handsPerBlock,
    options.seed,
    options.seed ^ 0x1234567
  );
  const runB = runStrategy(
    strategyB,
    tableB,
    rangeTable,
    options.blocks,
    options.handsPerBlock,
    options.seed,
    options.seed ^ 0x7654321
  );

  printHeader(tableA, options.handsPerBlock, options.blocks, options.rangeSamples, options.seed);
  printStrategyDetail(runA);
  printStrategyDetail(runB);
  printComparison(runA, runB);
  printBlockDistribution(runA, runB, options.handsPerBlock);
  printAssumptions(options.handsPerBlock);

  // 跟注人数 × 两种策略。
  //
  // 这张表回答的是"结论有多依赖你的前提"：主跑里 7bb 配 2.5 名跟注者、10bb 配 1.5 名
  // （你说的 3-4 人 / 2-3 人底池）。如果两列在每个跟注人数下都不相交，
  // 那"10bb 更赚"就不只是"人数变少"带来的，尺度与范围的组合本身就更值钱
  const callerCounts = [1.0, 1.5, 2.5, 3.5];
  const callerCells: StrategyRun[][] = callerCounts.map((callers, ri) =>
    [strategyA, strategyB].map((strategy, ci) =>
      runStrategy(
        strategy,
        makeTable(options, callers),
        rangeTable,
        options.sensitivityBlocks,
        options.handsPerBlock,
        options.seed,
        options.seed ^ 0x13579bdf ^ (ri * 7 + ci)
      )
    )
  );
  printDecomposition(
    `分解：跟注人数 × 两种策略（每格 ${options.sensitivityBlocks} 局 × ${options.handsPerBlock} 手）`,
    callerCounts.map((c) => `跟注 ${c.toFixed(1)} 人`),
    [strategyA.name, strategyB.name],
    callerCells,
    options.handsPerBlock
  );
  console.log('');
  console.log('  行是"对手有多松"（跟注人数与跟注范围宽度一起变），列是两套策略。');
  console.log('  注意：这张表比的是**同一跟注人数**下的两套策略，不等于你的前提 ——');
  console.log('  你的前提是跨行的（7bb 配 2.5 人、10bb 配 1.5 人），那个比较看上面"10000 手一局"那节。');

  if (options.doSensitivity) {
    // 扫描点的发牌种子与主跑一致，所以各档吃的是**同一批牌**，
    // 档与档之间的差异不会被发牌运气放大
    const sweep = [0.05, 0.1, 0.2, 0.3, 0.4, 0.55];
    const rows: SensitivityRow[] = sweep.map((air) => {
      const variant: StrategyConfig = {
        ...strategyA,
        airBluffFreq: air,
        name: `开池7BB·诈唬${Math.round(air * 100)}%`,
      };
      const run = runStrategy(
        variant,
        tableA,
        rangeTable,
        options.sensitivityBlocks,
        options.handsPerBlock,
        options.seed,
        options.seed ^ 0x2468ace0
      );
      return {
        label: `诈唬 ${Math.round(air * 100)}%`,
        blockNets: run.blockNets,
        blockOpens: run.blockOpens,
      };
    });

    printSensitivity(
      `敏感性：7bb 开池的纯诈唬频率（每档 ${options.sensitivityBlocks} 局 × ${options.handsPerBlock} 手）`,
      rows,
      runB,
      options.handsPerBlock
    );

  }

  const elapsed = (Date.now() - started) / 1000;
  const totalHands = totalHandsPlayed();
  console.log('');
  console.log(
    `耗时 ${elapsed.toFixed(1)}s，共模拟 ${totalHands.toLocaleString('en-US')} 手（含敏感性扫描，${Math.round(
      totalHands / Math.max(0.001, elapsed)
    ).toLocaleString('en-US')} 手/秒）`
  );
}

main();
