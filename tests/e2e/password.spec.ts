import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const OUTBOX = '/tmp/dio-e2e-outbox.jsonl';
const uniq = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto('/');
}

async function register(page: Page, email: string, pw = 'abcd1234') {
  await page.goto('/#/register');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(pw);
  await page.getByTestId('auth-password2').fill(pw);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/#\/ask/);
}

async function login(page: Page, email: string, pw: string) {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(pw);
  await page.getByTestId('auth-submit').click();
}

/** 从测试用的发件箱里取最近一封重置链接（服务端未接邮件，开发时写到这里） */
function lastLink(email: string): string {
  const rows = readFileSync(OUTBOX, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { email: string; link: string });
  return rows.filter((r) => r.email === email).at(-1)!.link;
}

test('忘记密码 → 控制台链接 → 设置新密码 → 自动登录；旧密码失效', async ({ page }) => {
  await fresh(page);
  const email = uniq();
  await register(page, email);
  await page.getByTestId('logout').first().click();
  await expect(page).toHaveURL(/#\/login/);

  await page.getByTestId('forgot-link').click();
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'forgot');
  await page.getByTestId('auth-email').fill('bad');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();
  await page.getByTestId('auth-email').fill(email.toUpperCase());
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('forgot-sent')).toContainText('重置链接');

  const link = lastLink(email);
  expect(link).toMatch(/^http:\/\/localhost:5173\/#\/reset\?token=/);
  await page.goto(link.replace('http://localhost:5173', ''));
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'reset');
  await page.getByTestId('auth-password').fill('newpass77');
  await page.getByTestId('auth-password2').fill('newpass77');
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('account-label').first()).toHaveText(email);

  // 同一个链接不能再用
  await page.goto(link.replace('http://localhost:5173', ''));
  await page.getByTestId('auth-password').fill('again7777');
  await page.getByTestId('auth-password2').fill('again7777');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('无效或已过期');

  await page.context().clearCookies();
  await page.goto('/#/login');
  await page.reload();
  await login(page, email, 'abcd1234');
  await expect(page.getByTestId('auth-error')).toHaveText('邮箱或密码不正确');
  await login(page, email, 'newpass77');
  await expect(page).toHaveURL(/#\/ask/);
});

test('重置链接缺令牌时提示重新申请', async ({ page }) => {
  await fresh(page);
  await page.goto('/#/reset');
  await expect(page.getByTestId('auth-error')).toContainText('重新申请');
  await page.getByTestId('to-login').click();
  await expect(page.getByTestId('auth-page')).toHaveAttribute('data-kind', 'login');
});

test('资料页修改密码', async ({ page }) => {
  await fresh(page);
  const email = uniq();
  await register(page, email);
  await page.getByTestId('load-demo').click();
  await page.goto('/#/profile');
  await page.getByTestId('change-password-toggle').click();
  await page.getByTestId('pw-current').fill('wrong9999');
  await page.getByTestId('pw-next').fill('zzzz9999');
  await page.getByTestId('pw-next2').fill('zzzz9999');
  await page.getByTestId('pw-submit').click();
  await expect(page.getByTestId('pw-error')).toHaveText('当前密码不正确');
  await page.getByTestId('pw-current').fill('abcd1234');
  await page.getByTestId('pw-submit').click();
  await expect(page.getByTestId('toast')).toContainText('密码已修改');
  await expect(page.getByTestId('change-password')).toHaveCount(0);

  await page.getByTestId('profile-logout').click();
  await login(page, email, 'zzzz9999');
  await expect(page).toHaveURL(/#\/ask/);
});

test('会话过期：回到登录页并提示，本机修改重新登录后上传', async ({ page }) => {
  await fresh(page);
  const email = uniq();
  await register(page, email);
  await page.getByTestId('load-demo').click();
  await page.waitForResponse((r) => r.url().includes('/api/state') && r.request().method() === 'PUT');

  // 模拟服务端会话失效
  await page.context().clearCookies();
  const radio = page.getByTestId('mode-switch').first().getByRole('radio', { name: '西方占星' });
  await radio.click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByTestId('auth-notice')).toContainText('登录已过期');

  await login(page, email, 'abcd1234');
  await expect(page).toHaveURL(/#\/ask/);
  await expect(page.getByTestId('mode-switch').first().getByRole('radio', { name: '西方占星' })).toHaveAttribute('aria-checked', 'true');
  const remote = await page.evaluate(async () => (await (await fetch('/api/state')).json()).state.mode);
  expect(remote).toBe('western');
});

test('无法连接账号服务时，找回密码给出说明', async ({ page }) => {
  await page.route('**/api/**', (r) => r.abort());
  await fresh(page);
  await page.getByTestId('forgot-link').click();
  await expect(page.getByTestId('local-note')).toContainText('无法发送重置邮件');
  await expect(page.getByTestId('auth-submit')).toBeDisabled();
});
