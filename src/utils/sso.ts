import { clearSession, saveSSOFlow, takeSSOFlow } from './authStorage';
import { DEFAULT_ROUTE } from './tabs';

/**
 * 跨应用登录（SSO）的浏览器侧编排。
 *
 * 整个方案里前端只做三件事：**跳过去**、**带着票据回来换令牌**、**退出去**。
 * 判断"有没有登录态""要不要发票据"全在认证中心，前端不掺和 ——
 * 它连认证中心域的 cookie 都读不到（HttpOnly），想掺和也掺和不了。
 *
 * 设计文档：call-back/认证中心设计文档.md 的 §4.5、§6.2.1、§6.2.2、§8.4
 */

/**
 * 认证中心的地址。**必须是绝对地址**，不能走 dev server 的 /authsvc 代理 ——
 * 代理只能转发 XHR，而这里是浏览器整页跳转，跳过去必须是真的认证中心域
 *（登录页和 cookie 都在那个域下）
 */
const AUTH_ORIGIN = process.env.TARO_APP_AUTH_URL || '';

/** 本应用在认证中心注册的 client_id。必须与 sso_clients 表里的一致 */
export const CLIENT_ID = 'call-front';

/**
 * 回调页路径。
 *
 * ⚠️ 三个地方必须是同一个字符串：这里、`app.config.ts` 的页面注册、
 * 以及认证中心 `sso_clients` 表里登记的 redirect_uri 路径部分。
 * Taro 的页面路径带 `/index`（和其它页面一致），后面拼 query 就成了
 * `#/pages/auth/callback/index?ticket=..`。**对不上会被精确匹配直接拒掉**
 */
export const CALLBACK_ROUTE = '/pages/auth/callback/index';

/**
 * 已经在跳转途中（去 `/sso` 或去 `/logout`）。
 *
 * 两个作用：一是防重复跳转（effect 可能跑多次，跳多次会刷历史）；
 * 二是**让登出和 SSO 互斥** —— 这两者会互相覆盖，见 globalLogout 里的说明
 */
let navigating = false;

/**
 * 生成 state。
 *
 * 用 `crypto.getRandomValues` 而不是 `crypto.randomUUID()` —— 后者在
 * **非安全上下文（http 页面）下根本不存在**，本机 dev 会直接抛错。
 * `getRandomValues` 没有这个限制
 */
function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 当前页面路径，用来在登录后把用户送回来 */
function currentRoute(): string {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) return hash;
      const { pathname, search } = window.location;
      if (pathname && pathname !== '/') return `${pathname}${search}`;
    }
  } catch {
    // 取不到就回默认页，不该因为一个页面路径把登录流程搞挂
  }
  return DEFAULT_ROUTE;
}

/** 回调页自己不该成为"回来之后去哪"的目标，否则会绕圈 */
function sanitizeReturnTo(route: string): string {
  if (!route || route.startsWith(CALLBACK_ROUTE)) return DEFAULT_ROUTE;
  return route;
}

/**
 * 未登录时跳认证中心做 SSO。
 *
 * 用 `replace` 而不是 `assign`：这些中间态（认证中心、登录页、回调页）
 * 都不该进浏览历史 —— 否则用户点一次后退就回到 `/sso`，被再弹一遍登录页
 */
export function startSSO(returnTo?: string): void {
  if (navigating) return;
  if (typeof window === 'undefined' || !AUTH_ORIGIN) return;
  navigating = true;

  const state = randomState();
  saveSSOFlow({ state, returnTo: sanitizeReturnTo(returnTo || currentRoute()) });

  const url = `${AUTH_ORIGIN}/sso?client_id=${encodeURIComponent(CLIENT_ID)}&state=${encodeURIComponent(state)}`;
  window.location.replace(url);
}

/**
 * 读回调地址上的 ticket 和 state。
 *
 * **直接读 location，不用 Taro 的 router.params**：Taro H5 默认是 hash 模式，
 * 参数落在 fragment 里（`#/pages/auth/callback/index?ticket=..`），
 * 它的 params 对这种形态的解析没有验证过；而这一步必须稳，
 * 读错了就是"登录成功但前端说没拿到 ticket"
 */
export function readCallbackParams(): { ticket: string; state: string } {
  if (typeof window === 'undefined') return { ticket: '', state: '' };

  const sources: string[] = [];
  // 非 hash 模式（或以后改了路由模式）参数在 search 里
  if (window.location.search) sources.push(window.location.search);
  // hash 模式：参数在 fragment 的 query 段
  const hash = window.location.hash;
  const queryStart = hash.indexOf('?');
  if (queryStart >= 0) sources.push(hash.slice(queryStart));

  for (const source of sources) {
    const params = new URLSearchParams(source);
    const ticket = params.get('ticket') || '';
    if (ticket) {
      return { ticket, state: params.get('state') || '' };
    }
  }
  return { ticket: '', state: '' };
}

/**
 * 比对 state 并取回"回到哪一页"。
 *
 * **不比对 state 就等于不设防**：攻击者可以构造一个带自己 ticket 的回调链接
 * 骗用户点，把用户登成攻击者的账号，之后用户在这个应用里干的一切都记在
 * 攻击者名下。取完即清，同一个 state 不能用第二次
 */
export function verifyState(state: string): string {
  const flow = takeSSOFlow();
  if (!flow || !state || flow.state !== state) {
    throw new Error('登录校验失败（state 不匹配），请重新登录');
  }
  return sanitizeReturnTo(flow.returnTo);
}

/**
 * 清掉地址栏上的 ticket / state。
 *
 * 不清的话它会被复制、被收藏、留在浏览历史里。这一步用 replaceState，
 * 所以不会多出一条历史记录
 */
export function cleanCallbackUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  window.history.replaceState(null, '', `#${CALLBACK_ROUTE}`);
}

/**
 * 全局退出。
 *
 * **必须跳认证中心，不能只清本地**：清掉本地 storage 之后路由守卫会判定
 * "没登录"并再跳一次 `/sso`，而认证中心域下的会话 cookie 前端删不掉 ——
 * 于是立刻又被静默登回去，登出按钮等于没用（见设计文档 §6.2.2）。
 * 只有认证中心自己能把那个 cookie 删掉。
 *
 * `next` 用本应用的 origin：认证中心只接受登记过的 origin，
 * 带路径会被拒（那是它防开放重定向的一部分）
 */
export function globalLogout(): void {
  // ⚠️ **先立旗，再清本地**。
  //
  // 清掉本地令牌之后，路由守卫会立刻判定"未登录"并开始一次 `startSSO()`
  //（store 里的 logout 会同时把状态置成未登录，触发重渲染）。
  // 那次跳转会**覆盖掉这里的 /logout** —— 服务端日志里能清楚看到
  // `/logout` 与下一个 `/sso` 前后脚到达、而且 /sso 照样发出了票据。
  // 结果就是"点了登出，人却被静默登回去"。
  //
  // 实测踩到过，所以这面旗必须在 clearSession 之前立起来
  navigating = true;

  clearSession();

  if (typeof window === 'undefined' || !AUTH_ORIGIN) return;
  const next = encodeURIComponent(window.location.origin);
  window.location.replace(`${AUTH_ORIGIN}/logout?next=${next}`);
}
