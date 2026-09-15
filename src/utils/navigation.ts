// ============================================
// 导航相关的公共逻辑
// ============================================

import Taro from '@tarojs/taro';
import { DEFAULT_ROUTE } from './tabs';

/**
 * 分享链接上的来源标识。
 *
 * 为什么需要它：从分享链接直接打开时，页面栈里只有这一页，「返回」没有可退的地方。
 * 更糟的是经过登录跳转之后，栈里可能是 [登录页, 详情页] —— 这时 navigateBack 会退到登录页，
 * 用户看到的是"点了返回却被踢回登录"。所以分享出去的链接统一带上这个参数，
 * 返回时据此判断：是分享进来的就直接回主页面。
 */
export const SHARE_ENTRY_PARAM = 'from';
export const SHARE_ENTRY_VALUE = 'share';

/** 给分享链接加上来源标识。已经有 query 时用 & 追加，没有则用 ? */
export function markShareLink(url: string): string {
  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${separator}${SHARE_ENTRY_PARAM}=${SHARE_ENTRY_VALUE}`;
}

/** 当前页面是不是从分享链接直接打开的 */
export function isShareEntry(): boolean {
  // 小程序端没有 window，只能靠 Taro 的路由信息
  try {
    const params = Taro.getCurrentInstance()?.router?.params as
      | Record<string, string>
      | undefined;
    if (params?.[SHARE_ENTRY_PARAM] === SHARE_ENTRY_VALUE) {
      return true;
    }
  } catch {
    // 拿不到路由信息就继续往下试 hash
  }

  return hashHasShareFlag();
}

/**
 * H5 兜底：直接从 hash 里解析查询参数。
 *
 * 不依赖 Taro 的 router —— 它不一定在所有场景下都带上查询参数，
 * 而这里判断错了的后果是"返回"按钮把用户送到错误的页面，宁可多解析一次。
 */
function hashHasShareFlag(): boolean {
  try {
    if (typeof window === 'undefined' || !window.location) return false;

    const hash = window.location.hash || '';
    const queryStart = hash.indexOf('?');
    if (queryStart < 0) return false;

    const query = new URLSearchParams(hash.slice(queryStart + 1));
    return query.get(SHARE_ENTRY_PARAM) === SHARE_ENTRY_VALUE;
  } catch {
    return false;
  }
}

/**
 * 返回上一页的统一实现。
 *
 * 三种情况：
 * 1. 从分享链接进来的 —— 直接回主页面。页面栈里本来就没有上一页，
 *    而且用户是从外部点进来的，送他进 App 主页面比退到一个莫名其妙的页面符合预期
 * 2. 有上一页 —— 正常 navigateBack，保留来源 Tab（从「已参与」进来就回「已参与」）
 * 3. 没有上一页（深链接、页面栈被清空）—— 兜底回主页面，
 *    否则 Taro.navigateBack() 会失败且什么都不发生，表现就是"点了没反应"
 */
export function goBackOrHome(): void {
  if (isShareEntry()) {
    Taro.redirectTo({ url: DEFAULT_ROUTE });
    return;
  }

  let canGoBack = false;
  try {
    canGoBack = Taro.getCurrentPages().length > 1;
  } catch {
    canGoBack = false;
  }

  if (!canGoBack) {
    Taro.redirectTo({ url: DEFAULT_ROUTE });
    return;
  }

  Taro.navigateBack().catch(() => {
    // 页面栈被清空等异常情况兜底，否则用户会卡在原地
    Taro.redirectTo({ url: DEFAULT_ROUTE });
  });
}
