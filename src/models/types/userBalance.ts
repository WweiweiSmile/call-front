// ============================================
// UserBalance - 场次余额表模型
// 对应后端: models/user_balance.go
// ============================================

export type BalanceStatus = 'balanced' | 'unbalanced';

export interface UserBalance {
  id: number;
  user_id: number;
  game_id: number;
  total_deposit: number;
  total_withdraw: number;
  current_balance: number;
  last_trans_time: string | null;
  balance_status: BalanceStatus;
  created_at: string;
  updated_at: string;
}
