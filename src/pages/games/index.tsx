import React, { useState, useEffect } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import { Button, Popup, Form, Input as NutInput } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import './index.less';

const GamesPage: React.FC = () => {
  const {
    getOngoingGames, getPendingGames, joinGame, createGame, getCurrentUser, setCurrentGameId, loadGames } = useAppStore();

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
  const [createPopupVisible, setCreatePopupVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '',
  });

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

  const handleCreateGame = () => {
    if (!formData.name.trim()) {
      return;
    }
    createGame({
      name: formData.name,
      description: formData.description,
      startTime: formData.startTime,
      endTime: '',
    });
    setCreatePopupVisible(false);
    setFormData({ name: '', description: '', startTime: '' });
  };

  const handleJoinGame = (gameId: string) => {
    joinGame(gameId);
  };

  const updateFormField = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <View className='games-page'>
      <View className='header'>
        <Text className='title'>Call游戏管理</Text>
        <Button
          type='primary'
          size='small'
          onClick={() => setCreatePopupVisible(true)}
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

      <Popup
        visible={createPopupVisible}
        position='bottom'
        onClose={() => setCreatePopupVisible(false)}
      >
        <View className='create-popup'>
          <Text className='popup-title'>创建游戏</Text>
          
          <Form>
            <Form.Item label='游戏名称'>
              <NutInput
                placeholder='请输入游戏名称'
                value={formData.name}
                onChange={(value) => updateFormField('name', value)}
              />
            </Form.Item>
            <Form.Item label='游戏描述 (选填)'>
              <NutInput
                type='textarea'
                placeholder='请输入游戏描述'
                value={formData.description}
                onChange={(value) => updateFormField('description', value)}
              />
            </Form.Item>
            <Form.Item label='开始时间 (选填)'>
              <NutInput
                placeholder='请输入开始时间'
                value={formData.startTime}
                onChange={(value) => updateFormField('startTime', value)}
              />
            </Form.Item>
          </Form>
          
          <View className='popup-actions'>
            <Button
              type='default'
              onClick={() => setCreatePopupVisible(false)}
            >
              取消
            </Button>
            <Button type='primary' onClick={handleCreateGame}>
              创建游戏
            </Button>
          </View>
        </View>
      </Popup>
    </View>
  );
};

export default GamesPage;
