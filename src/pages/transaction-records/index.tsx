import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from '@tarojs/components';
import Taro, {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {transactionApi} from '../../services/api';
import {transformTransactionListFromApi} from '../../models';
import {useRequireAuth, Loading, PageHeader} from '../../components';
import type {FrontendTransaction} from '../../models/types';
import './index.less';

const ALL_PAGE_SIZE = 1000;

const TransactionRecordsPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();

  const gameId = (router.params?.gameId as string) || '';
  const userId = (router.params?.userId as string) || undefined;
  const viewMode = (router.params?.viewMode as string) || 'self';

  const [transactions, setTransactions] = useState<FrontendTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 加载所有交易记录
  const loadAllTransactions = useCallback(async () => {
    if (!gameId) {
      setPageLoading(false);
      return;
    }
    try {
      setPageLoading(true);
      setLoadError('');
      const params: any = {page: 1, page_size: ALL_PAGE_SIZE};
      if (userId) {
        params.user_id = userId;
      }
      const response: any = await transactionApi.getGameTransactions(gameId, params);
      const list = transformTransactionListFromApi(response.list || []);
      setTransactions(list);
      setTotal(response.total || 0);
    } catch (error: any) {
      console.error('加载交易记录失败:', error);
      setLoadError(error.message || '加载失败');
    } finally {
      setPageLoading(false);
    }
  }, [gameId, userId]);

  useEffect(() => {
    loadAllTransactions();
  }, [loadAllTransactions]);

  // 如果未认证，不渲染内容
  if (!isAuthenticated || !gameId) {
    return <View />;
  }

  return (
    <View className='transaction-records-page'>
      <PageHeader title='操作记录' showBack />

      {pageLoading ? (
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
          <View className='total-info'>
            <Text className='total-text'>共 {total} 条操作记录</Text>
          </View>
          <ScrollView className='records-list' scrollY>
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
          </ScrollView>
        </>
      )}
    </View>
  );
};

export default TransactionRecordsPage;
