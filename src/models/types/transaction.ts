// ============================================
// Transaction - 存取分记录表模型
// 对应后端: models/transaction.go
// ============================================

export type OperatorType = 'self' | 'proxy';
export type TransType = 'deposit' | 'withdraw';

export interface Transaction {
  id: number;
  user_id: number;
  game_id: number;
  operator_id: number;
  operator_type: OperatorType;
  trans_type: TransType;
  amount: number;
  balance_after: number;
  remark: string;
  created_at: string;
  updated_at: string;
}
