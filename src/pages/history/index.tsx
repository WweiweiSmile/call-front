import React, { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import dayjs from 'dayjs';
import { useAuthStore } from '../../store/auth';
import { useRequireAuth, Loading, PageHeader, EmptyState, LoadMore, HistoryGameCard } from '../../components';
import { useLoadMore } from '../../hooks';
import { gameApi } from '../../services/api';
import type { GameResponse } from '../../models/service';
import { transformGameListFromApi } from '../../models';
import './index.less';

interface HistoryGameItem {
  id: string;
  name: string;
  participantCount: number;
  startTime?: string;
  endTime?: string;
  status: string;
  userNetScore?: number;
}

const HistoryPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const { user } = useAuthStore();

  // 使用 useLoadMore 管理历史游戏列表数据
  const {
    data: rawGames,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
  } = useLoadMore<GameResponse, {}>(
    async (params) => {
      const { page, pageSize } = params;
      // 获取已结束的游戏
      return await gameApi.getMyGames({ page, pageSize, status: 'ended' });
    },
    {
      defaultCurrent: 1,
      defaultPageSize: 20,
      autoLoad: true,
    }
  );

  // 转换游戏数据 - 直接使用 API 返回的数据
  const historyGames = useMemo((): HistoryGameItem[] => {
    const games = transformGameListFromApi(rawGames);
    return games.map(game => ({
      id: game.id,
      name: game.name,
      participantCount: game.participantCount,
      startTime: game.startTime,
      endTime: game.endTime,
      status: game.status,
      userNetScore: game.userNetScore,
    }));
  }, [rawGames]);

  // 计算累计输赢
  const totalStats = useMemo(() => {
    let totalNetScore = 0;
    let winCount = 0;
    let loseCount = 0;
    let drawCount = 0;

    historyGames.forEach(game => {
      if (game.userNetScore !== undefined) {
        totalNetScore += game.userNetScore;
        if (game.userNetScore > 0) {
          winCount++;
        } else if (game.userNetScore < 0) {
          loseCount++;
        } else {
          drawCount++;
        }
      }
    });

    return {
      totalNetScore,
      winCount,
      loseCount,
      drawCount,
      totalGames: historyGames.length,
    };
  }, [historyGames]);

  const currentUser = user;

  // 页面显示时刷新数据
  useDidShow(() => {
    refresh();
  });

  // 点击游戏卡片跳转到详情
  const handleGameClick = useCallback((gameId: string) => {
    Taro.navigateTo({ url: `/pages/game-detail/index?gameId=${gameId}` });
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

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View />;
  }

  if (loading) {
    return (
      <View className='history-page'>
        <Loading
          text='加载中'
          subtitle='正在获取历史战绩...'
          fullPage
        />
      </View>
    );
  }

  return (
    <View className='history-page'>
      <PageHeader
        title='历史战绩'
        showBack
        theme='light'
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
        {/* 累计统计卡片 */}
        <View className='stats-card'>
          <Text className='stats-title'>📊 累计输赢</Text>
          <View className='total-score-section'>
            <Text className='total-score-label'>累计净分</Text>
            <Text className={`total-score-value ${totalStats.totalNetScore >= 0 ? 'positive' : 'negative'}`}>
              {totalStats.totalNetScore >= 0 ? '+' : ''}{totalStats.totalNetScore.toLocaleString()}
            </Text>
          </View>
          <View className='stats-grid'>
            <View className='stat-item'>
              <Text className='stat-value'>{totalStats.totalGames}</Text>
              <Text className='stat-label'>总场次</Text>
            </View>
            <View className='stat-item win'>
              <Text className='stat-value'>{totalStats.winCount}</Text>
              <Text className='stat-label'>赢</Text>
            </View>
            <View className='stat-item lose'>
              <Text className='stat-value'>{totalStats.loseCount}</Text>
              <Text className='stat-label'>输</Text>
            </View>
            <View className='stat-item draw'>
              <Text className='stat-value'>{totalStats.drawCount}</Text>
              <Text className='stat-label'>平</Text>
            </View>
          </View>
          {totalStats.totalGames > 0 && (
            <View className='win-rate-section'>
              <Text className='win-rate-label'>胜率</Text>
              <Text className='win-rate-value'>
                {Math.round((totalStats.winCount / totalStats.totalGames) * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* 历史游戏列表 */}
        <View className='history-section'>
          <Text className='section-title'>📜 历史游戏</Text>
          {historyGames.length > 0 ? (
            historyGames.map((game) => (
              <HistoryGameCard
                key={game.id}
                name={game.name}
                participantCount={game.participantCount}
                gameTime={game.startTime ? dayjs(game.startTime).format('YYYY年MM月DD日 HH:mm:ss') : undefined}
                userNetScore={game.userNetScore}
                onClick={() => handleGameClick(game.id)}
                testId={`history-game-card-${game.id}`}
              />
            ))
          ) : (
            <EmptyState
              icon='🎯'
              text='暂无历史战绩'
              subtext='快去参与游戏吧'
              theme='light'
            />
          )}
        </View>

        {/* 加载更多 */}
        <LoadMore
          hasMore={hasMore}
          loading={loading}
          theme='light'
        />

        {/* 只有当没有更多且有数据时才显示没有更多（已在 LoadMore 组件中处理） */}
      </ScrollView>
    </View>
  );
};

export default HistoryPage;
