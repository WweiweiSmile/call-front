import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { authApi } from '../services/api';

// 用户信息类型
export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
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
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, nickname?: string) => Promise<boolean>;
  logout: () => void;
  getCurrentUser: () => User | null;
  getToken: () => string | null;
}

// 从本地存储获取 token
const getTokenFromStorage = (): string | null => {
  try {
    return Taro.getStorageSync('token');
  } catch {
    return null;
  }
};

// 从本地存储获取用户信息
const getUserFromStorage = (): User | null => {
  try {
    const userStr = Taro.getStorageSync('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

// 保存到本地存储
const saveToStorage = (token: string, user: User) => {
  try {
    Taro.setStorageSync('token', token);
    Taro.setStorageSync('user', JSON.stringify(user));
  } catch (error) {
    console.error('保存登录状态失败:', error);
  }
};

// 清除本地存储
const clearStorage = () => {
  try {
    Taro.removeStorageSync('token');
    Taro.removeStorageSync('user');
  } catch (error) {
    console.error('清除登录状态失败:', error);
  }
};

type AuthStore = AuthState & AuthActions;

// 创建 Zustand Store
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: getUserFromStorage(),
  token: getTokenFromStorage(),
  isAuthenticated: !!getTokenFromStorage(),
  isLoading: false,

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const response: any = await authApi.login({ username, password });
      const user: User = {
        id: String(response.user.id),
        username: response.user.username,
        nickname: response.user.nickname,
        avatar: response.user.avatar,
      };

      saveToStorage(response.token, user);

      set({
        user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });

      return true;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username: string, password: string, nickname?: string) => {
    set({ isLoading: true });
    try {
      const response: any = await authApi.register({ username, password, nickname });
      const user: User = {
        id: String(response.user.id),
        username: response.user.username,
        nickname: response.user.nickname,
        avatar: response.user.avatar,
      };

      saveToStorage(response.token, user);

      set({
        user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });

      return true;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    clearStorage();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  getCurrentUser: () => get().user,

  getToken: () => get().token,
}));
