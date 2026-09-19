import React from 'react';
import { View } from '@tarojs/components';
import { Cell } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { PageHeader, PageLayout, useRequireAuth } from '../../components';
import './index.less';

/**
 * 设置入口页。
 *
 * 只负责列出各个设置子页，自己**不取任何数据、没有保存按钮** ——
 * 拆分的理由就是把"账号级偏好"和"表单状态"分开：入口页永远能秒开，
 * 也不会因为某个子设置加载失败而整页卡住
 */
const SettingsPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();

  if (!isAuthenticated) return <View />;

  return (
    <PageLayout
      className='settings-menu settings-menu-page'
      contentClassName='settings-menu-content'
      header={<PageHeader title='设置' showBack />}
    >
      <View className='menu-section'>
        <Cell
          title='🎯 盲注设置'
          description='复盘录入时的默认小盲 / 大盲 / 前注'
          clickable
          onClick={() => Taro.navigateTo({ url: '/pages/settings-blind/index' })}
          data-testid='btn-settings-blind'
        />
        <Cell
          title='🤖 模型设置'
          description='用自己的 API Key 接入 AI 模型'
          clickable
          onClick={() => Taro.navigateTo({ url: '/pages/settings-model/index' })}
          data-testid='btn-settings-model'
        />
      </View>

      <View className='bottom-space' />
    </PageLayout>
  );
};

export default SettingsPage;
