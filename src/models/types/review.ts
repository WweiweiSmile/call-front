// ============================================
// Review - 复盘手牌模型
// 对应后端: models/review_hand.go / models/review_leak_tag.go
// ============================================

/** 街道 */
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** 行动类型 */
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** 行动者。other 表示不关注的其他玩家，聚合成一个角色即可 */
export type ActorType = 'hero' | 'villain' | 'other';

/**
 * 位置。取值随人数变化，合法组合见 utils/poker.ts 的 positionsForTableSize。
 *
 * 没有 MP：它既能读成 LJ 也能读成 HJ，交给 AI 分析是歧义，已由后端的
 * MP→HJ 迁移统一取代（见 call-back/database/migrate_20260915_table_size.sql）。
 */
export type Position = 'SB' | 'BB' | 'UTG' | 'UTG+1' | 'UTG+2' | 'LJ' | 'HJ' | 'CO' | 'BTN';

/** 几人桌。2 人桌时 SB 同时是 BTN */
export type TableSize = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 可选人数，升序。与后端 models.MinTableSize / MaxTableSize 对应 */
export const TABLE_SIZE_OPTIONS: TableSize[] = [2, 3, 4, 5, 6, 7, 8, 9];

/** 默认人数：满员桌。与后端 models.DefaultTableSize 对应 */
export const DEFAULT_TABLE_SIZE: TableSize = 9;

/** 底池类型 */
export type PotType = 'hu' | 'multi';

/** 手牌结果 */
export type HandResult = 'win' | 'lose' | 'fold' | 'unknown';

/** AI 分析状态。M1/M2 恒为 none，M3 接入分析后才有其它值 */
export type AnalyzeStatus = 'none' | 'pending' | 'done' | 'failed';

/** 一条行动记录 */
export interface StreetAction {
  actor: ActorType;
  action: ActionType;
  /** bet/raise/allin 的金额（BB）；raise 记录"加到多少" */
  amountBb?: number;
}

/** 一条街的完整行动序列 */
export interface StreetRecord {
  street: Street;
  /** 按发生顺序 */
  actions: StreetAction[];
  /** 该街开始时的底池（BB） */
  potStartBb?: number;
}

/** 对手信息。v1 只要求标出关键对手 */
export interface VillainInfo {
  position: Position;
  stackBb?: number;
  /** 是否为关键对手 */
  isKey?: boolean;
}

