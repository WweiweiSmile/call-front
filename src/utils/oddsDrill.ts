// ============================================
// 赔率训练的出题器与判分（纯函数，不依赖 React / Taro）
//
// 题目**不发明新知识**：每一种题型都对应 odds-table.md 里的一张表，
// 答案由 utils/potOdds.ts 的唯一公式算出，所以「练的」和「教练说的」永远是同一套数。
//
// 随机源从参数传入而不是内部调 Math.random()：同一个 rng 必须给出同一套题，
// 否则 e2e 没法断言具体数字，出问题也没法复现（tools/open-size-ev/rng.ts 同款做法）
// ============================================

import {
  CallSpot,
  DrawStreet,
  NAMED_BET_FRACTIONS,
  docPercent,
  formatPercent,
  fractionLabel,
  largestCallable,
  maxCallFraction,
  outsToEquity,
  requiredEquity,
} from './potOdds';

export type DrillKind =
  /** T1 面对下注：对手下注 b，我需要多少胜率（表 1） */
  | 'face-bet'
  /** T2 加注后：对手下注 B、我加注到 R，对手需要多少胜率（表 2，换个座位读） */
  | 'after-raise'
  /** T3 听牌换算：outs → 胜率（表 4） */
  | 'outs-to-equity'
  /** T4 反查：我有多少胜率，最多能跟多大（表 3） */
  | 'max-call'
  /** T5 判断题：这个跟注是对是错（表 1/4 交汇） */
  | 'call-or-fold';

export type Difficulty = 1 | 2 | 3 | 4;

/** 答案的单位：胜率（小数）、底池倍数，还是「跟/弃」的结论 */
export type AnswerKind = 'equity' | 'fraction' | 'verdict';

/** T3 问的是精确值还是四二法则的口诀值。两者分开问、分开判 */
export type EquityBasis = 'exact' | 'rule';

export interface Drill {
  kind: DrillKind;
  difficulty: Difficulty;
  /** 渲染好的题干 */
  prompt: string;
  answerKind: AnswerKind;
  /**
   * 与 answerKind 同单位的期望答案。
   * verdict 时 1 = 该跟、0 = 该弃（见 verdict 字段）
   */
  expected: number;
  /**
   * 判分容差（仅 answerKind === 'equity' 时生效）。
   *
   * 取 1.5 个百分点是有依据的：文档每一格都四舍五入成了整数百分比，
   * 取整带来的最大偏差实测 0.53pp（表 4 卡顺那一格），所以「答文档上的数」
   * 永远落在容差内 —— 用户按文档值答不会被判错，按精确值答也不会
   */
  tolerance: number;
  /** 选项，与 expected 同单位；空数组 = 填空题（仅胜率题会是空） */
  choices: number[];
  /** 解释卡的逐行内容 */
  steps: string[];
  /** 判断题的结论，与 expected 同义，页面直接显示它 */
  verdict?: 'call' | 'fold';
  /** T3 用：本题问的是哪个口径 */
  basis?: EquityBasis;
  /** T5 用：门槛与听牌实际胜率的差距，也就是这道题的判定余量 */
  margin?: number;
}

/** 判分容差：1.5 个百分点，覆盖文档取整的最大偏差 0.53pp 后仍有富余 */
export const DEFAULT_TOLERANCE = 0.015;

/** 每组题量 */
export const DEFAULT_DRILLS_PER_SET = 10;

/**
 * T5 的判定余量：胜率和门槛贴太近的题，答案会退化成抛硬币，出题时避开。
 * 2 个百分点是权衡 —— 再大就把「刚好卡在门槛上」这类最有价值的局面排除了
 */
export const VERDICT_MARGIN = 0.02;

/** odds-table.md §十 的锚点，用于解释卡里的口诀 */
const ANCHOR_HINT = [1 / 3, 1 / 2, 1, 2]
  .map((f) => `${fractionLabel(f)}→${docPercent(requiredEquity({ pot: 1, bet: f }))}%`)
  .join('  ');

// ============================================
// 题库：全部逐条对应文档里的表，不自行发明
// ============================================

