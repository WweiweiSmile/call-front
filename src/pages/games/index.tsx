import React, {useCallback, useMemo, useState} from 'react';
import {Input, ScrollView, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro, {useDidShow} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, FilterTabs, LoadMore, EmptyState, GameCard} from '../../components';
import {useLoadMore} from '../../hooks';
import {gameApi} from '../../services/api';
import type {GameResponse} from '../../models/service';
import type {Game} from '../../store/mockData';
import {transformGameListFromApi} from '../../models';
import './index.less';

type FilterType = 'all' | 'joined' | 'created' | 'recent';

interface GamesFilterParams {
  status?: string;
  filterType?: FilterType;
}

const FILTER_TABS = [
  { value: 'all', label: '全部' },
  { value: 'joined', label: '我参与的' },
  { value: 'created', label: '我创建的' },
  { value: 'recent', label: '最近玩过' },
];

const GamesPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const {
    joinGame,
    setCurrentGameId
  } = useAppStore();
  const {user} = useAuthStore();

  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  // 使用 useLoadMore 管理游戏列表数据
  const {
    data: rawGames,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
    setParams,
  } = useLoadMore<GameResponse, GamesFilterParams>(
    async (params) => {
      let response;
      const {page, pageSize, filterType: ft} = params;

      switch (ft) {
        case 'joined':
          response = await gameApi.getMyGames({page, pageSize});
          break;
        case 'created':
          response = await gameApi.getCreatedGames({page, pageSize});
          break;
        case 'recent':
          response = await gameApi.getMyGames({page, pageSize});
          break;
        case 'all':
        default:
          response = await gameApi.getGames({page, pageSize});
          break;
      }
      return response;
    },
    {
      defaultCurrent: 1,
      defaultPageSize: 10,
      defaultParams: {filterType: 'all'},
      autoLoad: true,
    }
  );

  // 将 API 返回的数据转换为前端 Game 格式
  const allGames = useMemo((): Game[] => {
    return transformGameListFromApi(rawGames);
  }, [rawGames]);

  // filterType 变化时更新参数
  React.useEffect(() => {
    setParams({filterType});
  }, [filterType, setParams]);

  // 页面显示时刷新数据
  useDidShow(() => {
    refresh();
  });

  const handleEnterGame = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({url: `/pages/game-detail/index?gameId=${gameId}`});
  }, [setCurrentGameId]);

  const ongoingGames = useMemo(() => {
    const now = new Date();
    return allGames.filter((g) => {
      if (g.status === 'ongoing') return true;
      if (g.status === 'pending' && g.startTime) {
        try {
          const startTime = new Date(g.startTime);
          return startTime <= now;
        } catch {
          return false;
        }
      }
      return false;
    });
  }, [allGames]);

  const pendingGames = useMemo(() => {
    const now = new Date();
    return allGames.filter((g) => {
      if (g.status === 'pending') {
        if (!g.startTime) return true;
        try {
          const startTime = new Date(g.startTime);
          return startTime > now;
        } catch {
          return true;
        }
      }
      return false;
    });
  }, [allGames]);

  const currentUser = user;

  // 获取用户参与的游戏
  const getUserGames = useCallback((currentUserId: string) => {
    return allGames.filter((g) => {
      return g.status === 'ongoing' || g.creatorId === currentUserId;
    });
  }, [allGames]);

  // 获取用户创建的游戏
  const getUserCreatedGames = useCallback((currentUserId: string) => {
    return allGames.filter((g) => g.creatorId === currentUserId);
  }, [allGames]);

  // 获取符合筛选条件的游戏 ID 集合
  const filteredGameIds = useMemo(() => {
    if (!currentUser) return new Set<string>();

    let filtered: Game[] = allGames;

    // 应用筛选类型
    switch (filterType) {
      case 'joined':
        filtered = getUserGames(currentUser.id);
        break;
      case 'created':
        filtered = getUserCreatedGames(currentUser.id);
        break;
      case 'recent':
        filtered = getUserGames(currentUser.id);
        break;
      case 'all':
      default:
        break;
    }

    // 应用搜索文本过滤
    if (searchText) {
      filtered = filtered.filter(g => g.name.includes(searchText));
    }

    return new Set(filtered.map(g => g.id));
  }, [filterType, searchText, currentUser, allGames, getUserGames, getUserCreatedGames]);

  // 对 ongoing 和 pending 分别应用筛选
  const filteredOngoingGames = useMemo(() => {
    if (filterType === 'all' && !searchText) return ongoingGames;
    return ongoingGames.filter(g => filteredGameIds.has(g.id));
  }, [ongoingGames, filteredGameIds, filterType, searchText]);

  const filteredPendingGames = useMemo(() => {
    if (filterType === 'all' && !searchText) return pendingGames;
    return pendingGames.filter(g => filteredGameIds.has(g.id));
  }, [pendingGames, filteredGameIds, filterType, searchText]);

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
      <View className='header'>
        <Text className='title'>Call游戏管理</Text>
        <Button
          type='primary'
          size='small'
          onClick={() => Taro.navigateTo({url: '/pages/create-game/index'})}
          data-testid="btn-create-game"
        >
          +创建游戏
        </Button>
      </View>

      <View className='search-box'>
        <Input
          className='search-input'
          placeholder='搜索游戏名称...'
          value={searchText}
          onInput={(e) => setSearchText(e.detail.value)}
          data-testid="input-search"
        />
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
        {filteredOngoingGames.length > 0 && (
          <View className='section'>
            <Text className='section-title'>🔥 进行中的游戏</Text>
            {filteredOngoingGames.map((game) => {
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
                  onClick={() => handleGameCardClick(game)}
                  onButtonClick={(e) => handleGameButtonClick(e, game)}
                  testId={`btn-game-action-${game.id}`}
                />
              );
            })}
          </View>
        )}

        {filteredPendingGames.length > 0 && (
          <View className='section'>
            <Text className='section-title'>⏰ 即将开始的游戏</Text>
            {filteredPendingGames.map((game) => (
              <GameCard
                key={game.id}
                name={game.name}
                creatorName={game.creatorName}
                startTime={game.startTime}
                buttonText='预约提醒'
                buttonType='default'
                onButtonClick={() => handleJoinGame(game.id)}
                testId={`btn-reserve-${game.id}`}
              />
            ))}
          </View>
        )}

        {/* 加载更多 */}
        <LoadMore
          hasMore={hasMore}
          loading={loading}
        />

        {/* 空状态 */}
        {filteredOngoingGames.length === 0 && filteredPendingGames.length === 0 && !loading && (
          <EmptyState
            text='暂无相关游戏'
          />
        )}
      </ScrollView>
    </View>
  );
};

export default GamesPage;
