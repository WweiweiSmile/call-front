// ============================================
// 站内消息 API 接口类型
// 对应后端: dto/message.go
// ============================================

import type { ListResponse } from './common';
import type { ScoreRequestResponse } from './scoreRequest';
import type { TagSuggestionResponse } from './tagSuggestion';

/**
 * 消息分类：决定消息详情页是"出按钮"还是"只读"。
 * 后端由 type 派生下发，前端不自己映射，避免两处判定漂移
 */
export type MessageCategory = 'approval' | 'notice';

/** 消息类型 */
export type MessageType =
  | 'score_request_created'
  | 'score_request_approved'
  | 'score_request_rejected'
  /** 发给系统管理：AI 提议了字典外的新标签，等审批入库 */
  | 'tag_suggestion_pending';

/** 站内消息响应 */
export interface MessageResponse {
  id: number;
  type: MessageType | string;
  /** approval-待我处理 / notice-结果告知 */
  category: MessageCategory;
  title: string;
  content: string;
  gameId?: number;
  requestId?: number;
  /** 关联的标签建议ID（标签审批类消息才有） */
  suggestionId?: number;
  isRead: boolean;
  /** 是否还能处理。后端由关联单据状态派生，处理完/被撤销都会变 false */
  actionable: boolean;
  readAt?: string;
  createdAt: string;
}

/** 消息详情：审批类消息附带关联单据，供审批人核对后再操作 */
export interface MessageDetailResponse extends MessageResponse {
  scoreRequest?: ScoreRequestResponse;
  tagSuggestion?: TagSuggestionResponse;
}

/** 消息列表响应 */
export type MessageListResponse = ListResponse<MessageResponse>;

/** 未读数响应 */
export interface UnreadCountResponse {
  count: number;
}

/** 消息列表查询参数 */
export interface GetMessagesParams {
  is_read?: boolean;
  page?: number;
  page_size?: number;
}
