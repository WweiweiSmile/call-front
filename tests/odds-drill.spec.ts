// ============================================
// 赔率快速训练的端到端
//
// 断言的核心是**「页面上的题」与「公式算出的答案」一致**：题干从页面上读回来，
// 答案用 src/utils/potOdds.ts 的同一个引擎算出来，再去点对应的选项 / 填对应的数。
// 所以这一条同时守住了四件事：题干渲染、选项生成、判分口径、作答交互。
//
// 登录态是注入的：这个页面不调任何接口（纯本地算术），需要满足的只是
// RequireAuth「本地有 token」这一个条件，所以不需要真账号，也不碰后端。
// Taro H5 的 storage 格式是 JSON.stringify({ data: value })，
// 见 @tarojs/taro-h5/dist/api/storage/index.js
//
// 页面支持 ?seed= 参数（见 useOddsDrill.ts），这里固定种子，
// 失败时能原样复现同一套题
// ============================================

import { Page, expect, test } from '@playwright/test';
import {
  docPercent,
  fractionLabel,
  largestCallable,
  outsToEquity,
  requiredEquity,
} from '../src/utils/potOdds';
import { betsFor } from '../src/utils/oddsDrill';
import type { Difficulty } from '../src/utils/oddsDrill';

const SEED = 20260924;
const DRILLS_PER_SET = 10;

const PROBE_USER = {
  id: '1',
  username: 'e2e_odds',
  nickname: 'e2e',
  role: 'user',
};

/** 注入登录态。必须在应用脚本执行前写入，所以用 addInitScript */
async function signIn(page: Page): Promise<void> {
  await page.addInitScript((user) => {
    localStorage.setItem('token', JSON.stringify({ data: 'e2e-token' }));
    localStorage.setItem('user', JSON.stringify({ data: JSON.stringify(user) }));
  }, PROBE_USER);
}

