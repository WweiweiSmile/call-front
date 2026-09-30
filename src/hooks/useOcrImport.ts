import { useCallback, useState } from 'react';
import Taro from '@tarojs/taro';
import { isUserCancel, recognizeTable } from '../services/ocrApi';
import { buildOcrDraft } from '../utils/ocrTable';
import type { OcrFillTarget } from '../utils/ocrTable';
import type { OcrTableDraft } from '../models/service/ocr';

/**
 * 牌桌截图导入的瞬时状态。
 *
 * 刻意不塞进 useReviewForm：那里装的是表单状态，会被草稿自动保存写进本地存储，
 * 而"正在识别""刚识别出的草稿"是一次性的，混进去会被当成表单内容存下来
 */
export function useOcrImport(apply: (draft: OcrTableDraft) => void) {
  const [importing, setImporting] = useState(false);
  /** 识别出来、等用户确认的草稿 */
  const [pending, setPending] = useState<OcrTableDraft | null>(null);
  /** 已填入的草稿，用来在页面上常驻一条"哪些要你补"的提示 */
  const [applied, setApplied] = useState<OcrTableDraft | null>(null);

  /**
   * 选图 → 识别 → 映射，成功时把草稿挂到 pending 等确认。
   *
   * target 由调用方在点击那一刻取，避免闭包里读到旧的表单
   */
  const run = useCallback(
    async (target: OcrFillTarget) => {
      // 识别服务是串行推理的，连点会让第二次排在后面白等几十秒
      if (importing) return;
      setImporting(true);
      try {
        const raw = await recognizeTable();
        const result = buildOcrDraft(raw, target);
        if (!result.ok) {
          Taro.showToast({ title: result.reason, icon: 'none', duration: 2500 });
          return;
        }
        setPending(result.draft);
      } catch (error) {
        // 用户自己取消了选图，不是错误
        if (isUserCancel(error)) return;
        const message = (error as Error)?.message || '';
        Taro.showToast({
          title: message || '识别失败，请重试',
          icon: 'none',
          duration: 2500,
        });
      } finally {
        setImporting(false);
      }
    },
    [importing]
  );

  const confirm = useCallback(() => {
    if (!pending) return;
    apply(pending);
    setApplied(pending);
    setPending(null);
  }, [pending, apply]);

  const cancel = useCallback(() => setPending(null), []);

  const dismissApplied = useCallback(() => setApplied(null), []);

  return { importing, pending, applied, run, confirm, cancel, dismissApplied };
}

export default useOcrImport;
