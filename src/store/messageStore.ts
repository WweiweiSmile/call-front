import {create} from 'zustand';
import {messageApi, scoreRequestApi} from '../services/api';

/**
 * 消息与待审数的全局状态。
 *
 * 必须用 zustand 而不是 useAppStore——后者是 useState 实现的"伪 store"，
 * 每个页面各持一份副本，跨页共享会不一致。
 */
interface MessageState {
  /** 未读消息数（用户维度，挂在个人中心入口上） */
  unreadCount: number;
  /** 各场次的待审申请数（创建者维度，挂在场次详情的审核入口上） */
  pendingReviewCounts: Record<string, number>;
  /** 拉取未读消息数 */
  refreshUnread: () => Promise<void>;
  /** 拉取某个场次的待审申请数 */
  refreshPending: (gameId: string) => Promise<void>;
  /** 登出时清空 */
  clear: () => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  unreadCount: 0,
  pendingReviewCounts: {},

  refreshUnread: async () => {
    try {
      const res: any = await messageApi.getUnreadCount();
      set({unreadCount: res?.count ?? 0});
    } catch (error) {
      console.error('获取未读消息数失败:', error);
    }
  },

  refreshPending: async (gameId: string) => {
    if (!gameId) return;
    try {
      // 只要 total，page_size 取 1 即可
      const res: any = await scoreRequestApi.getList({
        gameId,
        scope: 'review',
        status: 'pending',
        page: 1,
        page_size: 1,
      });
      set((prev) => ({
        pendingReviewCounts: {
          ...prev.pendingReviewCounts,
          [gameId]: res?.total ?? 0,
        },
      }));
    } catch (error) {
      // 非创建者调用会 400，这里静默即可，不要打扰用户
      console.error('获取待审申请数失败:', error);
    }
  },

  clear: () => set({unreadCount: 0, pendingReviewCounts: {}}),
}));
