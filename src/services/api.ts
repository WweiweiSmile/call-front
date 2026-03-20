import Taro from '@tarojs/taro';
import type {
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  UserInfo,
  CreateGameRequest,
  GameListResponse,
  GameResponse,
  JoinGameRequest,
  DepositRequest,
  WithdrawRequest,
  TransactionListResponse,
  UserBalanceResponse,
  GetGamesParams,
  GetMyGamesParams,
  GetGameTransactionsParams,
} from '../models/service';

// 根据环境判断是否使用代理
const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// 后端 API 基础地址
// 开发/测试环境使用代理（相对路径），生产环境使用完整地址
const BASE_URL = (isDev || isTest) ? '/api/v1' : `${process.env.TARO_APP_BASE_URL}/api/v1`;

// 从本地存储获取 token
const getToken = (): string | null => {
  try {
    return Taro.getStorageSync('token');
  } catch {
    return null;
  }
};

// 通用请求方法
async function request<T>(
  url: string,
  options: Taro.request.Option = {},
  requireAuth: boolean = true
): Promise<T> {
  const { method = 'GET', data, ...restOptions } = options;

  const headers: any = {
    'Content-Type': 'application/json',
    ...restOptions.header,
  };

  // 如果需要认证，添加 Authorization header
  if (requireAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await Taro.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: headers,
      ...restOptions,
    });

    const res = response.data as ApiResponse<T>;

    if (res.code === 0) {
      return res.data as T;
    } else {
      throw new Error(res.message || '请求失败');
    }
  } catch (error) {
    console.error('API 请求失败:', error);
    throw error;
  }
}

// 认证相关 API
export const authApi = {
  // 注册
  register: (data: RegisterRequest) => {
    return request<LoginResponse>('/auth/register', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 登录
  login: (data: LoginRequest) => {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 获取当前用户信息
  getUserInfo: () => {
    return request<UserInfo>('/auth/user');
  },
};

// 游戏相关 API
export const gameApi = {
  // 创建游戏
  createGame: (data: CreateGameRequest) => {
    return request<GameResponse>('/games', {
      method: 'POST',
      data,
    });
  },

  // 获取游戏列表
  getGames: (params?: GetGamesParams) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我的游戏
  getMyGames: (params?: GetMyGamesParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games/my${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我创建的游戏
  getCreatedGames: (params?: GetMyGamesParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games/created${queryString ? `?${queryString}` : ''}`);
  },

  // 获取游戏详情
  getGame: (id: string) => {
    return request<GameResponse>(`/games/${id}`);
  },

  // 加入游戏
  joinGame: (gameId: number) => {
    return request<void>('/games/join', {
      method: 'POST',
      data: { game_id: gameId } as JoinGameRequest,
    });
  },

  // 退出游戏
  leaveGame: (id: string) => {
    return request<void>(`/games/${id}/leave`, {
      method: 'POST',
    });
  },

  // 结束游戏
  endGame: (id: string) => {
    return request<void>(`/games/${id}/end`, {
      method: 'POST',
    });
  },
};

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

// 健康检查
export const healthCheck = () => {
  const healthUrl = (isDev || isTest) ? '/health' : `${process.env.VITE_API_BASE_URL}/health`;
  return Taro.request({
    url: healthUrl,
    method: 'GET',
  });
};