/** 复盘手牌（后端原始模型） */
export interface ReviewHand {
  id: number;
  userId: number;
  gameId?: number;
  title: string;
  /** 几人桌。位置的含义取决于它，两者要一起读 */
  tableSize: TableSize;
  heroPosition: Position;
  /** 规范格式如 AsKh */
  heroCards: string;
  heroStackBb: number;
  stakes: string;
  /** 按发牌顺序拼接如 Qs7h2d3c9s，长度 0/6/8/10 */
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

/** 漏洞标签字典项 */
export interface ReviewLeakTag {
  code: string;
  name: string;
  category: LeakTagCategory;
  description: string;
  sortOrder: number;
}

/** 标签分类 */
export type LeakTagCategory = 'preflop' | 'postflop' | 'mental' | 'bankroll';

// ============================================
// 前端状态管理使用的类型（ID 为 string）
// ============================================

/** 前端使用的复盘手牌类型 */
export interface FrontendReviewHand {
  id: string;
  gameId?: string;
  gameName?: string;
  title: string;
  tableSize: TableSize;
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

// ============================================
// AI 分析
// 对应后端: models/review_analysis.go
// ============================================

/** 分析任务状态 */
export type AnalysisStatus = 'pending' | 'running' | 'done' | 'failed';

/** 单条街的评价结论 */
export type StreetVerdict = 'ok' | 'marginal' | 'mistake';

/** 单条街的评价 */
export interface StreetAnalysisItem {
  street: Street;
  verdict: StreetVerdict;
  comment: string;
}

/** 关键错误。后端最多给一个，逼模型分清主次 */
export interface KeyMistakeItem {
  street: Street;
  what: string;
  why: string;
  betterLine: string;
}

/** 替代线路 */
export interface AlternativeItem {
  line: string;
  note: string;
}

/** 一个漏洞。evidence 必填，是"点击漏洞钻取到具体手牌"的依据 */
export interface LeakItem {
  tagCode: string;
  /** 1 轻微 / 2 明显 / 3 严重 */
  severity: number;
  evidence: string;
}

/**
 * 做得好的地方。
 *
 * 刻意不带标签：标签字典是"漏洞"字典，用漏洞标签描述优点会自相矛盾
 * （真实测试里模型把「大盲防守过松」当优点用了）。
 * 优点也不需要参与长期记忆的聚合，一段文字就够
 */
export interface StrengthItem {
  text: string;
}

/** 模型提议的新标签，走人工审核，不直接入字典 */
export interface SuggestedTagItem {
  name: string;
  reason: string;
}

/** 结构化分析结果 */
export interface AnalysisResult {
  handSummary: string;
  streetAnalysis: StreetAnalysisItem[];
  keyMistake?: KeyMistakeItem;
  alternatives: AlternativeItem[];
  leaks: LeakItem[];
  strengths: StrengthItem[];
  suggestedTags?: SuggestedTagItem[];
  drills: string[];
}

/** 前端使用的分析记录 */
export interface FrontendAnalysis {
  id: string;
  handId: string;
  status: AnalysisStatus;
  model: string;
  promptVersion: string;
  /** 仅 status=done 时有值 */
  result?: AnalysisResult;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  errorMsg?: string;
  /**
   * 手牌内容已被修改，这条结论对应的是修改前的内容。
   * 只有历史分析列表接口会带这个字段，单条查询接口不带
   */
  stale?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** AI 可用状态 */
export interface FrontendAIStatus {
  enabled: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}

// ============================================
// 长期记忆（M4）
// 对应后端: models/review_insight.go
// ============================================

/** 洞察类型：漏洞 / 优点 */
export type InsightKind = 'leak' | 'strength';

/** 画像里的一个漏洞条目 */
export interface ProfileLeakStat {
  tagCode: string;
  name: string;
  /** 统计窗口（最近 30 手 / 90 天内）的出现次数 */
  count: number;
  /**
   * 统计窗口之外的累计次数。
   * count 为 0 而这个数很大，说明以前常犯、最近没再出现 —— 是进步，不是数据缺失
   */
  historicCount: number;
  /** 最近一次出现（YYYY-MM-DD），含窗口之外的历史 */
  lastSeenAt: string;
  /** 平均严重度，原始浮点数，展示时再格式化 */
  avgSeverity: number;
  /** 最近的几条证据，已按时间升序 */
  topEvidence: string[];
}

/** 画像里的一条优点。刻意不做聚合计数，优点没有标签可聚合 */
export interface ProfileStrengthItem {
  text: string;
  /** 对应的手牌，便于跳转查看 */
  handId: number;
  date: string;
}

/** 用户复盘画像（后端原始形态） */
export interface ReviewProfile {
  userId: number;
  /** 已完成分析的手牌数 */
  handsReviewed: number;
  /** 已按出现次数从多到少排好 */
  leaks: ProfileLeakStat[];
  strengths: ProfileStrengthItem[];
  summary: string;
  summaryVersion: number;
  /** 为空表示还没生成过总结 */
  lastSummaryAt?: string;
}

/** 前端使用的画像。id 类字段转成字符串，便于直接用于路由跳转 */
export interface FrontendReviewProfile {
  handsReviewed: number;
  leaks: ProfileLeakStat[];
  strengths: { text: string; handId: string; date: string }[];
  summary: string;
  summaryVersion: number;
  lastSummaryAt?: string;
}

/** 一条历史洞察（画像页点击漏洞后钻取到的证据） */
export interface ReviewInsight {
  insightId: number;
  handId: number;
  handTitle: string;
  position: Position;
  tableSize: TableSize;
  heroCards: string;
  severity: number;
  evidence: string;
  createdAt: string;
}

/** 前端使用的历史洞察 */
export interface FrontendReviewInsight {
  insightId: string;
  handId: string;
  handTitle: string;
  position: Position;
  tableSize: TableSize;
  heroCards: string;
  severity: number;
  evidence: string;
  createdAt: string;
}

// ============================================
// 追问对话（M5）
// 对应后端: models/review_message.go
// ============================================

/** 对话角色 */
export type MessageRole = 'user' | 'assistant';

/** 前端使用的一条对话消息 */
export interface FrontendReviewMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

// ============================================
// AI 新标签待审队列（M2）
// 对应后端: models/review_tag_suggestion.go
// ============================================

/** 标签建议状态 */
export type TagSuggestionStatus = 'pending' | 'approved' | 'rejected';

/** 前端使用的标签建议 */
export interface FrontendTagSuggestion {
  id: string;
  name: string;
  /** 模型给出的理由，审批时预填进判定说明 */
  reason: string;
  status: TagSuggestionStatus;
  /** 被提议的次数。越多越说明这个漏洞反复出现 */
  hitCount: number;
  reviewRemark: string;
  reviewedAt?: string;
  tagId?: string;
  createdAt: string;
}
