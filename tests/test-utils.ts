import { Page } from '@playwright/test';

/**
 * 测试工具函数
 */
export class TestUtils {
  constructor(private page: Page) {}

  /**
   * 等待页面加载完成
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 通过 data-testid 获取元素
   */
  getByTestId(testId: string) {
    return this.page.getByTestId(testId);
  }

  /**
   * 点击 data-testid 元素
   */
  async clickByTestId(testId: string) {
    await this.getByTestId(testId).click();
  }

  /**
   * 填充输入框
   */
  async fillInput(testId: string, value: string) {
    await this.getByTestId(testId).fill(value);
  }

  /**
   * 检查元素是否可见
   */
  async isVisible(testId: string) {
    return await this.getByTestId(testId).isVisible();
  }

  /**
   * 检查元素是否包含文本
   */
  async hasText(testId: string, text: string) {
    await this.getByTestId(testId).waitFor({ state: 'visible' });
    return await this.getByTestId(testId).textContent().then((content) => content?.includes(text));
  }
}
