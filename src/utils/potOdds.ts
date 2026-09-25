// ============================================
// 底池赔率算术（纯函数，不依赖 React / Taro）
//
// 与后端常驻技能 services/skills/odds-table.md 同源，且只有**一个**真相来源：
//
//     需要胜率 = 跟注额 ÷ 跟注后的底池          （不计抽水）
//
// odds-table.md 里那四张表全部是这个式子的变形，所以这里只实现式子、不抄表。
// tools/odds-check/ 会拿文档的每一格逐格复算 —— 公式一旦漂移，那个脚本就变红。
//
// 与 utils/cards.ts 同样的理由放在这里而不是组件里：出题器、页面、将来的
// 计算器都要用，且必须能脱离浏览器环境单独跑（逐格对拍就是这么跑的）
// ============================================

/** 只关心还有几条街要发：翻牌圈还有两张，转牌圈只剩一张 */
export type DrawStreet = 'flop' | 'turn';

/** 现实里翻牌圈听牌的 outs 上限（同花听 + 两头顺 + 高牌等叠加的极端值） */
export const MAX_REALISTIC_OUTS = 21;

// ============================================
// 核心：跟注的门槛
// ============================================

/**
 * 一次跟注决策。金额单位随意，只要是同一个单位（bb 或筹码数）
 *
 * 这个结构**不区分座位** —— 谁最后跟谁就用它。
 * 所以「对手下注、我加注、对手跟」和「我下注、对手加注、我跟」
 * 是同一个调用，算出来的也是同一个数（口径见 赔率训练设计文档.md §2.3）
 */
export interface CallSpot {
  /** 下注发生**之前**的底池 */
  pot: number;
  /** 对手的下注额 */
  bet: number;
  /** 我加注后的总额（含），不传表示我不加注、直接跟 */
  raiseTo?: number;
}

/**
 * 需要胜率 = 跟注额 ÷ 跟注后的底池。
 *
 * 非法输入直接抛错而不是返回 NaN：这个函数的调用方只有出题器和训练页，
 * 局面都是程序生成的，出现非法值就是代码有 bug，早点炸出来比在界面上
 * 显示一个 NaN% 好
 */
export function requiredEquity(spot: CallSpot): number {
  const { pot, bet, raiseTo } = spot;
  if (!(pot > 0)) throw new RangeError(`底池必须为正：${pot}`);
  if (!(bet > 0)) throw new RangeError(`下注额必须为正：${bet}`);
  if (raiseTo !== undefined && !(raiseTo > bet)) {
    throw new RangeError(`加注后的总额必须大于下注额：raiseTo=${raiseTo}，bet=${bet}`);
  }

  // 我要跟的钱：没人加注就跟平对手的下注，有人加注就补到加注后的总额
  const callAmount = raiseTo === undefined ? bet : raiseTo - bet;
  // 跟注后的底池：这一轮双方的投入都翻倍进池
  //   不加注：池 + 对手下注 + 我跟注        = pot + 2·bet
  //   加注到 R：池 + 对手下注 + 我加注 + 对手补到 R = pot + 2·R
  const potAfterCall = pot + 2 * (raiseTo === undefined ? bet : raiseTo);

  return callAmount / potAfterCall;
}

/** 胜率 → 赔率 x:1。需要 25% 就是 3.0:1 */
export function equityToPotOdds(equity: number): number {
  if (!(equity > 0) || equity >= 1) {
    throw new RangeError(`胜率必须落在 (0, 1) 开区间：${equity}`);
  }
  return (1 - equity) / equity;
}

/** 赔率 x:1 → 胜率。odds-table.md 开头那句 BEP = 1/(底池赔率+1) */
export function potOddsToEquity(odds: number): number {
  if (!(odds > 0)) throw new RangeError(`赔率必须为正：${odds}`);
  return 1 / (odds + 1);
}

// ============================================
// 听牌：outs → 胜率
// ============================================

export interface OutsEquity {
  /** 组合数算出来的精确值 */
  exact: number;
  /** 四二法则的口诀值（翻牌 outs×4、转牌 outs×2） */
  rule: number;
}

/** 翻牌到河牌还有两张要发，未见牌 47 张（52 − 2 底牌 − 3 公共牌） */
const UNSEEN_ON_FLOP = 47;
/** 转牌到河牌只剩一张，未见牌 46 张（52 − 2 底牌 − 4 公共牌） */
const UNSEEN_ON_TURN = 46;

/** 从 n 个里取 2 个的组合数 */
const choose2 = (n: number): number => (n * (n - 1)) / 2;

function checkOuts(outs: number): void {
  if (!Number.isInteger(outs) || outs < 0 || outs > MAX_REALISTIC_OUTS) {
    throw new RangeError(
      `outs 必须是 0..${MAX_REALISTIC_OUTS} 的整数：${outs}（${MAX_REALISTIC_OUTS} 是现实中翻牌圈听牌的上限）`,
    );
  }
}

