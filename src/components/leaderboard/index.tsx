import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro, { useRouter } from '@tarojs/taro';
import { useAppStore } from '../../store';
import './index.less';

interface LeaderboardItem {
  userId: string;
  name: string;
  depositTotal: number;
  withdrawTotal: number;
  netScore: number;
}

const LeaderboardPage: React.FC = () => {
  const router = useRouter();
  const { getGameParticipantBalances, getGameParticipants } = useAppStore();
  
  const gameId = router.params?.gameId as string;
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);

  useEffect(() => {
    if (gameId) {
      // 计算排行榜数据
      const participantBalances = getGameParticipantBalances(gameId);
      const participants = getGameParticipants(gameId);
      
      const leaderboardData = participantBalances
        .map((pb) => {
          const participant = participants.find((p) => p.id === pb.userId);
          const netScore = pb.depositTotal - pb.withdrawTotal;
          const userName = (pb as any)?.userName || participant?.name || '未知用户';
          return {
            userId: pb.userId,
            name: userName,
            depositTotal: pb.depositTotal,
            withdrawTotal: pb.withdrawTotal,
            netScore,
          };
        })
        .sort((a, b) => a.netScore - b.netScore); // 按净分从小到大排序
      
      setLeaderboard(leaderboardData);
    }
  }, [gameId, getGameParticipantBalances, getGameParticipants]);

  const handleBack = () => {
    Taro.navigateBack();
  };

  return (
    <View className='leaderboard-page'>
      <View className='header'>
        <View className='header-left' onClick={handleBack}>
          <Text className='back-icon'>←</Text>
        </View>
        <View className='header-center'>
          <Text className='title'>🏆 排行榜</Text>
        </View>
        <View className='header-right' />
      </View>

      <ScrollView className='content' scrollY>
        {leaderboard.length > 0 ? (
          leaderboard.map((item, index) => (
            <View key={item.userId} className='leaderboard-card'>
              <View className='card-left'>
                <Text className='rank'>{index + 1}</Text>
                <View className='user-info'>
                  <Text className='name'>{item.name}</Text>
                </View>
              </View>
              <View className='card-right'>
                <View className='stat'>
                  <Text className='stat-label'>存分</Text>
                  <Text className='stat-value'>{item.depositTotal.toLocaleString()}</Text>
                </View>
                <View className='stat'>
                  <Text className='stat-label'>取分</Text>
                  <Text className='stat-value'>{item.withdrawTotal.toLocaleString()}</Text>
                </View>
                <View className='stat'>
                  <Text className='stat-label'>净分</Text>
                  <Text className={`stat-value ${item.netScore >= 0 ? 'positive' : 'negative'}`}>
                    {item.netScore >= 0 ? '+' : ''}{item.netScore.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View className='empty-state'>
            <Text>暂无排行榜数据</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LeaderboardPage;
