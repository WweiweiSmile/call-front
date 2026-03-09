// 模拟数据
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

// 当前用户
export const currentUser: User = {
  id: 'user_001',
  name: '当前用户',
  avatar: '👤',
};

// 游戏列表
export const mockGames: Game[] = [
  {
    id: 'game_001',
    name: '周末扑克局',
    creatorId: 'user_002',
    creatorName: '张三',
    status: 'ongoing',
    participantCount: 12,
    description: '每周六晚的固定局',
  },
  {
    id: 'game_002',
    name: '麻将友谊赛',
    creatorId: 'user_001',
    creatorName: '当前用户',
    status: 'ongoing',
    participantCount: 5,
    description: '我创建的游戏',
  },
  {
    id: 'game_003',
    name: '新手练习场',
    creatorId: 'user_003',
    creatorName: '李四',
    status: 'pending',
    participantCount: 3,
    startTime: '14:00',
  },
  {
    id: 'game_004',
    name: '历史局1',
    creatorId: 'user_004',
    creatorName: '王五',
    status: 'ended',
    participantCount: 8,
  },
];

// 用户游戏余额
export const mockUserGameBalances: UserGameBalance[] = [
  {
    userId: 'user_001',
    gameId: 'game_001',
    depositTotal: 15000,
    withdrawTotal: 12000,
    currentBalance: 3000,
    isBalanced: false,
    lastTransactionTime: '2026-03-07 12:30:15',
  },
  {
    userId: 'user_001',
    gameId: 'game_002',
    depositTotal: 5000,
    withdrawTotal: 5000,
    currentBalance: 0,
    isBalanced: true,
    lastTransactionTime: '2026-03-07 10:00:00',
  },
  {
    userId: 'user_002',
    gameId: 'game_001',
    depositTotal: 20000,
    withdrawTotal: 18000,
    currentBalance: 2000,
    isBalanced: false,
    lastTransactionTime: '2026-03-07 12:25:00',
  },
  {
    userId: 'user_005',
    gameId: 'game_001',
    depositTotal: 8000,
    withdrawTotal: 8000,
    currentBalance: 0,
    isBalanced: true,
    lastTransactionTime: '2026-03-07 11:30:00',
  },
  {
    userId: 'user_006',
    gameId: 'game_001',
    depositTotal: 12000,
    withdrawTotal: 10500,
    currentBalance: 1500,
    isBalanced: false,
    lastTransactionTime: '2026-03-07 12:00:00',
  },
];

// 交易记录
export const mockTransactions: Transaction[] = [
  {
    id: 'tx_001',
    userId: 'user_001',
    userName: '当前用户',
    gameId: 'game_001',
    operatorId: 'user_001',
    operatorName: '当前用户',
    isProxy: false,
    type: 'deposit',
    amount: 5000,
    balanceAfter: 3000,
    createdAt: '2026-03-07 12:30:15',
  },
  {
    id: 'tx_002',
    userId: 'user_001',
    userName: '当前用户',
    gameId: 'game_001',
    operatorId: 'user_002',
    operatorName: '张三',
    isProxy: true,
    type: 'withdraw',
    amount: 2000,
    balanceAfter: -2000,
    remark: '创建者操作',
    createdAt: '2026-03-07 12:25:08',
  },
  {
    id: 'tx_003',
    userId: 'user_002',
    userName: '张三',
    gameId: 'game_001',
    operatorId: 'user_002',
    operatorName: '张三',
    isProxy: false,
    type: 'deposit',
    amount: 3000,
    balanceAfter: 2000,
    createdAt: '2026-03-07 12:20:00',
  },
];

// 游戏参与者
export const mockGameParticipants: Record<string, User[]> = {
  game_001: [
    { id: 'user_001', name: '当前用户', avatar: '👤' },
    { id: 'user_002', name: '张三', avatar: '👤' },
    { id: 'user_005', name: '李四', avatar: '👤' },
    { id: 'user_006', name: '王五', avatar: '👤' },
  ],
  game_002: [
    { id: 'user_001', name: '当前用户', avatar: '👤' },
    { id: 'user_007', name: '赵六', avatar: '👤' },
    { id: 'user_008', name: '钱七', avatar: '👤' },
  ],
};
