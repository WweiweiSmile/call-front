// ============================================
// 前端状态管理使用的类型
// ============================================

// 前端使用的用户类型（ID 为 string）
export interface FrontendUser {
  id: string;
  name: string;
  avatar?: string;
}

// 前端使用的游戏类型（ID 为 string）
export interface FrontendGame {
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

// 前端使用的用户余额类型（ID 为 string）
export interface FrontendUserGameBalance {
  userId: string;
  gameId: string;
  userName?: string;
  depositTotal: number;
  withdrawTotal: number;
  currentBalance: number;
  isBalanced: boolean;
  lastTransactionTime: string;
}

// 前端使用的交易记录类型（ID 为 string）
export interface FrontendTransaction {
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
