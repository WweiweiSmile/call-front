import { create } from 'zustand';
import { authApi } from '../services/authApi';
import {
  getAccessToken,
  getUser,
  saveTokens,
  saveUser,
} from '../utils/authStorage';
import { globalLogout } from '../utils/sso';
import type { LoginResponse } from '../models/service';

// 用户信息类型
export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  /** 前端据此显示管理员入口；权限判定在后端 */
  role: 'user' | 'admin';
}

// 认证状态
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Auth Store Actions
interface AuthActions {
  /** 拿到登录态后落地：存 storage + 更新 store */
  applySession: (response: LoginResponse) => void;
  /** 全局退出：清本地 + 跳认证中心把会话也废掉 */
  logout: () => void;
  /** 用服务端的 user 覆盖本地缓存。启动时跑一次 */
  syncUser: () => Promise<void>;
  getCurrentUser: () => User | null;
  getToken: () => string | null;
}

/** 把认证中心返回的 user 转成前端模型 */
function toUser(info: LoginResponse['user']): User {
  return {
    id: String(info.id),
    username: info.username,
    nickname: info.nickname,
    avatar: info.avatar,
    // 不认识的 role 一律退化成普通用户，绝不误开管理员入口
    role: info.role === 'admin' ? 'admin' : 'user',
  };
}

type AuthStore = AuthState & AuthActions;

// 创建 Zustand Store
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: getUser<User>(),
  token: getAccessToken(),
  isAuthenticated: !!getAccessToken(),
  isLoading: false,

  /**
   * 落地一个登录态。**登录和注册都走它** ——
   * 一次表单登录（认证中心种 cookie）之后必经的是换票，
   * 换票的响应就长这样，所以这里只管"把一份会话存好"
   */
  applySession: (response: LoginResponse) => {
    const user = toUser(response.user);
    // refresh_token 必须一起存：丢了它就只能重新登录
    saveTokens(response.access_token, response.refresh_token);
    saveUser(user);
    set({ user, token: response.access_token, isAuthenticated: true, isLoading: false });
  },

  /**
   * 登出 = **全局退出**。
   *
   * 只清本地是不够的：清完之后路由守卫会判定"没登录"并再跳一次 `/sso`，
   * 而认证中心域下的会话 cookie 前端删不掉 —— 于是立刻被静默登回去，
   * 登出按钮等于没用。所以必须跳到认证中心，由它吊销会话 + 删 cookie（§6.2.2）。
   *
   * 本地清理在跳转前做掉，这样即使跳转失败（比如网络断了），
   * 至少本应用是已登出状态
   */
  logout: () => {
    globalLogout();
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  /**
   * 用服务端的 user 覆盖本地缓存。
   *
   * 为什么需要：storage 里那份是登录那一刻的快照，`role` 之后被改过的话
   * （比如管理员被降级）它会一直显示错的 —— 前端据此渲染管理员入口。
   * 权限判定在后端，显示错了不致命，但别让它一直错着。
   *
   * **失败一律吞掉**：401 由请求层统一处理（续期，或续不了就跳 SSO），
   * 网络抖动更不该把用户登出。这个调用是"锦上添花"，不该有能力影响登录态
   */
  syncUser: async () => {
    try {
      const info = await authApi.me();
      const user = toUser(info);
      saveUser(user);
      set({ user });
    } catch (error) {
      console.warn('同步用户信息失败（不影响登录态）:', error);
    }
  },

  getCurrentUser: () => get().user,

  getToken: () => get().token,
}));

/**
 * 应用启动时调一次：拿本地令牌去服务端换一份最新的用户信息。
 *
 * 抽成独立函数是因为这个项目有**两个 app 入口文件**（app.ts 和 app.tsx），
 * 而 Taro 实际解析到哪一个不写在配置里（见 app.ts 的说明）。
 * 放在这里，两边各调一句就行，不怕哪天入口换了导致这段逻辑悄悄失效
 */
export function bootstrapAuth(): void {
  // 没有令牌就跳过：那是路由守卫的活儿（它会跳认证中心做 SSO）。
  // 这里只负责刷新信息，不判断"该不该登录"
  if (getAccessToken()) {
    void useAuthStore.getState().syncUser();
  }
}
