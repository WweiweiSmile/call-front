import React, { useCallback, useRef, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { Button } from '@nutui/nutui-react-taro';
import { reviewApi } from '../../services/api';
import { transformReviewMessageFromApi, transformReviewMessageListFromApi } from '../../models';
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
  const [input, setInput] = useState('');
  /** 防止重复提交：按钮 disabled 之外再挡一层，避免快速连点发出两条。
   *  ahooks 的 loading 是异步 setState，同一 tick 内连点仍会放行两次 */
  const sendingRef = useRef(false);

  // ---------- 对话历史 ----------
  const {
    data: messages = [],
    loading: messagesLoading,
    mutate: setMessages,
  } = useRequest(
    async () => transformReviewMessageListFromApi((await reviewApi.getMessages(handId)).list),
    {
      ready: enabled,
      // 对话拉不到不该影响详情页主体，静默即可
      onError: () => {},
    }
  );

  const scrollToBottom = useCallback(() => {
    // 新消息在页面底部，发完顺手滚过去，省得用户自己找
    setTimeout(() => {
      Taro.pageScrollTo({ scrollTop: 99999, duration: 200 }).catch(() => {
        // 小程序里页面还没渲染完时可能失败，忽略
      });
    }, 100);
  }, []);

  // ---------- 追问 ----------
  const { runAsync: askQuestion, loading: sending } = useRequest(
    (content: string) => reviewApi.askQuestion(handId, content),
    {
      manual: true,
      onSuccess: (res) => {
        // 一问一答都由后端返回，直接追加，不必重新拉整段历史
        setMessages((prev = []) => [
          ...prev,
          transformReviewMessageFromApi(res.question),
          transformReviewMessageFromApi(res.answer),
        ]);
        setInput('');
        scrollToBottom();
      },
      // 失败时保留输入框内容，用户改一改就能重发
      onError: (e) =>
        Taro.showToast({ title: e?.message || '追问失败', icon: 'none', duration: 2500 }),
    }
  );

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
    try {
      await askQuestion(content);
    } catch {
      // onError 已经提示过，输入框内容保留
    } finally {
      sendingRef.current = false;
    }
  }, [input, askQuestion]);

  return (
    <View className='review-chat-panel' data-testid={testId}>
      <Text className='section-title'>问问教练</Text>

      {!enabled ? (
        <Text className='chat-hint'>先让 AI 分析这手牌，之后就能针对结论继续追问了。</Text>
      ) : (
        <>
          {messages.length === 0 && !messagesLoading && (
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
