import { test, expect, type Page } from '@playwright/test';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dio:guest', '1'); });
  await page.reload();
  await page.goto('/#/ask');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('question-input')).toBeEnabled();
}

async function askAndWait(page: Page, text: string) {
  await page.getByTestId('question-input').fill(text);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('send')).toBeVisible({ timeout: 10000 }); // 生成结束后停止按钮变回发送
}

test('提问时显示步骤动画，结束后折叠；每次新会话单独保存', async ({ page }) => {
  await startDemo(page);
  await page.getByTestId('question-input').fill('我适合什么工作？');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ask\?t=/);
  await expect(page.getByTestId('steps')).toBeVisible();
  await expect(page.getByTestId('steps-toggle')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('steps-toggle').click();
  await expect(page.getByTestId('steps-detail')).toContainText('生成解读');
  await expect(page.getByTestId('thread-item')).toHaveCount(1);

  await page.getByTestId('new-chat').click();
  await expect(page).toHaveURL(/#\/ask$/);
  await expect(page.getByTestId('suggestion').first()).toBeVisible();
  await askAndWait(page, '今年感情怎么样？');
  await expect(page.getByTestId('thread-item')).toHaveCount(2);

  // 点回第一个会话
  await page.getByTestId('thread-item').filter({ hasText: '我适合什么工作' }).getByRole('link').click();
  await expect(page.locator('[data-testid="answers"] > li')).toHaveCount(1);
  await expect(page.getByTestId('answers')).toContainText('我适合什么工作');
});

test('停止生成、重新生成、复制、编辑重问', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startDemo(page);
  await page.getByTestId('question-input').fill('财运如何？');
  await page.keyboard.press('Enter');
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('stopped')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('已停止生成');

  await page.getByRole('button', { name: '重新生成' }).click();
  await expect(page.getByTestId('answer')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('copy-answer')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('copy-answer').click();
  await expect(page.getByTestId('toast').last()).toContainText('已复制');

  await page.getByTestId('edit-question').click();
  const box = page.getByTestId('edit-form').locator('textarea');
  await box.fill('换个问法：今年适合投资吗？');
  await box.press('Enter');
  await expect(page.getByTestId('answers')).toContainText('换个问法');
  await expect(page.locator('[data-testid="answers"] > li')).toHaveCount(1);
});

test('会话“…”菜单：置顶 / 取消置顶、删除并撤销', async ({ page }) => {
  await startDemo(page);
  await askAndWait(page, '我的命宫怎么样？');
  const item = page.getByTestId('thread-item').first();
  await item.hover();
  await item.getByTestId('thread-more').click();
  const menu = page.getByTestId('thread-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await expect(menu.getByRole('menuitem')).toHaveText(['置顶', '删除']);
  await expect(page.getByRole('menuitem', { name: '置顶' })).toBeFocused();

  // Esc 关闭并把焦点还给“…”
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(item.getByTestId('thread-more')).toBeFocused();

  // 置顶后进入“置顶”分组，菜单文案变成“取消置顶”
  await item.getByTestId('thread-more').click();
  await page.getByTestId('menu-pin').click();
  await expect(page.getByRole('region', { name: '置顶' }).getByTestId('thread-item')).toHaveCount(1);
  await expect(page.getByTestId('thread-item').first()).toHaveAttribute('data-pinned', 'true');
  await page.getByTestId('thread-item').first().getByTestId('thread-more').click();
  await expect(page.getByTestId('menu-pin')).toHaveText('取消置顶');
  await page.getByTestId('menu-pin').click();
  await expect(page.getByRole('region', { name: '置顶' })).toHaveCount(0);

  // 行尾图钉一键置顶，刷新后仍保留
  await page.getByTestId('thread-item').first().hover();
  await page.getByTestId('thread-pin').click();
  await page.reload();
  await expect(page.getByRole('region', { name: '置顶' }).getByTestId('thread-item')).toHaveCount(1);

  // 点外面关闭菜单
  await page.getByTestId('thread-item').first().getByTestId('thread-more').click();
  await page.locator('body').click({ position: { x: 900, y: 400 } });
  await expect(page.getByTestId('thread-menu')).toHaveCount(0);

  // 删除可撤销
  await page.getByTestId('thread-item').first().hover();
  await page.getByTestId('thread-item').first().getByTestId('thread-more').click();
  await page.getByTestId('menu-delete').click();
  await expect(page.getByTestId('thread-item')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/ask$/);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByTestId('thread-item')).toHaveCount(1);
});

test('长标题在默认宽度下截断；悬停时右侧渐变显示“…”和图钉，不用拉宽侧栏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startDemo(page);
  await askAndWait(page, '根据我这些信息，看一下我最近找工作的运势怎么样，适不适合换城市发展？');
  await page.goto('/#/home');
  const sidebar = await page.getByTestId('sidebar').boundingBox();
  const item = page.getByTestId('thread-item').first();
  const actions = item.getByTestId('thread-actions');
  const more = item.getByTestId('thread-more');

  // 标题被截断（带省略号），没有溢出侧栏
  const title = item.getByTestId('thread-title');
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const tb = (await title.boundingBox())!;
  expect(tb.x + tb.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);

  // 未悬停时隐藏
  await page.mouse.move(900, 400);
  await expect(actions).toHaveCSS('opacity', '0');

  // 悬停后淡入，按钮完整落在侧栏里
  await item.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  const mb = (await more.boundingBox())!;
  const pb = (await item.getByTestId('thread-pin').boundingBox())!;
  expect(mb.x).toBeGreaterThan(sidebar!.x);
  expect(pb.x + pb.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
  expect(await actions.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');

  // 键盘聚焦也能看到
  await page.mouse.move(900, 400);
  await item.locator('a').focus();
  await expect(actions).toHaveCSS('opacity', '1');
});

test('会话列表默认只显示 8 个，可展开 / 收起', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => {
    const k = 'dual-astrology:v1';
    const s = JSON.parse(localStorage.getItem(k)!);
    const now = Date.now();
    s.threads = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`, mode: 'ziwei', profileId: 'me', title: `会话 ${i + 1}`,
      entries: [{ id: `e${i}`, question: `问题 ${i + 1}`, createdAt: new Date(now - i * 60000).toISOString(), answer: undefined }],
      updatedAt: new Date(now - i * 60000).toISOString(),
    }));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await expect(page.getByTestId('thread-item')).toHaveCount(8);
  await expect(page.getByTestId('thread-expand')).toHaveText(/还有 4 个/);
  await page.getByTestId('thread-expand').click();
  await expect(page.getByTestId('thread-item')).toHaveCount(12);
  await page.getByTestId('thread-expand').click();
  await expect(page.getByTestId('thread-item')).toHaveCount(8);
});

test('快捷键：⌘K 命令面板、⌘B 折叠侧栏、/ 命令', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await startDemo(page);
  await page.locator('body').click({ position: { x: 900, y: 300 } });
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('西方');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('palette')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'western');

  await page.keyboard.press('Control+b');
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('expand-sidebar')).toBeVisible();
  await page.getByTestId('expand-sidebar').click();
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');

  await page.getByTestId('question-input').fill('/zi');
  await expect(page.getByTestId('slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'ziwei');
  await expect(page.getByTestId('question-input')).toHaveValue('');
});

test('移动端抽屉可打开并切换页面', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startDemo(page);
  await page.getByTestId('open-drawer').click();
  await expect(page.getByTestId('drawer')).toBeVisible();
  await page.getByTestId('drawer').getByRole('link', { name: '命盘' }).click();
  await expect(page).toHaveURL(/#\/chart/);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
});
