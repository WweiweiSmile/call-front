import React, { useCallback } from 'react';
import { Input, Text, View } from '@tarojs/components';
import {
  ACTION_LABEL,
  ACTION_NEEDS_AMOUNT,
  STREET_LABEL,
  actorLabel,
  formatBB,
} from '../../utils/poker';
import type { ActionType, ActorType, Street, StreetAction } from '../../models/types/review';
import './index.less';

/** 一个可选的行动者。value 是位置（对手）或 hero（我） */
export interface ActorOption {
  value: ActorType;
  label: string;
}

interface StreetActionEditorProps {
  street: Street;
  actions: StreetAction[];
  onChange: (actions: StreetAction[]) => void;
  /** 是否展开。由父级控制，父级需要在公共牌变化时自动展开对应街道 */
  expanded: boolean;
  onToggle: () => void;
  /** 该街开始时的底池（BB），用于在标题上显示 */
  potStartBb?: number;
  /** 该街结束时的底池（BB） */
  potEndBb?: number;
  /**
   * 可选的行动者：我 + 本手牌已添加的对手（M7.1 起不再有"其他人"这个聚合角色）。
   * 老手牌里已有的 villain / other 行仍要能显示，见 optionsFor
   */
  actors: ActorOption[];
}

const ACTIONS: ActionType[] = ['check', 'bet', 'call', 'raise', 'fold', 'allin'];

const StreetActionEditor: React.FC<StreetActionEditorProps> = ({
  street,
  actions,
  onChange,
  expanded,
  onToggle,
  potStartBb,
  potEndBb,
  actors,
}) => {
  const updateAction = useCallback((index: number, patch: Partial<StreetAction>) => {
    const next = actions.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(next);
  }, [actions, onChange]);

  const removeAction = useCallback((index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  }, [actions, onChange]);

  /**
   * 一行可选的行动者。行里的 actor 是位置、而这个人已经被删掉时（或老数据的
   * villain/other），把它顶在列表最前面：否则这一行会没有任何选中项，
   * 用户既看不出是谁，也改不回来
   */
  const optionsFor = useCallback((actor: ActorType): ActorOption[] => {
    if (actors.some((option) => option.value === actor)) return actors;
    // 认不出的值（后端将来加了新角色）原样显示，总好过这一行没有选中项
    return [{ value: actor, label: actorLabel(actor) }, ...actors];
  }, [actors]);

  const addAction = useCallback(() => {
    // 默认加一条"对手过牌"这种最常见的记录，减少用户点击次数。
    // actors[0] 是我，所以有对手时优先选第一个对手
    const actor = actors.length > 1 ? actors[1].value : actors[0]?.value || 'hero';
    onChange([...actions, { actor, action: 'check' }]);
  }, [actions, actors, onChange]);

  // 切换行动类型时，清掉不再需要的金额，避免提交时后端报"该行动不需要金额"的困惑
  const handleActionChange = useCallback((index: number, action: ActionType) => {
    const needsAmount = ACTION_NEEDS_AMOUNT.indexOf(action) >= 0;
    updateAction(index, {
      action,
      amountBb: needsAmount ? actions[index].amountBb : undefined,
    });
  }, [actions, updateAction]);

  return (
    <View className={`street-editor ${expanded ? 'expanded' : ''}`}>
      <View className='street-header' onClick={onToggle}>
        <View className='header-left'>
          <Text className='street-name'>{STREET_LABEL[street]}</Text>
          {actions.length > 0 && (
            <Text className='action-count'>{actions.length} 个行动</Text>
          )}
        </View>
        <View className='header-right'>
          {(potStartBb !== undefined && potStartBb > 0) && (
            <Text className='pot-hint'>
              底池 {formatBB(potStartBb)}
              {potEndBb !== undefined && potEndBb !== potStartBb ? ` → ${formatBB(potEndBb)}` : ''} bb
            </Text>
          )}
          <Text className='toggle-icon'>{expanded ? '▾' : '▸'}</Text>
        </View>
      </View>

      {expanded && (
        <View className='street-body'>
          {actions.length === 0 && (
            <Text className='empty-hint'>还没有记录行动</Text>
          )}

          {actions.map((action, index) => (
            <View key={index} className='action-row'>
              {/* 谁 */}
              <View className='actor-group'>
                {optionsFor(action.actor).map((option) => (
                  <View
                    key={option.value}
                    className={`chip actor ${action.actor === option.value ? 'active' : ''}`}
                    onClick={() => updateAction(index, { actor: option.value })}
                  >
                    <Text className='chip-text'>{option.label}</Text>
                  </View>
                ))}
              </View>

              {/* 做了什么 */}
              <View className='action-group'>
                {ACTIONS.map((act) => (
                  <View
                    key={act}
                    className={`chip action ${action.action === act ? 'active' : ''}`}
                    onClick={() => handleActionChange(index, act)}
                  >
                    <Text className='chip-text'>{ACTION_LABEL[act]}</Text>
                  </View>
                ))}
              </View>

              {/* 金额：只有下注/加注/全下需要 */}
              <View className='amount-line'>
                {ACTION_NEEDS_AMOUNT.indexOf(action.action) >= 0 ? (
                  <View className='amount-input'>
                    <Input
                      className='input'
                      type='digit'
                      value={action.amountBb !== undefined ? String(action.amountBb) : ''}
                      placeholder={action.action === 'raise' ? '加注到（BB）' : '金额（BB）'}
                      onInput={(e) => {
                        const raw = e.detail.value;
                        updateAction(index, {
                          amountBb: raw === '' ? undefined : Number(raw),
                        });
                      }}
                    />
                    <Text className='unit'>bb</Text>
                  </View>
                ) : (
                  <View className='amount-placeholder' />
                )}

                <View className='remove-btn' onClick={() => removeAction(index)}>
                  <Text className='remove-icon'>×</Text>
                </View>
              </View>
            </View>
          ))}

          <View className='add-action-btn' onClick={addAction}>
            <Text className='add-text'>+ 添加行动</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default StreetActionEditor;
