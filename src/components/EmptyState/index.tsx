import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface EmptyStateProps {
  /** 图标 emoji 或自定义内容 */
  icon?: string | React.ReactNode;
  /** 主文本 */
  text?: string;
  /** 副文本 */
  subtext?: string;
  /** 主题类型 */
  theme?: 'dark' | 'light';
  /** 自定义类名 */
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  text = '暂无数据',
  subtext,
  theme = 'dark',
  className = ''
}) => {
  return (
    <View className={`empty-state ${theme} ${className}`}>
      {icon && (
        <View className='empty-icon'>
          {typeof icon === 'string' ? (
            <Text className='icon-text'>{icon}</Text>
          ) : (
            icon
          )}
        </View>
      )}
      <Text className='empty-text'>{text}</Text>
      {subtext && (
        <Text className='empty-subtext'>{subtext}</Text>
      )}
    </View>
  );
};

export default EmptyState;
