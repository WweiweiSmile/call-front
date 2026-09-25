// ============================================
// 赔率算术对拍
//
//   npm run check:odds
//
// 拿 src/utils/potOdds.ts 里的**唯一公式**去复算 odds-table.md 的全部四张表。
//
// 为什么做成常驻工具而不是临时脚本：它守的是**漂移**。
// odds-table.md 是后端技能层文件，改了它，前端训练器不会自动跟着改；
// 引擎被人重构也一样。任何一边动了、这个脚本就变红 —— 这是整个训练功能里
// 最值钱的一道闸。改技能层文档后要回查的清单里，本脚本算第四处。
//
// 表里的数字是**从 odds-table.md 逐格抄下来的**（文档是"期望"，公式是"实际"），
// 抄的时候不要顺手"修"成算出来的值，否则这道闸就白设了
// ============================================

import { createRng } from '../open-size-ev/rng';
import {
  DrillAttempt,
  MAX_WRONG_KEPT,
  accuracyOf,
  applyAttempt,
  averageMs,
  emptyProgress,
  formatSeconds,
  parseProgress,
  serializeProgress,
} from '../../src/utils/oddsDrillProgress';
import {
  Difficulty,
  Drill,
  DrillKind,
  DEFAULT_TOLERANCE,
  VERDICT_MARGIN,
  betsFor,
  generateDrill,
  kindAt,
  parseEquityInput,
} from '../../src/utils/oddsDrill';
import {
  docPercent,
  equityToPotOdds,
  fractionLabel,
  largestCallable,
  maxCallFraction,
  NAMED_BET_FRACTIONS,
  outsToEquity,
  potOddsToEquity,
  requiredEquity,
} from '../../src/utils/potOdds';

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

/** 池记成 1，对手下注 fraction 倍池时的门槛 */
const faceBetEquity = (fraction: number): number =>
  requiredEquity({ pot: 1, bet: fraction });

// ============================================
// 文档表格（逐格抄自 odds-table.md，勿改）
// ============================================

/** 表 1 面对下注 */
const DOC_TABLE_1: Array<[number, number]> = [
  [1 / 4, 17], [1 / 3, 20], [1 / 2, 25], [2 / 3, 29], [3 / 4, 30],
  [1, 33], [1.5, 38], [2, 40], [3, 43], [5, 45], [10, 48],
];

/** 表 2 我先下注、对手加注：行是"我的下注"，列是加注倍数 */
const DOC_TABLE_2: Array<{ bet: number; xs: Array<[number, number]> }> = [
  { bet: 1 / 3, xs: [[2, 14], [2.5, 19], [3, 22], [4, 27]] },
  { bet: 1 / 2, xs: [[2, 17], [2.5, 21], [3, 25], [4, 30]] },
  { bet: 2 / 3, xs: [[2, 18], [2.5, 23], [3, 27], [4, 32]] },
  { bet: 1, xs: [[2, 20], [2.5, 25], [3, 29], [4, 33]] },
];

/** 表 3 反查：已知胜率，最多能跟多大 */
const DOC_TABLE_3: Array<[number, string]> = [
  [17, '1/4 池'], [20, '1/3 池'], [25, '1/2 池'], [29, '2/3 池'],
  [33, '1 倍池'], [38, '1.5 倍池'], [40, '2 倍池'], [45, '5 倍池'],
];

/** 表 4 听牌换算：outs → [双街, 单街] */
const DOC_TABLE_4: Array<[number, number, number]> = [
  // 卡顺那格 2026-09-24 由 17% 订正为 16%（精确 16.47%，取整就是 16）。
  // 改这里必须同时改 ~/codes/call-back/services/skills/odds-table.md ——
  // 两边不一致时本脚本会红，这正是它的用途
  [4, 16, 9], [6, 24, 13], [8, 31, 17], [9, 35, 20], [12, 45, 26], [15, 54, 33],
];

