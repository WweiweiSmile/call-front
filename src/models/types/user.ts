// ============================================
// User - 用户表模型
// 对应后端: models/user.go
// ============================================

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}
