import {View} from '@tarojs/components';
import {ConfigProvider} from '@nutui/nutui-react-taro';
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN';
import {useAppStore} from '../../store';
import {useRequireAuth} from '../../components/RequireAuth';
import BottomTabBar from '../../components/BottomTabBar';
import GamesPage from '../games/index';
import MyGamesPage from '../my-games/index';
import ProfilePage from '../profile/index';

type TabType = 'games' | 'my' | 'profile';

function Index() {
  const {isAuthenticated} = useRequireAuth();
  const {state: appState, setCurrentTab} = useAppStore();

  // 使用 store 中的 currentTab，默认值为 'games'
  const currentTab: TabType = appState.currentTab || 'games';

  const handleTabChange = (tab: TabType) => {
    setCurrentTab(tab);
  };

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated) {
    return <View />;
  }

  // 底栏由这里渲染并回传给各 Tab 页：
  // useAppStore 是组件级 state（非共享），只有与 currentTab 同源的这里才能改动它
  const tabBar = <BottomTabBar currentTab={currentTab} onTabChange={handleTabChange}/>;

  const renderContent = () => {
    switch (currentTab) {
      case 'games':
        return <GamesPage bottom={tabBar}/>;
      case 'my':
        return <MyGamesPage bottom={tabBar}/>;
      case 'profile':
        return <ProfilePage bottom={tabBar}/>;
      default:
        return <GamesPage bottom={tabBar}/>;
    }
  };

  return (
    <ConfigProvider locale={zhCN}>
      {renderContent()}
    </ConfigProvider>
  );
}

export default Index;
