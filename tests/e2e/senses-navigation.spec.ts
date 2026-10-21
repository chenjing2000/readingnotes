import { test, expect } from '@playwright/test';
import fixture from '../../assets/projects/brainco/project.json' with { type: 'json' };
import { emptySense, layoutKey, parseProject, senseSourceId } from '../../src/models/project';

test('distinct sense keys preserve navigation, page breaks, removal history and export', async ({ page, request }) => {
  const input = parseProject(fixture);
  input.source.paragraphs = []; input.translation.paragraphs = []; input.mainIdea = '';
  input.vocabulary = [
    { id: 'va', word: 'first', ipa: '', highlight: [], senses: [emptySense()] },
    { id: 'vb', word: 'record', ipa: '', highlight: [], senses: [{ pos: 'v.', meaning: '录制', example: 'A distinct example.', exampleTranslation: '独立例句。' }] },
  ];
  input.expressions = [
    { id: 'x', phrase: 'take off', highlight: [], senses: [{ ...emptySense(), meaning: 'meaning-one' }, { ...emptySense(), meaning: 'meaning-two' }] },
    { id: 'x:sense:1', phrase: 'another phrase', highlight: [], senses: [{ ...emptySense(), meaning: 'meaning-three' }] },
  ];
  input.layoutOverrides.manualPageBreaks = [layoutKey('meaning', senseSourceId('x', 1, 'meaning'))];
  await page.goto('/'); await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByLabel('打开项目 JSON').setInputFiles({ name: 'sense-keys.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const meanings = page.locator('.meaning .line-content');
  await expect(meanings).toHaveText(['meaning-one', 'meaning-two', 'meaning-three']);
  const pages = await page.locator('.meaning').evaluateAll(nodes => nodes.map(node => Number(node.closest('.card')!.getAttribute('data-page'))));
  expect(pages[1]).toBeGreaterThan(pages[0]);
  await page.locator('.vocab [data-edit]').filter({ hasText: 'A distinct example.' }).click();
  await expect(page.getByLabel('词汇例句 1', { exact: true })).toBeFocused();
  await expect(page.getByLabel('词头 2', { exact: true })).toHaveValue('record');
  await meanings.filter({ hasText: 'meaning-two' }).click();
  await expect(page.getByLabel('含义 1 义项 2', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '删除表达 1 义项 1', exact: true }).click();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  let snapshot = await page.evaluate(() => window.editor);
  expect(snapshot.project.expressions[0].senses.map(sense => sense.meaning)).toEqual(['meaning-two']);
  expect(snapshot.project.layoutOverrides.manualPageBreaks).toEqual([layoutKey('meaning', 'x:meaning')]);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('含义 1 义项 2', { exact: true })).toHaveValue('meaning-two');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  snapshot = await page.evaluate(() => window.editor);
  const exported = await request.post('/api/export', { data: { ...snapshot, page: 1 } });
  expect(exported.ok(), exported.ok() ? '' : await exported.text()).toBe(true);
});
