import {useCallback} from 'react';
import {transactionApi} from '../services/api';
import {Transaction} from './mockData';
import {AppState} from './types';

interface UseTransactionStoreOptions {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  setLoading: (loading: boolean) => void;
  loadUserBalance: (gameId: string) => Promise<void>;
  loadGameParticipantBalances: (gameId: string) => Promise<void>;
}

export function useTransactionStore({
  state,
  setState,
  setLoading,
  loadUserBalance,
  loadGameParticipantBalances,
}: UseTransactionStoreOptions) {
  // 加载交易记录
  const loadGameTransactions = useCallback(async (gameId: string, userId?: string) => {
    try {
      const response: any = await transactionApi.getGameTransactions(gameId, {userId});
      const transactions: Transaction[] = response.list.map((t: any) => ({
        id: String(t.id),
        userId: String(t.userId),
        userName: t.userName || '用户',
        gameId: String(t.gameId),
        operatorId: String(t.operatorId),
        operatorName: t.operatorName || '操作人',
        isProxy: t.operatorType === 'proxy',
        type: t.transType as 'deposit' | 'withdraw',
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        remark: t.remark,
        createdAt: t.createdAt,
      }));

      setState((prev) => {
        const newTransactions = prev.transactions.filter((t) => t.gameId !== gameId);
        return {
          ...prev,
          transactions: [...newTransactions, ...transactions],
        };
      });
    } catch (error) {
      console.error('加载交易记录失败:', error);
    }
  }, [setState]);

  // 获取某游戏的交易记录
  const getGameTransactions = useCallback(
    (gameId: string, userId?: string) => {
      let txs = state.transactions.filter((t) => t.gameId === gameId);
      if (userId) {
        txs = txs.filter((t) => t.userId === userId);
      }
      return txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [state.transactions]
  );

  // 存分操作
  const deposit = useCallback(
    async (gameId: string, amount: number, currentUserId: string, targetUserId?: string, remark?: string) => {
      setLoading(true);
      try {
        const userId = targetUserId || currentUserId;
        const targetUserIdNum = targetUserId ? parseInt(targetUserId) : undefined;

        await transactionApi.deposit({
          gameId: parseInt(gameId),
          targetUserId: targetUserIdNum,
          amount,
          remark,
        });

        // 重新加载余额和交易记录
        await loadUserBalance(gameId);
        await loadGameTransactions(gameId, userId);

        if (targetUserId) {
          await loadGameParticipantBalances(gameId);
        }
      } catch (error) {
        console.error('存分失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, loadUserBalance, loadGameTransactions, loadGameParticipantBalances]
  );

  // 取分操作
  const withdraw = useCallback(
    async (gameId: string, amount: number, currentUserId: string, targetUserId?: string, remark?: string) => {
      setLoading(true);
      try {
        const userId = targetUserId || currentUserId;
        const targetUserIdNum = targetUserId ? parseInt(targetUserId) : undefined;

        await transactionApi.withdraw({
          gameId: parseInt(gameId),
          targetUserId: targetUserIdNum,
          amount,
          remark,
        });

        // 重新加载余额和交易记录
        await loadUserBalance(gameId);
        await loadGameTransactions(gameId, userId);

        if (targetUserId) {
          await loadGameParticipantBalances(gameId);
        }
      } catch (error) {
        console.error('取分失败:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, loadUserBalance, loadGameTransactions, loadGameParticipantBalances]
  );

  return {
    loadGameTransactions,
    getGameTransactions,
    deposit,
    withdraw,
  };
}
