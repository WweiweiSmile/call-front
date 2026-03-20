import Taro from '@tarojs/taro';

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
export async function request<T>(
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

// 健康检查
export const healthCheck = () => {
  const healthUrl = (isDev || isTest) ? '/health' : `${process.env.VITE_API_BASE_URL}/health`;
  return Taro.request({
    url: healthUrl,
    method: 'GET',
  });
};

export { isDev, isTest, BASE_URL };
