// ============================================
// 前端使用的存取分申请类型（ID 为 string）
// ============================================

export type FrontendScoreRequestType = 'deposit' | 'withdraw';
export type FrontendScoreRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface FrontendScoreRequest {
  id: string;
  gameId: string;
  gameName: string;
  userId: string;
  userName: string;
  type: FrontendScoreRequestType;
  amount: number;
  remark: string;
  status: FrontendScoreRequestStatus;
  reviewerId?: string;
  reviewerName?: string;
  reviewRemark: string;
  reviewedAt?: string;
  createdAt: string;
}
