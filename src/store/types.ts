import {Game, Transaction, User, UserGameBalance} from './mockData';

// 全局状态类型
export interface AppState {
  games: Game[];
  userGameBalances: UserGameBalance[];
  transactions: Transaction[];
  gameParticipants: Record<string, User[]>;
  currentGameId: string | null;
  currentTab: 'games' | 'my' | 'profile';
  isLoading: boolean;
  currentTime: Date;
}

export const initialState: AppState = {
  games: [],
  userGameBalances: [],
  transactions: [],
  gameParticipants: {},
  currentGameId: null,
  currentTab: 'games',
  isLoading: false,
  currentTime: new Date(),
};
