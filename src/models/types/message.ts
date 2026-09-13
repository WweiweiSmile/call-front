// ============================================
// 前端使用的站内消息类型（ID 为 string）
// ============================================

export interface FrontendMessage {
  id: string;
  type: string;
  title: string;
  content: string;
  gameId?: string;
  requestId?: string;
  isRead: boolean;
  createdAt: string;
}
