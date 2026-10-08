import React, {useEffect} from 'react';
import {View} from '@tarojs/components';
import {useRouter} from '@tarojs/taro';
import {useAuthStore} from '../store/auth';
import {awaitPendingTicket, startSSO} from '../utils/sso';

/**
 * 未登录就跳认证中心做 SSO，返回当前登录态。
 *
 * 没有白名单了：以前需要它是因为有个专门的回调页，而它渲染的那一刻用户
 * 恰恰还没有登录态。现在票据由入口处的 TicketHandler 处理完才放行，
 * 守卫跑到的时候要么已登录、要么真该跳登录，不需要给谁开例外
 *
 * ## 为什么判定之前要先 `awaitPendingTicket()`
 *
 * SSO 回程那一页现在**真的会挂载**（票据处理不能再靠"不渲染 children"
 * 挡住 Taro 的页面挂载，见 TicketHandler 里的说明），所以本 hook 会在
 * **票据还在换**的时候跑起来。这时候直接判"未登录"就跳，
 * `startSSO()` 会把回程地址连着票据整个替换掉 —— 这次登录白跑。
 *
 * 等一等是安全的，而且两种结果都对：
 *   - 换成了 → 下面的 `isAuthenticated` 已是 true，直接放行
 *   - 没换成（票据过期、被用过、网络断）→ 才真的该跳
 *     （TicketHandler 在失败路径上已经清掉本地态）
 */
function useAuthRedirect(): boolean {
  const {isAuthenticated} = useAuthStore();
  const currentPath = useRouter().path;

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    let cancelled = false;

    // 没登录 → 跳认证中心做 SSO。**当前这一页就是落点**：
    // startSSO 会把它拼成 redirect_uri 带上，登录完原样跳回来
    void awaitPendingTicket().then(() => {
      if (cancelled) return;
      // 读 store 的最新值，而不是闭包里那个：换票成功时它已经变成 true 了
      //（失败时两者一样，都是 false）
      if (useAuthStore.getState().isAuthenticated) return;
      startSSO();
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentPath]);

  return isAuthenticated;
}

/**
 * Hook 版本，用于在页面组件中使用
 */
export function useRequireAuth() {
  return {
    isAuthenticated: useAuthRedirect(),
  };
}

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * 组件版本。判定和跳转复用同一个 hook —— 两边各写一份的话，
 * 迟早只有一边被改到（见 utils/authStorage.ts 里同一类教训）
 */
function RequireAuth({children}: RequireAuthProps) {
  const isAuthenticated = useAuthRedirect();

  // 已登录，正常渲染
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 否则显示空页面（startSSO 已经把浏览器带走了）
  return <View/>;
}

export default RequireAuth;
