import React from 'react';
import { Text, View } from '@tarojs/components';
import './index.less';

interface TabItem {
  /** 标签值 */
  value: string | number;
  /** 标签显示文本 */
  label: string;
}

interface FilterTabsProps {
  /** 标签列表 */
  tabs: TabItem[];
  /** 当前选中的值 */
  activeValue: string | number;
  /** 选中变化回调 */
  onChange: (value: string | number) => void;
  /** 样式变体 */
  variant?: 'pill' | 'underline';
  /** 主题类型 */
  theme?: 'dark' | 'light';
}

const FilterTabs: React.FC<FilterTabsProps> = ({
  tabs,
  activeValue,
  onChange,
  variant = 'pill',
  theme = 'dark'
}) => {
  return (
    <View className={`filter-tabs ${variant} ${theme}`}>
      {tabs.map((tab) => (
        <View
          key={tab.value}
          className={`tab-item ${activeValue === tab.value ? 'active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          <Text className='tab-label'>{tab.label}</Text>
        </View>
      ))}
    </View>
  );
};

export default FilterTabs;
