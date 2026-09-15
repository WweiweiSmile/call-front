// ============================================
// 牌面基础工具（纯函数，不依赖任何 UI 框架）
//
// 刻意与 CardPicker 组件分开放：
// 1. 这些逻辑录入页、详情页、列表卡片、后端校验都要用
// 2. 放在组件文件里的话，任何想复用它的模块都会被拖进 React 和 Taro 的依赖里，
//    也没法脱离浏览器环境单独跑测试
// ============================================

/** 展示顺序：从大到小，符合看牌的直觉 */
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

/** 花色顺序：黑桃、红心、方块、梅花 */
export const SUITS = ['s', 'h', 'd', 'c'] as const;

/** 花色 -> 符号 */
export const SUIT_SYMBOL: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

/** 花色 -> 颜色类名。红桃/方块为红色，其余为黑色 */
export const SUIT_COLOR: Record<string, 'red' | 'black'> = {
  s: 'black',
  h: 'red',
  d: 'red',
  c: 'black',
};

/** 花色中文名，给不熟悉符号的用户看 */
export const SUIT_NAME: Record<string, string> = {
  s: '黑桃',
  h: '红心',
  d: '方块',
  c: '梅花',
};

/** 点数展示：T 在牌桌上通常写作 10，比字母 T 更直观 */
export const formatRank = (rank: string): string => (rank === 'T' ? '10' : rank);

/**
 * 把 "AsKh" 拆成 ['As', 'Kh']
 */
export function parseCards(cards: string): string[] {
  if (!cards) return [];
  const result: string[] = [];
  for (let i = 0; i + 1 < cards.length; i += 2) {
    result.push(cards.slice(i, i + 2));
  }
  return result;
}

/**
 * 把 ['As', 'Kh'] 拼成 "AsKh"
 */
export function joinCards(cards: string[]): string {
  return cards.join('');
}

/**
 * 校验牌串是否合法（长度、点数、花色、是否重复）。
 * 返回第一条错误信息，合法时返回 null。
 *
 * 与后端 utils/hand.go 的 ValidateCards 是同一套规则，
 * 前端先拦一道是为了让用户立刻看到问题，而不是等提交后收到报错。
 */
export function validateCardString(cards: string, allowEmpty = false): string | null {
  if (!cards) {
    return allowEmpty ? null : '请选择牌';
  }
  if (cards.length % 2 !== 0) {
    return '牌面格式不正确';
  }

  const seen = new Set<string>();
  for (let i = 0; i < cards.length; i += 2) {
    const rank = cards[i];
    const suit = cards[i + 1];
    if ('23456789TJQKA'.indexOf(rank) < 0) {
      return `非法点数：${rank}`;
    }
    if ('shdc'.indexOf(suit) < 0) {
      return `非法花色：${suit}`;
    }
    const card = cards.slice(i, i + 2);
    if (seen.has(card)) {
      return `重复的牌：${card}`;
    }
    seen.add(card);
  }
  return null;
}
