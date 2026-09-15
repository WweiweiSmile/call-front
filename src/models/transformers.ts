// ============================================
// API 响应数据 -> 前端类型转换器
// ============================================

import { DEFAULT_TABLE_SIZE } from './types/review';
import type { GameResponse } from './service/game';
import type { TransactionResponse, UserBalanceResponse } from './service/transaction';
import type { ScoreRequestResponse } from './service/scoreRequest';
import type { MessageResponse } from './service/message';
import type {
  AIStatusResponse,
  ReviewAnalysisResponse,
  ReviewHandResponse,
  ReviewLeakTagResponse,
  ReviewMessageResponse,
  ReviewProfileResponse,
} from './service/review';
import type {
  FrontendAIStatus,
  FrontendAnalysis,
  FrontendGame,
  FrontendTransaction,
  FrontendUserGameBalance,
  FrontendUser,
  FrontendScoreRequest,
  FrontendMessage,
  FrontendReviewHand,
  FrontendReviewInsight,
  FrontendReviewMessage,
  FrontendReviewProfile,
  ReviewInsight,
  ReviewLeakTag,
} from './types';

/**
 * 将 API 返回的 GameResponse 转换为前端使用的 FrontendGame
 */
export function transformGameFromApi(apiGame: GameResponse): FrontendGame {
  return {
    id: String(apiGame.id),
    name: apiGame.name,
    creatorId: String(apiGame.creatorId),
    creatorName: apiGame.creatorName || '创建者',
    status: apiGame.status as 'ongoing' | 'ended',
    participantCount: apiGame.playerCount,
    description: apiGame.description,
    createdAt: apiGame.createdAt,
    endTime: apiGame.endTime,
    isJoined: apiGame.isJoined,
    userTotalDeposit: apiGame.userTotalDeposit,
    userTotalWithdraw: apiGame.userTotalWithdraw,
    userNetScore: apiGame.userNetScore,
  };
}

/**
 * 批量转换游戏列表
 */
export function transformGameListFromApi(apiGames: GameResponse[]): FrontendGame[] {
  return apiGames.map(transformGameFromApi);
}

/**
 * 将 API 返回的 TransactionResponse 转换为前端使用的 FrontendTransaction
 */
export function transformTransactionFromApi(apiTx: TransactionResponse): FrontendTransaction {
  return {
    id: String(apiTx.id),
    userId: String(apiTx.userId),
    userName: apiTx.userName || '用户',
    gameId: String(apiTx.gameId),
    operatorId: String(apiTx.operatorId),
    operatorName: apiTx.operatorName || '操作人',
    isProxy: apiTx.operatorType === 'proxy',
    type: apiTx.transType as 'deposit' | 'withdraw',
    amount: apiTx.amount,
    balanceAfter: apiTx.balanceAfter,
    remark: apiTx.remark,
    createdAt: apiTx.createdAt,
  };
}

/**
 * 批量转换交易记录列表
 */
export function transformTransactionListFromApi(apiTxs: TransactionResponse[]): FrontendTransaction[] {
  return apiTxs.map(transformTransactionFromApi);
}

/**
 * 将 API 返回的 UserBalanceResponse 转换为前端使用的 FrontendUserGameBalance
 */
export function transformUserGameBalanceFromApi(apiBalance: UserBalanceResponse): FrontendUserGameBalance {
  return {
    userId: String(apiBalance.userId),
    gameId: String(apiBalance.gameId),
    userName: apiBalance.userName,
    depositTotal: apiBalance.totalDeposit,
    withdrawTotal: apiBalance.totalWithdraw,
    currentBalance: apiBalance.currentBalance,
    isBalanced: apiBalance.balanceStatus === 'balanced',
    lastTransactionTime: new Date().toISOString(),
  };
}

/**
 * 批量转换用户余额列表（参与者列表）
 */
export function transformUserGameBalanceListFromApi(apiBalances: UserBalanceResponse[]): FrontendUserGameBalance[] {
  return apiBalances.map(transformUserGameBalanceFromApi);
}

/**
 * 从参与者余额数据提取 FrontendUser 列表
 */
export function transformParticipantsFromBalances(apiBalances: UserBalanceResponse[]): FrontendUser[] {
  return apiBalances.map((p) => ({
    id: String(p.userId),
    name: p.userName || '未知用户',
    avatar: '👤',
  }));
}

/**
 * 将 API 返回的 ScoreRequestResponse 转换为前端使用的 FrontendScoreRequest
 */
export function transformScoreRequestFromApi(apiRequest: ScoreRequestResponse): FrontendScoreRequest {
  return {
    id: String(apiRequest.id),
    gameId: String(apiRequest.gameId),
    gameName: apiRequest.gameName || '未知场次',
    userId: String(apiRequest.userId),
    userName: apiRequest.userName || '用户',
    type: apiRequest.type,
    amount: apiRequest.amount,
    remark: apiRequest.remark,
    status: apiRequest.status,
    reviewerId: apiRequest.reviewerId != null ? String(apiRequest.reviewerId) : undefined,
    reviewerName: apiRequest.reviewerName,
    reviewRemark: apiRequest.reviewRemark,
    reviewedAt: apiRequest.reviewedAt,
    createdAt: apiRequest.createdAt,
  };
}

/**
 * 批量转换申请单列表
 */
export function transformScoreRequestListFromApi(apiRequests: ScoreRequestResponse[]): FrontendScoreRequest[] {
  return apiRequests.map(transformScoreRequestFromApi);
}

/**
 * 将 API 返回的 MessageResponse 转换为前端使用的 FrontendMessage
 */
