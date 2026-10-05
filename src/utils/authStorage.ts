import Taro from '@tarojs/taro';

/**
 * 登录态的本地存储。
 *
 * 单独抽出来是因为「哪些键存在哪」现在有两处要用（请求层的自动续期、
 * auth store），各写一份迟早会漏掉 refresh_token，而漏掉的后果是
 * 用户被莫名其妙登出，且很难查。
 */

// 键名沿用历史值，不要改：老用户设备上已经存着 'token' 和 'user'，
// 改了等于把所有人登出一次
const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

/**
 * 跨应用登录（SSO）的流程状态。
 *
 * 用**一个键存 JSON** 而不是两个键：两个键会出现"只写成功一个"的中间状态，
 * 而这两个值必须成对出现才有意义
 */
const SSO_FLOW_KEY = 'sso_flow';

/** 跳去认证中心之前要记下的两件事 */
export interface SSOFlow {
  /** 防 CSRF：回程时与 URL 上的 state 比对，不一致就丢弃这次登录 */
  state: string;
  /** 用户原本在哪一页，登录完送回那儿 */
  returnTo: string;
}

function read(key: string): string {
  try {
    return Taro.getStorageSync(key) || '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    Taro.setStorageSync(key, value);
  } catch (error) {
    console.error(`写本地存储 ${key} 失败:`, error);
  }
}

function remove(key: string): void {
  try {
    Taro.removeStorageSync(key);
  } catch {
    // 清不掉也无所谓，下次写入会覆盖
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY) || null;
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY) || null;
}

export function getUser<T>(): T | null {
  const raw = read(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 保存令牌对。refresh 为空时不覆盖已有的 —— 有些响应不带它 */
export function saveTokens(accessToken: string, refreshToken?: string): void {
  write(ACCESS_KEY, accessToken);
  if (refreshToken) write(REFRESH_KEY, refreshToken);
}

export function saveUser(user: unknown): void {
  write(USER_KEY, JSON.stringify(user));
}

export function saveSSOFlow(flow: SSOFlow): void {
  write(SSO_FLOW_KEY, JSON.stringify(flow));
}

/**
 * 取出并**立刻清掉** SSO 流程状态。
 *
 * 取完就清：它是一次性比对用的，留着不但没意义，还会污染下一次登录
 *（下次跳转前会重新写，但中途失败的残留会让 state 比对出现难以复现的失败）
 */
export function takeSSOFlow(): SSOFlow | null {
  const raw = read(SSO_FLOW_KEY);
  remove(SSO_FLOW_KEY);
  if (!raw) return null;
  try {
    const flow = JSON.parse(raw) as SSOFlow;
    if (!flow || typeof flow.state !== 'string') return null;
    return flow;
  } catch {
    return null;
  }
}

export function clearSSOFlow(): void {
  remove(SSO_FLOW_KEY);
}

/**
 * 清空登录态。
 *
 * 三样必须一起清：只清 access 会留下一个永远换不出新令牌的 refresh，
 * 下次启动会拿它去换、失败、再清一次，多绕一圈。
 *
 * ⚠️ **刻意不清 SSO 流程状态**（踩过这个坑）。
 * `sso_flow` 不是"当前会话"的一部分，而是**正在进行中的一次登录握手**：
 * 它由跳转前写入、由回调页读出。
 *
 * 而 clearSession 会在"refresh 也失败"时被调用 —— 那个时刻恰恰经常与
 * 一次跳转重叠：页面刚渲染，守卫在跳认证中心，同时业务请求撞上 401。
 * 这一清，回程的 state 就没了，回调页永远比对失败。
 * 表现为"登录成功回来却提示校验失败"，而根因在一个跟登录无关的请求里
 */
export function clearSession(): void {
  remove(ACCESS_KEY);
  remove(REFRESH_KEY);
  remove(USER_KEY);
}
