import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, Loading, PageHeader, ConfirmDialog} from '../../components';
import type {Game, User as UserType} from '../../store/mockData';
import './index.less';

type ViewMode = 'self' | 'manage';

// 兼容两种 User 类型的接口
interface DisplayUser {
  id: string;
  name: string;
}

const GameDetailPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();
  const {
    state,
    getUserBalance,
    getGameParticipants,
    getGameParticipantBalances,
    getGameTransactions,
    endGame,
    setCurrentGameId,
    loadUserBalance,
    loadGameParticipantBalances,
    loadGameTransactions,
    loadGames,
    loadGame,
    joinGame,
  } = useAppStore();
  const {user} = useAuthStore();

  // 从 URL 参数获取 gameId
  const gameIdFromUrl = router.params?.gameId as string | undefined;
  const gameId = gameIdFromUrl || state.currentGameId || '';
  const currentUser = user;

  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [isLoading, setIsLoading] = useState(true);
  const pollingTimerRef = useRef<number | null>(null);

  // 结束游戏确认弹窗状态
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);

  const inviteGameId = router.params?.inviteGameId as string | undefined;

  // 分享功能
  const handleShare = useCallback(() => {
    // 生成分享链接 - 使用 hash 路由格式
    let shareUrl = '';
    try {
      // 尝试使用 window.location（Web 环境）
      if (typeof window !== 'undefined' && window.location) {
        // 构建 hash 路由格式的链接
        shareUrl = `${window.location.origin}${window.location.pathname}#/pages/game-detail/index?gameId=${gameId}&inviteGameId=${gameId}`;
      } else {
        // 降级方案：构建一个 hash 路由格式的链接
        shareUrl = `#/pages/game-detail/index?gameId=${gameId}&inviteGameId=${gameId}`;
      }
    } catch (e) {
      // 如果获取失败，使用降级方案
      shareUrl = `#/pages/game-detail/index?gameId=${gameId}&inviteGameId=${gameId}`;
    }

    // 复制到剪贴板
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        Toast.show('game-detail-toast', {content: '分享链接已复制'});
      }).catch(() => {
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          Toast.show('game-detail-toast', {content: '分享链接已复制'});
        } catch {
          Toast.show('game-detail-toast', {content: '复制失败，请手动复制链接'});
        }
        document.body.removeChild(textArea);
      });
    } else {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        Toast.show('game-detail-toast', {content: '分享链接已复制'});
      } catch {
        Toast.show('game-detail-toast', {content: '复制失败，请手动复制链接'});
      }
      document.body.removeChild(textArea);
    }
  }, [gameId]);

  // 加载数据的函数
  const loadData = useCallback(async (showLoading = false) => {
    if (!gameId || !currentUser || !gameId.trim()) {
      return;
    }
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setCurrentGameId(gameId);
      // 先查找游戏是否在列表中，如果不在，单独加载游戏详情
      let game = state.games.find((g) => g.id === gameId);
      if (!game) {
        try {
          game = await loadGame(gameId);
        } catch (error) {
          console.error('加载游戏详情失败:', error);
        }
      }
      if (!game) {
        // 如果还是找不到，再尝试加载游戏列表
        await loadGames();
      }
      await loadUserBalance(gameId);
      await loadGameTransactions(gameId);
      await loadGameParticipantBalances(gameId);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [gameId, currentUser, setCurrentGameId, loadGames, loadGame, loadUserBalance, loadGameTransactions, loadGameParticipantBalances, state.games]);

  // 初始加载数据
  useEffect(() => {
    if (gameId && currentUser) {
      loadData(true);
    }
  }, [gameId, currentUser, loadData]);

  // 设置轮询：每隔5秒更新一次数据，只在游戏未结束时轮询
  useEffect(() => {
    if (!gameId || !currentUser || isLoading || isGameEnded) {
      return;
    }

    // 使用 setTimeout 链式轮询
    const poll = async () => {
      if (!pollingTimerRef.current) return;
      await loadData(false);
      pollingTimerRef.current = setTimeout(poll, 5000);
    };

    // 延迟一点开始轮询，确保初始加载完成
    pollingTimerRef.current = setTimeout(poll, 1000);

    // 清理定时器
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [gameId, currentUser, isLoading, isGameEnded, loadData]);

  // 处理邀请链接自动加入游戏
  useEffect(() => {
    const handleInvite = async () => {
      if (inviteGameId && currentUser && !isLoading) {
        const game = state.games.find((g) => g.id === inviteGameId);
        const hasJoined = game?.isJoined;
        const isCreator = game?.creatorId === currentUser.id;

        if (!hasJoined && !isCreator && game) {
          try {
            await joinGame(inviteGameId, currentUser.id);
            Toast.show('game-detail-toast', {content: '成功加入游戏'});
            // 重新加载数据
            await loadGames();
            await loadUserBalance(inviteGameId);
          } catch (error: any) {
            Toast.show('game-detail-toast', {content: error.message || '加入失败'});
          }
        }
      }
    };
    handleInvite();
  }, [inviteGameId, currentUser, isLoading, state.games, joinGame, loadGames, loadUserBalance]);

  // ========== 所有 hooks 必须在任何条件返回之前定义 ==========

  const getDisplayUser = useCallback((): DisplayUser | null => {
    if (viewMode === 'self' && currentUser) {
      return {
        id: currentUser.id,
        name: currentUser.nickname || currentUser.username,
      };
    }
    // 管理模式：不筛选特定用户，展示全部交易记录
    return null;
  }, [viewMode, currentUser]);

  const displayUser = getDisplayUser();
  const balance = (displayUser ? getUserBalance(gameId, displayUser.id) : null) ?? null;
  const transactions = (displayUser ? getGameTransactions(gameId, displayUser.id) : getGameTransactions(gameId)) || [];
  const participants = (getGameParticipants(gameId) || []) as UserType[];

  // 使用 useMemo 计算所有参与者的整体平衡状态
  const overallBalance = useMemo(() => {
    const participantBalances = getGameParticipantBalances(gameId) || [];
    if (participantBalances.length === 0) return null;

    const totalDeposit = participantBalances.reduce((sum, b) => sum + b.depositTotal, 0);
    const totalWithdraw = participantBalances.reduce((sum, b) => sum + b.withdrawTotal, 0);
    const isBalanced = totalDeposit === totalWithdraw;

    return {
      totalDeposit,
      totalWithdraw,
      isBalanced,
      allBalanced: isBalanced,
      participantCount: participantBalances.length,
    };
  }, [gameId, getGameParticipantBalances]);

  // 导航到存分页面
  const navigateToDeposit = useCallback((targetUserId?: string, targetUserName?: string) => {
    const g = state.games.find((g) => g.id === gameId);
    let url = `/pages/score-deposit/index?gameId=${gameId}&viewMode=${viewMode}&gameName=${encodeURIComponent(g?.name || '')}`;
    if (targetUserId) {
      url += `&targetUserId=${targetUserId}`;
    }
    if (targetUserName) {
      url += `&targetUserName=${encodeURIComponent(targetUserName)}`;
    }
    Taro.navigateTo({url});
  }, [gameId, viewMode, state.games]);

  // 导航到取分页面
  const navigateToWithdraw = useCallback((targetUserId?: string, targetUserName?: string) => {
    const g = state.games.find((g) => g.id === gameId);
    let url = `/pages/score-withdraw/index?gameId=${gameId}&viewMode=${viewMode}&gameName=${encodeURIComponent(g?.name || '')}`;
    if (targetUserId) {
      url += `&targetUserId=${targetUserId}`;
    }
    if (targetUserName) {
      url += `&targetUserName=${encodeURIComponent(targetUserName)}`;
    }
    Taro.navigateTo({url});
  }, [gameId, viewMode, state.games]);

  // 切换视图模式
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  // ========== 条件返回从这里开始 ==========

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !gameId || !currentUser) {
    return <View />;
  }

  if (isLoading) {
    return (
      <View className='game-detail-page'>
        <Loading
          text='加载中'
          subtitle='正在获取游戏数据...'
          fullPage
        />
      </View>
    );
  }

  const game = state.games.find((g) => g.id === gameId);
  const isCreator = game?.creatorId === currentUser.id;
  const hasJoined = game?.isJoined || isCreator;
  const isGameEnded = game?.status === 'ended';

  if (!game) {
    return (
      <View className='game-detail-page error-page'>
        <Text>游戏不存在</Text>
        <Button onClick={() => Taro.navigateBack()}>返回</Button>
      </View>
    );
  }

  // 检查权限：只有创建者或已加入的用户才能访问
  if (!isCreator && !hasJoined) {
    Taro.showToast({
      title: '请先加入游戏',
      icon: 'none',
      duration: 2000,
    });
    setTimeout(() => {
      Taro.navigateBack();
    }, 2000);
    return null;
  }

  return (
    <View className='game-detail-page'>
      <Toast id="game-detail-toast"/>
      <PageHeader
        title={game.name}
        subtitle={`👤 ${isCreator ? '我创建的游戏' : `创建者: ${game.creatorName}`}`}
        showBack
        onBack={(e) => {
          e?.stopPropagation?.();
          Taro.redirectTo({url: '/pages/index/index'});
        }}
        rightContent={
          isCreator ? (
            <Text className='share-icon' onClick={handleShare}>分享</Text>
          ) : null
        }
      />

      {isCreator && (
        <View className='mode-switch'>
          <View
            className={`mode-item ${viewMode === 'self' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('self')}
            data-testid="btn-mode-self"
          >
            查看自己
          </View>
          <View
            className={`mode-item ${viewMode === 'manage' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('manage')}
            data-testid="btn-mode-manage"
          >
            管理参与者
          </View>
        </View>
      )}

      {/* 自查看模式：个人余额卡片 */}
      {viewMode === 'self' && balance && (
        <View className='balance-card'>
          <Text className='card-title'>场次积分状态</Text>
          <View className='balance-stats'>
            <View className='stat-item'>
              <Text className='stat-label'>存分总量</Text>
              <Text className='stat-value'>{balance.depositTotal.toLocaleString()}</Text>
            </View>
            <View className='stat-item'>
              <Text className='stat-label'>取分总量</Text>
              <Text className='stat-value'>{balance.withdrawTotal.toLocaleString()}</Text>
            </View>
          </View>
          <View className='current-balance'>
            <Text className='balance-label'>当前余额</Text>
            <Text className='balance-value'>{balance.currentBalance.toLocaleString()}</Text>
          </View>
          <View
            className={`balance-status ${balance.isBalanced ? 'balanced' : 'unbalanced'}`}
          >
            {balance.isBalanced ? '✓ 平衡' : '⚠ 不平衡'}
            <Text className='balance-desc'>
              ({balance.isBalanced ? '存分 - 取分 = 0' : '存分 - 取分 ≠ 0'})
            </Text>
          </View>
        </View>
      )}

      {/* 管理模式：整体概览卡片（上移） */}
      {isCreator && viewMode === 'manage' && overallBalance && (
        <View className='overall-balance-card'>
          <Text className='overall-balance-title'>场次概览</Text>
          <View className='overall-balance-stats'>
            <View className='overall-stat-item'>
              <Text className='overall-stat-label'>总存分</Text>
              <Text className='overall-stat-value'>{overallBalance.totalDeposit.toLocaleString()}</Text>
            </View>
            <View className='overall-stat-item'>
              <Text className='overall-stat-label'>总取分</Text>
              <Text className='overall-stat-value'>{overallBalance.totalWithdraw.toLocaleString()}</Text>
            </View>
            <View className='overall-stat-item'>
              <Text className='overall-stat-label'>参与人数</Text>
              <Text className='overall-stat-value'>{overallBalance.participantCount}人</Text>
            </View>
          </View>
          <View
            className={`overall-balance-status ${overallBalance.allBalanced ? 'balanced' : 'unbalanced'}`}
          >
            {overallBalance.allBalanced ? '✓ 所有人平衡' : '⚠ 有人不平衡'}
            <Text className='overall-balance-desc'>
              ({overallBalance.allBalanced ? '总存分 - 总取分 = 0' : '总存分 - 总取分 ≠ 0'})
            </Text>
          </View>
        </View>
      )}

      {/* 管理参与者列表 */}
      {isCreator && viewMode === 'manage' && (
        <View className='participants-section'>
          <Text className='section-title'>参与者列表</Text>
          {participants.map((participant) => {
            const pBalance = participant ? getUserBalance(gameId, participant.id) : null;
            return (
              <View
                key={participant?.id || Math.random().toString()}
                className='participant-card'
              >
                <View className='participant-info'>
                  <Text className='participant-name'>👤 {participant?.name || '未知用户'}</Text>
                  {pBalance && (
                    <View className='participant-balance'>
                      <Text>余额：{pBalance.currentBalance.toLocaleString()}</Text>
                      <View
                        className={`balance-status-small ${pBalance.isBalanced ? 'balanced' : 'unbalanced'}`}
                      >
                        {pBalance.isBalanced ? '平衡' : '不平衡'}
                      </View>
                    </View>
                  )}
                </View>
                {!isGameEnded && (
                  <View className='participant-actions'>
                    <Button
                      type='success'
                      size='small'
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToDeposit(participant?.id, participant?.name);
                      }}
                      data-testid={`btn-deposit-${participant?.id}`}
                    >
                      💰 存分
                    </Button>
                    <Button
                      type='warning'
                      size='small'
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToWithdraw(participant?.id, participant?.name);
                      }}
                      data-testid={`btn-withdraw-${participant?.id}`}
                    >
                      💵 取分
                    </Button>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* 管理模式下的操作按钮组 */}
      {isCreator && viewMode === 'manage' && (
        <>
          {/* 去排行榜按钮 */}
          <View className='leaderboard-button-section'>
            <Button
              type='primary'
              size='large'
              block
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/leaderboard/index?gameId=${gameId}`,
                });
              }}
              data-testid="btn-view-leaderboard"
            >
              🏆 查看排行榜
            </Button>
          </View>

          {/* 结束游戏按钮（仅创建者在管理模式下且游戏未结束可见） */}
          {game?.status !== 'ended' && (
            <View className='end-game-section'>
              <Button
                type='danger'
                size='large'
                block
                onClick={() => setShowEndGameConfirm(true)}
                data-testid="btn-end-game"
              >
                结束游戏
              </Button>
            </View>
          )}
        </>
      )}

      {/* 查看自己模式下的排行榜按钮 */}
      {(!isCreator || viewMode === 'self') && (
        <View className='leaderboard-button-section'>
          <Button
            type='primary'
            size='large'
            block
            onClick={() => {
              Taro.navigateTo({
                url: `/pages/leaderboard/index?gameId=${gameId}`,
              });
            }}
            data-testid="btn-view-leaderboard"
          >
            🏆 查看排行榜
          </Button>
        </View>
      )}


      {/* 交易记录 */}
      <View className='transactions-section'>
        <Text className='section-title'>交易记录</Text>
        <ScrollView className='transactions-list' scrollY>
          {(transactions || []).map((tx) => (
            <View key={tx?.id || Math.random().toString()} className='transaction-item'>
              <Text className='tx-time'>⏰ {tx?.createdAt ? dayjs(tx.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}</Text>
              <View className='tx-main'>
                <Text className={`tx-type ${tx?.type === 'deposit' ? 'deposit' : 'withdraw'}`}>
                  {tx?.type === 'deposit' ? '🟢 存分' : '🔴 取分'}{' '}
                  {tx?.type === 'deposit' ? '+' : '-'}{(tx?.amount || 0).toLocaleString()}
                  {tx?.isProxy && ` (${viewMode === 'self' ? '代理' : tx?.userName || ''})`}
                </Text>
                {tx?.isProxy && viewMode === 'self' && (
                  <Text className='tx-operator'>{tx?.operatorName || ''}操作</Text>
                )}
                <Text className='tx-balance'>余额: {(tx?.balanceAfter || 0).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 结束游戏确认弹窗 */}
      <ConfirmDialog
        visible={showEndGameConfirm}
        title="确认结束游戏？"
        content="游戏结束后将无法继续进行存取分操作，请确认是否结束。"
        confirmText="结束"
        cancelText="取消"
        confirmType="danger"
        loading={endGameLoading}
        onClose={() => setShowEndGameConfirm(false)}
        onCancel={() => setShowEndGameConfirm(false)}
        onConfirm={async () => {
          try {
            setEndGameLoading(true);
            await endGame(gameId);
            setShowEndGameConfirm(false);
            Toast.show('game-detail-toast', {content: '游戏已结束'});
            Taro.navigateBack();
          } catch (error: any) {
            Toast.show('game-detail-toast', {content: error.message || '结束游戏失败'});
          } finally {
            setEndGameLoading(false);
          }
        }}
      />
    </View>
  );
};

export default GameDetailPage;
