import Taro from '@tarojs/taro';
import { redirectToLogin } from '../utils/redirectUri';

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

    // 检查是否是401未授权
    if (res.code === 401 || response.statusCode === 401) {
      // 清除本地存储的登录信息
      try {
        Taro.removeStorageSync('token');
        Taro.removeStorageSync('user');
      } catch (e) {
        console.error('清除登录信息失败:', e);
      }
      // 跳转到登录页面
      redirectToLogin();
      throw new Error('登录已过期，请重新登录');
    }

    if (res.code === 0) {
      return res.data;
    } else {
      throw new Error(res.message || '请求失败');
    }
  } catch (error: any) {
    console.error('API 请求失败:', error);

    // 检查是否是网络请求错误且状态码为401
    if (error.statusCode === 401) {
      // 清除本地存储的登录信息
      try {
        Taro.removeStorageSync('token');
        Taro.removeStorageSync('user');
      } catch (e) {
        console.error('清除登录信息失败:', e);
      }
      // 跳转到登录页面
      redirectToLogin();
      throw new Error('登录已过期，请重新登录');
    }

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
