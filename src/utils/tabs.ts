/** 底部导航栏的四个 Tab */
export type TabType = 'games' | 'reviews' | 'my' | 'profile';

/**
 * 默认 Tab（登录回来没记住原页面时的兜底落地页）。
 *
 * 与 app.config.ts 的 entryPagePath 必须一致：产品定位是学习工具，
 * 落地页是「复盘」而非「游戏」（场次/存取分属局务）。
 */
export const DEFAULT_TAB: TabType = 'reviews';

/** 各 Tab 对应的页面路径 */
export const TAB_ROUTES: Record<TabType, string> = {
  games: '/pages/games/index',
  reviews: '/pages/reviews/index',
  my: '/pages/my-games/index',
  profile: '/pages/profile/index',
};

/** 默认落地页路径 */
export const DEFAULT_ROUTE = TAB_ROUTES[DEFAULT_TAB];