interface Draw {
  name: string;
  outs: number;
}

/** odds-table.md 表 4 的六种听牌 */
const DRAWS: Draw[] = [
  { name: '卡顺', outs: 4 },
  { name: '两张高牌', outs: 6 },
  { name: '两头顺', outs: 8 },
  { name: '同花听', outs: 9 },
  { name: '同花听 + 卡顺', outs: 12 },
  { name: '同花听 + 两头顺', outs: 15 },
];

/** 入门档只出同花听：9 outs 是最该先焊死的那个数 */
const ENTRY_DRAW: Draw = { name: '同花听', outs: 9 };

/** odds-table.md 表 3 反查的行。全部小于 50% */
const MAX_CALL_TARGETS = [17, 20, 25, 29, 33, 38, 40, 45];

const STREETS: DrawStreet[] = ['flop', 'turn'];

const STREET_TEXT: Record<DrawStreet, string> = {
  flop: '翻牌圈（还有两张牌要发）',
  turn: '转牌圈（只剩河牌一张）',
};

/** 档 3/4 的随机尺度考的是公式本身，步长 0.05 让题干读起来还是人话 */
const RANDOM_MIN = 0.2;
const RANDOM_MAX = 3;
const RANDOM_STEP = 0.05;

function pick<T>(rng: () => number, items: T[]): T {
  if (items.length === 0) throw new Error('题库为空，出题器有 bug');
  return items[Math.floor(rng() * items.length)];
}

/**
 * 每个难度可用的下注尺度。
 *
 * 判断题和反查题**只能**用命名档位（随机尺度没法反查、也没法背），
 * 所以它们不受档 3/4 的「任意尺度」影响。
 * 导出是为了让对拍脚本能断言「反查的答案确实落在本档的池子里」
 */
export function betsFor(difficulty: Difficulty): number[] {
  // 档 1 先把三个锚点焊死：1/3→20% 1/2→25% 1→33%
  return difficulty === 1 ? [1 / 3, 1 / 2, 1] : NAMED_BET_FRACTIONS;
}

function drawsFor(difficulty: Difficulty): Draw[] {
  return difficulty === 1 ? [ENTRY_DRAW] : DRAWS;
}

/** 档 3/4 的下注尺度随机取；档 1/2 从命名档位里挑 */
function pickBet(difficulty: Difficulty, rng: () => number): number {
  if (difficulty >= 3) {
    const steps = Math.floor((RANDOM_MAX - RANDOM_MIN) / RANDOM_STEP);
    return RANDOM_MIN + Math.floor(rng() * steps) * RANDOM_STEP;
  }
  return pick(rng, betsFor(difficulty));
}

/** 档 3/4 的 outs 随机取（3~15），档 1/2 用命名听牌 */
function pickDraw(difficulty: Difficulty, rng: () => number): Draw {
  if (difficulty >= 3) {
    return { name: '', outs: 3 + Math.floor(rng() * 13) };
  }
  return pick(rng, drawsFor(difficulty));
}

/** 听牌在题干里的叫法。随机 outs 没有惯用名，只报张数 */
function drawText(draw: Draw): string {
  return draw.name ? `${draw.name}（${draw.outs} 张 outs）` : `${draw.outs} 张 outs`;
}

function formatBb(value: number): string {
  return String(Number(value.toFixed(1)));
}

/**
 * 干扰项取**与本题同口径的邻近数值** —— 问 1/3 池，就给 1/4、1/2、1 池
 * 用同样口径算出来的值。这样选错时暴露的是「尺度和门槛的对应关系记串了」，
 * 而不是瞎蒙。
 *
 * 注意 candidates 必须是**与本题同口径**算出来的：T2 的答案是加注后的门槛，
 * 拿「面对下注」的门槛当干扰项，正确答案根本不在选项里（这个 bug 让
 * check:odds 的可复现检查抓过一次，见 赔率训练设计文档.md §5 M1）
 */