export function transformMessageFromApi(apiMessage: MessageResponse): FrontendMessage {
  return {
    id: String(apiMessage.id),
    type: apiMessage.type,
    title: apiMessage.title,
    content: apiMessage.content,
    gameId: apiMessage.gameId != null ? String(apiMessage.gameId) : undefined,
    requestId: apiMessage.requestId != null ? String(apiMessage.requestId) : undefined,
    isRead: apiMessage.isRead,
    createdAt: apiMessage.createdAt,
  };
}

/**
 * 批量转换消息列表
 */
export function transformMessageListFromApi(apiMessages: MessageResponse[]): FrontendMessage[] {
  return apiMessages.map(transformMessageFromApi);
}

/**
 * 将 API 返回的 ReviewHandResponse 转换为前端使用的 FrontendReviewHand
 */
export function transformReviewHandFromApi(apiHand: ReviewHandResponse): FrontendReviewHand {
  return {
    id: String(apiHand.id),
    gameId: apiHand.gameId != null ? String(apiHand.gameId) : undefined,
    gameName: apiHand.gameName,
    title: apiHand.title,
    // 老数据可能没有人数（迁移前落库的行），兜底成满员桌，与后端归一化口径一致
    tableSize: apiHand.tableSize || DEFAULT_TABLE_SIZE,
    heroPosition: apiHand.heroPosition,
    heroCards: apiHand.heroCards,
    heroStackBb: apiHand.heroStackBb,
    stakes: apiHand.stakes,
    board: apiHand.board,
    villainCount: apiHand.villainCount,
    // 后端保证返回数组，这里再兜一层：老数据可能是 null
    villains: apiHand.villains || [],
    potType: apiHand.potType,
    streets: apiHand.streets || [],
    heroThought: apiHand.heroThought,
    result: apiHand.result,
    resultAmount: apiHand.resultAmount,
    heroTags: apiHand.heroTags || [],
    analyzeStatus: apiHand.analyzeStatus,
    createdAt: apiHand.createdAt,
    updatedAt: apiHand.updatedAt,
  };
}

/**
 * 批量转换复盘手牌列表
 */
export function transformReviewHandListFromApi(apiHands: ReviewHandResponse[]): FrontendReviewHand[] {
  return apiHands.map(transformReviewHandFromApi);
}

/**
 * 将 API 返回的标签字典转换为前端类型。
 * 字段结构一致，这里主要做一层显式声明，后端加字段时不至于静默漏掉。
 */
export function transformLeakTagFromApi(apiTag: ReviewLeakTagResponse): ReviewLeakTag {
  return {
    code: apiTag.code,
    name: apiTag.name,
    category: apiTag.category,
    description: apiTag.description,
    sortOrder: apiTag.sortOrder,
  };
}

/**
 * 批量转换标签字典
 */
export function transformLeakTagListFromApi(apiTags: ReviewLeakTagResponse[]): ReviewLeakTag[] {
  return apiTags.map(transformLeakTagFromApi);
}

/**
 * 将 API 返回的分析记录转换为前端使用的 FrontendAnalysis
 */
export function transformAnalysisFromApi(api: ReviewAnalysisResponse): FrontendAnalysis {
  return {
    id: String(api.id),
    handId: String(api.handId),
    status: api.status,
    model: api.model,
    promptVersion: api.promptVersion,
    // 失败的记录没有 result，这里保持 undefined，由 UI 决定展示错误还是空态
    result: api.result,
    tokensIn: api.tokensIn,
    tokensOut: api.tokensOut,
    durationMs: api.durationMs,
    errorMsg: api.errorMsg,
    stale: api.stale,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

/**
 * 批量转换分析列表
 */
export function transformAnalysisListFromApi(apiList: ReviewAnalysisResponse[]): FrontendAnalysis[] {
  return (apiList || []).map(transformAnalysisFromApi);
}

/**
 * 转换 AI 可用状态。字段一一对应，这里主要做一层显式声明
 */
export function transformAIStatusFromApi(api: AIStatusResponse): FrontendAIStatus {
  return {
    enabled: api.enabled,
    dailyLimit: api.dailyLimit,
    usedToday: api.usedToday,
    remaining: api.remaining,
  };
}

/**
 * 将用户画像响应转成前端形态。
 * 只把 strengths 里的 handId 转成字符串（要用于路由跳转），其余字段一一对应
 */
export function transformReviewProfileFromApi(
  api: ReviewProfileResponse
): FrontendReviewProfile {
  return {
    handsReviewed: api.handsReviewed,
    leaks: api.leaks || [],
    strengths: (api.strengths || []).map((s) => ({
      text: s.text,
      handId: String(s.handId),
      date: s.date,
    })),
    summary: api.summary,
    summaryVersion: api.summaryVersion,
    lastSummaryAt: api.lastSummaryAt,
  };
}

/**
 * 转换单条追问对话消息
 */
export function transformReviewMessageFromApi(
  api: ReviewMessageResponse
): FrontendReviewMessage {
  return {
    id: String(api.id),
    role: api.role,
    content: api.content,
    createdAt: api.createdAt,
  };
}

/**
 * 批量转换对话历史，顺序保持后端给的（按时间升序）
 */
export function transformReviewMessageListFromApi(
  apiList: ReviewMessageResponse[]
): FrontendReviewMessage[] {
  return (apiList || []).map(transformReviewMessageFromApi);
}

/**
 * 批量转换历史洞察（画像页钻取到的证据）
 */
export function transformReviewInsightListFromApi(
  apiList: ReviewInsight[]
): FrontendReviewInsight[] {
  return (apiList || []).map((item) => ({
    insightId: String(item.insightId),
    handId: String(item.handId),
    handTitle: item.handTitle,
    position: item.position,
    tableSize: item.tableSize,
    heroCards: item.heroCards,
    severity: item.severity,
    evidence: item.evidence,
    createdAt: item.createdAt,
  }));
}
