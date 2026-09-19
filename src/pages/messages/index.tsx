import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { Toast } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import { useRequest } from 'ahooks';
import { messageApi } from '../../services/api';
import { transformMessageListFromApi } from '../../models';
import { useMessageStore } from '../../store/messageStore';
import { useRefreshOnShow } from '../../hooks';
import {
  useRequireAuth,
  EmptyState,
  FilterTabs,
  LoadMore,
  PageHeader,
  PageLayout,
} from '../../components';
import type { FrontendMessage } from '../../models/types';
import type { MessageScope } from '../../models/service';
import './index.less';

/** 每页条数 */
const PAGE_SIZE = 20;

/**
 * 审批筛选。三者的关系是"互补"而不是"并列"：
 * 未审批 = 还等我处理的，已审批 = 其余全部（我处理过的 + 结果告知），
 * 所以任何一条消息都能且只能落在后两个标签中的一个
 */
const SCOPE_TABS: { value: MessageScope; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '未审批' },
  { value: 'handled', label: '已审批' },
];

/** 各标签下的空态文案。统一一句"暂无消息"会让人以为消息丢了 */
const EMPTY_TEXT: Record<MessageScope, { text: string; subtext?: string }> = {
  all: { text: '暂无消息' },
  pending: { text: '没有待处理的消息', subtext: '需要你审批的事都会出现在这里' },
  handled: { text: '还没有已处理的消息' },
};

/** 消息中心 */
const MessagesPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();

  const refreshUnread = useMessageStore((state) => state.refreshUnread);

  const [scope, setScope] = useState<MessageScope>('all');
  const [messages, setMessages] = useState<FrontendMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // 进入消息中心即视为已读，顺手把红点清掉
  const markAllRead = useCallback(async () => {
    try {
      await messageApi.markAllRead();
      await refreshUnread();
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  }, [refreshUnread]);

  /**
   * 消息列表。
   *
   * 用 useRequest 手动管页码，而不是 ahooks 的 usePagination —— 后者是翻页式抽象
   * （onChange 直接换页、不会追加），与本页的上拉无限滚动不是一回事。
   * 好处是乱序响应由 ahooks 内部按请求序号丢弃，不用再自己记 counter
   */
  const { loading, run } = useRequest(
    (page: number, listScope: MessageScope) =>
      messageApi.getList({ page, page_size: PAGE_SIZE, scope: listScope }),
    {
      manual: true,
      onSuccess: (res, [page]) => {
        const list = transformMessageListFromApi(res.list || []);
        setTotal(res.total);
        setCurrent(page);
        // 第一页是刷新（整体替换），后续页是追加
        setMessages((prev) => (page === 1 ? list : [...prev, ...list]));
        // 只在第一页标已读：翻页时再标一次是白跑一趟，
        // 而进入本页时那一次已经把红点清了
        if (page === 1 && list.length > 0) markAllRead();
      },
      onError: (error) => {
        console.error('加载消息失败:', error);
        Toast.show('messages-toast', { content: error.message || '加载失败' });
      },
    }
  );

  const hasMore = messages.length < total;

  // 首次进入与切换标签都回到第一页重拉。
  // run 是 ahooks 的 useMemoizedFn，引用稳定，所以这个 effect 不会反复触发
  useEffect(() => {
    run(1, scope);
  }, [scope, run]);

  // 从消息详情页返回时刷新：刚审批/驳回的那条，「待处理」徽标要跟着消失
  useRefreshOnShow(() => run(1, scope));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run(1, scope);
    } finally {
      setRefreshing(false);
    }
  }, [run, scope]);

  const handleScrollToLower = useCallback(() => {
    if (hasMore && !loading) {
      run(current + 1, scope);
    }
  }, [hasMore, loading, current, scope, run]);

  if (!isAuthenticated) {
    return <View />;
  }

  const empty = EMPTY_TEXT[scope];

  return (
    <PageLayout
      className='messages-page'
      contentClassName='messages-content'
      header={
        <>
          <Toast id='messages-toast' />
          <PageHeader title='消息中心' showBack />
          {/* 用 ScrollView 而不是普通 View：小程序里 View 的 overflow-x 不滚动，
              标签多一点就会点不到最右边那个 */}
          <View className='scope-tabs'>
            <FilterTabs
              tabs={SCOPE_TABS}
              activeValue={scope}
              onChange={(value) => setScope(value as MessageScope)}
            />
          </View>
        </>
      }
      refresherEnabled
      refresherTriggered={refreshing}
      onRefresherRefresh={handleRefresh}
      onScrollToLower={handleScrollToLower}
      lowerThreshold={100}
    >
      {messages.length > 0 ? (
        <>
          {messages.map((message) => (
            <View
              key={message.id}
              className={`message-card ${message.isRead ? 'read' : 'unread'}`}
              onClick={() =>
                Taro.navigateTo({ url: `/pages/message-detail/index?id=${message.id}` })
              }
              data-testid={`message-${message.id}`}
            >
              <View className='message-header'>
                <Text className='message-title'>{message.title}</Text>
                <View className='message-header-right'>
                  {/* 待处理是"还有事没做"的标记。它不会被自动已读清掉，所以要显式标出来 */}
                  {message.actionable && <Text className='pending-badge'>待处理</Text>}
                  {!message.isRead && <View className='unread-dot' />}
                </View>
              </View>
              <Text className='message-content'>{message.content}</Text>
              <Text className='message-time'>
                {message.createdAt ? dayjs(message.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
              </Text>
            </View>
          ))}
          <LoadMore hasMore={hasMore} loading={loading} />
        </>
      ) : (
        !loading && <EmptyState text={empty.text} subtext={empty.subtext} />
      )}

      {loading && messages.length === 0 && (
        <View className='loading-hint'>
          <Text className='hint-text'>加载中…</Text>
        </View>
      )}
    </PageLayout>
  );
};

export default MessagesPage;
