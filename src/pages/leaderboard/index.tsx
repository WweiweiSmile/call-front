import React, {useEffect, useState, useRef, useCallback} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import Taro, {useRouter} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import './index.less';

// 轮询间隔（毫秒）
const POLLING_INTERVAL = 3000;

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleBack = () => {
    Taro.navigateBack();
  };

  // 加载数据的函数
  const loadData = useCallback(async (showLoading = true) => {
    if (gameId && authState.user) {
      await loadGameParticipantBalances(gameId);
      if (showLoading) {
        setIsLoading(false);
      }
      setLastUpdated(new Date());
    }
  }, [gameId, authState.user, loadGameParticipantBalances]);

  // 初始加载和设置轮询
  useEffect(() => {
    if (!gameId || !authState.user) {
      return;
    }

    // 初始加载
    loadData(true);

    // 设置轮询定时器（等待初始加载完成后开始）
    const startPolling = () => {
      pollingTimerRef.current = setInterval(() => {
        loadData(false);
      }, POLLING_INTERVAL);
    };

    // 延迟一点开始轮询，确保初始加载完成
    const delayTimer = setTimeout(startPolling, 500);

    // 清理定时器
    return () => {
      clearTimeout(delayTimer);
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [gameId, authState.user?.id, loadData]);

  useEffect(() => {
    if (gameId && !isLoading) {
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
        .sort((a, b) => a.netScore - b.netScore);

      setLeaderboard(leaderboardData);
    }
  }, [gameId, isLoading, getGameParticipantBalances, getGameParticipants, lastUpdated]);

  // 格式化最后更新时间
  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const hours = lastUpdated.getHours().toString().padStart(2, '0');
    const minutes = lastUpdated.getMinutes().toString().padStart(2, '0');
    const seconds = lastUpdated.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

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
          {lastUpdated && (
            <Text className='update-time'>更新于 {formatLastUpdated()}</Text>
          )}
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
