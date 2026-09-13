// ============================================
// 站内消息 API 接口类型
// 对应后端: dto/message.go
// ============================================

import type { ListResponse } from './common';

/** 消息类型 */
export type MessageType =
  | 'score_request_created'
  | 'score_request_approved'
  | 'score_request_rejected';

/** 站内消息响应 */
export interface MessageResponse {
  id: number;
  type: MessageType | string;
  title: string;
  content: string;
  gameId?: number;
  requestId?: number;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
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
