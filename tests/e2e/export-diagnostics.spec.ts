import { test, expect, chromium } from '@playwright/test';

test('export diagnoses project and line differences without misleading installation hints', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const snapshot = await page.evaluate(() => window.editor);
  const changed = await request.post('/api/export', { data: { ...snapshot, project: { ...snapshot.project, title: 'Changed title' } } });
  expect(changed.status()).toBe(400);
  expect(await changed.text()).toContain('项目数据不同');
  const row = structuredClone(snapshot); row.signature = 'stale'; row.diagnostics.records[0][5] += 1;
  const mismatch = await request.post('/api/export', { data: row });
  expect(mismatch.status()).toBe(400);
  const detail = await mismatch.text();
  expect(detail).toContain('第 1 条'); expect(detail).toContain('行高');
  expect(detail).not.toContain('安装');
  const old = await request.post('/api/export', { data: { project: snapshot.project, signature: 'stale' } });
  expect(await old.text()).toContain('旧版');
  await page.route('**/api/export', route => route.fulfill({ status: 400, body: detail }));
  await page.getByRole('button', { name: '导出全部 PNG / ZIP', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('行高');
  await expect(alert).not.toContainText('请确认 Chromium 已安装');
  await expect(alert).not.toContainText('Error:');
});

test('installed Chrome preview can export through bundled Chromium', async ({ baseURL }) => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(baseURL!); await expect(page.locator('[data-ready="true"]')).toBeVisible();
    const snapshot = await page.evaluate(() => window.editor);
    const response = await page.request.post(`${baseURL}/api/export`, { data: { ...snapshot, page: 1 } });
    expect(response.ok(), await response.text()).toBe(true);
    const image = await response.body();
    expect(image.readUInt32BE(16)).toBe(1200); expect(image.readUInt32BE(20)).toBe(1600);
  } finally { await browser.close(); }
});
