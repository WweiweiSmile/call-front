import React, { useCallback, useMemo } from 'react';
import { Input, Text, View } from '@tarojs/components';
import {
  ACTION_LABEL,
  ACTION_NEEDS_AMOUNT,
  STREET_LABEL,
  actorLabel,
  availableActionsFor,
  defaultActionFor,
  formatBB,
  nextActorAfter,
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
   * 可选的行动者：我 + 本手牌已添加的对手（M7.1 起不再有"其他人"这个聚合角色），
   * **按牌桌行动顺序排列**。老手牌里已有的 villain / other 行仍要能显示，见 optionsFor
   *
   * 已弃牌的人**仍然留在这个数组里**：自动轮转要按完整顺序走 ——
   * 上一条恰好是"某人弃牌"时，得先找到他在桌上的次序才知道下一位是谁
   */
  actors: ActorOption[];
  /**
   * 已经不能再行动的人：**弃牌 + 全下**，跨街累积。
   *
   * 两者都退出了"行动"这件事 —— 弃牌的退出了牌局，全下的人还在牌局里但不再有行动
   * 机会。所以后续行动既不自动选他们，也不再把他们列出来。
   * **当前街内同样生效**：某人刚全下，紧接着的下一条行动就不该轮到他
   */
  outActors: ActorType[];
  /**
   * 本街第一个该说话的人，已跳过弃牌者；空串表示算不出来。
   *
   * 由父级按**完整位置表**算好传进来，不能拿 actors 自己找 —— 见 firstActorOfStreet：
   * 我自己坐 BB 时，那个座位的行动者值是 'hero' 而不是 'BB'
   */
  firstActor: ActorType | '';
  /**
   * 本街开始时各行动者还剩多少后手（BB），用于「全下」自动填金额。
   *
   * 只含**记了筹码**的人：算不出的人不在表里，此时全下金额留空让用户手填 ——
   * 编一个数进去等于往库里写假数据
   */
  remainingStacks?: Record<string, number>;
}

/** 没有可算的后手时的空表。用常量而不是字面量，免得默认值的引用每轮都变 */
const EMPTY_STACKS: Record<string, number> = {};

const StreetActionEditor: React.FC<StreetActionEditorProps> = ({
  street,
  actions,
  onChange,
  expanded,
  onToggle,
  potStartBb,
  potEndBb,
  actors,
  outActors,
  firstActor,
  remainingStacks = EMPTY_STACKS,
}) => {
  const updateAction = useCallback((index: number, patch: Partial<StreetAction>) => {
    const next = actions.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(next);
  }, [actions, onChange]);

  const removeAction = useCallback((index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  }, [actions, onChange]);

  const out = useMemo(() => new Set(outActors), [outActors]);

  /** 本街可选的动作。过牌只在"还没人下注的翻后"合法，规则见 availableActionsFor */
  const availableActions = useMemo(
    () => availableActionsFor(street, actions),
    [street, actions]
  );

  /** 新增行的默认动作：翻前跟注；翻后没人下注时过牌、有人下注了跟注 */
  const defaultAction = useMemo(
    () => defaultActionFor(street, actions),
    [street, actions]
  );

  /**
   * 一行可选的动作。这一行自己的动作永远保留，道理同 optionsFor：
   * 记了"过牌"之后有人下注，过牌按钮就没了，那一行会变成一排全没选中的按钮 ——
   * 用户既看不出记的是什么，也改不回来
   */
  const actionsForRow = useCallback((current: ActionType): ActionType[] => {
    if (availableActions.indexOf(current) >= 0) return availableActions;
    return [current, ...availableActions];
  }, [availableActions]);

  /**
   * 一行可选的行动者。**已经不能再行动的人不再列出**（弃牌 / 全下）。
   *
   * 但这一行自己的行动者永远保留：行里的 actor 是位置、而这个人已经被删掉或已退出时
   * （或老数据的 villain/other），把它顶在列表最前面，否则这一行会没有任何选中项，
   * 用户既看不出是谁，也改不回来
   */
  const optionsFor = useCallback((actor: ActorType): ActorOption[] => {
    const visible = actors.filter((option) => option.value === actor || !out.has(option.value));
    if (visible.some((option) => option.value === actor)) return visible;
    // 认不出的值（后端将来加了新角色）原样显示，总好过这一行没有选中项
    return [{ value: actor, label: actorLabel(actor) }, ...visible];
  }, [actors, out]);

  /** 按行动顺序排的座位表。**含已退出的人** —— 轮转要按完整顺序走，见 nextActorAfter */
  const actorOrder = useMemo(() => actors.map((option) => option.value), [actors]);

  /**
   * 新增一条行动：**行动者与动作都自动选好**，省掉两次点击。
   *
   * 行动者接着上一条按牌桌顺序往后轮转（弃牌 / 已全下的人跳过）；这条街还没有行动时，
   * 选本街第一个该说话的人。动作见 defaultAction
   *
   * 全桌都不能再行动时（只有记录有误才会这样）退回上一条的行动者，
   * 别硬塞一个不相干的人
   */
  const addAction = useCallback(() => {
    const last = actions[actions.length - 1];
    const actor = last
      ? nextActorAfter(actorOrder, out, last.actor) ?? last.actor
      : firstActor || actorOrder.find((value) => !out.has(value)) || 'hero';
    onChange([...actions, { actor, action: defaultAction }]);
  }, [actions, actorOrder, out, firstActor, defaultAction, onChange]);

  /**
   * 切换行动类型时，清掉不再需要的金额，避免提交时后端报"该行动不需要金额"的困惑。
   *
   * 选中「全下」时**自动填上该行动者进本街时剩下的后手** —— 他推光本街，本街累计
   * 投入正好是这个数。只在这一刻填一次，之后用户想改就改：对方后手更短时实际只能
   * 跟到对方那么多，那种情况必须允许手动调小。
   * 算不出后手时（没记筹码）保持原样，留空让用户手填
   */
  const handleActionChange = useCallback((index: number, action: ActionType) => {
    const needsAmount = ACTION_NEEDS_AMOUNT.indexOf(action) >= 0;
    const current = actions[index];

    let amountBb = needsAmount ? current.amountBb : undefined;
    if (action === 'allin') {
      amountBb = remainingStacks[current.actor] ?? amountBb;
    }

    updateAction(index, { action, amountBb });
  }, [actions, remainingStacks, updateAction]);

  /**
   * 换行动者。全下行的金额跟着行动者走 —— 换了人，他手里剩的就不是原来那个数了，
   * 留着旧值只会是个错数
   */
  const handleActorChange = useCallback((index: number, actor: ActorType) => {
    const current = actions[index];
    const filled = remainingStacks[actor];
    if (current.action === 'allin' && filled !== undefined) {
      updateAction(index, { actor, amountBb: filled });
      return;
    }
    updateAction(index, { actor });
  }, [actions, remainingStacks, updateAction]);

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
                    onClick={() => handleActorChange(index, option.value)}
                  >
                    <Text className='chip-text'>{option.label}</Text>
                  </View>
                ))}
              </View>

              {/* 做了什么 */}
              <View className='action-group'>
                {actionsForRow(action.action).map((act) => (
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
