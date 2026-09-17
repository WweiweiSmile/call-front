import { request } from './request';
import type {
  ApproveTagSuggestionRequest,
  RejectTagSuggestionRequest,
  TagSuggestionResponse,
} from '../models/service';

// AI 新标签的入库审批。只有系统管理能调用，服务端在 service 层校验
export const tagSuggestionApi = {
  // 审批通过：补齐词典字段后写入标签字典，对所有人生效
  approve: (suggestionId: string, data: ApproveTagSuggestionRequest) => {
    return request<TagSuggestionResponse>(`/reviews/tag-suggestions/${suggestionId}/approve`, {
      method: 'POST',
      data,
    });
  },

  // 驳回
  reject: (suggestionId: string, data: RejectTagSuggestionRequest) => {
    return request<TagSuggestionResponse>(`/reviews/tag-suggestions/${suggestionId}/reject`, {
      method: 'POST',
      data,
    });
  },
};
