import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import { useLoadMore } from '../../hooks';
import { gameApi } from '../../services/api';
import type { GameResponse } from '../../models/service';
import type { Game } from '../../store/mockData';
import './index.less';

type FilterType = 'all' | 'ongoing' | 'ended' | 'recent';

interface MyGamesFilterParams {
  status?: string;
}

const MyGamesPage: React.FC = () => {
  const {
    getUserBalance,
    setCurrentGameId,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  const [filterType, setFilterType] = useState<FilterType>('all');

  // 使用 useLoadMore 管理我的游戏列表数据
  const {
    data: rawGames,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
    setParams,
  } = useLoadMore<GameResponse, MyGamesFilterParams>(
    async (params) => {
      const { page, pageSize, status } = params;
      return await gameApi.getMyGames({ page, pageSize, status });
    },
    {
      defaultCurrent: 1,
      defaultPageSize: 10,
      defaultParams: { status: undefined },
      autoLoad: true,
    }
  );

  // 将 API 返回的数据转换为前端 Game 格式
  const games = useMemo((): Game[] => {
    return rawGames.map((g) => ({
      id: String(g.id),
      name: g.name,
      creatorId: String(g.creatorId),
      creatorName: g.creatorName || '创建者',
      status: g.status as 'pending' | 'ongoing' | 'ended',
      participantCount: g.playerCount,
      description: g.description,
      startTime: g.startTime,
      endTime: g.endTime,
      isJoined: g.isJoined,
    }));
  }, [rawGames]);

  // filterType 变化时更新参数并刷新
  useEffect(() => {
    const statusParam = filterType === 'all' || filterType === 'recent' ? undefined : filterType;
    setParams({ status: statusParam });
  }, [filterType, setParams]);

  const currentUser = authState.user;

  if (!currentUser) {
    return null;
  }

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

  // 下拉刷新
  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // 上滑加载更多
  const handleScrollToLower = useCallback(() => {
    if (hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

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

      <ScrollView
        className='content'
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleScrollToLower}
        lowerThreshold={100}
      >
        {games.length > 0 ? (
          <>
            {games.map(renderGameCard)}

            {/* 加载更多提示 */}
            {hasMore && (
              <View className='load-more'>
                <Text className='load-more-text'>
                  {loading ? '加载中...' : '上拉加载更多'}
                </Text>
              </View>
            )}

            {/* 没有更多数据 */}
            {!hasMore && games.length > 0 && (
              <View className='load-more'>
                <Text className='load-more-text'>没有更多数据了</Text>
              </View>
            )}
          </>
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
