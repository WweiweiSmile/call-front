import React, { useCallback, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { EmptyState, Loading, PageHeader, PageLayout, useRequireAuth } from '../../components';
import { reviewApi } from '../../services/api';
import type { Opponent } from '../../models/types/review';
import './index.less';

/**
 * 对手管理页 —— 我记录过的所有对手。
 *
 * 这里**只列名单，不做分析**：统计与画像都要现算，放在列表里会让这一页
 * 随着对手数量线性变慢，而用户一次只会看一个人。点进详情再算。
 *
 * 名单来自对手表（手牌提交时按名字自动建的），所以这里没有"新增"按钮 ——
 * 对手是在复盘录入时自然产生的，凭空建一个没有交手记录的对手没有意义
 */
const OpponentsPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const [keyword, setKeyword] = useState('');

  // 搜索在服务端做：对手可能有几百个，全量拉回来再前端过滤既慢又费流量
  const { data, loading, error, run } = useRequest(
    () => reviewApi.searchOpponents({ keyword: keyword.trim(), limit: 50 }),
    {
      refreshDeps: [keyword],
      debounceWait: 300,
      onError: () => {},
    }
  );

  const opponents = data?.list ?? [];

  const handleOpen = useCallback((opponent: Opponent) => {
    Taro.navigateTo({ url: `/pages/opponent-detail/index?id=${opponent.id}` });
  }, []);

  if (!isAuthenticated) return <View />;

  return (
    <PageLayout
      className='opponents-page'
      contentClassName='opponents-content'
      header={<PageHeader title='对手管理' showBack />}
    >
      <View className='search-box'>
        <Input
          className='search-input'
          value={keyword}
          placeholder='搜索对手名'
          maxlength={20}
          onInput={(e) => setKeyword(e.detail.value)}
          data-testid='input-opponent-search'
        />
      </View>

      <Text className='page-hint'>
        对手是在复盘录入时按名字自动记下来的。点进去能看与他的全部对抗手牌，
        以及一份针对他的打法画像
      </Text>

      {loading && opponents.length === 0 && <Loading text='加载对手名单' />}

      {/* 名单拉不到时给一条重试的明路，而不是停在空白页 */}
      {!!error && opponents.length === 0 && (
        <View className='retry-block' data-testid='opponents-error'>
          <Text className='retry-text'>对手名单没加载出来</Text>
          <View className='retry-btn' onClick={() => run()}>
            <Text className='retry-btn-text'>重试</Text>
          </View>
        </View>
      )}

      {!loading && !error && opponents.length === 0 && (
        <EmptyState
          icon='🃏'
          text={keyword.trim() ? '没搜到这位对手' : '还没有记录过对手'}
          subtext={
            keyword.trim()
              ? '换个名字试试，或者去复盘录入里添一位'
              : '去复盘录入里记几手牌，填上对手的名字就会出现在这里'
          }
        />
      )}

      {opponents.length > 0 && (
        <View className='opponent-list'>
          {opponents.map((opponent) => (
            <View
              key={opponent.id}
              className='opponent-row'
              onClick={() => handleOpen(opponent)}
              data-testid={`opponent-${opponent.id}`}
            >
              <View className='row-main'>
                <Text className='row-name'>{opponent.name}</Text>
                {/* 交手数只数得到改版之后的手牌，老手牌认不出对手 ——
                    数字偏小是预期内的，这里不解释，免得每行都挂一句免责声明 */}
                <Text className='row-meta'>
                  {opponent.handCount > 0 ? `已交手 ${opponent.handCount} 手` : '还没交过手'}
                </Text>
              </View>
              <Text className='row-arrow'>›</Text>
            </View>
          ))}
        </View>
      )}

      <View className='bottom-space' />
    </PageLayout>
  );
};

export default OpponentsPage;
