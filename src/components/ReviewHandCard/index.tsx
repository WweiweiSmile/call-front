import React from 'react';
import { Text, View } from '@tarojs/components';
import dayjs from 'dayjs';
import { CardList } from '../CardPicker';
import { RESULT_LABEL, formatBB, positionLabel } from '../../utils/poker';
import type { FrontendReviewHand } from '../../models/types/review';
import './index.less';

interface ReviewHandCardProps {
  hand: FrontendReviewHand;
  onClick?: () => void;
  /** 测试用 id */
  testId?: string;
}

/** 分析状态对应的角标文案 */
const ANALYZE_BADGE: Record<string, { text: string; className: string } | undefined> = {
  done: { text: '已分析', className: 'done' },
  pending: { text: '分析中', className: 'pending' },
  failed: { text: '分析失败', className: 'failed' },
  none: undefined,
};

const ReviewHandCard: React.FC<ReviewHandCardProps> = ({ hand, onClick, testId }) => {
  const boardCount = hand.board.length / 2;
  // 公共牌按 3 张起步留位：翻前结束的手牌不该显示一排空牌位，
  // 只要打了翻牌就固定显示 5 个位置，让"打到哪条街"一眼可见
  const placeholderCount = boardCount === 0 ? 0 : 5;
  const badge = ANALYZE_BADGE[hand.analyzeStatus];

  return (
    <View className='review-hand-card' onClick={onClick} data-testid={testId}>
      <View className='card-top'>
        <Text className='card-title'>{hand.title}</Text>
        {badge && (
          <View className={`analyze-badge ${badge.className}`}>
            <Text className='badge-text'>{badge.text}</Text>
          </View>
        )}
      </View>

      <View className='card-cards'>
        <View className='position-tag'>
          <Text className='position-text'>{positionLabel(hand.heroPosition, hand.tableSize)}</Text>
        </View>
        <CardList cards={hand.heroCards} size='sm' />
        {boardCount > 0 && (
          <>
            <Text className='divider'>|</Text>
            <CardList cards={hand.board} size='sm' placeholderCount={placeholderCount} />
          </>
        )}
      </View>

      <View className='card-meta'>
        <Text className={`result-tag ${hand.result}`}>
          {RESULT_LABEL[hand.result]}
          {hand.resultAmount ? ` ${formatBB(Math.abs(hand.resultAmount))}bb` : ''}
        </Text>
        {hand.gameName && <Text className='meta-text'>· {hand.gameName}</Text>}
        <Text className='meta-text'>· {dayjs(hand.createdAt).format('MM-DD HH:mm')}</Text>
      </View>

      {hand.heroThought && (
        <Text className='card-thought'>{hand.heroThought}</Text>
      )}

      {hand.heroTags.length > 0 && (
        <View className='card-tags'>
          {hand.heroTags.map((tag) => (
            <View key={tag} className='tag-chip'>
              <Text className='tag-text'>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default ReviewHandCard;
