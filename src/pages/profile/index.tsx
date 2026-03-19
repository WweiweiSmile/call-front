import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Cell, Button, Dialog } from '@nutui/nutui-react-taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import './index.less';

const ProfilePage: React.FC = () => {
  const {
    getUserGames,
    getUserCreatedGames,
    getGameTransactions,
    state,
  } = useAppStore();
  const { state: authState, logout } = useAuthStore();

  const [visible, setVisible] = useState(false);

  const currentUser = authState.user;
  const userGames = currentUser ? getUserGames(currentUser.id) : [];
  const userCreatedGames = currentUser ? getUserCreatedGames(currentUser.id) : [];

  // 计算统计数据
  const userBalances = currentUser ? state.userGameBalances.filter((b) => b.userId === currentUser.id) : [];
  const balancedCount = userBalances.filter((b) => b.isBalanced).length;
  const selfTransactions = currentUser ? getGameTransactions('').filter((t) => !t.isProxy && t.userId === currentUser.id) : [];
  const proxyTransactions = currentUser ? getGameTransactions('').filter((t) => t.isProxy && t.userId === currentUser.id) : [];

  const handleLogout = () => {
    setVisible(true);
  };

  const handleConfirmLogout = () => {
    setVisible(false);
    logout();
    // 跳转到登录页面
    Taro.redirectTo({
      url: '/pages/login/index',
    });
  };

  if (!currentUser) {
    return null;
  }

  return (
    <View className='profile-page'>
      <View className='header'>
        <Text className='title'>个人中心</Text>
      </View>

      <ScrollView className='content-wrapper' scrollY>
        <View className='user-info-card'>
          <View className='avatar'>{currentUser.avatar || '👤'}</View>
          <View className='user-details'>
            <Text className='username'>{currentUser.nickname || currentUser.username}</Text>
            <Text className='user-id'>ID: {currentUser.id}</Text>
          </View>
        </View>

        <View className='stats-card'>
          <Text className='stats-title'>📊 我的统计</Text>
          <View className='stats-grid'>
            <View className='stat-item'>
              <Text className='stat-value'>{userGames.length}</Text>
              <Text className='stat-label'>参与场次</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{userCreatedGames.length}</Text>
              <Text className='stat-label'>创建游戏</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{balancedCount}</Text>
              <Text className='stat-label'>平衡场次</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{selfTransactions.length}</Text>
              <Text className='stat-label'>自主操作</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{proxyTransactions.length}</Text>
              <Text className='stat-label'>被代理操作</Text>
            </View>
          </View>
        </View>

        <View className='menu-section'>
          <Cell
            title='⚙️ 设置'
            onClick={() => {}}
          />
          <Cell
            title='📖 帮助中心'
            onClick={() => {}}
          />
          <Cell
            title='📞 联系客服'
            onClick={() => {}}
          />
        </View>

        <View className='logout-section'>
          <Button
            type='danger'
            size='large'
            block
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </View>
      </ScrollView>

      <Dialog
        visible={visible}
        title="确认登出"
        content="确定要退出登录吗？"
        onCancel={() => setVisible(false)}
        onConfirm={handleConfirmLogout}
      />
    </View>
  );
};

export default ProfilePage;
