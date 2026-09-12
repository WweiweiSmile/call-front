import React from 'react';
import { ScrollView, View } from '@tarojs/components';
import './index.less';

interface PageLayoutProps
  extends Omit<React.ComponentProps<typeof ScrollView>, 'children' | 'className' | 'scrollY'> {
  /** 顶部区域，始终固定在页面顶部 */
  header?: React.ReactNode;
  /** 底部区域，始终固定在页面底部 */
  bottom?: React.ReactNode;
  /** 内容区域，只有它可滚动 */
  children: React.ReactNode;
  /** 根容器类名 */
  className?: string;
  /** 内容区类名，页面自己的内边距写在这里 */
  contentClassName?: string;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  header,
  bottom,
  children,
  className = '',
  contentClassName = '',
  ...scrollProps
}) => {
  return (
    <View className={`page-layout ${className}`.trim()}>
      {header && (
        <View className='page-layout-header'>{header}</View>
      )}

      <ScrollView
        className={`page-layout-content ${contentClassName}`.trim()}
        scrollY
        {...scrollProps}
      >
        {children}
      </ScrollView>

      {bottom && (
        <View className='page-layout-bottom'>{bottom}</View>
      )}
    </View>
  );
};

export default PageLayout;
