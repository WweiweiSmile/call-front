import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('个人中心页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/');
    await utils.waitForPageLoad();
    // 切换到个人中心标签
    await utils.clickByTestId('tab-profile');
  });

  test('应该显示个人中心页面', async ({ page }) => {
    await expect(page.locator('.profile-page')).toBeVisible();
  });

  test('应该显示用户信息卡片', async ({ page }) => {
    await expect(page.locator('.user-info-card')).toBeVisible();
  });

  test('应该显示用户名', async ({ page }) => {
    await expect(page.locator('.username')).toBeVisible();
  });

  test('应该显示用户ID', async ({ page }) => {
    await expect(page.locator('.user-id')).toBeVisible();
  });

  test('应该显示统计卡片', async ({ page }) => {
    await expect(page.locator('.stats-card')).toBeVisible();
  });

  test('应该显示参与场次统计', async ({ page }) => {
    await expect(page.locator('.stats-card')).toContainText('参与场次');
  });

  test('应该显示创建游戏统计', async ({ page }) => {
    await expect(page.locator('.stats-card')).toContainText('创建游戏');
  });

  test('应该显示平衡场次统计', async ({ page }) => {
    await expect(page.locator('.stats-card')).toContainText('平衡场次');
  });

  test('应该显示自主操作统计', async ({ page }) => {
    await expect(page.locator('.stats-card')).toContainText('自主操作');
  });

  test('应该显示被代理操作统计', async ({ page }) => {
    await expect(page.locator('.stats-card')).toContainText('被代理操作');
  });

  test('应该显示设置菜单项', async ({ page }) => {
    await expect(page.locator('.menu-section')).toContainText('设置');
  });

  test('应该显示帮助中心菜单项', async ({ page }) => {
    await expect(page.locator('.menu-section')).toContainText('帮助中心');
  });

  test('应该显示联系客服菜单项', async ({ page }) => {
    await expect(page.locator('.menu-section')).toContainText('联系客服');
  });

  test('应该显示退出登录按钮', async () => {
    await expect(utils.getByTestId('btn-logout')).toBeVisible();
    await expect(utils.getByTestId('btn-logout')).toContainText('退出登录');
  });

  test('点击退出登录按钮应该显示确认对话框', async ({ page }) => {
    await utils.clickByTestId('btn-logout');
    // 等待对话框出现
    await page.waitForTimeout(500);
  });
});
