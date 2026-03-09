import React, {useState, useEffect} from 'react';
import {View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {ConfigProvider} from '@nutui/nutui-react-taro';
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import BottomTabBar from '../../components/BottomTabBar';
import GamesPage from '../games/index';
import MyGamesPage from '../my-games/index';
import ProfilePage from '../profile/index';
import './index.less';

function Index() {
  const {state: appState, setCurrentTab} = useAppStore();
  const {state: authState} = useAuthStore();
  const [currentTab, setLocalTab] = useState<'games' | 'my' | 'profile'>('games');

  console.log('autstate--->', authState)


  // 页面加载时检查登录状态
  useEffect(() => {
    if (!authState.isAuthenticated) {
      Taro.redirectTo({
        url: '/pages/login/index',
      });
    }
  }, [authState.isAuthenticated]);

  const handleTabChange = (tab: 'games' | 'my' | 'profile') => {
    setLocalTab(tab);
    setCurrentTab(tab);
  };

  const renderContent = () => {
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
  };

  // 如果未登录，不渲染任何内容（会跳转到登录页）
  if (!authState.isAuthenticated) {
    return null;
  }

  return (
    <ConfigProvider locale={zhCN}>
      <View className='main-container'>
        {renderContent()}
        <BottomTabBar currentTab={currentTab} onTabChange={handleTabChange}/>
      </View>
    </ConfigProvider>
  );
}

export default Index;
