import { request } from './request';
import type {
  MessageDetailResponse,
  MessageListResponse,
  UnreadCountResponse,
  GetMessagesParams,
} from '../models/service';

// 站内消息相关 API
export const messageApi = {
  // 消息列表
  getList: (params?: GetMessagesParams) => {
    const query = new URLSearchParams();
    if (params?.is_read !== undefined) query.append('is_read', String(params.is_read));
    if (params?.page) query.append('page', params.page.toString());
    if (params?.page_size) query.append('page_size', params.page_size.toString());
    const queryString = query.toString();
    return request<MessageListResponse>(`/messages${queryString ? `?${queryString}` : ''}`);
  },

  // 单条消息详情。审批类消息会带关联申请单，供详情页核对后再通过/驳回
  getDetail: (messageId: string) => {
    return request<MessageDetailResponse>(`/messages/${messageId}`);
  },

  // 未读消息数（轮询用）
  getUnreadCount: () => {
    return request<UnreadCountResponse>('/messages/unread-count');
  },

  // 单条标记已读
  markRead: (messageId: string) => {
    return request<void>(`/messages/${messageId}/read`, {
      method: 'POST',
    });
  },

  // 全部标记已读，可只清某个场次
  markAllRead: (gameId?: string) => {
    return request<void>('/messages/read-all', {
      method: 'POST',
      data: gameId ? { gameId: parseInt(gameId, 10) } : {},
    });
  },
};
