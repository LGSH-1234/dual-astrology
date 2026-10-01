import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'docs/screenshots';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dio:guest', '1'); });
  await page.reload();
  await page.goto('/#/ask');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('question-input')).toBeEnabled();
}

const radios = (page: Page) => page.getByRole('radiogroup', { name: '解读模式' }).first().getByRole('radio');

async function setMode(page: Page, mode: 'ziwei' | 'western') {
  await radios(page).nth(mode === 'ziwei' ? 0 : 1).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
}

test('首次进入直接是对话框，资料卡在输入框上方，保存后可提问', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dio:guest', '1'); });
  await page.reload();
  await page.goto('/#/home');
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('setup-card')).toBeVisible();
  await expect(page.getByTestId('question-input')).toBeDisabled();
  await page.getByLabel('名字').fill('小林');
  await page.getByLabel('出生日期').fill('1995-02-23');
  // 不选地点不能保存
  await page.getByRole('button', { name: '保存并开始对话' }).click();
  await expect(page.getByRole('alert')).toContainText('出生地点');
  await page.getByTestId('loc-search').fill('临海');
  await page.getByTestId('loc-option').first().click();
  await expect(page.getByTestId('loc-prov')).toHaveValue('330000');
  await expect(page.getByTestId('loc-city')).toHaveValue('331000');
  await expect(page.getByTestId('loc-county')).toHaveValue('331082');
  await page.getByRole('button', { name: '保存并开始对话' }).click();
  await expect(page.getByTestId('setup-card')).toHaveCount(0);
  await expect(page.getByTestId('question-input')).toBeEnabled();
  await expect(page.locator('.md-table')).toContainText('命宫');
  expect(await page.evaluate(() => localStorage.getItem('dual-astrology:v1'))).toContain('小林');
});

test('紫微运限不支持的出生日期显示可理解提示', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dio:guest', '1'); });
  await page.reload();
  await page.goto('/#/ask');
  await page.getByLabel('名字').fill('边界测试');
  await page.getByLabel('出生日期').fill('1900-06-15');
  await page.getByTestId('loc-search').fill('临海');
  await page.getByTestId('loc-option').first().click();
  await page.getByRole('button', { name: '保存并开始对话' }).click();
  await expect(page.getByRole('alert')).toContainText('紫微运限');
  await expect(page.getByTestId('setup-card')).toBeVisible();
});

test('模式切换不刷新页面，术语与命盘随之变化', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 42; });
  await page.goto('/#/chart');
  await setMode(page, 'ziwei');
  await expect(page.getByTestId('ziwei-grid')).toBeVisible();
  await expect(page.getByTestId('ziwei-cell')).toHaveCount(12);
  await setMode(page, 'western');
  await expect(page.getByTestId('western-wheel')).toBeVisible();
  await expect(page.getByTestId('ziwei-grid')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);

  await page.goto('/#/ask');
  await expect(page.getByTestId('ask-title')).toHaveText('问星星');
  await setMode(page, 'ziwei');
  await expect(page.getByTestId('ask-title')).toHaveText('问紫微');
});

test('紫微宫位可选中并显示星曜', async ({ page }) => {
  await startDemo(page);
  await setMode(page, 'ziwei');
  await page.goto('/#/chart');
  await page.getByTestId('ziwei-cell').nth(3).click();
  await expect(page.getByTestId('palace-stars')).toBeVisible();
});

test('合盘随模式切换为对应规则', async ({ page }) => {
  await startDemo(page);
  await page.goto('/#/compat');
  await setMode(page, 'ziwei');
  const report = page.getByTestId('compat-report');
  await expect(report).toHaveAttribute('data-report-mode', 'ziwei');
  await setMode(page, 'western');
  await expect(report).toHaveAttribute('data-report-mode', 'western');
  const score = Number(await page.getByTestId('compat-score').textContent());
  expect(score).toBeGreaterThanOrEqual(5);
  expect(score).toBeLessThanOrEqual(98);
});

test('提问走 Mock 解读，并带上模式标记', async ({ page }) => {
  await startDemo(page);
  await setMode(page, 'western');
  await page.goto('/#/ask');
  await page.getByTestId('question-input').fill('最近工作压力大，怎么调整？');
  await page.keyboard.press('Enter');
  const answer = page.getByTestId('answer').first();
  await expect(answer).toBeVisible();
  await expect(answer).toHaveAttribute('data-source-mode', 'western');
  await expect(answer).toContainText('演示');
});

test('服务端不可用时回退本地解读，不崩溃', async ({ page }) => {
  await startDemo(page);
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/#/ask');
  await page.getByTestId('suggestion').first().click();
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('answer')).toBeVisible();
});

test('模式切换支持键盘方向键', async ({ page }) => {
  await startDemo(page);
  await setMode(page, 'ziwei');
  await radios(page).nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'western');
  await expect(radios(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'ziwei');
});

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  test(`${w}px 宽度无横向溢出并截图`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await startDemo(page);
    for (const route of ['home', 'chart', 'compat', 'ask', 'profile']) {
      for (const mode of ['ziwei', 'western'] as const) {
        await page.goto(`/#/${route}`);
        await setMode(page, mode);
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route}/${mode}`).toBeLessThanOrEqual(0);
        if (route !== 'profile' || mode === 'ziwei') {
          await page.screenshot({ path: `${SHOTS}/${w}-${route}-${mode}.png`, fullPage: route !== 'chart' || w > 400 });
        }
      }
    }
  });
}

test('减少动态效果时不播放动画', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await startDemo(page);
  const anim = await page.evaluate(() => {
    const el = document.querySelector('.orbit-spin, .fade-up');
    return el ? getComputedStyle(el).animationName : 'none';
  });
  expect(anim).toBe('none');
  await ctx.close();
});

test('资料清除后回到首次填写资料的对话', async ({ page }) => {
  await startDemo(page);
  await page.goto('/#/profile');
  await expect(page.getByTestId('ai-status')).not.toHaveText('检查中…');
  await page.getByTestId('clear-data').click();
  await page.getByTestId('confirm-clear').click();
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('setup-card')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('dual-astrology:v1'))).toBeNull();
});
