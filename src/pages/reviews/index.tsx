import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  BottomTabBar,
  EmptyState,
  FilterTabs,
  LoadMore,
  PageLayout,
  ReviewHandCard,
  TabHeader,
  useRequireAuth,
} from '../../components';
import { useLoadMore } from '../../hooks';
import { reviewApi } from '../../services/api';
import { transformReviewHandListFromApi } from '../../models';
import type { ReviewHandResponse } from '../../models/service';
import type { Position } from '../../models/types/review';
import './index.less';

type PositionFilter = 'all' | Position;

interface ReviewFilterParams {
  position?: string;
}

/**
 * 位置筛选项。这里是展示顺序（后位在前，盲注垫底），不是翻前行动顺序，
 * 与录入页位置网格的顺序刻意不同：筛选时最常按 BTN/CO 找，放最左边少滑几下。
 *
 * 没有 MP：它已被 LJ/HJ 取代（存量数据已迁移），见 types/review.ts 的 Position 注释。
 */
const POSITION_TABS: { value: PositionFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'BTN', label: 'BTN' },
  { value: 'CO', label: 'CO' },
  { value: 'HJ', label: 'HJ' },
  { value: 'LJ', label: 'LJ' },
  { value: 'UTG+2', label: 'UTG+2' },
  { value: 'UTG+1', label: 'UTG+1' },
  { value: 'UTG', label: 'UTG' },
  { value: 'SB', label: 'SB' },
  { value: 'BB', label: 'BB' },
];

const ReviewsPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  const {
    data: rawHands,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
    setParams,
  } = useLoadMore<ReviewHandResponse, ReviewFilterParams>(
    async (params) => {
      const { page, pageSize, position } = params;
      return await reviewApi.getHands({ page, page_size: pageSize, position });
    },
    {
      defaultCurrent: 1,
      defaultPageSize: 10,
      defaultParams: { position: undefined },
      autoLoad: true,
    }
  );

  const hands = useMemo(() => transformReviewHandListFromApi(rawHands), [rawHands]);

  useEffect(() => {
    setParams({ position: positionFilter === 'all' ? undefined : positionFilter });
  }, [positionFilter, setParams]);

  // 从录入页/详情页返回时刷新，否则刚记录的手牌不会出现在列表里
  useDidShow(() => {
    refresh();
  });

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleScrollToLower = useCallback(() => {
    if (hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  const handleCreate = useCallback(() => {
    Taro.navigateTo({ url: '/pages/review-create/index' });
  }, []);

  const handleEnterHand = useCallback((handId: string) => {
    Taro.navigateTo({ url: `/pages/review-detail/index?id=${handId}` });
  }, []);

  const handleEnterProfile = useCallback(() => {
    Taro.navigateTo({ url: '/pages/review-profile/index' });
  }, []);

  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <PageLayout
      className='reviews-page'
      contentClassName='content'
      header={
        <>
          <TabHeader
            title='复盘'
            actions={
              <>
                {/* 画像入口放在这里而不是底部 Tab：复盘是高频行为、画像不是，
                    多占一个 Tab 会把底部导航挤到 5 个 */}
                <View
                  className='profile-btn'
                  onClick={handleEnterProfile}
                  data-testid='btn-review-profile'
                >
                  <Text className='profile-text'>画像</Text>
                </View>
                <View
                  className='create-btn'
                  onClick={handleCreate}
                  data-testid='btn-create-review'
                >
                  <Text className='create-icon'>+</Text>
                  <Text className='create-text'>记录</Text>
                </View>
              </>
            }
          />
          {/* 7 个位置胶囊在窄屏上放不下。小程序里 View 的 overflow-x:auto 不会真的滚动，
              必须用 ScrollView，否则最右边的 BB 点不到 */}
          <ScrollView className='filter-scroll' scrollX enableFlex>
            <FilterTabs
              tabs={POSITION_TABS}
              activeValue={positionFilter}
              onChange={(v) => setPositionFilter(v as PositionFilter)}
            />
          </ScrollView>
        </>
      }
      bottom={<BottomTabBar currentTab='reviews' />}
      refresherEnabled
      refresherTriggered={refreshing}
      onRefresherRefresh={handleRefresh}
      onScrollToLower={handleScrollToLower}
      lowerThreshold={100}
    >
      {hands.length > 0 ? (
        <>
          {hands.map((hand) => (
            <ReviewHandCard
              key={hand.id}
              hand={hand}
              onClick={() => handleEnterHand(hand.id)}
              testId={`review-card-${hand.id}`}
            />
          ))}
          <LoadMore hasMore={hasMore} loading={loading} />
        </>
      ) : (
        !loading && (
          <EmptyState
            icon='🃏'
            text='还没有复盘记录'
            subtext='记下一手让你纠结的牌，AI 会帮你找出思维漏洞'
          />
        )
      )}

      {loading && hands.length === 0 && (
        <View className='loading-hint'>
          <Text className='hint-text'>加载中…</Text>
        </View>
      )}
    </PageLayout>
  );
};

export default ReviewsPage;
