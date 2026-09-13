import React, {useCallback, useMemo, useState} from 'react';
import {Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import {useRequireAuth, PageHeader, PageLayout, ChipCounter, sumCounts, CHIP_DENOMINATIONS} from '../../components';
import type {CountMap} from '../../components';
import './index.less';

const ChipCountPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const [counts, setCounts] = useState<CountMap>({});

  // 统计总个数与总分
  const {totalCount, totalAmount} = useMemo(
    () => sumCounts(counts, CHIP_DENOMINATIONS),
    [counts]
  );

  const handleChange = useCallback((next: {counts: CountMap}) => {
    setCounts(next.counts);
  }, []);

  const handleReset = useCallback(() => {
    setCounts({});
    Toast.show('chip-count-toast', {content: '已清空'});
  }, []);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <PageLayout
      className='chip-count-page'
      contentClassName='chip-count-content'
      header={
        <>
          <Toast id='chip-count-toast' />
          <PageHeader title='归分' showBack />
        </>
      }
      bottom={
        <View className='summary-bar'>
          <View className='summary-stats'>
            <View className='summary-item'>
              <Text className='summary-label'>总个数</Text>
              <Text className='summary-value'>{totalCount.toLocaleString()}</Text>
            </View>
            <View className='summary-divider' />
            <View className='summary-item'>
              <Text className='summary-label'>总分</Text>
              <Text className='summary-value amount'>{totalAmount.toLocaleString()}</Text>
            </View>
          </View>
          <Button
            type='default'
            size='small'
            className='reset-btn'
            onClick={handleReset}
            data-testid='btn-chip-reset'
          >
            重置
          </Button>
        </View>
      }
    >
        <View className='intro-section'>
          <Text className='intro-title'>筹码归分</Text>
          <Text className='intro-desc'>
            在每种筹码下方输入个数，自动统计总个数与总分
          </Text>
        </View>

        <ChipCounter value={counts} onChange={handleChange} />
    </PageLayout>
  );
};

export default ChipCountPage;