/**
 * outs → 胜率。
 *
 * exact 与 rule 分开返回，因为**训练器要求两者永不混判**：
 * 转牌 9 outs 的四二法则给 18%、精确值是 20% —— 问哪个就该答哪个。
 *
 * 四二法则在 outs ≥ 15 时会明显高估（15×4 = 60%，精确值 54%），
 * odds-table.md 自己注明了这一点，所以口诀档也要判分，但只在明说问口诀时用
 */
export function outsToEquity(outs: number, street: DrawStreet): OutsEquity {
  checkOuts(outs);

  if (street === 'turn') {
    // 只剩一张牌：outs / 未见牌
    return { exact: outs / UNSEEN_ON_TURN, rule: (outs * 2) / 100 };
  }

  // 还有两张牌：1 − 两张都不来。翻牌圈永远不会「两张都来还没中」的情况漏算，
  // 因为 1 减去「都不来」正好覆盖「至少来一张」
  const exact = 1 - choose2(UNSEEN_ON_FLOP - outs) / choose2(UNSEEN_ON_FLOP);
  return { exact, rule: (outs * 4) / 100 };
}

// ============================================
// 反查：我有多少胜率，最多能跟多大
// ============================================

/**
 * 精确反解：有 equity 胜率时，最多能跟几倍池。
 *
 * 由 b/(1+2b) = eq 解出 b = eq/(1−2eq)。eq 到 50% 时分母归零 ——
 * 胜率过半就是优势，跟多少都对，所以返回 null 表示**没有上限**
 */
export function maxCallFraction(equity: number): number | null {
  if (!(equity > 0) || equity > 1) {
    throw new RangeError(`胜率必须落在 (0, 1] 区间：${equity}`);
  }
  if (equity >= 0.5) return null;
  return equity / (1 - 2 * equity);
}

/** 文档里被命名的下注尺度，同时也是反查题的候选集 */
export const NAMED_BET_FRACTIONS: number[] = [
  1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 1.5, 2, 3, 5, 10,
];

/**
 * 反查：在候选尺度里找出胜率**还够跟**的最大那个（odds-table.md 表 3 的语义）。
 *
 * 口径说明（重要）：比较走**文档取整口径** —— 先把候选尺度的门槛四舍五入成
 * 整数百分比，再和同样取整过的目标胜率比。用精确值直接反解会对不上文档表 3 的两行：
 *
 *   33% → 1 倍池（精确门槛 33.33%，严格说不够）
 *   45% → 5 倍池（精确门槛 45.45%，严格说不够）
 *
 * 文档两头都在取整，边界就会互相打架。训练器的答案要跟教练说的话一致，
 * 所以这里跟文档走。详见 赔率训练设计文档.md §2.5
 *
 * 注意与 maxCallFraction 的分工：那个给连续的精确边界（用于解释卡里算到小数点后），
 * 这个给文档命名档位里的离散选择（用于判分）
 */
export function largestCallable(fractions: number[], equity: number): number | null {
  if (!(equity > 0) || equity > 1) {
    throw new RangeError(`胜率必须落在 (0, 1] 区间：${equity}`);
  }

  const target = Math.round(equity * 100);
  let best: number | null = null;
  // fractions 需按从小到大传入，最后一个命中的就是最大的
  for (const fraction of fractions) {
    if (docPercent(requiredEquity({ pot: 1, bet: fraction })) <= target) {
      best = fraction;
    }
  }
  return best;
}

// ============================================
// 展示口径
// ============================================

/**
 * 文档口径的取整百分比：0.2857 → 29。
 *
 * 文档里每一格都是这么取整的（16.67→17、28.57→29、45.45→45、47.62→48），
 * 所以判分和解释卡都走这个函数，而不是各自 toFixed
 */
export function docPercent(equity: number): number {
  return Math.round(equity * 100);
}

/** 显示用的小数百分比：0.2857 → "28.6%" */
export function formatPercent(equity: number, digits = 1): string {
  return `${(equity * 100).toFixed(digits)}%`;
}

/** 底池倍数 → 文档里的叫法：0.3333 → "1/3 池"，0.7 → "0.7 倍池" */
export function fractionLabel(fraction: number): string {
  const named: Array<[number, string]> = [
    [1 / 4, '1/4 池'],
    [1 / 3, '1/3 池'],
    [1 / 2, '1/2 池'],
    [2 / 3, '2/3 池'],
    [3 / 4, '3/4 池'],
    [1, '1 倍池'],
    [1.5, '1.5 倍池'],
    [2, '2 倍池'],
    [3, '3 倍池'],
    [5, '5 倍池'],
    [10, '10 倍池'],
  ];
  for (const [value, label] of named) {
    if (Math.abs(fraction - value) < 1e-9) return label;
  }
  // 档 3 的随机尺度没有惯用叫法，保留两位小数即可
  return `${Number(fraction.toFixed(2))} 倍池`;
}
