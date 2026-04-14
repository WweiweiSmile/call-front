import { useState, useCallback, useRef, useEffect } from 'react';
import type { ListResponse } from '../models/service';

export interface UseLoadMoreOptions<TParams = any> {
  defaultCurrent?: number;
  defaultPageSize?: number;
  defaultParams?: TParams;
  autoLoad?: boolean;
}

export interface UseLoadMoreResult<TData, TParams = any> {
  data: TData[];
  current: number;
  pageSize: number;
  total: number;
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  params: TParams | undefined;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setCurrent: (page: number) => void;
  setPageSize: (size: number) => void;
  setParams: (params: TParams | ((prev: TParams | undefined) => TParams | undefined)) => void;
  setData: (data: TData[] | ((prev: TData[]) => TData[])) => void;
}

export function useLoadMore<TData, TParams = any>(
  api: (params: { page: number; pageSize: number } & TParams) => Promise<ListResponse<TData>>,
  options: UseLoadMoreOptions<TParams> = {}
): UseLoadMoreResult<TData, TParams> {
  const {
    defaultCurrent = 1,
    defaultPageSize = 10,
    defaultParams,
    autoLoad = true,
  } = options;

  const [data, setData] = useState<TData[]>([]);
  const [current, setCurrent] = useState(defaultCurrent);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [params, setParams] = useState<TParams | undefined>(defaultParams);

  const isFirstLoad = useRef(true);
  const apiRef = useRef(api);
  const paramsRef = useRef(params);
  const isParamChangeTriggered = useRef(false);

  // 更新 api 引用
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  // 更新 params 引用
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const hasMore = total > data.length;

  // 加载数据的核心方法
  const fetchData = useCallback(async (page: number, isRefresh: boolean = false) => {
    if (loading) return;

    setLoading(true);
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await apiRef.current({
        page,
        pageSize,
        ...paramsRef.current,
      } as any);

      setTotal(response.total);

      if (isRefresh || page === defaultCurrent) {
        setData(response.list);
      } else {
        setData((prev) => [...prev, ...response.list]);
      }

      setCurrent(page);
    } catch (error) {
      console.error('加载数据失败:', error);
      throw error;
    } finally {
      setLoading(false);
      if (isRefresh) {
        setRefreshing(false);
      }
    }
  }, [loading, pageSize, defaultCurrent]);

  // 加载更多
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchData(current + 1, false);
  }, [current, loading, hasMore, fetchData]);

  // 刷新
  const refresh = useCallback(async () => {
    await fetchData(defaultCurrent, true);
  }, [defaultCurrent, fetchData]);

  // 更新参数
  const handleSetParams = useCallback(
    (newParams: TParams | ((prev: TParams | undefined) => TParams | undefined)) => {
      setParams((prev) => {
        const nextParams = typeof newParams === 'function'
          ? (newParams as (prev: TParams | undefined) => TParams | undefined)(prev)
          : newParams;
        return nextParams;
      });
      isParamChangeTriggered.current = true;
    },
    []
  );

  // 更新数据
  const handleSetData = useCallback(
    (newData: TData[] | ((prev: TData[]) => TData[])) => {
      setData(newData);
    },
    []
  );

  // 初始加载
  useEffect(() => {
    if (isFirstLoad.current && autoLoad) {
      isFirstLoad.current = false;
      refresh();
    }
  }, [autoLoad, refresh]);

  // 监听 params 变化
  useEffect(() => {
    if (!isFirstLoad.current && isParamChangeTriggered.current) {
      isParamChangeTriggered.current = false;
      setCurrent(defaultCurrent);
      setData([]);
      setTotal(0);
      refresh();
    }
  }, [params, defaultCurrent, refresh]);

  return {
    data,
    current,
    pageSize,
    total,
    loading,
    refreshing,
    hasMore,
    params,
    loadMore,
    refresh,
    setCurrent,
    setPageSize,
    setParams: handleSetParams,
    setData: handleSetData,
  };
}

export default useLoadMore;
