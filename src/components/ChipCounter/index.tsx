import React, {useCallback, useState} from 'react';
import {Input, Text, View} from '@tarojs/components';
import './index.less';

export interface ChipDenomination {
  value: number;
  color: string;
}

// 筹码面值配置：调整或新增面值只需改这里，组件会自动渲染
export const CHIP_DENOMINATIONS: ChipDenomination[] = [
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
export type CountMap = Record<string, string>;

export interface ChipCounterChange {
  counts: CountMap;
  totalCount: number;
  totalAmount: number;
}

interface ChipCounterProps {
  /** 面值配置，默认 CHIP_DENOMINATIONS */
  denominations?: ChipDenomination[];
  /** 受控值；不传则由组件内部自管 */
  value?: CountMap;
  /** 筹码个数变化时回调，抛出最新个数与合计 */
  onChange?: (next: ChipCounterChange) => void;
  /** 根容器类名 */
  className?: string;
}

// 只保留数字
const normalize = (val: string) => val.replace(/[^\d]/g, '');

// 统计总个数与总分
export const sumCounts = (counts: CountMap, denominations: ChipDenomination[]) => {
  let totalCount = 0;
  let totalAmount = 0;
  denominations.forEach((chip) => {
    const num = parseInt(counts[String(chip.value)] || '0', 10) || 0;
    totalCount += num;
    totalAmount += num * chip.value;
  });
  return {totalCount, totalAmount};
};

const EMPTY_COUNTS: CountMap = {};

const ChipCounter: React.FC<ChipCounterProps> = ({
  denominations = CHIP_DENOMINATIONS,
  value,
  onChange,
  className = '',
}) => {
  const [innerCounts, setInnerCounts] = useState<CountMap>(EMPTY_COUNTS);

  const isControlled = value !== undefined;
  const counts = isControlled ? value : innerCounts;

  // 唯一的写入口：受控时只上报，非受控时同时更新内部 state
  const commit = useCallback((next: CountMap) => {
    if (!isControlled) {
      setInnerCounts(next);
    }
    onChange?.({counts: next, ...sumCounts(next, denominations)});
  }, [isControlled, onChange, denominations]);

  const setCount = useCallback((chipValue: number, next: string) => {
    commit({...counts, [String(chipValue)]: normalize(next)});
  }, [commit, counts]);

  const stepCount = useCallback((chipValue: number, delta: number) => {
    const key = String(chipValue);
    const current = parseInt(counts[key] || '0', 10) || 0;
    const next = Math.max(0, current + delta);
    commit({...counts, [key]: next === 0 ? '' : String(next)});
  }, [commit, counts]);

  return (
    <View className={`chip-counter ${className}`.trim()}>
      <View className='chip-grid'>
        {denominations.map((chip) => {
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
  );
};

export default ChipCounter;
