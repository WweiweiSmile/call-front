// ============================================
// 训练进度的纯逻辑（不依赖 React / Taro）
//
// 与 oddsDrillStorage.ts 的分工：这个文件是**全部**逻辑与防御性解析，
// 那边只是一层 Taro 读写。这么拆是因为一旦 import Taro，本文件就进不了
// node —— 而「读到脏数据不能崩」恰好是最需要被对拍脚本常驻覆盖的一条
// （见 tools/odds-check 的「进度存储的脏数据兜底」）
//
// 所有函数都是纯的：applyAttempt 返回新对象，不改传入的那个
// ============================================

import { Drill, DrillKind } from './oddsDrill';

/** 一次作答的完整记录。存整个 Drill 是为了让错题能**原样重练** */
export interface DrillAttempt {
  drill: Drill;
  /** 用户给的答案，单位同 drill.answerKind */
  input: number;
  correct: boolean;
  /** 本题耗时（毫秒） */
  elapsedMs: number;
}

export interface KindStat {
  total: number;
  correct: number;
}

export interface DrillProgress {
  /** 累计作答**次数**（重练也计入 —— 每次作答都是一次练习） */
  total: number;
  correct: number;
  /** 历史最高连击 */
  bestStreak: number;
  byKind: Record<DrillKind, KindStat>;
  /** 还没答对的错题，最新答错的在前 */
  wrong: DrillAttempt[];
}

/** 带版本号的 key：将来改结构时不会读到旧结构的脏数据 */
export const PROGRESS_STORAGE_KEY = 'odds_drill_progress_v1';

/** 错题只留最近这么多条，防止存储无限增长 */
export const MAX_WRONG_KEPT = 20;

const KINDS: DrillKind[] = [
  'face-bet',
  'after-raise',
  'outs-to-equity',
  'max-call',
  'call-or-fold',
];

function emptyByKind(): Record<DrillKind, KindStat> {
  const result = {} as Record<DrillKind, KindStat>;
  for (const kind of KINDS) result[kind] = { total: 0, correct: 0 };
  return result;
}

export function emptyProgress(): DrillProgress {
  return { total: 0, correct: 0, bestStreak: 0, byKind: emptyByKind(), wrong: [] };
}

/**
 * 记一次作答。返回新进度。
 *
 * 答对时会把**同一道题**从错题里移除 —— 重练答对就出列，
 * 这个循环正是「错题回顾」存在的意义。同一道题用 prompt 认（同 seed 下稳定）
 */
export function applyAttempt(
  progress: DrillProgress,
  attempt: DrillAttempt,
  streak: number,
): DrillProgress {
  const kind = attempt.drill.kind;
  const previous = progress.byKind[kind] ?? { total: 0, correct: 0 };

  const wrong = attempt.correct
    ? progress.wrong.filter((item) => item.drill.prompt !== attempt.drill.prompt)
    : [attempt, ...progress.wrong.filter((item) => item.drill.prompt !== attempt.drill.prompt)]
        .slice(0, MAX_WRONG_KEPT);

  return {
    total: progress.total + 1,
    correct: progress.correct + (attempt.correct ? 1 : 0),
    bestStreak: Math.max(progress.bestStreak, streak),
    byKind: {
      ...progress.byKind,
      [kind]: {
        total: previous.total + 1,
        correct: previous.correct + (attempt.correct ? 1 : 0),
      },
    },
    wrong,
  };
}

/** 累计正确率（百分比整数）。一次都没答时返回 0 */
export function accuracyOf(progress: DrillProgress): number {
  return progress.total > 0
    ? Math.round((progress.correct / progress.total) * 100)
    : 0;
}

/** 本组平均耗时（毫秒）。没答过返回 0 */
export function averageMs(attempts: DrillAttempt[]): number {
  if (attempts.length === 0) return 0;
  const sum = attempts.reduce((acc, item) => acc + item.elapsedMs, 0);
  return Math.round(sum / attempts.length);
}

/** 毫秒 → 展示用秒数：4200 → "4.2" */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

// ============================================
// 防御性解析
//
// 存储里的东西可能来自：旧版本的结构、被手工改过的值、写到一半失败的写入。
// 读的时候**任何一处不对都不能抛错**（一抛错整个页面就白屏了），
// 能救的字段救回来，救不回来的退回默认值
// ============================================

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** 一条错题记录得像那么回事才收。认不出的直接丢掉，不让它污染统计 */
function isAttemptLike(value: unknown): value is DrillAttempt {
  if (!isObject(value)) return false;
  const { drill, input, correct, elapsedMs } = value;
  if (!isObject(drill)) return false;
  return (
    typeof drill.prompt === 'string' &&
    typeof drill.expected === 'number' &&
    typeof drill.kind === 'string' &&
    KINDS.includes(drill.kind as DrillKind) &&
    typeof input === 'number' &&
    typeof correct === 'boolean' &&
    typeof elapsedMs === 'number'
  );
}

function parseByKind(value: unknown): Record<DrillKind, KindStat> {
  const result = emptyByKind();
  if (!isObject(value)) return result;

  for (const kind of KINDS) {
    const stat = value[kind];
    if (!isObject(stat)) continue;
    result[kind] = {
      total: numberOr(stat.total, 0),
      correct: numberOr(stat.correct, 0),
    };
  }
  return result;
}

/**
 * 把存储里读到的任意值解析成进度。
 *
 * 接受两种形态：JSON 字符串（我们写进去的就是它），或已经解析好的对象
 * （有些平台的 storage 会自动反序列化）。两种都不对就返回空进度
 */
export function parseProgress(raw: unknown): DrillProgress {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    if (!raw.trim()) return emptyProgress();
    try {
      value = JSON.parse(raw);
    } catch {
      // 写坏了 / 被手工改过 —— 退回空进度，而不是让页面崩
      return emptyProgress();
    }
  }

  if (!isObject(value)) return emptyProgress();

  const wrongRaw = Array.isArray(value.wrong) ? value.wrong : [];
  // total / correct 各自兜底，还要保证 correct 不超过 total（脏数据里可能反了）
  const total = numberOr(value.total, 0);
  const correct = Math.min(numberOr(value.correct, 0), total);

  return {
    total,
    correct,
    bestStreak: numberOr(value.bestStreak, 0),
    byKind: parseByKind(value.byKind),
    wrong: wrongRaw.filter(isAttemptLike).slice(0, MAX_WRONG_KEPT),
  };
}

/** 存进去的形态：JSON 字符串 */
export function serializeProgress(progress: DrillProgress): string {
  return JSON.stringify(progress);
}
