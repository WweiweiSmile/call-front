// ============================================
// 存取分申请 API 接口类型
// 对应后端: dto/score_request.go
// ============================================

import type { ListResponse } from './common';

/** 申请类型 */
export type ScoreRequestType = 'deposit' | 'withdraw';

/** 申请状态 */
export type ScoreRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** 提交存取分申请（申请人取自 token，无 userId 字段） */
export interface CreateScoreRequestRequest {
  gameId: number;
  type: ScoreRequestType;
  amount: number;
  remark?: string;
}

/** 审核申请 */
export interface ReviewScoreRequestRequest {
  reviewRemark?: string;
}

/** 申请单响应 */
export interface ScoreRequestResponse {
  id: number;
  gameId: number;
  gameName?: string;
  userId: number;
  userName?: string;
  type: ScoreRequestType;
  amount: number;
  remark: string;
  status: ScoreRequestStatus;
  reviewerId?: number;
  reviewerName?: string;
  reviewRemark: string;
  reviewedAt?: string;
  transactionId?: number;
  createdAt: string;
}

/** 申请单列表响应 */
export type ScoreRequestListResponse = ListResponse<ScoreRequestResponse>;

/** 申请列表查询参数 */
export interface GetScoreRequestsParams {
  gameId?: string;
  status?: ScoreRequestStatus;
  /** mine-我提交的（默认）, review-我创建场次的待审 */
  scope?: 'mine' | 'review';
  page?: number;
  page_size?: number;
}
