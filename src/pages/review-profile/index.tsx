import React, { useCallback, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { Button } from '@nutui/nutui-react-taro';
import {
  EmptyState,
  Loading,
  PageHeader,
  PageLayout,
  useRequireAuth,
} from '../../components';
import { reviewApi } from '../../services/api';
import { transformReviewInsightListFromApi, transformReviewProfileFromApi } from '../../models';
import { usePageData } from '../../hooks';
import { positionLabel } from '../../utils/poker';
import type { AnalysisStatus, ProfileLeakStat } from '../../models/types/review';
import './index.less';

/**
 * 画像的统计窗口手数。与后端 ProfileWindowHands 对齐 ——
 * 后端只统计最近这么多手，前端拿它解释"为什么这条显示已改善"
 */
const PROFILE_WINDOW_HANDS = 30;

/** 轮询间隔 */
const POLL_INTERVAL_MS = 2000;
/**
 * 最大轮询次数，2 秒 × 450 = 15 分钟。
 * 与后端的 profileInflightWindow 对齐即可 —— 后端超过这个时长就把任务判成中断，
 * 前端轮得比它久没有意义
 */
const MAX_POLLS = 450;

/** 是否已经结束（成功或失败都算结束） */
function isFinished(status: AnalysisStatus): boolean {
  return status === 'done' || status === 'failed';
}

/** 严重度的展示文案与配色档位，与 AnalysisPanel 的口径保持一致 */
const SEVERITY_TEXT: Record<number, string> = {
  1: '轻微',
  2: '明显',
  3: '严重',
};

/** 平均严重度取整到最近的档位，用于选配色 */
function severityLevel(avg: number): number {
  if (avg >= 2.5) return 3;
  if (avg >= 1.5) return 2;
  return 1;
}

const ReviewProfilePage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();

  /** 当前展开的漏洞标签，同时用于钻取 */
  const [expandedTag, setExpandedTag] = useState<string>('');
  /** 轮询开关。ahooks 靠监听 pollingInterval 变假值来停表，不能调 cancel() */
  const [polling, setPolling] = useState(false);
  /** beginPolling 的幂等开关：usePageData 每次刷新成功都会再调一次它 */
  const pollingRef = useRef(false);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    setPolling(false);
  }, []);

  const beginPolling = useCallback((run: () => void) => {
    if (pollingRef.current) return;
    pollCountRef.current = 0;
    pollingRef.current = true;
    setPolling(true);
    run();
  }, []);

  // ---------- 轮询总结重写状态 ----------
  //
  // 刻意用独立的请求而不是把 pollingInterval 挂到 usePageData 上：
  // 后者带 useRefreshOnShow，页面重新可见时会并发 refresh，两条链路打架
  const { run: pollProfile } = useRequest(
    async () => transformReviewProfileFromApi(await reviewApi.getProfile()),
    {
      manual: true,
      pollingInterval: polling ? POLL_INTERVAL_MS : undefined,
      pollingWhenHidden: false,
      // 计数放 onFinally：onSuccess 只在成功时触发，网络一直失败就永远撞不到上限
      onFinally: (_params, data) => {
        if (data) setProfile(data);

        pollCountRef.current += 1;
        if (pollCountRef.current > MAX_POLLS) {
          stopPolling();
          Taro.showToast({ title: '生成耗时异常，稍后刷新页面看看', icon: 'none', duration: 2500 });
          return;
        }

        // 判到终态才停表，并在这一刻告诉用户结果 ——
        // 触发接口返回的是 pending，那时弹"已更新"是撒谎
        if (data && isFinished(data.summaryStatus)) {
          stopPolling();
          if (data.summaryStatus === 'done') {
            Taro.showToast({ title: '总结已更新', icon: 'success' });
          }
        }
      },
    }
  );

  // usePageData 内置了"回到本页时重拉"：从小程序的手牌详情返回时组件不会重新挂载，
  // 只在 useEffect 里拉数据会一直显示旧画像（详情页编辑后同样踩过这个坑）
  const {
    data: profile,
    isFirstLoading,
    mutate: setProfile,
  } = usePageData(
    async () => transformReviewProfileFromApi(await reviewApi.getProfile()),
    {
      onSuccess: (next) => {
        // 上次退出时总结可能还在生成，这里接着轮询。beginPolling 自身幂等
        if (!isFinished(next.summaryStatus)) {
          beginPolling(() => pollProfile());
        }
      },
      onError: () => Taro.showToast({ title: '画像加载失败', icon: 'none' }),
    }
  );

  // 钻取某个漏洞的历史证据
  const {
    data: insights = [],
    loading: insightsLoading,
    run: loadInsights,
    mutate: setInsights,
  } = useRequest(
    (tagCode: string) =>
      reviewApi
        .getInsights({ tag_code: tagCode, limit: 50 })
        .then((res) => transformReviewInsightListFromApi(res.list)),
    {
      manual: true,
      onError: () => Taro.showToast({ title: '历史证据加载失败', icon: 'none' }),
    }
  );

  /** 展开某个漏洞并加载它的全部历史证据 */
  const handleToggleTag = useCallback(
    (leak: ProfileLeakStat) => {
      if (expandedTag === leak.tagCode) {
        setExpandedTag('');
        return;
      }
      setExpandedTag(leak.tagCode);
      // 先清空再拉：否则上一条漏洞的证据会短暂显示在新展开的标题下面
      setInsights([]);
      loadInsights(leak.tagCode);
    },
    [expandedTag, loadInsights, setInsights]
  );

  const { runAsync: refreshSummary, loading: refreshingSummary } = useRequest(
    async () => transformReviewProfileFromApi(await reviewApi.refreshProfileSummary()),
    {
      manual: true,
      onSuccess: (next) => {
        // 这个接口现在是异步的，返回的是 status=pending 的画像 ——
        // 此刻弹"总结已更新"是撒谎，那句话要等轮询判到终态再说
        setProfile(next);
        if (!isFinished(next.summaryStatus)) {
          beginPolling(() => pollProfile());
        }
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '重写失败', icon: 'none', duration: 2500 }),
    }
  );

  const handleRefreshSummary = useCallback(async () => {
    try {
      await refreshSummary();
    } catch {
      // onError 已经提示过
    }
  }, [refreshSummary]);

  const handleEnterHand = useCallback((handId: string) => {
    Taro.navigateTo({ url: `/pages/review-detail/index?id=${handId}` });
  }, []);

  if (!isAuthenticated) return <View />;
  // 只在"还没有任何数据"时占满整页。回到本页会静默重拉，
  // 那时若也走这个分支，页面会整个卸载重建、滚动位置归零
  if (isFirstLoading) return <Loading fullPage text='加载画像' />;

  const hasData =
    !!profile && (profile.handsReviewed > 0 || profile.leaks.length > 0 || !!profile.summary);
  /** 总结正在重写。按钮与文案都以它为准，而不是那个只覆盖"触发请求在飞"的 loading */
  const isSummaryRunning = !!profile && !isFinished(profile.summaryStatus);

  return (
    <PageLayout
      className='review-profile-page'
      contentClassName='content'
      header={<PageHeader title='我的画像' showBack />}
    >
      {!hasData ? (
        <EmptyState
          icon='🧠'
          text='还没有足够的复盘记录'
          subtext='分析几手牌之后，这里会累积出你的高频漏洞和改进趋势'
        />
      ) : (
        <>
          {/* ---------- 概览 ---------- */}
          <View className='section overview'>
            <View className='overview-item'>
              <Text className='overview-value'>{profile!.handsReviewed}</Text>
              <Text className='overview-label'>已复盘手牌</Text>
            </View>
            <View className='overview-item'>
              <Text className='overview-value'>{profile!.leaks.length}</Text>
              <Text className='overview-label'>累计漏洞种类</Text>
            </View>
          </View>

          {/* ---------- 阶段总结 ---------- */}
          <View className='section'>
            <View className='section-head'>
              <Text className='section-title'>教练的阶段总结</Text>
              {profile!.summaryVersion > 0 && (
                <Text className='section-meta'>第 {profile!.summaryVersion} 版</Text>
              )}
            </View>

            {profile!.summary ? (
              <Text className='summary-text'>{profile!.summary}</Text>
            ) : (
              <Text className='summary-empty'>
                还没有生成总结。总结会在攒够新的洞察后自动重写，也可以现在手动生成。
              </Text>
            )}

            {/* 生成中时不显示旧总结是错的：下面这段提示说明它正在被替换 */}
            {isSummaryRunning && (
              <Text className='summary-empty'>
                正在重写这份总结，需要模型想一会儿，稍等…
              </Text>
            )}
            {profile!.summaryStatus === 'failed' && (
              <Text className='summary-empty'>
                {profile!.summaryError || '上次重写没成功，可以再试一次'}
              </Text>
            )}

            <Button
              type='default'
              size='small'
              loading={refreshingSummary || isSummaryRunning}
              disabled={isSummaryRunning}
              onClick={handleRefreshSummary}
              data-testid='btn-refresh-summary'
            >
              {refreshingSummary || isSummaryRunning ? '生成中…' : '重新生成总结'}
            </Button>
            <Text className='section-hint'>
              重新生成会调用一次模型，但不会占用你每日的分析次数。
              需要先在「设置 → 模型设置」里配好你自己的模型
            </Text>
          </View>

          {/* ---------- 漏洞排行 ---------- */}
          <View className='section'>
            <Text className='section-title'>高频漏洞</Text>
            <Text className='section-hint'>
              按最近 {PROFILE_WINDOW_HANDS} 手统计 · 点任意一条看是哪几手牌犯的
            </Text>

            {profile!.leaks.length === 0 ? (
              <Text className='summary-empty'>还没有记录到漏洞，继续复盘吧</Text>
            ) : (
              profile!.leaks.map((leak) => {
                const expanded = expandedTag === leak.tagCode;
                // 最近 30 手没再出现、但更早常犯 —— 这是进步，不能显示成"出现 0 次"
                const improved = leak.count === 0 && leak.historicCount > 0;
                return (
                  <View key={leak.tagCode} className='leak-block'>
                    <View
                      className={`leak-row ${expanded ? 'expanded' : ''} ${
                        improved ? 'improved' : ''
                      }`}
                      onClick={() => handleToggleTag(leak)}
                      data-testid={`leak-${leak.tagCode}`}
                    >
                      <View className='leak-main'>
                        <Text className='leak-name'>{leak.name}</Text>
                        <Text className='leak-sub'>
                          {improved
                            ? `最近 ${PROFILE_WINDOW_HANDS} 手未再出现 · 更早累计 ${leak.historicCount} 次`
                            : `最近 ${leak.lastSeenAt} · 平均严重度 ${
                                SEVERITY_TEXT[severityLevel(leak.avgSeverity)]
                              }`}
                        </Text>
                      </View>
                      <View className='leak-right'>
                        {improved ? (
                          <Text className='leak-improved-tag'>已改善</Text>
                        ) : (
                          <Text className={`leak-count s${severityLevel(leak.avgSeverity)}`}>
                            {leak.count}
                          </Text>
                        )}
                        <Text className='leak-arrow'>{expanded ? '▾' : '▸'}</Text>
                      </View>
                    </View>

                    {expanded && (
                      <View className='evidence-list'>
                        {insightsLoading ? (
                          <Text className='evidence-loading'>加载中…</Text>
                        ) : insights.length === 0 ? (
                          <Text className='evidence-loading'>没有可展示的历史证据</Text>
                        ) : (
                          insights.map((item) => (
                            <View
                              key={item.insightId}
                              className='evidence-item'
                              onClick={() => handleEnterHand(item.handId)}
                            >
                              <View className='evidence-head'>
                                <Text className='evidence-hand'>
                                  {item.position
                                    ? `${positionLabel(item.position, item.tableSize)} · `
                                    : ''}
                                  {item.handTitle || `手牌 #${item.handId}`}
                                </Text>
                                <Text className='evidence-date'>
                                  {item.createdAt ? item.createdAt.slice(0, 10) : ''}
                                </Text>
                              </View>
                              <Text className='evidence-text'>{item.evidence}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* ---------- 做得好的地方 ---------- */}
          {profile!.strengths.length > 0 && (
            <View className='section'>
              <Text className='section-title'>做对的地方</Text>
              <Text className='section-hint'>这些是已经稳定的好习惯，别丢掉</Text>
              {profile!.strengths.map((item, i) => (
                <View
                  key={`${item.handId}-${i}`}
                  className='strength-item'
                  onClick={() => handleEnterHand(item.handId)}
                >
                  <Text className='strength-text'>{item.text}</Text>
                  <Text className='strength-date'>{item.date}</Text>
                </View>
              ))}
            </View>
          )}

          <View className='bottom-space' />
        </>
      )}
    </PageLayout>
  );
};

export default ReviewProfilePage;
