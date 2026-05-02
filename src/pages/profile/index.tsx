import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Cell, Button, Dialog } from '@nutui/nutui-react-taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import { useRequireAuth } from '../../components/RequireAuth';
import type { Transaction, UserGameBalance } from '../../store/mockData';
import './index.less';

const ProfilePage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
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

  // 使用 useMemo 优化统计数据计算，避免重复 filter
  const stats = useMemo(() => {
    if (!currentUser) {
      return {
        userBalances: [] as UserGameBalance[],
        balancedCount: 0,
        selfTransactions: [] as Transaction[],
        proxyTransactions: [] as Transaction[],
      };
    }

    const userBalances = state.userGameBalances.filter((b) => b.userId === currentUser.id);
    const allTransactions = getGameTransactions('');

    // 单次遍历同时获取 self 和 proxy transactions
    const selfTransactions: Transaction[] = [];
    const proxyTransactions: Transaction[] = [];
    for (const t of allTransactions) {
      if (t.userId === currentUser.id) {
        if (t.isProxy) {
          proxyTransactions.push(t);
        } else {
          selfTransactions.push(t);
        }
      }
    }

    return {
      userBalances,
      balancedCount: userBalances.filter((b) => b.isBalanced).length,
      selfTransactions,
      proxyTransactions,
    };
  }, [currentUser, state.userGameBalances, getGameTransactions]);

  const handleLogout = useCallback(() => {
    setVisible(true);
  }, []);

  const handleConfirmLogout = useCallback(() => {
    setVisible(false);
    logout();
    Taro.redirectTo({
      url: '/pages/login/index',
    });
  }, [logout]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View />;
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
              <Text className='stat-value'>{stats.balancedCount}</Text>
              <Text className='stat-label'>平衡场次</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{stats.selfTransactions.length}</Text>
              <Text className='stat-label'>自主操作</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-value'>{stats.proxyTransactions.length}</Text>
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
            data-testid="btn-logout"
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
