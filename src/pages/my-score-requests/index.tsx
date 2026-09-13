import React, {useCallback, useEffect, useState} from 'react';
import {Text, View} from '@tarojs/components';
import {Toast} from '@nutui/nutui-react-taro';
import {useRouter, useDidShow} from '@tarojs/taro';
import dayjs from 'dayjs';
import {scoreRequestApi} from '../../services/api';
import {transformScoreRequestListFromApi} from '../../models';
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
import type {FrontendScoreRequest} from '../../models/types';
import './index.less';

const STATUS_TABS = [
  {value: 'all', label: '全部'},
  {value: 'pending', label: '待审核'},
  {value: 'approved', label: '已通过'},
  {value: 'rejected', label: '已驳回'},
];

/** 我提交的存取分申请 */
const MyScoreRequestsPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const gameName = (router.params?.gameName as string) || '';

  const [status, setStatus] = useState('all');
  const [requests, setRequests] = useState<FrontendScoreRequest[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<FrontendScoreRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setPageLoading(true);
      const response: any = await scoreRequestApi.getList({
        gameId: gameId || undefined,
        scope: 'mine',
        status: status === 'all' ? undefined : (status as any),
        page: 1,
        page_size: 50,
      });
      setRequests(transformScoreRequestListFromApi(response.list || []));
    } catch (error: any) {
      console.error('加载申请列表失败:', error);
      Toast.show('my-score-requests-toast', {content: error.message || '加载失败'});
    } finally {
      setPageLoading(false);
    }
  }, [gameId, status]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useDidShow(() => {
    loadRequests();
  });

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget) return;
    try {
      setCancelling(true);
      await scoreRequestApi.cancel(cancelTarget.id);
      Toast.show('my-score-requests-toast', {content: '已撤销'});
      setCancelTarget(null);
      await loadRequests();
    } catch (error: any) {
      Toast.show('my-score-requests-toast', {content: error.message || '撤销失败'});
    } finally {
      setCancelling(false);
    }
  }, [cancelTarget, loadRequests]);

  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <PageLayout
      className='my-score-requests-page'
      contentClassName='my-requests-content'
      header={
        <>
          <Toast id='my-score-requests-toast' />
          <PageHeader
            title='我的申请'
            subtitle={gameName ? `场次：${gameName}` : undefined}
            showBack
          />
          <FilterTabs
            tabs={STATUS_TABS}
            activeValue={status}
            onChange={(value) => setStatus(String(value))}
            variant='underline'
          />
        </>
      }
    >
      {pageLoading ? (
        <Loading text='加载中' subtitle='正在获取申请记录...' fullPage />
      ) : requests.length === 0 ? (
        <EmptyState text='暂无申请记录' />
      ) : (
        requests.map((request) => (
          <View key={request.id} className='my-request-card' data-testid={`my-request-${request.id}`}>
            <View className='my-request-header'>
              <Text className='my-request-game'>🎮 {request.gameName}</Text>
              <RequestStatusTag status={request.status} />
            </View>

            <Text className={`my-request-amount ${request.type}`}>
              {request.type === 'deposit' ? '🟢 存分 +' : '🔴 取分 -'}
              {request.amount.toLocaleString()}
            </Text>

            <Text className='my-request-time'>
              ⏰ {request.createdAt ? dayjs(request.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
            </Text>
            {request.remark && (
              <Text className='my-request-remark'>备注: {request.remark}</Text>
            )}
            {request.status === 'rejected' && request.reviewRemark && (
              <Text className='my-request-review'>驳回理由: {request.reviewRemark}</Text>
            )}
            {request.status === 'approved' && request.reviewerName && (
              <Text className='my-request-review'>审核人: {request.reviewerName}</Text>
            )}

            {request.status === 'pending' && (
              <View className='my-request-actions'>
                <Text
                  className='cancel-link'
                  onClick={() => setCancelTarget(request)}
                  data-testid={`btn-cancel-request-${request.id}`}
                >
                  撤销申请
                </Text>
              </View>
            )}
          </View>
        ))
      )}

      <ConfirmDialog
        visible={!!cancelTarget}
        title='撤销申请'
        content='确定要撤销这条申请吗？'
        confirmText='确认撤销'
        confirmType='danger'
        loading={cancelling}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTarget(null)}
      />
    </PageLayout>
  );
};

export default MyScoreRequestsPage;