function withNearestChoices(
  answer: number,
  candidates: number[],
  count = 4,
): number[] {
  const pool = candidates
    .filter((value) => Math.abs(value - answer) > 1e-9)
    .sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer));

  const choices = [answer];
  for (const value of pool) {
    if (choices.length >= count) break;
    if (choices.some((c) => Math.abs(c - value) < 1e-9)) continue;
    choices.push(value);
  }
  return choices.sort((a, b) => a - b);
}

// ============================================
// T1 / T2：门槛
// ============================================

/** T1：对手下注 b，我需要多少胜率 */
function generateFaceBet(difficulty: Difficulty, rng: () => number): Drill {
  const fraction = pickBet(difficulty, rng);
  const pot = pick(rng, [6, 10, 12, 20, 30, 50]);
  const bet = pot * fraction;
  const spot: CallSpot = { pot, bet };
  const exact = requiredEquity(spot);
  const label = fractionLabel(fraction);

  return {
    kind: 'face-bet',
    difficulty,
    prompt: `底池 ${pot}bb。对手下注 ${label}（${formatBb(bet)}bb）。你至少需要多少胜率才能跟？`,
    answerKind: 'equity',
    expected: exact,
    tolerance: DEFAULT_TOLERANCE,
    choices:
      difficulty <= 2
        ? withNearestChoices(
            exact,
            NAMED_BET_FRACTIONS.map((f) => requiredEquity({ pot: 1, bet: f })),
          )
        : [],
    steps: [
      `算式：跟注额 ${formatBb(bet)} ÷ 跟注后的底池 ${formatBb(pot + 2 * bet)} = ${formatPercent(exact)}`,
      `（池 ${pot} + 对手下注 ${formatBb(bet)} + 我跟注 ${formatBb(bet)}）`,
      `口诀：对手下注 ${label} → 约 ${docPercent(exact)}%`,
      `锚点：${ANCHOR_HINT}`,
    ],
  };
}

/** T2：对手下注 B、我加注到 R，对手需要多少胜率 */
function generateAfterRaise(difficulty: Difficulty, rng: () => number): Drill {
  const betFraction = pickBet(difficulty, rng);
  const multiple = pick(rng, [2, 2.5, 3, 4]);
  const pot = pick(rng, [6, 10, 12, 20, 30, 50]);
  const opponentBet = pot * betFraction;
  const raiseTo = opponentBet * multiple;

  // 同一个 CallSpot：谁最后跟谁用它。这里问的是**对手**的门槛，
  // 所以 bet 是**对手**的下注额、raiseTo 是**我**的加注总额
  const spot: CallSpot = { pot, bet: opponentBet, raiseTo };
  const exact = requiredEquity(spot);
  const betLabel = fractionLabel(betFraction);

  return {
    kind: 'after-raise',
    difficulty,
    prompt:
      `底池 ${pot}bb。对手下注 ${betLabel}（${formatBb(opponentBet)}bb），` +
      `你加注到 ${formatBb(raiseTo)}bb。对手跟注需要多少胜率？`,
    answerKind: 'equity',
    expected: exact,
    tolerance: DEFAULT_TOLERANCE,
    choices:
      difficulty <= 2
        ? withNearestChoices(
            exact,
            NAMED_BET_FRACTIONS.map((f) =>
              requiredEquity({ pot: 1, bet: f, raiseTo: f * multiple }),
            ),
          )
        : [],
    steps: [
      `算式：跟注额 ${formatBb(raiseTo - opponentBet)} ÷ 跟注后的底池 ${formatBb(pot + 2 * raiseTo)} = ${formatPercent(exact)}`,
      `（池 ${pot} + 对手下注 ${formatBb(opponentBet)} + 我加注到 ${formatBb(raiseTo)} + 对手补 ${formatBb(raiseTo - opponentBet)}）`,
      `看清座位：换我处在对手的位置，就是「我下注 ${betLabel}、对手加注到 ${multiple} 倍」` +
        ` → 约 ${docPercent(exact)}%`,
      `同样尺度下，加注后需要的胜率比面对下注更低 —— 因为池里已经垫了一方的下注`,
    ],
  };
}

