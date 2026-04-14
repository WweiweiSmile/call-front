import {useCallback, useEffect, useState} from 'react';
import {gameApi} from '../services/api';
import {Game} from './mockData';
import {AppState, initialState} from './types';

interface UseGameStoreOptions {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  setLoading: (loading: boolean) => void;
}

export function useGameStore({state, setState, setLoading}: UseGameStoreOptions) {
  // 定期更新当前时间（每分钟）
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({...prev, currentTime: new Date()}));
    }, 60000);
    return () => clearInterval(interval);
  }, [setState]);

  // 从后端加载游戏列表
  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await gameApi.getGames();
      const games: Game[] = response.list.map((g: any) => ({
        id: String(g.id),
        name: g.name,
        creatorId: String(g.creatorId),
        creatorName: g.creatorName || '创建者',
        status: g.status as 'pending' | 'ongoing' | 'ended',
        participantCount: g.playerCount,
        description: g.description,
        startTime: g.startTime,
        endTime: g.endTime,
        isJoined: g.isJoined,
      }));
      setState((prev) => ({...prev, games}));
    } catch (error) {
      console.error('加载游戏列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setState]);

  // 从后端加载我的游戏
  const loadMyGames = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const response: any = await gameApi.getMyGames(status ? { status } : undefined);
      const games: Game[] = response.list.map((g: any) => ({
        id: String(g.id),
        name: g.name,
        creatorId: String(g.creatorId),
        creatorName: g.creatorName || '创建者',
        status: g.status as 'pending' | 'ongoing' | 'ended',
        participantCount: g.playerCount,
        description: g.description,
        startTime: g.startTime,
        endTime: g.endTime,
        isJoined: g.isJoined,
      }));
      setState((prev) => ({...prev, games}));
    } catch (error) {
      console.error('加载我的游戏失败:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setState]);

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
          creatorId: String(newGame.creatorId),
          creatorName: currentUser.name,
          status: newGame.status as 'pending' | 'ongoing' | 'ended',
          participantCount: newGame.playerCount || 0,
          description: newGame.description,
          startTime: newGame.startTime,
          endTime: newGame.endTime,
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
    [setLoading, setState]
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

        // 初始化用户余额会在 useBalanceStore 中处理
      } catch (error) {
        console.error('加入游戏失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setState]
  );

  // 结束游戏
  const endGame = useCallback(
    async (gameId: string) => {
      setLoading(true);
      try {
        await gameApi.endGame(gameId);

        setState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            g.id === gameId
              ? {...g, status: 'ended' as const}
              : g
          ),
        }));
      } catch (error) {
        console.error('结束游戏失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setState]
  );

  return {
    loadGames,
    loadMyGames,
    getGames,
    getOngoingGames,
    getPendingGames,
    getUserGames,
    getUserCreatedGames,
    createGame,
    joinGame,
    endGame,
  };
}
