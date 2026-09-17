import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
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
import { reviewApi } from '../../services/api';
import { useRefreshOnShow } from '../../hooks';
import { transformReviewHandListFromApi } from '../../models';
import type { ReviewHandResponse } from '../../models/service';
import type { Position } from '../../models/types/review';
import './index.less';

type PositionFilter = 'all' | Position;

/** 每页条数 */
const PAGE_SIZE = 10;

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

  const filterPosition = positionFilter === 'all' ? undefined : positionFilter;

  const [rawHands, setRawHands] = useState<ReviewHandResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * 手牌列表。
   *
   * 用 useRequest 手动管页码，而不是 ahooks 的 usePagination —— 后者是翻页式抽象
   * （onChange 直接换页、不会追加），与本页的下拉无限滚动不是一回事。
   * 好处是乱序响应由 ahooks 内部按请求序号丢弃，不用再自己记 counter。
   */
  const { loading, run } = useRequest(
    (page: number, position?: string) =>
      reviewApi.getHands({ page, page_size: PAGE_SIZE, position }),
    {
      manual: true,
      onSuccess: (res, [page]) => {
        setTotal(res.total);
        setCurrent(page);
        // 第一页是刷新（整体替换），后续页是追加
        setRawHands((prev) => (page === 1 ? res.list : [...prev, ...res.list]));
      },
    }
  );

  const hands = useMemo(() => transformReviewHandListFromApi(rawHands), [rawHands]);
  const hasMore = rawHands.length < total;

  // 首次进入与切换位置筛选都回到第一页重拉。
  // run 是 ahooks 的 useMemoizedFn，引用稳定，所以这个 effect 不会反复触发
  useEffect(() => {
    run(1, filterPosition);
  }, [filterPosition, run]);

  // 从录入页/详情页返回时刷新，否则刚记录的手牌不会出现在列表里。
  // useRefreshOnShow 会跳过首次 onShow —— 初次进入已经由上面的 effect 拉过了
  useRefreshOnShow(() => run(1, filterPosition));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run(1, filterPosition);
    } finally {
      setRefreshing(false);
    }
  }, [run, filterPosition]);

  const handleScrollToLower = useCallback(() => {
    if (hasMore && !loading) {
      run(current + 1, filterPosition);
    }
  }, [hasMore, loading, current, filterPosition, run]);

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
