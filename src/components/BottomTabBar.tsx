import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { TAB_ROUTES } from '../utils/tabs';
import type { TabType } from '../utils/tabs';
import './BottomTabBar.less';

interface BottomTabBarProps {
  /** 当前页面所属的 Tab */
  currentTab: TabType;
}

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'games', label: '游戏', icon: '🎮' },
  { key: 'my', label: '已参与', icon: '🎯' },
  { key: 'profile', label: '我', icon: '👤' },
];

const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentTab }) => {
  // 三个 Tab 是独立页面，用 redirectTo 替换当前页，页面栈始终只有一层
  const handleTabChange = (tab: TabType) => {
    if (tab === currentTab) return;
    Taro.redirectTo({ url: TAB_ROUTES[tab] });
  };

  return (
    <View className='bottom-tab-bar'>
      {TABS.map((tab) => (
        <View
          key={tab.key}
          className={`tab-item ${currentTab === tab.key ? 'active' : ''}`}
          onClick={() => handleTabChange(tab.key)}
          data-testid={`tab-${tab.key}`}
        >
          <Text className='tab-icon'>{tab.icon}</Text>
          <Text className='tab-label'>{tab.label}</Text>
        </View>
      ))}
    </View>
  );
};

export default BottomTabBar;
