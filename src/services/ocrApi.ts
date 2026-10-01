// ============================================
// 牌桌截图识别（OCR）
//
// 直连独立的识别服务（~/codes/poker-ocr-poc，FastAPI），**不经 call-back**。
// 所以这里不能用 services/request.ts：那个封装写死了 baseURL 与
// Content-Type: application/json，且认的是 {code, data} 包装，
// 而识别服务收的是 multipart/form-data、回的是裸 JSON
// ============================================

import Taro from '@tarojs/taro';
import type { OcrTableResult } from '../models/service/ocr';

/**
 * 识别服务地址。
 *
 * dev/test 用相对路径 `/ocr`，由 dev server 代理到本机的识别服务 ——
 * 它没有 CORS 中间件，浏览器直连 localhost:8000 会被同源策略拦下。
 * 生产形态待定（见 .env.production）：同域反代就保持 `/ocr`，
 * 跨域部署要改成完整地址并给识别服务加 CORS
 */
const OCR_BASE_URL = process.env.TARO_APP_OCR_URL || '/ocr';

/** 上传体积上限，与识别服务 api.py 的 MAX_UPLOAD_BYTES 对齐 */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 识别是 CPU 推理，慢。写出来是为了后面真要调时有个明确的落点 */
const UPLOAD_TIMEOUT_MS = 60000;

/**
 * 用户自己取消了选图。
 *
 * 选图取消在各端会 reject 出含 'cancel'（桌面端）或 'abort'（onabort）的 errMsg。
 * 不当成错误往上抛，否则用户点个取消就会看到"识别失败"
 */
export function isUserCancel(error: unknown): boolean {
  const errMsg =
    (error as { errMsg?: string })?.errMsg || (error as { message?: string })?.message || '';
  return errMsg.indexOf('cancel') >= 0 || errMsg.indexOf('abort') >= 0;
}

function statusMessage(statusCode: number): string {
  if (statusCode === 413) return '图片太大了，请裁小一点再传';
  if (statusCode === 422) return '识别服务没收到图片，请重试';
  if (statusCode === 503) return '识别服务还没就绪，稍等几秒再试';
  if (statusCode >= 500) return `识别服务出错了（${statusCode}），稍后再试`;
  return `识别失败（${statusCode}），请重试`;
}

/**
 * 选一张牌桌截图并上传识别。
 *
 * 抛出的错误都是 `Error`，message 直接可以展示给用户
 */
export async function recognizeTable(): Promise<OcrTableResult> {
  const media = await Taro.chooseMedia({
    count: 1,
    mediaType: ['image'],
    // 只给 album：sourceType 里含 'camera' 时 H5 实现会给 input 无条件加 capture
    // 属性（桌面端也加），手机上就变成"只能拍照"，用户存好的截图反而选不了
    sourceType: ['album'],
    // H5 下 sizeType 不生效（实现里是 TODO），写出来只为表意：别压缩，识别靠像素
    sizeType: ['original'],
  });

  const file = media.tempFiles?.[0];
  if (!file?.tempFilePath) {
    throw new Error('没有选到图片，请重试');
  }
  // 先判体积：省一次注定被服务端拒掉的白传（4K 截图会超 20MB）
  if (file.size && file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`图片超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB，请裁小一点再传`);
  }

  return uploadTable(file.tempFilePath);
}

async function uploadTable(filePath: string): Promise<OcrTableResult> {
  const res = await Taro.uploadFile({
    url: `${OCR_BASE_URL}/ocr/table`,
    filePath,
    // 字段名必须与识别服务的 File(...) 一致
    name: 'file',
    // 不传的话 taro 兜底成没有扩展名的 'file-<时间戳>'，排查时看不出是什么
    fileName: `table-${Date.now()}.jpg`,
    timeout: UPLOAD_TIMEOUT_MS,
  });

  // H5 下 uploadFile 对 4xx/5xx 也走 success（xhr.onload 一律调 success），
  // 不自己判状态码就会把 FastAPI 的 {"detail": ...} 当成识别结果用，
  // 崩在映射函数里时完全看不出真正的原因
  if (res.statusCode !== 200) {
    throw new Error(statusMessage(res.statusCode));
  }
  if (!res.data) {
    throw new Error('识别服务没有返回内容，请重试');
  }

  // 裸 JSON，没有 {code, data} 包装
  try {
    return JSON.parse(res.data) as OcrTableResult;
  } catch {
    throw new Error('识别服务返回了看不懂的内容');
  }
}
