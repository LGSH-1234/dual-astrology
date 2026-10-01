import { test, expect, type Page } from '@playwright/test';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dio:guest', '1'); });
  await page.reload();
  await page.goto('/#/ask');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('question-input')).toBeEnabled();
}

test('地点：三级联动逐级选择，只有中国地点，资料页显示三级', async ({ page }) => {
  await startDemo(page);
  await page.goto('/#/profile');
  await page.getByRole('button', { name: /编辑/ }).first().click();
  const prov = page.getByTestId('loc-prov');
  // 只有 34 个省级单位 + 占位项，没有海外城市
  await expect(prov.locator('option')).toHaveCount(35);
  await expect(prov.locator('option', { hasText: '东京' })).toHaveCount(0);
  await prov.selectOption('330000');
  await page.getByTestId('loc-city').selectOption({ label: '台州市' });
  await page.getByTestId('loc-county').selectOption({ label: '临海市' });
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByTestId('profile-place')).toHaveText('浙江省 · 台州市 · 临海市');

  // 直辖市只有两级；换省份会清空下级
  await page.getByRole('button', { name: /编辑/ }).first().click();
  await prov.selectOption('110000');
  await expect(page.getByTestId('loc-county')).toBeDisabled();
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByRole('alert')).toContainText('城市或区县');
  await page.getByTestId('loc-city').selectOption({ label: '海淀区' });
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByTestId('profile-place')).toHaveText('北京市 · 海淀区');
});

test('地点：搜索支持键盘选择', async ({ page }) => {
  await startDemo(page);
  await page.goto('/#/profile');
  await page.getByRole('button', { name: /编辑/ }).first().click();
  await page.getByTestId('loc-search').fill('喀什');
  await expect(page.getByTestId('loc-option').first()).toContainText('喀什');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('loc-prov')).toHaveValue('650000');
  await expect(page.getByTestId('loc-search')).toHaveValue('');
});

test('侧栏：可拖动调宽，最小为默认宽度，最大约 1/3，刷新后保留；会话列表无滚动条', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startDemo(page);
  const sb = page.getByTestId('sidebar');
  const handle = page.getByTestId('sidebar-resizer');
  const width = async () => (await sb.boundingBox())!.width;
  expect(Math.round(await width())).toBe(248);

  const box = (await handle.boundingBox())!;
  const y = box.y + box.height / 2;
  // 往左拖不会比默认更窄
  await page.mouse.move(box.x + 3, y); await page.mouse.down();
  await page.mouse.move(box.x - 150, y, { steps: 5 }); await page.mouse.up();
  expect(Math.round(await width())).toBe(248);
  // 往右拖很远，最多 1/3 屏宽
  await page.mouse.move(box.x + 3, y); await page.mouse.down();
  await page.mouse.move(box.x + 900, y, { steps: 8 }); await page.mouse.up();
  expect(Math.round(await width())).toBe(480);
  // 主区跟着让位
  const mainLeft = await page.locator('#main').evaluate((el) => el.getBoundingClientRect().left);
  expect(mainLeft).toBeGreaterThanOrEqual(480);

  await page.reload();
  expect(Math.round(await width())).toBe(480);
  // 双击恢复
  await handle.dblclick();
  expect(Math.round(await width())).toBe(248);
  // 键盘可调
  await handle.focus(); await page.keyboard.press('ArrowRight');
  expect(Math.round(await width())).toBe(264);

  // 列表不出现横向/纵向滚动条
  const list = page.getByTestId('thread-list');
  const sbInfo = await list.evaluate((el) => ({
    sw: getComputedStyle(el).scrollbarWidth, ox: getComputedStyle(el).overflowX,
    horiz: el.scrollWidth > el.clientWidth, gutter: (el as HTMLElement).offsetWidth - el.clientWidth,
  }));
  expect(sbInfo.ox).toBe('hidden');
  expect(sbInfo.horiz).toBe(false);
  expect(sbInfo.gutter).toBe(0);
});

test('侧栏：窗口变窄时宽度回收到 1/3 以内', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startDemo(page);
  await page.evaluate(() => localStorage.setItem('dio:sidebar-width', '480'));
  await page.reload();
  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(async () => Math.round((await page.getByTestId('sidebar').boundingBox())!.width)).toBe(300);
});
