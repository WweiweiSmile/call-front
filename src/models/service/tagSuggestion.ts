// ============================================
// AI 新标签待审队列 API 接口类型
// 对应后端: dto/tag_suggestion.go
// ============================================

import type { LeakTagCategory } from '../types/review';

/** 建议状态 */
export type TagSuggestionStatus = 'pending' | 'approved' | 'rejected';

/** 标签建议响应 */
export interface TagSuggestionResponse {
  id: number;
  name: string;
  /** 模型给出的理由，审批时预填进判定说明 */
  reason: string;
  status: TagSuggestionStatus;
  /** 被提议的次数。越多越说明这个漏洞反复出现 */
  hitCount: number;
  reviewerId?: number;
  reviewRemark: string;
  reviewedAt?: string;
  /** 通过后落进标签字典的那条标签 */
  tagId?: number;
  createdAt: string;
}

/**
 * 审批通过请求。
 * 模型只给了 name 与 reason，而提示词里让模型选标签靠的是 code + name + description，
 * 所以 code 与 category 必须由审批人补齐
 */
export interface ApproveTagSuggestionRequest {
  code: string;
  name: string;
  category: LeakTagCategory;
  description?: string;
}

/** 驳回请求 */
export interface RejectTagSuggestionRequest {
  reviewRemark: string;
}
