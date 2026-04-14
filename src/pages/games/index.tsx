import React, {useEffect, useState, useMemo, useCallback} from 'react';
import {Input, ScrollView, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import type { Game } from '../../store/mockData';
import './index.less';

type FilterType = 'all' | 'joined' | 'created' | 'recent';

const GamesPage: React.FC = () => {
  const {
    getOngoingGames, getPendingGames, getGames, getUserGames, getUserCreatedGames, joinGame,
    setCurrentGameId, loadGames
  } = useAppStore();
  const {state: authState} = useAuthStore();

  // 页面加载时调用接口，并设置定时器
  useEffect(() => {
    // 初始加载游戏列表
    loadGames();

    // 每30秒刷新一次游戏列表
    const interval = setInterval(() => {
      loadGames();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadGames]);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const handleEnterGame = useCallback((gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({url: `/pages/game-detail/index?gameId=${gameId}`});
  }, [setCurrentGameId]);

  const allGames = useMemo(() => getGames(), [getGames]);
  const ongoingGames = useMemo(() => getOngoingGames(), [getOngoingGames]);
  const pendingGames = useMemo(() => getPendingGames(), [getPendingGames]);
  const currentUser = authState.user;

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
        // 最近玩过的游戏 - 这里简化处理，实际可以根据参与时间排序
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
      await loadGames();
    } catch (error: any) {
      Toast.show('games-toast', {content: error.message || '加入失败'});
    }
  }, [currentUser, joinGame, loadGames]);

  // 切换筛选标签
  const handleFilterChange = useCallback((type: FilterType) => {
    setFilterType(type);
  }, []);

  if (!currentUser) {
    return null;
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

      <ScrollView className='content' scrollY>
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
                    onClick={() => {
                      if (hasJoined) {
                        handleEnterGame(game.id);
                      } else {
                        handleJoinGame(game.id);
                      }
                    }}
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
      </ScrollView>
    </View>
  );
};

export default GamesPage;
