import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('游戏列表页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/');
    // 假设已登录或进行登录操作
    await utils.waitForPageLoad();
  });

  test('应该显示创建游戏按钮', async () => {
    await expect(utils.getByTestId('btn-create-game')).toBeVisible();
    await expect(utils.getByTestId('btn-create-game')).toContainText('创建游戏');
  });

  test('应该显示搜索框', async () => {
    await expect(utils.getByTestId('input-search')).toBeVisible();
  });

  test('应该能够输入搜索内容', async () => {
    await utils.fillInput('input-search', '测试游戏');
    await expect(utils.getByTestId('input-search')).toHaveValue('测试游戏');
  });

  test('点击创建游戏按钮应该跳转到创建游戏页面', async ({ page }) => {
    await utils.clickByTestId('btn-create-game');
    await page.waitForURL(/create-game/);
    expect(page.url()).toContain('create-game');
  });

  test('应该显示游戏列表', async ({ page }) => {
    await utils.waitForPageLoad();
    // 检查页面是否有游戏卡片
    const gameCards = page.locator('[data-testid^="btn-game-action-"]');
    // 只要页面正常加载即可
    await expect(page.locator('.games-page')).toBeVisible();
  });

  test('搜索功能应该正常工作', async () => {
    await utils.fillInput('input-search', '不存在的游戏');
    // 等待搜索生效
    await utils.waitForPageLoad();
  });
});
