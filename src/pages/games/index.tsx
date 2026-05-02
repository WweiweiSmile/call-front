import React, {useCallback, useMemo, useState} from 'react';
import {Input, ScrollView, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth} from '../../components/RequireAuth';
import {useLoadMore} from '../../hooks';
import {gameApi} from '../../services/api';
import type {GameResponse} from '../../models/service';
import type {Game} from '../../store/mockData';
import './index.less';

type FilterType = 'all' | 'joined' | 'created' | 'recent';

interface GamesFilterParams {
  status?: string;
  filterType?: FilterType;
}

const GamesPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const {
    joinGame,
    setCurrentGameId
  } = useAppStore();
  const {state: authState} = useAuthStore();

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

  // filterType 变化时更新参数
  React.useEffect(() => {
    setParams({filterType});
  }, [filterType, setParams]);

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

  const currentUser = authState.user;

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
    const isCreator = game.creatorId === (currentUser?.id || '');
    const isJoinButton = !hasJoined && !isCreator;

    if (!isJoinButton) {
      handleEnterGame(game.id);
    }
  }, [currentUser, handleEnterGame]);

  // 游戏按钮点击事件
  const handleGameButtonClick = useCallback((e: any, game: Game) => {
    e.stopPropagation();
    const hasJoined = game.isJoined;
    const isCreator = game.creatorId === (currentUser?.id || '');
    const isJoinButton = !hasJoined && !isCreator;

    if (isJoinButton) {
      handleJoinGame(game.id);
    } else {
      handleEnterGame(game.id);
    }
  }, [currentUser, handleJoinGame, handleEnterGame]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !currentUser) {
    return <View />;
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
      <View className='filter-tabs'>
        <View
          className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          全部
        </View>
        <View
          className={`filter-tab ${filterType === 'joined' ? 'active' : ''}`}
          onClick={() => handleFilterChange('joined')}
        >
          我参与的
        </View>
        <View
          className={`filter-tab ${filterType === 'created' ? 'active' : ''}`}
          onClick={() => handleFilterChange('created')}
        >
          我创建的
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
        {filteredOngoingGames.length > 0 && (
          <View className='section'>
            <Text className='section-title'>🔥 进行中的游戏</Text>
            {filteredOngoingGames.map((game) => {
              const hasJoined = game.isJoined;
              const isCreator = game.creatorId === currentUser.id;

              return (
                <View
                  key={game.id}
                  className={`game-card ${!hasJoined && !isCreator ? 'not-joined' : ''}`}
                  onClick={() => handleGameCardClick(game)}
                >
                  <View className='game-info'>
                    <Text className='game-name'>🎮 {game.name}</Text>
                    <Text className='game-creator'>
                      👤 创建者: {game.creatorName}
                    </Text>
                    <Text className='game-participants'>
                      参与人数: {game.participantCount}人
                    </Text>
                  </View>
                  <Button
                    type={hasJoined ? 'primary' : 'success'}
                    size='small'
                    onClick={(e) => handleGameButtonClick(e, game)}
                    data-testid={`btn-game-action-${game.id}`}
                  >
                    {isCreator
                      ? (hasJoined ? '管理 →' : '加入游戏 →')
                      : (hasJoined ? '进入 →' : '立即加入 →')}
                  </Button>
                </View>
              );
            })}
          </View>
        )}

        {filteredPendingGames.length > 0 && (
          <View className='section'>
            <Text className='section-title'>⏰ 即将开始的游戏</Text>
            {filteredPendingGames.map((game) => (
              <View key={game.id} className='game-card'>
                <View className='game-info'>
                  <Text className='game-name'>🎮 {game.name}</Text>
                  <Text className='game-creator'>
                    👤 创建者: {game.creatorName}
                  </Text>
                  {game.startTime && (
                    <Text className='game-time'>
                      开始时间: {game.startTime}
                    </Text>
                  )}
                </View>
                <Button
                  type='default'
                  size='small'
                  onClick={() => handleJoinGame(game.id)}
                  data-testid={`btn-reserve-${game.id}`}
                >
                  预约提醒
                </Button>
              </View>
            ))}
          </View>
        )}

        {/* 加载更多提示 */}
        {hasMore && (
          <View className='load-more'>
            <Text className='load-more-text'>
              {loading ? '加载中...' : '上拉加载更多'}
            </Text>
          </View>
        )}

        {/* 没有更多数据 */}
        {!hasMore && allGames.length > 0 && (
          <View className='load-more'>
            <Text className='load-more-text'>没有更多数据了</Text>
          </View>
        )}

        {/* 空状态 */}
        {filteredOngoingGames.length === 0 && filteredPendingGames.length === 0 && !loading && (
          <View className='empty-state'>
            <Text className='empty-text'>暂无相关游戏</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default GamesPage;
