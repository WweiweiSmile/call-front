// ============================================
// Game - 游戏场次表模型
// 对应后端: models/game.go
// ============================================

// 创建即进行中，只有创建者结束游戏后才变为 ended
export type GameStatus = 'ongoing' | 'ended';

export interface Game {
  id: number;
  name: string;
  description: string;
  creator_id: number;
  status: string;
  end_time: string | null;
  player_count: number;
  created_at: string;
  updated_at: string;
}
