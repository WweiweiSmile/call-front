import { requestAuth, requestAuthAuthed } from './request';
import type { LoginResponse, UserInfo } from '../models/service';

/**
 * 认证 API。
 *
 * 全部打**认证中心 call-auth**（:8020），不再打 call-back —— 后者已经不再
 * 提供登录接口，只负责验签。所以这里用 requestAuth 而不是 request：
 * 基地址不同，而且这些接口本来就不需要带 access token。
 *
 * **登录和注册不在这个文件里**：它们已经搬到认证中心的登录页上（§6.2.1），
 * 走浏览器表单提交，前端这边没有可调的接口 —— 只剩下面这一个换票入口。
 */
export const authApi = {
  /**
   * 用一次性票据换令牌。**SSO 回来后唯一要做的事**。
   *
   * 票据来自回调地址上的 `ticket`，60 秒有效、用过即废。响应形状与
   * `/auth/login` 完全一致（§6.8），所以存 token 的那段代码不用区分来源。
   *
   * 注意它虽然打认证中心，但**不带 access token** —— 调用时前端恰恰还没有
   * 任何令牌，靠票据本身自证身份
   */
  exchangeTicket: (ticket: string, clientId: string) =>
    requestAuth<LoginResponse>('/auth/ticket', {
      method: 'POST',
      data: { ticket, client_id: clientId },
    }),

  /**
   * 当前用户信息。
   *
   * **需要 access token** —— 所以走 `requestAuthAuthed` 而不是给换票用的
   * `requestAuth`（后者不带 Bearer，调这个接口必然 401）。
   * 它同时也受 401 自动续期保护：令牌过期时是静默续期，不是把人踢下线
   */
  me: () => requestAuthAuthed<UserInfo>('/auth/me'),
};
