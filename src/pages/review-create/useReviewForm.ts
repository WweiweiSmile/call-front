import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { usePageData } from '../../hooks';
import { gameApi, preferenceApi, reviewApi } from '../../services/api';
import {
  DEFAULT_TABLE_SIZE,
  STREET_ORDER,
  bbToInput,
  buildDefaultTitle,
  computePots,
  inputToBb,
  isValidPositionForTableSize,
  positionsForTableSize,
  validateCardString,
} from '../../utils/poker';
import type { BlindConfig } from '../../utils/poker';
import type {
  HandResult,
  Position,
  PotType,
  Street,
  StreetAction,
  StreetRecord,
  TableSize,
} from '../../models/types/review';

/** 草稿在本地存储里的 key。小程序切后台被杀进程是常事，表单必须能恢复 */
export const DRAFT_STORAGE_KEY = 'review_hand_draft';

/** 表单内部状态。数字字段用 string 存，输入过程中允许为空 */
export interface ReviewFormState {
  gameId?: number;
  title: string;
  /** 几人桌。它决定 heroPosition / villainPosition 的可选项，改动时要一起收拾 */
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
  villainCount: number;
  /** v1 只记录一个关键对手，其余归入"其他人" */
  villainPosition: Position | '';
  villainStackBb: string;
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
  villainCount: 1,
  villainPosition: '',
  villainStackBb: '',
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

export function useReviewForm(handId?: string) {
  const isEditMode = !!handId;
  const [form, setForm] = useState<ReviewFormState>(emptyFormState);
  /** 展开的街道。默认只展开翻前，避免一屏塞四条街 */
  const [expandedStreets, setExpandedStreets] = useState<Street[]>(['preflop']);
  const [tagInput, setTagInput] = useState('');
  /** 草稿是否已读取完毕。没读完之前不允许自动保存，否则会覆盖存储里的草稿 */
  const [draftHydrated, setDraftHydrated] = useState(false);

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
          villainCount: hand.villainCount || 1,
          villainPosition: (hand.villains || []).find((v) => v.isKey)?.position || '',
          villainStackBb: (() => {
            const stack = (hand.villains || []).find((v) => v.isKey)?.stackBb;
            return stack !== undefined ? String(stack) : '';
          })(),
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
   */
  const setTableSize = useCallback((size: TableSize) => {
    setForm((prev) => {
      const valid = positionsForTableSize(size);
      return {
        ...prev,
        tableSize: size,
        heroPosition: valid.indexOf(prev.heroPosition as Position) >= 0 ? prev.heroPosition : '',
        villainPosition:
          valid.indexOf(prev.villainPosition as Position) >= 0 ? prev.villainPosition : '',
      };
    });
  }, []);

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

  // ---------- 盲注 ----------
  // 位置要一起带上：底池推算靠它把大小盲认到具体行动者头上，否则大盲跟注会被多算
  const blinds: BlindConfig = useMemo(() => ({
    smallBlindBb: inputToBb(form.smallBlindBb),
    bigBlindBb: inputToBb(form.bigBlindBb),
    anteBb: inputToBb(form.anteBb),
    tableSize: form.tableSize,
    heroPosition: form.heroPosition,
    villainPosition: form.villainPosition,
  }), [
    form.smallBlindBb,
    form.bigBlindBb,
    form.anteBb,
    form.tableSize,
    form.heroPosition,
    form.villainPosition,
  ]);

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

  // ---------- 有效筹码联动：底牌选好后允许自动带出 ----------
  const potType: PotType = form.villainCount > 1 ? 'multi' : 'hu';

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
  }, [form]);

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
    // 关键对手信息合并成 villains 数组
    const villains = form.villainPosition
      ? [{
          position: form.villainPosition,
          stackBb: form.villainStackBb ? Number(form.villainStackBb) : undefined,
          isKey: true,
        }]
      : [];

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
      villainCount: form.villainCount,
      villains,
      potType,
      // 只提交有行动的街，空街没必要占存储
      streets: form.streets.filter((s) => s.actions.length > 0),
      heroThought: form.heroThought.trim(),
      result: form.result,
      resultAmount: form.resultAmount ? Number(form.resultAmount) : undefined,
      heroTags: form.heroTags,
    };
  }, [form, potType, blinds]);

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

    // 操作
    setField,
    setTableSize,
    setStreetActions,
    toggleStreet,
    handleBoardChange,
    setTagInput,
    addTag,
    removeTag,
    submit,
    resetForm,
    validate,
  };
}

export default useReviewForm;
