import React from 'react';
import { Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import './index.less';

interface BalanceInfo {
  currentBalance: number;
  isBalanced: boolean;
}

interface GameCardProps {
  /** 游戏名称 */
  name: string;
  /** 创建者名称 */
  creatorName?: string;
  /** 参与人数 */
  participantCount?: number;
  /** 开始时间 */
  startTime?: string;
  /** 游戏状态 */
  status?: 'pending' | 'ongoing' | 'ended';
  /** 是否已经加入 */
  isJoined?: boolean;
  /** 是否是创建者 */
  isCreator?: boolean;
  /** 余额信息（我的游戏页面用） */
  balance?: BalanceInfo | null;
  /** 右侧按钮文字 */
  buttonText?: string;
  /** 按钮类型 */
  buttonType?: 'primary' | 'success' | 'default';
  /** 卡片点击回调 */
  onClick?: () => void;
  /** 按钮点击回调 */
  onButtonClick?: (e: any) => void;
  /** 主题类型 */
  theme?: 'dark' | 'light';
  /** 测试用 ID */
  testId?: string;
}

const GameCard: React.FC<GameCardProps> = ({
  name,
  creatorName,
  participantCount,
  startTime,
  status,
  isJoined = false,
  isCreator = false,
  balance,
  buttonText,
  buttonType = 'primary',
  onClick,
  onButtonClick,
  theme = 'dark',
  testId
}) => {
  // 获取默认按钮文字
  const getDefaultButtonText = () => {
    if (buttonText) return buttonText;
    if (isCreator) return isJoined ? '管理 →' : '加入游戏 →';
    return isJoined ? '进入 →' : '立即加入 →';
  };

  // 获取默认按钮类型
  const getDefaultButtonType = () => {
    if (buttonType) return buttonType;
    return isJoined ? 'primary' : 'success';
  };

  return (
    <View
      className={`game-card ${theme} ${!isJoined && !isCreator ? 'not-joined' : ''}`}
      onClick={onClick}
    >
      <View className='game-info'>
        <Text className='game-name'>🎮 {name}</Text>
        {creatorName && (
          <Text className='game-creator'>
            👤 {isCreator ? '我创建的' : `创建者: ${creatorName}`}
          </Text>
        )}
        {participantCount !== undefined && !balance && (
          <Text className='game-participants'>
            参与人数: {participantCount}人
          </Text>
        )}
        {startTime && (
          <Text className='game-time'>
            开始时间: {startTime}
          </Text>
        )}
        {balance && (
          <View className='balance-section'>
            <Text className='balance'>
              当前余额: {balance.currentBalance.toLocaleString()}
            </Text>
            <View
              className={`balance-status ${balance.isBalanced ? 'balanced' : 'unbalanced'}`}
            >
              {balance.isBalanced ? '✓ 平衡' : '⚠ 不平衡'}
            </View>
          </View>
        )}
      </View>
      <Button
        type={getDefaultButtonType()}
        size='small'
        onClick={onButtonClick}
        data-testid={testId}
      >
        {getDefaultButtonText()}
      </Button>
    </View>
  );
};

export default GameCard;
