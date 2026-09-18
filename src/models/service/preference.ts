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
