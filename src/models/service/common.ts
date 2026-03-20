// ============================================
// 通用 API 接口类型
// 对应后端: dto/response.go
// ============================================

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface ListResponse<T> {
  total: number;
  list: T[];
}
