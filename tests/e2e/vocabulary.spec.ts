import { test, expect } from '@playwright/test';
import fixture from '../../assets/projects/brainco/project.json' with { type: 'json' };

test('vocabulary table edits and moves the selected row, inserts below it and handles an empty table', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const project = { ...fixture, vocabulary: [
    { id: 'v1', word: 'alpha', ipa: '/a/', pos: 'n.', meaning: '甲' },
    { id: 'v2', word: 'beta', ipa: '/b/', pos: 'adj.', meaning: '乙' },
    { id: 'v3', word: 'gamma', ipa: '/g/', pos: 'v.', meaning: '丙' },
  ] };
  await page.getByLabel('打开项目 JSON').setInputFiles({ name: 'table.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: '词汇', exact: true }).click();
  const table = page.getByRole('table', { name: '词汇表', exact: true });
  await expect(table.getByRole('columnheader')).toHaveText(['词头', '音标', '含义']);
  const actions = page.getByRole('group', { name: '词汇行操作', exact: true });
  await expect(actions.getByRole('button')).toHaveCount(4);
  const up = actions.getByRole('button', { name: '上移选中词汇', exact: true });
  const down = actions.getByRole('button', { name: '下移选中词汇', exact: true });
  const remove = actions.getByRole('button', { name: '删除选中词汇', exact: true });
  const add = actions.getByRole('button', { name: '在选中词汇下方添加空白行', exact: true });
  const words = table.locator('textarea[aria-label^="词头 "]');
  const selected = table.locator('tbody tr[aria-selected="true"]');
  async function expectWords(expected: string[]) {
    await expect.poll(() => words.evaluateAll(nodes => nodes.map(node => (node as HTMLTextAreaElement).value))).toEqual(expected);
  }
  await expect(up).toBeDisabled();
  await page.getByLabel('词头 2', { exact: true }).fill('edited beta');
  await up.click();
  await expectWords(['edited beta', 'alpha', 'gamma']);
  await expect(selected.getByLabel('词头 1', { exact: true })).toHaveValue('edited beta');
  await expect(up).toBeDisabled();
  await down.click();
  await expectWords(['alpha', 'edited beta', 'gamma']);
  await add.click();
  await expectWords(['alpha', 'edited beta', '', 'gamma']);
  await expect(page.getByLabel('词头 3', { exact: true })).toBeFocused();
  await expect(page.getByLabel('音标 3', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('含义 3', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expectWords(['alpha', 'edited beta', 'gamma']);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expectWords(['alpha', 'edited beta', '', 'gamma']);
  await expect(selected.getByLabel('词头 3', { exact: true })).toHaveValue('');
  await remove.click();
  await expectWords(['alpha', 'edited beta', 'gamma']);
  await expect(selected.getByLabel('词头 3', { exact: true })).toHaveValue('gamma');
  await expect(down).toBeDisabled();
  for (let index = 0; index < 3; index++) await remove.click();
  await expect(words).toHaveCount(0);
  await expect(up).toBeDisabled(); await expect(down).toBeDisabled(); await expect(remove).toBeDisabled();
  await expect(add).toBeEnabled();
  await add.click();
  await expectWords(['']);
  await expect(page.getByLabel('词头 1', { exact: true })).toBeFocused();
});

test('table fields preserve part of speech, drafts, page breaks and preview navigation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: '词汇', exact: true }).click();
  await page.getByLabel('音标 2', { exact: true }).fill('/changed/');
  await page.getByLabel('词性 2', { exact: true }).fill('n.');
  await page.getByLabel('含义 2', { exact: true }).fill('保留的含义');
  await page.getByLabel('选中词汇前换页', { exact: true }).check();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const snapshot = await page.evaluate(() => window.editor.project);
  expect(snapshot.vocabulary[1]).toMatchObject({ ipa: '/changed/', pos: 'n.', meaning: '保留的含义' });
  expect(snapshot.layoutOverrides.manualPageBreaks).toContain(JSON.stringify(['vocab', fixture.vocabulary[1].id]));
  await page.reload(); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: '词汇', exact: true }).click();
  await expect(page.getByLabel('音标 2', { exact: true })).toHaveValue('/changed/');
  await expect(page.getByLabel('词性 2', { exact: true })).toHaveValue('n.');
  await expect(page.getByLabel('含义 2', { exact: true })).toHaveValue('保留的含义');
  await page.locator('.card [data-edit]').filter({ hasText: fixture.vocabulary[0].word }).first().click();
  await expect(page.getByLabel('词头 1', { exact: true })).toBeFocused();
  await expect(page.getByRole('table', { name: '词汇表' }).locator('tr[aria-selected="true"]').getByLabel('词头 1', { exact: true })).toHaveValue(fixture.vocabulary[0].word);
  await page.getByLabel('词头 2', { exact: true }).click();
  await expect(page.getByLabel('选中词汇前换页', { exact: true })).toBeChecked();
  await page.screenshot({ path: 'artifacts/test-results/vocabulary-table.png' });
});