// ============================================
// 逐格对拍
// ============================================

function checkTable1(): CheckResult {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const [fraction, doc] of DOC_TABLE_1) {
    const exact = faceBetEquity(fraction);
    const actual = docPercent(exact);
    lines.push(`${fractionLabel(fraction)} 精确 ${(exact * 100).toFixed(2)}% 取整 ${actual}% 文档 ${doc}%`);
    if (actual !== doc) problems.push(`${fractionLabel(fraction)}：算出 ${actual}%，文档 ${doc}%`);
  }
  return {
    name: '表 1 面对下注（11 格）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? lines.join('\n      ') : problems.join('；'),
  };
}

function checkTable2(): CheckResult {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const { bet, xs } of DOC_TABLE_2) {
    for (const [multiple, doc] of xs) {
      // 我下注 b、对手加注到 X·b：我要补 b(X−1)，跟注后的池 = 1 + 2Xb
      const exact =
        requiredEquity({ pot: 1, bet, raiseTo: bet * multiple });
      const actual = docPercent(exact);
      lines.push(
        `我下注 ${fractionLabel(bet)} / 对手加注到 ${multiple} 倍：` +
          `精确 ${(exact * 100).toFixed(2)}% 取整 ${actual}% 文档 ${doc}%`,
      );
      if (actual !== doc) {
        problems.push(`${fractionLabel(bet)}×${multiple}：算出 ${actual}%，文档 ${doc}%`);
      }
    }
  }
  return {
    name: '表 2 我先下注、对手加注（16 格）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? lines.join('\n      ') : problems.join('；'),
  };
}

function checkTable3(): CheckResult {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const [percent, docLabel] of DOC_TABLE_3) {
    const actual = largestCallable(NAMED_BET_FRACTIONS, percent / 100);
    const actualLabel = actual === null ? '无' : fractionLabel(actual);
    lines.push(`胜率 ${percent}% → 取整口径 ${actualLabel}，文档 ${docLabel}`);
    if (actualLabel !== docLabel) {
      problems.push(`胜率 ${percent}%：算出 ${actualLabel}，文档 ${docLabel}`);
    }
  }
  return {
    name: '表 3 反查（8 格，走文档取整口径）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? lines.join('\n      ') : problems.join('；'),
  };
}

function checkTable4(): CheckResult {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const [outs, docTwo, docOne] of DOC_TABLE_4) {
    const turn = outsToEquity(outs, 'turn');
    const turnActual = docPercent(turn.exact);
    lines.push(
      `outs=${outs} 单街：精确 ${(turn.exact * 100).toFixed(2)}% 取整 ${turnActual}% 文档 ${docOne}%`,
    );
    if (turnActual !== docOne) {
      problems.push(`outs=${outs} 单街：算出 ${turnActual}%，文档 ${docOne}%`);
    }

    const flop = outsToEquity(outs, 'flop');
    const flopActual = docPercent(flop.exact);
    const gap = Math.abs(docTwo - flop.exact * 100);
    lines.push(
      `outs=${outs} 双街：精确 ${(flop.exact * 100).toFixed(2)}% 取整 ${flopActual}% 文档 ${docTwo}%` +
        `（差 ${gap.toFixed(2)}pp）`,
    );

    // 这里曾经有一处例外（2026-09-24 之前）：文档把卡顺双街写成 17%，
    // 而精确值 16.47% 取整是 16 —— 既不是精确值也不是它的取整，是文档自身的一处
    // 内部不一致。**该格已订正为 16%，12 格现在全部按等式比较。**
    // 记着这段历史有用：它说明「取整口径」这类偏差是能被这个脚本抓出来的
    if (flopActual !== docTwo) {
      problems.push(`outs=${outs} 双街：算出 ${flopActual}%，文档 ${docTwo}%`);
    }
  }
  return {
    name: '表 4 听牌换算（12 格，全部按等式比较）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? lines.join('\n      ') : problems.join('；'),
  };
}

