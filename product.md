# Call 游戏管理系统 - 代码组织规范

## 目录结构规范

### 1. src/models 目录

在 `src` 目录下创建 `models` 目录，用于存放数据模型相关的类型定义。

```
src/
└── models/
    ├── types/          # 数据库模型类型定义
    │   ├── game.ts     # 游戏相关模型
    │   ├── user.ts     # 用户相关模型
    │   └── ...
    └── service/        # API 接口类型定义
        ├── game.ts     # 游戏接口类型
        ├── user.ts     # 用户接口类型
        └── ...
```

### 2. 组件类型定义

组件相关的类型定义放在**组件同目录**下。

```
src/
└── pages/
    └── games/
        ├── index.tsx   # 组件实现
        ├── index.less  # 组件样式
        └── types.ts    # 组件专用类型（如有需要）
```

---

## 详细说明

### models/types 目录

存放**对应数据库中的模型**类型定义。这些类型应该与数据库表结构一一对应。

示例：
```typescript
// src/models/types/game.ts
export interface Game {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  status: 'pending' | 'ongoing' | 'ended';
  participantCount: number;
  description?: string;
  startTime?: string;
  endTime?: string;
}
```

### models/service 目录

存放**联调对应的接口类型**，包括请求参数和响应数据的类型定义。

示例：
```typescript
// src/models/service/game.ts
export interface CreateGameRequest {
  name: string;
  description?: string;
  startTime?: string;
  endTime?: string;
}

export interface GetGamesResponse {
  list: Array<{
    id: number;
    name: string;
    creator_id: number;
    creator_name: string;
    status: string;
    player_count: number;
    // ...
  }>;
}
```

### 组件同目录的 types.ts

存放**组件专用的类型**，如组件 Props、组件内部状态类型等。

示例：
```typescript
// src/pages/games/types.ts
export interface GameCardProps {
  game: Game;
  onEnter: (gameId: string) => void;
  onJoin: (gameId: string) => void;
}

export interface GamesPageState {
  searchText: string;
  filterStatus: 'all' | 'ongoing' | 'pending';
}
```

---

## 接口管理规范

### 1. 使用 ahooks 的 useRequest

所有接口调用统一使用 **ahooks** 中的 `useRequest` 进行管理。

#### 规范要点：
- `useRequest` 声明放在 **Hook 的最上方**
- 统一错误处理和 Loading 状态
- 支持手动触发和自动触发

#### 目录结构：
```
src/
└── pages/
    └── games/
        ├── index.tsx       # 组件实现
        ├── index.less      # 组件样式
        ├── useGames.ts     # 页面/组件状态 Hook
        └── types.ts        # 组件专用类型（如有需要）
```

#### 示例：
```typescript
// src/pages/games/useGames.ts
import { useRequest } from 'ahooks';
import { useState, useCallback } from 'react';
import { gameApi } from '../../services/api';

export function useGames() {
  // useRequest 声明放在最上方
  const {
    data: games,
    loading: gamesLoading,
    error: gamesError,
    refresh: refreshGames,
    run: loadGames,
  } = useRequest(
    () => gameApi.getGames(),
    {
      refreshDeps: [],
      onError: (error) => {
        console.error('加载游戏列表失败:', error);
      },
    }
  );

  const [searchText, setSearchText] = useState('');

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  return {
    games,
    gamesLoading,
    gamesError,
    refreshGames,
    loadGames,
    searchText,
    setSearchText,
    handleSearch,
  };
}
```

---

## 状态管理规范

### 1. 页面/组件级 Hook

**每一个页面或组件，在其目录下创建一个独立的 Hook 文件**，用于封装相关状态和逻辑。

#### 规范要点：
- Hook 文件命名：`use{页面/组件名}.ts`
- 所有状态和业务逻辑封装在 Hook 中
- 组件/页面只负责 UI 渲染，通过 Hook 获取状态和方法
- Hook 返回值按功能分组，保持清晰

