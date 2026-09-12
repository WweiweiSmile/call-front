import React, {useEffect} from 'react';
import {View} from '@tarojs/components';
import Taro, {useRouter} from '@tarojs/taro';
import {useAuthStore} from '../store/auth';
import {DEFAULT_ROUTE} from '../utils/tabs';

interface RequireAuthProps {
  children: React.ReactNode;
}

// Hook 版本，用于在页面组件中使用
export function useRequireAuth() {
  const router = useRouter();
  const {isAuthenticated} = useAuthStore();

  // 白名单页面，不需要登录就可以访问
  const whitelist = ['/pages/login/index'];
  const currentPath = router.path;

  useEffect(() => {
    // 如果在白名单中，不做任何处理
    if (whitelist.includes(currentPath)) {
      return;
    }

    // 如果没有登录，跳转到登录页面
    if (!isAuthenticated) {
      // 获取当前页面的完整路径作为 redirectUri
      let redirectUri = '';
      try {
        if (typeof window !== 'undefined' && window.location) {
          // 使用完整的 hash 路由作为 redirectUri
          redirectUri = encodeURIComponent(window.location.hash.slice(1) || DEFAULT_ROUTE);
        } else {
          // 降级方案：使用当前路径
          const params = new URLSearchParams(router.params as Record<string, string>).toString();
          const queryString = params ? `?${params}` : '';
          redirectUri = encodeURIComponent(`${currentPath}${queryString}`);
        }
      } catch (e) {
        redirectUri = encodeURIComponent(DEFAULT_ROUTE);
      }

      // 跳转到登录页面，带上 redirectUri
      Taro.redirectTo({
        url: `/pages/login/index?redirectUri=${redirectUri}`,
      });
    }
  }, [isAuthenticated, currentPath, router.params]);

  return {
    isAuthenticated: isAuthenticated,
    isWhitelisted: whitelist.includes(currentPath),
  };
}

// 组件版本
function RequireAuth({children}: RequireAuthProps) {
  const router = useRouter();
  const {isAuthenticated} = useAuthStore();

  // 白名单页面，不需要登录就可以访问
  const whitelist = ['/pages/login/index'];
  const currentPath = router.path;

  useEffect(() => {
    // 如果在白名单中，不做任何处理
    if (whitelist.includes(currentPath)) {
      return;
    }

    // 如果没有登录，跳转到登录页面
    if (!isAuthenticated) {
      // 获取当前页面的完整路径作为 redirectUri
      let redirectUri = '';
      try {
        if (typeof window !== 'undefined' && window.location) {
          // 使用完整的 hash 路由作为 redirectUri
          redirectUri = encodeURIComponent(window.location.hash.slice(1) || DEFAULT_ROUTE);
        } else {
          // 降级方案：使用当前路径
          const params = new URLSearchParams(router.params as Record<string, string>).toString();
          const queryString = params ? `?${params}` : '';
          redirectUri = encodeURIComponent(`${currentPath}${queryString}`);
        }
      } catch (e) {
        redirectUri = encodeURIComponent(DEFAULT_ROUTE);
      }

      // 跳转到登录页面，带上 redirectUri
      Taro.redirectTo({
        url: `/pages/login/index?redirectUri=${redirectUri}`,
      });
    }
  }, [isAuthenticated, currentPath, router.params]);

  // 如果在白名单中，或者已经登录，渲染子组件
  if (whitelist.includes(currentPath) || isAuthenticated) {
    return <>{children}</>;
  }

  // 否则显示空页面（会自动跳转）
  return <View/>;
}

export default RequireAuth;