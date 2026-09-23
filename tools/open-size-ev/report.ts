// ============================================
// 结果输出
//
// 表格按**显示宽度**补空格而不是按字符串长度：中文在终端里占两格，
// 直接用 length 补出来的表在中文标签那一列会错位
// ============================================

import { deadMoneyBb, StrategyStats, TableConfig } from './sim';
import { StrategyConfig } from './strategy';

export interface StrategyRun {
  strategy: StrategyConfig;
  stats: StrategyStats;
  /** 实际开池范围比例（按格子截断，会略高于请求值） */
  openPct: number;
  /** 对手跟注范围比例 */
  callRangePct: number;
  /** 校准目标：平均跟注人数（无条件） */
  targetCallers: number;
  /** 每个 block 的净收益，长度等于 block 数 */
  blockNets: number[];
  /** 每个 block 的开池手数，与 blockNets 一一对应 */
  blockOpens: number[];
}

const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

export function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const gap = Math.max(0, width - displayWidth(text));
  const fill = ' '.repeat(gap);
  return align === 'left' ? text + fill : fill + text;
}

function fixed(value: number, digits = 2): string {
  const normalized = Math.abs(value) < 0.5 / 10 ** digits ? 0 : value;
  return normalized.toFixed(digits);
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${fixed(value, digits)}`;
}

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  let acc = 0;
  for (const v of values) acc += (v - avg) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

function line(label: string, value: string, labelWidth = 22): string {
  return `  ${pad(label, labelWidth)}${value}`;
}

function rule(char = '─', width = 72): string {
  return char.repeat(width);
}

export function printHeader(
  table: TableConfig,
  handsPerBlock: number,
  blocks: number,
  rangeSamples: number,
  seed: number
): void {
  console.log('');
  console.log('翻前开池尺度对比模拟');
  console.log(rule('═'));
  console.log(line('牌桌', `${table.tableSize} 人桌 / 我在 BTN`));
  const dead = deadMoneyBb(table);
  const deadParts = [`小盲 ${fixed(table.smallBlindBb)}`, `大盲 ${fixed(table.bigBlindBb)}`];
  if (table.anteBb > 0) {
    deadParts.push(`前注 ${fixed(table.anteBb)}×${table.tableSize}`);
  }
  console.log(
    line(
      '筹码',
      `${table.stackBb}bb${
        table.rakePct > 0 ? ` / 抽水 ${pct(table.rakePct)}(上限 ${table.rakeCapBb}bb)` : ' / 无抽水'
      }`
    )
  );
  console.log(line('翻前死钱', `${fixed(dead)}bb = ${deadParts.join(' + ')}`));
  console.log(
    line(
      '样本',
      `每策略 ${(handsPerBlock * blocks).toLocaleString('en-US')} 手 = ${blocks} 组 × ${handsPerBlock} 手`
    )
  );
  console.log(line('范围表抽样', `每种起手牌 ${rangeSamples.toLocaleString('en-US')} 次`));
  console.log(line('随机种子', String(seed)));
  console.log(rule());
}

export function printStrategyDetail(run: StrategyRun): void {
  const { strategy, stats } = run;
  const flopsSeen = stats.sawFlop;
  const meanCallers = flopsSeen > 0 ? stats.callerTotal / flopsSeen : 0;
  const netPer100 = (stats.net / stats.hands) * 100;
  const netPerOpen = stats.opens > 0 ? stats.net / stats.opens : 0;

  console.log('');
  console.log(`${strategy.name}（开池 ${strategy.openBb}bb · 诈唬频率 ${pct(strategy.airBluffFreq, 0)}）`);
  console.log(rule());

  console.log(line('开池范围', `${pct(run.openPct)} （${stats.opens.toLocaleString('en-US')} 手）`));
  console.log(
    line(
      '翻前弃牌',
      `${stats.foldPreflop.toLocaleString('en-US')} 手（${pct(stats.foldPreflop / stats.hands)}）`
    )
  );
  console.log(
    line(
      '翻前直接收盲',
      `${stats.steals.toLocaleString('en-US')} 次（占开池 ${pct(stats.steals / Math.max(1, stats.opens))}）`
    )
  );
  console.log(
    line(
      '遇到 3-bet',
      `${stats.threeBetFaced.toLocaleString('en-US')} 次，其中弃牌 ${stats.threeBetFolds.toLocaleString(
        'en-US'
      )} 次`
    )
  );
  console.log('');
  const unconditional = stats.openCounted > 0 ? stats.openCallerTotal / stats.openCounted : 0;
  console.log(
    line(
      '跟注人数（校准）',
      `目标 ${fixed(run.targetCallers, 2)} / 实际 ${fixed(unconditional, 2)} （全部开池的均值）`
    )
  );
  console.log(
    line(
      '见到翻牌',
      `${flopsSeen.toLocaleString('en-US')} 手，平均 ${fixed(meanCallers + 1, 2)} 人底池（含我，` +
        `条件均值 —— 收盲的 ${stats.steals.toLocaleString('en-US')} 手不进翻牌）`
    )
  );
  console.log(
    line(
      '翻牌开枪',
      `${stats.flopBets.toLocaleString('en-US')} 次，其中直接拿下 ${stats.flopBetTookDown.toLocaleString(
        'en-US'
      )} 次（${pct(stats.flopBetTookDown / Math.max(1, stats.flopBets))}）`
    )
  );
  console.log(
    line(
      '  其中纯诈唬',
      `${stats.airBluffBets.toLocaleString('en-US')} 次，拿下 ${stats.airBluffTookDown.toLocaleString(
        'en-US'
      )} 次（${pct(stats.airBluffTookDown / Math.max(1, stats.airBluffBets))}）`
    )
  );
  console.log(
    line(
      '我过牌后被下注',
      `${stats.stabsFaced.toLocaleString('en-US')} 次（各街累计），弃牌 ${stats.stabsFolded.toLocaleString(
        'en-US'
      )} 次（${pct(stats.stabsFolded / Math.max(1, stats.stabsFaced))}）`
    )
  );
  console.log(
    line(
      '摊牌',
      `${stats.showdowns.toLocaleString('en-US')} 次，赢 ${stats.showdownWins.toLocaleString('en-US')} 次（${pct(
        stats.showdownWins / Math.max(1, stats.showdowns)
      )}）`
    )
  );
  console.log('');
  console.log(line('总盈亏', `${signed(stats.net, 0)} bb`));
  console.log(line('百手收益', `${signed(netPer100, 2)} bb / 100 手`));
  console.log(line('每次开池的期望', `${signed(netPerOpen, 3)} bb`));
  console.log(
    line(
      '赢下的底池均值',
      `${fixed(stats.potWonTotal / Math.max(1, stats.steals + stats.flopBetTookDown + stats.showdownWins), 2)} bb`
    )
  );
}

export function printComparison(runA: StrategyRun, runB: StrategyRun): void {
  const rows: [string, string, string][] = [
    ['开池额', `${runA.strategy.openBb}bb`, `${runB.strategy.openBb}bb`],
    ['开池范围', pct(runA.openPct), pct(runB.openPct)],
    ['纯诈唬频率', pct(runA.strategy.airBluffFreq, 0), pct(runB.strategy.airBluffFreq, 0)],
    [
      '平均几人底池',
      fixed(runA.stats.callerTotal / Math.max(1, runA.stats.sawFlop) + 1, 2),
      fixed(runB.stats.callerTotal / Math.max(1, runB.stats.sawFlop) + 1, 2),
    ],
    [
      '百手收益',
      signed((runA.stats.net / runA.stats.hands) * 100, 2),
      signed((runB.stats.net / runB.stats.hands) * 100, 2),
    ],
    [
      '每次开池期望',
      signed(runA.stats.net / Math.max(1, runA.stats.opens), 3),
      signed(runB.stats.net / Math.max(1, runB.stats.opens), 3),
    ],
  ];

  console.log('');
  console.log('对照');
  console.log(rule());
  console.log(`  ${pad('', 18)}${pad(runA.strategy.name, 16, 'right')}${pad(runB.strategy.name, 16, 'right')}`);
  for (const [label, a, b] of rows) {
    console.log(`  ${pad(label, 18)}${pad(a, 16, 'right')}${pad(b, 16, 'right')}`);
  }
}

/**
 * 用户问的是"1000 手下哪个收益更高"，这一节就是答案。
 *
 * 两条策略跑在**同一批发牌**上，所以逐 block 相减能消掉发牌运气；
 * 但单个 1000 手的 block 本身方差仍然很大 —— 这正是要一并报出来的东西
 */
export function printBlockDistribution(
  runA: StrategyRun,
  runB: StrategyRun,
  handsPerBlock: number
): { meanDiff: number; ciLow: number; ciHigh: number; aWins: number; blocks: number } {
  const sortedA = runA.blockNets.slice().sort((a, b) => a - b);
  const sortedB = runB.blockNets.slice().sort((a, b) => a - b);
  const diffs = runA.blockNets.map((net, i) => net - runB.blockNets[i]);
  const sortedDiff = diffs.slice().sort((a, b) => a - b);

  const meanA = mean(runA.blockNets);
  const meanB = mean(runB.blockNets);
  const meanDiff = mean(diffs);
  const sdDiff = stdDev(diffs, meanDiff);
  const halfWidth = (1.96 * sdDiff) / Math.sqrt(Math.max(1, diffs.length));

  let aWins = 0;
  for (const d of diffs) if (d > 0) aWins += 1;
  const aProfitable = runA.blockNets.filter((n) => n > 0).length;
  const bProfitable = runB.blockNets.filter((n) => n > 0).length;

  console.log('');
  console.log(`${handsPerBlock} 手一局的结果分布（共 ${runA.blockNets.length} 局）`);
  console.log(rule());
  console.log(`  ${pad('', 22)}${pad(runA.strategy.name, 16, 'right')}${pad(runB.strategy.name, 16, 'right')}`);
  console.log(
    `  ${pad('平均', 22)}${pad(signed(meanA, 1), 16, 'right')}${pad(signed(meanB, 1), 16, 'right')}`
  );
  console.log(
    `  ${pad('中位数', 22)}${pad(signed(percentile(sortedA, 0.5), 1), 16, 'right')}${pad(
      signed(percentile(sortedB, 0.5), 1),
      16,
      'right'
    )}`
  );
  console.log(
    `  ${pad('运气差的 5%', 22)}${pad(signed(percentile(sortedA, 0.05), 1), 16, 'right')}${pad(
      signed(percentile(sortedB, 0.05), 1),
      16,
      'right'
    )}`
  );
  console.log(
    `  ${pad('运气好的 95%', 22)}${pad(signed(percentile(sortedA, 0.95), 1), 16, 'right')}${pad(
      signed(percentile(sortedB, 0.95), 1),
      16,
      'right'
    )}`
  );
  console.log(
    `  ${pad('盈利局占比', 22)}${pad(pct(aProfitable / runA.blockNets.length), 16, 'right')}${pad(
      pct(bProfitable / runB.blockNets.length),
      16,
      'right'
    )}`
  );

  console.log('');
  console.log(
    `  两策略差值（${runA.strategy.name} − ${runB.strategy.name}）：平均 ${signed(meanDiff, 1)} bb / ${handsPerBlock} 手`
  );
  console.log(
    `  95% 置信区间 [${fixed(meanDiff - halfWidth, 1)}, ${fixed(meanDiff + halfWidth, 1)}] bb`
  );
  console.log(
    `  ${runA.strategy.name} 更赚的局占比 ${pct(aWins / diffs.length)}（中位数差值 ${signed(
      percentile(sortedDiff, 0.5),
      1
    )} bb）`
  );

  return { meanDiff, ciLow: meanDiff - halfWidth, ciHigh: meanDiff + halfWidth, aWins, blocks: diffs.length };
}

export interface SensitivityRow {
  label: string;
  blockNets: number[];
  blockOpens: number[];
}

/** 每局的开池期望。逐局算再平均，才带得出标准误 */
function perOpenSeries(nets: number[], opens: number[]): number[] {
  return nets.map((net, i) => net / Math.max(1, opens[i]));
}

function halfWidth95(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return (1.96 * stdDev(values, avg)) / Math.sqrt(values.length);
}

/**
 * 敏感性扫描。
 *
 * **必须带 95% 区间**：一个 1000 手的 block 本身标准差就有上千 bb，几档扫描值之间
 * 差个一两百 bb 完全可能是噪声。不标区间的话，扫描表看上去全是结构，其实是随机起伏
 */
export function printSensitivity(
  title: string,
  rows: SensitivityRow[],
  reference: StrategyRun,
  handsPerBlock: number
): void {
  console.log('');
  console.log(title);
  console.log(rule('─', 88));
  console.log(
    `  ${pad('取值', 16)}${pad('每次开池期望', 16, 'right')}${pad(
      `每 ${handsPerBlock} 手`,
      12,
      'right'
    )}${pad('95% 区间', 24, 'right')}`
  );

  const printRow = (label: string, nets: number[], opens: number[], suffix: string) => {
    const perOpen = perOpenSeries(nets, opens);
    const meanBlock = mean(nets);
    const half = halfWidth95(nets);
    console.log(
      `  ${pad(label, 16)}${pad(signed(mean(perOpen), 3), 16, 'right')}${pad(
        signed(meanBlock, 1),
        12,
        'right'
      )}${pad(`[${fixed(meanBlock - half, 0)}, ${fixed(meanBlock + half, 0)}]`, 24, 'right')}${suffix}`
    );
  };

  for (const row of rows) printRow(row.label, row.blockNets, row.blockOpens, '');
  printRow(
    '对照',
    reference.blockNets,
    reference.blockOpens,
    `  ← ${reference.strategy.name}`
  );
}

/**
 * 二维分解。
 *
 * "10bb 更赚"这句话里其实混了两个主张：尺度变大、范围收紧。
 * 把它们拆成 2×2 才能看出钱是哪一项赚来的 —— 摊在一张表里比看两行汇总清楚
 */
export function printDecomposition(
  title: string,
  rowLabels: string[],
  colLabels: string[],
  cells: StrategyRun[][],
  handsPerBlock: number
): void {
  console.log('');
  console.log(title);
  console.log(rule('─', 76));
  console.log(
    `  ${pad('每次开池期望', 20)}${colLabels.map((c) => pad(c, 20, 'right')).join('')}`
  );
  for (let r = 0; r < rowLabels.length; r += 1) {
    const parts = cells[r].map((run) =>
      pad(`${signed(run.stats.net / Math.max(1, run.stats.opens), 3)}`, 20, 'right')
    );
    console.log(`  ${pad(rowLabels[r], 20)}${parts.join('')}`);
  }

  console.log('');
  console.log(`  每 ${handsPerBlock} 手（含 95% 区间）`);
  const intervals: { low: number; high: number }[][] = [];
  for (let r = 0; r < rowLabels.length; r += 1) {
    intervals.push([]);
    for (let c = 0; c < colLabels.length; c += 1) {
      const run = cells[r][c];
      const meanBlock = mean(run.blockNets);
      const half = halfWidth95(run.blockNets);
      intervals[r].push({ low: meanBlock - half, high: meanBlock + half });
      console.log(
        `    ${pad(`${rowLabels[r]} · ${colLabels[c]}`, 22)}${pad(
          `${signed(meanBlock, 1)}  [${fixed(meanBlock - half, 0)}, ${fixed(meanBlock + half, 0)}]`,
          24,
          'right'
        )}`
      );
    }
  }

  // 两列的可比性由数据说话，不能写成固定结论 ——
  // 换个参数区间就可能从"每行都不相交"变成"多数行重叠"
  if (colLabels.length === 2) {
    let separated = 0;
    let higher = 0;
    for (let r = 0; r < rowLabels.length; r += 1) {
      const [a, b] = intervals[r];
      if (a.high < b.low || b.high < a.low) separated += 1;
      if (mean(cells[r][1].blockNets) > mean(cells[r][0].blockNets)) higher += 1;
    }
    console.log('');
    console.log(
      `  同一跟注人数下，${colLabels[1]} 在 ${higher}/${rowLabels.length} 行上更高；`
    );
    console.log(
      `  两列 95% 区间不相交的有 ${separated}/${rowLabels.length} 行 —— 不相交的行越多，说明`
    );
    console.log(
      `  "尺度 + 范围"这个组合本身的价值越确实，而不只是"跟注人数变少"带来的。`
    );
  }
}

export function printAssumptions(handsPerBlock: number): void {
  console.log('');
  console.log('模型说明（结论依赖这几条假设，改动看 README）');
  console.log(rule());
  const notes = [
    '"3-4 人底池"按**含我在内的总人数**理解，所以 7bb 开池取 2.5 名跟注者、',
    '  10bb 取 1.5 名；每名对手的跟注概率由此反推。',
    '跟注范围取的是**去掉顶端之后**那一段：顶端的好牌对手拿去 3-bet 了。',
    '  直接让对手用"胜率最高的前 N%"来跟注是错的 —— 那样对手的平均牌比我还强，',
    '  我会在多人摊牌里系统性吃亏，结论会整个反过来。',
    '翻后对手只会跟注或弃牌，不会加注 —— 我拿不到被加注时的信息，底池也不会失控。',
    '我过牌后最多一名对手下注，其余人弃牌。',
    '面对 3-bet 我用开池范围最强的一段去跟，跟注后翻牌先过牌（我是跟注方）。',
    '遇到 3-bet 就弃牌时我直接损失开池额，而开池越大损失越多 ——',
    '  这一项偏袒小尺度开池，所以 10bb 的领先是在逆风下取得的。',
    `每局固定 ${handsPerBlock} 手，两条策略吃同一批发牌，逐局相减以消掉发牌运气。`,
  ];
  for (const note of notes) console.log(`  ${note}`);
}
