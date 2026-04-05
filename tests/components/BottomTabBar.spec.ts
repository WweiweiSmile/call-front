import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('BottomTabBar 组件', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    // 假设登录页面是入口，先登录
    await page.goto('/');
  });

  test('应该显示三个标签页', async ({ page }) => {
    await utils.waitForPageLoad();

    // 检查三个 tab 是否都存在
    await expect(utils.getByTestId('tab-games')).toBeVisible();
    await expect(utils.getByTestId('tab-my')).toBeVisible();
    await expect(utils.getByTestId('tab-profile')).toBeVisible();
  });

  test('点击游戏标签应该切换到游戏页面', async ({ page }) => {
    await utils.waitForPageLoad();

    await utils.clickByTestId('tab-games');

    // 验证切换后的状态
    await expect(utils.getByTestId('tab-games')).toHaveClass(/active/);
  });

  test('点击已参与标签应该切换到已参与页面', async ({ page }) => {
    await utils.waitForPageLoad();

    await utils.clickByTestId('tab-my');

    await expect(utils.getByTestId('tab-my')).toHaveClass(/active/);
  });

  test('点击我的标签应该切换到个人中心', async ({ page }) => {
    await utils.waitForPageLoad();

    await utils.clickByTestId('tab-profile');

    await expect(utils.getByTestId('tab-profile')).toHaveClass(/active/);
  });
});
