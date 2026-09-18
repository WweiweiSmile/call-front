import { request } from './request';
import type {
  AIStatusResponse,
  AskReviewMessageResponse,
  GetReviewHandsParams,
  GetReviewInsightsParams,
  OpponentListResponse,
  RequestAnalysisResponse,
  SearchOpponentsParams,
  ReviewAnalysisListResponse,
  ReviewAnalysisResponse,
  ReviewHandListResponse,
  ReviewHandRequest,
  ReviewHandResponse,
  ReviewInsightListResponse,
  ReviewLeakTagListResponse,
  ReviewMessageListResponse,
  ReviewProfileResponse,
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

  // 搜索我的对手名单（添加对手弹窗的下拉框用）
  searchOpponents: (params?: SearchOpponentsParams) => {
    const query = new URLSearchParams();
    if (params?.keyword) query.append('keyword', params.keyword);
    if (params?.limit) query.append('limit', params.limit.toString());
    const queryString = query.toString();
    return request<OpponentListResponse>(
      `/reviews/opponents${queryString ? `?${queryString}` : ''}`
    );
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

  // ---------- 长期记忆（M4）----------

  // 我的复盘画像。后端会顺手重算一次统计，所以拿到的计数总是最新的
  getProfile: () => {
    return request<ReviewProfileResponse>('/reviews/profile');
  },

  // 手动触发画像总结重写。同步接口，会真实调用模型，耗时约十几秒
  refreshProfileSummary: () => {
    return request<ReviewProfileResponse>('/reviews/profile/summary/refresh', {
      method: 'POST',
    });
  },

  // 某个漏洞的全部历史证据。不传 tag_code 则返回全部漏洞的洞察
  getInsights: (params?: GetReviewInsightsParams) => {
    const query = new URLSearchParams();
    if (params?.tag_code) query.append('tag_code', params.tag_code);
    if (params?.limit) query.append('limit', params.limit.toString());
    const queryString = query.toString();
    return request<ReviewInsightListResponse>(
      `/reviews/insights${queryString ? `?${queryString}` : ''}`
    );
  },

  // ---------- 追问对话（M5）----------

  // 追问。同步接口：后端会真实调用模型，耗时约十几秒
  askQuestion: (handId: string, content: string) => {
    return request<AskReviewMessageResponse>(`/reviews/hands/${handId}/messages`, {
      method: 'POST',
      data: { content },
    });
  },

  // 某手牌的对话历史，按时间升序
  getMessages: (handId: string) => {
    return request<ReviewMessageListResponse>(`/reviews/hands/${handId}/messages`);
  },
};
