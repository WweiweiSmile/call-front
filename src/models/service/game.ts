// ============================================
// 游戏 API 接口类型
// 对应后端: dto/game.go
// ============================================

import type { ListResponse } from './common';

// 创建游戏请求
export interface CreateGameRequest {
  name: string;
  description?: string;
  start_time?: string;
  end_time?: string;
}

// 加入游戏请求
export interface JoinGameRequest {
  game_id: number;
}

// 游戏响应
export interface GameResponse {
  id: number;
  name: string;
  description: string;
  creator_id: number;
  creator_name?: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  player_count: number;
  created_at: string;
  is_creator?: boolean;
  is_joined?: boolean;
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
  page?: number;
  pageSize?: number;
}
