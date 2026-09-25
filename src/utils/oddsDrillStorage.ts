// ============================================
// 训练进度的本地读写 —— **唯一**碰 Taro 的地方
//
// 逻辑与防御性解析全在 oddsDrillProgress.ts（纯函数、能被 node 对拍覆盖），
// 这里只是一层薄封装。两边分开的理由见那个文件的开头
//
// 读写都不抛错：存储配额满、被禁用、值被改坏，都只影响"进度记不住"，
// 不该让训练页崩掉 —— 训练本身是纯本地的，不依赖任何一次读写成功
// ============================================

import Taro from '@tarojs/taro';
import {
  DrillProgress,
  PROGRESS_STORAGE_KEY,
  emptyProgress,
  parseProgress,
  serializeProgress,
} from './oddsDrillProgress';

export function loadProgress(): DrillProgress {
  try {
    return parseProgress(Taro.getStorageSync(PROGRESS_STORAGE_KEY));
  } catch (error) {
    console.error('读取训练进度失败，按空进度继续:', error);
    return emptyProgress();
  }
}

export function saveProgress(progress: DrillProgress): void {
  try {
    Taro.setStorageSync(PROGRESS_STORAGE_KEY, serializeProgress(progress));
  } catch (error) {
    // 存不下就算了，本组训练照常
    console.error('保存训练进度失败:', error);
  }
}

/** 清空累计进度。留给「重新开始」这类入口，目前没有 UI 调它 */
export function clearProgress(): void {
  try {
    Taro.removeStorageSync(PROGRESS_STORAGE_KEY);
  } catch (error) {
    console.error('清空训练进度失败:', error);
  }
}
