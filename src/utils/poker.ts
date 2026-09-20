// ============================================
// 德州扑克领域工具
// 底池估算、街道文案、位置与桌型
// 录入页、详情页、列表卡片共用，避免各写一份
// ============================================

import type {
  ActionType,
  ActorType,
  HandResult,
  Position,
  PotType,
  Street,
  StreetAction,
  StreetRecord,
  VillainInfo,
} from '../models/types/review';

// 人数相关的常量定义在 models/types/review.ts（类型与其默认值放在一起），
// 这里再导一次，方便调用方只 import 一个模块
export { TABLE_SIZE_OPTIONS, DEFAULT_TABLE_SIZE } from '../models/types/review';

/** 街道顺序 */
export const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

/** 街道中文名 */
export const STREET_LABEL: Record<Street, string> = {
  preflop: '翻前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};

/** 行动中文名 */
export const ACTION_LABEL: Record<ActionType, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  allin: '全下',
};

/**
 * 老口径的聚合角色名。M7.1 起对手按位置指认，名字由 actorLabel() 从本手牌的
 * 对手列表里取，所以这张表里只有我和两个历史角色
 */
export const LEGACY_ACTOR_LABEL: Record<string, string> = {
  hero: '我',
  villain: '对手',
  other: '其他人',
};

/**
 * 行动者的展示名。
 *
 * 位置能对上本手牌的对手就用对手的名字（"老王"），对不上退回位置名（"CO"）；
 * 老数据的 villain / other 是聚合角色，没有具体的人可指
 */
export function actorLabel(actor: ActorType | string, villains: VillainInfo[] = []): string {
  const villain = villains.find((v) => v.position === actor);
  if (villain) return villain.name || villain.position;
  return LEGACY_ACTOR_LABEL[actor] || actor;
}

/** 老手牌里没有名字、也没有位置的对手：界面上只能显示成"对手" */
export const UNNAMED_VILLAIN_LABEL = '对手';

/**
 * 认人只需要"有没有名字"和"坐哪"，放宽成这个最小结构，
 * 好让录入页的表单对象（筹码是输入中的字符串）也能直接传进来
 */
export interface OpponentLike {
  name?: string;
  position?: Position | '';
}

/** 需要填写金额的行动 */
export const ACTION_NEEDS_AMOUNT: ActionType[] = ['bet', 'raise', 'allin'];

/**
 * 各人数下的合法位置，按翻前行动顺序（SB 先说话，BTN 最后）。
 *
 * 与后端 call-back/utils/hand.go 的 positionsByTableSize 是同一份契约，改动要两边同步。
 * 规律：9 人桌去掉 UTG+2 就是 8 人，再去掉 UTG+1 就是 7 人，以此类推；
 * 3 人桌只剩 BTN，2 人桌的 SB 同时兼任 BTN（单挑时按钮位下小盲）。
 */
const POSITIONS_BY_TABLE_SIZE: Record<number, Position[]> = {
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
  5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
  4: ['SB', 'BB', 'UTG', 'BTN'],
  3: ['SB', 'BB', 'BTN'],
  2: ['SB', 'BB'],
};

/** 全部位置，按翻前行动顺序。列表页筛选用它；人数取值异常时也回退到它 */
export const POSITION_ORDER: Position[] = POSITIONS_BY_TABLE_SIZE[9];

/** 该人数下的合法位置；人数越界时回退到全部位置，避免界面空掉 */
export function positionsForTableSize(tableSize: number): Position[] {
  return POSITIONS_BY_TABLE_SIZE[tableSize] || POSITION_ORDER;
}

/** 位置是否属于该人数下的合法集合 */
export function isValidPositionForTableSize(position: string, tableSize: number): boolean {
  return positionsForTableSize(tableSize).indexOf(position as Position) >= 0;
}

/**
 * 从 from 之后按牌桌顺序找下一个还没弃牌的行动者，最多绕一圈；找不到时返回 null。
 *
 * order 必须是**按行动顺序排好的完整座位表，且含已弃牌的人**。不能传"已滤掉弃牌者"
 * 的列表：上一条恰好是"某人弃牌"时，要先能在表里找到他的次序，才知道下一位是谁 ——
 * 他一被滤掉，轮转就从这里断了。
 *
 * from 不在表里时（老手牌把行动记在聚合角色 villain/other 上）从表头起数，
 * 等价于"随便找一个还能行动的人"
 */
