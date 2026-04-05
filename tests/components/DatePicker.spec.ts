import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('DatePicker 组件', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    // 导航到创建游戏页面来测试日期选择器
    await page.goto('/');
  });

  test('日期选择器触发器应该可见', async ({ page }) => {
    // 先登录（如果需要）
    // 然后导航到创建游戏页面
    await page.goto('/pages/create-game/index');
    await utils.waitForPageLoad();

    // 检查日期选择器触发器
    await expect(utils.getByTestId('date-picker-trigger')).toBeVisible();
  });

  test('点击触发器应该显示日期选择器', async ({ page }) => {
    await page.goto('/pages/create-game/index');
    await utils.waitForPageLoad();

    // 点击日期选择器
    await utils.clickByTestId('date-picker-trigger');

    // 检查日期选择器是否弹出
    // 这里需要根据实际的日期选择器实现来调整
    await page.waitForTimeout(500);
  });

  test('应该显示占位符文本', async ({ page }) => {
    await page.goto('/pages/create-game/index');
    await utils.waitForPageLoad();

    const trigger = utils.getByTestId('date-picker-trigger');
    await expect(trigger).toContainText('请选择时间');
  });
});