async function gotoDrill(page: Page, seed: number = SEED): Promise<void> {
  await page.goto(`/index.html#/pages/odds-drill/index?seed=${seed}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-testid="drill-prompt"]', { timeout: 15000 });
}

// ============================================
// 从题干反算答案
//
// 用**页面上显示的**数字而不是生成器的内部值是有意的：用户看到的就是这几个数，
// 如果他按屏幕上的数算得对、却被判错，那就是 bug。
// 显示时金额保留一位小数，与精确值最多差 0.05bb，不足以翻转整数百分比
// ============================================

type Expected =
  /** 胜率题：答案是百分比（选择题选项 / 填空输入都是它） */
  | { kind: 'equity'; value: number }
  /** 反查题：答案是底池倍数 */
  | { kind: 'fraction'; value: number }
  /** 判断题：1 = 该跟，0 = 该弃 */
  | { kind: 'verdict'; value: 1 | 0 };

const NUM = '(\\d+(?:\\.\\d+)?)';

/** 题干里的听牌张数，五种题型通用 */
function outsOf(prompt: string): number {
  const outs = Number(prompt.match(/(\d+) 张 outs/)?.[1]);
  expect(Number.isFinite(outs), `题干里读不到 outs：${prompt}`).toBe(true);
  return outs;
}

function streetOf(prompt: string): 'flop' | 'turn' {
  if (prompt.startsWith('翻牌圈')) return 'flop';
  if (prompt.startsWith('转牌圈')) return 'turn';
  throw new Error(`题干里读不到街道：${prompt}`);
}

function expectAnswer(prompt: string, difficulty: Difficulty): Expected {
  // T1 面对下注
  let m = prompt.match(
    new RegExp(`底池 ${NUM}bb。对手下注 [^（]*（${NUM}bb）。你至少需要多少胜率才能跟？`),
  );
  if (m) {
    return { kind: 'equity', value: requiredEquity({ pot: +m[1], bet: +m[2] }) };
  }

  // T2 加注之后
  m = prompt.match(
    new RegExp(
      `底池 ${NUM}bb。对手下注 [^（]*（${NUM}bb），你加注到 ${NUM}bb。对手跟注需要多少胜率？`,
    ),
  );
  if (m) {
    return {
      kind: 'equity',
      value: requiredEquity({ pot: +m[1], bet: +m[2], raiseTo: +m[3] }),
    };
  }

  // T3 听牌换算：问哪个口径就答哪个
  m = prompt.match(/成牌概率是多少？（(精确值|四二法则估算)）/);
  if (m) {
    const values = outsToEquity(outsOf(prompt), streetOf(prompt));
    return { kind: 'equity', value: m[1] === '精确值' ? values.exact : values.rule };
  }

  // T4 反查
  m = prompt.match(new RegExp(`你这手牌有 ${NUM}% 的胜率。面对对手的一个下注，最多能跟到多大？`));
  if (m) {
    const answer = largestCallable(betsFor(difficulty), Number(m[1]) / 100);
    expect(answer, `反查 ${m[1]}% 无解`).not.toBeNull();
    return { kind: 'fraction', value: answer as number };
  }

  // T5 判断题
  m = prompt.match(
    new RegExp(`底池 ${NUM}bb。对手下注 [^（]*（${NUM}bb），你是.+?。跟注对吗？`),
  );
  if (m) {
    const actual = outsToEquity(outsOf(prompt), streetOf(prompt)).exact;
    const required = requiredEquity({ pot: +m[1], bet: +m[2] });
    return { kind: 'verdict', value: actual >= required ? 1 : 0 };
  }

  throw new Error(`题干不匹配任何一种题型：${prompt}`);
}

/** 按题型选择作答方式，返回正确答案的展示文案 */
async function answerCorrectly(
  page: Page,
  difficulty: Difficulty,
): Promise<string> {
  const prompt = await page.locator('[data-testid="drill-prompt"]').innerText();
  const expected = expectAnswer(prompt, difficulty);

  if (expected.kind === 'verdict') {
    const label = expected.value === 1 ? '跟注' : '弃牌';
    await page
      .locator(expected.value === 1 ? '[data-testid="verdict-call"]' : '[data-testid="verdict-fold"]')
      .click();
    return label;
  }

  const label =
    expected.kind === 'fraction'
      ? fractionLabel(expected.value)
      : `${docPercent(expected.value)}%`;

  // 选择题：点文案匹配的那一个
  const choices = page.locator('[data-testid^="choice-"]');
  const count = await choices.count();
  if (count > 0) {
    for (let i = 0; i < count; i += 1) {
      if ((await choices.nth(i).innerText()).trim() === label) {
        await choices.nth(i).click();
        return label;
      }
    }
    throw new Error(`算出的答案 ${label} 不在选项里：${prompt}`);
  }

  // 填空题：输整数百分比
  await page
    .locator('[data-testid="input-drill-answer"] input')
    .fill(String(docPercent((expected as { value: number }).value)));
  await page.locator('[data-testid="btn-submit-drill"]').click();
  return label;
}

async function switchTo(page: Page, label: string): Promise<void> {
  await page.locator('.filter-tabs .tab-item', { hasText: label }).click();
  await page.waitForSelector('[data-testid="drill-prompt"]', { timeout: 15000 });
}

test.describe('赔率快速训练', () => {
  test('常规档 10 题全部答对，小结显示 100%', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);

    for (let i = 1; i <= DRILLS_PER_SET; i += 1) {
      await expect(page.locator('.progress-index')).toHaveText(
        `第 ${i}/${DRILLS_PER_SET} 题`,
      );

      const label = await answerCorrectly(page, 2);

      await expect(page.locator('[data-testid="drill-verdict"]')).toContainText(
        '答对了',
      );
      // 解释卡里必须能看到正确答案本身。
      // 别断言「算式」这类措辞 —— 那是 T1/T2 的用词，T3 的步骤写的是「精确值：…」，
      // 按措辞断言会把测试绑死在文案上
      await expect(page.locator('[data-testid="drill-steps"]')).toContainText(label);
      if (i === 1) {
        // 第一题是面对下注，一定要给口诀与锚点
        await expect(page.locator('[data-testid="drill-steps"]')).toContainText(
          '口诀',
        );
      }

      await page.locator('[data-testid="btn-next-drill"]').click();
    }

    const summary = page.locator('[data-testid="drill-summary"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('100%');
    await expect(summary).toContainText('10/10');
    // 最高连击那一格：值是「10」，标签是「最高连击」（DOM 里值在前，别按标签在前断言）
    await expect(summary.locator('.summary-item').nth(2)).toContainText('10');
    await expect(summary.locator('.summary-item').nth(2)).toContainText('最高连击');
  });

  test('同 seed 出同一套题，换 seed 换题', async ({ page }) => {
    await signIn(page);

    await gotoDrill(page, SEED);
    const first = await page.locator('[data-testid="drill-prompt"]').innerText();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="drill-prompt"]', { timeout: 15000 });
    const again = await page.locator('[data-testid="drill-prompt"]').innerText();

    await gotoDrill(page, SEED + 1);
    const other = await page.locator('[data-testid="drill-prompt"]').innerText();

    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  test('答错时标出正确项，并说明差了几个百分点', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);

    const prompt = await page.locator('[data-testid="drill-prompt"]').innerText();
    const expected = expectAnswer(prompt, 2);
    // 常规档第一题是面对下注，必然是四选一
    expect(expected.kind).toBe('equity');

    const correct = `${docPercent((expected as { value: number }).value)}%`;
    const choices = page.locator('[data-testid^="choice-"]');
    await expect(choices).toHaveCount(4);

    let wrongIndex = -1;
    for (let i = 0; i < 4; i += 1) {
      if ((await choices.nth(i).innerText()).trim() !== correct) {
        wrongIndex = i;
        break;
      }
    }
    expect(wrongIndex).toBeGreaterThanOrEqual(0);
    await choices.nth(wrongIndex).click();

    await expect(page.locator('[data-testid="drill-verdict"]')).toContainText('答错了');
    await expect(page.locator('[data-testid="drill-steps"]')).toContainText(`正确 ${correct}`);
    await expect(page.locator('.verdict-note')).toContainText('个百分点');
    await expect(page.locator('.choice-item.correct')).toHaveCount(1);
    await expect(page.locator('.choice-item.wrong')).toHaveCount(1);
    await expect(page.locator('.choice-item.correct')).toContainText(correct);
  });

  test('切换难度会重开一组，入门档只出三个锚点尺度', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);

    await answerCorrectly(page, 2);
    await page.locator('[data-testid="btn-next-drill"]').click();
    await expect(page.locator('.progress-index')).toHaveText(`第 2/${DRILLS_PER_SET} 题`);

    await switchTo(page, '入门');

    await expect(page.locator('.progress-index')).toHaveText(`第 1/${DRILLS_PER_SET} 题`);
    await expect(page.locator('.progress-accuracy')).toHaveText('正确率 0%');

    // 入门档的锚点：1/3 池 → 20%、1/2 池 → 25%、1 倍池 → 33%
    const prompt = await page.locator('[data-testid="drill-prompt"]').innerText();
    const expected = expectAnswer(prompt, 1);
    expect(expected.kind).toBe('equity');
    expect(['20%', '25%', '33%']).toContain(
      `${docPercent((expected as { value: number }).value)}%`,
    );
  });

  test('进阶档用填空作答，整数百分比也算对', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);
    await switchTo(page, '进阶');

    // 进阶档第一题是面对下注，没有选项、只有输入框
    await expect(page.locator('[data-testid="choice-0"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="input-drill-answer"]')).toBeVisible();

    await answerCorrectly(page, 3);
    await expect(page.locator('[data-testid="drill-verdict"]')).toContainText('答对了');
  });

  test('小结展示平均用时与错题，重练同一题答对后出列', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);

    // 第一题故意答错
    const firstPrompt = await page.locator('[data-testid="drill-prompt"]').innerText();
    const expected = expectAnswer(firstPrompt, 2);
    expect(expected.kind).toBe('equity');
    const correct = `${docPercent((expected as { value: number }).value)}%`;
    const choices = page.locator('[data-testid^="choice-"]');
    for (let i = 0; i < 4; i += 1) {
      if ((await choices.nth(i).innerText()).trim() !== correct) {
        await choices.nth(i).click();
        break;
      }
    }
    await page.locator('[data-testid="btn-next-drill"]').click();

    // 余下 9 题答对
    for (let i = 2; i <= DRILLS_PER_SET; i += 1) {
      await answerCorrectly(page, 2);
      await page.locator('[data-testid="btn-next-drill"]').click();
    }

    // 本组：正确率 90%、平均用时是个数、错题列出刚才那道
    const summary = page.locator('[data-testid="drill-summary"]');
    await expect(summary).toContainText('90%');
    await expect(summary).toContainText('9/10');
    const avg = await summary.locator('.summary-item').nth(3).innerText();
    expect(avg).toMatch(/\d+\.\d/);

    const wrongList = page.locator('[data-testid="drill-wrong-list"]');
    await expect(wrongList).toBeVisible();
    await expect(wrongList).toContainText('本组错题 1 道');
    await expect(wrongList).toContainText(firstPrompt);

    // 重练：出的必须是同一道题
    await page.locator('[data-testid="btn-retry-wrong"]').click();
    await expect(page.locator('.retry-banner')).toContainText('错题重练');
    await expect(page.locator('[data-testid="drill-prompt"]')).toHaveText(firstPrompt);

    // 这次答对 → 错题出列
    await answerCorrectly(page, 2);
    await expect(page.locator('[data-testid="drill-verdict"]')).toContainText('答对了');
    await page.locator('[data-testid="btn-next-drill"]').click();

    await expect(page.locator('[data-testid="drill-wrong-list"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="drill-total"]')).not.toContainText(
      '还有 1 道题没答对过',
    );
  });

  test('累计进度跨会话留存', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);

    // 答 3 题（都对）
    for (let i = 0; i < 3; i += 1) {
      await answerCorrectly(page, 2);
      await page.locator('[data-testid="btn-next-drill"]').click();
    }

    // 重进页面：本组从第 1 题开始，但累计还在
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="drill-prompt"]', { timeout: 15000 });
    await expect(page.locator('.progress-index')).toHaveText(`第 1/${DRILLS_PER_SET} 题`);

    // 答满整组后看小结里的累计
    for (let i = 1; i <= DRILLS_PER_SET; i += 1) {
      await answerCorrectly(page, 2);
      await page.locator('[data-testid="btn-next-drill"]').click();
    }

    const total = page.locator('[data-testid="drill-total"]');
    await expect(total).toBeVisible();
    // 3（重进前）+ 10（重进后）= 13 次作答
    await expect(total.locator('.summary-item').nth(0)).toContainText('13');
    await expect(total.locator('.summary-item').nth(1)).toContainText('100%');
    await expect(total).toContainText('历史最高连击');
  });

  test('进度存储被写坏时不崩，按空进度继续', async ({ page }) => {
    await signIn(page);
    // 三种写坏的方式：坏 JSON、结构不对、类型不对
    await page.addInitScript(() => {
      localStorage.setItem(
        'odds_drill_progress_v1',
        JSON.stringify({ data: '{"total": "不是数字", "wrong": "不是数组"' }),
      );
    });

    await gotoDrill(page);
    // 页面照常出题
    await expect(page.locator('[data-testid="drill-prompt"]')).toBeVisible();
    await answerCorrectly(page, 2);
    await expect(page.locator('[data-testid="drill-verdict"]')).toContainText('答对了');

    // 累计退回可用的数字，而不是 NaN 或空白
    await page.locator('[data-testid="btn-next-drill"]').click();
    for (let i = 2; i <= DRILLS_PER_SET; i += 1) {
      await answerCorrectly(page, 2);
      await page.locator('[data-testid="btn-next-drill"]').click();
    }

    const total = page.locator('[data-testid="drill-total"]');
    await expect(total).toBeVisible();
    await expect(total).not.toContainText('NaN');
    await expect(total.locator('.summary-item').nth(0)).toContainText('10');
  });

  test('混合档会出判断题，判定与公式一致', async ({ page }) => {
    await signIn(page);
    await gotoDrill(page);
    await switchTo(page, '混合');

    // 混合档第一题是判断题：两个按钮
    await expect(page.locator('[data-testid="verdict-call"]')).toBeVisible();
    await expect(page.locator('[data-testid="verdict-fold"]')).toBeVisible();

    const label = await answerCorrectly(page, 4);
    await expect(page.locator('[data-testid="drill-verdict"]')).toContainText('答对了');

    // 解释卡必须把结论说清楚，并给出门槛与胜率的对比
    const steps = page.locator('[data-testid="drill-steps"]');
    await expect(steps).toContainText('门槛');
    await expect(steps).toContainText('我的胜率');
    await expect(steps).toContainText(`跟注${label === '跟注' ? '是对的' : '是错的'}`);
  });
});
