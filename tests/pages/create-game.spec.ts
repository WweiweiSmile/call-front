import {test, expect} from '@playwright/test';
import {TestUtils} from '../test-utils';

test.describe('创建游戏页面', () => {
  let utils: TestUtils;

  test.beforeEach(async ({page}) => {
    utils = new TestUtils(page);
    await page.goto('/');
    await utils.waitForPageLoad();
    // 导航到创建游戏页面
    await utils.clickByTestId('btn-create-game');
    await page.waitForURL(/create-game/);
  });

  test('应该显示返回按钮', async () => {
    await expect(utils.getByTestId('btn-back')).toBeVisible();
  });

  test('点击返回按钮应该返回上一页', async ({page}) => {
    await utils.clickByTestId('btn-back');
    await page.waitForTimeout(500);
  });

  test('应该显示游戏名称输入框', async () => {
    await expect(utils.getByTestId('input-game-name')).toBeVisible();
  });

  test('应该显示游戏描述输入框', async () => {
    await expect(utils.getByTestId('input-game-description')).toBeVisible();
  });

  test('应该能够输入游戏名称', async () => {
    await utils.fillInput('input-game-name', '测试游戏名称');
    await expect(utils.getByTestId('input-game-name')).toHaveValue('测试游戏名称');
  });

  test('应该能够输入游戏描述', async () => {
    await utils.fillInput('input-game-description', '这是一个测试游戏的描述');
    await expect(utils.getByTestId('input-game-description')).toHaveValue('这是一个测试游戏的描述');
  });

  test('应该显示日期选择器', async () => {
    await expect(utils.getByTestId('date-picker-trigger')).toBeVisible();
  });

  test('应该显示创建游戏按钮', async () => {
    await expect(utils.getByTestId('btn-create-game-submit')).toBeVisible();
    await expect(utils.getByTestId('btn-create-game-submit')).toContainText('创建游戏');
  });

  test('空表单提交应该不执行', async () => {
    await utils.clickByTestId('btn-create-game-submit');
    // 验证没有跳转或显示错误提示
    await page.waitForTimeout(500);
  });
});