// ============================================
// 公式自身的不变量
// ============================================

/** 文档每一格的取整值都必须落在判分容差内 —— 否则"照着文档答"会被判错 */
function checkToleranceCoversDoc(): CheckResult {
  const problems: string[] = [];
  let worst = 0;
  let worstAt = '';

  const note = (exact: number, docPercentValue: number, where: string): void => {
    const gap = Math.abs(docPercentValue - exact * 100);
    if (gap > worst) {
      worst = gap;
      worstAt = where;
    }
    if (gap > DEFAULT_TOLERANCE * 100) {
      problems.push(`${where}：文档 ${docPercentValue}% 距精确值 ${gap.toFixed(2)}pp，超出容差`);
    }
  };

  for (const [fraction, doc] of DOC_TABLE_1) note(faceBetEquity(fraction), doc, `表1 ${fractionLabel(fraction)}`);
  for (const { bet, xs } of DOC_TABLE_2) {
    for (const [multiple, doc] of xs) {
      note(requiredEquity({ pot: 1, bet, raiseTo: bet * multiple }), doc, `表2 ${fractionLabel(bet)}×${multiple}`);
    }
  }
  for (const [outs, docTwo, docOne] of DOC_TABLE_4) {
    note(outsToEquity(outs, 'flop').exact, docTwo, `表4 outs=${outs} 双街`);
    note(outsToEquity(outs, 'turn').exact, docOne, `表4 outs=${outs} 单街`);
  }

  return {
    name: `容差覆盖（${DEFAULT_TOLERANCE * 100}pp）`,
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `文档全部取整值都在容差内；最大偏差 ${worst.toFixed(2)}pp（${worstAt}）`
        : problems.join('；'),
  };
}

/** 胜率过半就是优势，跟多大都对：门槛必须永远趋近但到不了 50% */
function checkMonotonicAndBounded(): CheckResult {
  const problems: string[] = [];
  let previous = 0;
  for (let fraction = 0.05; fraction <= 100; fraction += 0.05) {
    const equity = faceBetEquity(fraction);
    if (equity <= previous) {
      problems.push(`${fraction.toFixed(2)} 倍池的门槛没有大于上一档`);
      break;
    }
    if (equity >= 0.5) {
      problems.push(`${fraction.toFixed(2)} 倍池的门槛 ${(equity * 100).toFixed(2)}% 达到了 50%`);
      break;
    }
    previous = equity;
  }
  // 10 倍池是文档点名的极限档
  const ten = faceBetEquity(10);
  if (docPercent(ten) !== 48) problems.push(`10 倍池算出 ${(ten * 100).toFixed(2)}%，应为 48%`);

  return {
    name: '单调且永不过半',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `0.05→100 倍池严格递增，最大 100 倍池 ${(faceBetEquity(100) * 100).toFixed(2)}%；10 倍池 48%`
        : problems.join('；'),
  };
}

function checkOddsRoundTrip(): CheckResult {
  const problems: string[] = [];
  for (let percent = 1; percent < 100; percent += 1) {
    const equity = percent / 100;
    const back = potOddsToEquity(equityToPotOdds(equity));
    if (Math.abs(back - equity) > 1e-12) {
      problems.push(`${percent}% 换算回来是 ${back}`);
      break;
    }
  }
  return {
    name: '赔率 ↔ 胜率 互逆',
    passed: problems.length === 0,
    detail: problems.length === 0 ? '99 个整数百分比全部往返一致' : problems.join('；'),
  };
}