#### 目录结构：
```
src/
├── pages/
│   ├── games/
│   │   ├── index.tsx       # 页面组件（仅 UI）
│   │   ├── index.less      # 样式
│   │   ├── useGames.ts     # 页面状态 Hook
│   │   └── types.ts        # 类型定义
│   └── game-detail/
│       ├── index.tsx
│       ├── index.less
│       ├── useGameDetail.ts
│       └── types.ts
└── components/
    └── GameCard/
        ├── index.tsx
        ├── index.less
        ├── useGameCard.ts
        └── types.ts
```

#### 页面组件示例（仅 UI）：
```typescript
// src/pages/games/index.tsx
import { View, Text, ScrollView } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import { useGames } from './useGames';
import './index.less';

export default function GamesPage() {
  // 所有状态和方法从 Hook 获取
  const {
    games,
    gamesLoading,
    searchText,
    setSearchText,
    handleEnterGame,
    handleJoinGame,
  } = useGames();

  return (
    <View className="games-page">
      <ScrollView scrollY>
        {games?.map((game) => (
          <View key={game.id} className="game-card">
            <Text className="game-name">{game.name}</Text>
            <Button onClick={() => handleEnterGame(game.id)}>
              进入游戏
            </Button>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
```

#### Hook 示例（状态和逻辑）：
```typescript
// src/pages/games/useGames.ts
import { useRequest } from 'ahooks';
import { useState, useCallback, useMemo } from 'react';
import Taro from '@tarojs/taro';
import { gameApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';

export function useGames() {
  // ========== useRequest 声明（放在最上方）==========
  const {
    data: gamesResponse,
    loading: gamesLoading,
    refresh: refreshGames,
    mutate: setGames,
  } = useRequest(
    () => gameApi.getGames(),
    {
      refreshDeps: [],
      onError: (error) => {
        console.error('加载游戏列表失败:', error);
      },
    }
  );

  const { state: authState } = useAuthStore();

  // ========== 本地状态 ==========
  const [searchText, setSearchText] = useState('');

  // ========== 计算状态 ==========
  const filteredGames = useMemo(() => {
    if (!gamesResponse?.list) return [];
    return gamesResponse.list.filter((game) =>
      game.name.includes(searchText)
    );
  }, [gamesResponse, searchText]);

  // ========== 方法 ==========
  const handleEnterGame = useCallback((gameId: string) => {
    Taro.navigateTo({
      url: `/pages/game-detail/index?gameId=${gameId}`,
    });
  }, []);

  const handleJoinGame = useCallback(async (gameId: string) => {
    if (!authState.user) return;
    try {
      await gameApi.joinGame(parseInt(gameId));
      await refreshGames();
    } catch (error) {
      console.error('加入游戏失败:', error);
    }
  }, [authState.user, refreshGames]);

  // ========== 返回值 ==========
  return {
    // 数据
    games: filteredGames,
    gamesLoading,

    // 搜索
    searchText,
    setSearchText,

    // 操作
    handleEnterGame,
    handleJoinGame,
    refreshGames,
  };
}
```

---

## 完整示例目录结构

```
src/
├── models/
│   ├── types/
│   │   ├── game.ts
│   │   ├── user.ts
│   │   └── transaction.ts
│   └── service/
│       ├── game.ts
│       ├── user.ts
│       └── transaction.ts
├── pages/
│   ├── login/
│   │   ├── index.tsx
│   │   ├── index.less
│   │   ├── useLogin.ts
│   │   └── types.ts
│   ├── games/
│   │   ├── index.tsx
│   │   ├── index.less
│   │   ├── useGames.ts
│   │   └── types.ts
│   └── game-detail/
│       ├── index.tsx
│       ├── index.less
│       ├── useGameDetail.ts
│       └── types.ts
├── components/
│   └── GameCard/
│       ├── index.tsx
│       ├── index.less
│       ├── useGameCard.ts
│       └── types.ts
├── store/
│   ├── index.ts
│   ├── types.ts
│   ├── useGameStore.ts
│   ├── useBalanceStore.ts
│   ├── useTransactionStore.ts
│   └── useUIStore.ts
└── services/
    └── api.ts
```

