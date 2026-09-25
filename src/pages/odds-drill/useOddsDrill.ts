// ============================================
// 赔率训练页的状态与流程
//
// 一组题 = 固定题量的题型循环（见 utils/oddsDrill.ts 的 KIND_CYCLE）。
// 页面组件只负责画，状态都在这里。
//
// 出题器的随机源在这里决定：带 ?seed= 就出可复现的一套题，否则走 Math.random。
// 页面需要这个开关是因为**只有它需要**——引擎和出题器本身不碰全局随机数
//
// 累计进度落在本地存储（utils/oddsDrillStorage.ts），每次作答都写一次 ——
// 写一次的成本可以忽略，但这样中途退出小程序也不会丢
// ============================================

import { useCallback, useRef, useState } from 'react';
import { useRouter } from '@tarojs/taro';
import {
  DEFAULT_DRILLS_PER_SET,
  Difficulty,
  Drill,
  GradeResult,
  generateDrill,
  gradeAnswer,
  kindAt,
  parseEquityInput,
} from '../../utils/oddsDrill';
import {
  DrillAttempt,
  DrillProgress,
  applyAttempt,
  averageMs,
} from '../../utils/oddsDrillProgress';
import { loadProgress, saveProgress } from '../../utils/oddsDrillStorage';

/** 四档难度全部开放（M3） */
export const AVAILABLE_DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: '入门',
  2: '常规',
  3: '进阶',
  4: '混合',
};

export interface DrillStats {
  correct: number;
  /** 当前连击 */
  streak: number;
  /** 本组最高连击 */
  bestStreak: number;
}

/**
 * 可复现的伪随机数（mulberry32）。
 *
 * 与 tools/open-size-ev/rng.ts 是同一套算法，**故意各留一份**：
 * tools/ 是 node 工具、不在 app 的 tsconfig include 里，跨引用会把 node 代码拖进小程序包。
 * 页面需要它只为 ?seed= 参数——e2e 要断言具体数字，平时排查「刚才那组题」也用得上
 */
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSet(difficulty: Difficulty, seed?: number): Drill[] {
  const rng =
    seed !== undefined && Number.isFinite(seed) ? createSeededRng(seed) : Math.random;

  return Array.from({ length: DEFAULT_DRILLS_PER_SET }, (_, i) =>
    generateDrill(kindAt(difficulty, i), difficulty, rng),
  );
}

