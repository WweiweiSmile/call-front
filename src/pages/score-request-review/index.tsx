import React, {useCallback, useState} from 'react';
import {Input, Text, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {scoreRequestApi} from '../../services/api';
import {transformScoreRequestListFromApi} from '../../models';
import {useMessageStore} from '../../store/messageStore';
import {usePageData} from '../../hooks';
import {
  useRequireAuth,
  Loading,
  EmptyState,
  PageHeader,
  PageLayout,
  ConfirmDialog,
  FilterTabs,
  RequestStatusTag,
} from '../../components';
import type {FrontendScoreRequest, FrontendScoreRequestStatus} from '../../models/types';
import {decodeParam} from '../../utils/url';
import './index.less';

/** 列表没数据时的稳定空引用，避免 usePageData 的 data 每轮都换新数组 */
const EMPTY_REQUESTS: FrontendScoreRequest[] = [];

const STATUS_TABS = [
  {value: 'pending', label: '待审核'},
  {value: 'approved', label: '已通过'},
  {value: 'rejected', label: '已驳回'},
];

/** 场次创建者审核存取分申请 */
const ScoreRequestReviewPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const gameName = decodeParam(router.params?.gameName as string);

  const [status, setStatus] = useState<FrontendScoreRequestStatus>('pending');
  const [processingId, setProcessingId] = useState('');
  const [rejectTarget, setRejectTarget] = useState<FrontendScoreRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refreshPending = useMessageStore((state) => state.refreshPending);

  const {data: requests = EMPTY_REQUESTS, isFirstLoading, refresh: loadRequests} = usePageData(
    async () => {
      if (!gameId) return EMPTY_REQUESTS;
      const response: any = await scoreRequestApi.getList({
        gameId,
        scope: 'review',
        status,
        page: 1,
        page_size: 50,
      });
      return transformScoreRequestListFromApi(response.list || []);
    },
    {
      refreshDeps: [gameId, status],
      // 每次拉到列表顺手更新场次详情的待审角标
      onSuccess: () => {
        if (gameId) refreshPending(gameId);
      },
      onError: (error) => {
        console.error('加载申请列表失败:', error);
        Toast.show('score-request-review-toast', {content: error.message || '加载失败'});
      },
    }
  );

  const handleApprove = useCallback(async (request: FrontendScoreRequest) => {
    try {
      setProcessingId(request.id);
      await scoreRequestApi.approve(request.id);
      Toast.show('score-request-review-toast', {content: '已通过，分数已入库'});
      await loadRequests();
      if (gameId) {
        await refreshPending(gameId);
      }
    } catch (error: any) {
      Toast.show('score-request-review-toast', {content: error.message || '操作失败'});
    } finally {
      setProcessingId('');
    }
  }, [loadRequests, gameId, refreshPending]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      Toast.show('score-request-review-toast', {content: '请填写驳回理由'});
      return;
    }

    try {
      setProcessingId(rejectTarget.id);
      await scoreRequestApi.reject(rejectTarget.id, {reviewRemark: rejectReason.trim()});
      Toast.show('score-request-review-toast', {content: '已驳回'});
      setRejectTarget(null);
      setRejectReason('');
      await loadRequests();
      if (gameId) {
        await refreshPending(gameId);
      }
    } catch (error: any) {
      Toast.show('score-request-review-toast', {content: error.message || '操作失败'});
    } finally {
      setProcessingId('');
    }
  }, [rejectTarget, rejectReason, loadRequests, gameId, refreshPending]);

  if (!isAuthenticated || !gameId) {
    return <View />;
  }

  return (
    <PageLayout
      className='score-request-review-page'
      contentClassName='review-content'
      header={
        <>
          <Toast id='score-request-review-toast' />
          <PageHeader
            title='审核申请'
            subtitle={gameName ? `场次：${gameName}` : undefined}
            showBack
          />
          <FilterTabs
            tabs={STATUS_TABS}
            activeValue={status}
            onChange={(value) => setStatus(value as FrontendScoreRequestStatus)}
            variant='underline'
          />
        </>
      }
    >
      {isFirstLoading ? (
        <Loading text='加载中' subtitle='正在获取申请列表...' fullPage />
      ) : requests.length === 0 ? (
        <EmptyState text='暂无相关申请' />
      ) : (
        requests.map((request) => (
          <View key={request.id} className='request-card' data-testid={`request-${request.id}`}>
            <View className='request-card-header'>
              <Text className='request-user'>👤 {request.userName}</Text>
              <RequestStatusTag status={request.status} />
            </View>

            <Text className={`request-amount ${request.type}`}>
              {request.type === 'deposit' ? '🟢 存分 +' : '🔴 取分 -'}
              {request.amount.toLocaleString()}
            </Text>

            <Text className='request-time'>
              ⏰ {request.createdAt ? dayjs(request.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
            </Text>
            {request.remark && (
              <Text className='request-remark'>备注: {request.remark}</Text>
            )}
            {request.reviewRemark && (
              <Text className='request-review-remark'>审核意见: {request.reviewRemark}</Text>
            )}

            {request.status === 'pending' && (
              <View className='request-card-actions'>
                <Button
                  type='danger'
                  size='small'
                  onClick={() => {
                    setRejectTarget(request);
                    setRejectReason('');
                  }}
                  data-testid={`btn-reject-${request.id}`}
                >
                  驳回
                </Button>
                <Button
                  type='success'
                  size='small'
                  loading={processingId === request.id}
                  onClick={() => handleApprove(request)}
                  data-testid={`btn-approve-${request.id}`}
                >
                  通过
                </Button>
              </View>
            )}
          </View>
        ))
      )}

      {/* 驳回理由弹窗：ConfirmDialog 的 content 支持 ReactNode，直接塞输入框 */}
      <ConfirmDialog
        visible={!!rejectTarget}
        title='驳回申请'
        content={
          <View className='reject-reason-box'>
            <Text className='reject-reason-hint'>
              {rejectTarget
                ? `${rejectTarget.userName} 的${rejectTarget.type === 'deposit' ? '存分' : '取分'}申请 ${rejectTarget.amount.toLocaleString()} 分`
                : ''}
            </Text>
            <Input
              className='reject-reason-input'
              placeholder='请填写驳回理由'
              value={rejectReason}
              onInput={(e) => setRejectReason(e.detail.value)}
              data-testid='input-reject-reason'
            />
          </View>
        }
        confirmText='确认驳回'
        confirmType='danger'
        loading={!!processingId}
        onConfirm={handleRejectConfirm}
        onCancel={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
      />
    </PageLayout>
  );
};

export default ScoreRequestReviewPage;
