// ============================================
// 前端使用的站内消息类型（ID 为 string）
// ============================================

import type { MessageCategory } from '../service/message';
import type { FrontendScoreRequest } from './scoreRequest';
import type { FrontendTagSuggestion } from './review';

export interface FrontendMessage {
  id: string;
  type: string;
  /** approval-待我处理 / notice-结果告知 */
  category: MessageCategory;
  title: string;
  content: string;
  gameId?: string;
  requestId?: string;
  /** 关联的标签建议ID（标签审批类消息才有） */
  suggestionId?: string;
  isRead: boolean;
  /** 是否还能处理 */
  actionable: boolean;
  createdAt: string;
}

/** 消息详情：审批类消息会带关联单据 */
export interface FrontendMessageDetail extends FrontendMessage {
  scoreRequest?: FrontendScoreRequest;
  tagSuggestion?: FrontendTagSuggestion;
}
