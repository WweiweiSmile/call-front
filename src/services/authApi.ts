import { request } from './request';
import type {
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  UserInfo,
} from '../models/service';

// 认证相关 API
export const authApi = {
  // 注册
  register: (data: RegisterRequest) => {
    return request<LoginResponse>('/auth/register', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 登录
  login: (data: LoginRequest) => {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      data,
    }, false); // 不需要认证
  },

  // 获取当前用户信息
  getUserInfo: () => {
    return request<UserInfo>('/auth/user');
  },
};
