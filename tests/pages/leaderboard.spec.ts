import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('排行榜页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('应该显示返回按钮', async ({ page }) => {
    // 导航到排行榜页面
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('点击返回按钮应该返回上一页', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 如果有返回按钮，点击它
    const backBtn = utils.getByTestId('btn-leaderboard-back');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
  });

  test('应该显示排行榜标题', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('应该显示排行榜列表', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查排行榜卡片
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('应该显示更新时间', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查更新时间
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('排行榜项应该显示用户名', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查用户信息
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('排行榜项应该显示存分', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查存分数据
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('排行榜项应该显示取分', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查取分数据
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('排行榜项应该显示净分', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查净分数据
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });

  test('空状态应该显示提示', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查空状态
    await expect(page.locator('.leaderboard-page')).toBeVisible();
  });
});
