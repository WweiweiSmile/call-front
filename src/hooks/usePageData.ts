import { useRequest } from 'ahooks';
import { useRefreshOnShow } from './useRefreshOnShow';

/** 直接借用 ahooks useRequest 的选项类型，避免手抄一份会漂移的副本 */
type AhooksRequestOptions<TData, TParams extends any[]> = NonNullable<
  Parameters<typeof useRequest<TData, TParams>>[1]
>;

export interface UsePageDataOptions<TData, TParams extends any[]>
  extends Omit<AhooksRequestOptions<TData, TParams>, 'manual'> {
  /**
   * 页面重新可见时是否重新取数，默认 true。
   * 表单页（编辑中途被切走再切回来）必须传 false，否则会把用户填了一半的内容冲掉
   */
  refreshOnShow?: boolean;
}

/**
 * 页面级取数：统一"首次加载"与"刷新中"的语义，并负责回到本页时重新取数。
 *
 * 存在的理由是两个反复踩的坑：
 *
 * 1. **首屏拉两次**。页面通常既写 `useEffect` 又写 `useDidShow`，而 onShow 在首次
 *    显示时也会触发，于是初次进入白打一次接口（`review-detail` 里那个
 *    `isFirstShow` ref 就是为了绕开它）。这里由 useRefreshOnShow 统一跳过首次。
 *
 * 2. **刷新时把页面刷掉**。只用一个 loading 布尔的话，"首次加载"和"后台刷新"
 *    走的是同一个全屏 loading 分支，整页被卸载重建 —— 滚动位置直接归零。
 *    这里把两者分开：`isFirstLoading` 只在**还没有任何数据**时为真，
 *    刷新期间它保持 false，页面继续显示旧内容原地更新。
 */
export function usePageData<TData, TParams extends any[]>(
  service: (...args: TParams) => Promise<TData>,
  options: UsePageDataOptions<TData, TParams> = {}
) {
  const { refreshOnShow = true, ...requestOptions } = options;

  const request = useRequest(service, {
    ...(requestOptions as AhooksRequestOptions<TData, TParams>),
    manual: false,
  });

  useRefreshOnShow(request.refresh, refreshOnShow);

  return {
    ...request,
    /**
     * 首次加载：请求在飞 且 还没有拿到过数据。
     * ahooks 的 data 在首次成功之前一直是 undefined，所以这个判断对
     * "返回列表"和"返回对象"两种接口都成立（空数组是 truthy，不会被误判成首次）
     */
    isFirstLoading: request.loading && request.data === undefined,
  };
}

export default usePageData;
