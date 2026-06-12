import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Input, View, Text} from '@tarojs/components';
import {Button, Input as NutInput, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, Loading, PageHeader} from '../../components';
import type {UserGameBalance} from '../../store/mockData';
import './index.less';

interface DisplayUser {
  id: string;
  name: string;
}

const ScoreWithdrawPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  // 从 URL 参数获取数据
  const gameId = (router.params?.gameId as string) || '';
  const gameName = (router.params?.gameName as string) || '';
  const targetUserId = (router.params?.targetUserId as string) || undefined;
  const targetUserName = (router.params?.targetUserName as string) || undefined;
  const viewMode = (router.params?.viewMode as string) || 'self';

  const {user} = useAuthStore();
  const currentUser = user;
  const {
    getUserBalance,
    loadUserBalance,
    loadGameParticipantBalances,
    withdraw,
  } = useAppStore();

  const [amount, setAmount] = useState('0');
  const [remark, setRemark] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const quickAmounts = [100, 500, 1000, 5000];

  // 加载游戏数据
  useEffect(() => {
    const loadData = async () => {
      if (!gameId) {
        setPageLoading(false);
        return;
      }
      try {
        setPageLoading(true);
        // 加载用户余额
        await loadUserBalance(gameId);
        // 加载所有参与者余额（管理模式下需要获取目标用户余额）
        await loadGameParticipantBalances(gameId);
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setPageLoading(false);
      }
    };
    loadData();
  }, [gameId, loadUserBalance, loadGameParticipantBalances]);

  // 格式化千分位显示
  const formatThousands = (val: string) => {
    const num = parseInt(val) || 0;
    if (val === '' || val === '0') return '0';
    return num.toLocaleString();
  };

  // 获取操作用户信息
  const displayUser = useMemo((): DisplayUser | null => {
    if (viewMode === 'self' && currentUser) {
      return {
        id: currentUser.id,
        name: currentUser.nickname || currentUser.username,
      };
    }
    if (targetUserId && targetUserName) {
      return {
        id: targetUserId,
        name: targetUserName,
      };
    }
    return null;
  }, [viewMode, targetUserId, targetUserName, currentUser]);

  // 获取余额
  const balance: UserGameBalance | null = useMemo(() => {
    if (!displayUser) return null;
    return getUserBalance(gameId, displayUser.id) ?? null;
  }, [displayUser, gameId, getUserBalance]);

  // 计算取分后余额
  const newBalance = useMemo(() => {
    if (!balance) return 0;
    const numAmount = parseInt(amount) || 0;
    return balance.currentBalance - numAmount;
  }, [balance, amount]);

  const buttonText = `确认取分 -${formatThousands(amount)}`;

  // 确认取分
  const handleConfirm = useCallback(async () => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast.show('score-withdraw-toast', {content: '请输入有效的取分数量'});
      return;
    }

    try {
      setIsSubmitting(true);
      await withdraw(gameId, numAmount, currentUser?.id || '', targetUserId, remark);
      Toast.show('score-withdraw-toast', {content: '取分成功'});
      setTimeout(() => {
        Taro.navigateBack();
      }, 500);
    } catch (error: any) {
      Toast.show('score-withdraw-toast', {content: error.message || '取分失败'});
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, gameId, currentUser?.id, targetUserId, remark, withdraw]);

  // 如果未认证，不渲染内容
  if (!isAuthenticated || !gameId || !currentUser) {
    return <View />;
  }

  if (pageLoading) {
    return (
      <View className='score-operation-page score-withdraw-page'>
        <PageHeader title='取分' showBack />
        <Loading text='加载中' subtitle='正在获取数据...' fullPage />
      </View>
    );
  }

  return (
    <View className='score-operation-page score-withdraw-page'>
      <Toast id='score-withdraw-toast' />
      <PageHeader title='取分' showBack />

      <View className='operation-content'>
        {/* 信息区 */}
        <View className='info-section'>
          <Text className='info-row'>游戏: {gameName || '未知'}</Text>
          <Text className='info-row'>
            操作: {viewMode === 'manage' ? '代理操作' : '自主操作'}
          </Text>
          {viewMode === 'manage' && displayUser && (
            <Text className='info-row'>用户: {displayUser.name}</Text>
          )}
        </View>

        {/* 金额输入 - 大尺寸千分位显示 */}
        <View className={`amount-input-section ${amountFocused ? 'focused' : ''}`}>
          <View
            className='amount-display'
            onClick={() => setAmountFocused(true)}
          >
            <Text className='amount-display-value'>
              {amount && parseInt(amount) > 0 ? formatThousands(amount) : '0'}
            </Text>
            <Text className='amount-display-hint'>
              点击输入取分数量
            </Text>
          </View>
          <Input
            className='amount-hidden-input'
            type='number'
            focus={amountFocused}
            value={amount === '0' ? '' : amount}
            onInput={(e) => setAmount(e.detail.value)}
            onBlur={() => setAmountFocused(false)}
            data-testid='input-withdraw-amount'
          />
        </View>

        {/* 快捷金额 */}
        <View className='quick-amounts'>
          <Text className='quick-label'>快捷输入:</Text>
          <View className='quick-buttons'>
            {quickAmounts.map((num) => (
              <Button
                key={num}
                type='default'
                size='small'
                className='quick-btn'
                onClick={() => setAmount(num.toString())}
                data-testid={`btn-quick-withdraw-${num}`}
              >
                -{num}
              </Button>
            ))}
          </View>
        </View>

        {/* 余额预览 */}
        {balance && (
          <View className='balance-preview'>
            <View className='preview-row'>
              <Text className='preview-label'>当前余额</Text>
              <Text className='preview-value'>{balance.currentBalance.toLocaleString()}</Text>
            </View>
            <View className='preview-arrow'>
              <Text className='preview-arrow-icon'>↓</Text>
            </View>
            <View className='preview-row preview-result'>
              <Text className='preview-label'>取分后余额</Text>
              <Text className='preview-value'>{newBalance.toLocaleString()}</Text>
            </View>
          </View>
        )}

        {/* 备注 */}
        <View className='remark-section'>
          <NutInput
            placeholder='备注 (选填)'
            value={remark}
            onChange={setRemark}
            data-testid='input-withdraw-remark'
          />
        </View>

        {/* 操作按钮 */}
        <View className='operation-actions'>
          <Button type='default' onClick={() => Taro.navigateBack()} data-testid='btn-withdraw-cancel'>
            取消
          </Button>
          <Button
            type='danger'
            onClick={handleConfirm}
            loading={isSubmitting}
            data-testid='btn-withdraw-confirm'
          >
            {buttonText}
          </Button>
        </View>
      </View>
    </View>
  );
};

export default ScoreWithdrawPage;
