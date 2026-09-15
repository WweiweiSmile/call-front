// ============================================
// 德州扑克领域工具
// 底池估算、街道文案、手牌序列化
// 录入页、详情页、列表卡片共用，避免各写一份
// ============================================

import { parseCards, formatRank, SUIT_SYMBOL } from './cards';
import type {
  ActionType,
  ActorType,
  HandResult,
  Position,
  PotType,
  Street,
  StreetRecord,
} from '../models/types/review';

/** 街道顺序 */
export const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

/** 街道中文名 */
export const STREET_LABEL: Record<Street, string> = {
  preflop: '翻前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};

/** 行动中文名 */
export const ACTION_LABEL: Record<ActionType, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  allin: '全下',
};

/** 行动者中文名 */
export const ACTOR_LABEL: Record<ActorType, string> = {
  hero: '我',
  villain: '对手',
  other: '其他人',
};

/** 需要填写金额的行动 */
export const ACTION_NEEDS_AMOUNT: ActionType[] = ['bet', 'raise', 'allin'];

/** 位置列表，按行动顺序（翻前 UTG 先说话） */
export const POSITION_ORDER: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

/** 结果中文名 */
export const RESULT_LABEL: Record<HandResult, string> = {
  win: '赢',
  lose: '输',
  fold: '弃牌',
  unknown: '未记录',
};

/** 底池类型中文名 */
export const POT_TYPE_LABEL: Record<PotType, string> = {
  hu: '单挑',
  multi: '多人池',
};

