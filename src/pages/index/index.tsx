import React, {useMemo} from 'react';
import {View} from '@tarojs/components';
import {ConfigProvider} from '@nutui/nutui-react-taro';
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN';
import {useAppStore} from '../../store';
import {useRequireAuth} from '../../components/RequireAuth';
import BottomTabBar from '../../components/BottomTabBar';
import GamesPage from '../games/index';
import MyGamesPage from '../my-games/index';
import ProfilePage from '../profile/index';
import './index.less';

type TabType = 'games' | 'my' | 'profile';

function Index() {
  const {isAuthenticated} = useRequireAuth();
  const {state: appState, setCurrentTab} = useAppStore();

  console.log('appState---->', appState)

  // 使用 store 中的 currentTab，默认值为 'games'
  const currentTab: TabType = appState.currentTab || 'games';

  const handleTabChange = (tab: TabType) => {
    setCurrentTab(tab);
  };

  const renderContent = useMemo(() => {
    switch (currentTab) {
      case 'games':
        return <GamesPage/>;
      case 'my':
        return <MyGamesPage/>;
      case 'profile':
        return <ProfilePage/>;
      default:
        return <GamesPage/>;
    }
  }, [currentTab]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <ConfigProvider locale={zhCN}>
      <View className='main-container'>
        {renderContent}
        <BottomTabBar currentTab={currentTab} onTabChange={handleTabChange}/>
      </View>
    </ConfigProvider>
  );
}

export default Index;
