import { useRef } from 'react';
import { useDidShow } from '@tarojs/taro';

/**
 * 页面重新可见时执行一次刷新。
 *
 * 为什么需要它：Taro 的页面离开不等于卸载 —— navigateTo 只是把当前页压进栈里
 * （H5 走 handler.hide，小程序同理），组件实例和 state 都留着。所以
 * `useEffect(fn, [])` 只在页面**创建**时跑一次，从子页面返回时不会重跑，
 * 拿它拉数据会一直显示旧内容。
 *
 * 为什么要跳过首次：onShow 在页面首次显示时也会触发，而调用方的初始加载
 * 已经拉过一次了，不跳过就是首屏两次请求。
 *
 * onShow 的触发源其实有三个 —— 首次进入、从子页面返回、切后台/切标签页回来。
 * 后两者对"数据是否变了"的意义不同，但 Taro 给不出可靠的区分信号（回调参数相同、
 * 路由也没变），所以这里一视同仁地刷新。可以这么做的前提是配套的渲染约定：
 * 有数据时不要铺全屏 loading（用 usePageData 的 isFirstLoading），
 * 这样多刷一次用户完全无感，换来的是数据总是新鲜的。
 *
 * 确实不该刷的页面（表单页：会把用户填了一半的内容冲掉）传 enabled = false。
 */
export function useRefreshOnShow(refresh: () => void, enabled = true) {
  const isFirstShow = useRef(true);

  useDidShow(() => {
    const isFirst = isFirstShow.current;
    isFirstShow.current = false;
    if (isFirst || !enabled) return;
    refresh();
  });
}

export default useRefreshOnShow;
