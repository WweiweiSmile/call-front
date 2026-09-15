// ============================================
// 德州扑克领域工具
// 底池估算、街道文案、位置与桌型
// 录入页、详情页、列表卡片共用，避免各写一份
// ============================================

import type {
  ActionType,
  ActorType,
  HandResult,
  Position,
  PotType,
  Street,
  StreetRecord,
} from '../models/types/review';

// 人数相关的常量定义在 models/types/review.ts（类型与其默认值放在一起），
// 这里再导一次，方便调用方只 import 一个模块
export { TABLE_SIZE_OPTIONS, DEFAULT_TABLE_SIZE } from '../models/types/review';

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

/**
 * 各人数下的合法位置，按翻前行动顺序（SB 先说话，BTN 最后）。
 *
 * 与后端 call-back/utils/hand.go 的 positionsByTableSize 是同一份契约，改动要两边同步。
 * 规律：9 人桌去掉 UTG+2 就是 8 人，再去掉 UTG+1 就是 7 人，以此类推；
 * 3 人桌只剩 BTN，2 人桌的 SB 同时兼任 BTN（单挑时按钮位下小盲）。
 */
const POSITIONS_BY_TABLE_SIZE: Record<number, Position[]> = {
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
  5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
  4: ['SB', 'BB', 'UTG', 'BTN'],
  3: ['SB', 'BB', 'BTN'],
  2: ['SB', 'BB'],
};

/** 全部位置，按翻前行动顺序。列表页筛选用它；人数取值异常时也回退到它 */
export const POSITION_ORDER: Position[] = POSITIONS_BY_TABLE_SIZE[9];

/** 该人数下的合法位置；人数越界时回退到全部位置，避免界面空掉 */
export function positionsForTableSize(tableSize: number): Position[] {
  return POSITIONS_BY_TABLE_SIZE[tableSize] || POSITION_ORDER;
}

/** 位置是否属于该人数下的合法集合 */
export function isValidPositionForTableSize(position: string, tableSize: number): boolean {
  return positionsForTableSize(tableSize).indexOf(position as Position) >= 0;
}

/**
 * 位置的展示名。2 人桌的 SB 同时是 BTN，标出来免得用户以为界面上漏了按钮位。
 * 存库的值始终是 SB——加个后缀只是为了显示，不参与任何匹配。
 */
export function positionLabel(position: Position | '', tableSize: number): string {
  if (tableSize === 2 && position === 'SB') return 'SB(BTN)';
  return position;
}

/** 桌型展示名，如 "6人桌" */
export function tableSizeLabel(tableSize: number): string {
  return `${tableSize}人桌`;
}

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
