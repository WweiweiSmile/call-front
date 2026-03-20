// ============================================
// 交易 API 接口类型
// 对应后端: dto/transaction.go
// ============================================

import type { ListResponse } from './common';

// 存分请求
export interface DepositRequest {
  gameId: number;
  targetUserId?: number;
  amount: number;
  remark?: string;
}

// 取分请求
export interface WithdrawRequest {
  gameId: number;
  targetUserId?: number;
  amount: number;
  remark?: string;
}

// 交易记录响应
export interface TransactionResponse {
  id: number;
  userId: number;
  userName?: string;
  gameId: number;
  operatorId: number;
  operatorName?: string;
  operatorType: string;
  transType: string;
  amount: number;
  balanceAfter: number;
  remark: string;
  createdAt: string;
}

// 交易记录列表响应
export type TransactionListResponse = ListResponse<TransactionResponse>;

// 用户余额响应
export interface UserBalanceResponse {
  userId: number;
  userName?: string;
  gameId: number;
  totalDeposit: number;
  totalWithdraw: number;
  currentBalance: number;
  balanceStatus: string;
}

// 获取游戏交易记录参数
export interface GetGameTransactionsParams {
  user_id?: string;
  page?: number;
  page_size?: number;
}
