import {useCallback, useState} from 'react';
import {AppState, initialState} from './types';
import {useGameStore} from './useGameStore';
import {useBalanceStore} from './useBalanceStore';
import {useTransactionStore} from './useTransactionStore';
import {useUIStore} from './useUIStore';

// 导出所有类型和子模块
export * from './types';
export * from './useGameStore';
export * from './useBalanceStore';
export * from './useTransactionStore';
export * from './useUIStore';

// 主 store Hook - 保持向后兼容
export function useAppStore() {
  const [state, setState] = useState<AppState>(initialState);

  // 安全的 setState 包装
  const safeSetState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  // UI Store
  const {setLoading, setCurrentTab, setCurrentGameId} = useUIStore({
    state,
    setState: safeSetState,
  });

  // Game Store
  const gameStore = useGameStore({
    state,
    setState: safeSetState,
    setLoading,
  });

  // Balance Store
  const balanceStore = useBalanceStore({
    state,
    setState: safeSetState,
    setLoading,
  });

  // Transaction Store - 依赖 balanceStore 的某些方法
  const transactionStore = useTransactionStore({
    state,
    setState: safeSetState,
    setLoading,
    loadUserBalance: balanceStore.loadUserBalance,
    loadGameParticipantBalances: balanceStore.loadGameParticipantBalances,
  });

  // 包装 joinGame 以初始化余额
  const joinGameWithBalanceInit = useCallback(
    async (gameId: string, currentUserId: string) => {
      await gameStore.joinGame(gameId, currentUserId);
      balanceStore.initUserBalanceOnJoin(currentUserId, gameId);
    },
    [gameStore.joinGame, balanceStore.initUserBalanceOnJoin]
  );

  return {
    // 原始状态（向后兼容）
    state,

    // 游戏相关
    getGames: gameStore.getGames,
    getOngoingGames: gameStore.getOngoingGames,
    getPendingGames: gameStore.getPendingGames,
    getUserGames: gameStore.getUserGames,
    getUserCreatedGames: gameStore.getUserCreatedGames,
    createGame: gameStore.createGame,
    joinGame: joinGameWithBalanceInit,
    endGame: gameStore.endGame,
    loadGame: gameStore.loadGame,
    loadGames: gameStore.loadGames,
    loadMyGames: gameStore.loadMyGames,

    // 余额相关
    getUserBalance: balanceStore.getUserBalance,
    isUserJoinedGame: balanceStore.isUserJoinedGame,
    getGameParticipantBalances: balanceStore.getGameParticipantBalances,
    getGameParticipants: balanceStore.getGameParticipants,
    loadUserBalance: balanceStore.loadUserBalance,
    loadGameParticipantBalances: balanceStore.loadGameParticipantBalances,

    // 交易相关
    getGameTransactions: transactionStore.getGameTransactions,
    deposit: transactionStore.deposit,
    withdraw: transactionStore.withdraw,
    loadGameTransactions: transactionStore.loadGameTransactions,

    // UI 相关
    setCurrentTab,
    setCurrentGameId,
  };
}
