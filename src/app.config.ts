export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/games/index',
    'pages/my-games/index',
    'pages/game-detail/index',
    'pages/profile/index',
    'pages/create-game/index',
    'pages/leaderboard/index',
  ],
  entryPagePath: 'pages/login/index',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'Call游戏管理',
    navigationBarTextStyle: 'black',
  },
});
