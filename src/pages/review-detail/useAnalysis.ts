import { useCallback, useRef, useState } from 'react';
import { useRequest } from 'ahooks';
import Taro from '@tarojs/taro';
import { reviewApi } from '../../services/api';
import {
  transformAIStatusFromApi,
  transformAnalysisFromApi,
  transformLeakTagListFromApi,
} from '../../models';
import type { AnalysisStatus, FrontendAIStatus, FrontendAnalysis } from '../../models/types/review';

/** 轮询间隔 */
const POLL_INTERVAL_MS = 2000;
/**
 * 最大轮询次数，2 秒 × 900 = 30 分钟。
 *
 * 后端对模型调用不限时，K3 这类「始终推理」模型实测一次分析要超过 10 分钟，
 * 所以不能再按"3 分钟算卡死"来卡 —— 那道闸会让后端还在跑、前端先报失败。
 *
 * 保留这个上限只为兜"后端真的挂了"：撞上时用户刷新页面会重新拉最新状态并接着
 * 轮询，所以它不必覆盖最坏情况，够长就行
 */
const MAX_POLLS = 900;

/** 标签字典没拉到时的空表。用常量而不是每次字面量，避免 useRequest 的 data 引用每轮都变 */
const EMPTY_TAG_NAMES: Record<string, string> = {};

/** 分析是否已经结束（成功或失败都算结束，都该停止轮询） */
function isFinished(status: AnalysisStatus): boolean {
  return status === 'done' || status === 'failed';
}

/**
 * 复盘分析的取数与轮询。
 *
 * 分析在后端是异步任务（一次模型调用 20~60 秒），所以触发后要轮询状态。
 * 轮询交给 ahooks 的 pollingInterval：原来手写的 timer / 轮询计数 / mountedRef /
 * 卸载清理全部省掉，而且现在页面切到后台会自动暂停（手写版在 H5 切标签页后仍在空转）。
 */
export function useAnalysis(handId?: string) {
  const [analysis, setAnalysis] = useState<FrontendAnalysis | null>(null);
  /** 轮询开关。ahooks 靠 useUpdateEffect 监听 pollingInterval 变假值来停表，
   *  所以"结束就停"是把它置成 undefined 实现的，不能调 cancel()——那停不掉定时器 */
  const [polling, setPolling] = useState(false);
  /** 已轮询次数。ahooks 没有最大轮询次数选项，卡死的兜底得自己数 */
  const pollCountRef = useRef(0);

  // ---------- 标签字典：把模型的 tagCode 渲染成人话 ----------
  const { data: tagNameByCode = EMPTY_TAG_NAMES } = useRequest(
    async () => {
      const res = await reviewApi.getLeakTags();
      const map: Record<string, string> = {};
      transformLeakTagListFromApi(res.list || []).forEach((t) => {
        map[t.code] = t.name;
      });
      return map;
    },
    {
      // 字典拉不到时退回显示 tagCode 原文，不影响主流程，所以不打扰用户
      onError: () => {},
    }
  );

  // ---------- 今日剩余额度 ----------
  const { data: aiStatus, refresh: refreshAIStatus } = useRequest(
    async (): Promise<FrontendAIStatus> => transformAIStatusFromApi(await reviewApi.getAIStatus()),
    { onError: () => {} }
  );

  // ---------- 轮询分析状态 ----------
  const { run: startPolling } = useRequest(
    (analysisId: string) => reviewApi.getAnalysis(analysisId).then(transformAnalysisFromApi),
    {
      manual: true,
      pollingInterval: polling ? POLL_INTERVAL_MS : undefined,
      // 页面切到后台就暂停。小程序切后台、H5 切标签页都不该继续空转
      pollingWhenHidden: false,
      // 计数放在 onFinally 而不是 onSuccess：onSuccess 只在成功时触发，
      // 网络一直失败的话计数永不增长，MAX_POLLS 这道兜底就永远不会生效。
      // 单次失败不终止轮询（与原实现一致），总时长由 MAX_POLLS 封顶
      onFinally: (_params, data) => {
        if (data) {
          setAnalysis(data);
        }

        pollCountRef.current += 1;
        if (pollCountRef.current > MAX_POLLS) {
          setPolling(false);
          Taro.showToast({ title: '分析耗时异常，请稍后刷新查看', icon: 'none' });
          return;
        }

        if (data && isFinished(data.status)) {
          // 结束了就停表，并按最新状态刷新额度
          setPolling(false);
          refreshAIStatus();
        }
      },
    }
  );

  const beginPolling = useCallback(
    (analysisId: string) => {
      pollCountRef.current = 0;
      setPolling(true);
      startPolling(analysisId);
    },
    [startPolling]
  );

  // ---------- 载入手牌对应的最近一次分析 ----------
  const { run: loadLatest } = useRequest(
    async (): Promise<FrontendAnalysis | null> => {
      const res = await reviewApi.getHandAnalyses(handId as string);
      // 接口按时间倒序返回，取最新的一条
      return (res.list || []).map(transformAnalysisFromApi)[0] || null;
    },
    {
      ready: !!handId,
      refreshDeps: [handId],
      onSuccess: (latest) => {
        setAnalysis(latest);
        // 上次退出时分析可能还没跑完，这里接着轮询
        if (latest && !isFinished(latest.status)) {
          beginPolling(latest.id);
        }
      },
      // 拿不到历史分析就当没有，用户可以自己点分析
      onError: () => {},
    }
  );

  // ---------- 触发分析 ----------
  const { runAsync: requestAnalysis, loading: triggering } = useRequest(
    (id: string) => reviewApi.analyzeHand(id),
    {
      manual: true,
      onError: (e) => {
        Taro.showToast({ title: e?.message || '触发分析失败', icon: 'none', duration: 2500 });
      },
    }
  );

  const trigger = useCallback(async () => {
    if (!handId) return;
    try {
      const res = await requestAnalysis(handId);
      const next = transformAnalysisFromApi(res.analysis);

      // reused 也可能是"这手牌正在分析中，后端把那条还给你了"，
      // 那种情况后端的 status 是 running，说"内容没变"就撒谎了。
      // 只有真拿回一条已结束的结论才是复用上次结果
      if (res.reused && isFinished(next.status)) {
        Taro.showToast({ title: '内容没变，直接用了上次的结论', icon: 'none', duration: 2000 });
      }

      setAnalysis(next);

      if (!isFinished(next.status)) {
        beginPolling(next.id);
      }
      refreshAIStatus();
    } catch {
      // onError 里已经提示过了，这里只需吞掉 rejection
    }
  }, [handId, requestAnalysis, beginPolling, refreshAIStatus]);

  return {
    analysis,
    // useRequest 拿不到数据时 data 是 undefined，对外的契约一直是 null，
    // 这里收口，免得调用方到处写 ?? null
    aiStatus: aiStatus ?? null,
    tagNameByCode,
    triggering,
    trigger,
    /** 从编辑页返回后重新拉一次，避免展示已被改动的旧结论 */
    reload: loadLatest,
  };
}

export default useAnalysis;
