// ============================================
// 游戏 API 接口类型
// 对应后端: dto/game.go
// ============================================

import type {ListResponse} from './common';

// 创建游戏请求
export interface CreateGameRequest {
  name: string;
  description?: string;
  startTime?: string;
  endTime?: string;
}

// 加入游戏请求
export interface JoinGameRequest {
  gameId: number;
}

// 游戏响应
export interface GameResponse {
  id: number;
  name: string;
  description: string;
  creatorId: number;
  creatorName?: string;
  status: string;
  startTime: string;
  endTime?: string;
  playerCount: number;
  createdAt: string;
  isCreator?: boolean;
  isJoined?: boolean;
}

// 游戏列表响应
export type GameListResponse = ListResponse<GameResponse>;

// 获取游戏列表参数
export interface GetGamesParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

// 获取我的游戏参数
export interface GetMyGamesParams {
  status?: string;
  page?: number;
  pageSize?: number;
}
