import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface LoadingProps {
  /** 加载提示文字 */
  text?: string;
  /** 副标题文字 */
  subtitle?: string;
  /** 是否显示为全屏加载页面 */
  fullPage?: boolean;
}

const Loading: React.FC<LoadingProps> = ({
  text = '加载中',
  subtitle,
  fullPage = false
}) => {
  return (
    <View className={`loading-wrapper ${fullPage ? 'full-page' : ''}`}>
      <View className='loading-container'>
        <View className='loading-spinner'>
          <View className='spinner-ring' />
          <View className='spinner-ring' />
          <View className='spinner-ring' />
        </View>
        <View className='loading-pulse'>
          <Text className='loading-text'>{text}</Text>
          <View className='loading-dots'>
            <View className='dot' />
            <View className='dot' />
            <View className='dot' />
          </View>
        </View>
        {subtitle && (
          <Text className='loading-subtitle'>{subtitle}</Text>
        )}
      </View>
    </View>
  );
};

export default Loading;
