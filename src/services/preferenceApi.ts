import { request } from './request';
import type {
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
};
