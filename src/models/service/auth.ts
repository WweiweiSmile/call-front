// ============================================
// 认证 API 接口类型
// 对应后端: dto/auth.go
// ============================================

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
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

// 登录响应
export interface LoginResponse {
  token: string;
  user: UserInfo;
}
