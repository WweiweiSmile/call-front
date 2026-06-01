// ============================================
// API 响应数据 -> 前端类型转换器
// ============================================

import type { GameResponse } from './service/game';
import type { TransactionResponse, UserBalanceResponse } from './service/transaction';
import type { FrontendGame, FrontendTransaction, FrontendUserGameBalance, FrontendUser } from './types';

/**
 * 将 API 返回的 GameResponse 转换为前端使用的 FrontendGame
 */
export function transformGameFromApi(apiGame: GameResponse): FrontendGame {
  return {
    id: String(apiGame.id),
    name: apiGame.name,
    creatorId: String(apiGame.creatorId),
    creatorName: apiGame.creatorName || '创建者',
    status: apiGame.status as 'pending' | 'ongoing' | 'ended',
    participantCount: apiGame.playerCount,
    description: apiGame.description,
    startTime: apiGame.startTime,
    endTime: apiGame.endTime,
    isJoined: apiGame.isJoined,
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
