// ============================================
// 德州扑克成手牌评估器（5 / 6 / 7 张里取最好的 5 张）
//
// 输出是一个**可直接比大小的整数**：分值越大牌越大，相等即平分。
//   score = 牌型 * 15^5 + 踢脚1 * 15^4 + ... + 踢脚5
// 牌型 0..8、踢脚用 0..12 的点数下标，全部小于 15，所以这个进制不会串位。
//
// 牌用 0..51 的整数表示：rank = card >> 2（0 = '2' … 12 = 'A'），suit = card & 3。
// 用整数而不是字符串是因为模拟里每手牌要评估十几次 —— 7 张牌的比大小是整个
// 模拟里调用最频繁的操作
// ============================================

/** 点数下标 -> 字符，下标 0 是 '2'、12 是 'A' */
export const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const SUIT_CHARS = ['s', 'h', 'd', 'c'];

/** 牌型名，下标与 score 里的牌型编号一致 */
export const CATEGORY_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
];

/** 牌型在 score 里的权重 */
const CATEGORY_SCALE = 15 ** 5;

/**
 * 从点数的位掩码里找最大的顺子，返回顺子顶张的点数下标；没有顺子返回 -1。
 *
 * 轮子（A2345）单独判：A 在这里当 1 用，顶张是 5（下标 3）。
 * 所以 23456 的返回值 4 大于轮子的 3，两张牌型比较时自然分出大小
 */
export function straightHigh(mask: number): number {
  for (let hi = 12; hi >= 4; hi -= 1) {
    const need = 0b11111 << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  // A + 2345：位 12 与位 0..3
  const wheel = (1 << 12) | 0b1111;
  if ((mask & wheel) === wheel) return 3;
  return -1;
}

/** 位掩码里最大的 n 个点数，从大到小 */
function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r -= 1) {
    if (mask & (1 << r)) out.push(r);
  }
  return out;
}

function score(category: number, tiebreaks: number[]): number {
  let s = category;
  for (let i = 0; i < 5; i += 1) s = s * 15 + (tiebreaks[i] || 0);
  return s;
}

/** 从 score 里还原牌型编号 */
export function categoryOf(value: number): number {
  return Math.floor(value / CATEGORY_SCALE);
}

/**
 * 评估 5 / 6 / 7 张牌，返回可比较的分值。
 *
 * 同花走单独分支并直接返回，理由是同花不可能和葫芦、四条共存：
 * 葫芦要 3+2 张同点、四条要 4 张同点，而 7 张里若有 5 张同花色，
 * 就只剩 2 张别的花色，凑不出任何一个。
 * 顺子则必须先于三条判 —— 顺子比三条大，先判三条会把顺子判小
 */
export function evaluate(cards: number[]): number {
  const rankCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let rankMask = 0;

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const rank = card >> 2;
    const suit = card & 3;
    rankCount[rank] += 1;
    suitCount[suit] += 1;
    suitMask[suit] |= 1 << rank;
    rankMask |= 1 << rank;
  }

  // 同花：7 张里只可能有一个花色达到 5 张（5+5=10 > 7），命中即可直接返回
  for (let suit = 0; suit < 4; suit += 1) {
    if (suitCount[suit] >= 5) {
      const mask = suitMask[suit];
      const high = straightHigh(mask);
      if (high >= 0) return score(8, [high]);
      return score(5, topRanks(mask, 5));
    }
  }

  // 按 张数降序、点数降序 排点数。比较器是全序的，不依赖 sort 的稳定性
  const ranks: number[] = [];
  for (let r = 12; r >= 0; r -= 1) if (rankCount[r] > 0) ranks.push(r);
  ranks.sort((a, b) => rankCount[b] - rankCount[a] || b - a);

  const topCount = rankCount[ranks[0]];
  const secondCount = ranks.length > 1 ? rankCount[ranks[1]] : 0;

  if (topCount >= 4) {
    // 踢脚同样要按点数找（理由见下面两对那段）：四条的踢脚是"剩下最大的点数"，
    // 而不是 ranks 里紧跟着的那一个
    let kicker = 0;
    for (let r = 12; r >= 0; r -= 1) {
      if (r !== ranks[0] && rankCount[r] > 0) {
        kicker = r;
        break;
      }
    }
    return score(7, [ranks[0], kicker]);
  }
  if (topCount === 3 && secondCount >= 2) {
    // 两个三条时大的当三条、小的当对子，ranks 已按点数降序
    return score(6, [ranks[0], ranks[1]]);
  }

  const straight = straightHigh(rankMask);
  if (straight >= 0) return score(4, [straight]);

  if (topCount === 3) {
    return score(3, [ranks[0], ...ranks.slice(1, 3)]);
  }
  if (topCount === 2 && secondCount === 2) {
    // 踢脚要按**点数**找剩下最大的那张，不能按 ranks 的次序取：
    // ranks 是先按张数排的，七张里出现三对（如 KK 99 22 7）时它会排成 K,9,2,7，
    // 而最优五张是 KK+99+7 —— 踢脚是 7 而不是第三对里的 2
    let kicker = 0;
    for (let r = 12; r >= 0; r -= 1) {
      if (r !== ranks[0] && r !== ranks[1] && rankCount[r] > 0) {
        kicker = r;
        break;
      }
    }
    return score(2, [ranks[0], ranks[1], kicker]);
  }
  if (topCount === 2) {
    return score(1, [ranks[0], ...ranks.slice(1, 4)]);
  }
  return score(0, topRanks(rankMask, 5));
}

/** 牌 id -> 'As' 这样的字符串，用于报错和自检输出 */
export function cardToString(card: number): string {
  return RANK_CHARS[card >> 2] + SUIT_CHARS[card & 3];
}

export function cardsToString(cards: number[]): string {
  return cards.map(cardToString).join(' ');
}

/** 'AsKh' -> [id, id]，只给自检和命令行用 */
export function parseCards(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) {
    const rank = RANK_CHARS.indexOf(text[i].toUpperCase());
    const suit = SUIT_CHARS.indexOf(text[i + 1].toLowerCase());
    if (rank < 0 || suit < 0) throw new Error(`非法牌：${text.slice(i, i + 2)}`);
    out.push((rank << 2) | suit);
  }
  return out;
}

/** 人类可读的牌型描述，如 "两对" */
export function describeScore(value: number): string {
  return CATEGORY_NAMES[categoryOf(value)];
}
