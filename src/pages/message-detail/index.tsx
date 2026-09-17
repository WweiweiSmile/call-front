import React, {useCallback, useState} from 'react';
import {Input, Text, Textarea, View} from '@tarojs/components';
import {Button, Toast} from '@nutui/nutui-react-taro';
import {useRouter} from '@tarojs/taro';
import dayjs from 'dayjs';
import {messageApi, scoreRequestApi, tagSuggestionApi} from '../../services/api';
import {usePageData} from '../../hooks';
import {transformMessageDetailFromApi} from '../../models';
import {useMessageStore} from '../../store/messageStore';
import {
  useRequireAuth,
  Loading,
  EmptyState,
  PageHeader,
  PageLayout,
  ConfirmDialog,
} from '../../components';
import type {LeakTagCategory} from '../../models/types';
import './index.less';

/** 标签分类的中文名，与标签字典的分类一一对应 */
const TAG_CATEGORIES: {value: LeakTagCategory; label: string}[] = [
  {value: 'preflop', label: '翻前'},
  {value: 'postflop', label: '翻后'},
  {value: 'mental', label: '心态'},
  {value: 'bankroll', label: '资金管理'},
];

/**
 * 补全标签词典字段的表单。
 *
 * 模型只给了 name 与 reason，而提示词里让模型选标签靠的是 code + name + description，
 * 所以 code 与分类必须由审批人补齐 —— 直接拿模型编的字符串入库，
 * 等于把"字典外的标签"原样塞进字典，还是聚不了合
 */
interface TagForm {
  name: string;
  code: string;
  /** 空串表示还没选。刻意不给默认值，分类选错了标签就归错组了 */
  category: LeakTagCategory | '';
  description: string;
}

/**
 * 消息详情。
 *
 * 分两类，由后端的 category 决定，前端不自己按 type 映射（避免两处判定漂移）：
 * - notice   只显示标题与正文
 * - approval 额外出「拒绝 / 通过」，待处理才可点，处理完显示结果
 *
 * 审批动作按 type 分发：存取分申请走 scoreRequestApi，AI 新标签走 tagSuggestionApi。
 */
