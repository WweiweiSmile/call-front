// ============================================
// 牌桌截图识别结果 → 录入表单
//
// 纯函数，**不 import Taro**：这样 tools/ 下的校验脚本能 tsc 编译后直接用
// node 跑真函数（与 utils/poker.ts 同样的路子），不必抄一份副本出来对拍
// ============================================

import { OPPONENT_NAME_MAX_LENGTH, TABLE_SIZE_OPTIONS } from '../models/types/review';
import { isValidPositionForTableSize } from './poker';
import type { Position, Street, StreetRecord, TableSize } from '../models/types/review';
import type {
  OcrDraftResult,
  OcrTableDraft,
  OcrTableResult,
  OcrVillainPreview,
} from '../models/service/ocr';

/**
 * 映射要用到的表单切片。
 *
 * 放宽成最小结构而不是 ReviewFormState：utils 不该反向依赖页面，
 * 而且这样校验脚本构造入参时不用造一整个表单
 */
export interface OcrFillTarget {
  /** 我的有效筹码（BB，输入框里的字符串）。OCR 没读出来时保留它 */
  heroStackBb: string;
  /** 现有对手数，用来告诉用户会替换掉几个 */
  villainCount: number;
  /** 现有行动记录，用来算覆盖后会删掉几条 */
  streets: StreetRecord[];
}

/**
 * 覆盖之后"还能出现的行动者"全集。
 *
 * hero / villain / other 恒保留：我是永远在场的行动者，而 villain 与 other 是
 * M7.1 之前老数据的聚合角色，本来就不指向任何具体座位
 */
export function validActorsAfter(
  draft: Pick<OcrTableDraft, 'heroPosition' | 'villains'>
): Set<string> {
  const valid = new Set<string>(['hero', 'villain', 'other']);
  if (draft.heroPosition) valid.add(draft.heroPosition);
  for (const villain of draft.villains) {
    if (villain.position) valid.add(villain.position);
  }
  return valid;
}

/**
 * 覆盖后会失效的行动记录。
 *
 * 关键是判据比"位置消失了"更宽：整体覆盖换掉的是整个对手列表，
 * 一个位置即使对新人数依然合法，只要新列表里没有这个人，指向它的行动就没人认领了 ——
 * 留着会被后端以"无效的行动者"拒收，而报错完全看不出是导入导致的
 */
export function collectDroppedActions(
  streets: StreetRecord[],
  valid: Set<string>
): { count: number; streets: Street[] } {
  const hit: Street[] = [];
  let count = 0;
  for (const record of streets) {
    const dropped = record.actions.filter((action) => !valid.has(action.actor)).length;
    if (dropped > 0) {
      count += dropped;
      hit.push(record.street);
    }
  }
  return { count, streets: hit };
}

/**
 * 把 OCR 读到的位置收敛成该人数下的合法位置。
 *
 * 空值要先判：isValidPositionForTableSize 收到 '' 也返回 false，
 * 拿它判空就分不出"没读到"和"读到了但不合法"，提示会说错原因
 */
function toPosition(
  rawPosition: string | null,
  tableSize: TableSize,
  label: string,
  issues: string[]
): Position | '' {
  if (!rawPosition) {
    issues.push(`${label}没读到位置，请你手动选一下`);
    return '';
  }
  if (!isValidPositionForTableSize(rawPosition, tableSize)) {
    issues.push(`${tableSize} 人桌没有「${rawPosition}」这个位置（${label}），已留空请你手动选`);
    return '';
  }
  return rawPosition as Position;
}

/** 筹码留空一律走这里：编一个默认值会绕过"算不出全下金额就留空"的保护 */
function toStackBb(stack: number | null, label: string, issues: string[]): string {
  if (stack === null || stack === undefined || !isFinite(stack) || stack <= 0) {
    issues.push(`${label}没读到筹码，请你补一下`);
    return '';
  }
  return String(stack);
}

/**
 * 识别结果 → 表单草稿。结构性问题（一个人都没识别出来、人数越界）直接失败，
 * 其余情况一律照填 + 记 issues，交给用户在确认框里判断
 */
