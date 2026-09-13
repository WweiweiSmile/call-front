import React, {useCallback, useState} from 'react';
import {Input, Text, View} from '@tarojs/components';
import {Button, Input as NutInput} from '@nutui/nutui-react-taro';
import './index.less';

export type ScoreOperationMode = 'deposit' | 'withdraw';

interface ScoreAmountFormProps {
  /** 存分 or 取分，决定文案、正负号与强调色 */
  mode: ScoreOperationMode;
  /** 游戏名（信息区展示） */
  gameName?: string;
  /** 代理操作（管理模式下由创建者代他人操作） */
  isManageMode?: boolean;
  /** 被操作用户名，仅管理模式下展示 */
  displayUserName?: string;
  /** 当前余额，为 null 时不展示余额预览 */
  currentBalance?: number | null;
  amount: string;
  onAmountChange: (value: string) => void;
  remark: string;
  onRemarkChange: (value: string) => void;
  quickAmounts?: number[];
}

const DEFAULT_QUICK_AMOUNTS = [500, 1000, 2000];

const LABELS: Record<ScoreOperationMode, {hint: string; result: string; sign: string}> = {
  deposit: {hint: '点击输入存分数量', result: '存分后余额', sign: '+'},
  withdraw: {hint: '点击输入取分数量', result: '取分后余额', sign: '-'},
};

/** 千分位显示，空串与 '0' 一律显示 0 */
export const formatThousands = (val: string) => {
  const num = parseInt(val) || 0;
  if (val === '' || val === '0') return '0';
  return num.toLocaleString();
};

const ScoreAmountForm: React.FC<ScoreAmountFormProps> = ({
  mode,
  gameName,
  isManageMode = false,
  displayUserName,
  currentBalance,
  amount,
  onAmountChange,
  remark,
  onRemarkChange,
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
}) => {
  const [amountFocused, setAmountFocused] = useState(false);
  const labels = LABELS[mode];

  // 快捷输入：在当前金额基础上累加
  const handleQuickAmount = useCallback((num: number) => {
    onAmountChange(((parseInt(amount) || 0) + num).toString());
  }, [amount, onAmountChange]);

  // 操作后的余额预览
  const newBalance = (currentBalance ?? 0) +
    (mode === 'deposit' ? 1 : -1) * (parseInt(amount) || 0);

  return (
    <View className={`score-amount-form ${mode}`}>
      {/* 信息区 */}
      <View className='info-section'>
        <Text className='info-row'>游戏: {gameName || '未知'}</Text>
        <Text className='info-row'>
          操作: {isManageMode ? '代理操作' : '自主操作'}
        </Text>
        {isManageMode && displayUserName && (
          <Text className='info-row'>用户: {displayUserName}</Text>
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
          <Text className='amount-display-hint'>{labels.hint}</Text>
        </View>
        <Input
          className='amount-hidden-input'
          type='number'
          focus={amountFocused}
          value={amount === '0' ? '' : amount}
          onInput={(e) => onAmountChange(e.detail.value)}
          onBlur={() => setAmountFocused(false)}
          data-testid={`input-${mode}-amount`}
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
              onClick={() => handleQuickAmount(num)}
              data-testid={`btn-quick-${mode}-${num}`}
            >
              {labels.sign}{num}
            </Button>
          ))}
        </View>
      </View>

      {/* 余额预览 */}
      {currentBalance != null && (
        <View className='balance-preview'>
          <View className='preview-row'>
            <Text className='preview-label'>当前余额</Text>
            <Text className='preview-value'>{currentBalance.toLocaleString()}</Text>
          </View>
          <View className='preview-arrow'>
            <Text className='preview-arrow-icon'>↓</Text>
          </View>
          <View className='preview-row preview-result'>
            <Text className='preview-label'>{labels.result}</Text>
            <Text className='preview-value'>{newBalance.toLocaleString()}</Text>
          </View>
        </View>
      )}

      {/* 备注 */}
      <View className='remark-section'>
        <NutInput
          placeholder='备注 (选填)'
          value={remark}
          onChange={onRemarkChange}
          data-testid={`input-${mode}-remark`}
        />
      </View>
    </View>
  );
};

export default ScoreAmountForm;
