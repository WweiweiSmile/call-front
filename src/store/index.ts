import {useCallback, useEffect, useState} from 'react';
import {gameApi, transactionApi} from '../services/api';
import {Game, Transaction, User, UserGameBalance,} from './mockData';

// 全局状态类型
interface AppState {
  games: Game[];
  userGameBalances: UserGameBalance[];
  transactions: Transaction[];
  gameParticipants: Record<string, User[]>;
  currentGameId: string | null;
  currentTab: 'games' | 'my' | 'profile';
  isLoading: boolean;
  currentTime: Date;
}

// 初始状态
const initialState: AppState = {
  games: [],
  userGameBalances: [],
  transactions: [],
  gameParticipants: {},
  currentGameId: null,
  currentTab: 'games',
  isLoading: false,
  currentTime: new Date(),
};

// Hook 形式的状态管理
export function useAppStore() {
  const [state, setState] = useState<AppState>(initialState);

  // 定期更新当前时间（每分钟）
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({...prev, currentTime: new Date()}));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // 设置加载状态
  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({...prev, isLoading: loading}));
  }, []);

  // 从后端加载游戏列表
  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await gameApi.getGames();
      const games: Game[] = response.list.map((g: any) => ({
        id: String(g.id),
        name: g.name,
        creatorId: String(g.creator_id),
        creatorName: g.creator_name || '创建者',
        status: g.status as 'pending' | 'ongoing' | 'ended',
        participantCount: g.player_count,
        description: g.description,
        startTime: g.start_time,
        endTime: g.end_time,
        isJoined: g.is_joined,
      }));
      setState((prev) => ({...prev, games}));
    } catch (error) {
      console.error('加载游戏列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // 从后端加载我的游戏
  const loadMyGames = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await gameApi.getMyGames();
      const games: Game[] = response.list.map((g: any) => ({
        id: String(g.id),
        name: g.name,
        creatorId: String(g.creator_id),
        creatorName: g.creator_name || '创建者',
        status: g.status as 'pending' | 'ongoing' | 'ended',
        participantCount: g.player_count,
        description: g.description,
        startTime: g.start_time,
        endTime: g.end_time,
        isJoined: g.is_joined,
      }));
      setState((prev) => ({...prev, games}));
    } catch (error) {
      console.error('加载我的游戏失败:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // 获取游戏列表（优先使用已加载的数据）
  const getGames = useCallback(() => state.games, [state.games]);

  // 获取进行中的游戏
  const getOngoingGames = useCallback(() => {
    const now = state.currentTime;
    return state.games.filter((g) => {
      // 如果状态已经是ongoing，直接返回
      if (g.status === 'ongoing') return true;
      // 如果状态是pending但开始时间已到，也视为进行中
      if (g.status === 'pending' && g.startTime) {
        try {
          const startTime = new Date(g.startTime);
          return startTime <= now;
        } catch {
          return false;
        }
      }
      return false;
    });
  }, [state.games, state.currentTime]);

  // 获取即将开始的游戏
  const getPendingGames = useCallback(() => {
    const now = state.currentTime;
    return state.games.filter((g) => {
      // 如果状态是pending且开始时间未到，返回true
      if (g.status === 'pending') {
        if (!g.startTime) return true;
        try {
          const startTime = new Date(g.startTime);
          return startTime > now;
        } catch {
          return true;
        }
      }
      return false;
    });
  }, [state.games, state.currentTime]);

  // 获取用户参与的游戏
  const getUserGames = useCallback((currentUserId: string) => {
    return state.games.filter((g) => {
      return g.status === 'ongoing' || g.creatorId === currentUserId;
    });
  }, [state.games]);

  // 获取用户创建的游戏
  const getUserCreatedGames = useCallback((currentUserId: string) => {
    return state.games.filter((g) => g.creatorId === currentUserId);
  }, [state.games]);

  // 加载用户余额
  const loadUserBalance = useCallback(async (gameId: string) => {
    try {
      const balance: any = await transactionApi.getUserBalance(gameId);
      const userBalance: UserGameBalance = {
        userId: String(balance.user_id),
        gameId: String(balance.game_id),
        userName: balance.user_name,
        depositTotal: balance.total_deposit,
        withdrawTotal: balance.total_withdraw,
        currentBalance: balance.current_balance,
        isBalanced: balance.balance_status === 'balanced',
        lastTransactionTime: new Date().toISOString(),
      };

      setState((prev) => {
        const newBalances = prev.userGameBalances.filter(
          (b) => !(b.gameId === gameId && b.userId === String(balance.user_id))
        );
        return {
          ...prev,
          userGameBalances: [...newBalances, userBalance],
        };
      });
    } catch (error) {
      console.error('加载用户余额失败:', error);
    }
  }, []);

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
    try {
      const participants: any[] = await transactionApi.getGameParticipants(gameId);
      const balances: UserGameBalance[] = participants.map((p: any) => ({
        userId: String(p.user_id),
        gameId: String(p.game_id),
        userName: p.user_name,
        depositTotal: p.total_deposit,
        withdrawTotal: p.total_withdraw,
        currentBalance: p.current_balance,
        isBalanced: p.balance_status === 'balanced',
        lastTransactionTime: new Date().toISOString(),
      }));

      // 同时更新参与者信息
      const gameParticipants: User[] = participants.map((p: any) => ({
        id: String(p.user_id),
        name: p.user_name || '未知用户',
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
  }, []);

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

  // 加载交易记录
  const loadGameTransactions = useCallback(async (gameId: string, userId?: string) => {
    try {
      const response: any = await transactionApi.getGameTransactions(gameId, {userId});
      const transactions: Transaction[] = response.list.map((t: any) => ({
        id: String(t.id),
        userId: String(t.user_id),
        userName: t.user_name || '用户',
        gameId: String(t.game_id),
        operatorId: String(t.operator_id),
        operatorName: t.operator_name || '操作人',
        isProxy: t.operator_type === 'proxy',
        type: t.trans_type as 'deposit' | 'withdraw',
        amount: t.amount,
        balanceAfter: t.balance_after,
        remark: t.remark,
        createdAt: t.created_at,
      }));

      setState((prev) => {
        const newTransactions = prev.transactions.filter((t) => t.gameId !== gameId);
        return {
          ...prev,
          transactions: [...newTransactions, ...transactions],
        };
      });
    } catch (error) {
      console.error('加载交易记录失败:', error);
    }
  }, []);

  // 获取某游戏的交易记录
  const getGameTransactions = useCallback(
    (gameId: string, userId?: string) => {
      let txs = state.transactions.filter((t) => t.gameId === gameId);
      if (userId) {
        txs = txs.filter((t) => t.userId === userId);
      }
      return txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [state.transactions]
  );

  // 创建游戏
  const createGame = useCallback(
    async (game: Omit<Game, 'id' | 'creatorId' | 'creatorName' | 'status' | 'participantCount'>, currentUser: { id: string; name: string }) => {
      setLoading(true);
      try {
        const newGame: any = await gameApi.createGame({
          name: game.name,
          description: game.description,
          startTime: game.startTime,
          endTime: game.endTime,
        });

        const gameData: Game = {
          id: String(newGame.id),
          name: newGame.name,
          creatorId: String(newGame.creator_id),
          creatorName: currentUser.name,
          status: newGame.status as 'pending' | 'ongoing' | 'ended',
          participantCount: newGame.player_count || 0,
          description: newGame.description,
          startTime: newGame.start_time,
          endTime: newGame.end_time,
        };

        setState((prev) => ({
          ...prev,
          games: [gameData, ...prev.games],
        }));

        return gameData;
      } catch (error) {
        console.error('创建游戏失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  // 加入游戏
  const joinGame = useCallback(
    async (gameId: string, currentUserId: string) => {
      setLoading(true);
      try {
        await gameApi.joinGame(parseInt(gameId));

        setState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            g.id === gameId
              ? {...g, participantCount: g.participantCount + 1, status: 'ongoing' as const, isJoined: true}
              : g
          ),
        }));

        // 初始化用户余额
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
      } catch (error) {
        console.error('加入游戏失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  // 结束游戏
  const endGame = useCallback(
    async (gameId: string) => {
      setLoading(true);
      try {
        await gameApi.endGame(gameId);

        setState((prev) => ({
          ...prev,
          games: prev.games.filter((g) => g.id !== gameId),
        }));
      } catch (error) {
        console.error('结束游戏失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  // 存分操作
  const deposit = useCallback(
    async (gameId: string, amount: number, currentUserId: string, targetUserId?: string, remark?: string) => {
      setLoading(true);
      try {
        const userId = targetUserId || currentUserId;
        const targetUserIdNum = targetUserId ? parseInt(targetUserId) : undefined;

        await transactionApi.deposit({
          gameId: parseInt(gameId),
          targetUserId: targetUserIdNum,
          amount,
          remark,
        });

        // 重新加载余额和交易记录
        await loadUserBalance(gameId);
        await loadGameTransactions(gameId, userId);

        if (targetUserId) {
          await loadGameParticipantBalances(gameId);
        }
      } catch (error) {
        console.error('存分失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, loadUserBalance, loadGameTransactions, loadGameParticipantBalances]
  );

  // 取分操作
  const withdraw = useCallback(
    async (gameId: string, amount: number, currentUserId: string, targetUserId?: string, remark?: string) => {
      setLoading(true);
      try {
        const userId = targetUserId || currentUserId;
        const targetUserIdNum = targetUserId ? parseInt(targetUserId) : undefined;

        await transactionApi.withdraw({
          gameId: parseInt(gameId),
          targetUserId: targetUserIdNum,
          amount,
          remark,
        });

        // 重新加载余额和交易记录
        await loadUserBalance(gameId);
        await loadGameTransactions(gameId, userId);

        if (targetUserId) {
          await loadGameParticipantBalances(gameId);
        }
      } catch (error) {
        console.error('取分失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, loadUserBalance, loadGameTransactions, loadGameParticipantBalances]
  );

  // 设置当前 Tab
  const setCurrentTab = useCallback((tab: 'games' | 'my' | 'profile') => {
    setState((prev) => ({...prev, currentTab: tab}));
  }, []);

  // 设置当前游戏
  const setCurrentGameId = useCallback((gameId: string | null) => {
    setState((prev) => ({...prev, currentGameId: gameId}));
  }, []);

  return {
    state,
    getGames,
    getOngoingGames,
    getPendingGames,
    getUserGames,
    getUserCreatedGames,
    getUserBalance,
    isUserJoinedGame,
    getGameParticipantBalances,
    getGameParticipants,
    getGameTransactions,
    createGame,
    joinGame,
    endGame,
    deposit,
    withdraw,
    setCurrentTab,
    setCurrentGameId,
    loadGames,
    loadMyGames,
    loadUserBalance,
    loadGameParticipantBalances,
    loadGameTransactions,
  };
}
