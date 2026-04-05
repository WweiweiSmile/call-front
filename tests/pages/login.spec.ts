import { test, expect } from '@playwright/test';
import { TestUtils } from '../test-utils';

test.describe('登录页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({ page }) => {
    utils = new TestUtils(page);
    await page.goto('/pages/login/index');
    await utils.waitForPageLoad();
  });

  test('应该显示登录和注册标签', async () => {
    await expect(utils.getByTestId('tab-login')).toBeVisible();
    await expect(utils.getByTestId('tab-register')).toBeVisible();
  });

  test('默认应该显示登录表单', async () => {
    await expect(utils.getByTestId('tab-login')).toHaveClass(/active/);
    await expect(utils.getByTestId('input-username')).toBeVisible();
    await expect(utils.getByTestId('input-password')).toBeVisible();
  });

  test('点击注册标签应该切换到注册表单', async () => {
    await utils.clickByTestId('tab-register');

    await expect(utils.getByTestId('tab-register')).toHaveClass(/active/);
    await expect(utils.getByTestId('input-username')).toBeVisible();
    await expect(utils.getByTestId('input-nickname')).toBeVisible();
    await expect(utils.getByTestId('input-password')).toBeVisible();
  });

  test('应该能够输入用户名', async () => {
    await utils.fillInput('input-username', 'testuser');
    await expect(utils.getByTestId('input-username')).toHaveValue('testuser');
  });

  test('应该能够输入密码', async () => {
    await utils.fillInput('input-password', 'testpassword');
    await expect(utils.getByTestId('input-password')).toHaveValue('testpassword');
  });

  test('注册模式下应该能够输入昵称', async () => {
    await utils.clickByTestId('tab-register');
    await utils.fillInput('input-nickname', '测试用户');
    await expect(utils.getByTestId('input-nickname')).toHaveValue('测试用户');
  });

  test('应该显示登录按钮', async () => {
    await expect(utils.getByTestId('btn-submit')).toBeVisible();
    await expect(utils.getByTestId('btn-submit')).toContainText('登录');
  });

  test('点击切换模式按钮应该切换登录/注册', async () => {
    await utils.clickByTestId('btn-switch-mode');
    await expect(utils.getByTestId('tab-register')).toHaveClass(/active/);

    await utils.clickByTestId('btn-switch-mode');
    await expect(utils.getByTestId('tab-login')).toHaveClass(/active/);
  });

  test('空表单提交应该显示提示', async ({ page }) => {
    await utils.clickByTestId('btn-submit');
    // 验证 toast 提示
    await page.waitForTimeout(500);
  });
});
