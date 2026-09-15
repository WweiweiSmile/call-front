import { useCallback, useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { reviewApi } from '../../services/api';
import {
  transformAIStatusFromApi,
  transformAnalysisFromApi,
  transformLeakTagListFromApi,
} from '../../models';
import type { FrontendAIStatus, FrontendAnalysis } from '../../models/types/review';

/** 轮询间隔 */
const POLL_INTERVAL_MS = 2000;
/** 最大轮询次数，2 秒 × 90 = 3 分钟，超出就认为卡死了 */
const MAX_POLLS = 90;

/**
 * 复盘分析的取数与轮询。
 *
 * 分析在后端是异步任务（一次模型调用 20~60 秒），所以触发后要轮询状态。
 * 项目里 game-detail 也有轮询，用的是同一套思路。
 */
export function useAnalysis(handId?: string) {
  const [analysis, setAnalysis] = useState<FrontendAnalysis | null>(null);
  const [aiStatus, setAIStatus] = useState<FrontendAIStatus | null>(null);
  const [tagNameByCode, setTagNameByCode] = useState<Record<string, string>>({});
  const [triggering, setTriggering] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  /** 组件是否还挂载着。卸载后不能再 setState，否则会报内存泄漏警告 */
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---------- 标签字典：把模型的 tagCode 渲染成人话 ----------
  useEffect(() => {
    reviewApi.getLeakTags()
      .then((res) => {
        if (!mountedRef.current) return;
        const tags = transformLeakTagListFromApi(res.list || []);
        const map: Record<string, string> = {};
        tags.forEach((t) => { map[t.code] = t.name; });
        setTagNameByCode(map);
      })
      .catch(() => {
        // 字典拉不到时退回显示 tagCode 原文，不影响主流程
      });
  }, []);

  const refreshAIStatus = useCallback(async () => {
    try {
      const res = await reviewApi.getAIStatus();
      if (mountedRef.current) setAIStatus(transformAIStatusFromApi(res));
    } catch {
      // 状态拉不到就先不展示额度，不影响分析本身
    }
  }, []);

  useEffect(() => {
    refreshAIStatus();
  }, [refreshAIStatus]);

  // ---------- 轮询 ----------
  const poll = useCallback((analysisId: string) => {
    clearTimer();
    pollCountRef.current = 0;

    const tick = async () => {
      if (!mountedRef.current) return;

      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        Taro.showToast({ title: '分析耗时异常，请稍后刷新查看', icon: 'none' });
        return;
      }

      try {
        const res = await reviewApi.getAnalysis(analysisId);
        if (!mountedRef.current) return;
        const next = transformAnalysisFromApi(res);
        setAnalysis(next);

        if (next.status === 'done' || next.status === 'failed') {
          // 结束了就停止轮询，并按最新状态刷新额度
          refreshAIStatus();
          return;
        }
      } catch {
        // 单次轮询失败不终止整体轮询：网络抖动很常见，
        // 下个 tick 大概率就好了
      }

      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
  }, [clearTimer, refreshAIStatus]);

  // ---------- 载入手牌对应的最近一次分析 ----------
  const loadLatest = useCallback(async () => {
    if (!handId) return;
    try {
      const res = await reviewApi.getHandAnalyses(handId);
      if (!mountedRef.current) return;
      const list = (res.list || []).map(transformAnalysisFromApi);
      // 接口按时间倒序返回，取最新的一条
      const latest = list[0] || null;
      setAnalysis(latest);

      // 上次退出时分析可能还没跑完，这里接着轮询
      if (latest && (latest.status === 'pending' || latest.status === 'running')) {
        poll(latest.id);
      }
    } catch {
      // 拿不到历史分析就当没有，用户可以自己点分析
    }
  }, [handId, poll]);

  useEffect(() => {
    mountedRef.current = true;
    loadLatest();
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [loadLatest, clearTimer]);

  // ---------- 触发分析 ----------
  const trigger = useCallback(async () => {
    if (!handId || triggering) return;
    setTriggering(true);
    try {
      const res = await reviewApi.analyzeHand(handId);
      const next = transformAnalysisFromApi(res.analysis);

      if (res.reused) {
        Taro.showToast({ title: '内容没变，直接用了上次的结论', icon: 'none', duration: 2000 });
      }

      setAnalysis(next);

      if (next.status === 'pending' || next.status === 'running') {
        poll(next.id);
      }
      refreshAIStatus();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '触发分析失败', icon: 'none', duration: 2500 });
    } finally {
      if (mountedRef.current) setTriggering(false);
    }
  }, [handId, triggering, poll, refreshAIStatus]);

  return {
    analysis,
    aiStatus,
    tagNameByCode,
    triggering,
    trigger,
    /** 从编辑页返回后重新拉一次，避免展示已被改动的旧结论 */
    reload: loadLatest,
  };
}

export default useAnalysis;
