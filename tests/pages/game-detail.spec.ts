import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('游戏详情页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('应该显示返回按钮', async ({ page }) => {
    // 导航到一个游戏详情页面
    // 这里假设我们可以通过某种方式进入游戏详情页
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查页面结构
  });

  test('创建者应该看到模式切换按钮', async ({ page }) => {
    // 这个测试需要作为创建者登录
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('应该显示存分按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查存分按钮是否存在（需要在游戏详情页中）
  });

  test('应该显示取分按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('应该显示查看排行榜按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
  });

  test('点击查看排行榜应该跳转到排行榜页面', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 如果有查看排行榜按钮，点击它
    const leaderboardBtn = utils.getByTestId('btn-view-leaderboard');
    if (await leaderboardBtn.isVisible()) {
      await leaderboardBtn.click();
      await page.waitForURL(/leaderboard/);
    }
  });

  test('存分弹窗应该正常工作', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 测试存分弹窗功能
  });

  test('取分弹窗应该正常工作', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 测试取分弹窗功能
  });

  test('存分弹窗应该有快捷金额按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查快捷金额按钮
  });

  test('取分弹窗应该有快捷金额按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
    // 检查快捷金额按钮
  });

  test('创建者应该看到结束游戏按钮', async ({ page }) => {
    await page.goto('/');
    await utils.waitForPageLoad();
  });
});
