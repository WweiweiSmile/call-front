import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import { Button, Popup, Switch } from '@nutui/nutui-react-taro';
import { useRequest } from 'ahooks';
import { reviewApi } from '../../services/api';
import { positionLabel } from '../../utils/poker';
import type { Position } from '../../models/types/review';
import './index.less';

/** 弹窗填好的一个对手 */
export interface OpponentDraft {
  name: string;
  position: Position;
  stackBb?: number;
  isKey?: boolean;
}

interface AddOpponentDialogProps {
  visible: boolean;
  /** 该人数下可选的位置，顺序与牌桌行动顺序一致 */
  positionOptions: Position[];
  /**
   * 已被占用的位置（含我自己的位置）。这些位置不能选，但仍要显示出来 ——
   * 用户需要看到"这张桌子上还有谁"，而不是一片空白
   */
  takenPositions: Position[];
  /** 本手牌是否已经有关键对手。已有的话这里不能再标 */
  hasKeyVillain: boolean;
  tableSize: number;
  /** 编辑已有对手时传入。不传就是新增 */
  initial?: OpponentDraft | null;
  onConfirm: (draft: OpponentDraft) => void;
  onClose: () => void;
}

/**
 * 添加 / 编辑对手弹窗。
 *
 * 对手名单是按用户隔离的"对手表"，这里只做搜索与选择：名字在库里没有时
 * **不在这里落库**，等提交手牌时由后端统一建 —— 用户中途放弃不该在库里留下名字。
 *
 * 名字是选填的，位置必填：只填位置表示"这个位置上有个我不认识/不想记名字的对手"，
 * 显示时一律用位置代替，也不会在对手表里建人。
 */
