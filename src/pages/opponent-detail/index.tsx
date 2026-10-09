import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro, { useRouter } from '@tarojs/taro';
import { useRequest } from 'ahooks';
import {
  ConfirmDialog,
  EmptyState,
  Loading,
  PageHeader,
  PageLayout,
  ReviewHandCard,
  useRequireAuth,
} from '../../components';
import { reviewApi } from '../../services/api';
import { usePageData } from '../../hooks';
import { formatCardsText } from '../../utils/cards';
import { transformAIStatusFromApi, transformReviewHandFromApi } from '../../models';
import type { OpponentDetailResponse, ReviewHandResponse } from '../../models/service';
import type {
  FrontendAIStatus,
  OpponentProfile,
  OpponentProfileConfidence,
  OpponentProfileRecord,
} from '../../models/types/review';
import './index.less';

/** 五格形象的展示文案。与后端 models.Profile* 一一对应 */
const PROFILE_LABEL: Record<OpponentProfile, string> = {
  loosePassive: '松弱 · 跟注站',
  tightPassive: '紧弱 · 岩石',
  looseAggressive: '松凶 · LAG',
  tightAggressive: '紧凶 · TAG',
  unknown: '未知',
};

const CONFIDENCE_LABEL: Record<OpponentProfileConfidence, string> = {
  low: '样本有限',
  medium: '较为可信',
  high: '相当可信',
};

/**
 * 把画像里四个数组字段归一成数组。
 *
 * 后端现在会把它们写成空数组而不是 null，但**历史行里可能是 null** ——
 * 前端是拿 .length 与 .map 直接用的，一个 null 就会让整块画像白屏。
 * 兜这一层比在每个用到的地方写 ?? [] 更不容易漏
 */
const normalizeProfile = (
  profile?: OpponentProfileRecord
): OpponentProfileRecord | undefined =>
  profile
    ? {
        ...profile,
        tendencies: profile.tendencies ?? [],
        exploits: profile.exploits ?? [],
        unknowns: profile.unknowns ?? [],
        watchNext: profile.watchNext ?? [],
      }
    : undefined;

const PAGE_SIZE = 10;
/** 生成中时的轮询间隔。图像生成一次要跑几分钟，3 秒一次足够了 */
const POLL_INTERVAL_MS = 3000;

const OpponentDetailPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const opponentId = Number(router.params?.id) || 0;

  const [detail, setDetail] = useState<OpponentDetailResponse | null>(null);
  const [hands, setHands] = useState<ReviewHandResponse[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // 画像单独存一份状态：轮询只更新它，不重拉整页
  const [profile, setProfile] = useState<OpponentProfileRecord | undefined>();
  const [currentHands, setCurrentHands] = useState(0);

  const { isFirstLoading, refresh } = usePageData(
    () => reviewApi.getOpponentDetail(opponentId, { page: 1, pageSize: PAGE_SIZE }),
    {
      ready: opponentId > 0,
      refreshOnShow: true,
      onSuccess: (data) => {
        setDetail(data);
        setHands(data.list);
        setPage(1);
        setProfile(normalizeProfile(data.profile));
        setCurrentHands(data.stats?.hands ?? 0);
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '对手详情加载失败', icon: 'none', duration: 2500 }),
    }
  );

  // AI 额度。生成一次对手画像要花点数，余额不够时禁用入口 ——
  // 服务端也会拦，前端拦一道只是不让用户白点
  const { data: aiStatus, refresh: refreshAIStatus } = useRequest(
    async (): Promise<FrontendAIStatus> =>
      transformAIStatusFromApi(await reviewApi.getAIStatus()),
    { onError: () => {} }
  );
  // 还没拉到额度时**不禁**（保持原行为）：拉不到就不该挡着用户
  const canGenerate = !aiStatus || aiStatus.remaining >= aiStatus.costs.opponentProfile;

  const { run: generate, loading: generating } = useRequest(
    () => reviewApi.generateOpponentProfile(opponentId),
    {
      manual: true,
      onSuccess: (data) => {
        setProfile(normalizeProfile(data.profile));
        setCurrentHands(data.currentHands);
        // 扣点已经在服务端发生了，把余额重新拉一遍
        refreshAIStatus();
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '生成失败', icon: 'none', duration: 2500 }),
    }
  );

  /**
   * 生成中才轮询。
   *
   * 依赖里放的是 status 而不是整个 profile：profile 每次轮询都换新对象，
   * 放进去会把定时器反复拆了重建，实际间隔变成"响应时间 + 3 秒"
   */
  const profileStatus = profile?.status;
  const isRunning = profileStatus === 'pending' || profileStatus === 'running';
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = await reviewApi.getOpponentProfile(opponentId);
        setProfile(normalizeProfile(data.profile));
        setCurrentHands(data.currentHands);
      } catch {
        // 单次轮询失败不打断：网络抖一下不该让用户看到"生成中断"。
        // 真正的失败会由后端写进 status，下一轮就能读到
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isRunning, opponentId]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await reviewApi.getOpponentDetail(opponentId, {
        page: next,
        pageSize: PAGE_SIZE,
      });
      setHands((prev) => [...prev, ...data.list]);
      setPage(next);
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载失败', icon: 'none', duration: 2500 });
    } finally {
      setLoadingMore(false);
    }
  }, [opponentId, page]);

  const handleStartGenerate = useCallback(() => {
    // 已经生成过就再确认一次：重新生成要花一次模型额度，且会覆盖现有画像
    if (profile?.summary) {
      setConfirmVisible(true);
      return;
    }
    generate();
  }, [profile, generate]);

  /** 画像是不是比手牌记录旧了。差 1 手以内不提示 —— 录一手就提醒一次是噪音 */
  const outdated = useMemo(
    () => !!profile?.summary && currentHands - profile.handsAtGeneration > 1,
    [profile, currentHands]
  );

  const stats = detail?.stats;

  if (!isAuthenticated) return <View />;
  if (!opponentId) return <View />;
  if (isFirstLoading) return <Loading fullPage text='加载对手详情' />;

  return (
    <>
      <PageLayout
        className='opponent-detail-page'
        contentClassName='opponent-detail-content'
        header={<PageHeader title={detail?.opponent.name || '对手详情'} showBack />}
      >
        {!detail ? (
          <View className='retry-block'>
            <Text className='retry-text'>没能加载出这位对手的记录</Text>
            <View className='retry-btn' onClick={() => refresh()}>
              <Text className='retry-btn-text'>重新加载</Text>
            </View>
          </View>
        ) : (
          <View className='detail-scroll'>
            {/* ---------- 1. 画像 ---------- */}
            <View className='section' data-testid='opponent-profile-section'>
              <View className='section-head'>
                <Text className='section-title'>对手画像</Text>
                {profile?.summary && !isRunning && (
                  <Text
                    className='refresh-link'
                    onClick={canGenerate ? handleStartGenerate : undefined}
                  >
                    {canGenerate ? '重新生成' : '点数不足'}
                  </Text>
                )}
              </View>

              {!profile?.summary && !isRunning && (
                <View className='profile-empty'>
                  <Text className='profile-empty-text'>
                    还没有画像。生成后会给出他是哪种打法，以及针对这种打法该怎么剥削
                  </Text>
                  <Button
                    type='primary'
                    block
                    loading={generating}
                    disabled={generating || !canGenerate}
                    onClick={handleStartGenerate}
                    data-testid='btn-generate-profile'
                  >
                    {generating ? '提交中…' : canGenerate ? '生成画像' : '点数不足'}
                  </Button>
                  {stats && stats.hands < 5 && (
                    <Text className='warn-text'>
                      目前只交手 {stats.hands} 手。样本不足时画像会主动标注「未知」，
                      不会硬猜一个形象 —— 这是有意的，多记几手再来看更准
                    </Text>
                  )}
                </View>
              )}

              {isRunning && (
                <View className='profile-running' data-testid='profile-running'>
                  <Text className='running-text'>正在生成…</Text>
                  <Text className='running-hint'>
                    会把你与他的全部交手记录一起发给 AI 模型，通常要几分钟。
                    离开这页也不要紧，回来还在
                  </Text>
                </View>
              )}

              {profile?.status === 'failed' && (
                <View className='profile-failed'>
                  <Text className='failed-text'>生成失败：{profile.error || '未知原因'}</Text>
                  <Text
                    className='failed-hint'
                    onClick={canGenerate ? handleStartGenerate : undefined}
                  >
                    {canGenerate ? '点这里重试' : '点数不足，暂时重试不了'}
                  </Text>
                </View>
              )}

              {profile?.summary && (
                <View className='profile-body'>
                  <View className='profile-tags'>
                    <Text className={`profile-badge ${profile.profile}`}>
                      {PROFILE_LABEL[profile.profile]}
                    </Text>
                    <Text className='confidence-badge'>
                      {CONFIDENCE_LABEL[profile.confidence]}
                    </Text>
                    {outdated && (
                      <Text className='outdated-badge'>
                        基于 {profile.handsAtGeneration} 手，现在已有 {currentHands} 手
                      </Text>
                    )}
                  </View>

                  {!!profile.profileReason && (
                    <Text className='profile-reason'>{profile.profileReason}</Text>
                  )}

                  <Text className='profile-summary'>{profile.summary}</Text>

                  {profile.tendencies.length > 0 && (
                    <View className='block'>
                      <Text className='block-title'>他的倾向</Text>
                      {profile.tendencies.map((item, i) => (
                        <View key={`${item.aspect}-${i}`} className='tendency-item'>
                          <View className='tendency-head'>
                            <Text className='tendency-aspect'>{item.aspect}</Text>
                            {/* 样本量必须显眼：没有它，"他 60% 会加注"这句话
                                无法判断是 3 手里的 2 手还是 30 手里的 18 手 */}
                            <Text className='tendency-sample'>{item.sampleSize}</Text>
                          </View>
                          <Text className='tendency-text'>{item.observation}</Text>
                          <Text className='tendency-evidence'>{item.evidence}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {profile.exploits.length > 0 && (
                    <View className='block'>
                      <Text className='block-title'>怎么打他</Text>
                      {profile.exploits.map((item, i) => (
                        <View key={`${item.against}-${i}`} className='exploit-item'>
                          <Text className='exploit-against'>针对：{item.against}</Text>
                          <Text className='exploit-text'>{item.adjustment}</Text>
                          <Text className='exploit-sizing'>尺度：{item.sizing}</Text>
                          <Text className='exploit-risk'>风险：{item.risk}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {profile.unknowns.length > 0 && (
                    <View className='block'>
                      <Text className='block-title'>还看不出来的</Text>
                      {profile.unknowns.map((text, i) => (
                        <Text key={i} className='list-item'>
                          · {text}
                        </Text>
                      ))}
                    </View>
                  )}

                  {profile.watchNext.length > 0 && (
                    <View className='block'>
                      <Text className='block-title'>下次交手重点记什么</Text>
                      {profile.watchNext.map((text, i) => (
                        <Text key={i} className='list-item'>
                          · {text}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ---------- 2. 量化统计 ---------- */}
            {stats && (
              <View className='section' data-testid='opponent-stats-section'>
                <Text className='section-title'>数据速览</Text>
                <Text className='section-hint'>
                  这些数字是从你的手牌记录里数出来的，不是 AI 的推断。
                  只统计能认出人的手牌，所以比你记的总手数略少
                </Text>

                {stats.thinSample && (
                  <Text className='warn-text'>
                    只有 {stats.hands} 手，频率数字波动很大，只当参考
                  </Text>
                )}

                {stats.positions.length > 0 && (
                  <View className='stat-block'>
                    <Text className='stat-title'>翻前（按位置分层）</Text>
                    {/* 位置必须分开看：他在 BTN 的加注率和在 UTG 是两回事，
                        合成一个平均值会同时错掉偷盲与开池 */}
                    {stats.positions.map((p) => (
                      <View key={p.position} className='position-stat'>
                        <Text className='position-name'>
                          {p.position} · {p.hands} 手
                        </Text>
                        {/* 不排成表格：手机宽度下五列会把表头挤到换行，
                            还不如按位置分段、每段一行读完 */}
                        <Text className='stat-line'>
                          入池 {p.vpip}/{p.hands} · 加注 {p.pfr}/{p.hands} · 3bet{' '}
                          {p.threeBet}/{p.facedRaise}
                        </Text>
                        <Text className='stat-line'>
                          面对加注弃牌 {p.foldToRaise}/{p.facedRaise}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View className='stat-block'>
                  <Text className='stat-title'>翻后</Text>
                  <Text className='stat-line'>
                    进翻牌 {stats.postflop.flopHands} 手 · 持续下注{' '}
                    {stats.postflop.cbetMade}/{stats.postflop.cbetOpportunity}
                  </Text>
                  <Text className='stat-line'>
                    转牌二次开火 {stats.postflop.turnBarrelMade}/
                    {stats.postflop.turnBarrelOpportunity}
                  </Text>
                  <Text className='stat-line'>
                    面对我下注：弃 {stats.postflop.facingHeroBet.fold} / 跟{' '}
                    {stats.postflop.facingHeroBet.call} / 加 {stats.postflop.facingHeroBet.raise}
                  </Text>
                  <Text className='stat-line'>
                    我过牌后他下注 {stats.postflop.betWhenCheckedTo}/
                    {stats.postflop.checkedToOpportunity}
                  </Text>
                </View>

                <View className='stat-block'>
                  <Text className='stat-title'>下注尺度（相对该街起始底池）</Text>
                  {stats.sizing.map((b) => (
                    <Text key={b.label} className='stat-line'>
                      {b.label}：{b.count} 次
                    </Text>
                  ))}
                </View>

                <View className='stat-block'>
                  <Text className='stat-title'>摊牌样本</Text>
                  {/* 这份数据有摊牌偏差，必须把它写在用户看得到的地方 ——
                      只在提示词里声明是不够的，用户同样会误读 */}
                  <Text className='stat-note'>
                    只有打到摊牌或他亮牌时才看得到底牌，所以这几手本身就是「他牌不弱」
                    的样本，不能拿来算诈唬率
                  </Text>
                  {stats.showdown.length === 0 ? (
                    <Text className='stat-line dim'>
                      还没记到他的底牌。下次摊牌时在复盘录入里补上，
                      画像就能多一份最硬的证据
                    </Text>
                  ) : (
                    stats.showdown.map((item) => (
                      <View key={item.handId} className='showdown-item'>
                        <Text className='showdown-cards'>
                          {formatCardsText(item.cards)} · {item.position}
                        </Text>
                        <Text className='showdown-meta'>
                          {item.board ? `公牌 ${formatCardsText(item.board)} · ` : ''}
                          {item.made || '翻前结束'}
                          {item.tier ? `（${item.tier}）` : ''}
                          {item.aggressive ? ' · 他翻后主动过' : ''}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {/* ---------- 3. 对抗手牌 ---------- */}
            <View className='section'>
              <Text className='section-title'>与他的对抗手牌</Text>
              <Text className='section-hint'>
                共 {detail.total} 手，按时间倒序。点开看完整复盘
              </Text>

              {hands.length === 0 ? (
                <EmptyState icon='🃏' text='还没有与他的交手记录' />
              ) : (
                hands.map((hand) => (
                  <ReviewHandCard
                    key={hand.id}
                    hand={transformReviewHandFromApi(hand)}
                    onClick={() =>
                      Taro.navigateTo({ url: `/pages/review-detail/index?id=${hand.id}` })
                    }
                  />
                ))
              )}

              {hands.length > 0 && hands.length < detail.total && (
                <View className='load-more' onClick={handleLoadMore}>
                  <Text className='load-more-text'>
                    {loadingMore ? '加载中…' : `加载更多（还剩 ${detail.total - hands.length} 手）`}
                  </Text>
                </View>
              )}
            </View>

            <View className='bottom-space' />
          </View>
        )}
      </PageLayout>

      <ConfirmDialog
        visible={confirmVisible}
        title='重新生成画像'
        content={`会用最新的交手记录重新生成一遍，覆盖现有画像，并消耗 ${
          aiStatus?.costs.opponentProfile ?? 0
        } 点额度。确定吗？`}
        confirmText='重新生成'
        loading={generating}
        onConfirm={() => {
          setConfirmVisible(false);
          generate();
        }}
        onCancel={() => setConfirmVisible(false)}
        onClose={() => setConfirmVisible(false)}
      />
    </>
  );
};

export default OpponentDetailPage;
