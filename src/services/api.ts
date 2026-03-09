import Taro from '@tarojs/taro';

// 根据环境判断是否使用代理
const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// 后端 API 基础地址
// 开发/测试环境使用代理（相对路径），生产环境使用完整地址
const BASE_URL = (isDev || isTest) ? '/api/v1' : `${process.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/v1`;

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

    const res = response.data as any;

    if (res.code === 0) {
      return res.data;
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
  register: (data: {
    username: string;
    password: string;
    nickname?: string;
  }) => {
    return request('/auth/register', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 登录
  login: (data: {
    username: string;
    password: string;
  }) => {
    return request('/auth/login', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 获取当前用户信息
  getUserInfo: () => {
    return request('/auth/user');
  },
};

// 游戏相关 API
export const gameApi = {
  // 创建游戏
  createGame: (data: {
    name: string;
    description?: string;
    startTime?: string;
    endTime?: string;
  }) => {
    return request('/games', {
      method: 'POST',
      data,
    });
  },

  // 获取游戏列表
  getGames: (params?: { status?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request(`/games${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我的游戏
  getMyGames: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request(`/games/my${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我创建的游戏
  getCreatedGames: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request(`/games/created${queryString ? `?${queryString}` : ''}`);
  },

  // 获取游戏详情
  getGame: (id: string) => {
    return request(`/games/${id}`);
  },

  // 加入游戏
  joinGame: (gameId: number) => {
    return request('/games/join', {
      method: 'POST',
      data: { game_id: gameId },
    });
  },

  // 退出游戏
  leaveGame: (id: string) => {
    return request(`/games/${id}/leave`, {
      method: 'POST',
    });
  },

  // 结束游戏
  endGame: (id: string) => {
    return request(`/games/${id}/end`, {
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
    return request('/transactions/deposit', {
      method: 'POST',
      data: {
        game_id: data.gameId,
        target_user_id: data.targetUserId,
        amount: data.amount,
        remark: data.remark,
      },
    });
  },

  // 取分
  withdraw: (data: {
    gameId: number;
    targetUserId?: number;
    amount: number;
    remark?: string;
  }) => {
    return request('/transactions/withdraw', {
      method: 'POST',
      data: {
        game_id: data.gameId,
        target_user_id: data.targetUserId,
        amount: data.amount,
        remark: data.remark,
      },
    });
  },

  // 获取游戏交易记录
  getGameTransactions: (
    gameId: string,
    params?: { userId?: string; page?: number; pageSize?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.userId) query.append('user_id', params.userId);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());
    const queryString = query.toString();
    return request(`/transactions/game/${gameId}${queryString ? `?${queryString}` : ''}`);
  },

  // 获取用户余额
  getUserBalance: (gameId: string) => {
    return request(`/transactions/balance/${gameId}`);
  },

  // 获取游戏参与者（含余额）
  getGameParticipants: (gameId: string) => {
    return request(`/transactions/participants/${gameId}`);
  },
};

// 健康检查
export const healthCheck = () => {
  const healthUrl = (isDev || isTest) ? '/health' : `${process.env.VITE_API_BASE_URL || 'http://localhost:8080'}/health`;
  return Taro.request({
    url: healthUrl,
    method: 'GET',
  });
};
