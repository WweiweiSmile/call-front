import { useState, useCallback, useEffect } from 'react';
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

// 认证 Hook
export function useAuthStore() {
  const [state, setState] = useState<AuthState>({
    user: getUserFromStorage(),
    token: getTokenFromStorage(),
    isAuthenticated: !!getTokenFromStorage(),
    isLoading: false,
  });

  // 初始化时检查登录状态
  useEffect(() => {
    const token = getTokenFromStorage();
    const user = getUserFromStorage();
    if (token && user) {
      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const response: any = await authApi.login({ username, password });
      const user: User = {
        id: String(response.user.id),
        username: response.user.username,
        nickname: response.user.nickname,
        avatar: response.user.avatar,
      };
      
      saveToStorage(response.token, user);
      
      setState({
        user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      return true;
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // 注册
  const register = useCallback(async (username: string, password: string, nickname?: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const response: any = await authApi.register({ username, password, nickname });
      const user: User = {
        id: String(response.user.id),
        username: response.user.username,
        nickname: response.user.nickname,
        avatar: response.user.avatar,
      };
      
      saveToStorage(response.token, user);
      
      setState({
        user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      return true;
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // 登出
  const logout = useCallback(() => {
    clearStorage();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // 获取当前用户
  const getCurrentUser = useCallback(() => state.user, [state.user]);

  // 获取 token
  const getToken = useCallback(() => state.token, [state.token]);

  return {
    state,
    login,
    register,
    logout,
    getCurrentUser,
    getToken,
  };
}
