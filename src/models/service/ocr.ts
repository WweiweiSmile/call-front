// ============================================
// 牌桌截图识别（OCR）服务类型
//
// 服务在 ~/codes/poker-ocr-poc（FastAPI，POST /ocr/table），与 call-back 无关：
// 前端直连它，响应是**裸 JSON，没有 {code, data} 包装**
// ============================================

import type { Position, Street, TableSize } from '../types/review';

/**
 * 识别出的一个座位。
 *
 * position 刻意声明成 string 而不是 Position：词表是外部输入，必须先过一遍
 * 校验才敢当 Position 用（见 utils/ocrTable.ts 的 toPosition）
 */
export interface OcrSeat {
  /** 玩家昵称。读不出时为 null */
  name: string | null;
  /** 位置名。没找到庄位推不出来时为 null */
  position: string | null;
  /** 筹码数量，纯数字。读不出时为 null。单位见 OcrTableResult.stack_unit */
  stack: number | null;
  /** 是不是我自己（界面上底部中间那个座位） */
  is_me: boolean;
}

/** OCR 服务返回的原始结构，字段名与它的响应一一对应（不是驼峰） */
export interface OcrTableResult {
  /** 几人桌。服务端保证等于 seats 的长度（只数入局的玩家） */
  table_size: number;
  /** stack 的单位。界面按 BB 显示，所以服务端原样透出 */
  stack_unit: string;
  /** 从我（hero）开始，沿行动方向绕一圈。文档约定 hero 恒在第一个 */
  seats: OcrSeat[];
  /** 识别不完整的原因。空数组表示一切正常 */
  warnings: string[];
}

/**
 * 供确认框预览的一条对手 —— 描述的是"将要写进表单"的样子，不是 OCR 的样子。
 *
 * 没读到的东西一律留空，**不填占位值**：位置留空由用户手选，筹码留空是因为
 * 表单靠"有没有筹码"决定全下金额算不算得出来，编一个默认值等于往库里写假数据
 */
export interface OcrVillainPreview {
  /** '' 表示没读出名字。界面上会用位置代替显示，但**不会写进对手表的 name** */
  name: string;
  /** '' 表示位置待选 */
  position: Position | '';
  /** '' 表示没读出筹码 */
  stackBb: string;
  /** 来自 OCR 结果里的第几个座位（从 0 数）。预览里用来指出是哪个座位缺东西 */
  sourceIndex: number;
}

/** 一次识别将要写进表单的全部内容 */
export interface OcrTableDraft {
  tableSize: TableSize;
  /** '' 表示没读到/不合法，需要用户手选 */
  heroPosition: Position | '';
  /** 我的有效筹码（BB）。读不出时保留表单原值 */
  heroStackBb: string;
  villains: OcrVillainPreview[];
  /** OCR 服务自报的识别缺陷，原样透传 */
  warnings: string[];
  /** 映射过程中我做了什么处理（比 warnings 更具体：哪个座位被我留空了、为什么） */
  issues: string[];
  /** 将被替换掉的现有对手数 */
  replacedVillainCount: number;
  /** 覆盖后会删掉的行动记录条数与所在街道。页面不要自己再算一遍 */
  droppedActionCount: number;
  droppedActionStreets: Street[];
}

/** 映射结果。结构性失败（连预览都给不出来）时只有一句原因 */
export type OcrDraftResult =
  | { ok: true; draft: OcrTableDraft }
  | { ok: false; reason: string };
