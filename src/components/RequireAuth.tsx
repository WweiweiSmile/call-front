import React, {useEffect} from 'react';
import {View} from '@tarojs/components';
import {useRouter} from '@tarojs/taro';
import {useAuthStore} from '../store/auth';
import {startSSO} from '../utils/sso';

/**
 * Hook 版本，用于在页面组件中使用
 *
 * 没有白名单了：以前需要它是因为有个专门的回调页，而它渲染的那一刻用户
 * 恰恰还没有登录态。现在票据由入口处的 TicketHandler 处理完才放行，
 * 守卫跑到的时候要么已登录、要么真该跳登录，不需要给谁开例外
 */
export function useRequireAuth() {
  const router = useRouter();
  const {isAuthenticated} = useAuthStore();

  const currentPath = router.path;

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    // 没登录 → 跳认证中心做 SSO。**当前这一页就是落点**：
    // startSSO 会把它拼成 redirect_uri 带上，登录完原样跳回来
    startSSO();
  }, [isAuthenticated, currentPath]);

  return {
    isAuthenticated: isAuthenticated,
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

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    startSSO();
  }, [isAuthenticated, currentPath]);

  // 已登录，正常渲染
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 否则显示空页面（startSSO 已经把浏览器带走了）
  return <View/>;
}

export default RequireAuth;
