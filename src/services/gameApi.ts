import { request } from './request';
import type {
  CreateGameRequest,
  GameListResponse,
  GameResponse,
  JoinGameRequest,
  GetGamesParams,
  GetMyGamesParams,
} from '../models/service';

// 游戏相关 API
export const gameApi = {
  // 创建游戏
  createGame: (data: CreateGameRequest) => {
    return request<GameResponse>('/games', {
      method: 'POST',
      data,
    });
  },

  // 获取游戏列表
  getGames: (params?: GetGamesParams) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我的游戏
  getMyGames: (params?: GetMyGamesParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games/my${queryString ? `?${queryString}` : ''}`);
  },

  // 获取我创建的游戏
  getCreatedGames: (params?: GetMyGamesParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    const queryString = query.toString();
    return request<GameListResponse>(`/games/created${queryString ? `?${queryString}` : ''}`);
  },

  // 获取游戏详情
  getGame: (id: string) => {
    return request<GameResponse>(`/games/${id}`);
  },

  // 加入游戏
  joinGame: (gameId: number) => {
    return request<void>('/games/join', {
      method: 'POST',
      data: { game_id: gameId } as JoinGameRequest,
    });
  },

  // 退出游戏
  leaveGame: (id: string) => {
    return request<void>(`/games/${id}/leave`, {
      method: 'POST',
    });
  },

  // 结束游戏
  endGame: (id: string) => {
    return request<void>(`/games/${id}/end`, {
      method: 'POST',
    });
  },
};
