import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMessageStore } from '../../store/messageStore';
import { useRefreshOnShow } from '../../hooks';
import { Cell, Button, Dialog } from '@nutui/nutui-react-taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import { useRequireAuth } from '../../components/RequireAuth';
import TabHeader from '../../components/TabHeader';
import PageLayout from '../../components/PageLayout';
import BottomTabBar from '../../components/BottomTabBar';
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
  const { user, logout } = useAuthStore();

  const [visible, setVisible] = useState(false);

  // 未读消息数：挂在消息中心入口上
  const unreadCount = useMessageStore((state) => state.unreadCount);
  const refreshUnread = useMessageStore((state) => state.refreshUnread);
  const clearMessages = useMessageStore((state) => state.clear);

  // Tab 页用 redirectTo 切换会重新挂载，mount 时拉一次；
  // 从消息中心返回时不会重新挂载，靠 useRefreshOnShow 再兜一层
  // （它会跳过首次 onShow，所以不会和上面这句重复请求）
  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useRefreshOnShow(refreshUnread);

  const currentUser = user;
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
    clearMessages();
    logout();
    Taro.redirectTo({
      url: '/pages/login/index',
    });
  }, [logout, clearMessages]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View />;
  }

  return (
    <PageLayout
      className='profile-page'
      contentClassName='content-wrapper'
      header={
        <>
          <TabHeader title='个人中心' />
          <Dialog
            visible={visible}
            title="确认登出"
            content="确定要退出登录吗？"
            onCancel={() => setVisible(false)}
            onConfirm={handleConfirmLogout}
          />
        </>
      }
      bottom={<BottomTabBar currentTab='profile'/>}
    >
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
            title={
              <View className='cell-title-with-badge'>
                <Text>📬 消息中心</Text>
                {unreadCount > 0 && (
                  <View className='menu-badge'>
                    <Text className='menu-badge-text'>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            }
            onClick={() => {
              Taro.navigateTo({ url: '/pages/messages/index' });
            }}
            data-testid="btn-messages"
          />
          <Cell
            title='📜 历史战绩'
            onClick={() => {
              Taro.navigateTo({ url: '/pages/history/index' });
            }}
            data-testid="btn-history"
          />
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
    </PageLayout>
  );
};

export default ProfilePage;
