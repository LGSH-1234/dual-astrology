import { test, expect, type Page } from '@playwright/test';

const uniq = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto('/');
}

async function fillRegister(page: Page, email: string, pw = 'abcd1234', pw2 = pw) {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(pw);
  await page.getByTestId('auth-password2').fill(pw2);
  await page.getByTestId('auth-submit').click();
}

test('未登录进入登录页；注册 → 填资料 → 退出 → 登录后资料还在', async ({ page }) => {
  await fresh(page);
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'login');
  await page.getByTestId('auth-switch').click();
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'register');

  const email = uniq();
  // 校验：两次密码不一致
  await fillRegister(page, email, 'abcd1234', 'abcd12345');
  await expect(page.getByTestId('auth-error')).toHaveText('两次输入的密码不一致');
  await fillRegister(page, email);
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('setup-card')).toBeVisible();
  await expect(page.getByTestId('account-label').first()).toHaveText(email);

  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('question-input')).toBeEnabled();
  // 等防抖同步到服务端
  await page.waitForResponse((r) => r.url().includes('/api/state') && r.request().method() === 'PUT');

  await page.getByTestId('logout').first().click();
  await expect(page).toHaveURL(/#\/login/);
  // 服务端账号退出后清掉本机副本
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('dual-astrology:v1:')))).toEqual([]);

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('wrong9999');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toHaveText('邮箱或密码不正确');

  await page.getByTestId('auth-password').fill('abcd1234');
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('question-input')).toBeEnabled();
  await page.goto('/#/profile');
  await expect(page.getByTestId('account-email')).toHaveText(email);
});

test('游客模式：可直接使用，注册后游客数据并入账号', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('continue-guest').click();
  await expect(page).toHaveURL(/#\/ask/);
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('question-input')).toBeEnabled();
  // 刷新后仍是游客
  await page.reload();
  await expect(page.getByTestId('question-input')).toBeEnabled();

  await page.getByTestId('guest-register').first().click();
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'register');
  await fillRegister(page, uniq());
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('toast')).toContainText('并入账号');
  await expect(page.getByTestId('question-input')).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('dual-astrology:v1'))).toBeNull();
});

test('服务端不可达时退回本机账号', async ({ page }) => {
  await page.route('**/api/**', (r) => r.abort());
  await fresh(page);
  await expect(page.getByTestId('local-note')).toBeVisible();
  await page.getByTestId('auth-switch').click();
  const email = uniq();
  await fillRegister(page, email);
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('setup-card')).toBeVisible();
  const accounts = await page.evaluate(() => localStorage.getItem('dio:accounts') ?? '');
  expect(accounts).toContain(email);
  expect(accounts).not.toContain('abcd1234');
  await page.getByTestId('logout').first().click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('abcd1234');
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/#\/ask/);
});