function checkMaxCallBoundary(): CheckResult {
  const problems: string[] = [];
  if (maxCallFraction(0.5) !== null) problems.push('胜率 50% 应返回 null（无上限）');
  if (maxCallFraction(0.6) !== null) problems.push('胜率 60% 应返回 null（无上限）');
  const justUnder = maxCallFraction(0.49);
  if (justUnder === null || justUnder <= 1) {
    problems.push(`胜率 49% 应给一个很大的可用尺度，实际 ${justUnder}`);
  }
  // 与文档表 3 同源：20% 时精确边界应略小于 1/3 池
  const twenty = maxCallFraction(0.2);
  if (twenty === null || Math.abs(twenty - 1 / 3) > 1e-9) {
    problems.push(`胜率 20% 的精确边界应为 1/3 池，实际 ${twenty}`);
  }
  return {
    name: '反查边界',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? '50% 与 60% 均返回 null（无上限）；49% 给出有限的大尺度；20% 精确边界 = 1/3 池'
        : problems.join('；'),
  };
}

/** 同一个种子必须给出同一套题，否则 e2e 没法断言、出问题没法复现 */
function checkReproducible(): CheckResult {
  const SEED = 20260924;
  const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];

  // 与页面一致：按 kindAt 的循环出一整组，逐档跑
  const run = (): string => {
    const rng = createRng(SEED);
    const drills: Drill[] = [];
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 10; i += 1) {
        drills.push(generateDrill(kindAt(difficulty, i), difficulty, rng.next));
      }
    }
    return JSON.stringify(drills);
  };

  const first = run();
  const second = run();
  if (first !== second) {
    return { name: '同种子可复现（4 档 × 10 题）', passed: false, detail: '两次生成的结果不一致' };
  }

  const drills = JSON.parse(first) as Drill[];
  const bad = drills.filter((d) => d.choices.length > 0 && !d.choices.includes(d.expected));
  if (bad.length > 0) {
    return {
      name: '同种子可复现（4 档 × 10 题）',
      passed: false,
      detail: `${bad.length} 道选择题的选项里不含正确答案：${bad[0].prompt}`,
    };
  }
  return {
    name: '同种子可复现（4 档 × 10 题）',
    passed: true,
    detail: `两次生成完全一致；${drills.length} 道题的选项与答案自洽`,
  };
}

/** 出题器给的答案必须与引擎口径一致，且容差能容下文档取整值 */

function checkDrillAnswers(): CheckResult {
  const problems: string[] = [];
  const rng = createRng(7);
  const KINDS: DrillKind[] = [
    'face-bet',
    'after-raise',
    'outs-to-equity',
    'max-call',
    'call-or-fold',
  ];
  const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];
  let count = 0;

  for (const difficulty of DIFFICULTIES) {
    for (const kind of KINDS) {
      // 每档每题型出 20 道，覆盖面比"M 道随机"更整齐
      for (let i = 0; i < 20; i += 1) {
        const drill = generateDrill(kind, difficulty, rng.next);
        count += 1;
        const where = `档${difficulty}/${kind}：${drill.prompt}`;

        if (drill.kind !== kind) problems.push(`${where} → 出成了 ${drill.kind}`);

        // 只有「跟注门槛」这一类答案才必然小于 50%。
        // T3 问的是**成牌概率**，15 outs 双街是 54% —— 那是合法答案，不是门槛
        if (drill.kind === 'face-bet' || drill.kind === 'after-raise') {
          if (!(drill.expected > 0 && drill.expected < 0.5)) {
            problems.push(`门槛落在 (0, 50%) 之外：${drill.expected}（${where}）`);
          }
        }
        if (drill.answerKind === 'equity' && !(drill.expected > 0 && drill.expected < 1)) {
          problems.push(`胜率答案超出 (0, 100%)：${drill.expected}（${where}）`);
        }

        if (drill.answerKind === 'fraction') {
          // 反查的答案必须落在**本档允许的尺度池**里：入门档只练 1/3、1/2、1 倍池，
          // 出成 1/4 池就与设计冲突了（这个断言抓过一次真 bug）
          if (!betsFor(drill.difficulty).includes(drill.expected)) {
            problems.push(
              `反查答案不在档${drill.difficulty}的尺度池里：${drill.expected}（${where}）`,
            );
          }
        }

        if (drill.answerKind === 'verdict') {
          if ((drill.expected === 1) !== (drill.verdict === 'call')) {
            problems.push(`判断题的 verdict 与 expected 不一致：${where}`);
          }
          if ((drill.margin ?? 0) < VERDICT_MARGIN) {
            problems.push(
              `判断题余量 ${(drill.margin ?? 0).toFixed(3)} 小于 ${VERDICT_MARGIN}：${where}`,
            );
          }
        }

        // 有选项的题，正确答案必须在选项里（M1 抓到过的那个 bug）
        if (drill.choices.length > 0) {
          if (drill.choices.length !== 4) {
            problems.push(`选择题应有 4 个选项，实际 ${drill.choices.length}：${where}`);
          }
          if (!drill.choices.includes(drill.expected)) {
            problems.push(`选项里没有正确答案：${where}`);
          }
        }

        // 填空题只在胜率题上出现（反查是档位、判断是两个按钮）
        if (drill.choices.length === 0 && drill.answerKind !== 'equity' && drill.answerKind !== 'verdict') {
          problems.push(`非胜率题不该没有选项：${where}`);
        }
      }
    }
  }

  return {
    name: `出题答案自洽（${count} 题 = 4 档 × 5 题型 × 20）`,
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? '每道题的答案、选项、判定余量都与题型和引擎口径自洽'
        : problems.slice(0, 3).join('；'),
  };
}