export function useOddsDrill() {
  const router = useRouter();
  const seedParam = router.params?.seed;
  const seed =
    seedParam !== undefined && seedParam !== '' ? Number(seedParam) : undefined;

  const [difficulty, setDifficulty] = useState<Difficulty>(2);
  const [drills, setDrills] = useState<Drill[]>(() => buildSet(2, seed));
  const [index, setIndex] = useState(0);
  /** 本组已选的答案，null = 还没答 */
  const [picked, setPicked] = useState<number | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  /** 填空题的原始输入 */
  const [draft, setDraft] = useState('');
  /** 填空题输入看不懂时的提示 */
  const [draftInvalid, setDraftInvalid] = useState(false);
  const [stats, setStats] = useState<DrillStats>({
    correct: 0,
    streak: 0,
    bestStreak: 0,
  });
  const [finished, setFinished] = useState(false);
  /** 本组的作答记录，用来算平均耗时与列错题 */
  const [attempts, setAttempts] = useState<DrillAttempt[]>([]);
  /** 当前这组是不是「重练错题」 */
  const [isRetry, setIsRetry] = useState(false);
  /** 累计进度，跨会话留存 */
  const [progress, setProgress] = useState<DrillProgress>(() => loadProgress());

  /** 本题开始作答的时刻，用来算耗时 */
  const startedAtRef = useRef(Date.now());

  const current = drills[index];
  const answered = picked !== null;
  const isLast = index + 1 >= drills.length;
  /** 胜率题且没有选项 = 填空题（反查题是档位选择、判断题是两个按钮） */
  const isFillIn = current.answerKind === 'equity' && current.choices.length === 0;

  const clearAnswer = useCallback(() => {
    setPicked(null);
    setGrade(null);
    setDraft('');
    setDraftInvalid(false);
  }, []);

  /** 换一组题（换难度、重开、重练错题都走它） */
  const startSet = useCallback((nextDrills: Drill[], retry: boolean) => {
    setDrills(nextDrills);
    setIndex(0);
    setFinished(false);
    setStats({ correct: 0, streak: 0, bestStreak: 0 });
    setAttempts([]);
    setIsRetry(retry);
    setPicked(null);
    setGrade(null);
    setDraft('');
    setDraftInvalid(false);
    startedAtRef.current = Date.now();
  }, []);

  const reset = useCallback(
    (nextDifficulty: Difficulty) => {
      setDifficulty(nextDifficulty);
      startSet(buildSet(nextDifficulty, seed), false);
    },
    [seed, startSet],
  );

  const changeDifficulty = useCallback(
    (value: number | string) => {
      const next = Number(value) as Difficulty;
      if (next === difficulty && !isRetry) return;
      reset(next);
    },
    [difficulty, isRetry, reset],
  );

  const restart = useCallback(() => reset(difficulty), [reset, difficulty]);

  /** 重练错题：直接把错题本身拿来当题库（存的是整个 Drill，所以题目一模一样） */
  const retryWrong = useCallback(() => {
    const wrongDrills = progress.wrong.map((item) => item.drill);
    if (wrongDrills.length === 0) return;
    startSet(wrongDrills, true);
  }, [progress.wrong, startSet]);

  /** 作答。已经答过就直接忽略，防止连点把统计刷成两题 */
  const answer = useCallback(
    (value: number) => {
      if (picked !== null) return;

      const result = gradeAnswer(current, value);
      const elapsedMs = Date.now() - startedAtRef.current;
      const nextStreak = result.correct ? stats.streak + 1 : 0;

      setPicked(value);
      setGrade(result);
      setStats((prev) => ({
        correct: prev.correct + (result.correct ? 1 : 0),
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
      }));

      const attempt: DrillAttempt = {
        drill: current,
        input: value,
        correct: result.correct,
        elapsedMs,
      };
      setAttempts((prev) => [...prev, attempt]);

      // 累计进度每次作答都落一次盘：中途退出也不丢
      const nextProgress = applyAttempt(progress, attempt, nextStreak);
      setProgress(nextProgress);
      saveProgress(nextProgress);
    },
    [picked, current, stats.streak, progress],
  );

  /** 填空题提交：解析不出数字就不作答，只提示，让用户改 */
  const submitDraft = useCallback(() => {
    const parsed = parseEquityInput(draft);
    if (parsed === null) {
      setDraftInvalid(true);
      return;
    }
    setDraftInvalid(false);
    answer(parsed);
  }, [draft, answer]);

  const next = useCallback(() => {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((prev) => prev + 1);
    clearAnswer();
    startedAtRef.current = Date.now();
  }, [isLast, clearAnswer]);

  const answeredCount = index + (answered ? 1 : 0);
  const accuracy =
    answeredCount > 0 ? Math.round((stats.correct / answeredCount) * 100) : 0;

  return {
    // 数据
    current,
    difficulty,
    drillsTotal: drills.length,
    index,
    isLast,
    picked,
    grade,
    answered,
    finished,
    stats,
    isFillIn,
    isRetry,

    // 本组记录
    attempts,
    avgMs: averageMs(attempts),
    wrongInSet: attempts.filter((item) => !item.correct),

    // 累计进度
    progress,

    // 填空题
    draft,
    setDraft,
    draftInvalid,
    submitDraft,

    // 派生
    accuracy,
    answeredCount,
    difficultyLabel: DIFFICULTY_LABEL[difficulty],

    // 操作
    answer,
    next,
    restart,
    retryWrong,
    changeDifficulty,
  };
}
