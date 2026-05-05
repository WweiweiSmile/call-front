import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import Taro, {useRouter} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth} from '../../components/RequireAuth';
import type {User, UserGameBalance} from '../../store/mockData';
import './index.less';

// 轮询间隔（毫秒）
const POLLING_INTERVAL = 3000;
const POLLING_START_DELAY = 500;

interface LeaderboardItem {
  userId: string;
  name: string;
  depositTotal: number;
  withdrawTotal: number;
  netScore: number;
}

interface LeaderboardItemWithRank extends LeaderboardItem {
  rank: number;
}

const LeaderboardPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();
  const {
    getGameParticipantBalances,
    getGameParticipants,
    loadGameParticipantBalances,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  const gameId = router.params?.gameId as string;
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showPodiumAnimation, setShowPodiumAnimation] = useState(false);
  const pollingTimerRef = useRef<number | null>(null);

  const handleBack = useCallback(() => {
    Taro.navigateBack();
  }, []);

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

    // 使用 setTimeout 链式轮询，避免请求重叠
    const poll = async () => {
      if (!pollingTimerRef.current) return;
      await loadData(false);
      pollingTimerRef.current = setTimeout(poll, POLLING_INTERVAL);
    };

    // 延迟一点开始轮询，确保初始加载完成
    pollingTimerRef.current = setTimeout(poll, POLLING_START_DELAY);

    // 清理定时器
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [gameId, authState.user, loadData]);

  // 当数据加载完成后，触发领奖台动画
  useEffect(() => {
    if (!isLoading && leaderboard && leaderboard.length > 0) {
      setTimeout(() => {
        setShowPodiumAnimation(true);
      }, 50);
      // 兜底方案：即使动画有问题，1秒后也强制显示
      setTimeout(() => {
        setShowPodiumAnimation(true);
      }, 1000);
    }
  }, [isLoading]);

  // 使用 useMemo 计算排行榜数据（只按净分排序）
  const leaderboard = useMemo((): LeaderboardItem[] => {
    if (!gameId || isLoading) {
      return [];
    }

    const participantBalances = getGameParticipantBalances(gameId) || [];
    const participants = getGameParticipants(gameId) || [];

    // 预先构建参与者 Map，避免 O(n*m) 查找
    const participantsMap = new Map<string, User>(
      participants.map(p => [p.id, p])
    );

    return participantBalances
      .map((pb: UserGameBalance & { userName?: string }) => {
        const participant = participantsMap.get(pb.userId);
        const netScore = pb.depositTotal - pb.withdrawTotal;
        const userName = pb.userName || participant?.name || '未知用户';
        return {
          userId: pb.userId,
          name: userName,
          depositTotal: pb.depositTotal,
          withdrawTotal: pb.withdrawTotal,
          netScore,
        };
      })
      .sort((a, b) => {
        // 判断是否有存分或取分操作
        const aHasActivity = a.depositTotal > 0 || a.withdrawTotal > 0;
        const bHasActivity = b.depositTotal > 0 || b.withdrawTotal > 0;

        // 如果一个有操作一个没有，有操作的排前面
        if (aHasActivity && !bHasActivity) return -1;
        if (!aHasActivity && bHasActivity) return 1;

        // 都有操作或都没有操作时，按净分从大到小排序
        return b.netScore - a.netScore;
      });
  }, [gameId, isLoading, lastUpdated, getGameParticipantBalances, getGameParticipants]);


  // 获取前三名用于领奖台展示
  const topThree = useMemo((): LeaderboardItemWithRank[] => {
    if (!leaderboard || leaderboard.length < 1) return [];
    // 注意：领奖台排序是 2, 1, 3 的视觉顺序
    const result: LeaderboardItemWithRank[] = [];

    // 始终添加第一名
    if (leaderboard.length >= 1) {
      // 如果有第二名，先添加第二名
      if (leaderboard.length >= 2) {
        result.push({...leaderboard[1], rank: 2});
      }
      // 添加第一名（冠军）
      result.push({...leaderboard[0], rank: 1});
      // 如果有第三名，添加第三名
      if (leaderboard.length >= 3) {
        result.push({...leaderboard[2], rank: 3});
      }
    }

    return result;
  }, [leaderboard]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated) {
    return <View/>;
  }

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
        <View className='header-left' onClick={handleBack} data-testid="btn-leaderboard-back">
          <Text className='back-icon'>←</Text>
        </View>
        <View className='header-center'>
          <Text className='title'>🏆 净分排行榜</Text>
        </View>
        <View className='header-right'/>
      </View>

      <ScrollView className='content' scrollY>
        {/* 领奖台区域 */}
        {topThree.length > 0 && (
          <View className='podium-section'>
            <View className='podium'>
              {topThree.map((item) => {
                const rankClass = item.rank === 1 ? 'first' : item.rank === 2 ? 'second' : 'third';
                const crown = item.rank === 1 ? '👑' : item.rank === 2 ? '🥈' : '🥉';
                return (
                  <View
                    key={item.userId}
                    className={`podium-item ${rankClass} ${showPodiumAnimation ? 'animate-podium-bounce' : ''}`}
                  >
                    <Text className='podium-crown'>{crown}</Text>
                    <Text className='podium-avatar'>👤</Text>
                    <Text className='podium-name'>{item.name}</Text>
                    <Text className='podium-score'>
                      {(item.netScore >= 0 ? '+' : '') + item.netScore.toLocaleString()}
                    </Text>
                    <View className='podium-platform'>
                      <Text>{item.rank}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 排行榜列表 */}
        {leaderboard.length > 0 ? (
          leaderboard.map((item, index) => (
            <View
              key={item.userId}
              className={`leaderboard-card top-${index + 1} ${
                authState.user?.id === item.userId ? 'current-user' : ''
              }`}
            >
              <View className='card-left'>
                <Text className={`rank rank-${index + 1}`}>{index + 1}</Text>
                <View className='user-info'>
                  <Text className='name'>{item.name}</Text>
                  {authState.user?.id === item.userId && (
                    <Text className='self-tag'>我</Text>
                  )}
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
            <Text>( ´･･)ﾉ(._.`)</Text>
            <Text>暂无排行榜数据</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LeaderboardPage;
