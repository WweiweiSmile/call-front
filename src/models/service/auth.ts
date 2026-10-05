// ============================================
// 认证 API 接口类型
// 对应 **认证中心 call-auth** 的 dto/auth.go（不再是 call-back）
// ============================================

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
  /** 哪个应用发起的登录。只用于审计，不参与鉴权 */
  client_id?: string;
}

// 注册请求
export interface RegisterRequest {
  username: string;
  nickname?: string;
  password: string;
}

// 用户角色
export type UserRole = 'user' | 'admin';

// 用户信息
export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  /** 前端据此显示管理员入口；权限判定在后端，这个值只用于渲染 */
  role: UserRole;
}

/**
 * 登录/注册/续期的统一响应。
 *
 * 与迁移前（call-back 的 `{token, user}`）的区别：现在是**双令牌**。
 * access 15 分钟过期，靠 refresh 静默续期；refresh 只在签发时返回这一次，
 * 丢了就只能重新登录，所以必须持久化
 */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  /** access token 剩余秒数 */
  expires_in: number;
  token_type: string;
  user: UserInfo;
}

/** 续期响应。不带 user —— 续期不改变身份 */
export type RefreshResponse = Omit<LoginResponse, 'user'>;
