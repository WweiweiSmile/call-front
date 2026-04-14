import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import type { Game } from '../../store/mockData';
import './index.less';

type FilterType = 'all' | 'ongoing' | 'ended' | 'recent';

const MyGamesPage: React.FC = () => {
  const {
    state,
    getUserBalance,
    setCurrentGameId,
    loadMyGames,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  const [filterType, setFilterType] = useState<FilterType>('all');

  // 页面加载时获取我的游戏列表，tab 切换时也重新加载
  useEffect(() => {
    const statusParam = filterType === 'all' ? undefined : filterType;
    loadMyGames(statusParam);
  }, [loadMyGames, filterType]);

  const currentUser = authState.user;

  if (!currentUser) {
    return null;
  }

  // 直接使用 store 中的 games 数据（已经是后端过滤后的）
  const games = state.games;

  const handleEnterGame = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({ url: `/pages/game-detail/index?gameId=${gameId}` });
  }, [setCurrentGameId]);

  const renderGameCard = useCallback((game: Game) => {
    const balance = getUserBalance(game.id, currentUser.id);
    const isCreator = game.creatorId === currentUser.id;

    return (
      <View
        key={game.id}
        className='game-card'
        onClick={() => handleEnterGame(game.id)}
        data-testid={`my-game-card-${game.id}`}
      >
        <View className='game-info'>
          <Text className='game-name'>🎮 {game.name}</Text>
          <Text className='game-creator'>
            👤 {isCreator ? '我创建的' : `创建者: ${game.creatorName}`}
          </Text>
          {balance && (
          <View className='balance-section'>
            <Text className='balance'>当前余额: {balance.currentBalance.toLocaleString()}</Text>
            <View
              className={`balance-status ${balance.isBalanced ? 'balanced' : 'unbalanced'}`}
            >
              {balance.isBalanced ? '✓ 平衡' : '⚠ 不平衡'}
            </View>
          </View>
          )}
          {!balance && isCreator && (
          <Text className='participants'>
            当前人数: {game.participantCount}人
          </Text>
          )}
        </View>
        <Button type='primary' size='small' data-testid={`btn-my-game-enter-${game.id}`}>
          {isCreator ? '管理 →' : '进入 →'}
        </Button>
      </View>
    );
  }, [currentUser.id, getUserBalance, handleEnterGame]);

  // 切换筛选标签
  const handleFilterChange = useCallback((type: FilterType) => {
    setFilterType(type);
  }, []);

  return (
    <View className='my-games-page'>
      <View className='header'>
        <Text className='title'>我的场次</Text>
      </View>

      {/* 筛选标签 */}
      <View className='filter-tabs'>
        <View
          className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          全部
        </View>
        <View
          className={`filter-tab ${filterType === 'ongoing' ? 'active' : ''}`}
          onClick={() => handleFilterChange('ongoing')}
        >
          进行中
        </View>
        <View
          className={`filter-tab ${filterType === 'ended' ? 'active' : ''}`}
          onClick={() => handleFilterChange('ended')}
        >
          已结束
        </View>
        <View
          className={`filter-tab ${filterType === 'recent' ? 'active' : ''}`}
          onClick={() => handleFilterChange('recent')}
        >
          最近玩过
        </View>
      </View>

      <ScrollView className='content' scrollY>
        {games.length > 0 ? (
          games.map(renderGameCard)
        ) : (
          <View className='empty-state'>
            <Text className='empty-text'>暂无相关场次</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default MyGamesPage;