/** 四二法则：翻牌 outs×4、转牌 outs×2，且文档指明 outs ≥ 15 会高估 */
function checkFourTwoRule(): CheckResult {
  const problems: string[] = [];
  for (let outs = 1; outs <= 15; outs += 1) {
    const flop = outsToEquity(outs, 'flop');
    const turn = outsToEquity(outs, 'turn');
    if (Math.abs(flop.rule - (outs * 4) / 100) > 1e-12) {
      problems.push(`翻牌 ${outs} outs 的四二法则不是 ×4`);
    }
    if (Math.abs(turn.rule - (outs * 2) / 100) > 1e-12) {
      problems.push(`转牌 ${outs} outs 的四二法则不是 ×2`);
    }
  }
  // 文档原话：「outs 达到 15 张以上时四法则会高估」
  const fifteen = outsToEquity(15, 'flop');
  if (fifteen.rule <= fifteen.exact) {
    problems.push('15 outs 时四二法则没有高估，与文档的说明不符');
  }
  const nine = outsToEquity(9, 'flop');
  if (nine.rule <= nine.exact) {
    problems.push('9 outs 时四二法则就已经高估了，与文档的说明不符');
  }
  return {
    name: '四二法则（翻牌 ×4 / 转牌 ×2）',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `1~15 outs 的 ×2/×4 全对；15 outs 时高估（60% vs 精确 54.12%），9 outs 时不高估（36% vs 34.97%）`
        : problems.join('；'),
  };
}

/**
 * 文档 §十 推论② 的范围：**9 张 outs 及以下**。
 *
 * 这句原文曾写作「用**任何**听牌跟注都是错误」，是过度概括 ——
 * 组合听牌 12 outs（26.09%）与 15 outs（32.61%）的单街胜率都超过 1/2 池的 25% 门槛。
 * 2026-09-24 已把文档订正为带范围的版本（见 赔率训练设计文档.md §2.8）。
 *
 * 这条断言仍然要留着，而且**正是为了防它被改回去**：
 * 边界是 4 个「跟注是错的」+ 2 个「反例」，任何一边动了都会红。
 * T5 的题目按数学判对错，如果哪天有人"改回推论②的宽范围"、连带改了出题逻辑，
 * 这里会先红
 */
