// ============================================
// 复盘 API 接口类型
// 对应后端: dto/review.go
// ============================================

import type { ListResponse } from './common';
import type {
  AnalysisResult,
  AnalysisStatus,
  AnalyzeStatus,
  HandResult,
  LeakTagCategory,
  PotType,
  Position,
  StreetRecord,
  VillainInfo,
} from '../types/review';

/** 手牌请求（创建与更新共用，更新为整体替换语义） */
export interface ReviewHandRequest {
  gameId?: number;
  title?: string;
  heroPosition: Position;
  heroCards: string;
  heroStackBb?: number;
  stakes?: string;
  board?: string;
  villainCount?: number;
  villains?: VillainInfo[];
  potType?: PotType;
  streets?: StreetRecord[];
  heroThought?: string;
  result?: HandResult;
  resultAmount?: number;
  heroTags?: string[];
}

/** 手牌响应 */
export interface ReviewHandResponse {
  id: number;
  gameId?: number;
  gameName?: string;
  title: string;
  heroPosition: Position;
  heroCards: string;
  heroStackBb: number;
  stakes: string;
  board: string;
  villainCount: number;
  villains: VillainInfo[];
  potType: PotType;
  streets: StreetRecord[];
  heroThought: string;
  result: HandResult;
  resultAmount?: number;
  heroTags: string[];
  analyzeStatus: AnalyzeStatus;
  createdAt: string;
  updatedAt: string;
}

/** 手牌列表响应 */
export type ReviewHandListResponse = ListResponse<ReviewHandResponse>;

/** 手牌列表查询参数 */
export interface GetReviewHandsParams {
  position?: string;
  tag?: string;
  game_id?: number;
  analyze_status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

/** 漏洞标签响应 */
export interface ReviewLeakTagResponse {
  code: string;
  name: string;
  category: LeakTagCategory;
  description: string;
  sortOrder: number;
}

/** 漏洞标签字典响应 */
export interface ReviewLeakTagListResponse {
  list: ReviewLeakTagResponse[];
}

// ============================================
// AI 分析接口类型
// 对应后端: dto/review_analysis.go
// ============================================

/** 分析记录响应 */
export interface ReviewAnalysisResponse {
  id: number;
  handId: number;
  status: AnalysisStatus;
  model: string;
  promptVersion: string;
  /** 仅 status=done 时有值 */
  result?: AnalysisResult;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  errorMsg?: string;
  /** 手牌内容已修改，结论不再对应当前内容（仅列表接口返回） */
  stale?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 分析列表响应 */
export interface ReviewAnalysisListResponse {
  list: ReviewAnalysisResponse[];
}

/** 触发分析的响应 */
export interface RequestAnalysisResponse {
  analysis: ReviewAnalysisResponse;
  /** 内容未变、直接复用了上次结论（没有调用模型，也没扣额度） */
  reused: boolean;
}

/** AI 可用状态响应 */
export interface AIStatusResponse {
  enabled: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}