// ============================================
// T3：outs → 胜率
// ============================================

function generateOutsToEquity(difficulty: Difficulty, rng: () => number): Drill {
  const draw = pickDraw(difficulty, rng);
  const street = pick(rng, STREETS);
  // 四二法则与精确值**分开问**：问哪个就答哪个
  const basis: EquityBasis = rng() < 0.5 ? 'exact' : 'rule';
  const values = outsToEquity(draw.outs, street);
  const expected = basis === 'exact' ? values.exact : values.rule;

  const basisText = basis === 'exact' ? '精确值' : '四二法则估算';
  // 干扰项：同街同口径的其它听牌，外加**本题听牌的另一口径值**
  // —— 后者是最容易混的那个错，必须出现在选项里
  const candidates = [
    ...DRAWS.map((d) =>
      basis === 'exact'
        ? outsToEquity(d.outs, street).exact
        : outsToEquity(d.outs, street).rule,
    ),
    basis === 'exact' ? values.rule : values.exact,
  ];

  return {
    kind: 'outs-to-equity',
    difficulty,
    prompt: `${STREET_TEXT[street]}，你是${drawText(draw)}。成牌概率是多少？（${basisText}）`,
    answerKind: 'equity',
    expected,
    tolerance: DEFAULT_TOLERANCE,
    choices: difficulty <= 2 ? withNearestChoices(expected, candidates) : [],
    basis,
    steps: [
      `${STREET_TEXT[street]}：${draw.outs} 张 outs`,
      `精确值：${
        street === 'turn'
          ? `${draw.outs}/46`
          : `1 − C(47−${draw.outs},2)/C(47,2)`
      } = ${formatPercent(values.exact)}`,
      `四二法则：${draw.outs} × ${street === 'turn' ? 2 : 4} = ${formatPercent(values.rule)}` +
        (draw.outs >= 15 ? '（outs 到 15 张以上，四二法则开始高估）' : ''),
      `本题问的是${basisText}，答 ${docPercent(expected)}%`,
    ],
  };
}

// ============================================
// T4：反查最大可跟尺度
// ============================================

function generateMaxCall(difficulty: Difficulty, rng: () => number): Drill {
  // 答案只能出自本档允许的尺度：入门档的池是 1/3、1/2、1 倍池，
  // 出成 1/4 池就与「入门档只练三个锚点」的设计冲突了
  const pool = betsFor(difficulty);
  // 池子越小可选的目标胜率越少：入门档的 1/3 池门槛就有 20%，
  // 所以 17% 那一档在入门档无解，必须先从目标里剔掉
  const targets = MAX_CALL_TARGETS.filter(
    (percent) => largestCallable(pool, percent / 100) !== null,
  );
  const percent = pick(rng, targets);
  const equity = percent / 100;
  const answer = largestCallable(pool, equity);
  if (answer === null) throw new Error(`反查 ${percent}% 无解，目标过滤有 bug`);

  // 干扰项取自**完整的命名档位表**而不是本档的池：干扰项只是几个像样的数字，
  // 不必受本档范围限制；用本档的池会在入门档凑不满 4 个选项
  const index = NAMED_BET_FRACTIONS.indexOf(answer);
  const neighbors = [
    NAMED_BET_FRACTIONS[index - 2],
    NAMED_BET_FRACTIONS[index - 1],
    NAMED_BET_FRACTIONS[index + 1],
    NAMED_BET_FRACTIONS[index + 2],
  ].filter((f) => f !== undefined);

  const exactBoundary = maxCallFraction(equity);
  const exactText =
    exactBoundary === null ? '无上限' : `${exactBoundary.toFixed(2)} 倍池`;

  return {
    kind: 'max-call',
    difficulty,
    prompt: `你这手牌有 ${percent}% 的胜率。面对对手的一个下注，最多能跟到多大？`,
    answerKind: 'fraction',
    expected: answer,
    // 反查是离散档位，必须完全命中，不用容差
    tolerance: 0,
    // 兜底：答案是最小的 1/4 池时，前面没有更小的邻居，光靠邻居凑不满 4 个选项
    choices: withNearestChoices(answer, [...neighbors, ...NAMED_BET_FRACTIONS]),
    steps: [
      `要求：跟注的门槛不能超过 ${percent}%`,
      `逐个尺度的门槛：${pool
        .slice(0, 6)
        .map((f) => `${fractionLabel(f)} ${docPercent(requiredEquity({ pot: 1, bet: f }))}%`)
        .join('  ')}`,
      `最大可跟 ${fractionLabel(answer)}`,
      `精确算：${exactText}，比它再大就跟不动了 —— ` +
        `文档表 3 按取整口径记作 ${fractionLabel(answer)}`,
    ],
  };
}

