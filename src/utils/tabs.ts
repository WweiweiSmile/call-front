/** 底部导航栏的四个 Tab */
export type TabType = 'games' | 'reviews' | 'my' | 'profile';

/** 默认 Tab（登录成功、无 redirectUri 兜底时进入） */
export const DEFAULT_TAB: TabType = 'games';

/** 各 Tab 对应的页面路径 */
export const TAB_ROUTES: Record<TabType, string> = {
  games: '/pages/games/index',
  reviews: '/pages/reviews/index',
  my: '/pages/my-games/index',
  profile: '/pages/profile/index',
};

/** 默认落地页路径 */
export const DEFAULT_ROUTE = TAB_ROUTES[DEFAULT_TAB];