function checkVerdictRuleBounds(): CheckResult {
  const HALF_POT = requiredEquity({ pot: 1, bet: 1 / 2 });
  const problems: string[] = [];
  const folds: string[] = [];
  const calls: string[] = [];

  for (const [name, outs] of [['卡顺', 4], ['两张高牌', 6], ['两头顺', 8], ['同花听', 9], ['同花听+卡顺', 12], ['同花听+两头顺', 15]] as Array<[string, number]>) {
    const actual = outsToEquity(outs, 'turn').exact;
    (actual >= HALF_POT ? calls : folds).push(`${name}(${outs}) ${(actual * 100).toFixed(2)}%`);
  }

  // 9 outs 及以下必须都是"跟注是错的"
  if (folds.length !== 4) problems.push(`预期 4 种听牌跟注是错的，实际 ${folds.length}`);
  // 组合听牌必须构成反例 —— 这是文档那句话站不住的地方
  if (calls.length !== 2) {
    problems.push(`预期 2 种组合听牌构成反例，实际 ${calls.length}`);
  }

  return {
    name: '推论② 的真实边界（≤9 outs）',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `门槛 25% ｜ 跟注是错的：${folds.join('、')} ｜ 构成反例：${calls.join('、')}`
        : problems.join('；'),
  };
}

/** 填空题的三种写法都要认 */
function checkParseEquityInput(): CheckResult {
  const problems: string[] = [];
  const accepts: Array<[string, number]> = [
    ['20', 0.2],
    ['20%', 0.2],
    ['0.2', 0.2],
    [' 25 ', 0.25],
    ['25%', 0.25],
    ['0.05', 0.05],
    ['5.5%', 0.055],
    ['.5', 0.5],
  ];
  const rejects = ['', '  ', 'abc', '%', '1/3', '--5', '20%%'];

  for (const [raw, expected] of accepts) {
    const parsed = parseEquityInput(raw);
    if (parsed === null || Math.abs(parsed - expected) > 1e-12) {
      problems.push(`「${raw}」应为 ${expected}，实际 ${parsed}`);
    }
  }
  for (const raw of rejects) {
    if (parseEquityInput(raw) !== null) problems.push(`「${raw}」不该被接受`);
  }

  return {
    name: '填空题解析（20 / 20% / 0.2）',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `${accepts.length} 种写法全部认；${rejects.length} 种垃圾输入全部拒`
        : problems.join('；'),
  };
}

/** 每个难度的题型循环都要覆盖到设计里写明的题型 */
function checkKindCycle(): CheckResult {
  const problems: string[] = [];
  const seen: string[] = [];

  for (const difficulty of [1, 2, 3, 4] as Difficulty[]) {
    const kinds = new Set<DrillKind>();
    for (let i = 0; i < 10; i += 1) kinds.add(kindAt(difficulty, i));
    seen.push(`档${difficulty}: ${[...kinds].join('/')}`);

    if (difficulty === 1 && kinds.has('call-or-fold')) {
      problems.push('入门档不该出判断题');
    }
    if (difficulty === 4 && !kinds.has('call-or-fold')) {
      problems.push('混合档没出判断题，与设计不符');
    }
    if (kinds.size < 3) problems.push(`档${difficulty} 一组只有 ${kinds.size} 种题型，覆盖太少`);
  }

  return {
    name: '题型循环覆盖（一组 10 题）',
    passed: problems.length === 0,
    detail: problems.length === 0 ? seen.join(' ｜ ') : problems.join('；'),
  };
}

// ============================================
// 进度存储（纯逻辑部分）
//
// 这一组能常驻跑，正是把 oddsDrillProgress.ts 与 oddsDrillStorage.ts 拆开的原因：
// 后者 import 了 Taro，进不了 node
// ============================================

function fakeDrill(kind: DrillKind, prompt: string, expected = 0.25): Drill {
  return {
    kind,
    difficulty: 2,
    prompt,
    answerKind: 'equity',
    expected,
    tolerance: DEFAULT_TOLERANCE,
    choices: [expected],
    steps: [],
  };
}