export function nextActorAfter<T extends string>(
  order: T[],
  folded: ReadonlySet<T>,
  from: T
): T | null {
  if (order.length === 0) return null;

  const start = order.indexOf(from);
  const base = start < 0 ? -1 : start;

  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(base + step + order.length) % order.length];
    if (!folded.has(candidate)) return candidate;
  }
  return null;
}

/**
 * 本街第一个该说话的人，已跳过弃牌者；没人可行动时返回 null。
 *
 * 三种起点，别混：
 * - 翻前：盲注之后才轮到 UTG，所以从 BB 的下一位起数
 * - 翻后 3 人及以上：表头就是 SB（位置表本就按行动顺序排）
 * - **翻后单挑**：按钮位和小盲是同一个座位，所以先说话的是 BB —— 取表头（SB）
 *   是错的。2 人桌是唯一会出现这种重合的人数
 *
 * tableSize 是必要的：光看 order 分不清"表头是 SB"和"表头是同时兼任 BTN 的 SB"
 */
export function firstActorOfStreet<T extends string>(
  order: T[],
  folded: ReadonlySet<T>,
  street: Street,
  tableSize: number
): T | null {
  if (order.length === 0) return null;

  let start = 0;
  if (street === 'preflop') {
    const bb = order.indexOf('BB' as T);
    // 没把 BB 记成对手时退回表头，总好过整条街选不出人
    if (bb >= 0) start = (bb + 1) % order.length;
  } else if (tableSize === 2) {
    const bb = order.indexOf('BB' as T);
    if (bb >= 0) start = bb;
  }

  for (let step = 0; step < order.length; step += 1) {
    const candidate = order[(start + step) % order.length];
    if (!folded.has(candidate)) return candidate;
  }
  return null;
}

/**
 * 位置的展示名。2 人桌的 SB 同时是 BTN，标出来免得用户以为界面上漏了按钮位。
 * 存库的值始终是 SB——加个后缀只是为了显示，不参与任何匹配。
 */
export function positionLabel(position: Position | '', tableSize: number): string {
  if (tableSize === 2 && position === 'SB') return 'SB(BTN)';
  return position;
}

/** 桌型展示名，如 "6人桌" */
export function tableSizeLabel(tableSize: number): string {
  return `${tableSize}人桌`;
}

/** 结果中文名 */
export const RESULT_LABEL: Record<HandResult, string> = {
  win: '赢',
  lose: '输',
  fold: '弃牌',
  unknown: '未记录',
};

/** 底池类型中文名 */
export const POT_TYPE_LABEL: Record<PotType, string> = {
  hu: '单挑',
  multi: '多人池',
};

