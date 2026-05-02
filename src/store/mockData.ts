// ============================================
// 向后兼容的类型定义
// 请逐步迁移至 src/models 下的新类型
// ============================================

// 从新的 models 目录导入并重新导出，保持向后兼容
import type {
  FrontendUser as User,
  FrontendGame as Game,
  FrontendUserGameBalance as UserGameBalance,
  FrontendTransaction as Transaction,
} from '../models/types';

// 重新导出，保持现有代码不变
export type { User, Game, UserGameBalance, Transaction };