// ============================================
// T5：这个跟注是对是错
// ============================================

function generateCallOrFold(difficulty: Difficulty, rng: () => number): Drill {
  const wantCall = rng() < 0.5;
  const bets = betsFor(difficulty);

  // 先挑出既有判定余量、结论又符合期望的组面，再随机选一个。
  // 直接随机出题会退化成「几乎全是弃牌」，那样练不到「够跟」那一半
  const candidates: Array<{ draw: Draw; street: DrawStreet; bet: number }> = [];
  for (const draw of drawsFor(difficulty)) {
    for (const street of STREETS) {
      for (const bet of bets) {
        const actual = outsToEquity(draw.outs, street).exact;
        const required = requiredEquity({ pot: 1, bet });
        const isCall = actual >= required;
        if (isCall === wantCall && Math.abs(actual - required) >= VERDICT_MARGIN) {
          candidates.push({ draw, street, bet });
        }
      }
    }
  }

  const { draw, street, bet } = pick(rng, candidates);
  const pot = pick(rng, [10, 20, 30, 50]);
  const betAmount = pot * bet;
  const required = requiredEquity({ pot, bet: betAmount });
  const actual = outsToEquity(draw.outs, street).exact;
  const verdict: 'call' | 'fold' = actual >= required ? 'call' : 'fold';

  return {
    kind: 'call-or-fold',
    difficulty,
    prompt:
      `${STREET_TEXT[street]}，底池 ${pot}bb。对手下注 ${fractionLabel(bet)}` +
      `（${formatBb(betAmount)}bb），你是${drawText(draw)}。跟注对吗？`,
    answerKind: 'verdict',
    expected: verdict === 'call' ? 1 : 0,
    tolerance: 0,
    choices: [],
    verdict,
    margin: Math.abs(actual - required),
    steps: [
      `门槛：跟注额 ${formatBb(betAmount)} ÷ 跟注后的底池 ${formatBb(pot + 2 * betAmount)}` +
        ` = ${formatPercent(required)}`,
      `我的胜率（${street === 'turn' ? '单街' : '双街'}）：${draw.outs} 张 outs` +
        ` → ${formatPercent(actual)}`,
      `${formatPercent(actual)} ${verdict === 'call' ? '>' : '<'} ${formatPercent(required)}` +
        ` → 跟注${verdict === 'call' ? '是对的' : '是错的'}`,
      verdictNote(street, bet, draw, verdict),
    ],
  };
}

/**
 * 文档 §十 推论② 的范围是「**9 张 outs 及以下**」。
 *
 * 文档原文曾写作「用**任何**听牌跟注都是错误」，那是过度概括：
 * 组合听牌（12/15 outs）的单街胜率是 26.1% / 32.6%，都超过 1/2 池的 25% 门槛
 * （文档表 4 自己那两行标着「任意尺度 / 直接加注或全下」）。
 * **该句已于 2026-09-24 订正为带范围的版本**，见 赔率训练设计文档.md §2.8。
 *
 * 这里把两种情况下的话分开说：落在范围内的说成经验法则，
 * 落在范围外的明说它是例外 —— 否则训练器就在教一条错的规则
 */
