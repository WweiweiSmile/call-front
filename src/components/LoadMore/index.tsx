import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface LoadMoreProps {
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 是否正在加载中 */
  loading?: boolean;
  /** 加载中文字 */
  loadingText?: string;
  /** 没有更多数据文字 */
  noMoreText?: string;
  /** 主题类型 */
  theme?: 'dark' | 'light';
}

const LoadMore: React.FC<LoadMoreProps> = ({
  hasMore,
  loading = false,
  loadingText = '加载中...',
  noMoreText = '没有更多数据了',
  theme = 'dark'
}) => {
  // 如果没有更多且不在加载中，且没有数据时不显示
  if (!hasMore && !loading) {
    return (
      <View className={`load-more ${theme}`}>
        <Text className='load-more-text'>{noMoreText}</Text>
      </View>
    );
  }

  // 如果有更多或正在加载中
  if (hasMore || loading) {
    return (
      <View className={`load-more ${theme}`}>
        <Text className='load-more-text'>
          {loading ? loadingText : '上拉加载更多'}
        </Text>
      </View>
    );
  }

  return null;
};

export default LoadMore;