/** 金额展示：去掉无意义的小数尾巴，2.5 显示 2.5，4.0 显示 4 */
export function formatBB(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * 底池数字转成输入框里的字符串。
 * 0 落成空串而不是 "0" —— 空串统一表示"没记录盲注"，比让用户看到一排 0 更清楚
 */
export function bbToInput(value: number | undefined): string {
  return value && value > 0 ? formatBB(value) : '';
}

/** 输入框里的字符串转回数字。空串或解析不出数字都按 0（没记录）处理 */
export function inputToBb(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 盲注与前注的额度（BB）。
 *
 * 三项全为 0 表示"这手牌没记录盲注"，此时底池估算与加这个功能之前完全一致。
 *
 * 与后端 models.BlindConfig 是同一份契约，改动要两边同步。
 */
export interface BlindConfig {
  smallBlindBb: number;
  bigBlindBb: number;
  anteBb: number;
  /** 前注按人数折算 */
  tableSize: number;
  /** 位置用来把大小盲认到具体行动者头上，见 postedBlinds */
  heroPosition: Position | '';
  /** 记了位置的对手（M7.1 起是全部对手）。他们的账记在位置这个键上 */
  villainPositions: Position[];
  /**
   * 老手牌里那个"关键对手"的位置，作为聚合角色 villain 的兜底键。
   * 老数据的行动记在 villain 这个角色上，位置键认不到；新记录两份都记，
   * 但 villain 键不会命中，等于作废
   */
  legacyVillainPosition: Position | '';
}

/**
 * 从对手列表里挑出记了位置的，供 BlindConfig 认人用。
 *
 * 形参放宽成最小结构而不是 VillainInfo：录入页的表单里筹码是字符串，
 * 只需要名字与位置这两项，没必要为此在表单里再存一份 VillainInfo
 */
export function blindPositionsOf(villains: OpponentLike[] = []): Pick<
  BlindConfig,
  'villainPositions' | 'legacyVillainPosition'
> {
  const villainPositions: Position[] = [];
  let legacyVillainPosition: Position | '' = '';
  for (const villain of villains) {
    if (!villain.position) continue;
    // 有没有名字都按位置认账：名字只是称呼，且现在允许只记位置不记名字
    villainPositions.push(villain.position);
    // 老手牌的行动记在聚合角色 villain 上，位置这个键对不上，所以额外把第一个
    // 没名字的对手认到 villain 键上兜底（老数据最多一个对手带位置）。
    // 新记录的行动按位置记，这个键不会命中，等于没记
    if (!villain.name && !legacyVillainPosition) {
      legacyVillainPosition = villain.position;
    }
  }
  return { villainPositions, legacyVillainPosition };
}

/** 没记录任何盲注 */
export function blindsAreZero(blinds: BlindConfig): boolean {
  return blinds.smallBlindBb === 0 && blinds.bigBlindBb === 0 && blinds.anteBb === 0;
}

/** 翻前第一条行动之前的底池：小盲 + 大盲 + 前注 × 人数 */
export function preflopPotBb(blinds: BlindConfig): number {
  let total = blinds.smallBlindBb + blinds.bigBlindBb;
  if (blinds.anteBb > 0 && blinds.tableSize > 0) {
    total += blinds.anteBb * blinds.tableSize;
  }
  return total;
}

/**
 * 大小盲分别已经算在谁头上。
 *
 * 盲注虽然作为死钱进了底池，但下盲注的人后续跟注时只需要补差额。
 * 若不把他的盲注记进他的已投入，大盲跟一个 3bb 的开池会被算成再掏 3bb（实际只需 2bb），
 * 底池反而比"完全不记盲注"偏得更多。
 *
 * 认不出身份的盲注（大盲在"其他人"里）不记：凭空挂到某个行动者名下
 * 等于替一个没记录的人下注。它仍会通过 preflopPotBb 进底池，只是不参与差额计算。
 *
 * 返回的键是**行动记录里的 actor 值**：我固定是 hero，对手是位置（M7.1 起），
 * 老手牌则是聚合角色 villain。键对不上就等于没记账，所以两边必须一起改
 * （与后端 models/blind.go 的 PostedBlinds 同构）
 */
function postedBlinds(blinds: BlindConfig): Record<string, number> {
  const posted: Record<string, number> = {};
  const credit = (actor: string, position: Position | '') => {
    if (position === 'SB') posted[actor] = (posted[actor] || 0) + blinds.smallBlindBb;
    else if (position === 'BB') posted[actor] = (posted[actor] || 0) + blinds.bigBlindBb;
  };
  credit('hero', blinds.heroPosition);
  for (const position of blinds.villainPositions) credit(position, position);
  credit('villain', blinds.legacyVillainPosition);
  return posted;
}

/**
 * 盲注的展示文案，如 "小盲 0.5 / 大盲 1 bb"。没记录时返回空串，调用方据此决定要不要渲染
 */
export function blindsLabel(blinds: BlindConfig): string {
  if (blindsAreZero(blinds)) return '';
  const parts = [`小盲 ${formatBB(blinds.smallBlindBb)}`, `大盲 ${formatBB(blinds.bigBlindBb)}`];
  if (blinds.anteBb > 0) parts.push(`前注 ${formatBB(blinds.anteBb)}`);
  return `${parts.join(' / ')} bb`;
}

/** 一条街的底池推进 */
export interface PotStep {
  street: Street;
  /** 该街开始时的底池（BB） */
  potStartBb: number;
  /** 该街结束时的底池（BB） */
  potEndBb: number;
}

export interface PotResult {
  byStreet: Partial<Record<Street, PotStep>>;
  /** 全部街打完后的底池 */
  finalPotBb: number;
}

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((sum, value) => sum + value, 0);
}

/**
 * 把一条街的行动过一遍，返回该街结束时"每人本街投了多少"与"本街最高下注额"。
 *
 * 抽出来是为了让**底池推算**和**全下该填多少**共用同一套差额规则。这套规则很容易
 * 改歪（跟注要跟到多少、加注记的是"加到多少"而不是"加了多少"），散成两份必然走样。
 * 与后端 utils/pot.go 的 ComputeStreetPots 也是同一份契约
 *
 * 入参的 contributed 不被修改；返回的 total 是本街净投入的合计（供累加底池）
 */
function walkStreetActions(
  actions: StreetAction[],
  contributed: Record<string, number>,
  currentBet: number
): { contributed: Record<string, number>; currentBet: number; total: number } {
  const next = { ...contributed };
  let bet = currentBet;
  const before = sumValues(next);

  for (const action of actions) {
    const actor = action.actor;
    const prev = next[actor] || 0;
    let delta = 0;

    switch (action.action) {
      case 'bet':
      case 'raise':
      case 'allin':
        // 三者记的都是"本街累计投到多少"，所以净投入要用当前投入去减。
        // 全下同理：他推光本街，本街累计就是他进街时手里剩的全部
        delta = Math.max(0, (action.amountBb || 0) - prev);
        bet = Math.max(bet, action.amountBb || 0);
        break;
      case 'call':
        delta = Math.max(0, bet - prev);
        break;
      case 'check':
      case 'fold':
      default:
        delta = 0;
    }

    next[actor] = prev + delta;
  }

  return { contributed: next, currentBet: bet, total: sumValues(next) - before };
}

/**
 * 每个行动者在本街**开始之前**已经投进底池的总额（BB）。
 *
 * 前注不在内 —— 它不参与"跟到多少"的抵消，与 computePots 同一口径
 */
export function contributionBeforeStreet(
  streets: StreetRecord[],
  street: Street,
  blinds?: BlindConfig
): Record<string, number> {
  const spent: Record<string, number> = {};
  const target = STREET_ORDER.indexOf(street);
  if (target <= 0) return spent;

  for (const earlier of STREET_ORDER.slice(0, target)) {
    const record = streets.find((s) => s.street === earlier);
    if (!record || record.actions.length === 0) continue;

    let contributed: Record<string, number> = {};
    let currentBet = 0;
    // 翻前要先摆好盲注的棋盘，理由同 computePots：大盲跟注要补的是差额
    if (earlier === 'preflop' && blinds) {
      contributed = { ...postedBlinds(blinds) };
      currentBet = blinds.bigBlindBb;
    }

    const walked = walkStreetActions(record.actions, contributed, currentBet);
    for (const [actor, amount] of Object.entries(walked.contributed)) {
      spent[actor] = (spent[actor] || 0) + amount;
    }
  }

  return spent;
}

/**
 * 本街开始时，每个行动者手里还剩多少后手（BB）。用于「全下」自动填金额 ——
 * 他推光本街，本街累计投入正好等于进街时剩下的这些。
 *
 * stacks 是各行动者**带进这手牌的筹码**；没记录筹码的人不要放进表里。
 * 返回的表里也只有算得出来的人，调用方据此决定能不能自动填（算不出就留空手填，
 * 编一个数进去等于往库里写假数据）
 */
export function remainingStacksAtStreet(
  streets: StreetRecord[],
  street: Street,
  stacks: Record<string, number>,
  blinds?: BlindConfig
): Record<string, number> {
  const spent = contributionBeforeStreet(streets, street, blinds);
  const remaining: Record<string, number> = {};

  for (const [actor, stack] of Object.entries(stacks)) {
    // 两位小数沿用 formatBB 的口径：浮点减法会留下 97.30000000000001 这种尾巴
    const left = Math.round((stack - (spent[actor] || 0)) * 100) / 100;
    // 负数只可能来自记录有误（投得比带进来的还多），夹到 0，别把负数填进金额框
    remaining[actor] = Math.max(0, left);
  }

  return remaining;
}

/**
 * 按记录的行动估算底池。
 *
 * 跟注的金额不要求用户填 —— 它一定等于当前街的最高下注额，能推出来。
 * 加注记录的是"加到多少"，所以本街的净投入要用当前投入去减。
 *
 * blinds 是手牌上记录的盲注与前注。传空或不传时行为与加这个功能之前完全一致。
 * 与后端 utils/pot.go 的 ComputeStreetPots 是同一份契约，改动要两边同步。
 *
 * 注意：盲注有了之后仍然是估算值（抓头等变体不在记录范围内），UI 上必须继续标明。
 */
export function computePots(streets: StreetRecord[], blinds?: BlindConfig): PotResult {
  const byStreet: Partial<Record<Street, PotStep>> = {};
  let pot = blinds ? preflopPotBb(blinds) : 0;

  for (const street of STREET_ORDER) {
    const record = streets.find((s) => s.street === street);
    const potStart = pot;

    if (record && record.actions.length > 0) {
      // 本街每个行动者的已投入，用于算跟注差额和加注差额。
      // other 是聚合角色，多个"其他人"共用一个桶，是简化处理
      let contributed: Record<string, number> = {};
      // 当前街的最高下注额，跟注要跟到这么多
      let currentBet = 0;

      // 翻前要先摆好盲注的棋盘，否则第一条行动的差额会算错：
      // 1) 大盲跟注要补的是"开池额 - 已下的大盲"，不是开池额本身
      // 2) 大盲过牌是免费看翻牌；不预设 currentBet 的话，过牌后的跟注会少算
      // 前注不进 contributed：它不参与"跟到多少"的抵消，只算死钱
      if (street === 'preflop' && blinds) {
        contributed = { ...postedBlinds(blinds) };
        currentBet = blinds.bigBlindBb;
      }

      // 只把本街的**净投入**加进底池：翻前的盲注已经由 preflopPotBb 记过了
      pot += walkStreetActions(record.actions, contributed, currentBet).total;
    }

    byStreet[street] = { street, potStartBb: potStart, potEndBb: pot };
  }

  return { byStreet, finalPotBb: pot };
}

/**
 * 底池类型（单挑 / 多人池）由翻后仍在池中的人数决定，不再让用户手填。
 *
 * 口径是"翻前有记录且没弃牌的对手"：翻前就弃了的不算，翻前压根没记录的也不算 ——
 * 这与"从头到尾没出现在行动里的座位默认弃牌"是同一条规则（M7.2 会把这些人补成
 * 弃牌行，届时两种写法结果一致）。
 *
 * 一条翻前行动都没记时退回按对手数推断：录入过程中标签会随记录逐步修正，
 * 总比中途一直显示"单挑"要合理
 */
export function derivePotType(
  streets: StreetRecord[],
  villains: OpponentLike[] = []
): PotType {
  const preflop = streets.find((s) => s.street === 'preflop');
  if (!preflop || preflop.actions.length === 0) {
    return villains.length > 1 ? 'multi' : 'hu';
  }

  const inPot = new Set<string>();
  for (const action of preflop.actions) {
    if (action.action === 'fold') inPot.delete(action.actor);
    else inPot.add(action.actor);
  }

  const opponentsInPot = villains.filter(
    (v) => !!v.position && inPot.has(v.position)
  ).length;
  return opponentsInPot > 1 ? 'multi' : 'hu';
}

/**
 * 生成默认标题：位置 + 底牌 + 底池类型。
 * 后端在标题为空时也会生成一份，这里生成是为了让用户在填写时就能看到标题。
 */
export function buildDefaultTitle(
  position: Position | '',
  heroCards: string,
  potType: PotType
): string {
  const parts: string[] = [];
  if (position) parts.push(position);
  if (heroCards && heroCards.length === 4) parts.push(heroCards);
  parts.push(POT_TYPE_LABEL[potType]);
  return parts.join(' ');
}

// 牌面校验统一放在 utils/cards.ts，这里再导出一次方便调用方只 import 一个模块
export { validateCardString } from './cards';
