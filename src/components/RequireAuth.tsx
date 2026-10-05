import React, {useEffect} from 'react';
import {View} from '@tarojs/components';
import {useRouter} from '@tarojs/taro';
import {useAuthStore} from '../store/auth';
import {CALLBACK_ROUTE, startSSO} from '../utils/sso';

/**
 * 不需要登录就能访问的页面。
 *
 * 回调页必须在里面 —— 它渲染的那一刻用户**恰恰还没有登录态**
 *（令牌正是这个页面接下来要去换的东西）。不白名单的话，
 * 守卫会在换票之前就把人再弹去 /sso，来回死循环
 */
const whitelist = [CALLBACK_ROUTE];

/**
 * Hook 版本，用于在页面组件中使用
 */
export function useRequireAuth() {
  const router = useRouter();
  const {isAuthenticated} = useAuthStore();

  const currentPath = router.path;
  const isWhitelisted = whitelist.includes(currentPath);

  useEffect(() => {
    if (isWhitelisted || isAuthenticated) {
      return;
    }
    // 没登录 → 跳认证中心做 SSO。原来的页面路径由 startSSO 自己记下来，
    // 登录完送回来（不用再手工拼 redirectUri）
    startSSO();
  }, [isAuthenticated, isWhitelisted, currentPath]);

  return {
    isAuthenticated: isAuthenticated,
    isWhitelisted: isWhitelisted,
  };
}

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * 组件版本
 */
function RequireAuth({children}: RequireAuthProps) {
  const router = useRouter();
  const {isAuthenticated} = useAuthStore();

  const currentPath = router.path;
  const isWhitelisted = whitelist.includes(currentPath);

  useEffect(() => {
    if (isWhitelisted || isAuthenticated) {
      return;
    }
    startSSO();
  }, [isAuthenticated, isWhitelisted, currentPath]);

  // 白名单页面或已登录，正常渲染
  if (isWhitelisted || isAuthenticated) {
    return <>{children}</>;
  }

  // 否则显示空页面（startSSO 已经把浏览器带走了）
  return <View/>;
}

export default RequireAuth;
