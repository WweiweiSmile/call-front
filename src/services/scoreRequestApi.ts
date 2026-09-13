import { request } from './request';
import type {
  CreateScoreRequestRequest,
  ReviewScoreRequestRequest,
  ScoreRequestResponse,
  ScoreRequestListResponse,
  GetScoreRequestsParams,
} from '../models/service';

// 存取分申请相关 API
export const scoreRequestApi = {
  // 提交申请（申请人取自 token）
  create: (data: CreateScoreRequestRequest) => {
    return request<ScoreRequestResponse>('/score-requests', {
      method: 'POST',
      data,
    });
  },

  // 申请列表。scope=mine 我提交的，scope=review 我创建场次的待审
  getList: (params?: GetScoreRequestsParams) => {
    const query = new URLSearchParams();
    if (params?.gameId) query.append('game_id', params.gameId);
    if (params?.status) query.append('status', params.status);
    if (params?.scope) query.append('scope', params.scope);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.page_size) query.append('page_size', params.page_size.toString());
    const queryString = query.toString();
    return request<ScoreRequestListResponse>(
      `/score-requests${queryString ? `?${queryString}` : ''}`
    );
  },

  // 审核通过
  approve: (requestId: string, data?: ReviewScoreRequestRequest) => {
    return request<ScoreRequestResponse>(`/score-requests/${requestId}/approve`, {
      method: 'POST',
      data: data || {},
    });
  },

  // 审核驳回
  reject: (requestId: string, data: ReviewScoreRequestRequest) => {
    return request<ScoreRequestResponse>(`/score-requests/${requestId}/reject`, {
      method: 'POST',
      data,
    });
  },

  // 撤销自己的待审申请
  cancel: (requestId: string) => {
    return request<void>(`/score-requests/${requestId}/cancel`, {
      method: 'POST',
    });
  },
};
