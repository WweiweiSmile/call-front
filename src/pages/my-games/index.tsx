import React, { useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import './index.less';

const MyGamesPage: React.FC = () => {
  const {
    getUserGames,
    getUserCreatedGames,
    getUserBalance,
    setCurrentGameId,
    loadMyGames,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  // 页面加载时获取我的游戏列表
  useEffect(() => {
    loadMyGames();
  }, [loadMyGames]);

  const currentUser = authState.user;

  if (!currentUser) {
    return null;
  }

  const userGames = getUserGames(currentUser.id);
  const userCreatedGames = getUserCreatedGames(currentUser.id);

  const handleEnterGame = (gameId: string) => {
    setCurrentGameId(gameId);
    Taro.navigateTo({ url: `/pages/game-detail/index?gameId=${gameId}` });
  };

  const renderGameCard = (game: any) => {
    const balance = getUserBalance(game.id, currentUser.id);
    const isCreator = game.creatorId === currentUser.id;

    return (
      <View
        key={game.id}
        className='game-card'
        onClick={() => handleEnterGame(game.id)}
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
        <Button type='primary' size='small'>
          {isCreator ? '管理 →' : '进入 →'}
        </Button>
      </View>
    );
  };

  const ongoingGames = userGames.filter((g) => g.status === 'ongoing');
  const endedGames = userGames.filter((g) => g.status === 'ended');

  return (
    <View className='my-games-page'>
      <View className='header'>
        <Text className='title'>我的场次</Text>
      </View>

      <ScrollView className='content' scrollY>
        {ongoingGames.length > 0 && (
        <View className='section'>
          <Text className='section-title'>🎯 进行中的场次 ({ongoingGames.length})</Text>
          {ongoingGames.map(renderGameCard)}
        </View>
        )}

        {userCreatedGames.length > 0 && (
        <View className='section'>
          <Text className='section-title'>📋 我创建的游戏 ({userCreatedGames.length})</Text>
          {userCreatedGames.map(renderGameCard)}
        </View>
        )}

        {endedGames.length > 0 && (
        <View className='section'>
          <Text className='section-title'>📋 历史场次 ({endedGames.length})</Text>
          {endedGames.map(renderGameCard)}
        </View>
        )}
      </ScrollView>
    </View>
  );
};

export default MyGamesPage;
