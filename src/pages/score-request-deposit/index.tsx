import React, {useCallback, useMemo, useState} from 'react';
import {Text, View} from '@tarojs/components';
import {Button, Input as NutInput, Toast} from '@nutui/nutui-react-taro';
import Taro, {useRouter} from '@tarojs/taro';
import {scoreRequestApi} from '../../services/api';
import {
  useRequireAuth,
  PageHeader,
  PageLayout,
  ChipCounter,
  sumCounts,
  CHIP_DENOMINATIONS,
} from '../../components';
import type {CountMap} from '../../components';
import {decodeParam} from '../../utils/url';
import './index.less';

/**
 * 存分申请页（普通参与者）
 * 用筹码快速算出分数后提交申请，创建者审核通过才真正入库
 */
const ScoreRequestDepositPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const gameName = decodeParam(router.params?.gameName as string);

  const [counts, setCounts] = useState<CountMap>({});
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 筹码算出申请金额
  const {totalAmount} = useMemo(
    () => sumCounts(counts, CHIP_DENOMINATIONS),
    [counts]
  );

  const handleChange = useCallback((next: {counts: CountMap}) => {
    setCounts(next.counts);
  }, []);

  const handleReset = useCallback(() => {
    setCounts({});
    Toast.show('score-request-deposit-toast', {content: '已清空'});
  }, []);

  const handleSubmit = useCallback(async () => {
    if (totalAmount <= 0) {
      Toast.show('score-request-deposit-toast', {content: '请先录入筹码'});
      return;
    }

    try {
      setIsSubmitting(true);
      await scoreRequestApi.create({
        gameId: parseInt(gameId, 10),
        type: 'deposit',
        amount: totalAmount,
        remark,
      });
      Toast.show('score-request-deposit-toast', {content: '申请已提交，等待创建者审核'});
      setTimeout(() => {
        Taro.navigateBack();
      }, 800);
    } catch (error: any) {
      Toast.show('score-request-deposit-toast', {content: error.message || '提交失败'});
    } finally {
      setIsSubmitting(false);
    }
  }, [totalAmount, gameId, remark]);

  if (!isAuthenticated || !gameId) {
    return <View />;
  }

  return (
    <PageLayout
      className='score-request-page'
      contentClassName='request-content'
      header={
        <>
          <Toast id='score-request-deposit-toast' />
          <PageHeader
            title='存分申请'
            subtitle={gameName ? `场次：${gameName}` : undefined}
            showBack
            rightContent={
              <Text
                className='header-action'
                onClick={handleReset}
                data-testid='btn-chip-reset'
              >
                重置
              </Text>
            }
          />
        </>
      }
      bottom={
        <View className='request-actions'>
          <View className='request-total'>
            <Text className='request-total-label'>申请存入</Text>
            <Text className='request-total-value'>{totalAmount.toLocaleString()}</Text>
          </View>
          <Button
            type='success'
            onClick={handleSubmit}
            loading={isSubmitting}
            data-testid='btn-submit-deposit-request'
          >
            提交申请
          </Button>
        </View>
      }
    >
      <View className='intro-section'>
        <Text className='intro-title'>筹码存分</Text>
        <Text className='intro-desc'>
          录入筹码后提交申请，创建者审核通过后分数才会计入你的余额
        </Text>
      </View>

      <ChipCounter value={counts} onChange={handleChange} />

      {/* 备注 */}
      <View className='remark-section'>
        <NutInput
          placeholder='备注 (选填)'
          value={remark}
          onChange={setRemark}
          data-testid='input-deposit-request-remark'
        />
      </View>
    </PageLayout>
  );
};

export default ScoreRequestDepositPage;
