import React, { useCallback, useMemo } from 'react';
import { Text, View } from '@tarojs/components';
import {
  RANKS,
  SUITS,
  SUIT_COLOR,
  SUIT_SYMBOL,
  formatRank,
  joinCards,
  parseCards,
} from '../../utils/cards';
import './index.less';

// 牌面基础工具已移到 utils/cards.ts，这里原样再导出一次，
// 让既有引用（components/index.ts）不用改
export {
  RANKS,
  SUITS,
  SUIT_COLOR,
  SUIT_SYMBOL,
  formatRank,
  joinCards,
  parseCards,
} from '../../utils/cards';

// ============================================
// 单张牌展示
// ============================================

interface CardFaceProps {
  /** 单张牌，如 "As" */
  card: string;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否选中（选牌器里用） */
  selected?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否可点 */
  clickable?: boolean;
  onClick?: (card: string) => void;
}

const CardFace: React.FC<CardFaceProps> = ({
  card,
  size = 'md',
  selected = false,
  disabled = false,
  clickable = false,
  onClick,
}) => {
  // 空牌位：公共牌没发到时占位，保持牌面排列稳定
  if (!card) {
    return <View className={`card-face ${size} empty`} />;
  }

  const rank = card[0];
  const suit = card[1];
  const color = SUIT_COLOR[suit] || 'black';

  return (
    <View
      className={[
        'card-face',
        size,
        color,
        selected ? 'selected' : '',
        disabled ? 'disabled' : '',
        clickable ? 'clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={disabled || !clickable ? undefined : () => onClick?.(card)}
    >
      <Text className='card-rank'>{formatRank(rank)}</Text>
      <Text className='card-suit'>{SUIT_SYMBOL[suit] || suit}</Text>
    </View>
  );
};

// ============================================
// 只读牌面列表
// ============================================

interface CardListProps {
  /** 规范格式的牌串，如 "AsKh" 或 "Qs7h2d" */
  cards: string;
  size?: 'sm' | 'md' | 'lg';
  /** 占位张数：用于公共牌按 3/4/5 张补齐空位，让"打到哪条街"一眼可见 */
  placeholderCount?: number;
  className?: string;
}

const CardList: React.FC<CardListProps> = ({
  cards,
  size = 'md',
  placeholderCount = 0,
  className = '',
}) => {
  const list = parseCards(cards);
  const placeholders = Math.max(0, placeholderCount - list.length);

  return (
    <View className={`card-list ${className}`.trim()}>
      {list.map((card) => (
        <CardFace key={card} card={card} size={size} />
      ))}
      {Array.from({ length: placeholders }).map((_, i) => (
        <CardFace key={`empty-${i}`} card='' size={size} />
      ))}
    </View>
  );
};

// ============================================
// 选牌器
// ============================================

interface CardPickerProps {
  /** 已选牌，规范格式，如 "AsKh" */
  value: string;
  /** 选中变化回调，返回新的牌串 */
  onChange: (cards: string) => void;
  /** 最多可选张数。选满后自动收起面板 */
  max: number;
  /** 不可选的牌（通常是已用作底牌的牌，公共牌不能再选） */
  disabledCards?: string;
  /** 展开状态（受控）。不传则用内部状态 */
  expanded?: boolean;
  /** 展开状态变化 */
  onExpandedChange?: (expanded: boolean) => void;
  /** 空位时的提示文案 */
  placeholder?: string;
}

const CardPicker: React.FC<CardPickerProps> = ({
  value,
  onChange,
  max,
  disabledCards = '',
  expanded,
  onExpandedChange,
  placeholder = '点击选牌',
}) => {
  const [innerExpanded, setInnerExpanded] = React.useState(false);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : innerExpanded;

  const selected = useMemo(() => parseCards(value), [value]);
  const disabledSet = useMemo(() => new Set(parseCards(disabledCards)), [disabledCards]);

  const setExpanded = useCallback((next: boolean) => {
    if (!isControlled) setInnerExpanded(next);
    onExpandedChange?.(next);
  }, [isControlled, onExpandedChange]);

  const handleCardTap = useCallback((card: string) => {
    const current = parseCards(value);
    const index = current.indexOf(card);

    if (index >= 0) {
      // 再点一次取消选择
      onChange(joinCards(current.filter((c) => c !== card)));
      return;
    }

    if (current.length >= max) {
      // 选满了就替换最后一张，而不是默默忽略点击 —— 后者会让人觉得点不动
      onChange(joinCards([...current.slice(0, max - 1), card]));
      return;
    }

    const next = [...current, card];
    onChange(joinCards(next));

    // 选满了自动收起，省一次点击
    if (next.length >= max) {
      setExpanded(false);
    }
  }, [value, max, onChange, setExpanded]);

  const handleRemove = useCallback((card: string) => {
    const current = parseCards(value);
    onChange(joinCards(current.filter((c) => c !== card)));
  }, [value, onChange]);

  const isSelected = (card: string) => selected.indexOf(card) >= 0;

  return (
    <View className='card-picker'>
      {/* 已选区 */}
      <View className='picker-selected'>
        {selected.length > 0 ? (
          <View className='selected-list'>
            {selected.map((card) => (
              <View
                key={card}
                className='selected-item'
                onClick={() => handleRemove(card)}
              >
                <CardFace card={card} size='lg' />
                <Text className='remove-hint'>×</Text>
              </View>
            ))}
            {Array.from({ length: Math.max(0, max - selected.length) }).map((_, i) => (
              <View key={`ph-${i}`} className='selected-placeholder'>
                <Text className='placeholder-text'>+</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className='picker-placeholder'>{placeholder}</Text>
        )}

        <View
          className={`picker-toggle ${isExpanded ? 'active' : ''}`}
          onClick={() => setExpanded(!isExpanded)}
        >
          <Text className='toggle-text'>
            {isExpanded ? '收起' : selected.length > 0 ? '改' : '选牌'}
          </Text>
        </View>
      </View>

      {/* 选牌面板 */}
      {isExpanded && (
        <View className='picker-panel'>
          {SUITS.map((suit) => (
            <View key={suit} className='suit-row'>
              <View className={`suit-label ${SUIT_COLOR[suit]}`}>
                <Text className='suit-symbol'>{SUIT_SYMBOL[suit]}</Text>
              </View>
              <View className='rank-grid'>
                {RANKS.map((rank) => {
                  const card = `${rank}${suit}`;
                  const disabled = disabledSet.has(card);
                  return (
                    <View
                      key={card}
                      className={[
                        'rank-cell',
                        SUIT_COLOR[suit],
                        isSelected(card) ? 'selected' : '',
                        disabled ? 'disabled' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={disabled ? undefined : () => handleCardTap(card)}
                    >
                      <Text className='rank-text'>{formatRank(rank)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default CardPicker;
export { CardFace, CardList };
