import {useCallback} from 'react';
import {AppState} from './types';

interface UseUIStoreOptions {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
}

export function useUIStore({state, setState}: UseUIStoreOptions) {
  // 设置加载状态
  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({...prev, isLoading: loading}));
  }, [setState]);

  // 设置当前 Tab
  const setCurrentTab = useCallback((tab: 'games' | 'my' | 'profile') => {
    setState((prev) => ({...prev, currentTab: tab}));
  }, [setState]);

  // 设置当前游戏
  const setCurrentGameId = useCallback((gameId: string | null) => {
    setState((prev) => ({...prev, currentGameId: gameId}));
  }, [setState]);

  return {
    state,
    setLoading,
    setCurrentTab,
    setCurrentGameId,
  };
}