const MessageDetailPage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const router = useRouter();
  const messageId = (router.params?.id as string) || '';

  const [processing, setProcessing] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [tagForm, setTagForm] = useState<TagForm | null>(null);

  const refreshUnread = useMessageStore((state) => state.refreshUnread);
  const refreshPending = useMessageStore((state) => state.refreshPending);

  // 回到本页时重拉是有意义的：另一个管理员可能已经处理了这条待审。
  // 刷新期间不铺全屏 loading（见 isFirstLoading），所以不会有"页面被刷掉"的观感
  const {
    data: detail,
    isFirstLoading,
    refresh: loadDetail,
  } = usePageData(
    async () => transformMessageDetailFromApi(await messageApi.getDetail(messageId)),
    {
      ready: !!messageId,
      refreshDeps: [messageId],
      onError: (error) => console.error('加载消息详情失败:', error),
    }
  );

  /** 审批动作成功后：刷新红点与角标，并重拉详情让它切到"已处理"态 */
  const afterHandled = useCallback(async () => {
    // 处理完的消息才算真正读完。这里标记已读不破坏"待处理不自动已读"的规则
    try {
      await messageApi.markRead(messageId);
    } catch (error) {
      // 已读过了会报错，静默即可
    }
    await refreshUnread();
    if (detail?.gameId) {
      await refreshPending(detail.gameId);
    }
    await loadDetail();
  }, [messageId, refreshUnread, refreshPending, detail?.gameId, loadDetail]);

  // ---------- 存取分申请 ----------

  const approveScoreRequest = useCallback(async () => {
    if (!detail?.requestId) return;
    try {
      setProcessing(true);
      await scoreRequestApi.approve(detail.requestId);
      Toast.show('message-detail-toast', {content: '已通过，分数已入库'});
      await afterHandled();
    } catch (error: any) {
      Toast.show('message-detail-toast', {content: error.message || '操作失败'});
      // 很可能是别人已在审核页处理过：重拉一次，页面自己切到已处理态
      await loadDetail();
    } finally {
      setProcessing(false);
    }
  }, [detail?.requestId, afterHandled, loadDetail]);

  // ---------- AI 新标签入库 ----------

  const openTagForm = useCallback(() => {
    const suggestion = detail?.tagSuggestion;
    setTagForm({
      name: suggestion?.name || '',
      // code 是模型引用标签的唯一标识，给个不会与现有词典冲突的默认值，允许改成有语义的短码
      code: `custom_${detail?.suggestionId || ''}`,
      category: '',
      description: suggestion?.reason || '',
    });
  }, [detail?.tagSuggestion, detail?.suggestionId]);

  const approveTagSuggestion = useCallback(async () => {
    if (!detail?.suggestionId || !tagForm) return;

    const code = tagForm.code.trim();
    const name = tagForm.name.trim();
    if (!name) {
      Toast.show('message-detail-toast', {content: '请填写标签名称'});
      return;
    }
    if (!code) {
      Toast.show('message-detail-toast', {content: '请填写标签 code'});
      return;
    }
    if (!tagForm.category) {
      Toast.show('message-detail-toast', {content: '请选择标签分类'});
      return;
    }

    try {
      setProcessing(true);
      await tagSuggestionApi.approve(detail.suggestionId, {
        code,
        name,
        category: tagForm.category,
        description: tagForm.description.trim(),
      });
      setTagForm(null);
      Toast.show('message-detail-toast', {content: '已入库，对所有人生效'});
      await afterHandled();
    } catch (error: any) {
      // code 冲突是可修复的错误：保持弹窗打开让管理员换一个 code 再提交
      Toast.show('message-detail-toast', {content: error.message || '操作失败'});
      await loadDetail();
    } finally {
      setProcessing(false);
    }
  }, [detail?.suggestionId, tagForm, afterHandled, loadDetail]);

  // ---------- 通过 / 拒绝入口 ----------

  const handleApprove = useCallback(() => {
    switch (detail?.type) {
      case 'score_request_created':
        approveScoreRequest();
        return;
      case 'tag_suggestion_pending':
        openTagForm();
        return;
      default:
        Toast.show('message-detail-toast', {content: '该消息不支持此操作'});
    }
  }, [detail?.type, approveScoreRequest, openTagForm]);

  const handleRejectConfirm = useCallback(async () => {
    if (!detail) return;
    if (!rejectReason.trim()) {
      Toast.show('message-detail-toast', {content: '请填写驳回理由'});
      return;
    }

    try {
      setProcessing(true);
      if (detail.type === 'tag_suggestion_pending' && detail.suggestionId) {
        await tagSuggestionApi.reject(detail.suggestionId, {
          reviewRemark: rejectReason.trim(),
        });
      } else if (detail.requestId) {
        await scoreRequestApi.reject(detail.requestId, {
          reviewRemark: rejectReason.trim(),
        });
      }
      Toast.show('message-detail-toast', {content: '已驳回'});
      setRejectVisible(false);
      setRejectReason('');
      await afterHandled();
    } catch (error: any) {
      Toast.show('message-detail-toast', {content: error.message || '操作失败'});
      setRejectVisible(false);
      await loadDetail();
    } finally {
      setProcessing(false);
    }
  }, [detail, rejectReason, afterHandled, loadDetail]);

  if (!isAuthenticated) {
    return <View />;
  }

  /** 处理完之后的结论文案。状态取自关联单据，不由消息自己记 */
  const handledLabel = (() => {
    if (detail?.type === 'tag_suggestion_pending') {
      switch (detail.tagSuggestion?.status) {
        case 'approved':
          return '已入库，对所有人生效';
        case 'rejected':
          return '已驳回';
        default:
          return '该建议已处理';
      }
    }
    switch (detail?.scoreRequest?.status) {
      case 'approved':
        return '已通过';
      case 'rejected':
        return '已驳回';
      case 'cancelled':
        return '申请人已撤销';
      default:
        return '该消息已处理';
    }
  })();

  const handledRemark =
    detail?.type === 'tag_suggestion_pending'
      ? detail?.tagSuggestion?.reviewRemark
      : detail?.scoreRequest?.reviewRemark;

  /** 审批类消息的底部区域：待处理出按钮，处理完出结果 */
  const renderApprovalBottom = () => {
    if (!detail) return null;

    const canAct =
      detail.actionable &&
      (detail.type === 'tag_suggestion_pending' ? !!detail.suggestionId : !!detail.requestId);

    if (canAct) {
      return (
        <View className='approval-actions'>
          <Button
            className='action-btn'
            type='danger'
            onClick={() => {
              setRejectReason('');
              setRejectVisible(true);
            }}
            data-testid='btn-message-reject'
          >
            拒绝
          </Button>
          <Button
            className='action-btn'
            type='success'
            loading={processing && !tagForm}
            onClick={handleApprove}
            data-testid='btn-message-approve'
          >
            通过
          </Button>
        </View>
      );
    }

    return (
      <View className='approval-handled' data-testid='message-handled'>
        <Text className='handled-label'>{handledLabel}</Text>
        {handledRemark ? <Text className='handled-remark'>理由：{handledRemark}</Text> : null}
      </View>
    );
  };

  return (
    <PageLayout
      className='message-detail-page'
      contentClassName='message-detail-content'
      bottom={detail?.category === 'approval' ? renderApprovalBottom() : undefined}
      header={
        <>
          <Toast id='message-detail-toast' />
          <PageHeader title='消息详情' showBack />
        </>
      }
    >
      {isFirstLoading ? (
        <Loading text='加载中' subtitle='正在获取消息...' fullPage />
      ) : !detail ? (
        <EmptyState text='消息不存在' subtext='它可能已被删除' />
      ) : (
        <View className='detail-card'>
          <Text className='detail-title' data-testid='detail-title'>
            {detail.title}
          </Text>
          <Text className='detail-time'>
            {detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
          </Text>
          <Text className='detail-content' data-testid='detail-content'>
            {detail.content}
          </Text>

          {/* 存取分申请：正文里没有申请人备注，让审批人闭眼批钱不合适 */}
          {detail.scoreRequest && (
            <View className='request-block'>
              <View className='request-row'>
                <Text className='request-label'>申请人</Text>
                <Text className='request-value'>{detail.scoreRequest.userName}</Text>
              </View>
              <View className='request-row'>
                <Text className='request-label'>场次</Text>
                <Text className='request-value'>{detail.scoreRequest.gameName}</Text>
              </View>
              <View className='request-row'>
                <Text className='request-label'>类型</Text>
                <Text className={`request-value ${detail.scoreRequest.type}`}>
                  {detail.scoreRequest.type === 'deposit' ? '存分' : '取分'}
                </Text>
              </View>
              <View className='request-row'>
                <Text className='request-label'>数量</Text>
                <Text className='request-value'>
                  {detail.scoreRequest.amount.toLocaleString()} 分
                </Text>
              </View>
              <View className='request-row'>
                <Text className='request-label'>申请人备注</Text>
                <Text className='request-value'>{detail.scoreRequest.remark || '（未填写）'}</Text>
              </View>
            </View>
          )}

          {/* 标签建议：完整理由只在详情页展示，消息正文里是截断过的 */}
          {detail.tagSuggestion && (
            <View className='request-block'>
              <View className='request-row'>
                <Text className='request-label'>提议标签</Text>
                <Text className='request-value'>{detail.tagSuggestion.name}</Text>
              </View>
              <View className='request-row'>
                <Text className='request-label'>被提议次数</Text>
                <Text className='request-value'>{detail.tagSuggestion.hitCount} 次</Text>
              </View>
              <View className='suggestion-reason'>
                <Text className='request-label'>模型理由</Text>
                <Text className='reason-text'>{detail.tagSuggestion.reason || '（未给出）'}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 驳回理由弹窗：两类审批共用 */}
      <ConfirmDialog
        visible={rejectVisible}
        title='驳回'
        content={
          <View className='reject-reason-box'>
            <Text className='reject-reason-hint'>
              {detail?.type === 'tag_suggestion_pending'
                ? `拒绝把「${detail?.tagSuggestion?.name || ''}」加入漏洞标签字典`
                : detail?.scoreRequest
                  ? `${detail.scoreRequest.userName} 的${
                      detail.scoreRequest.type === 'deposit' ? '存分' : '取分'
                    }申请 ${detail.scoreRequest.amount.toLocaleString()} 分`
                  : ''}
            </Text>
            <Input
              className='reject-reason-input'
              placeholder='请填写驳回理由'
              value={rejectReason}
              onInput={(e) => setRejectReason(e.detail.value)}
              data-testid='input-message-reject-reason'
            />
          </View>
        }
        confirmText='确认驳回'
        confirmType='danger'
        loading={processing}
        onConfirm={handleRejectConfirm}
        onCancel={() => {
          setRejectVisible(false);
          setRejectReason('');
        }}
      />

      {/* 标签入库表单：code 与分类必须由审批人补齐才允许落库 */}
      <ConfirmDialog
        visible={!!tagForm}
        title='标签入库'
        content={
          tagForm && (
            <View className='tag-form'>
              <Text className='tag-form-hint'>
                入库后该标签对所有用户生效，并进入 AI 的标签表
              </Text>

              <Text className='tag-form-label'>标签名称</Text>
              <Input
                className='tag-form-input'
                placeholder='中文名，会显示在分析结果里'
                value={tagForm.name}
                onInput={(e) => setTagForm({...tagForm, name: e.detail.value})}
                data-testid='input-tag-name'
              />

              <Text className='tag-form-label'>code</Text>
              <Input
                className='tag-form-input'
                placeholder='英文短码，AI 引用它'
                value={tagForm.code}
                onInput={(e) => setTagForm({...tagForm, code: e.detail.value})}
                data-testid='input-tag-code'
              />

              <Text className='tag-form-label'>分类</Text>
              <View className='category-picker' data-testid='picker-tag-category'>
                {TAG_CATEGORIES.map((item) => (
                  <Text
                    key={item.value}
                    className={`category-chip ${
                      tagForm.category === item.value ? 'active' : ''
                    }`}
                    onClick={() => setTagForm({...tagForm, category: item.value})}
                    data-testid={`chip-category-${item.value}`}
                  >
                    {item.label}
                  </Text>
                ))}
              </View>

              <Text className='tag-form-label'>判定说明</Text>
              <Textarea
                className='tag-form-textarea'
                placeholder='写给模型看的判定口径'
                value={tagForm.description}
                onInput={(e) => setTagForm({...tagForm, description: e.detail.value})}
                data-testid='input-tag-description'
              />
            </View>
          )
        }
        confirmText='确认入库'
        confirmType='success'
        loading={processing}
        onConfirm={approveTagSuggestion}
        onCancel={() => setTagForm(null)}
      />
    </PageLayout>
  );
};

export default MessageDetailPage;
