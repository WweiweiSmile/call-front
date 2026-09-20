import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { usePageData } from '../../hooks';
import { gameApi, preferenceApi, reviewApi } from '../../services/api';
import {
  DEFAULT_TABLE_SIZE,
  STREET_ORDER,
  bbToInput,
  blindPositionsOf,
  buildDefaultTitle,
  computePots,
  derivePotType,
  inputToBb,
  firstActorOfStreet,
  isValidPositionForTableSize,
  positionLabel,
  positionsForTableSize,
  remainingStacksAtStreet,
  validateCardString,
} from '../../utils/poker';
import type { ActorOption } from '../../components/StreetActionEditor';
import type { BlindConfig } from '../../utils/poker';
import type {
  ActorType,
  HandResult,
  Position,
  Street,
  StreetAction,
  StreetRecord,
  TableSize,
} from '../../models/types/review';

/** 草稿在本地存储里的 key。小程序切后台被杀进程是常事，表单必须能恢复 */
export const DRAFT_STORAGE_KEY = 'review_hand_draft';

/** 对手名长度上限，与后端 models.OpponentNameMaxRunes 一致 */
export const OPPONENT_NAME_MAX_LENGTH = 20;

/**
 * 我自己这个行动者。
 *
 * 不写成字面量散在各处：它在 actorOptions 里的**位置不固定** —— 要按 heroPosition
 * 坐进牌桌顺序里，否则自动轮转会把"下一个该谁"算错
 */
const HERO_ACTOR: ActorOption = { value: 'hero', label: '我' };

/**
 * 表单里的一个对手。
 *
 * name 为空有三种来路：M7.1 之前的老手牌（那时对手没有名字）、从老草稿迁移过来的
 * 对手，以及用户只记了位置没起名字。三种都允许原样保存，界面上用位置代替显示
 */
export interface VillainFormItem {
  name: string;
  position: Position | '';
  /** 筹码，输入过程中允许为空 */
  stackBb: string;
  isKey?: boolean;
}

/** 表单内部状态。数字字段用 string 存，输入过程中允许为空 */
export interface ReviewFormState {
  gameId?: number;
  title: string;
  /** 几人桌。它决定 heroPosition / 对手位置的可选项，改动时要一起收拾 */
  tableSize: TableSize;
  heroPosition: Position | '';
  heroCards: string;
  heroStackBb: string;
  stakes: string;
  /** 盲注与前注（BB）。空字符串表示没记录，底池退回不含盲注的口径 */
  smallBlindBb: string;
  bigBlindBb: string;
  anteBb: string;
  board: string;
  /** 本手牌的对手（M7.1 起是具名列表，不再是"一个关键对手 + 其他人"） */
  villains: VillainFormItem[];
  streets: StreetRecord[];
  heroThought: string;
  result: HandResult;
  resultAmount: string;
  heroTags: string[];
}

export const emptyFormState: ReviewFormState = {
  gameId: undefined,
  title: '',
  tableSize: DEFAULT_TABLE_SIZE,
  heroPosition: '',
  heroCards: '',
  heroStackBb: '100',
  stakes: '',
  // 留空而不是写死 0.5/1：设置里的默认值要等偏好接口回来才填，
  // 写死会让"接口还没回来"和"用户就是要这个值"分不清
  smallBlindBb: '',
  bigBlindBb: '',
  anteBb: '',
  board: '',
  villains: [],
  streets: STREET_ORDER.map((street) => ({ street, actions: [] })),
  heroThought: '',
  result: 'unknown',
  resultAmount: '',
  heroTags: [],
};

/** 公共牌张数对应的"应该展开到哪条街" */
const BOARD_CARDS_TO_STREET: Record<number, Street> = {
  0: 'preflop',
  3: 'flop',
  4: 'turn',
  5: 'river',
};