function fakeAttempt(drill: Drill, correct: boolean, elapsedMs = 1000): DrillAttempt {
  return { drill, input: correct ? drill.expected : 0.5, correct, elapsedMs };
}

/** 累计、错题进出、上限、纯函数性 */
function checkProgressLogic(): CheckResult {
  const problems: string[] = [];
  const base = emptyProgress();

  if (base.total !== 0 || base.wrong.length !== 0) problems.push('空进度不是空的');
  if (base.byKind['face-bet'].total !== 0) problems.push('空进度的 byKind 不是零');

  const a = fakeDrill('face-bet', '题 A');
  const b = fakeDrill('max-call', '题 B');

  // 答对一次
  const afterCorrect = applyAttempt(base, fakeAttempt(a, true), 1);
  if (afterCorrect.total !== 1 || afterCorrect.correct !== 1) {
    problems.push(`答对一次后累计应为 1/1，实际 ${afterCorrect.correct}/${afterCorrect.total}`);
  }
  if (afterCorrect.byKind['face-bet'].total !== 1) problems.push('byKind 没记上');
  if (afterCorrect.bestStreak !== 1) problems.push('bestStreak 没跟上');
  if (afterCorrect.wrong.length !== 0) problems.push('答对不该进错题');

  // 纯函数：不能改传入的那个
  if (base.total !== 0 || base.byKind['face-bet'].total !== 0) {
    problems.push('applyAttempt 改了传入的进度对象（不是纯函数）');
  }

  // 答错一次 → 进错题
  const afterWrong = applyAttempt(afterCorrect, fakeAttempt(b, false), 0);
  if (afterWrong.wrong.length !== 1 || afterWrong.wrong[0].drill.prompt !== '题 B') {
    problems.push('答错没进错题');
  }
  if (afterWrong.bestStreak !== 1) problems.push('答错后历史最高连击被覆盖了');
  if (afterWrong.byKind['max-call'].total !== 1) problems.push('错题的 byKind 没记上');

  // 重练答对 → 出列
  const afterResolved = applyAttempt(afterWrong, fakeAttempt(b, true), 1);
  if (afterResolved.wrong.length !== 0) {
    problems.push('重练答对后错题没有出列');
  }
  if (afterResolved.correct !== 2 || afterResolved.total !== 3) {
    problems.push('重练要计入累计次数');
  }

  // 错题条数有上限
  let many = emptyProgress();
  for (let i = 0; i < MAX_WRONG_KEPT + 8; i += 1) {
    many = applyAttempt(many, fakeAttempt(fakeDrill('face-bet', `题 ${i}`), false), 0);
  }
  if (many.wrong.length !== MAX_WRONG_KEPT) {
    problems.push(`错题应封顶在 ${MAX_WRONG_KEPT} 条，实际 ${many.wrong.length}`);
  }
  // 最新答错的在最前面
  if (many.wrong[0].drill.prompt !== `题 ${MAX_WRONG_KEPT + 7}`) {
    problems.push('错题不是最新的在前');
  }

  // 派生值
  if (accuracyOf(emptyProgress()) !== 0) problems.push('没答过时正确率应为 0');
  if (accuracyOf(afterResolved) !== 67) {
    problems.push(`2/3 的正确率应为 67%，实际 ${accuracyOf(afterResolved)}`);
  }
  if (averageMs([]) !== 0) problems.push('没答过时平均耗时应为 0');
  if (averageMs([fakeAttempt(a, true, 1000), fakeAttempt(b, true, 3000)]) !== 2000) {
    problems.push('平均耗时算错');
  }
  if (formatSeconds(4200) !== '4.2') problems.push(`4200ms 应显示 4.2，实际 ${formatSeconds(4200)}`);

  return {
    name: '进度逻辑（累计 / 错题进出 / 上限 / 纯函数）',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `累计、byKind、历史最高连击、错题进出与 ${MAX_WRONG_KEPT} 条上限都对；传入对象未被改动`
        : problems.join('；'),
  };
}

