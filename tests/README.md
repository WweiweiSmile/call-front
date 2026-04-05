# Playwright E2E 测试

本项目使用 Playwright 进行端到端测试。

## 安装依赖

首次运行测试前，需要安装 Playwright 浏览器：

```bash
npm install -D @playwright/test
npx playwright install
```

## 运行测试

### 运行所有测试
```bash
npm run test:e2e
```

### 在 UI 模式下运行测试
```bash
npm run test:e2e:ui
```

### 查看测试报告
```bash
npm run test:e2e:report
```

## 测试文件结构

```
tests/
├── test-utils.ts              # 测试工具函数
├── components/
│   ├── BottomTabBar.spec.ts   # BottomTabBar 组件测试
│   └── DatePicker.spec.ts     # DatePicker 组件测试
└── pages/
    ├── login.spec.ts          # 登录页面测试
    ├── games.spec.ts          # 游戏列表页面测试
    ├── my-games.spec.ts       # 我的游戏页面测试
    ├── create-game.spec.ts    # 创建游戏页面测试
    ├── game-detail.spec.ts    # 游戏详情页面测试
    ├── leaderboard.spec.ts    # 排行榜页面测试
    └── profile.spec.ts        # 个人中心页面测试
```

## data-testid 命名规范

测试中使用 `data-testid` 属性来定位元素，命名规范如下：

- 按钮: `btn-{action}` 或 `btn-{action}-{id}`
- 输入框: `input-{field-name}`
- 标签页: `tab-{tab-name}`
- 卡片: `{component}-card-{id}`

## 测试工具函数

`test-utils.ts` 提供了常用的测试工具函数：

```typescript
// 通过 data-testid 获取元素
utils.getByTestId('btn-submit');

// 点击元素
await utils.clickByTestId('btn-submit');

// 填充输入框
await utils.fillInput('input-username', 'testuser');

// 检查元素是否可见
await utils.isVisible('btn-submit');
```
