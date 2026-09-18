import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useRequest } from 'ahooks';
import dayjs from 'dayjs';
import {
  AnalysisPanel,
  ReviewChatPanel,
  CardList,
  ConfirmDialog,
  EmptyState,
  Loading,
  PageHeader,
  PageLayout,
  useRequireAuth,
} from '../../components';
import { useAnalysis } from './useAnalysis';
import { usePageData, useRefreshOnShow } from '../../hooks';
import { reviewApi } from '../../services/api';
import { transformReviewHandFromApi } from '../../models';
import {
  ACTION_LABEL,
  ACTION_NEEDS_AMOUNT,
  ACTOR_LABEL,
  POT_TYPE_LABEL,
  RESULT_LABEL,
  STREET_LABEL,
  STREET_ORDER,
  blindsLabel,
  formatBB,
  positionLabel,
  tableSizeLabel,
} from '../../utils/poker';
import type { FrontendReviewHand } from '../../models/types/review';
import './index.less';

const ReviewDetailPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const handId = router.params?.id as string | undefined;

  const [deleteVisible, setDeleteVisible] = useState(false);

  const { analysis, aiStatus, tagNameByCode, triggering, trigger, reload } = useAnalysis(handId);

  // 手牌详情。ready + refreshDeps 让它在 handId 就绪时自动加载，
  // 回到本页时（从编辑页返回、或切回标签页）由 usePageData 内部重拉
  const { data: hand, isFirstLoading } = usePageData(
    async (): Promise<FrontendReviewHand> =>
      transformReviewHandFromApi(await reviewApi.getHand(handId as string)),
    {
      ready: !!handId,
      refreshDeps: [handId],
      onError: (e) => Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }),
    }
  );

  // 分析结论要跟着手牌一起刷：手牌被改过之后，旧结论就不再对应当前内容了。
  // 单独注册一次，因为 usePageData 只管它自己那份数据
  useRefreshOnShow(reload);

  // 触发分析前先确认：这会消耗一次额度，用户应当知情
  const handleAnalyze = useCallback(async () => {
    if (triggering) return;
    const remaining = aiStatus?.remaining ?? 0;
    try {
      const res = await Taro.showModal({
        title: '开始 AI 分析',
        content: `会让模型逐街点评这手牌，约需 20~60 秒。今日剩余 ${remaining} 次。`,
        confirmText: '开始',
        cancelText: '再想想',
      });
      if (!res.confirm) return;
    } catch {
      // 某些端不支持 showModal 时会抛错，这种情况直接继续，不阻塞用户
    }
    trigger();
  }, [triggering, aiStatus, trigger]);

  const handleEdit = useCallback(() => {
    Taro.navigateTo({ url: `/pages/review-create/index?id=${handId}` });
  }, [handId]);

  const { runAsync: deleteHand, loading: deleting } = useRequest(
    (id: string) => reviewApi.deleteHand(id),
    {
      manual: true,
      onError: (e) => Taro.showToast({ title: e?.message || '删除失败', icon: 'none' }),
    }
  );

  const handleDelete = useCallback(async () => {
    if (!handId) return;
    try {
      await deleteHand(handId);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setDeleteVisible(false);
      setTimeout(() => Taro.navigateBack(), 500);
    } catch {
      // onError 已经提示过
    }
  }, [handId, deleteHand]);

  // 公共牌按 3/4/5 补齐空位，让"打到哪条街"一眼可见
  const boardPlaceholder = useMemo(() => {
    const count = hand?.board.length ? hand.board.length / 2 : 0;
    return count === 0 ? 0 : 5;
  }, [hand]);

  // 盲注文案。没记盲注（含加这个功能之前的老手牌）时是空串，整行不渲染
  const blindText = useMemo(() => {
    if (!hand) return '';
    return blindsLabel({
      smallBlindBb: hand.smallBlindBb,
      bigBlindBb: hand.bigBlindBb,
      anteBb: hand.anteBb,
      tableSize: hand.tableSize,
      heroPosition: hand.heroPosition,
      villainPosition: (hand.villains || []).find((v) => v.isKey)?.position || '',
    });
  }, [hand]);

  if (!isAuthenticated) return <View />;
  // 只有首次加载才铺满屏。回到本页会静默重拉，那时把内容换成 Loading
  // 会把整页卸载重建，滚动位置直接归零
  if (isFirstLoading) return <Loading fullPage text='加载手牌' />;

  if (!hand) {
    return (
      <View className='review-detail-page'>
        <PageHeader title='手牌详情' showBack />
        <EmptyState icon='🃏' text='手牌不存在' subtext='它可能已被删除' />
      </View>
    );
  }

  return (
    <>
    <PageLayout
      className='review-detail-page'
      contentClassName='detail-content'
      header={
        <PageHeader
          title='手牌详情'
          showBack
          rightContent={
            <View className='header-actions'>
              <View className='action-btn' onClick={handleEdit} data-testid='btn-edit-hand'>
                <Text className='action-text'>编辑</Text>
              </View>
              <View className='action-btn danger' onClick={() => setDeleteVisible(true)}>
                <Text className='action-text'>删除</Text>
              </View>
            </View>
          }
        />
      }
    >
        {/* ---------- 概览 ---------- */}
        <View className='section hero-section'>
          <Text className='hand-title'>{hand.title}</Text>
          <View className='hero-cards'>
            <View className='position-tag'>
              <Text className='position-text'>{positionLabel(hand.heroPosition, hand.tableSize)}</Text>
            </View>
            <CardList cards={hand.heroCards} size='lg' />
            <View className='hero-meta'>
              <Text className='meta-line'>
                {formatBB(hand.heroStackBb)} bb
                {hand.stakes ? ` · ${hand.stakes}` : ''}
              </Text>
              <Text className='meta-line'>
                {tableSizeLabel(hand.tableSize)} · {POT_TYPE_LABEL[hand.potType]} · {hand.villainCount} 个对手
              </Text>
              {blindText && <Text className='meta-line'>{blindText}</Text>}
            </View>
          </View>

          <View className='board-line'>
            <Text className='board-label'>公共牌</Text>
            {hand.board ? (
              <CardList cards={hand.board} size='md' placeholderCount={boardPlaceholder} />
            ) : (
              <Text className='board-empty'>翻前结束</Text>
            )}
          </View>

          <View className='result-line'>
            <Text className={`result-text ${hand.result}`}>
              {RESULT_LABEL[hand.result]}
              {hand.resultAmount
                ? ` ${formatBB(Math.abs(hand.resultAmount))} bb`
                : ''}
            </Text>
            <Text className='time-text'>
              {dayjs(hand.createdAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </View>

          {hand.gameName && (
            <Text className='game-name'>关联场次：{hand.gameName}</Text>
          )}
        </View>

        {/* ---------- 逐街回放 ---------- */}
        <View className='section'>
          <Text className='section-title'>行动回放</Text>

          {hand.streets.length === 0 ? (
            <Text className='empty-text'>没有记录行动过程</Text>
          ) : (
            STREET_ORDER.map((street) => {
              const record = hand.streets.find((s) => s.street === street);
              if (!record || record.actions.length === 0) return null;

              // 转牌/河牌只发出 1 张，单独显示更贴近牌桌观感
              let streetCards = '';
              if (street === 'flop') streetCards = hand.board.slice(0, 6);
              else if (street === 'turn') streetCards = hand.board.slice(6, 8);
              else if (street === 'river') streetCards = hand.board.slice(8, 10);

              return (
                <View key={street} className='street-block'>
                  <View className='street-head'>
                    <Text className='street-name'>{STREET_LABEL[street]}</Text>
                    {streetCards && <CardList cards={streetCards} size='sm' />}
                  </View>

                  {record.actions.map((action, index) => (
                    <View key={index} className='action-line'>
                      <Text className={`actor-tag ${action.actor}`}>{ACTOR_LABEL[action.actor]}</Text>
                      <Text className='action-text'>{ACTION_LABEL[action.action]}</Text>
                      {ACTION_NEEDS_AMOUNT.indexOf(action.action) >= 0 && action.amountBb ? (
                        <Text className='amount-text'>{formatBB(action.amountBb)} bb</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>

        {/* ---------- 我的想法 ---------- */}
        {hand.heroThought && (
          <View className='section highlight'>
            <Text className='section-title'>我当时是怎么想的</Text>
            <Text className='thought-text'>{hand.heroThought}</Text>
          </View>
        )}

        {/* ---------- 标签 ---------- */}
        {hand.heroTags.length > 0 && (
          <View className='section'>
            <Text className='section-title'>标签</Text>
            <View className='tag-list'>
              {hand.heroTags.map((tag) => (
                <View key={tag} className='tag-chip'>
                  <Text className='tag-text'>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------- AI 分析 ---------- */}
        <View className='section'>
          {/* 内容改过之后，旧结论不能当成当前内容的结论展示 */}
          {analysis?.stale && (
            <View className='stale-notice'>
              <Text className='stale-text'>
                这手牌在分析之后被修改过，下面的结论对应的是修改前的内容。建议重新分析。
              </Text>
            </View>
          )}
          <AnalysisPanel
            analysis={analysis}
            aiStatus={aiStatus}
            tagNameByCode={tagNameByCode}
            onAnalyze={handleAnalyze}
            triggering={triggering}
          />
        </View>

        {/* ---------- 追问对话 ---------- */}
        <View className='section'>
          <ReviewChatPanel
            handId={handId || ''}
            enabled={!!analysis && analysis.status === 'done'}
            testId='review-chat-panel'
          />
        </View>

        <View className='bottom-space' />
      </PageLayout>

      <ConfirmDialog
        visible={deleteVisible}
        title='删除这手牌'
        content='删除后无法恢复，基于它的分析记录也会一并失效。'
        confirmText='删除'
        confirmType='danger'
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteVisible(false)}
        onClose={() => setDeleteVisible(false)}
      />
    </>
  );
};

export default ReviewDetailPage;
