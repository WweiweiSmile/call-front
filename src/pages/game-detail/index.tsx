import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Button, Popup, Input as NutInput, Toast } from '@nutui/nutui-react-taro';
import Taro, { useRouter } from '@tarojs/taro';
import { useAppStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import './index.less';

type ViewMode = 'self' | 'manage';

const GameDetailPage: React.FC = () => {
  const router = useRouter();
  const {
    state,
    getUserBalance,
    getGameParticipantBalances,
    getGameParticipants,
    getGameTransactions,
    deposit,
    withdraw,
    endGame,
    setCurrentGameId,
    loadUserBalance,
    loadGameParticipantBalances,
    loadGameTransactions,
    loadGames,
  } = useAppStore();
  const { state: authState } = useAuthStore();

  // 从 URL 参数获取 gameId
  const gameIdFromUrl = router.params?.gameId as string;
  const gameId = gameIdFromUrl || state.currentGameId;
  const currentUser = authState.user;

  useEffect(() => {
    const loadData = async () => {
      if (gameId && currentUser) {
        setCurrentGameId(gameId);
        // 先加载游戏列表
        await loadGames();
        // 加载游戏相关数据
        loadUserBalance(gameId);
        loadGameTransactions(gameId);
        loadGameParticipantBalances(gameId);
        setIsLoading(false);
      }
    };
    loadData();
  }, [gameId, setCurrentGameId, loadUserBalance, loadGameTransactions, loadGames, loadGameParticipantBalances, currentUser?.id]);



  if (!gameId || !currentUser) {
    Taro.navigateBack();
    return null;
  }



  const game = state.games.find((g) => g.id === gameId);
  const isCreator = game?.creatorId === currentUser.id;

  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 存分/取分弹窗状态
  const [showDepositPopup, setShowDepositPopup] = useState(false);
  const [showWithdrawPopup, setShowWithdrawPopup] = useState(false);
  const [amount, setAmount] = useState('0');
  const [remark, setRemark] = useState('');

  if (isLoading) {
    return (
      <View className='game-detail-page loading-page'>
        <Text>加载中...</Text>
      </View>
    );
  }

  if (!game) {
    return (
      <View className='game-detail-page error-page'>
        <Text>游戏不存在</Text>
        <Button onClick={() => Taro.navigateBack()}>返回</Button>
      </View>
    );
  }

  const getDisplayUser = () => {
    if (viewMode === 'self') {
      return currentUser;
    }
    if (selectedUserId) {
      return getGameParticipants(gameId).find((u) => u.id === selectedUserId);
    }
    return null;
  };

  const displayUser = getDisplayUser();
  const balance = displayUser ? getUserBalance(gameId, displayUser.id) : null;
  const transactions = displayUser ? getGameTransactions(gameId, displayUser.id) : getGameTransactions(gameId);
  const participantBalances = getGameParticipantBalances(gameId);
  const participants = getGameParticipants(gameId);

  const quickAmounts = [100, 500, 1000, 5000];

  const handleDeposit = async () => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast({ content: '请输入有效的存分数量' });
      return;
    }

    try {
      const targetUserId = viewMode === 'manage' && selectedUserId ? selectedUserId : undefined;
      await deposit(gameId, numAmount, targetUserId, remark);
      setShowDepositPopup(false);
      setAmount('0');
      setRemark('');
      Toast({ content: '存分成功' });
    } catch (error: any) {
      Toast({ content: error.message || '存分失败' });
    }
  };

  const handleWithdraw = async () => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast({ content: '请输入有效的取分数量' });
      return;
    }

    try {
      const targetUserId = viewMode === 'manage' && selectedUserId ? selectedUserId : undefined;
      await withdraw(gameId, numAmount, targetUserId, remark);
      setShowWithdrawPopup(false);
      setAmount('0');
      setRemark('');
      Toast({ content: '取分成功' });
    } catch (error: any) {
      Toast({ content: error.message || '取分失败' });
    }
  };

  const newBalanceAfterDeposit = balance ? balance.currentBalance + (parseInt(amount) || 0) : 0;
  const newBalanceAfterWithdraw = balance ? balance.currentBalance - (parseInt(amount) || 0) : 0;

  // 计算排行榜数据
  const leaderboard = participantBalances
    .map((pb) => {
      const participant = participants.find((p) => p.id === pb.userId);
      const netScore = pb.depositTotal - pb.withdrawTotal;
      // 先尝试从参与者对象获取姓名，如果没有则使用 pb 中可能存在的 userName（需要在 store 中保存）
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

  return (
    <View className='game-detail-page'>
      <View className='header'>
        <View className='header-left' onClick={() => Taro.navigateBack()}>
          <Text className='back-icon'>←</Text>
        </View>
        <View className='header-center'>
          <Text className='title'>{game.name}</Text>
          <Text className='creator'>
            👤 {isCreator ? '我创建的游戏' : `创建者: ${game.creatorName}`}
          </Text>
        </View>
        <View className='header-right'>
          <Text className='share-icon'>分享</Text>
        </View>
      </View>

      {isCreator && (
      <View className='mode-switch'>
        <View
          className={`mode-item ${viewMode === 'self' ? 'active' : ''}`}
          onClick={() => {
            setViewMode('self');
            setSelectedUserId(null);
          }}
        >
          查看自己
        </View>
        <View
          className={`mode-item ${viewMode === 'manage' ? 'active' : ''}`}
          onClick={() => setViewMode('manage')}
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
      {(viewMode === 'self' || (viewMode === 'manage' && selectedUserId)) && (
      <View className='action-buttons-section'>
        <Button
          type='success'
          size='large'
          block
          onClick={() => {
            setAmount('0');
            setRemark('');
            setShowDepositPopup(true);
          }}
        >
          💰 存分
        </Button>
        <Button
          type='warning'
          size='large'
          block
          onClick={() => {
            setAmount('0');
            setRemark('');
            setShowWithdrawPopup(true);
          }}
        >
          💵 取分
        </Button>
      </View>
      )}

      {/* 去排行榜按钮 */}
      <View className='leaderboard-button-section'>
        <Button
          type='primary'
          size='large'
          block
          onClick={() => {
            // 跳转到排行榜页面
            Taro.navigateTo({
              url: `/components/leaderboard/index?gameId=${gameId}`,
            });
          }}
        >
          🏆 查看排行榜
        </Button>
      </View>

      {/* 管理参与者列表 */}
      {isCreator && viewMode === 'manage' && (
      <View className='participants-section'>
        <Text className='section-title'>参与者列表</Text>
        {participants.map((participant) => {
          const pBalance = getUserBalance(gameId, participant.id);
          return (
            <View
              key={participant.id}
              className={`participant-card ${selectedUserId === participant.id ? 'selected' : ''}`}
            >
              <View className='participant-info'>
                <Text className='participant-name'>👤 {participant.name}</Text>
                {pBalance && (
                <View className='participant-balance'>
                  <Text>余额: {pBalance.currentBalance.toLocaleString()}</Text>
                  <View
                    className={`balance-status-small ${pBalance.isBalanced ? 'balanced' : 'unbalanced'}`}
                  >
                    {pBalance.isBalanced ? '平衡' : '不平衡'}
                  </View>
                </View>
                )}
              </View>
              <Button
                type='primary'
                size='small'
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedUserId(participant.id);
                }}
              >
                代理操作
              </Button>
            </View>
          );
        })}
      </View>
      )}

      {/* 结束游戏按钮（仅创建者可见） */}
      {isCreator && game?.status !== 'ended' && (
      <View className='end-game-section'>
        <Button
          type='danger'
          size='large'
          block
          onClick={async () => {
            try {
              await endGame(gameId!);
              Toast({ content: '游戏已结束' });
              Taro.navigateBack();
            } catch (error: any) {
              Toast({ content: error.message || '结束游戏失败' });
            }
          }}
        >
          结束游戏
        </Button>
      </View>
      )}



      {/* 交易记录 */}
      <View className='transactions-section'>
        <Text className='section-title'>交易记录</Text>
        <ScrollView className='transactions-list' scrollY>
          {transactions.map((tx) => (
            <View key={tx.id} className='transaction-item'>
              <Text className='tx-time'>⏰ {tx.createdAt}</Text>
              <View className='tx-main'>
                <Text className={`tx-type ${tx.type === 'deposit' ? 'deposit' : 'withdraw'}`}>
                  {tx.type === 'deposit' ? '🟢 存分' : '🔴 取分'}{' '}
                  {tx.type === 'deposit' ? '+' : '-'}{tx.amount.toLocaleString()}
                  {tx.isProxy && ` (${viewMode === 'self' ? '代理' : tx.userName})`}
                </Text>
                {tx.isProxy && viewMode === 'self' && (
                <Text className='tx-operator'>{tx.operatorName}操作</Text>
                )}
                <Text className='tx-balance'>余额: {tx.balanceAfter.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 存分弹窗 */}
      <Popup
        visible={showDepositPopup}
        position='bottom'
        onClose={() => setShowDepositPopup(false)}
      >
        <View className='operation-popup'>
          <Text className='popup-title'>
            {viewMode === 'manage' ? '代理存分' : '存分'}
          </Text>

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
              placeholder='输入存分数量'
              value={amount}
              onChange={(value) => setAmount(value)}
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
                  onClick={() => setAmount(num.toString())}
                >
                  +{num}
                </Button>
              ))}
            </View>
          </View>

          {balance && (
          <View className='balance-preview'>
            <Text>当前余额: {balance.currentBalance.toLocaleString()}</Text>
            <Text>存分后余额: {newBalanceAfterDeposit.toLocaleString()}</Text>
          </View>
          )}

          <View className='remark-section'>
            <NutInput
              placeholder='备注 (选填)'
              value={remark}
              onChange={(value) => setRemark(value)}
            />
          </View>

          <View className='popup-actions'>
            <Button type='default' onClick={() => setShowDepositPopup(false)}>
              取消
            </Button>
            <Button type='success' onClick={handleDeposit}>
              确认存分
            </Button>
          </View>
        </View>
      </Popup>

      {/* 取分弹窗 */}
      <Popup
        visible={showWithdrawPopup}
        position='bottom'
        onClose={() => setShowWithdrawPopup(false)}
      >
        <View className='operation-popup'>
          <Text className='popup-title'>
            {viewMode === 'manage' ? '代理取分' : '取分'}
          </Text>

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
              placeholder='输入取分数量'
              value={amount}
              onChange={(value) => setAmount(value)}
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
                  onClick={() => setAmount(num.toString())}
                >
                  -{num}
                </Button>
              ))}
            </View>
          </View>

          {balance && (
          <View className='balance-preview'>
            <Text>当前余额: {balance.currentBalance.toLocaleString()}</Text>
            <Text>取分后余额: {newBalanceAfterWithdraw.toLocaleString()}</Text>
          </View>
          )}

          <View className='remark-section'>
            <NutInput
              placeholder='备注 (选填)'
              value={remark}
              onChange={(value) => setRemark(value)}
            />
          </View>

          <View className='popup-actions'>
            <Button type='default' onClick={() => setShowWithdrawPopup(false)}>
              取消
            </Button>
            <Button type='warning' onClick={handleWithdraw}>
              确认取分
            </Button>
          </View>
        </View>
      </Popup>
    </View>
  );
};

export default GameDetailPage;
