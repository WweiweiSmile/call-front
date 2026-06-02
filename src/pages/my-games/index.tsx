import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import { useRequireAuth, FilterTabs, LoadMore, EmptyState, GameCard } from '../../components';
import { useLoadMore } from '../../hooks';
import { gameApi } from '../../services/api';
import type { GameResponse } from '../../models/service';
import type { Game } from '../../store/mockData';
import { transformGameListFromApi } from '../../models';
import './index.less';

type FilterType = 'all' | 'ongoing' | 'ended' | 'recent';

interface MyGamesFilterParams {
  status?: string;
}

const FILTER_TABS = [
  { value: 'all', label: '全部' },
  { value: 'ongoing', label: '进行中' },
  { value: 'ended', label: '已结束' },
  { value: 'recent', label: '最近玩过' },
];

const MyGamesPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
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
    return transformGameListFromApi(rawGames);
  }, [rawGames]);

  // filterType 变化时更新参数并刷新
  useEffect(() => {
    const statusParam = filterType === 'all' || filterType === 'recent' ? undefined : filterType;
    setParams({ status: statusParam });
  }, [filterType, setParams]);

  // 页面显示时刷新数据
  useDidShow(() => {
    refresh();
  });

  const currentUser = authState.user;

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View />;
  }

  const handleEnterGame = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({ url: `/pages/game-detail/index?gameId=${gameId}` });
  }, [setCurrentGameId]);

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
        <View
          className='history-btn'
          onClick={() => Taro.navigateTo({ url: '/pages/history/index' })}
          data-testid="btn-my-games-history"
        >
          <Text className='history-icon'>📜</Text>
        </View>
      </View>

      {/* 筛选标签 */}
      <FilterTabs
        tabs={FILTER_TABS}
        activeValue={filterType}
        onChange={handleFilterChange}
      />

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
            {games.map((game) => {
              const balance = getUserBalance(game.id, currentUser.id);
              const isCreator = game.creatorId === currentUser.id;

              return (
                <GameCard
                  key={game.id}
                  name={game.name}
                  creatorName={game.creatorName}
                  participantCount={!balance && isCreator ? game.participantCount : undefined}
                  isJoined
                  isCreator={isCreator}
                  balance={balance ? {
                    currentBalance: balance.currentBalance,
                    isBalanced: balance.isBalanced,
                  } : null}
                  onClick={() => handleEnterGame(game.id)}
                  testId={`my-game-card-${game.id}`}
                />
              );
            })}

            {/* 加载更多 */}
            <LoadMore
              hasMore={hasMore}
              loading={loading}
            />
          </>
        ) : (
          <EmptyState
            text='暂无相关场次'
          />
        )}
      </ScrollView>
    </View>
  );
};

export default MyGamesPage;
