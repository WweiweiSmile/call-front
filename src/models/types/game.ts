// ============================================
// Game - 游戏场次表模型
// 对应后端: models/game.go
// ============================================

export type GameStatus = 'pending' | 'ongoing' | 'ended';

export interface Game {
  id: number;
  name: string;
  description: string;
  creator_id: number;
  status: string;
  start_time: string | null;
  end_time: string | null;
  player_count: number;
  created_at: string;
  updated_at: string;
}
