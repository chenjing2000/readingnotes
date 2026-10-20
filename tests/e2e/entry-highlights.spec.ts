import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import fixture from '../../assets/projects/brainco/project.json' with { type: 'json' };

test('entry rules collect manual variants and persist without a top-level highlights list', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const input = {
    ...fixture, schemaVersion: 2, highlights: [],
    source: { paragraphs: [{ id: 'p1', text: 'RUN runs runner. They took off and take off. run. They ran away.' }] },
    vocabulary: [{ id: 'v1', word: 'run', ipa: '/rʌn/', pos: 'v.', meaning: '跑', highlight: ['run', 'runs'] }],
    expressions: [{ id: 'x1', phrase: 'take off', meaning: '起飞', example: 'They took off.', exampleTranslation: '他们起飞了。', highlight: ['take off', 'took off'] }],
  };
  await page.getByLabel('打开项目 JSON').setInputFiles({ name: 'variants.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const marks = page.locator('.article .hot');
  await expect(marks).toHaveText(['RUN', 'runs', 'took off', 'take off', 'run']);
  await page.screenshot({ path: 'artifacts/test-results/entry-highlights.png' });
  const source = page.getByLabel('英文段落 1', { exact: true });
  await source.evaluate(node => { const textarea = node as HTMLTextAreaElement; textarea.focus(); textarea.setSelectionRange(0, 3); });
  await page.getByRole('button', { name: '标注 / 取消所选重点 1', exact: true }).click();
  await expect(marks).toHaveText(['runs', 'took off', 'take off']);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(marks).toHaveCount(5);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(marks).toHaveCount(3);
  await source.evaluate(node => { const textarea = node as HTMLTextAreaElement; const start = textarea.value.indexOf('runner'); textarea.focus(); textarea.setSelectionRange(start, start + 3); });
  await page.getByRole('button', { name: '标注 / 取消所选重点 1', exact: true }).click();
  await expect(page.getByText('请选择完整的单词或词组。', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.editor.project.vocabulary.length)).toBe(1);
  for (const term of ['runner', 'ran away']) {
    await source.evaluate((node, term) => { const textarea = node as HTMLTextAreaElement; const start = textarea.value.indexOf(term); textarea.focus(); textarea.setSelectionRange(start, start + term.length); }, term);
    await page.getByRole('button', { name: '标注 / 取消所选重点 1', exact: true }).click();
  }
  const activeText = 'runsrunnertook offtake offran away';
  await expect.poll(async () => (await marks.allTextContents()).join('')).toBe(activeText);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
  const saved = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(saved.vocabulary[0].highlight).toEqual(['runs']);
  expect(saved.vocabulary.find((entry: { word: string }) => entry.word === 'runner').highlight).toEqual(['runner']);
  expect(saved.expressions.find((entry: { phrase: string }) => entry.phrase === 'ran away').highlight).toEqual(['ran away']);
  expect(saved.expressions[0].highlight).toEqual(['take off', 'took off']);
  expect(saved).not.toHaveProperty('highlights');
  await page.reload(); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect.poll(async () => (await marks.allTextContents()).join('')).toBe(activeText);
  const snapshot = await page.evaluate(() => window.editor);
  const exported = await request.post('/api/export', { data: snapshot });
  expect(exported.ok(), exported.ok() ? '' : await exported.text()).toBe(true);
  const files = unzipSync(await exported.body());
  const exportedProject = JSON.parse(strFromU8(files['project.json']));
  expect(exportedProject.vocabulary[0].highlight).toEqual(['runs']);
  expect(exportedProject).not.toHaveProperty('highlights');
  expect(exportedProject).toEqual(snapshot.project);
  await page.getByRole('button', { name: '词汇', exact: true }).click();
  await page.getByRole('button', { name: '在选中词汇下方添加空白行', exact: true }).click();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const withNewRow = await page.evaluate(() => window.editor);
  expect(withNewRow.project.vocabulary[1].highlight).toEqual([]);
  const newRowExport = await request.post('/api/export', { data: { ...withNewRow, page: 1 } });
  expect(newRowExport.ok(), newRowExport.ok() ? '' : await newRowExport.text()).toBe(true);
});
