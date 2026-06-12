import React from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.less';

interface PageHeaderProps {
  /** 标题 */
  title: string;
  /** 副标题（创建者信息等） */
  subtitle?: string;
  /** 是否显示返回按钮 */
  showBack?: boolean;
  /** 右侧自定义内容 */
  rightContent?: React.ReactNode;
  /** 返回按钮点击回调，默认返回上一页 */
  onBack?: () => void;
  /** 主题类型 */
  theme?: 'dark' | 'light';
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  rightContent,
  onBack,
  theme = 'dark'
}) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      Taro.navigateBack();
    }
  };

  return (
    <View className={`page-header ${theme}`}>
      <View className='header-left'>
        {showBack && (
          <View className='back-btn' onClick={handleBack}>
            <Text className='back-icon'>←</Text>
          </View>
        )}
      </View>
      <View className='header-center'>
        <Text className='title'>{title}</Text>
        {subtitle && (
          <Text className='subtitle'>{subtitle}</Text>
        )}
      </View>
      <View className='header-right'>
        {rightContent}
      </View>
    </View>
  );
};

export default PageHeader;
