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
  MessageRole,
  Opponent,
  PotType,
  Position,
  ProfileLeakStat,
  ProfileStrengthItem,
  ReviewInsight,
  StreetRecord,
  TableSize,
  VillainInfo,
} from '../types/review';

/** 手牌请求（创建与更新共用，更新为整体替换语义） */
export interface ReviewHandRequest {
  gameId?: number;
  title?: string;
  /** 留空按 9 人桌处理 */
  tableSize?: TableSize;
  heroPosition: Position;
  heroCards: string;
  heroStackBb?: number;
  stakes?: string;
  /** 盲注与前注（BB）。三项都是 0 表示没记录，底池按不含盲注的老口径估算 */
  smallBlindBb?: number;
  bigBlindBb?: number;
  anteBb?: number;
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
  tableSize: TableSize;
  heroPosition: Position;
  heroCards: string;
  heroStackBb: number;
  stakes: string;
  smallBlindBb: number;
  bigBlindBb: number;
  anteBb: number;
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

/** 对手名单查询参数 */
export interface SearchOpponentsParams {
  keyword?: string;
  /** 返回条数上限，后端默认 20、上限 50 */
  limit?: number;
}

/** 对手名单响应 */
export interface OpponentListResponse {
  list: Opponent[];
}

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
  /**
   * 没有新建分析，返回的是已有的一条（没有调用模型，也没扣额度）。两种来源：
   * 内容未变、复用上次结论；或这手牌正在分析中，把那条还给你了。
   * 两种的 status 不同，要不要说"内容没变"得看它
   */
  reused: boolean;
}

/** AI 可用状态响应 */
export interface AIStatusResponse {
  enabled: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}

// ============================================
// 长期记忆接口类型（M4）
// 对应后端: dto/review_memory.go
// ============================================

/** 用户复盘画像响应 */
export interface ReviewProfileResponse {
  userId: number;
  handsReviewed: number;
  leaks: ProfileLeakStat[];
  strengths: ProfileStrengthItem[];
  summary: string;
  summaryVersion: number;
  lastSummaryAt?: string;
  /**
   * 总结重写任务的状态。pending/running 时 summary 还是上一版，
   * 应当显示"生成中"并轮询，而不是把旧总结当成刚生成的结果
   */
  summaryStatus: AnalysisStatus;
  /** 只有 failed 时有值 */
  summaryError?: string;
}

/** 某漏洞的历史证据响应 */
export interface ReviewInsightListResponse {
  list: ReviewInsight[];
}

/** 钻取查询参数 */
export interface GetReviewInsightsParams {
  /** 不传则返回全部漏洞的洞察 */
  tag_code?: string;
  limit?: number;
}

// ============================================
// 追问对话接口类型（M5）
// 对应后端: dto/review_chat.go
// ============================================

/** 追问请求 */
export interface AskReviewMessageRequest {
  content: string;
}

/** 一条对话消息 */
export interface ReviewMessageResponse {
  id: number;
  role: MessageRole;
  /**
   * 消息正文。assistant 消息在后台答完之前是空串，**不能拿它当完成判据**——
   * 要看 status（模型也可能返回空内容，那种情况下两者都空）
   */
  content: string;
  /** pending/running/done/failed。user 消息恒为 done */
  status: AnalysisStatus;
  /** 只有 failed 的 assistant 消息有值 */
  errorMsg?: string;
  /** 只有 assistant 消息有值 */
  tokensIn?: number;
  tokensOut?: number;
  createdAt: string;
}

/**
 * 追问结果。用户那条也由后端返回，前端据权威 id 渲染。
 *
 * 异步：answer 通常是 status=pending 的占位记录（content 为空），要轮询
 */
export interface AskReviewMessageResponse {
  question: ReviewMessageResponse;
  answer: ReviewMessageResponse;
  /** 本次没有新建任务，返回的是这手牌正在跑的那对：别清空输入框，提示用户等待 */
  inflight: boolean;
}

/** 对话历史 */
export interface ReviewMessageListResponse {
  list: ReviewMessageResponse[];
}
