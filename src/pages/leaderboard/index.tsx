import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import Taro, {useRouter} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
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
  const {
    getGameParticipantBalances,
    getGameParticipants,
    loadGameParticipantBalances,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  const gameId = router.params?.gameId as string;
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleBack = () => {
    Taro.navigateBack();
  };

  useEffect(() => {
    const loadData = async () => {
      if (gameId && authState.user) {
        await loadGameParticipantBalances(gameId);
        setIsLoading(false);
      }
    };
    loadData();
  }, [gameId, authState.user?.id, loadGameParticipantBalances]);

  useEffect(() => {
    if (gameId && !isLoading) {
      const participantBalances = getGameParticipantBalances(gameId);
      const participants = getGameParticipants(gameId);

      const leaderboardData = participantBalances
        .map((pb) => {
          const participant = participants.find((p) => p.id === pb.userId);
          // 净分 = 存分总量 - 取分总量（也就是当前余额）
          const netScore = pb.currentBalance;
          const userName = (pb as any)?.userName || participant?.name || '未知用户';
          return {
            userId: pb.userId,
            name: userName,
            depositTotal: pb.depositTotal,
            withdrawTotal: pb.withdrawTotal,
            netScore,
          };
        })
        .sort((a, b) => b.netScore - a.netScore); // 降序排列，净分高的在前

      setLeaderboard(leaderboardData);
    }
  }, [gameId, isLoading, getGameParticipantBalances, getGameParticipants]);

  if (isLoading) {
    return (
      <View className='leaderboard-page loading-page'>
        <Text>加载中...</Text>
      </View>
    );
  }

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
            <View key={item.userId} className={`leaderboard-card top-${index + 1}`}>
              <View className='card-left'>
                <Text className={`rank rank-${index + 1}`}>{index + 1}</Text>
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
