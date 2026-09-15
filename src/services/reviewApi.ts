import { request } from './request';
import type {
  AIStatusResponse,
  GetReviewHandsParams,
  RequestAnalysisResponse,
  ReviewAnalysisListResponse,
  ReviewAnalysisResponse,
  ReviewHandListResponse,
  ReviewHandRequest,
  ReviewHandResponse,
  ReviewLeakTagListResponse,
} from '../models/service';

// 复盘相关 API
export const reviewApi = {
  // 创建手牌
  createHand: (data: ReviewHandRequest) => {
    return request<ReviewHandResponse>('/reviews/hands', {
      method: 'POST',
      data,
    });
  },

  // 手牌列表
  getHands: (params?: GetReviewHandsParams) => {
    const query = new URLSearchParams();
    if (params?.position) query.append('position', params.position);
    if (params?.tag) query.append('tag', params.tag);
    if (params?.game_id) query.append('game_id', params.game_id.toString());
    if (params?.analyze_status) query.append('analyze_status', params.analyze_status);
    if (params?.keyword) query.append('keyword', params.keyword);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.page_size) query.append('page_size', params.page_size.toString());
    const queryString = query.toString();
    return request<ReviewHandListResponse>(`/reviews/hands${queryString ? `?${queryString}` : ''}`);
  },

  // 手牌详情
  getHand: (id: string) => {
    return request<ReviewHandResponse>(`/reviews/hands/${id}`);
  },

  // 更新手牌（整体替换）
  updateHand: (id: string, data: ReviewHandRequest) => {
    return request<ReviewHandResponse>(`/reviews/hands/${id}`, {
      method: 'PUT',
      data,
    });
  },

  // 删除手牌
  deleteHand: (id: string) => {
    return request<void>(`/reviews/hands/${id}`, {
      method: 'DELETE',
    });
  },

  // 漏洞标签字典
  getLeakTags: () => {
    return request<ReviewLeakTagListResponse>('/reviews/leak-tags');
  },

  // 触发 AI 分析。异步接口，立即返回 pending 记录，结果靠轮询拿
  analyzeHand: (id: string) => {
    return request<RequestAnalysisResponse>(`/reviews/hands/${id}/analyze`, {
      method: 'POST',
    });
  },

  // 查询分析状态与结果（轮询用）
  getAnalysis: (analysisId: string) => {
    return request<ReviewAnalysisResponse>(`/reviews/analyses/${analysisId}`);
  },

  // 某手牌的历史分析列表
  getHandAnalyses: (id: string) => {
    return request<ReviewAnalysisListResponse>(`/reviews/hands/${id}/analyses`);
  },

  // AI 是否可用、今日剩余额度
  getAIStatus: () => {
    return request<AIStatusResponse>('/reviews/ai-status');
  },
};