export function buildOcrDraft(raw: OcrTableResult, current: OcrFillTarget): OcrDraftResult {
  const warnings = [...(raw.warnings || [])];
  const issues: string[] = [];

  const seats = raw.seats || [];
  if (seats.length === 0) {
    return { ok: false, reason: '没有识别到任何座位，换一张更清楚的截图试试' };
  }

  // 人数以数出来的座位数为准：服务端自述的 table_size 与它对不上时，
  // 数出来的更可信（服务端也只在数完非空座位后才知道人数）
  if (raw.table_size !== seats.length) {
    issues.push(`识别出的人数（${raw.table_size}）与座位数（${seats.length}）不一致，按座位数算`);
  }
  const tableSize = seats.length as TableSize;
  if (TABLE_SIZE_OPTIONS.indexOf(tableSize) < 0) {
    // 不往最近的合法值上靠：人数一变，位置的含义与底池口径全跟着变，
    // 静默掰成 2 或 9 等于替用户改了牌局
    return {
      ok: false,
      reason: `识别出 ${tableSize} 人桌，不在 2–9 人桌范围内，请你手动确认人数`,
    };
  }

  // 谁是我：is_me 是服务端明确算出来的信号，seats[0] 只是文档约定，冲突时以 is_me 为准
  let heroIndex = seats.findIndex((seat) => seat.is_me);
  if (heroIndex < 0) {
    heroIndex = 0;
  } else if (heroIndex !== 0) {
    issues.push('识别结果里「我」不在第一个座位，已按 is_me 标记取');
  }
  const hero = seats[heroIndex];

  // 筹码单位不是 BB 时全部留空：表单存的就是 BB，直接塞进去等于静默写错数据
  const unitMismatch = !!raw.stack_unit && raw.stack_unit !== 'BB';
  if (unitMismatch) {
    issues.push(`识别出的筹码单位是「${raw.stack_unit}」而不是 BB，筹码已全部留空`);
  }

  const heroPosition = toPosition(hero.position, tableSize, '我', issues);

  // 我的筹码没读出来时保留表单原值：那个值是表单自己的默认值（100bb），
  // 不是 OCR 的结论，清掉只会让用户多敲一次
  const heroStackMissing =
    unitMismatch || hero.stack === null || hero.stack === undefined || !isFinite(hero.stack);
  const heroStackBb = heroStackMissing
    ? current.heroStackBb
    : toStackBb(hero.stack, '我', issues);
  if (heroStackMissing && !unitMismatch) {
    issues.push(`我的筹码没读到，先保留原来的 ${current.heroStackBb || '空值'}`);
  }

  // 位置在手内唯一是硬约束（提交时校验会拒"有两个对手都坐在 CO"）。
  // 我自己先占住一个座位，占位表从我开始建
  const takenPositions = new Set<string>();
  if (heroPosition) takenPositions.add(heroPosition);

  const villains: OcrVillainPreview[] = [];
  seats.forEach((seat, index) => {
    if (index === heroIndex) return;
    const label = `第 ${index + 1} 个座位`;

    let name = (seat.name || '').trim();
    if (name.length > OPPONENT_NAME_MAX_LENGTH) {
      name = name.slice(0, OPPONENT_NAME_MAX_LENGTH);
      issues.push(`${label}的名字超过 ${OPPONENT_NAME_MAX_LENGTH} 个字，已截断`);
    }

    let position = toPosition(seat.position, tableSize, label, issues);
    if (position && position === heroPosition) {
      issues.push(`${label}的位置 ${position} 和我撞了，已留空请你手动选`);
      position = '';
    } else if (position && takenPositions.has(position)) {
      issues.push(`${label}的位置 ${position} 和前面的座位重复，已留空请你手动选`);
      position = '';
    }
    if (position) takenPositions.add(position);

    villains.push({
      name,
      position,
      stackBb: unitMismatch ? '' : toStackBb(seat.stack, label, issues),
      sourceIndex: index,
    });
  });

  const draft: OcrTableDraft = {
    tableSize,
    heroPosition,
    heroStackBb,
    villains,
    warnings,
    issues,
    replacedVillainCount: current.villainCount,
    droppedActionCount: 0,
    droppedActionStreets: [],
  };

  const dropped = collectDroppedActions(current.streets, validActorsAfter(draft));
  draft.droppedActionCount = dropped.count;
  draft.droppedActionStreets = dropped.streets;

  return { ok: true, draft };
}
