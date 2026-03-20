import { request } from './request';
import type {
  DepositRequest,
  WithdrawRequest,
  TransactionListResponse,
  UserBalanceResponse,
  GetGameTransactionsParams,
} from '../models/service';

// 交易相关 API
export const transactionApi = {
  // 存分
  deposit: (data: {
    gameId: number;
    targetUserId?: number;
    amount: number;
    remark?: string;
  }) => {
    return request<void>('/transactions/deposit', {
      method: 'POST',
      data: {
        game_id: data.gameId,
        target_user_id: data.targetUserId,
        amount: data.amount,
        remark: data.remark,
      } as DepositRequest,
    });
  },

  // 取分
  withdraw: (data: {
    gameId: number;
    targetUserId?: number;
    amount: number;
    remark?: string;
  }) => {
    return request<void>('/transactions/withdraw', {
      method: 'POST',
      data: {
        game_id: data.gameId,
        target_user_id: data.targetUserId,
        amount: data.amount,
        remark: data.remark,
      } as WithdrawRequest,
    });
  },

  // 获取游戏交易记录
  getGameTransactions: (
    gameId: string,
    params?: GetGameTransactionsParams
  ) => {
    const query = new URLSearchParams();
    if (params?.user_id) query.append('user_id', params.user_id);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.page_size) query.append('page_size', params.page_size.toString());
    const queryString = query.toString();
    return request<TransactionListResponse>(`/transactions/game/${gameId}${queryString ? `?${queryString}` : ''}`);
  },

  // 获取用户余额
  getUserBalance: (gameId: string) => {
    return request<UserBalanceResponse>(`/transactions/balance/${gameId}`);
  },

  // 获取游戏参与者（含余额）
  getGameParticipants: (gameId: string) => {
    return request<UserBalanceResponse[]>(`/transactions/participants/${gameId}`);
  },
};
