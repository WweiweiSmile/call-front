import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, Loading, PageHeader, PageLayout, ScoreAmountForm, formatThousands} from '../../components';
import type {UserGameBalance} from '../../store/mockData';
import {decodeParam} from '../../utils/url';
import './index.less';

interface DisplayUser {
  id: string;
  name: string;
}

const ScoreDepositPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  // 从 URL 参数获取数据
  const gameId = (router.params?.gameId as string) || '';
  const gameName = decodeParam(router.params?.gameName as string);
  const targetUserId = (router.params?.targetUserId as string) || undefined;
  const targetUserName = decodeParam(router.params?.targetUserName as string) || undefined;
  const viewMode = (router.params?.viewMode as string) || 'self';

  const {user} = useAuthStore();
  const currentUser = user;
  const {
    getUserBalance,
    loadUserBalance,
    loadGameParticipantBalances,
    deposit,
  } = useAppStore();

  const [amount, setAmount] = useState('0');
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

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

  const buttonText = `确认存分 +${formatThousands(amount)}`;

  // 确认存分
  const handleConfirm = useCallback(async () => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast.show('score-deposit-toast', {content: '请输入有效的存分数量'});
      return;
    }

    try {
      setIsSubmitting(true);
      await deposit(gameId, numAmount, currentUser?.id || '', targetUserId, remark);
      Toast.show('score-deposit-toast', {content: '存分成功'});
      setTimeout(() => {
        Taro.navigateBack();
      }, 500);
    } catch (error: any) {
      Toast.show('score-deposit-toast', {content: error.message || '存分失败'});
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, gameId, currentUser?.id, targetUserId, remark, deposit]);

  // 如果未认证，不渲染内容
  if (!isAuthenticated || !gameId || !currentUser) {
    return <View />;
  }

  if (pageLoading) {
    return (
      <PageLayout
        className='score-operation-page score-deposit-page'
        header={<PageHeader title={displayUser?.name || '存分'} showBack />}
      >
        <Loading text='加载中' subtitle='正在获取数据...' fullPage />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      className='score-operation-page score-deposit-page'
      header={
        <>
          <Toast id='score-deposit-toast' />
          <PageHeader title={displayUser?.name || '存分'} showBack />
        </>
      }
      bottom={
        <View className='operation-actions'>
          <Button type='default' onClick={() => Taro.navigateBack()} data-testid='btn-deposit-cancel'>
            取消
          </Button>
          <Button
            type='success'
            onClick={handleConfirm}
            loading={isSubmitting}
            data-testid='btn-deposit-confirm'
          >
            {buttonText}
          </Button>
        </View>
      }
    >
      <ScoreAmountForm
        mode='deposit'
        gameName={gameName}
        isManageMode={viewMode === 'manage'}
        displayUserName={displayUser?.name}
        currentBalance={balance ? balance.currentBalance : null}
        amount={amount}
        onAmountChange={setAmount}
        remark={remark}
        onRemarkChange={setRemark}
      />
    </PageLayout>
  );
};

export default ScoreDepositPage;
