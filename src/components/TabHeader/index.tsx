import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface TabHeaderProps {
  /** 页面标题 */
  title: string;
  /** 右侧页面操作区 */
  actions?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

const TabHeader: React.FC<TabHeaderProps> = ({ title, actions, className = '' }) => {
  return (
    <View className={`tab-header ${className}`.trim()}>
      <Text className='title'>{title}</Text>
      {actions && (
        <View className='actions'>{actions}</View>
      )}
    </View>
  );
};

export default TabHeader;