function verdictNote(
  street: DrawStreet,
  bet: number,
  draw: Draw,
  verdict: 'call' | 'fold',
): string {
  const bigBet = bet >= 0.5;
  if (street === 'turn' && bigBet && draw.outs <= 9) {
    return `经验法则：转牌面对 1/2 池及以上的下注，9 张 outs 及以下的听牌跟注都是错的（文档 §十 推论②）`;
  }
  if (street === 'turn' && bigBet && draw.outs > 9) {
    return `注意：组合听牌是经验法则的例外 —— 文档 §十 推论② 只覆盖「9 张 outs 及以下」，` +
      `而 ${draw.outs} 张 outs 的胜率超过了门槛，这里该跟`;
  }
  if (verdict === 'call') {
    return `听牌胜率够门槛就该跟 —— 别凭「听牌不牢」的感觉弃掉`;
  }
  return `成牌概率不足门槛，长期跟注是亏的`;
}

// ============================================
// 出题入口
// ============================================

/**
 * 每个难度的题型循环。
 *
 * 用固定序列而不是随机挑，是为了保证**一组题里每种题型都被练到** ——
 * 随机挑会让某一种题型在一组里完全不出现。重复写的条目就是权重
 * （档 4 按设计以判断题为主）
 */
const KIND_CYCLE: Record<Difficulty, DrillKind[]> = {
  1: ['face-bet', 'after-raise', 'outs-to-equity'],
  2: ['face-bet', 'after-raise', 'outs-to-equity', 'max-call', 'call-or-fold'],
  3: ['face-bet', 'after-raise', 'outs-to-equity', 'max-call'],
  4: ['call-or-fold', 'call-or-fold', 'face-bet', 'outs-to-equity', 'max-call'],
};

/** 一组题里第 i 题该出什么（导出给页面的 Hook 用） */
export function kindAt(difficulty: Difficulty, index: number): DrillKind {
  const cycle = KIND_CYCLE[difficulty];
  return cycle[index % cycle.length];
}

export function generateDrill(
  kind: DrillKind,
  difficulty: Difficulty,
  rng: () => number,
): Drill {
  switch (kind) {
    case 'face-bet':
      return generateFaceBet(difficulty, rng);
    case 'after-raise':
      return generateAfterRaise(difficulty, rng);
    case 'outs-to-equity':
      return generateOutsToEquity(difficulty, rng);
    case 'max-call':
      return generateMaxCall(difficulty, rng);
    case 'call-or-fold':
      return generateCallOrFold(difficulty, rng);
    default: {
      // 题型新增时这里会编译报错，比运行期才发现好
      const exhaustive: never = kind;
      throw new Error(`未知题型：${exhaustive}`);
    }
  }
}

// ============================================
// 判分
// ============================================

/**
 * 填空题的输入解析。接受 `20`、`20%`、`0.2` 三种写法。
 *
 * 规则：带 % 号按百分比；否则大于 1 当百分比、小于等于 1 当小数。
 * 所以 `1` 被读成 100%（而不是 1%）—— 题目的答案永远在 1%~50% 之间，
 * 两种读法都是错的，不会造成误判
 */
export function parseEquityInput(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const isPercent = text.endsWith('%');
  const body = isPercent ? text.slice(0, -1).trim() : text;
  if (!/^\d*\.?\d+$/.test(body)) return null;

  const value = Number(body);
  if (!Number.isFinite(value) || value <= 0) return null;

  return isPercent || value > 1 ? value / 100 : value;
}

export interface GradeResult {
  correct: boolean;
  /** 与精确值的差，单位同 answerKind */
  delta: number;
  /** 差多少个百分点（仅胜率题，给解释卡用） */
  deltaPercent: number;
}

export function gradeAnswer(drill: Drill, input: number): GradeResult {
  const delta = input - drill.expected;

  let correct: boolean;
  if (drill.answerKind === 'verdict') {
    correct = input === drill.expected;
  } else if (drill.answerKind === 'fraction') {
    // 反查是离散档位，必须完全命中
    correct = Math.abs(delta) < 1e-9;
  } else {
    correct = Math.abs(delta) <= drill.tolerance;
  }

  return { correct, delta, deltaPercent: delta * 100 };
}