/** 后端对手 → 表单项 */
function toFormVillain(villain: {
  position?: string;
  stackBb?: number;
  isKey?: boolean;
  name?: string;
}): VillainFormItem {
  return {
    name: villain.name || '',
    position: (villain.position || '') as Position | '',
    stackBb: villain.stackBb !== undefined ? String(villain.stackBb) : '',
    isKey: !!villain.isKey,
  };
}

export function useReviewForm(handId?: string) {
  const isEditMode = !!handId;
  const [form, setForm] = useState<ReviewFormState>(emptyFormState);
  /** 展开的街道。默认只展开翻前，避免一屏塞四条街 */
  const [expandedStreets, setExpandedStreets] = useState<Street[]>(['preflop']);
  const [tagInput, setTagInput] = useState('');
  /** 草稿是否已读取完毕。没读完之前不允许自动保存，否则会覆盖存储里的草稿 */
  const [draftHydrated, setDraftHydrated] = useState(false);
  /**
   * 载入的老手牌里那个手填的"对手数量"。
   * 老数据的对手没有名字，那个数字与现在的对手列表长度不是一回事——
   * 顺手改成列表长度，内容指纹就变了，已有的 AI 分析会被判为"不对应当前内容"
   */
  const legacyVillainCountRef = useRef(0);
  /**
   * 载入的手牌是不是"对手全都没名字"的老数据。
   * 无名字本身不再等于老数据（新记录允许只记位置），所以判断口径要看载入时的样子，
   * 而不是提交时表单里的名字空不空
   */
  const loadedAllUnnamedRef = useRef(false);

  // ---------- 编辑模式：载入手牌 ----------
  // ready 保证新建模式下不发请求，isFirstLoading 也就天然是 false，
  // 与原来 useState(isEditMode) 的语义一致。
  //
  // refreshOnShow 必须关掉：这是个表单页，回到本页时重拉会走 onSuccess 里的
  // setForm，把用户填了一半的内容直接冲掉
  const { isFirstLoading: loading } = usePageData(
    async () => (handId ? await reviewApi.getHand(handId) : null),
    {
      ready: !!handId,
      refreshDeps: [handId],
      refreshOnShow: false,
      onSuccess: (hand) => {
        if (!hand) return;
        legacyVillainCountRef.current = hand.villainCount || 0;
        loadedAllUnnamedRef.current =
          (hand.villains || []).length > 0 && (hand.villains || []).every((v) => !v.name);
        setForm({
          gameId: hand.gameId,
          title: hand.title,
          // 迁移前落库的老手牌可能没有人数字段，兜底成满员桌，与后端口径一致
          tableSize: hand.tableSize || DEFAULT_TABLE_SIZE,
          heroPosition: hand.heroPosition,
          heroCards: hand.heroCards,
          heroStackBb: String(hand.heroStackBb || ''),
          stakes: hand.stakes || '',
          smallBlindBb: bbToInput(hand.smallBlindBb),
          bigBlindBb: bbToInput(hand.bigBlindBb),
          anteBb: bbToInput(hand.anteBb),
          board: hand.board || '',
          // 老手牌的对手没有名字，这里原样带进来：一旦改写（比如补个默认名），
          // 内容指纹就变了，已有的 AI 分析会被判为"不对应当前内容"而白重算一次
          villains: (hand.villains || []).map(toFormVillain),
          // 补齐缺失的街道，保证四条街都在，顺序固定
          streets: STREET_ORDER.map((street) => {
            const found = (hand.streets || []).find((s) => s.street === street);
            return found ? { ...found } : { street, actions: [] };
          }),
          heroThought: hand.heroThought || '',
          result: hand.result || 'unknown',
          resultAmount: hand.resultAmount !== undefined ? String(hand.resultAmount) : '',
          heroTags: hand.heroTags || [],
        });
        // 编辑时展开所有有内容的街道，用户一眼看到全貌
        setExpandedStreets(
          STREET_ORDER.filter((street) =>
            (hand.streets || []).some((s) => s.street === street && s.actions.length > 0)
          )
        );
      },
      onError: () => Taro.showToast({ title: '手牌加载失败', icon: 'none' }),
    }
  );

  // ---------- 新建模式：恢复草稿 ----------
  //
  // draftHasBlinds 记下草稿里到底有没有盲注字段：老草稿（加这个功能之前存的）没有，
  // 这时才该拿设置里的默认值填进去；草稿里已经有（哪怕是用户手动清空的空串）就一律听草稿的，
  // 否则用户特意清空盲注、退出再进来又会被默认值填回来
  const draftHasBlindsRef = useRef(false);

  useEffect(() => {
    if (handId) return;
    try {
      const raw = Taro.getStorageSync(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
        draftHasBlindsRef.current = draft.smallBlindBb !== undefined;
        // M7.1 之前的草稿存的是单个关键对手，迁移成对手列表，
        // 否则用户填了一半的对手信息会凭空消失
        if (!draft.villains && (draft.villainPosition || draft.villainStackBb)) {
          draft.villains = [
            {
              name: '',
              position: draft.villainPosition || '',
              stackBb: draft.villainStackBb || '',
              isKey: true,
            },
          ];
        }
        setForm({ ...emptyFormState, ...draft });
        setExpandedStreets(
          STREET_ORDER.filter((street) =>
            (draft.streets || []).some((s: StreetRecord) => s.street === street && s.actions.length > 0)
          )
        );
        Taro.showToast({ title: '已恢复上次未完成的记录', icon: 'none' });
      }
    } catch {
      // 草稿损坏就当没有，不该阻塞录入
    } finally {
      // 必须在读完草稿后才允许自动保存。
      // 两个 effect 在同一次提交后按声明顺序执行，若不设这个闸门，
      // 自动保存会先用初始的空表单覆盖掉存储里的草稿，
      // 虽然下一次渲染会把内容写回去，但中间那一小段窗口里草稿是丢的
      setDraftHydrated(true);
    }
  }, [handId]);

  // ---------- 草稿自动保存 ----------
  // 只在新建模式存草稿：编辑已有手牌时存草稿会覆盖新建的草稿，反而添乱
  useEffect(() => {
    if (handId || loading || !draftHydrated) return;
    try {
      Taro.setStorageSync(DRAFT_STORAGE_KEY, JSON.stringify(form));
    } catch {
      // 存储失败不影响填写
    }
  }, [form, handId, loading, draftHydrated]);

  // ---------- 新建模式：用设置里的默认盲注预填 ----------
  // 「自动添加盲注和前注」就落在这里：打开录入页时盲注与前注已经按设置页里配好的
  // 默认值填上，不用每次重新敲一遍，仍然可以就地改。
  //
  // 只在新建模式拉：编辑已有手牌要用这手牌自己存的值，拿默认值覆盖等于改历史数据
  const { data: blindPreference } = useRequest(
    () => preferenceApi.getPreferences(),
    {
      ready: !handId,
      // 设置拉不到就留空（等于没记盲注），不该挡住录入主流程
      onError: () => {},
    }
  );

  useEffect(() => {
    if (handId || !blindPreference || draftHasBlindsRef.current) return;
    setForm((prev) => ({
      ...prev,
      smallBlindBb: bbToInput(blindPreference.smallBlindBb),
      bigBlindBb: bbToInput(blindPreference.bigBlindBb),
      anteBb: bbToInput(blindPreference.anteBb),
    }));
  }, [handId, blindPreference]);

  // ---------- 我的场次（用于可选关联） ----------
  // 场次列表拉不到不该挡住复盘录入，关联场次本来就是可选功能，所以错误静默
  const { data: myGamesResp } = useRequest(
    () => gameApi.getMyGames({ page: 1, pageSize: 50 }),
    { onError: () => {} }
  );
  const myGames = useMemo(() => myGamesResp?.list || [], [myGamesResp]);

  const setField = useCallback(<K extends keyof ReviewFormState>(
    key: K,
    value: ReviewFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /**
   * 切换人数。位置的可选范围随之变化，原来选的位置可能已经不存在了
   * （比如 9 人桌选了 UTG+2，改成 6 人桌），这时必须清掉，
   * 否则会提交出一份"6 人桌 + UTG+2"的自相矛盾数据，后端也会直接拒收。
   *
   * 对手的位置同理，而且指向它的行动也要一起删：留着一份指不到人的行动，
   * 提交时会被后端以"无效的行动者"拒掉，报错却看不出是人数改小导致的
   */
  const setTableSize = useCallback((size: TableSize) => {
    const valid = positionsForTableSize(size);
    const droppedPositions: string[] = [];
    const villains = form.villains.map((villain) => {
      if (villain.position && valid.indexOf(villain.position) < 0) {
        droppedPositions.push(villain.position);
        return { ...villain, position: '' as Position | '' };
      }
      return villain;
    });

    setForm({
      ...form,
      tableSize: size,
      heroPosition: valid.indexOf(form.heroPosition as Position) >= 0 ? form.heroPosition : '',
      villains,
      streets: droppedPositions.length
        ? form.streets.map((record) => ({
            ...record,
            actions: record.actions.filter((action) => droppedPositions.indexOf(action.actor) < 0),
          }))
        : form.streets,
    });

    if (droppedPositions.length > 0) {
      Taro.showToast({
        title: `${size} 人桌没有这些位置，已清掉相关对手与行动`,
        icon: 'none',
        duration: 2500,
      });
    }
  }, [form]);

  const setStreetActions = useCallback((street: Street, actions: StreetAction[]) => {
    setForm((prev) => ({
      ...prev,
      streets: prev.streets.map((s) => (s.street === street ? { ...s, actions } : s)),
    }));
  }, []);

  const toggleStreet = useCallback((street: Street) => {
    setExpandedStreets((prev) =>
      prev.indexOf(street) >= 0 ? prev.filter((s) => s !== street) : [...prev, street]
    );
  }, []);

  // ---------- 对手 ----------
  /** 已被占用的位置：我 + 其他对手。添加弹窗据此置灰 */
  const takenPositions = useMemo<Position[]>(() => {
    const taken: Position[] = [];
    if (form.heroPosition) taken.push(form.heroPosition);
    for (const villain of form.villains) {
      if (villain.position) taken.push(villain.position);
    }
    return taken;
  }, [form.heroPosition, form.villains]);

  const hasKeyVillain = useMemo(
    () => form.villains.some((villain) => villain.isKey),
    [form.villains]
  );

  /** 添加一个对手。位置唯一由弹窗的置灰 + validate 双保险 */
  const addVillain = useCallback((villain: VillainFormItem) => {
    setForm((prev) => ({ ...prev, villains: [...prev.villains, villain] }));
  }, []);

  /** 就地改一个对手：改名字、改位置、改筹码都在这里 */
  const updateVillain = useCallback((index: number, villain: VillainFormItem) => {
    setForm((prev) => ({
      ...prev,
      villains: prev.villains.map((item, i) => (i === index ? villain : item)),
    }));
  }, []);

  /**
   * 删掉一个对手。他在行动记录里的行必须一起删 ——
   * 否则那些行动会指向一个不在对手列表里的位置，提交时被后端拒收
   */
  const removeVillain = useCallback((index: number) => {
    setForm((prev) => {
      const target = prev.villains[index];
      return {
        ...prev,
        villains: prev.villains.filter((_, i) => i !== index),
        streets: target?.position
          ? prev.streets.map((record) => ({
              ...record,
              actions: record.actions.filter((action) => action.actor !== target.position),
            }))
          : prev.streets,
      };
    });
  }, []);

  /**
   * 行动可选的行动者：我 + 本手牌记了位置的对手，**按牌桌行动顺序排列**。
   *
   * 顺序很要紧：录入页靠它把"下一条行动该谁"自动选出来。原来的顺序是用户添加对手
   * 的先后，跟牌桌上的实际顺序无关，没法拿来轮转
   */
  const actorOptions = useMemo<ActorOption[]>(() => {
    const villainByPosition = new Map<Position, ActorOption>();
    for (const villain of form.villains) {
      if (!villain.position) continue;
      villainByPosition.set(villain.position, {
        value: villain.position,
        label: villain.name || positionLabel(villain.position, form.tableSize),
      });
    }

    const ordered: ActorOption[] = [];
    let heroPlaced = false;
    for (const position of positionsForTableSize(form.tableSize)) {
      if (position === form.heroPosition) {
        ordered.push(HERO_ACTOR);
        heroPlaced = true;
        continue;
      }
      const villain = villainByPosition.get(position);
      if (villain) ordered.push(villain);
    }

    // 还没选自己的位置时也要能记我的行动，顶在最前面（此时顺序无从谈起）
    return heroPlaced ? ordered : [HERO_ACTOR, ...ordered];
  }, [form.villains, form.tableSize, form.heroPosition]);

  /**
   * 已弃牌的行动者，跨街累积。
   *
   * 弃牌 = 退出这手牌，所以翻前弃了的人在翻牌/转牌/河牌都不该再出现。
   * 只按"当前街的上一条"判是不够的：一过街，弃牌的人又冒出来了
   */
  const foldedActors = useMemo<ActorType[]>(() => {
    const folded = new Set<ActorType>();
    for (const record of form.streets) {
      for (const action of record.actions || []) {
        if (action.action === 'fold') folded.add(action.actor);
      }
    }
    return [...folded];
  }, [form.streets]);

  /**
   * 各行动者带进这手牌的筹码（BB）。
   *
   * 没记筹码的人不进表 —— 全下金额算不出来时就该留空让用户手填，
   * 用默认值兜一个数等于往库里写假数据
   */
  const startingStacks = useMemo<Record<string, number>>(() => {
    const stacks: Record<string, number> = {};
    const heroStack = inputToBb(form.heroStackBb);
    if (heroStack > 0) stacks.hero = heroStack;

    for (const villain of form.villains) {
      if (!villain.position) continue;
      const stack = inputToBb(villain.stackBb);
      if (stack > 0) stacks[villain.position] = stack;
    }
    return stacks;
  }, [form.heroStackBb, form.villains]);

  /**
   * 位置 → 行动者，只放在场的人。算"本街第一个说话的人"要用它配合**完整位置表**
   * 轮转，见 firstActorOfStreet —— 直接拿在场行动者找 'BB' 是错的
   */
  const positionActors = useMemo<Partial<Record<Position, ActorType>>>(() => {
    const map: Partial<Record<Position, ActorType>> = {};
    for (const villain of form.villains) {
      if (!villain.position) continue;
      map[villain.position] = villain.position;
    }
    // 我自己占一个座位。这个座位的行动者值是 'hero'，认人时不能用位置值去找
    if (form.heroPosition) map[form.heroPosition] = 'hero';
    return map;
  }, [form.villains, form.heroPosition]);

  /** 每条街第一个该说话的人（已跳过弃牌者）。空街新增行动时默认选他 */
  const firstActorByStreet = useMemo(() => {
    const byStreet: Partial<Record<Street, ActorType | ''>> = {};
    const folded = new Set(foldedActors);
    for (const street of STREET_ORDER) {
      byStreet[street] = firstActorOfStreet(positionActors, folded, street, form.tableSize) ?? '';
    }
    return byStreet;
  }, [positionActors, foldedActors, form.tableSize]);

  // ---------- 盲注 ----------
  // 位置要一起带上：底池推算靠它把大小盲认到具体行动者头上，否则大盲跟注会被多算
  const blinds: BlindConfig = useMemo(() => ({
    smallBlindBb: inputToBb(form.smallBlindBb),
    bigBlindBb: inputToBb(form.bigBlindBb),
    anteBb: inputToBb(form.anteBb),
    tableSize: form.tableSize,
    heroPosition: form.heroPosition,
    // 有名字的对手按位置认人，没名字的老数据认在聚合角色上
    ...blindPositionsOf(form.villains),
  }), [
    form.smallBlindBb,
    form.bigBlindBb,
    form.anteBb,
    form.tableSize,
    form.heroPosition,
    form.villains,
  ]);

  /**
   * 每条街开始时各人还剩多少后手（BB），用于「全下」自动填金额。
   *
   * 按街预算好而不是在组件里现算：组件只看得到自己那条街的行动，
   * 而"前面几条街投了多少"要看全量
   */
  const remainingStacksByStreet = useMemo(() => {
    const byStreet: Partial<Record<Street, Record<string, number>>> = {};
    for (const street of STREET_ORDER) {
      byStreet[street] = remainingStacksAtStreet(form.streets, street, startingStacks, blinds);
    }
    return byStreet;
  }, [form.streets, startingStacks, blinds]);

  // ---------- 底池估算 ----------
  const pots = useMemo(() => computePots(form.streets, blinds), [form.streets, blinds]);

  // ---------- 公共牌与街道的一致性 ----------
  // 用户选到转牌公共牌时，顺手把转牌这条街展开，省一次点击
  const handleBoardChange = useCallback((board: string) => {
    setForm((prev) => ({ ...prev, board }));
    const targetStreet = BOARD_CARDS_TO_STREET[board.length / 2];
    if (targetStreet) {
      setExpandedStreets((prev) =>
        prev.indexOf(targetStreet) >= 0 ? prev : [...prev, targetStreet]
      );
    }
  }, []);

  // ---------- 底池类型 ----------
  // 不再手填：按翻后仍在池中的人数推断，翻前全弃到我就是一个单挑池
  const potType = useMemo(
    () => derivePotType(form.streets, form.villains),
    [form.streets, form.villains]
  );

  const defaultTitle = useMemo(
    () => buildDefaultTitle(form.heroPosition, form.heroCards, potType),
    [form.heroPosition, form.heroCards, potType]
  );

  /** 提交前的完整校验，返回第一条错误信息 */
  const validate = useCallback((): string | null => {
    if (!form.heroPosition) return '请选择你的位置';

    // 正常路径下 setTableSize 会顺手清掉失效的位置，这里再兜一层：
    // 直接提交出去的话后端也会拒，但报错不如这里说得清楚
    if (!isValidPositionForTableSize(form.heroPosition, form.tableSize)) {
      return `${form.tableSize} 人桌没有「${form.heroPosition}」这个位置，请重新选择`;
    }

    // ---------- 对手 ----------
    // 位置必须落在该人数的位置上、互相不重复、也不和我撞位。
    // 与后端 ValidateReviewHand 是同一份口径，两边不能有分歧
    const usedPositions: string[] = [];
    for (const villain of form.villains) {
      // 报错时优先用名字，没名字就用位置称呼他，与界面上的显示口径一致
      const label =
        villain.name ||
        (villain.position ? positionLabel(villain.position, form.tableSize) : '对手');

      if (villain.name.length > OPPONENT_NAME_MAX_LENGTH) {
        return `对手名字不要超过 ${OPPONENT_NAME_MAX_LENGTH} 个字`;
      }
      // 名字必须坐在一个位置上，否则 AI 拿到"老王 加注"不知道说的是哪个位置的人
      if (villain.name && !villain.position) {
        return `请给「${villain.name}」选一个位置`;
      }
      if (!villain.name && !villain.position) {
        return '有对手既没名字也没位置，请补全或删掉';
      }
      if (!villain.position) continue;

      if (!isValidPositionForTableSize(villain.position, form.tableSize)) {
        return `${form.tableSize} 人桌没有「${villain.position}」这个位置，请重新选择`;
      }
      if (villain.position === form.heroPosition) {
        return `「${label}」的位置和我的位置重复了`;
      }
      if (usedPositions.indexOf(villain.position) >= 0) {
        return `有两个对手都坐在 ${villain.position}`;
      }
      usedPositions.push(villain.position);
    }
    if (form.villains.length > form.tableSize - 1) {
      return `${form.tableSize} 人桌最多记录 ${form.tableSize - 1} 个对手`;
    }

    // 盲注要么都不填（不记盲注），要么至少有大盲 —— 大盲是折算基准，
    // 只填小盲或前注没有意义。与后端 utils.ValidateBlinds 是同一份口径，两边不能有分歧
    if (blinds.bigBlindBb === 0 && (blinds.smallBlindBb > 0 || blinds.anteBb > 0)) {
      return '填了小盲或前注，就必须填大盲';
    }
    if (blinds.bigBlindBb > 0 && blinds.smallBlindBb > blinds.bigBlindBb) {
      return '小盲不能大于大盲';
    }

    const cardError = validateCardString(form.heroCards);
    if (cardError) return `底牌：${cardError}`;

    const boardError = validateCardString(form.board, true);
    if (boardError) return `公共牌：${boardError}`;

    if (form.board.length / 2 === 1 || form.board.length / 2 === 2) {
      return '公共牌只能是 0、3、4 或 5 张';
    }

    // 牌不能重复：底牌和公共牌共用一副牌
    // 显式标注类型：match() 的返回值与 `|| []` 联合后会被推断成 never[]，
    // 导致下面的 indexOf 报"参数不能是 string"
    const heroCards: string[] = form.heroCards.match(/.{2}/g) || [];
    const boardCards: string[] = form.board.match(/.{2}/g) || [];
    const duplicated = boardCards.find((c) => heroCards.indexOf(c) >= 0);
    if (duplicated) return `${duplicated} 同时出现在底牌和公共牌里`;

    // 打了某条街却漏录该街的公共牌，交给 AI 会得到完全错误的分析，
    // 所以在提交前拦下来
    const boardCount = form.board.length / 2;
    const streetNeeds: { street: Street; need: number }[] = [
      { street: 'flop', need: 3 },
      { street: 'turn', need: 4 },
      { street: 'river', need: 5 },
    ];
    for (const { street, need } of streetNeeds) {
      const record = form.streets.find((s) => s.street === street);
      if (record && record.actions.length > 0 && boardCount < need) {
        return `记录了${street === 'flop' ? '翻牌' : street === 'turn' ? '转牌' : '河牌'}的行动，但没有录够公共牌`;
      }
    }

    // 下注类行动必须有金额
    for (const record of form.streets) {
      for (const action of record.actions) {
        if (
          (action.action === 'bet' || action.action === 'raise' || action.action === 'allin') &&
          (!action.amountBb || action.amountBb <= 0)
        ) {
          return `有下注/加注没有填写金额`;
        }
      }
    }

    return null;
  }, [form, blinds]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (tag.length > 12) {
      Taro.showToast({ title: '标签不要超过 12 个字', icon: 'none' });
      return;
    }
    if (form.heroTags.indexOf(tag) >= 0) {
      Taro.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    setField('heroTags', [...form.heroTags, tag]);
    setTagInput('');
  }, [tagInput, form.heroTags, setField]);

  const removeTag = useCallback((tag: string) => {
    setField('heroTags', form.heroTags.filter((t) => t !== tag));
  }, [form.heroTags, setField]);

  /** 组装提交给后端的请求体 */
  const buildPayload = useCallback(() => {
    // 对手逐个上报名字与位置；对手表的 id 由后端按名字解析，前端不参与。
    // undefined 的字段会被 JSON.stringify 丢掉，与后端 omitempty 的口径一致
    const villains = form.villains.map((villain) => ({
      position: (villain.position || '') as Position,
      stackBb: villain.stackBb ? Number(villain.stackBb) : undefined,
      isKey: villain.isKey || undefined,
      name: villain.name || undefined,
    }));

    // 载入的老手牌（对手全都没名字）在编辑时保持原来手填的"对手数量"：那个数字与
    // 列表长度不是一回事，改掉内容指纹就会变，已有的 AI 分析会被判为"不对应当前内容"。
    // 新建的手牌没有这个包袱，无名字只是"没起名字"，数量按列表长度报
    const isLegacyVillains =
      isEditMode &&
      loadedAllUnnamedRef.current &&
      villains.length > 0 &&
      villains.every((v) => !v.name);

    return {
      gameId: form.gameId,
      title: form.title.trim(),
      tableSize: form.tableSize,
      heroPosition: form.heroPosition as Position,
      heroCards: form.heroCards,
      heroStackBb: form.heroStackBb ? Number(form.heroStackBb) : 0,
      stakes: form.stakes.trim(),
      smallBlindBb: blinds.smallBlindBb,
      bigBlindBb: blinds.bigBlindBb,
      anteBb: blinds.anteBb,
      board: form.board,
      villainCount: isLegacyVillains ? legacyVillainCountRef.current : villains.length,
      villains,
      potType,
      // 只提交有行动的街，空街没必要占存储
      streets: form.streets.filter((s) => s.actions.length > 0),
      heroThought: form.heroThought.trim(),
      result: form.result,
      resultAmount: form.resultAmount ? Number(form.resultAmount) : undefined,
      heroTags: form.heroTags,
    };
  }, [form, potType, blinds, isEditMode]);

  // 提交。用 runAsync 是因为调用方要拿到成败来决定"是否返回上一页"
  const { runAsync: submitRequest, loading: submitting } = useRequest(
    async (): Promise<'updated' | 'created'> => {
      const payload = buildPayload();
      if (handId) {
        await reviewApi.updateHand(handId, payload);
        return 'updated';
      }
      await reviewApi.createHand(payload);
      // 提交成功才清草稿，失败要留着让用户重试
      try {
        Taro.removeStorageSync(DRAFT_STORAGE_KEY);
      } catch {
        // 清不掉也不影响主流程
      }
      return 'created';
    },
    {
      manual: true,
      onSuccess: (kind) =>
        Taro.showToast({ title: kind === 'updated' ? '已保存' : '已记录', icon: 'success' }),
      onError: (e) =>
        Taro.showToast({ title: e?.message || '保存失败', icon: 'none', duration: 2500 }),
    }
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const error = validate();
    if (error) {
      Taro.showToast({ title: error, icon: 'none', duration: 2500 });
      return false;
    }

    try {
      await submitRequest();
      return true;
    } catch {
      // onError 已经提示过，返回 false 让调用方不要返回上一页
      return false;
    }
  }, [validate, submitRequest]);

  const resetForm = useCallback(() => {
    setForm(emptyFormState);
    setExpandedStreets(['preflop']);
    try {
      Taro.removeStorageSync(DRAFT_STORAGE_KEY);
    } catch {
      // 忽略
    }
  }, []);

  return {
    // 数据
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
    /** 公共牌已占用的牌，底牌不能再选 */
    heroUnavailableCards: form.board,
    /** 底牌已占用的牌，公共牌不能再选 */
    boardUnavailableCards: form.heroCards,
    /** 行动可选的行动者：我 + 本手牌的对手，**按牌桌行动顺序** */
    actorOptions,
    /** 已弃牌的行动者（跨街累积）。弃牌即退出这手牌，录入页不再列出他们 */
    foldedActors,
    /** 每条街第一个该说话的人（已跳过弃牌者），空街新增行动时默认选他 */
    firstActorByStreet,
    /** 每条街开始时各人还剩多少后手（BB），用于「全下」自动填金额 */
    remainingStacksByStreet,
    /** 已被占用的位置，添加对手弹窗据此置灰 */
    takenPositions,
    hasKeyVillain,

    // 操作
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
    resetForm,
    validate,
  };
}

export default useReviewForm;
