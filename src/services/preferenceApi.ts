import { request } from './request';
import type {
  AIModelSettingsResponse,
  UpdateAIModelSettingsRequest,
  UpdateUserPreferenceRequest,
  UserPreferenceResponse,
} from '../models/service';

// 用户默认设置相关 API
export const preferenceApi = {
  // 我的默认盲注设置。没设置过时后端返回一套默认值，不是 404
  getPreferences: () => {
    return request<UserPreferenceResponse>('/preferences');
  },

  // 保存默认盲注设置（整体替换）
  updatePreferences: (data: UpdateUserPreferenceRequest) => {
    return request<UserPreferenceResponse>('/preferences', {
      method: 'PUT',
      data,
    });
  },

  // 我的模型配置。Key 只回显掩码，明文永不下发
  getAISettings: () => {
    return request<AIModelSettingsResponse>('/preferences/ai');
  },

  // 保存模型配置。
  //
  // 与盲注那条**不共用**接口：盲注是整体替换语义，而这里的 Key 是三态
  //（不传/清空/替换），混在一个 PUT 里会让"只改盲注"的请求把 Key 写没
  updateAISettings: (data: UpdateAIModelSettingsRequest) => {
    return request<AIModelSettingsResponse>('/preferences/ai', {
      method: 'PUT',
      data,
    });
  },
};
