import React, {useCallback, useMemo, useState} from 'react';
import {Input, ScrollView, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro, {useDidShow} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, LoadMore, EmptyState, GameCard, TabHeader} from '../../components';
import {useLoadMore} from '../../hooks';
import {gameApi} from '../../services/api';
import type {GameResponse} from '../../models/service';
import type {Game} from '../../store/mockData';
import {transformGameListFromApi} from '../../models';
import './index.less';

const GamesPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const {
    joinGame,
    setCurrentGameId
  } = useAppStore();
  const {user} = useAuthStore();

  const [searchText, setSearchText] = useState('');

  // 使用 useLoadMore 管理游戏列表数据
  const {
    data: rawGames,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
  } = useLoadMore<GameResponse>(
    async ({page, pageSize}) => gameApi.getGames({page, pageSize}),
    {
      defaultCurrent: 1,
      defaultPageSize: 10,
      autoLoad: true,
    }
  );

  // 将 API 返回的数据转换为前端 Game 格式
  const allGames = useMemo((): Game[] => {
    return transformGameListFromApi(rawGames);
  }, [rawGames]);

  // 页面显示时刷新数据
  useDidShow(() => {
    refresh();
  });

  const handleEnterGame = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({url: `/pages/game-detail/index?gameId=${gameId}`});
  }, [setCurrentGameId]);

  const currentUser = user;

  // 创建即进行中，接口已排除已结束的游戏，这里只按搜索词过滤
  const filteredGames = useMemo(() => {
    if (!searchText) return allGames;
    return allGames.filter(g => g.name.includes(searchText));
  }, [allGames, searchText]);

  const handleJoinGame = useCallback(async (gameId: string) => {
    if (!currentUser) return;
    try {
      await joinGame(gameId, currentUser.id);
      Toast.show('games-toast', {content: '加入成功'});
      // 刷新游戏列表
      await refresh();
    } catch (error: any) {
      Toast.show('games-toast', {content: error.message || '加入失败'});
    }
  }, [currentUser, joinGame, refresh]);

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

  // 游戏卡片点击事件
  const handleGameCardClick = useCallback((game: Game) => {
    const hasJoined = game.isJoined;

    if (hasJoined) {
      handleEnterGame(game.id);
    }
  }, [currentUser, handleEnterGame]);

  // 游戏按钮点击事件
  const handleGameButtonClick = useCallback((e: any, game: Game) => {
    const hasJoined = game.isJoined;
    const isJoinButton = !hasJoined;

    console.log('game----->', game)

    if (isJoinButton) {
      handleJoinGame(game.id);
      e.preventDefault();
      e.stopPropagation();
    } else {
      handleEnterGame(game.id);
    }
  }, [currentUser, handleJoinGame, handleEnterGame]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View/>;
  }

  return (
    <View className='games-page'>
      <Toast id="games-toast"/>
      <TabHeader
        title='Call游戏管理'
        actions={
          <Button
            type='primary'
            size='small'
            onClick={() => Taro.navigateTo({url: '/pages/create-game/index'})}
            data-testid="btn-create-game"
          >
            +创建游戏
          </Button>
        }
      />

      <View className='search-box'>
        <Input
          className='search-input'
          placeholder='搜索游戏名称...'
          value={searchText}
          onInput={(e) => setSearchText(e.detail.value)}
          data-testid="input-search"
        />
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
        <View className='section'>
          {filteredGames.map((game) => {
            const hasJoined = game.isJoined;
            const isCreator = game.creatorId === currentUser.id;

            return (
              <GameCard
                key={game.id}
                name={game.name}
                creatorName={game.creatorName}
                participantCount={game.participantCount}
                isJoined={hasJoined}
                isCreator={isCreator}
                createdAt={game.createdAt}
                onClick={() => handleGameCardClick(game)}
                onButtonClick={(e) => handleGameButtonClick(e, game)}
                testId={`btn-game-action-${game.id}`}
              />
            );
          })}
        </View>

        {/* 加载更多 */}
        <LoadMore
          hasMore={hasMore}
          loading={loading}
        />

        {/* 空状态 */}
        {filteredGames.length === 0 && !loading && (
          <EmptyState
            text='暂无相关游戏'
          />
        )}
      </ScrollView>
    </View>
  );
};

export default GamesPage;
