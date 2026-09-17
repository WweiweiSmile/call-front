import React from 'react';
import {Text, View} from '@tarojs/components';
import {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {transactionApi} from '../../services/api';
import {transformTransactionListFromApi} from '../../models';
import {usePageData} from '../../hooks';
import {useRequireAuth, Loading, PageHeader, PageLayout} from '../../components';
import type {FrontendTransaction} from '../../models/types';
import './index.less';

const ALL_PAGE_SIZE = 1000;

/** 没有数据时的稳定空值，避免渲染层每轮都拿到新对象 */
const EMPTY_TRANSACTIONS: FrontendTransaction[] = [];
const EMPTY_RESULT = {list: EMPTY_TRANSACTIONS, total: 0};

const TransactionRecordsPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const userId = (router.params?.userId as string) || undefined;
  const viewMode = (router.params?.viewMode as string) || 'self';


  const {data, isFirstLoading, error} = usePageData(
    async () => {
      if (!gameId) return EMPTY_RESULT;
      const params: any = {page: 1, page_size: ALL_PAGE_SIZE};
      if (userId) {
        params.user_id = userId;
      }
      const response: any = await transactionApi.getGameTransactions(gameId, params);
      return {
        list: transformTransactionListFromApi(response.list || []),
        total: response.total || 0,
      };
    },
    {
      refreshDeps: [gameId, userId],
      onError: (e) => console.error('加载交易记录失败:', e),
    }
  );

  const transactions = data?.list ?? EMPTY_TRANSACTIONS;
  const total = data?.total ?? 0;
  const loadError = error?.message || '';

  // 如果未认证，不渲染内容
  if (!isAuthenticated || !gameId) {
    return <View />;
  }

  return (
    <PageLayout
      className='transaction-records-page'
      contentClassName='records-list'
      header={
        <>
          <PageHeader title='操作记录' showBack />
          {/* 条数信息固定在顶部，不随列表滚动 */}
          {!isFirstLoading && !loadError && transactions.length > 0 && (
            <View className='total-info'>
              <Text className='total-text'>共 {total} 条操作记录</Text>
            </View>
          )}
        </>
      }
    >
      {isFirstLoading ? (
        <Loading text='加载中' subtitle='正在获取操作记录...' fullPage />
      ) : loadError ? (
        <View className='error-state'>
          <Text className='error-text'>{loadError}</Text>
        </View>
      ) : transactions.length === 0 ? (
        <View className='empty-state'>
          <Text className='empty-icon'>📋</Text>
          <Text className='empty-text'>暂无操作记录</Text>
        </View>
      ) : (
        <>
            {transactions.map((tx) => (
              <View key={tx.id} className='record-item'>
                <Text className='record-time'>
                  ⏰ {tx.createdAt ? dayjs(tx.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
                </Text>
                <View className='record-main'>
                  <Text className={`record-type ${tx.type === 'deposit' ? 'deposit' : 'withdraw'}`}>
                    {tx.type === 'deposit' ? '🟢 存分' : '🔴 取分'}{' '}
                    {tx.type === 'deposit' ? '+' : '-'}{tx.amount.toLocaleString()}
                    {tx.isProxy && ` (${viewMode === 'self' ? '代理' : tx.userName || ''})`}
                  </Text>
                  {tx.isProxy && viewMode === 'self' && (
                    <Text className='record-operator'>{tx.operatorName}操作</Text>
                  )}
                  <Text className='record-balance'>余额: {tx.balanceAfter.toLocaleString()}</Text>
                  {tx.remark && (
                    <Text className='record-remark'>备注: {tx.remark}</Text>
                  )}
                </View>
              </View>
            ))}
        </>
      )}
    </PageLayout>
  );
};

export default TransactionRecordsPage;
