import React from 'react';
import { View, Text } from '@tarojs/components';
import './BottomTabBar.less';

interface BottomTabBarProps {
  currentTab: 'games' | 'my' | 'profile';
  onTabChange: (tab: 'games' | 'my' | 'profile') => void;
}

const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { key: 'games', label: '游戏', icon: '🎮' },
    { key: 'my', label: '已参与', icon: '🎯' },
    { key: 'profile', label: '我', icon: '👤' },
  ];

  return (
    <View className='bottom-tab-bar'>
      {tabs.map((tab) => (
        <View
          key={tab.key}
          className={`tab-item ${currentTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key as any)}
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
