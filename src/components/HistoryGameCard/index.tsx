import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface HistoryGameCardProps {
  /** 游戏名称 */
  name: string;
  /** 参与人数 */
  participantCount?: number;
  /** 游戏时间 */
  gameTime?: string;
  /** 用户净得分 */
  userNetScore?: number;
  /** 点击回调 */
  onClick?: () => void;
  /** 测试用 ID */
  testId?: string;
}

const HistoryGameCard: React.FC<HistoryGameCardProps> = ({
  name,
  participantCount,
  gameTime,
  userNetScore,
  onClick,
  testId
}) => {
  return (
    <View
      className='history-game-card'
      onClick={onClick}
      data-testid={testId}
    >
      <View className='game-main-info'>
        <Text className='game-name'>🎮 {name}</Text>
        {participantCount !== undefined && (
          <Text className='game-participants'>
            参与人数: {participantCount}人
          </Text>
        )}
        {gameTime && (
          <Text className='game-time'>{gameTime}</Text>
        )}
      </View>
      <View className='game-score'>
        {userNetScore !== undefined ? (
          <>
            <Text
              className={`score-value ${userNetScore >= 0 ? 'positive' : 'negative'}`}
            >
              {userNetScore >= 0 ? '+' : ''}{userNetScore.toLocaleString()}
            </Text>
            <Text className='score-label'>净分</Text>
          </>
        ) : (
          <Text className='score-value no-score'>-</Text>
        )}
      </View>
    </View>
  );
};

export default HistoryGameCard;
