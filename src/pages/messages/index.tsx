import React, {useCallback, useEffect, useState} from 'react';
import {Text, View} from '@tarojs/components';
import {Toast} from '@nutui/nutui-react-taro';
import Taro, {useDidShow} from '@tarojs/taro';
import dayjs from 'dayjs';
import {messageApi} from '../../services/api';
import {transformMessageListFromApi} from '../../models';
import {useMessageStore} from '../../store/messageStore';
import {useRequireAuth, Loading, EmptyState, PageHeader, PageLayout} from '../../components';
import type {FrontendMessage} from '../../models/types';
import './index.less';

/** 消息中心 */
const MessagesPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();

  const [messages, setMessages] = useState<FrontendMessage[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const refreshUnread = useMessageStore((state) => state.refreshUnread);

  const loadMessages = useCallback(async () => {
    try {
      setPageLoading(true);
      const response: any = await messageApi.getList({page: 1, page_size: 50});
      setMessages(transformMessageListFromApi(response.list || []));
    } catch (error: any) {
      console.error('加载消息失败:', error);
      Toast.show('messages-toast', {content: error.message || '加载失败'});
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useDidShow(() => {
    loadMessages();
  });

  // 进入消息中心即视为已读，顺手把红点清掉
  const markAllRead = useCallback(async () => {
    try {
      await messageApi.markAllRead();
      await refreshUnread();
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  }, [refreshUnread]);

  useEffect(() => {
    if (!pageLoading && messages.length > 0) {
      markAllRead();
    }
  }, [pageLoading, messages.length, markAllRead]);

  if (!isAuthenticated) {
    return <View />;
  }

  return (
    <PageLayout
      className='messages-page'
      contentClassName='messages-content'
      header={
        <>
          <Toast id='messages-toast' />
          <PageHeader title='消息中心' showBack />
        </>
      }
    >
      {pageLoading ? (
        <Loading text='加载中' subtitle='正在获取消息...' fullPage />
      ) : messages.length === 0 ? (
        <EmptyState text='暂无消息' />
      ) : (
        messages.map((message) => (
          <View
            key={message.id}
            className={`message-card ${message.isRead ? 'read' : 'unread'}`}
            onClick={() =>
              Taro.navigateTo({url: `/pages/message-detail/index?id=${message.id}`})
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
        ))
      )}
    </PageLayout>
  );
};

export default MessagesPage;
