import React, {useCallback, useMemo, useState} from 'react';
import {Input, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import {useRequireAuth, PageHeader} from '../../components';
import './index.less';

// 筹码面值配置：调整或新增面值只需改这里，页面会自动渲染
export const CHIP_DENOMINATIONS = [
  {value: 10, color: '#6B7280'},
  {value: 20, color: '#3B82F6'},
  {value: 50, color: '#10B981'},
  {value: 100, color: '#1F2937'},
  {value: 500, color: '#8B5CF6'},
  {value: 1000, color: '#F59E0B'},
  {value: 2000, color: '#EC4899'},
  {value: 5000, color: '#EF4444'},
];

// 每个面值对应的个数，空字符串代表 0
type CountMap = Record<string, string>;

const ChipCountPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const [counts, setCounts] = useState<CountMap>({});

  // 只保留数字
  const normalize = (val: string) => val.replace(/[^\d]/g, '');

  const setCount = useCallback((value: number, next: string) => {
    setCounts((prev) => ({...prev, [String(value)]: normalize(next)}));
  }, []);

  const stepCount = useCallback((value: number, delta: number) => {
    setCounts((prev) => {
      const key = String(value);
      const current = parseInt(prev[key] || '0', 10) || 0;
      const next = Math.max(0, current + delta);
      return {...prev, [key]: next === 0 ? '' : String(next)};
    });
  }, []);

  // 统计总个数与总分
  const {totalCount, totalAmount} = useMemo(() => {
    let count = 0;
    let amount = 0;
    CHIP_DENOMINATIONS.forEach((chip) => {
      const num = parseInt(counts[String(chip.value)] || '0', 10) || 0;
      count += num;
      amount += num * chip.value;
    });
    return {totalCount: count, totalAmount: amount};
  }, [counts]);

  const handleReset = useCallback(() => {
    setCounts({});
    Toast.show('chip-count-toast', {content: '已清空'});
  }, []);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <View className='chip-count-page'>
      <Toast id='chip-count-toast' />
      <PageHeader title='归分' showBack />

      <View className='chip-count-content'>
        <View className='intro-section'>
          <Text className='intro-title'>筹码归分</Text>
          <Text className='intro-desc'>
            在每种筹码下方输入个数，自动统计总个数与总分
          </Text>
        </View>

        <View className='chip-grid'>
          {CHIP_DENOMINATIONS.map((chip) => {
            const key = String(chip.value);
            const count = parseInt(counts[key] || '0', 10) || 0;
            const subtotal = count * chip.value;
            return (
              <View className='chip-card' key={key}>
                <View className='chip-face' style={{backgroundColor: chip.color}}>
                  <Text className='chip-value'>{chip.value}</Text>
                </View>
                <Text className='chip-unit'>分</Text>

                <View className='count-stepper'>
                  <View
                    className={`stepper-btn ${count === 0 ? 'disabled' : ''}`}
                    onClick={() => stepCount(chip.value, -1)}
                    data-testid={`btn-chip-minus-${chip.value}`}
                  >
                    <Text>−</Text>
                  </View>
                  <Input
                    className='count-input'
                    type='number'
                    placeholder='0'
                    value={counts[key] || ''}
                    onInput={(e) => setCount(chip.value, e.detail.value)}
                    data-testid={`input-chip-count-${chip.value}`}
                  />
                  <View
                    className='stepper-btn'
                    onClick={() => stepCount(chip.value, 1)}
                    data-testid={`btn-chip-plus-${chip.value}`}
                  >
                    <Text>+</Text>
                  </View>
                </View>

                <Text className={`chip-subtotal ${subtotal > 0 ? 'active' : ''}`}>
                  小计 {subtotal.toLocaleString()}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 底部汇总条 */}
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
    </View>
  );
};

export default ChipCountPage;