const AddOpponentDialog: React.FC<AddOpponentDialogProps> = ({
  visible,
  positionOptions,
  takenPositions,
  hasKeyVillain,
  tableSize,
  initial,
  onConfirm,
  onClose,
}) => {
  const isEdit = !!initial;

  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position | ''>('');
  const [stackBb, setStackBb] = useState('');
  const [isKey, setIsKey] = useState(false);

  // 每次打开都按当前手牌重置：弹窗是复用的，不重置会把上一次的输入带进来
  useEffect(() => {
    if (!visible) return;
    setName(initial?.name || '');
    setPosition(initial?.position || '');
    setStackBb(initial?.stackBb !== undefined ? String(initial.stackBb) : '');
    setIsKey(!!initial?.isKey);
  }, [visible, initial]);

  // 搜索我的对手名单。debounceWait 让连续输入只打一次接口；
  // ready 保证弹窗没打开时不请求
  const { data: opponentResp, loading, error } = useRequest(
    () => reviewApi.searchOpponents({ keyword: name.trim(), limit: 20 }),
    {
      ready: visible,
      refreshDeps: [name, visible],
      debounceWait: 300,
      onError: () => {},
    }
  );
  const opponents = useMemo(() => opponentResp?.list || [], [opponentResp]);

  // 名字与库里已有的完全一样时不必再提示"新建"
  const exactMatch = opponents.some(
    (o) => o.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  const canCreate = name.trim().length > 0 && !exactMatch;

  const taken = useMemo(() => new Set(takenPositions), [takenPositions]);
  // 名字是选填的：留空就只记位置，界面上显示成位置（"CO"），
  // 提交时后端也不会在对手表里建人。位置仍然是必填 —— 位置才是这手牌认人的依据
  const canSubmit = !!position;

  const handleConfirm = useCallback(() => {
    if (!canSubmit) return;
    onConfirm({
      name: name.trim(),
      position: position as Position,
      stackBb: stackBb ? Number(stackBb) : undefined,
      isKey,
    });
  }, [canSubmit, name, position, stackBb, isKey, onConfirm]);

  return (
    <Popup
      visible={visible}
      position='bottom'
      round
      onClose={onClose}
      closeOnOverlayClick
      className='add-opponent-popup'
    >
      <View className='add-opponent-dialog'>
        <View className='dialog-header'>
          <Text className='dialog-title'>{isEdit ? '编辑对手' : '添加对手'}</Text>
          <Text className='dialog-close' onClick={onClose}>
            ×
          </Text>
        </View>

        <ScrollView className='dialog-body' scrollY>
          {/* ---------- 1. 选人 ---------- */}
          <View className='dialog-field'>
            <Text className='field-label'>对手（选填）</Text>
            <Text className='field-note'>
              不填名字就只记位置，界面上显示成位置，不进对手名单
            </Text>
            <View className='search-box'>
              <Input
                className='search-input'
                value={name}
                placeholder='搜索或输入对手名'
                maxlength={20}
                onInput={(e) => setName(e.detail.value)}
              />
            </View>

            {/* 库里没有这个名字时，给一条"新建"的明路，否则用户不知道自己能不能直接填 */}
            {canCreate && (
              <View className='opponent-option create' onClick={() => setName(name.trim())}>
                <Text className='option-name'>新建对手「{name.trim()}」</Text>
                <Text className='option-hint'>提交复盘时自动存进对手表</Text>
              </View>
            )}

            {opponents.length > 0 && (
              <View className='opponent-list'>
                {opponents.map((opponent) => {
                  const selected = opponent.name === name;
                  return (
                    <View
                      key={opponent.id}
                      className={`opponent-option ${selected ? 'selected' : ''}`}
                      onClick={() => setName(opponent.name)}
                    >
                      <Text className='option-name'>{opponent.name}</Text>
                      {/* 交手数只数得到改版之后的手牌，老手牌认不出对手 */}
                      <Text className='option-hint'>
                        {opponent.handCount > 0 ? `已交手 ${opponent.handCount} 手` : '还没交过手'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {loading && <Text className='list-hint'>搜索中…</Text>}
            {/* 名单拉不到不该挡住录入：名字照样能填，提交时后端会建 */}
            {!!error && (
              <Text className='list-hint'>对手名单没加载出来，直接填名字也能用</Text>
            )}
          </View>

          {/* ---------- 2. 位置 ---------- */}
          <View className='dialog-field'>
            <Text className='field-label'>位置</Text>
            <Text className='field-note'>已有人坐的位置不能再选</Text>
            <View className='position-grid'>
              {positionOptions.map((pos) => {
                const occupied = taken.has(pos);
                return (
                  <View
                    key={pos}
                    className={`position-btn ${position === pos ? 'active' : ''} ${
                      occupied ? 'disabled' : ''
                    }`}
                    onClick={() => !occupied && setPosition(pos)}
                  >
                    <Text className='pos-text'>{positionLabel(pos, tableSize)}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ---------- 3. 筹码 ---------- */}
          <View className='dialog-field'>
            <Text className='field-label'>筹码（选填）</Text>
            <View className='input-box'>
              <Input
                className='input'
                type='digit'
                value={stackBb}
                placeholder='100'
                onInput={(e) => setStackBb(e.detail.value)}
              />
              <Text className='unit'>bb</Text>
            </View>
          </View>

          {/* ---------- 4. 关键对手 ---------- */}
          <View className='dialog-field key-field'>
            <View className='key-text'>
              <Text className='field-label'>标为关键对手</Text>
              <Text className='field-note'>
                {hasKeyVillain && !isKey ? '本手牌已经有一个关键对手了' : '每手最多一个，用于 AI 重点点评'}
              </Text>
            </View>
            <Switch
              checked={isKey}
              disabled={hasKeyVillain && !isKey}
              onChange={(value) => setIsKey(value)}
            />
          </View>
        </ScrollView>

        <View className='dialog-footer'>
          <Button type='default' onClick={onClose}>
            取消
          </Button>
          <Button type='primary' disabled={!canSubmit} onClick={handleConfirm}>
            {isEdit ? '保存' : '添加'}
          </Button>
        </View>
      </View>
    </Popup>
  );
};

export default AddOpponentDialog;
