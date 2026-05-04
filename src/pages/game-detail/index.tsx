import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import {Button, Input as NutInput, Popup, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth} from '../../components/RequireAuth';
import ConfirmDialog from '../../components/ConfirmDialog';
import type {Game, User as UserType, UserGameBalance} from '../../store/mockData';
import './index.less';

type ViewMode = 'self' | 'manage';
type OperationType = 'deposit' | 'withdraw';

// 兼容两种 User 类型的接口
interface DisplayUser {
  id: string;
  name: string;
}

interface OperationPopupProps {
  visible: boolean;
  type: OperationType;
  viewMode: ViewMode;
  game: Game;
  displayUser: DisplayUser | null | undefined;
  balance: UserGameBalance | null;
  amount: string;
  remark: string;
  quickAmounts: number[];
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onConfirm: () => void;
}

// 提取存分/取分弹窗组件
const OperationPopup: React.FC<OperationPopupProps> = (props) => {
  const {
    visible,
    type,
    viewMode,
    game,
    displayUser,
    balance,
    amount,
    remark,
    quickAmounts,
    onClose,
    onAmountChange,
    onRemarkChange,
    onConfirm,
  } = props
  const isDeposit = type === 'deposit';
  const title = viewMode === 'manage' ? (isDeposit ? '代理存分' : '代理取分') : (isDeposit ? '存分' : '取分');
  const buttonType = isDeposit ? 'success' : 'warning';
  const buttonText = isDeposit ? '确认存分' : '确认取分';

  const newBalance = useMemo(() => {
    if (!balance) return 0;
    const numAmount = parseInt(amount) || 0;
    return isDeposit
      ? balance.currentBalance + numAmount
      : balance.currentBalance - numAmount;
  }, [balance, amount, isDeposit]);

  return (
    <Popup visible={visible} position='bottom' onClose={onClose}>
      <View className='operation-popup'>
        <Text className='popup-title'>{title}</Text>

        <View className='popup-info'>
          <Text className='info-row'>游戏: {game.name}</Text>
          <Text className='info-row'>
            操作: {viewMode === 'manage' ? '代理操作' : '自主操作'}
          </Text>
          {viewMode === 'manage' && displayUser && (
            <Text className='info-row'>用户: {displayUser.name}</Text>
          )}
        </View>

        <View className='amount-input-section'>
          <NutInput
            type='number'
            placeholder={`输入${isDeposit ? '存分' : '取分'}数量`}
            value={amount}
            onChange={onAmountChange}
            data-testid={`input-${type}-amount`}
          />
        </View>

        <View className='quick-amounts'>
          <Text className='quick-label'>快捷输入:</Text>
          <View className='quick-buttons'>
            {quickAmounts.map((num) => (
              <Button
                key={num}
                type='default'
                size='small'
                onClick={() => onAmountChange(num.toString())}
                data-testid={`btn-quick-${type}-${num}`}
              >
                {isDeposit ? '+' : '-'}{num}
              </Button>
            ))}
          </View>
        </View>

        {balance && (
          <View className='balance-preview'>
            <Text>当前余额: {balance.currentBalance.toLocaleString()}</Text>
            <Text>{isDeposit ? '存分' : '取分'}后余额: {newBalance.toLocaleString()}</Text>
          </View>
        )}

        <View className='remark-section'>
          <NutInput
            placeholder='备注 (选填)'
            value={remark}
            onChange={onRemarkChange}
            data-testid={`input-${isDeposit ? 'withdraw' : 'deposit'}-remark`}
          />
        </View>

        <View className='popup-actions'>
          <Button type='default' onClick={onClose} data-testid={`btn-${type}-cancel`}>
            取消
          </Button>
          <Button type={buttonType} onClick={onConfirm} data-testid={`btn-${type}-confirm`}>
            {buttonText}
          </Button>
        </View>
      </View>
    </Popup>
  );
};

const GameDetailPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();
  const {
    state,
    getUserBalance,
    getGameParticipants,
    getGameParticipantBalances,
    getGameTransactions,
    deposit,
    withdraw,
    endGame,
    setCurrentGameId,
    loadUserBalance,
    loadGameParticipantBalances,
    loadGameTransactions,
    loadGames,
    loadGame,
    joinGame,
  } = useAppStore();
  const {state: authState} = useAuthStore();

  // 从 URL 参数获取 gameId
  const gameIdFromUrl = router.params?.gameId as string | undefined;
  const gameId = gameIdFromUrl || state.currentGameId || '';
  const currentUser = authState.user;

  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pollingTimerRef = useRef<number | null>(null);

  // 存分/取分弹窗状态
  const [showDepositPopup, setShowDepositPopup] = useState(false);
  const [showWithdrawPopup, setShowWithdrawPopup] = useState(false);
  const [amount, setAmount] = useState('0');
  const [remark, setRemark] = useState('');

  // 结束游戏确认弹窗状态
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);

  const quickAmounts = [100, 500, 1000, 5000];
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
      // 将 AuthUser 转换为兼容类型
      return {
        id: currentUser.id,
        name: currentUser.nickname || currentUser.username,
      };
    }
    if (selectedUserId) {
      const participants = getGameParticipants(gameId) || [];
      const participant = participants.find((u) => u.id === selectedUserId);
      if (participant) {
        return participant as DisplayUser;
      }
    }
    return null;
  }, [viewMode, selectedUserId, currentUser, gameId, getGameParticipants]);

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

  // 重置弹窗表单
  const resetPopupForm = useCallback(() => {
    setAmount('0');
    setRemark('');
  }, []);

  // 打开存分弹窗
  const openDepositPopup = useCallback(() => {
    resetPopupForm();
    setShowDepositPopup(true);
  }, [resetPopupForm]);

  // 打开取分弹窗
  const openWithdrawPopup = useCallback(() => {
    resetPopupForm();
    setShowWithdrawPopup(true);
  }, [resetPopupForm]);

  // 提取通用的操作处理逻辑
  const handleOperation = useCallback(async (type: OperationType) => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast.show('game-detail-toast', {content: `请输入有效的${type === 'deposit' ? '存分' : '取分'}数量`});
      return;
    }

    try {
      const targetUserId = viewMode === 'manage' && selectedUserId ? selectedUserId : undefined;
      const operation = type === 'deposit' ? deposit : withdraw;
      await operation(gameId, numAmount, currentUser?.id || '', targetUserId, remark);

      if (type === 'deposit') {
        setShowDepositPopup(false);
      } else {
        setShowWithdrawPopup(false);
      }
      resetPopupForm();
      Toast.show('game-detail-toast', {content: `${type === 'deposit' ? '存分' : '取分'}成功`});
    } catch (error: any) {
      Toast.show('game-detail-toast', {content: error.message || `${type === 'deposit' ? '存分' : '取分'}失败`});
    }
  }, [amount, viewMode, selectedUserId, gameId, currentUser?.id, remark, deposit, withdraw, resetPopupForm]);

  const handleDeposit = useCallback(() => handleOperation('deposit'), [handleOperation]);
  const handleWithdraw = useCallback(() => handleOperation('withdraw'), [handleOperation]);

  // 切换视图模式
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'self') {
      setSelectedUserId(null);
    }
  }, []);

  // ========== 条件返回从这里开始 ==========

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !gameId || !currentUser) {
    return <View />;
  }

  if (isLoading) {
    return (
      <View className='game-detail-page loading-page'>
        <View className='loading-container'>
          <View className='loading-spinner'>
            <View className='spinner-ring'></View>
            <View className='spinner-ring'></View>
            <View className='spinner-ring'></View>
          </View>
          <View className='loading-pulse'>
            <Text className='loading-text'>加载中</Text>
            <View className='loading-dots'>
              <View className='dot'></View>
              <View className='dot'></View>
              <View className='dot'></View>
            </View>
          </View>
          <Text className='loading-subtitle'>正在获取游戏数据...</Text>
        </View>
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
      <View className='header'>
        <View className='header-left' onClick={(e) => {
          e.stopPropagation();
          Taro.redirectTo({url: '/pages/index/index'})
        }} data-testid="btn-game-detail-back">
          <Text className='back-icon'>←</Text>
        </View>
        <View className='header-center'>
          <Text className='title'>{game.name}</Text>
          <Text className='creator'>
            👤 {isCreator ? '我创建的游戏' : `创建者: ${game.creatorName}`}
          </Text>
        </View>
        <View className='header-right'>
          {isCreator && (
            <Text className='share-icon' onClick={handleShare}>分享</Text>
          )}
        </View>
      </View>

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

      {/* 余额卡片 */}
      {balance && (
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

      {/* 操作按钮 */}
      {isCreator && viewMode === 'manage' && selectedUserId && !isGameEnded && (
        <View className='action-buttons-section'>
          <Button
            type='success'
            size='large'
            block
            onClick={openDepositPopup}
            data-testid="btn-deposit"
          >
            💰 存分
          </Button>
          <Button
            type='warning'
            size='large'
            block
            onClick={openWithdrawPopup}
            data-testid="btn-withdraw"
          >
            💵 取分
          </Button>
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
                className={`participant-card ${selectedUserId === participant?.id ? 'selected' : ''}`}
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
                  <Button
                    type='primary'
                    size='small'
                    onClick={(e) => {
                      e.stopPropagation();
                      if (participant?.id) {
                        setSelectedUserId(participant.id);
                      }
                    }}
                    data-testid={`btn-proxy-${participant?.id}`}
                  >
                    代理操作
                  </Button>
                )}
              </View>
            );
          })}

          {/* 整体平衡状态显示 */}
          {overallBalance && (
            <View className='overall-balance-card'>
              <Text className='overall-balance-title'>整体平衡状态</Text>
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
                  <Text className='overall-stat-label'>平衡人数</Text>
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

      {/* 存分弹窗 */}
      <OperationPopup
        visible={showDepositPopup}
        type="deposit"
        viewMode={viewMode}
        game={game}
        displayUser={displayUser}
        balance={balance}
        amount={amount}
        remark={remark}
        quickAmounts={quickAmounts}
        onClose={() => setShowDepositPopup(false)}
        onAmountChange={setAmount}
        onRemarkChange={setRemark}
        onConfirm={handleDeposit}
      />

      {/* 取分弹窗 */}
      <OperationPopup
        visible={showWithdrawPopup}
        type="withdraw"
        viewMode={viewMode}
        game={game}
        displayUser={displayUser}
        balance={balance}
        amount={amount}
        remark={remark}
        quickAmounts={quickAmounts}
        onClose={() => setShowWithdrawPopup(false)}
        onAmountChange={setAmount}
        onRemarkChange={setRemark}
        onConfirm={handleWithdraw}
      />

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
