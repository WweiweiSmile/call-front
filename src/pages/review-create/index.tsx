import React, { useCallback, useMemo, useState } from 'react';
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro, { useRouter } from '@tarojs/taro';
import {
  AddOpponentDialog,
  CardPicker,
  ConfirmDialog,
  Loading,
  PageHeader,
  PageLayout,
  StreetActionEditor,
  useRequireAuth,
} from '../../components';
import {
  POT_TYPE_LABEL,
  RESULT_LABEL,
  STREET_ORDER,
  STREET_LABEL,
  TABLE_SIZE_OPTIONS,
  UNNAMED_VILLAIN_LABEL,
  formatBB,
  positionLabel,
  positionsForTableSize,
  preflopPotBb,
} from '../../utils/poker';
import { useReviewForm } from './useReviewForm';
import type { OpponentDraft } from '../../components/AddOpponentDialog';
import type { HandResult, Position, TableSize } from '../../models/types/review';
import type { VillainFormItem } from './useReviewForm';
import './index.less';

const RESULTS: HandResult[] = ['win', 'lose', 'fold', 'unknown'];

const ReviewCreatePage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const handId = router.params?.id as string | undefined;

  const {
    form,
    isEditMode,
    loading,
    submitting,
    pots,
    blinds,
    potType,
    defaultTitle,
    myGames,
    expandedStreets,
    tagInput,
    heroUnavailableCards,
    boardUnavailableCards,
    actorOptions,
    foldedActors,
    firstActorByStreet,
    remainingStacksByStreet,
    takenPositions,
    hasKeyVillain,
    setField,
    setTableSize,
    setStreetActions,
    toggleStreet,
    handleBoardChange,
    addVillain,
    updateVillain,
    removeVillain,
    setTagInput,
    addTag,
    removeTag,
    submit,
    validate,
  } = useReviewForm(handId);

  // 「没写想法」的二次确认
  const [thoughtWarnVisible, setThoughtWarnVisible] = useState(false);

  // 添加 / 编辑对手弹窗。editingIndex 为 null 表示新增
  const [opponentDialogVisible, setOpponentDialogVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // 删除对手的二次确认下标
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);

  const openAddOpponent = useCallback(() => {
    setEditingIndex(null);
    setOpponentDialogVisible(true);
  }, []);

  const openEditOpponent = useCallback((index: number) => {
    setEditingIndex(index);
    setOpponentDialogVisible(true);
  }, []);

  const handleOpponentConfirm = useCallback((draft: OpponentDraft) => {
    const item: VillainFormItem = {
      name: draft.name,
      position: draft.position,
      stackBb: draft.stackBb !== undefined ? String(draft.stackBb) : '',
      isKey: draft.isKey,
    };
    if (editingIndex === null) {
      addVillain(item);
    } else {
      updateVillain(editingIndex, item);
    }
    setOpponentDialogVisible(false);
  }, [editingIndex, addVillain, updateVillain]);

  // 删掉对手会连带删掉他在行动记录里的行，所以先算清楚有多少条要说给用户听
  const removeTargetVillain = removeTarget !== null ? form.villains[removeTarget] : null;
  const removeTargetActions = removeTargetVillain?.position
    ? form.streets.reduce(
        (sum, record) =>
          sum + record.actions.filter((a) => a.actor === removeTargetVillain.position).length,
        0
      )
    : 0;

  const handleRemoveOpponent = useCallback(() => {
    if (removeTarget === null) return;
    removeVillain(removeTarget);
    setRemoveTarget(null);
  }, [removeTarget, removeVillain]);

  // 弹窗的初始值。做成稳定引用：每次渲染都新建对象的话，
  // 弹窗里那个"打开时重置"的 effect 会跟着每次渲染重跑，把用户正在填的内容冲掉
  const editingVillain = editingIndex !== null ? form.villains[editingIndex] : undefined;
  const editingInitial = useMemo<OpponentDraft | null>(() => {
    if (!editingVillain) return null;
    return {
      name: editingVillain.name,
      position: editingVillain.position as Position,
      stackBb: editingVillain.stackBb ? Number(editingVillain.stackBb) : undefined,
      isKey: editingVillain.isKey,
    };
  }, [editingVillain]);

  // 编辑时要放开他自己占的那个位置，否则当前选中项会显示成"已占用"的灰态
  const dialogTakenPositions = useMemo(
    () => takenPositions.filter((pos) => pos !== editingVillain?.position),
    [takenPositions, editingVillain]
  );

  const handleSubmit = useCallback(async () => {
    // 想法是选填的，但它是复盘价值的来源 —— 空着不阻断保存，只提醒一次
    if (!form.heroThought.trim()) {
      const error = validate();
      if (error) {
        Taro.showToast({ title: error, icon: 'none', duration: 2500 });
        return;
      }
      setThoughtWarnVisible(true);
      return;
    }

    const ok = await submit();
    if (ok) {
      setTimeout(() => Taro.navigateBack(), 600);
    }
  }, [form.heroThought, validate, submit]);

  const handleConfirmNoThought = useCallback(async () => {
    setThoughtWarnVisible(false);
    const ok = await submit();
    if (ok) {
      setTimeout(() => Taro.navigateBack(), 600);
    }
  }, [submit]);

  if (!isAuthenticated) return <View />;
  if (loading) return <Loading fullPage text='加载手牌' />;

  const boardCount = form.board.length / 2;
  // 位置的可选项由人数决定，改了人数这里的列表跟着变
  const positionOptions = positionsForTableSize(form.tableSize);

  return (
    <>
    <PageLayout
      className='review-create-page'
      contentClassName='form-content'
      header={
        <PageHeader
          title={isEditMode ? '编辑手牌' : '记录一手牌'}
          showBack
        />
      }
      bottom={
        <View className='page-footer'>
          <Button
            type='primary'
            block
            loading={submitting}
            disabled={submitting}
            onClick={handleSubmit}
          >
            {isEditMode ? '保存修改' : '记录这手牌'}
          </Button>
        </View>
      }
    >
        {/* ---------- 关联场次 ---------- */}
        <View className='section'>
          <Text className='section-title'>关联场次</Text>
          <Text className='section-hint'>选填。不关联也可以，复盘不依赖场次</Text>
          <ScrollView className='game-scroll' scrollX>
            <View className='game-chips'>
              <View
                className={`game-chip ${!form.gameId ? 'active' : ''}`}
                onClick={() => setField('gameId', undefined)}
              >
                <Text className='chip-text'>不关联</Text>
              </View>
              {myGames.map((game) => (
                <View
                  key={game.id}
                  className={`game-chip ${form.gameId === game.id ? 'active' : ''}`}
                  onClick={() => setField('gameId', game.id)}
                >
                  <Text className='chip-text'>{game.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ---------- 我的手牌 ---------- */}
        <View className='section'>
          <Text className='section-title'>我的手牌</Text>

          <View className='field'>
            <Text className='field-label'>几人桌</Text>
            <View className='position-grid'>
              {TABLE_SIZE_OPTIONS.map((size) => (
                <View
                  key={size}
                  className={`position-btn ${form.tableSize === size ? 'active' : ''}`}
                  onClick={() => setTableSize(size as TableSize)}
                >
                  <Text className='pos-text'>{size}</Text>
                </View>
              ))}
            </View>
            <Text className='field-note'>
              位置的含义随人数变化，选完人数下面的位置会对上
            </Text>
          </View>

          <View className='field'>
            <Text className='field-label'>位置</Text>
            <View className='position-grid'>
              {positionOptions.map((pos) => (
                <View
                  key={pos}
                  className={`position-btn ${form.heroPosition === pos ? 'active' : ''}`}
                  onClick={() => setField('heroPosition', pos)}
                >
                  <Text className='pos-text'>{positionLabel(pos, form.tableSize)}</Text>
                </View>
              ))}
            </View>
            {form.tableSize === 2 && (
              <Text className='field-note'>单挑时 SB 同时是 BTN，按 SB 记录即可</Text>
            )}
          </View>

          <View className='field'>
            <Text className='field-label'>底牌</Text>
            <CardPicker
              value={form.heroCards}
              onChange={(cards) => setField('heroCards', cards)}
              max={2}
              disabledCards={heroUnavailableCards}
              placeholder='选择 2 张底牌'
            />
          </View>

          <View className='field-row'>
            <View className='field half'>
              <Text className='field-label'>有效筹码</Text>
              <View className='input-box'>
                <Input
                  className='input'
                  type='digit'
                  value={form.heroStackBb}
                  placeholder='100'
                  onInput={(e) => setField('heroStackBb', e.detail.value)}
                />
                <Text className='unit'>bb</Text>
              </View>
            </View>
            <View className='field half'>
              <Text className='field-label'>盲注级别</Text>
              <View className='input-box'>
                <Input
                  className='input'
                  value={form.stakes}
                  placeholder='如 5/10'
                  onInput={(e) => setField('stakes', e.detail.value)}
                />
              </View>
            </View>
          </View>
        </View>

        {/* ---------- 盲注与前注 ---------- */}
        <View className='section'>
          <Text className='section-title'>盲注与前注</Text>
          <Text className='section-hint'>
            默认值来自设置页，这里可以针对这手牌改。翻前底池会自动带上它们，
            行动记录里不用再记一遍盲注
          </Text>

          <View className='field-row'>
            <View className='field half'>
              <Text className='field-label'>小盲</Text>
              <View className='input-box'>
                <Input
                  className='input'
                  type='digit'
                  value={form.smallBlindBb}
                  placeholder='0.5'
                  onInput={(e) => setField('smallBlindBb', e.detail.value)}
                />
                <Text className='unit'>bb</Text>
              </View>
            </View>
            <View className='field half'>
              <Text className='field-label'>大盲</Text>
              <View className='input-box'>
                <Input
                  className='input'
                  type='digit'
                  value={form.bigBlindBb}
                  placeholder='1'
                  onInput={(e) => setField('bigBlindBb', e.detail.value)}
                />
                <Text className='unit'>bb</Text>
              </View>
            </View>
          </View>

          <View className='field'>
            <Text className='field-label'>前注</Text>
            <View className='input-box'>
              <Input
                className='input'
                type='digit'
                value={form.anteBb}
                placeholder='不打前注就留空'
                onInput={(e) => setField('anteBb', e.detail.value)}
              />
              <Text className='unit'>bb</Text>
            </View>
            {blinds.anteBb > 0 && (
              <Text className='field-note'>
                前注每人一份，{form.tableSize} 人桌共 {formatBB(blinds.anteBb * form.tableSize)} bb
              </Text>
            )}
          </View>

          <Text className='pot-summary'>
            翻前起始底池：{formatBB(preflopPotBb(blinds))} bb
          </Text>
        </View>

        {/* ---------- 对手 ---------- */}
        <View className='section'>
          <Text className='section-title'>对手</Text>
          <Text className='section-hint'>
            只加你关心的对手即可，其余位置默认弃牌。名字可以不填，不填就按位置显示。
            加过的对手下次能直接选
          </Text>

          {form.villains.length === 0 && (
            <Text className='field-note'>还没有添加对手，下面记行动时只能选「我」</Text>
          )}

          {form.villains.map((villain, index) => {
            const relatedActions = villain.position
              ? form.streets.reduce(
                  (sum, record) =>
                    sum + record.actions.filter((a) => a.actor === villain.position).length,
                  0
                )
              : 0;
            // 没名字就用位置当名字显示：位置才是这手牌里认人的依据。
            // 名字为空且位置也空（只有老数据会这样）时才退回"对手"两个字
            const nameText =
              villain.name ||
              (villain.position
                ? positionLabel(villain.position, form.tableSize)
                : UNNAMED_VILLAIN_LABEL);
            // 名字为空时上面显示的就是位置，不必再挂一个重复的位置角标
            const showPositionChip = !!villain.name || !villain.position;

            return (
              <View key={`${villain.position}-${index}`} className='opponent-row'>
                <View className='opponent-main' onClick={() => openEditOpponent(index)}>
                  <View className='opponent-line'>
                    <Text className='opponent-name'>{nameText}</Text>
                    {showPositionChip &&
                      (villain.position ? (
                        <Text className='opponent-position'>
                          {positionLabel(villain.position, form.tableSize)}
                        </Text>
                      ) : (
                        <Text className='opponent-position missing'>位置待选</Text>
                      ))}
                    {villain.isKey && <Text className='key-badge'>关键对手</Text>}
                  </View>
                  <Text className='opponent-meta'>
                    {villain.stackBb ? `${villain.stackBb} bb` : '筹码未填'}
                    {relatedActions > 0 ? ` · ${relatedActions} 条行动` : ''}
                  </Text>
                </View>
                <View className='remove-opponent' onClick={() => setRemoveTarget(index)}>
                  <Text className='remove-icon'>×</Text>
                </View>
              </View>
            );
          })}

          <View className='add-opponent-btn' onClick={openAddOpponent}>
            <Text className='add-text'>+ 添加对手</Text>
          </View>

          <Text className='field-note'>
            底池类型：{POT_TYPE_LABEL[potType]}
            （按翻牌时还有几个对手在池中自动判断）
          </Text>
        </View>

        {/* ---------- 行动 ---------- */}
        <View className='section'>
          <Text className='section-title'>行动过程</Text>
          <Text className='section-hint'>
            只记关键行动即可。跟注金额会自动推导，不用你填
          </Text>

          {STREET_ORDER.map((street) => {
            const record = form.streets.find((s) => s.street === street);
            const step = pots.byStreet[street];
            // 河牌没发到时提示用户先选公共牌，避免记录了行动却没有牌面对应
            const needsBoard =
              (street === 'flop' && boardCount < 3) ||
              (street === 'turn' && boardCount < 4) ||
              (street === 'river' && boardCount < 5);

            return (
              <View key={street}>
                <StreetActionEditor
                  street={street}
                  actions={record?.actions || []}
                  onChange={(actions) => setStreetActions(street, actions)}
                  expanded={expandedStreets.indexOf(street) >= 0}
                  onToggle={() => toggleStreet(street)}
                  potStartBb={step?.potStartBb}
                  potEndBb={step?.potEndBb}
                  actors={actorOptions}
                  foldedActors={foldedActors}
                  firstActor={firstActorByStreet[street] || ''}
                  remainingStacks={remainingStacksByStreet[street]}
                />
                {expandedStreets.indexOf(street) >= 0 && needsBoard && (
                  <Text className='board-warning'>
                    {STREET_LABEL[street]}需要 {street === 'flop' ? 3 : street === 'turn' ? 4 : 5} 张公共牌，请先在下方选择
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* ---------- 公共牌 ---------- */}
        <View className='section'>
          <Text className='section-title'>公共牌</Text>
          <Text className='section-hint'>按发牌顺序选择。翻前结束的手牌可以不选</Text>
          <CardPicker
            value={form.board}
            onChange={handleBoardChange}
            max={5}
            disabledCards={boardUnavailableCards}
            placeholder='选择公共牌（0/3/4/5 张）'
          />
          {boardCount > 0 && (
            <Text className='pot-summary'>
              当前底池（估算）：{formatBB(pots.finalPotBb)} bb
            </Text>
          )}
        </View>

        {/* ---------- 我的想法 ---------- */}
        <View className='section highlight'>
          <Text className='section-title'>
            我当时是怎么想的
          </Text>
          <Text className='section-hint'>
            这是复盘最有价值的部分。写下你的判断和顾虑，AI 才能指出真正的思维漏洞，而不是泛泛而谈
          </Text>
          <Textarea
            className='thought-input'
            value={form.heroThought}
            placeholder='例如：转牌想控池所以过牌，怕他有同花。河牌其实应该跟注，但当时觉得他一定是同花…'
            maxlength={1000}
            onInput={(e) => setField('heroThought', e.detail.value)}
          />
          <Text className='word-count'>{form.heroThought.length}/1000</Text>
        </View>

        {/* ---------- 结果 ---------- */}
        <View className='section'>
          <Text className='section-title'>结果</Text>
          <View className='position-grid'>
            {RESULTS.map((r) => (
              <View
                key={r}
                className={`position-btn ${form.result === r ? 'active' : ''}`}
                onClick={() => setField('result', r)}
              >
                <Text className='pos-text'>{RESULT_LABEL[r]}</Text>
              </View>
            ))}
          </View>
          {form.result !== 'unknown' && (
            <View className='field'>
              <Text className='field-label'>金额</Text>
              <View className='input-box'>
                <Input
                  className='input'
                  type='digit'
                  value={form.resultAmount}
                  placeholder='0'
                  onInput={(e) => setField('resultAmount', e.detail.value)}
                />
                <Text className='unit'>bb</Text>
              </View>
            </View>
          )}
        </View>

        {/* ---------- 标签 ---------- */}
        <View className='section'>
          <Text className='section-title'>标签</Text>
          <Text className='section-hint'>方便以后按标签翻查，比如「3bet底池」「河牌诈唬」</Text>

          {form.heroTags.length > 0 && (
            <View className='tag-list'>
              {form.heroTags.map((tag) => (
                <View key={tag} className='tag-chip' onClick={() => removeTag(tag)}>
                  <Text className='tag-text'>{tag}</Text>
                  <Text className='tag-remove'>×</Text>
                </View>
              ))}
            </View>
          )}

          <View className='tag-input-row'>
            <Input
              className='input'
              value={tagInput}
              placeholder='输入标签后点添加'
              onInput={(e) => setTagInput(e.detail.value)}
              onConfirm={addTag}
            />
            <View className='tag-add-btn' onClick={addTag}>
              <Text className='add-text'>添加</Text>
            </View>
          </View>
        </View>

        {/* ---------- 标题 ---------- */}
        <View className='section'>
          <Text className='section-title'>标题</Text>
          <View className='input-box'>
            <Input
              className='input'
              value={form.title}
              placeholder={defaultTitle || '留空自动生成'}
              onInput={(e) => setField('title', e.detail.value)}
            />
          </View>
        </View>

        {/* 底部安全区由 PageLayout 的 bottom 容器统一处理，这里只留一点呼吸空间 */}
        <View className='bottom-space' />
      </PageLayout>

      <ConfirmDialog
        visible={thoughtWarnVisible}
        title='还没写当时的想法'
        content='没有思考记录，AI 只能就牌面泛泛而谈，很难指出真正的思维漏洞。确定就这样保存吗？'
        confirmText='仍然保存'
        cancelText='回去补写'
        confirmType='warning'
        loading={submitting}
        onConfirm={handleConfirmNoThought}
        onCancel={() => setThoughtWarnVisible(false)}
        onClose={() => setThoughtWarnVisible(false)}
      />

      <AddOpponentDialog
        visible={opponentDialogVisible}
        positionOptions={positionOptions}
        takenPositions={dialogTakenPositions}
        hasKeyVillain={hasKeyVillain}
        tableSize={form.tableSize}
        initial={editingInitial}
        onConfirm={handleOpponentConfirm}
        onClose={() => setOpponentDialogVisible(false)}
      />

      <ConfirmDialog
        visible={removeTarget !== null}
        title='删除这个对手'
        content={
          removeTargetActions > 0
            ? `他的 ${removeTargetActions} 条行动记录会一起删掉，确定吗？`
            : '确定删掉这个对手吗？'
        }
        confirmText='删除'
        confirmType='danger'
        onConfirm={handleRemoveOpponent}
        onCancel={() => setRemoveTarget(null)}
        onClose={() => setRemoveTarget(null)}
      />
    </>
  );
};

export default ReviewCreatePage;
