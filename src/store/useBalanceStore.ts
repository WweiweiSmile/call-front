import {useCallback} from 'react';
import {transactionApi} from '../services/api';
import {User, UserGameBalance} from './mockData';
import {AppState} from './types';

interface UseBalanceStoreOptions {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  setLoading: (loading: boolean) => void;
}

export function useBalanceStore({state, setState, setLoading}: UseBalanceStoreOptions) {
  // 加载用户余额
  const loadUserBalance = useCallback(async (gameId: string) => {
    try {
      const balance: any = await transactionApi.getUserBalance(gameId);
      const userBalance: UserGameBalance = {
        userId: String(balance.userId),
        gameId: String(balance.gameId),
        userName: balance.userName,
        depositTotal: balance.totalDeposit,
        withdrawTotal: balance.totalWithdraw,
        currentBalance: balance.currentBalance,
        isBalanced: balance.balanceStatus === 'balanced',
        lastTransactionTime: new Date().toISOString(),
      };

      setState((prev) => {
        const newBalances = prev.userGameBalances.filter(
          (b) => !(b.gameId === gameId && b.userId === String(balance.userId))
        );
        return {
          ...prev,
          userGameBalances: [...newBalances, userBalance],
        };
      });
    } catch (error) {
      console.error('加载用户余额失败:', error);
    }
  }, [setState]);

  // 判断用户是否已加入某游戏
  const isUserJoinedGame = useCallback(
    (gameId: string, userId: string) => {
      // 如果是创建者，默认已加入
      const game = state.games.find((g) => g.id === gameId);
      if (game?.creatorId === userId) return true;
      // 检查是否有余额记录
      return state.userGameBalances.some(
        (b) => b.gameId === gameId && b.userId === userId
      );
    },
    [state.userGameBalances, state.games]
  );

  // 获取用户在某游戏中的余额
  const getUserBalance = useCallback(
    (gameId: string, userId: string) => {
      return state.userGameBalances.find(
        (b) => b.gameId === gameId && b.userId === userId
      );
    },
    [state.userGameBalances]
  );

  // 加载游戏参与者余额
  const loadGameParticipantBalances = useCallback(async (gameId: string) => {
    if (!gameId || !gameId.trim()) {
      console.warn('loadGameParticipantBalances: gameId 为空');
      return;
    }
    try {
      const participants: any[] = await transactionApi.getGameParticipants(gameId);
      const balances: UserGameBalance[] = participants.map((p: any) => ({
        userId: String(p.userId),
        gameId: String(p.gameId),
        userName: p.userName,
        depositTotal: p.totalDeposit,
        withdrawTotal: p.totalWithdraw,
        currentBalance: p.currentBalance,
        isBalanced: p.balanceStatus === 'balanced',
        lastTransactionTime: new Date().toISOString(),
      }));

      // 同时更新参与者信息
      const gameParticipants: User[] = participants.map((p: any) => ({
        id: String(p.userId),
        name: p.userName || '未知用户',
        avatar: '👤',
      }));

      setState((prev) => {
        const newBalances = prev.userGameBalances.filter((b) => b.gameId !== gameId);
        const newGameParticipants = {...prev.gameParticipants};
        newGameParticipants[gameId] = gameParticipants;

        return {
          ...prev,
          userGameBalances: [...newBalances, ...balances],
          gameParticipants: newGameParticipants,
        };
      });
    } catch (error) {
      console.error('加载参与者余额失败:', error);
    }
  }, [setState]);

  // 获取游戏的所有参与者余额（游戏创建者用）
  const getGameParticipantBalances = useCallback(
    (gameId: string) => {
      return state.userGameBalances.filter((b) => b.gameId === gameId);
    },
    [state.userGameBalances]
  );

  // 获取游戏参与者
  const getGameParticipants = useCallback(
    (gameId: string) => {
      return state.gameParticipants[gameId] || [];
    },
    [state.gameParticipants]
  );

  // 加入游戏时初始化用户余额（供 joinGame 调用）
  const initUserBalanceOnJoin = useCallback((currentUserId: string, gameId: string) => {
    const newBalance: UserGameBalance = {
      userId: currentUserId,
      gameId,
      depositTotal: 0,
      withdrawTotal: 0,
      currentBalance: 0,
      isBalanced: true,
      lastTransactionTime: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      userGameBalances: [...prev.userGameBalances, newBalance],
    }));
  }, [setState]);

  return {
    loadUserBalance,
    isUserJoinedGame,
    getUserBalance,
    loadGameParticipantBalances,
    getGameParticipantBalances,
    getGameParticipants,
    initUserBalanceOnJoin,
  };
}
