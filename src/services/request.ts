import Taro from '@tarojs/taro';
import { startSSO } from '../utils/sso';
import { clearSession, getAccessToken, getRefreshToken, saveTokens } from '../utils/authStorage';

// 根据环境判断是否使用代理
const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// 业务后端（call-back）。开发/测试走 dev server 代理，生产用完整地址
const BASE_URL = (isDev || isTest) ? '/api/v1' : `${process.env.TARO_APP_BASE_URL}/api/v1`;

/**
 * 认证中心（call-auth）。它是**独立服务**，不再由 call-back 提供登录接口。
 *
 * 之所以单独一个基地址：调用方现在要打两个后端 —— 登录续期走认证中心，
 * 业务走 call-back。混成一个常量会让登录请求打到没有 /auth/login 的 call-back 上
 */
const AUTH_BASE_URL = (isDev || isTest) ? '/authsvc/api/v1' : `${process.env.TARO_APP_AUTH_URL}/api/v1`;

export type RequestOptions = Omit<Taro.request.Option, 'url'>;

/** 带状态码的错误，让调用方能按 401 之类的状态做判断，而不是去匹配文案 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope {
  code?: number;
  message?: string;
  /** 后端给程序看的错误标识，如 token_reuse_detected */
  error?: string;
  data?: unknown;
}

async function call<T>(
  url: string,
  options: RequestOptions,
  withCredentials: boolean,
): Promise<T> {
  const { method = 'GET', data, ...rest } = options;

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.header as Record<string, string> | undefined),
  };
  if (withCredentials) {
    const token = getAccessToken();
    if (token) header.Authorization = `Bearer ${token}`;
  }

  const response = await Taro.request({
    ...rest,
    url,
    method,
    data,
    header,
  });

  const body = response.data as Envelope | undefined;
  const ok = response.statusCode >= 200 && response.statusCode < 300;

  if (ok) {
    // 业务后端用 {code:0, data} 信封；认证中心也是同一个形状，
    // 所以这里可以共用一套解包逻辑
    if (body && typeof body.code === 'number') {
      if (body.code === 0) return body.data as T;
      throw new ApiError(body.message || '请求失败', body.code, body.error);
    }
    // 少数接口直接返回裸 JSON（比如健康检查）
    return response.data as T;
  }

  throw new ApiError(
    body?.message || `请求失败（${response.statusCode}）`,
    response.statusCode,
    body?.error,
  );
}

/** 打认证中心。不带凭证 —— 换票、续期这类接口本来就是在还没有令牌时调的 */
export async function requestAuth<T>(url: string, options: RequestOptions = {}): Promise<T> {
  return call<T>(`${AUTH_BASE_URL}${url}`, options, false);
}

/**
 * 打认证中心、但**需要带登录态**的接口。
 *
 * 目前只有 `GET /auth/me`。它必须带 Bearer，也必须在 401 时走和业务接口
 * 同一套「续期 → 重放 → 跳 SSO」逻辑。别和 `requestAuth` 混：
 * 那个是给"还没有令牌"的接口用的
 */
export function requestAuthAuthed<T>(url: string, options: RequestOptions = {}): Promise<T> {
  return requestWithAuth<T>(`${AUTH_BASE_URL}${url}`, options);
}

/**
 * 续期。**必须串行化**：并发请求同时收到 401 时只能触发一次 refresh。
 *
 * 不串行化的话，第二个请求会拿着已经被轮换掉的 refresh token 去换 ——
 * 认证中心会把它判定为「重放」（它无法区分这是客户端并发还是 token 被盗），
 * 从而吊销该用户全部登录态，用户直接被踢下线
 */
let refreshing: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) throw new Error('本地没有 refresh token');

        const data = await requestAuth<{ access_token: string; refresh_token: string }>(
          '/auth/refresh',
          { method: 'POST', data: { refresh_token: refreshToken } },
        );
        saveTokens(data.access_token, data.refresh_token);
        return data.access_token;
      } finally {
        // 放在 finally 里：失败也要放开，否则一次失败会把这个 promise
        // 永久钉死，之后再也续不了期
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/**
 * 带登录态的请求：401 自动续期并重放一次，仍然失败就清本地 + 跳 SSO。
 *
 * 业务接口（call-back）和**需要登录态的认证中心接口**（`/auth/me`）共用它 ——
 * 两者的 401 处理必须一致。只给其中一边加，会出现"业务请求能自动续期、
 * /auth/me 不能"这种一半能用一半不能用的状态，而那种不一致最难查
 */
async function requestWithAuth<T>(fullUrl: string, options: RequestOptions): Promise<T> {
  try {
    return await call<T>(fullUrl, options, true);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // access token 只有 15 分钟，撞上过期是常态，不是异常。
      // 先静默续期再重放一次；**只重放一次**，续期也失败就说明真登不上了，
      // 再循环只会打转
      const fresh = await refreshAccessToken().catch(() => null);
      if (fresh) {
        return call<T>(fullUrl, options, true);
      }
      // 真登不上了：清本地，然后跳认证中心做 SSO。
      // 认证中心那边有会话的话会静默发一张新票，用户无感；没有就去登录页
      clearSession();
      startSSO();
      throw new ApiError('登录已过期，请重新登录', 401, 'token_invalid');
    }
    throw error;
  }
}

// 通用请求方法（打业务后端 call-back）
export async function request<T>(
  url: string,
  options: RequestOptions = {},
  requireAuth: boolean = true,
): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`;
  return requireAuth ? requestWithAuth<T>(fullUrl, options) : call<T>(fullUrl, options, false);
}

// 健康检查
export const healthCheck = () => {
  const healthUrl = (isDev || isTest) ? '/health' : `${process.env.VITE_API_BASE_URL}/health`;
  return Taro.request({ url: healthUrl, method: 'GET' });
};

export { isDev, isTest, BASE_URL, AUTH_BASE_URL };
