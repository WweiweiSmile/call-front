import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { Button } from '@nutui/nutui-react-taro';
import { reviewApi } from '../../services/api';
import { transformReviewMessageFromApi, transformReviewMessageListFromApi } from '../../models';
import type { AnalysisStatus, FrontendReviewMessage } from '../../models/types/review';
import './index.less';

interface ReviewChatPanelProps {
  /** 这次分析（AI 复盘）的 id。对话绑定一次分析，不是手牌 ——
   *  手牌改过并重新分析后是新的一条 analysis，会从空白对话开始 */
  analysisId: string;
  /** 是否已经有分析结论。没有结论就没有可追问的对象 */
  enabled: boolean;
  /** 测试用 id */
  testId?: string;
}

/** 追问的长度上限，与后端的 ChatMessageMaxRunes 保持一致 */
const MAX_LENGTH = 1000;
/** 轮询间隔 */
const POLL_INTERVAL_MS = 2000;
/**
 * 最大轮询次数，2 秒 × 450 = 15 分钟。
 *
 * 与后端的 chatInflightWindow 对齐即可 —— 后端超过这个时长就把任务判成中断，
 * 前端轮得比它久没有意义。撞上时停止等待并**放开输入框**，
 * 否则用户既等不到回答、又因为"还在思考"而问不了话
 */
const MAX_POLLS = 450;

/** 是否已经结束（成功或失败都算结束） */
function isFinished(status: AnalysisStatus): boolean {
  return status === 'done' || status === 'failed';
}

/** 列表里还有没有没答完的追问 */
function hasPending(list: FrontendReviewMessage[]): boolean {
  return list.some((m) => m.role === 'assistant' && !isFinished(m.status));
}

/** 气泡里显示什么。**按状态判，不看 content 是否为空** —— 模型也可能返回空内容 */
function bubbleText(msg: FrontendReviewMessage): string {
  if (msg.role !== 'assistant') return msg.content;
  if (msg.status === 'failed') return msg.errorMsg || '这条没答上来，再问一次试试';
  if (!isFinished(msg.status)) return '教练正在想…';
  return msg.content;
}

const ReviewChatPanel: React.FC<ReviewChatPanelProps> = ({ analysisId, enabled, testId }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<FrontendReviewMessage[]>([]);
  /** 轮询开关。ahooks 靠 useUpdateEffect 监听 pollingInterval 变假值来停表，
   *  所以"结束就停"是把它置成 undefined 实现的，不能调 cancel()——那停不掉定时器 */
  const [polling, setPolling] = useState(false);
  /** 轮询撞上限了。此时不再等待，但输入框必须放开来 */
  const [timedOut, setTimedOut] = useState(false);
  /** 防止重复提交：按钮 disabled 之外再挡一层，避免快速连点发出两条 */
  const sendingRef = useRef(false);
  /** beginPolling 的幂等开关。不挡的话，每次拉历史都会把它重新归零 */
  const pollingRef = useRef(false);
  const pollCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    // 新消息在页面底部，发完顺手滚过去，省得用户自己找
    setTimeout(() => {
      Taro.pageScrollTo({ scrollTop: 99999, duration: 200 }).catch(() => {
        // 小程序里页面还没渲染完时可能失败，忽略
      });
    }, 100);
  }, []);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    setPolling(false);
  }, []);

  // analysisId 变了就是另一段对话：重新分析会产生新的一条 analysis，
  // 上一段的问答和轮询状态都必须清掉，否则旧问答会挂在新结论下面
  useEffect(() => {
    setMessages([]);
    setTimedOut(false);
    stopPolling();
  }, [analysisId, stopPolling]);

  // ---------- 轮询追问状态 ----------
  const { run: pollOnce } = useRequest(
    async () => transformReviewMessageListFromApi((await reviewApi.getMessages(analysisId)).list),
    {
      manual: true,
      pollingInterval: polling ? POLL_INTERVAL_MS : undefined,
      // 页面切到后台就暂停，切回来继续，计数不会因为切后台而白涨
      pollingWhenHidden: false,
      // 计数放在 onFinally 而不是 onSuccess：onSuccess 只在成功时触发，
      // 网络一直失败的话计数永不增长，MAX_POLLS 这道兜底就永远不生效
      onFinally: (_params, data) => {
        if (data) setMessages(data);

        pollCountRef.current += 1;
        if (pollCountRef.current > MAX_POLLS) {
          stopPolling();
          setTimedOut(true);
          Taro.showToast({ title: '教练还没回话，稍后刷新页面看看', icon: 'none', duration: 2500 });
          return;
        }

        if (data && !hasPending(data)) {
          stopPolling();
        }
      },
    }
  );

  const beginPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollCountRef.current = 0;
    setTimedOut(false);
    pollingRef.current = true;
    setPolling(true);
    pollOnce();
  }, [pollOnce]);

  // ---------- 对话历史 ----------
  const { loading: messagesLoading } = useRequest(
    async () => transformReviewMessageListFromApi((await reviewApi.getMessages(analysisId)).list),
    {
      // analysisId 为空（分析还没载入）时不能发请求，否则会打到 /analyses//messages
      ready: enabled && !!analysisId,
      // analysisId 变了要重新拉：新的一条分析是另一段对话。
      // 重新分析会经过 pending→done 让 ready 翻一次，本来也会重跑；
      // 这里是防"id 变了但 enabled 一直是 true"的路径漏掉刷新
      refreshDeps: [analysisId],
      onSuccess: (list) => {
        setMessages(list);
        // 上次离开时可能还没答完，接着轮询 —— beginPolling 自身幂等
        if (hasPending(list)) beginPolling();
      },
      // 对话拉不到不该影响详情页主体，静默即可
      onError: () => {},
    }
  );

  // ---------- 追问 ----------
  const { runAsync: askQuestion, loading: sending } = useRequest(
    (content: string) => reviewApi.askQuestion(analysisId, content),
    {
      manual: true,
      onSuccess: (res) => {
        const question = transformReviewMessageFromApi(res.question);
        const answer = transformReviewMessageFromApi(res.answer);

        // 按 id 去重：后端可能把"正在跑的那对"原样还回来，那两条已经在列表里了
        setMessages((prev) =>
          prev.some((m) => m.id === answer.id) ? prev : [...prev, question, answer]
        );

        if (res.inflight) {
          // 本次输入没有落库（被在飞闸挡住了），所以**不清空输入框**，
          // 等上一条答完用户可以直接重发
          Taro.showToast({ title: '上一条还在想，等它答完再问', icon: 'none', duration: 2500 });
        } else {
          setInput('');
        }

        beginPolling();
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

  // 还有没答完的就禁用输入：追问是一条一条来的，不该并行烧两次模型调用。
  // 但撞了轮询上限要放开，否则用户既没结果也问不了话
  const waiting = !timedOut && hasPending(messages);

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
              <View className={`bubble ${msg.role} ${msg.status === 'failed' ? 'failed' : ''}`}>
                <Text className='bubble-text'>{bubbleText(msg)}</Text>
              </View>
            </View>
          ))}

          <View className='chat-input-row'>
            <View className='input-box'>
              <Input
                className='chat-input'
                value={input}
                placeholder={waiting ? '等教练答完这一条…' : '追问点什么…'}
                confirmType='send'
                disabled={sending || waiting}
                onInput={(e) => setInput(e.detail.value)}
                onConfirm={handleSend}
                data-testid='chat-input'
              />
            </View>
            <Button
              type='primary'
              size='small'
              loading={sending}
              disabled={sending || waiting}
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
