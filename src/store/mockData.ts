// 数据类型定义
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
