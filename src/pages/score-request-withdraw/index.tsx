import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import {scoreRequestApi} from '../../services/api';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {
  useRequireAuth,
  Loading,
  PageHeader,
  PageLayout,
  ScoreAmountForm,
  formatThousands,
} from '../../components';
import type {UserGameBalance} from '../../store/mockData';
import {decodeParam} from '../../utils/url';
import './index.less';

/**
 * 取分申请页（普通参与者）
 * 表单形态与取分页一致，提交后不直接入库，等创建者审核
 */
const ScoreRequestWithdrawPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const gameName = decodeParam(router.params?.gameName as string);

  const {user} = useAuthStore();
  const currentUser = user;
  const {getUserBalance, loadUserBalance} = useAppStore();

  const [amount, setAmount] = useState('0');
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!gameId) {
        setPageLoading(false);
        return;
      }
      try {
        setPageLoading(true);
        await loadUserBalance(gameId);
      } catch (error) {
        console.error('加载余额失败:', error);
      } finally {
        setPageLoading(false);
      }
    };
    loadData();
  }, [gameId, loadUserBalance]);

  const balance: UserGameBalance | null = useMemo(() => {
    if (!currentUser) return null;
    return getUserBalance(gameId, currentUser.id) ?? null;
  }, [currentUser, gameId, getUserBalance]);

  const buttonText = `提交申请 -${formatThousands(amount)}`;

  const handleSubmit = useCallback(async () => {
    const numAmount = parseInt(amount) || 0;
    if (numAmount <= 0) {
      Toast.show('score-request-withdraw-toast', {content: '请输入有效的取分数量'});
      return;
    }

    try {
      setIsSubmitting(true);
      await scoreRequestApi.create({
        gameId: parseInt(gameId, 10),
        type: 'withdraw',
        amount: numAmount,
        remark,
      });
      Toast.show('score-request-withdraw-toast', {content: '申请已提交，等待创建者审核'});
      setTimeout(() => {
        Taro.navigateBack();
      }, 800);
    } catch (error: any) {
      Toast.show('score-request-withdraw-toast', {content: error.message || '提交失败'});
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, gameId, remark]);

  if (!isAuthenticated || !gameId || !currentUser) {
    return <View />;
  }

  if (pageLoading) {
    return (
      <PageLayout
        className='score-request-page score-request-withdraw-page'
        header={<PageHeader title='取分申请' showBack />}
      >
        <Loading text='加载中' subtitle='正在获取数据...' fullPage />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      className='score-request-page score-request-withdraw-page'
      header={
        <>
          <Toast id='score-request-withdraw-toast' />
          <PageHeader
            title='取分申请'
            subtitle={gameName ? `场次：${gameName}` : undefined}
            showBack
          />
        </>
      }
      bottom={
        <View className='operation-actions'>
          <Button type='default' onClick={() => Taro.navigateBack()} data-testid='btn-withdraw-request-cancel'>
            取消
          </Button>
          <Button
            type='danger'
            onClick={handleSubmit}
            loading={isSubmitting}
            data-testid='btn-submit-withdraw-request'
          >
            {buttonText}
          </Button>
        </View>
      }
    >
      <ScoreAmountForm
        mode='withdraw'
        gameName={gameName}
        currentBalance={balance ? balance.currentBalance : null}
        amount={amount}
        onAmountChange={setAmount}
        remark={remark}
        onRemarkChange={setRemark}
      />
    </PageLayout>
  );
};

export default ScoreRequestWithdrawPage;
