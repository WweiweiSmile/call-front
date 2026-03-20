// ============================================
// 向后兼容的类型定义
// 请逐步迁移至 src/models 下的新类型
// ============================================

// 从新的 models 目录导入并重新导出，保持向后兼容
import type { GameResponse as ServiceGameResponse } from '../models/service';
import type { Game as TypesGame } from '../models/types';

// 向后兼容的类型定义（保持现有代码不变）
export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Game {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  status: 'pending' | 'ongoing' | 'ended';
  participantCount: number;
  startTime?: string;
  endTime?: string;
  description?: string;
  isJoined?: boolean;
}

export interface UserGameBalance {
  userId: string;
  gameId: string;
  userName?: string;
  depositTotal: number;
  withdrawTotal: number;
  currentBalance: number;
  isBalanced: boolean;
  lastTransactionTime: string;
}

export interface Transaction {
  id: string;
  userId: string;
  userName: string;
  gameId: string;
  operatorId: string;
  operatorName: string;
  isProxy: boolean;
  type: 'deposit' | 'withdraw';
  amount: number;
  balanceAfter: number;
  remark?: string;
  createdAt: string;
}
