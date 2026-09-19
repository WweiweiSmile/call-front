// ============================================
// 用户默认设置接口类型
// 对应后端: dto/preference.go
// ============================================

/**
 * 默认盲注设置响应。
 *
 * 三项都是 BB，与手牌、底池、筹码同一口径，不用再按大盲换算。
 * 没设置过的用户后端会给一套默认值（0.5 / 1 / 0），不是 404
 */
export interface UserPreferenceResponse {
  smallBlindBb: number;
  bigBlindBb: number;
  anteBb: number;
}

/** 更新默认盲注设置。整体替换语义：三项必须一起提交 */
export interface UpdateUserPreferenceRequest {
  smallBlindBb: number;
  bigBlindBb: number;
  anteBb: number;
}

/** 后端兜底默认值。前端在设置没拉到时也用它，与 models.DefaultSmallBlindBB 是同一份契约 */
export const DEFAULT_BLIND_PREFERENCE: UpdateUserPreferenceRequest = {
  smallBlindBb: 0.5,
  bigBlindBb: 1,
  anteBb: 0,
};

// ============================================
// BYOK 模型配置（对应后端 dto/ai_setting.go）
// ============================================

/** 自定义预设的 key，与后端 config.AIPresetCustom 是同一份契约 */
export const AI_PRESET_CUSTOM = 'custom';

/** 模型名长度上限，与后端 utils.AIModelMaxLen 一致 */
export const AI_MODEL_MAX_LENGTH = 100;

/**
 * API Key 长度上限，与后端 utils.APIKeyMaxLen 一致。
 *
 * ⚠️ 这个值必须显式传给 Input 的 maxlength：Taro Input 的 maxlength 默认只有 140，
 * 而现在的 OpenAI 长 Key（sk-proj-…）超过这个长度，会被**静默截断**——
 * 表现出来是"保存成功但一直鉴权失败"，症状极像用户自己填错了 Key
 */
export const API_KEY_MAX_LENGTH = 512;

/** 预设供应商，供设置页一键填充 */
export interface AIModelPreset {
  key: string;
  name: string;
  /** 填到 /v1 这一层，客户端自己拼 /chat/completions */
  baseUrl: string;
  /** 预填的模型名，用户可以改。自定义预设为空串 */
  model: string;
}

/** 我的模型配置。明文 Key 永远不会下发，只有掩码 */
export interface AIModelSettingsResponse {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  /** 后端拼好的展示用掩码，如 "••••a1b2"；没有 Key 时是空串。前端不要再加工 */
  apiKeyHint: string;
  /** 只有 GET 会返回 */
  presets?: AIModelPreset[];
}

/**
 * 保存模型配置。
 *
 * apiKey 是三态：**不传** = 不改动已存的 Key；传空串 = 清除；传值 = 替换。
 * 所以"只改模型名"时**不要**带这个字段 —— 带上空串会把用户的 Key 清掉
 */
export interface UpdateAIModelSettingsRequest {
  baseUrl: string;
  model: string;
  apiKey?: string;
}
