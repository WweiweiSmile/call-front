import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('我的游戏页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/');
    await utils.waitForPageLoad();
    // 切换到"已参与"标签
    await utils.clickByTestId('tab-my');
  });

  test('应该显示我的游戏列表', async () => {
    await expect(page.locator('.my-games-page')).toBeVisible();
  });

  test('应该显示游戏卡片', async ({ page }) => {
    const gameCards = page.locator('[data-testid^="my-game-card-"]');
    await expect(page.locator('.my-games-page')).toBeVisible();
  });

  test('游戏卡片应该有进入按钮', async ({ page }) => {
    const enterButtons = page.locator('[data-testid^="btn-my-game-enter-"]');
    await expect(page.locator('.my-games-page')).toBeVisible();
  });

  test('点击游戏卡片应该进入游戏详情', async ({ page }) => {
    // 查找第一个游戏卡片
    const firstGameCard = page.locator('[data-testid^="my-game-card-"]').first();
    if (await firstGameCard.isVisible()) {
      await firstGameCard.click();
      await page.waitForURL(/game-detail/);
    }
  });

  test('应该显示进行中的场次部分', async () => {
    await expect(page.locator('.my-games-page')).toContainText('进行中的场次');
  });

  test('应该显示历史场次部分', async () => {
    await expect(page.locator('.my-games-page')).toContainText('历史场次');
  });
});