/** 金额展示：去掉无意义的小数尾巴，2.5 显示 2.5，4.0 显示 4 */
export function formatBB(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** 一条街的底池推进 */
export interface PotStep {
  street: Street;
  /** 该街开始时的底池（BB） */
  potStartBb: number;
  /** 该街结束时的底池（BB） */
  potEndBb: number;
}

export interface PotResult {
  byStreet: Partial<Record<Street, PotStep>>;
  /** 全部街打完后的底池 */
  finalPotBb: number;
}

/**
 * 按记录的行动估算底池。
 *
 * 跟注的金额不要求用户填 —— 它一定等于当前街的最高下注额，能推出来。
 * 加注记录的是"加到多少"，所以本街的净投入要用当前投入去减。
 *
 * 注意：不计入盲注与前注。UI 上必须标明是估算值，不能让用户以为这是精确底池。
 */
export function computePots(streets: StreetRecord[]): PotResult {
  const byStreet: Partial<Record<Street, PotStep>> = {};
  let pot = 0;

  for (const street of STREET_ORDER) {
    const record = streets.find((s) => s.street === street);
    const potStart = pot;

    if (record && record.actions.length > 0) {
      // 本街每个行动者的已投入，用于算跟注差额和加注差额。
      // other 是聚合角色，多个"其他人"共用一个桶，是简化处理
      const contributed: Record<string, number> = {};
      // 当前街的最高下注额，跟注要跟到这么多
      let currentBet = 0;

      for (const action of record.actions) {
        const actor = action.actor;
        const prev = contributed[actor] || 0;
        let delta = 0;

        switch (action.action) {
          case 'bet':
          case 'allin':
            // allin 记录的是总投入额
            delta = Math.max(0, (action.amountBb || 0) - prev);
            currentBet = Math.max(currentBet, action.amountBb || 0);
            break;
          case 'raise':
            delta = Math.max(0, (action.amountBb || 0) - prev);
            currentBet = Math.max(currentBet, action.amountBb || 0);
            break;
          case 'call':
            delta = Math.max(0, currentBet - prev);
            break;
          case 'check':
          case 'fold':
          default:
            delta = 0;
        }

        contributed[actor] = prev + delta;
        pot += delta;
      }
    }

    byStreet[street] = { street, potStartBb: potStart, potEndBb: pot };
  }

  return { byStreet, finalPotBb: pot };
}

/**
 * 把一手牌序列化成紧凑文本，用于详情页回放。
 * 格式参考手牌历史惯例，牌手一眼能读懂。
 *
 * 后端在 M3 拼提示词时会自己生成一份等价文本，两边的用途不同：
 * 这里是为"给人看"，那边是为"给模型看"，所以刻意没有强行复用。
 */
export function buildHandText(hand: {
  heroPosition: Position;
  heroCards: string;
  heroStackBb: number;
  villainCount: number;
  villains?: { position: Position; stackBb?: number; isKey?: boolean }[];
  board: string;
  streets: StreetRecord[];
  heroThought?: string;
  result?: HandResult;
  resultAmount?: number;
}): string {
  const lines: string[] = [];

  const heroLine = [
    `我 (${hand.heroPosition})`,
    formatCardsForText(hand.heroCards) || '未记录底牌',
    hand.heroStackBb ? `${formatBB(hand.heroStackBb)}bb` : '',
  ].filter(Boolean).join(' ');
  lines.push(heroLine);

  // 只列关键对手，没标关键对手时退化成只报数量
  const keyVillains = (hand.villains || []).filter((v) => v.isKey);
  if (keyVillains.length > 0) {
    keyVillains.forEach((v) => {
      lines.push(`对手 (${v.position})${v.stackBb ? ` ${formatBB(v.stackBb)}bb` : ''}`);
    });
  } else if (hand.villainCount > 0) {
    lines.push(`对手 ${hand.villainCount} 人`);
  }

  const boardCards = parseCards(hand.board);
  for (const street of STREET_ORDER) {
    const record = hand.streets.find((s) => s.street === street);
    if (!record || record.actions.length === 0) continue;

    // 翻牌及之后带上公共牌，方便逐街对照
    let prefix = STREET_LABEL[street];
    if (street === 'flop' && boardCards.length >= 3) {
      prefix += ` ${formatCardsForText(boardCards.slice(0, 3).join(''))}`;
    } else if (street === 'turn' && boardCards.length >= 4) {
      prefix += ` ${formatCardsForText(boardCards[3])}`;
    } else if (street === 'river' && boardCards.length >= 5) {
      prefix += ` ${formatCardsForText(boardCards[4])}`;
    }

    const actions = record.actions.map((a) => {
      const who = ACTOR_LABEL[a.actor];
      const what = ACTION_LABEL[a.action];
      if (ACTION_NEEDS_AMOUNT.indexOf(a.action) >= 0 && a.amountBb) {
        return `${who} ${what} ${formatBB(a.amountBb)}bb`;
      }
      return `${who} ${what}`;
    }).join('，');

    lines.push(`${prefix}: ${actions}`);
  }

  if (hand.heroThought) {
    lines.push(`我的想法: ${hand.heroThought}`);
  }

  if (hand.result && hand.result !== 'unknown') {
    const amount = hand.resultAmount ? ` ${formatBB(Math.abs(hand.resultAmount))}bb` : '';
    lines.push(`结果: ${RESULT_LABEL[hand.result]}${amount}`);
  }

  return lines.join('\n');
}

/** 把 "AsKh" 转成带花色的可读文本，如 "A♠ K♥" */
export function formatCardsForText(cards: string): string {
  return parseCards(cards)
    .map((c) => `${formatRank(c[0])}${SUIT_SYMBOL[c[1]] || c[1]}`)
    .join(' ');
}

/**
 * 生成默认标题：位置 + 底牌 + 底池类型。
 * 后端在标题为空时也会生成一份，这里生成是为了让用户在填写时就能看到标题。
 */
export function buildDefaultTitle(
  position: Position | '',
  heroCards: string,
  potType: PotType
): string {
  const parts: string[] = [];
  if (position) parts.push(position);
  if (heroCards && heroCards.length === 4) parts.push(heroCards);
  parts.push(POT_TYPE_LABEL[potType]);
  return parts.join(' ');
}

// 牌面校验统一放在 utils/cards.ts，这里再导出一次方便调用方只 import 一个模块
export { validateCardString } from './cards';
