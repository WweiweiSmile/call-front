// ============================================
// 交易 API 接口类型
// 对应后端: dto/transaction.go
// ============================================

import type { ListResponse } from './common';

// 存分请求
export interface DepositRequest {
  game_id: number;
  target_user_id?: number;
  amount: number;
  remark?: string;
}

// 取分请求
export interface WithdrawRequest {
  game_id: number;
  target_user_id?: number;
  amount: number;
  remark?: string;
}

// 交易记录响应
export interface TransactionResponse {
  id: number;
  user_id: number;
  user_name?: string;
  game_id: number;
  operator_id: number;
  operator_name?: string;
  operator_type: string;
  trans_type: string;
  amount: number;
  balance_after: number;
  remark: string;
  created_at: string;
}

// 交易记录列表响应
export type TransactionListResponse = ListResponse<TransactionResponse>;

// 用户余额响应
export interface UserBalanceResponse {
  user_id: number;
  user_name?: string;
  game_id: number;
  total_deposit: number;
  total_withdraw: number;
  current_balance: number;
  balance_status: string;
}

// 获取游戏交易记录参数
export interface GetGameTransactionsParams {
  user_id?: string;
  page?: number;
  page_size?: number;
}