/**
 * 存储里读到脏数据不能崩。
 *
 * 存的可能是：旧版本结构、被手工改过的值、写到一半失败的写入。
 * 一抛错整个页面就白屏，所以解析必须**永远返回一个能用的进度对象**
 */
function checkProgressParsing(): CheckResult {
  const problems: string[] = [];

  const garbage: unknown[] = [
    '',
    '   ',
    '{{{ 不是 json',
    'null',
    'undefined',
    '123',
    'true',
    null,
    undefined,
    [],
    {},
    { total: 'abc' },
    { total: -5 },
    { total: 5, correct: 99 },
  ];

  for (const raw of garbage) {
    const parsed = parseProgress(raw);
    if (typeof parsed.total !== 'number' || !Number.isFinite(parsed.total)) {
      problems.push(`脏数据 ${JSON.stringify(raw)} 解析出了非数字 total`);
      continue;
    }
    if (parsed.correct > parsed.total) {
      problems.push(`脏数据 ${JSON.stringify(raw)} 的 correct 超过了 total`);
    }
    if (!Array.isArray(parsed.wrong)) {
      problems.push(`脏数据 ${JSON.stringify(raw)} 的 wrong 不是数组`);
    }
    if (!parsed.byKind || !parsed.byKind['face-bet']) {
      problems.push(`脏数据 ${JSON.stringify(raw)} 的 byKind 不完整`);
    }
  }

  // 认不出的错题条目要丢掉，能认的留下
  const goodAttempt = fakeAttempt(fakeDrill('face-bet', '好题'), false);
  const mixed = parseProgress({
    total: 3,
    correct: 1,
    bestStreak: 2,
    byKind: { 'face-bet': { total: 3, correct: 1 }, '不存在的题型': { total: 9, correct: 9 } },
    wrong: [null, 'junk', { drill: {} }, goodAttempt],
  });
  if (mixed.wrong.length !== 1) {
    problems.push(`应只留下 1 条能认的错题，实际 ${mixed.wrong.length}`);
  }
  if (mixed.wrong[0]?.drill.prompt !== '好题') problems.push('留下的错题不对');
  if (mixed.byKind['face-bet'].total !== 3) problems.push('合法的 byKind 没读进来');

  // 存取往返必须一致
  const original = applyAttempt(emptyProgress(), goodAttempt, 0);
  const roundTrip = parseProgress(serializeProgress(original));
  if (JSON.stringify(roundTrip) !== JSON.stringify(original)) {
    problems.push('序列化再解析回来的进度不一致');
  }

  return {
    name: '进度存储的脏数据兜底',
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `${garbage.length} 种脏输入全部解析成可用进度；认不出的错题条目被丢弃；存取往返一致`
        : problems.join('；'),
  };
}

// ============================================
// 入口
// ============================================

function main(): void {
  const checks: CheckResult[] = [
    checkTable1(),
    checkTable2(),
    checkTable3(),
    checkTable4(),
    checkToleranceCoversDoc(),
    checkMonotonicAndBounded(),
    checkOddsRoundTrip(),
    checkMaxCallBoundary(),
    checkFourTwoRule(),
    checkVerdictRuleBounds(),
    checkParseEquityInput(),
    checkKindCycle(),
    checkDrillAnswers(),
    checkReproducible(),
    checkProgressLogic(),
    checkProgressParsing(),
  ];

  console.log('=== 赔率算术对拍（口径源：services/skills/odds-table.md）===\n');
  for (const check of checks) {
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}`);
    console.log(`      ${check.detail}\n`);
  }

  const failed = checks.filter((c) => !c.passed);
  if (failed.length > 0) {
    console.error(`❌ ${failed.length}/${checks.length} 项未通过：${failed.map((c) => c.name).join('、')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ 全部 ${checks.length} 项通过`);
}

main();
