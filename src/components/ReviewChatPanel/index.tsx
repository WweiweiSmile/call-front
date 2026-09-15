import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Button } from '@nutui/nutui-react-taro';
import { reviewApi } from '../../services/api';
import { transformReviewMessageFromApi, transformReviewMessageListFromApi } from '../../models';
import type { FrontendReviewMessage } from '../../models/types/review';
import './index.less';

interface ReviewChatPanelProps {
  handId: string;
  /** 是否已经有分析结论。没有结论就没有可追问的对象 */
  enabled: boolean;
  /** 测试用 id */
  testId?: string;
}

/** 追问的长度上限，与后端的 ChatMessageMaxRunes 保持一致 */
const MAX_LENGTH = 1000;

const ReviewChatPanel: React.FC<ReviewChatPanelProps> = ({ handId, enabled, testId }) => {
  const [messages, setMessages] = useState<FrontendReviewMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** 防止重复提交：按钮 disabled 之外再挡一层，避免快速连点发出两条 */
  const sendingRef = useRef(false);

  const loadMessages = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await reviewApi.getMessages(handId);
      setMessages(transformReviewMessageListFromApi(res.list));
    } catch {
      // 对话拉不到不该影响详情页主体，静默即可
    } finally {
      setLoading(false);
    }
  }, [handId, enabled]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const scrollToBottom = useCallback(() => {
    // 新消息在页面底部，发完顺手滚过去，省得用户自己找
    setTimeout(() => {
      Taro.pageScrollTo({ scrollTop: 99999, duration: 200 }).catch(() => {
        // 小程序里页面还没渲染完时可能失败，忽略
      });
    }, 100);
  }, []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content) {
      Taro.showToast({ title: '先写点什么再问', icon: 'none' });
      return;
    }
    if (content.length > MAX_LENGTH) {
      Taro.showToast({ title: `追问不能超过 ${MAX_LENGTH} 字`, icon: 'none' });
      return;
    }
    if (sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    try {
      const res = await reviewApi.askQuestion(handId, content);
      // 一问一答都由后端返回，直接追加，不必重新拉整段历史
      setMessages((prev) => [
        ...prev,
        transformReviewMessageFromApi(res.question),
        transformReviewMessageFromApi(res.answer),
      ]);
      setInput('');
      scrollToBottom();
    } catch (e: any) {
      // 失败时保留输入框内容，用户改一改就能重发
      Taro.showToast({ title: e?.message || '追问失败', icon: 'none', duration: 2500 });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [input, handId, scrollToBottom]);

  return (
    <View className='review-chat-panel' data-testid={testId}>
      <Text className='section-title'>问问教练</Text>

      {!enabled ? (
        <Text className='chat-hint'>先让 AI 分析这手牌，之后就能针对结论继续追问了。</Text>
      ) : (
        <>
          {messages.length === 0 && !loading && (
            <Text className='chat-hint'>
              对分析结论有疑问？比如「如果我转牌 check-raise 呢？」
            </Text>
          )}

          {messages.map((msg) => (
            <View key={msg.id} className={`bubble-row ${msg.role}`}>
              <View className={`bubble ${msg.role}`}>
                <Text className='bubble-text'>{msg.content}</Text>
              </View>
            </View>
          ))}

          {sending && (
            <View className='bubble-row assistant'>
              <View className='bubble assistant typing'>
                <Text className='bubble-text'>教练正在想…</Text>
              </View>
            </View>
          )}

          <View className='chat-input-row'>
            <View className='input-box'>
              <Input
                className='chat-input'
                value={input}
                placeholder='追问点什么…'
                confirmType='send'
                disabled={sending}
                onInput={(e) => setInput(e.detail.value)}
                onConfirm={handleSend}
                data-testid='chat-input'
              />
            </View>
            <Button
              type='primary'
              size='small'
              loading={sending}
              disabled={sending}
              onClick={handleSend}
              data-testid='btn-chat-send'
            >
              发送
            </Button>
          </View>
          <Text className='chat-note'>
            追问会真实调用模型，但不占用每日的分析次数
          </Text>
        </>
      )}
    </View>
  );
};

export default ReviewChatPanel;
