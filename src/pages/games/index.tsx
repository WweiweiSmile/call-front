import React, { useState, useEffect } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import './index.less';

const GamesPage: React.FC = () => {
  const {
    getOngoingGames, getPendingGames, joinGame, getCurrentUser, setCurrentGameId, loadGames } = useAppStore();

  // 页面加载时获取游戏列表，并定期刷新
  useEffect(() => {
    loadGames();
    // 每30秒刷新一次游戏列表
    const interval = setInterval(() => {
      loadGames();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadGames]);
  const [searchText, setSearchText] = useState('');

  const handleEnterGame = (gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({ url: `/pages/game-detail/index?gameId=${gameId}` });
  };

  const ongoingGames = getOngoingGames();
  const pendingGames = getPendingGames();
  const currentUser = getCurrentUser();

  const filteredOngoingGames = ongoingGames.filter((g) =>
    g.name.includes(searchText));
  const filteredPendingGames = pendingGames.filter((g) =>
    g.name.includes(searchText));

  const handleJoinGame = (gameId: string) => {
    joinGame(gameId);
  };

  return (
    <View className='games-page'>
      <View className='header'>
        <Text className='title'>Call游戏管理</Text>
        <Button
          type='primary'
          size='small'
          onClick={() => Taro.navigateTo({ url: '/pages/create-game/index' })}
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
        />
      </View>

      <ScrollView className='content' scrollY>
        {filteredOngoingGames.length > 0 && (
        <View className='section'>
          <Text className='section-title'>🔥 进行中的游戏</Text>
          {filteredOngoingGames.map((game) => (
            <View
              key={game.id}
              className='game-card'
              onClick={() => handleEnterGame(game.id)}
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
                type='primary'
                size='small'
                onClick={(e) => {
                  e.stopPropagation();
                  handleJoinGame(game.id);
                }}
              >
                {game.creatorId === currentUser.id ? '管理 →' : '立即加入 →'}
              </Button>
            </View>
          ))}
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
